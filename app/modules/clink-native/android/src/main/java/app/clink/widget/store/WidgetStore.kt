package app.clink.widget.store

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.MutablePreferences
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.emptyPreferences
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import app.clink.widget.model.Confirmation
import app.clink.widget.model.ConfirmationKind
import app.clink.widget.model.LocalMode
import app.clink.widget.model.OutboxLogic
import app.clink.widget.model.OutboxState
import app.clink.widget.model.WidgetConfig
import app.clink.widget.model.WidgetLocal
import app.clink.widget.model.WidgetSize
import app.clink.widget.model.WidgetState
import app.clink.widget.model.WidgetStateDecoder
import java.io.IOException
import java.time.Instant
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import org.json.JSONArray
import org.json.JSONObject

// Everything the widget keeps, in one Preferences DataStore in the app process (ARCHITECTURE.md
// 3.1: the widget runs in the app process, so no cross-process store is needed).
//   widget.state.v1     last good server state JSON (the same key as the iOS App Group)
//   widget.state.at     device time it was stored, for the 10-minute staleness rule and acked logs
//   widget.outbox.v1    the widget's own outbox (OutboxLogic.toJson)
//   widget.locals.v1    per appWidgetId: picker mode, when it opened, the confirmation
//   widget.configs.v1   per appWidgetId: size and Who joins? audience
//   widget.dismissed.v1 friend flares dismissed in the app
//   widget.token.v1     the widget token, encrypted with an Android Keystore key (TokenVault)
//   widget.tick         bumped by timers so every open session redraws with a fresh clock

private val Context.clinkWidgetStore: DataStore<Preferences> by preferencesDataStore(name = "clink_widget")

/** One read of everything a render needs. */
data class Snapshot(
  val state: WidgetState,
  /** When the whole state was last stored (the 10-minute staleness rule). */
  val stateReceivedAt: Instant?,
  /** When today's counts were last confirmed by the server: a state, or a log answer's `today`. */
  val countsReceivedAt: Instant?,
  /** Widget instances whose widget_added the server has recorded (ARCHITECTURE.md 3.5). */
  val reported: Set<Int>,
  val outbox: OutboxState,
  val locals: Map<Int, WidgetLocal>,
  val configs: Map<Int, WidgetConfig>,
  val dismissed: List<String>,
  val hasToken: Boolean,
  val tick: Long,
) {
  fun local(id: Int): WidgetLocal = (locals[id] ?: WidgetLocal.EMPTY).copy(dismissedFlareIds = dismissed)
}

