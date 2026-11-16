package app.clink.widget.model

import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import org.json.JSONArray
import org.json.JSONObject

// The widget's own outbox (ARCHITECTURE.md 3.2, PRD 3.20): a pure state machine, so the rules can
// be tested with a fake clock.
//   log      retries forever (the device-made UUID makes it idempotent), never dropped
//   flare    retries until accepted, dropped at tappedAt + 2 min
//   respond  retries until accepted, dropped at the flare's expiresAt
// Failed shows at createdAt + 30 s (Resolve.overlayFor; logs never show Failed). A tap retries the
// same op in place. The flush runs on the next action, on app open and when the network returns.

data class OutboxItem(
  val entry: OutboxEntry,
  val attempts: Int = 0,
  val lastAttemptAt: Instant? = null,
)

/** A log the server accepted, kept until a state fetched after the ack includes it. */
data class AckedLog(val id: String, val payload: LogPayload, val ackedAt: Instant)

data class DroppedOp(val id: String, val op: String, val droppedAt: Instant)

sealed class SendResult {
  /** 200 "logged" or "duplicate": remove it from the outbox. */
  data object Accepted : SendResult()

  /** Offline, timeout, 403 suspended, 408, 429 or 5xx: try again later. */
  data object RetryLater : SendResult()

  /** 401: the token is missing, rotated or revoked. Keep the op and wait for the app. */
  data object Unauthorized : SendResult()

  /** Any other 4xx (400, 404, 405, 409, 413, 422): the server will never take it (WIDGET_API_ERRORS "drop"). */
  data class Rejected(val status: Int) : SendResult()
}

data class OutboxState(
  val items: List<OutboxItem> = emptyList(),
  val acked: List<AckedLog> = emptyList(),
  val dropped: List<DroppedOp> = emptyList(),
) {
  val entries: List<OutboxEntry>
    get() = items.map { it.entry }
}

object OutboxLogic {
  /** At most this many queued ops (widget-state schema: outbox max 100). The oldest flare or reply goes first. */
  const val MAX_ITEMS = 100

  fun enqueue(s: OutboxState, entry: OutboxEntry): OutboxState {
    if (s.items.any { it.entry.id == entry.id }) return s
    var items = s.items + OutboxItem(entry)
    while (items.size > MAX_ITEMS) {
      // Logs are never dropped; trim the oldest non-log op, else refuse the newest non-log.
      val victim = items.firstOrNull { it.entry !is OutboxEntry.Log } ?: break
      items = items - victim
    }
    return s.copy(items = items)
  }

  /** Moves flares and replies past their drop time to `dropped`, so the app can say so. */
  fun expire(s: OutboxState, now: Instant): OutboxState {
    val (gone, kept) = s.items.partition { i -> i.entry.dropAt?.let { !now.isBefore(it) } ?: false }
    if (gone.isEmpty()) return s
    return s.copy(
      items = kept,
      dropped = s.dropped + gone.map { DroppedOp(it.entry.id, it.entry.op, now) },
    )
  }

  /** What a flush sends now: everything still queued after expiry, oldest first. */
  fun due(s: OutboxState, now: Instant): List<OutboxItem> =
    expire(s, now).items.sortedBy { it.entry.createdAt }

  fun onResult(s: OutboxState, id: String, result: SendResult, now: Instant): OutboxState {
    val item = s.items.firstOrNull { it.entry.id == id } ?: return s
    return when (result) {
      SendResult.Accepted -> {
        val entry = item.entry
        s.copy(
          items = s.items - item,
          acked =
            if (entry is OutboxEntry.Log) s.acked + AckedLog(entry.id, entry.payload, now) else s.acked,
        )
      }
      SendResult.RetryLater,
      SendResult.Unauthorized ->
        s.copy(items = s.items.map { if (it === item) it.copy(attempts = it.attempts + 1, lastAttemptAt = now) else it })
      is SendResult.Rejected -> s.copy(items = s.items - item)
    }
  }

  /** A tap on Failed: the same op, sent again now (its createdAt and drop time don't change). */
  fun retryNow(s: OutboxState, id: String): OutboxState =
    s.copy(items = s.items.map { if (it.entry.id == id) it.copy(lastAttemptAt = null) else it })

  /** Acked logs are dropped once a state that was received after the ack is stored. */
  fun pruneAcked(s: OutboxState, stateReceivedAt: Instant?): OutboxState {
    if (stateReceivedAt == null) return s
    return s.copy(acked = s.acked.filter { it.ackedAt.isAfter(stateReceivedAt) })
  }

  fun drainDropped(s: OutboxState): Pair<OutboxState, List<DroppedOp>> = s.copy(dropped = emptyList()) to s.dropped

  // -------------------------------------------------------------------------------------------
  // Persistence

  fun toJson(s: OutboxState): String =
    JSONObject()
      .put(
        "items",
        JSONArray(
          s.items.map {
            JSONObject()
              .put("entry", entryJson(it.entry))
              .put("attempts", it.attempts)
              .put("lastAttemptAt", it.lastAttemptAt?.toString() ?: JSONObject.NULL)
          }
        ),
      )
      .put(
        "acked",
        JSONArray(
          s.acked.map {
            JSONObject().put("id", it.id).put("payload", payloadJson(it.payload)).put("ackedAt", it.ackedAt.toString())
          }
        ),
      )
      .put(
        "dropped",
        JSONArray(
          s.dropped.map {
            JSONObject().put("id", it.id).put("op", it.op).put("droppedAt", it.droppedAt.toString())
          }
        ),
      )
      .toString()