class WidgetStore internal constructor(private val data: DataStore<Preferences>) {
  companion object {
    const val STATE_KEY_NAME = "widget.state.v1"
    private val STATE = stringPreferencesKey(STATE_KEY_NAME)
    private val STATE_AT = longPreferencesKey("widget.state.at")
    private val OUTBOX = stringPreferencesKey("widget.outbox.v1")
    private val LOCALS = stringPreferencesKey("widget.locals.v1")
    private val CONFIGS = stringPreferencesKey("widget.configs.v1")
    private val DISMISSED = stringPreferencesKey("widget.dismissed.v1")
    internal val TOKEN = stringPreferencesKey("widget.token.v1")
    private val TICK = longPreferencesKey("widget.tick")
    private val COUNTS_AT = longPreferencesKey("widget.counts.at")
    private val REPORTED = stringPreferencesKey("widget.reported.v1")

    /** Never signed in on this device yet. */
    val INITIAL_STATE: WidgetState = WidgetState.SignedOut(Instant.EPOCH)

    @Volatile private var instance: WidgetStore? = null

    fun get(context: Context): WidgetStore =
      instance
        ?: synchronized(this) {
          instance ?: WidgetStore(context.applicationContext.clinkWidgetStore).also { instance = it }
        }

    fun snapshotOf(p: Preferences): Snapshot =
      Snapshot(
        state = p[STATE]?.let { WidgetStateDecoder.decodeOrNull(it) } ?: INITIAL_STATE,
        stateReceivedAt = p[STATE_AT]?.let(Instant::ofEpochMilli),
        countsReceivedAt =
          listOfNotNull(p[STATE_AT], p[COUNTS_AT]).maxOrNull()?.let(Instant::ofEpochMilli),
        reported = decodeStrings(p[REPORTED]).mapNotNull { it.toIntOrNull() }.toSet(),
        outbox = OutboxLogic.fromJson(p[OUTBOX]),
        locals = decodeLocals(p[LOCALS]),
        configs = decodeConfigs(p[CONFIGS]),
        dismissed = decodeStrings(p[DISMISSED]),
        hasToken = p[TOKEN] != null,
        tick = p[TICK] ?: 0L,
      )

    internal fun decodeLocals(json: String?): Map<Int, WidgetLocal> {
      if (json.isNullOrEmpty()) return emptyMap()
      return try {
        val o = JSONObject(json)
        o.keys().asSequence().mapNotNull { k ->
          val id = k.toIntOrNull() ?: return@mapNotNull null
          val v = o.optJSONObject(k) ?: return@mapNotNull null
          val conf =
            v.optJSONObject("confirmation")?.let { c ->
              val kind = ConfirmationKind.of(c.optString("kind")) ?: return@let null
              val until = WidgetStateDecoder.parseInstant(c.optString("until")) ?: return@let null
              Confirmation(kind, c.optString("drinkShort").takeIf { !c.isNull("drinkShort") && it.isNotEmpty() }, until)
            }
          id to
            WidgetLocal(
              mode = LocalMode.of(v.optString("mode")) ?: LocalMode.IDLE,
              modeFlareId = v.optString("modeFlareId").takeIf { !v.isNull("modeFlareId") && it.isNotEmpty() },
              modeOpenedAt =
                v.optString("modeOpenedAt").takeIf { it.isNotEmpty() }?.let(WidgetStateDecoder::parseInstant),
              confirmation = conf,
            )
        }.toMap()
      } catch (e: Exception) {
        emptyMap()
      }
    }

    internal fun encodeLocals(locals: Map<Int, WidgetLocal>): String {
      val o = JSONObject()
      for ((id, l) in locals.toSortedMap()) {
        o.put(
          id.toString(),
          JSONObject()
            .put("mode", l.mode.key)
            .put("modeFlareId", l.modeFlareId ?: JSONObject.NULL)
            .put("modeOpenedAt", l.modeOpenedAt?.toString() ?: "")
            .put(
              "confirmation",
              l.confirmation?.let {
                JSONObject()
                  .put("kind", it.kind.key)
                  .put("drinkShort", it.drinkShort ?: JSONObject.NULL)
                  .put("until", it.until.toString())
              } ?: JSONObject.NULL,
            ),
        )
      }
      return o.toString()
    }

    internal fun decodeConfigs(json: String?): Map<Int, WidgetConfig> {
      if (json.isNullOrEmpty()) return emptyMap()
      return try {
        val o = JSONObject(json)
        o.keys().asSequence().mapNotNull { k ->
          val id = k.toIntOrNull() ?: return@mapNotNull null
          val v = o.optJSONObject(k) ?: return@mapNotNull null
          val size = WidgetSize.of(v.optString("size")) ?: return@mapNotNull null
          id to WidgetConfig(size, v.optString("audience").ifEmpty { "auto" })
        }.toMap()
      } catch (e: Exception) {
        emptyMap()
      }
    }

    internal fun encodeConfigs(configs: Map<Int, WidgetConfig>): String {
      val o = JSONObject()
      for ((id, c) in configs.toSortedMap()) {
        o.put(id.toString(), JSONObject().put("size", c.size.key).put("audience", c.audience))
      }
      return o.toString()
    }

    private fun decodeStrings(json: String?): List<String> {
      if (json.isNullOrEmpty()) return emptyList()
      return try {
        val a = JSONArray(json)
        (0 until a.length()).map { a.getString(it) }
      } catch (e: Exception) {
        emptyList()
      }
    }
  }

  val snapshots: Flow<Snapshot> =
    data.data
      .catch { e -> if (e is IOException) emit(emptyPreferences()) else throw e }
      .map(::snapshotOf)

  suspend fun snapshot(): Snapshot = snapshots.first()

  internal suspend fun prefs(): Preferences = data.data.first()

  internal suspend fun edit(block: (MutablePreferences) -> Unit) {
    data.edit { block(it) }
  }

  /** Stores a server state that already decoded. Returns false (and keeps the old one) otherwise. */
  suspend fun putStateJson(json: String, receivedAt: Instant): Boolean {
    WidgetStateDecoder.decodeOrNull(json) ?: return false
    data.edit { p ->
      p[STATE] = json
      p[STATE_AT] = receivedAt.toEpochMilli()
      val pruned = OutboxLogic.pruneAcked(OutboxLogic.fromJson(p[OUTBOX]), receivedAt)
      p[OUTBOX] = OutboxLogic.toJson(pruned)
    }
    return true
  }