  /** Reads what toJson wrote; anything unreadable is skipped, never fatal. */
  fun fromJson(json: String?): OutboxState {
    if (json.isNullOrEmpty()) return OutboxState()
    return try {
      val o = JSONObject(json)
      val items = mutableListOf<OutboxItem>()
      o.optJSONArray("items")?.let { a ->
        for (i in 0 until a.length()) {
          val it = a.optJSONObject(i) ?: continue
          val entry = runCatching { WidgetStateDecoder.outboxEntry(it.getJSONObject("entry")) }.getOrNull() ?: continue
          val last = it.optString("lastAttemptAt").takeIf { s -> s.isNotEmpty() && s != "null" }
          items.add(OutboxItem(entry, it.optInt("attempts"), last?.let(WidgetStateDecoder::parseInstant)))
        }
      }
      val acked = mutableListOf<AckedLog>()
      o.optJSONArray("acked")?.let { a ->
        for (i in 0 until a.length()) {
          val it = a.optJSONObject(i) ?: continue
          val payload = runCatching { payloadFrom(it.getJSONObject("payload")) }.getOrNull() ?: continue
          val at = WidgetStateDecoder.parseInstant(it.optString("ackedAt")) ?: continue
          acked.add(AckedLog(it.optString("id"), payload, at))
        }
      }
      val dropped = mutableListOf<DroppedOp>()
      o.optJSONArray("dropped")?.let { a ->
        for (i in 0 until a.length()) {
          val it = a.optJSONObject(i) ?: continue
          val at = WidgetStateDecoder.parseInstant(it.optString("droppedAt")) ?: continue
          dropped.add(DroppedOp(it.optString("id"), it.optString("op"), at))
        }
      }
      OutboxState(items, acked, dropped)
    } catch (e: Exception) {
      OutboxState()
    }
  }

  /** The outbox entry exactly as the widget-state schema writes it (outboxEntrySchema). */
  fun entryJson(e: OutboxEntry): JSONObject {
    val o = JSONObject().put("id", e.id).put("op", e.op).put("createdAt", e.createdAt.toString())
    when (e) {
      is OutboxEntry.Log -> o.put("dropAt", JSONObject.NULL).put("payload", payloadJson(e.payload))
      is OutboxEntry.Flare ->
        o.put("dropAt", e.dropAt.toString())
          .put(
            "payload",
            JSONObject()
              .put("audience", e.audience)
              .put("timingMin", e.timingMin)
              .put("tappedAt", e.tappedAt.toString())
              .put("timeZone", e.timeZone),
          )
      is OutboxEntry.Respond ->
        o.put("dropAt", e.dropAt.toString())
          .put(
            "payload",
            JSONObject().put("flareId", e.flareId).put("kind", e.kind).put("slot", e.slot ?: JSONObject.NULL),
          )
    }
    return o
  }

  private fun payloadJson(p: LogPayload): JSONObject =
    JSONObject()
      .put("drinkId", p.drinkId ?: JSONObject.NULL)
      .put("slot", p.slot ?: JSONObject.NULL)
      .put("category", p.category.key)
      .put("loggedAt", p.loggedAt.toString())

  private fun payloadFrom(o: JSONObject): LogPayload {
    val cat = LogCategory.of(o.getString("category")) ?: error("category")
    val at = WidgetStateDecoder.parseInstant(o.getString("loggedAt")) ?: error("loggedAt")
    return LogPayload(
      if (o.isNull("drinkId")) null else o.getString("drinkId"),
      if (o.isNull("slot")) null else o.getInt("slot"),
      cat,
      at,
    )
  }
}

/**
 * The state the widget draws: the stored server state plus what the device knows that the server
 * hasn't confirmed yet. Logs count at once (PRD AC 3.3.2), and today's counts reset at local
 * midnight with no network (PRD 3.11 rule 2) because only logs from today's local date count.
 */
object Optimistic {
  fun apply(
    state: WidgetState,
    outbox: OutboxState,
    stateReceivedAt: Instant?,
    now: Instant,
    zone: ZoneId,
  ): WidgetState {
    if (state !is WidgetState.Ready) return state
    val today: LocalDate = Resolve.localDateAt(now, zone)
    val base =
      if (state.today.localDate == today) state.today else Today(today, 0, 0, 0, null)
    val unconfirmed =
      outbox.items.mapNotNull { (it.entry as? OutboxEntry.Log)?.payload } +
        outbox.acked.filter { stateReceivedAt == null || it.ackedAt.isAfter(stateReceivedAt) }.map { it.payload }
    val todays = unconfirmed.filter { Resolve.localDateAt(it.loggedAt, zone) == today }
    val water = todays.count { it.category == LogCategory.WATER }
    val drinks = todays.filter { it.category != LogCategory.WATER }
    // Caffeine is not guessed here: a decaf usual would count wrong. The next state brings it.
    val last = (listOfNotNull(base.lastDrinkAt) + drinks.map { it.loggedAt }).maxOrNull()
    val merged =
      state.outbox + outbox.entries.filter { e -> state.outbox.none { it.id == e.id } }
    return state.copy(
      today = base.copy(drinks = base.drinks + drinks.size, water = base.water + water, lastDrinkAt = last),
      outbox = merged,
    )
  }
}