  /**
   * A log answer's `today` (widgetLogResponse): replaces today's counts in the stored state when it
   * is for the same or a later local date, and marks the counts as confirmed now.
   */
  suspend fun putToday(todayJson: String, receivedAt: Instant): Boolean {
    var ok = false
    data.edit { p ->
      val raw = p[STATE] ?: return@edit
      val doc = runCatching { JSONObject(raw) }.getOrNull() ?: return@edit
      if (doc.optString("state") != "ready") return@edit
      val today = runCatching { JSONObject(todayJson) }.getOrNull() ?: return@edit
      val old = doc.optJSONObject("today")?.optString("localDate") ?: ""
      if (today.optString("localDate") < old) return@edit
      doc.put("today", today)
      val json = doc.toString()
      WidgetStateDecoder.decodeOrNull(json) ?: return@edit
      p[STATE] = json
      p[COUNTS_AT] = receivedAt.toEpochMilli()
      p[OUTBOX] = OutboxLogic.toJson(OutboxLogic.pruneAcked(OutboxLogic.fromJson(p[OUTBOX]), receivedAt))
      ok = true
    }
    return ok
  }

  suspend fun markReported(appWidgetId: Int) {
    data.edit { p ->
      val all = decodeStrings(p[REPORTED]).toMutableSet()
      all.add(appWidgetId.toString())
      p[REPORTED] = JSONArray(all.sorted()).toString()
    }
  }

  suspend fun updateOutbox(block: (OutboxState) -> OutboxState): OutboxState {
    var out = OutboxState()
    data.edit { p ->
      out = block(OutboxLogic.fromJson(p[OUTBOX]))
      p[OUTBOX] = OutboxLogic.toJson(out)
    }
    return out
  }

  suspend fun updateLocal(appWidgetId: Int, block: (WidgetLocal) -> WidgetLocal) {
    data.edit { p ->
      val all = decodeLocals(p[LOCALS]).toMutableMap()
      all[appWidgetId] = block(all[appWidgetId] ?: WidgetLocal.EMPTY)
      p[LOCALS] = encodeLocals(all)
    }
  }

  /** Clears pickers and confirmations whose time is over, so a late render can't revive them. */
  suspend fun settleLocals(now: Instant) {
    data.edit { p ->
      val all = decodeLocals(p[LOCALS])
      val settled =
        all.mapValues { (_, l) -> WidgetTimers.settle(l, now) }
      if (settled != all) p[LOCALS] = encodeLocals(settled)
    }
  }

  suspend fun putConfig(appWidgetId: Int, config: WidgetConfig) {
    data.edit { p ->
      val all = decodeConfigs(p[CONFIGS]).toMutableMap()
      all[appWidgetId] = config
      p[CONFIGS] = encodeConfigs(all)
    }
  }

  suspend fun forgetWidgets(ids: IntArray) {
    data.edit { p ->
      p[LOCALS] = encodeLocals(decodeLocals(p[LOCALS]) - ids.toSet())
      p[CONFIGS] = encodeConfigs(decodeConfigs(p[CONFIGS]) - ids.toSet())
      val gone = ids.map { it.toString() }.toSet()
      p[REPORTED] = JSONArray(decodeStrings(p[REPORTED]).filter { it !in gone }).toString()
    }
  }

  suspend fun bumpTick(now: Instant) {
    data.edit { it[TICK] = now.toEpochMilli() }
  }

  /**
   * Sign-out (ARCHITECTURE.md 3.6): state, outbox, pickers and the token go; configs stay so a
   * widget keeps its size and audience for the next sign-in. Writes the signed-out state.
   */
  suspend fun clearAll(now: Instant) {
    data.edit { p ->
      p.remove(OUTBOX)
      p.remove(LOCALS)
      p.remove(DISMISSED)
      p.remove(TOKEN)
      p.remove(COUNTS_AT)
      p[STATE] = """{"v":1,"state":"signed_out","updatedAt":"$now"}"""
      p[STATE_AT] = now.toEpochMilli()
    }
  }
}

object WidgetTimers {
  /** A picker open longer than 30 s and a confirmation past its time both end (PRD 3.3 rule 3). */
  fun settle(l: WidgetLocal, now: Instant): WidgetLocal {
    var out = l
    val opened = l.modeOpenedAt
    if (l.mode != LocalMode.IDLE &&
      (opened == null || !now.isBefore(opened.plusSeconds(app.clink.widget.model.Timers.PICKER_TIMEOUT_SEC)))
    ) {
      out = out.copy(mode = LocalMode.IDLE, modeFlareId = null, modeOpenedAt = null)
    }
    val c = l.confirmation
    if (c != null && !now.isBefore(c.until)) out = out.copy(confirmation = null)
    return out
  }
}
