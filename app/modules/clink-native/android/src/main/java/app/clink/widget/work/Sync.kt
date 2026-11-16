package app.clink.widget.work

import android.content.Context
import app.clink.widget.WidgetEnv
import app.clink.widget.model.OutboxEntry
import app.clink.widget.model.OutboxLogic
import app.clink.widget.model.SendResult
import app.clink.widget.model.Timers
import app.clink.widget.net.StateQuery
import app.clink.widget.net.StateResult
import java.time.Duration
import java.time.Instant

// One flush of the widget outbox, then a state refresh when something was sent or the state is
// older than 10 minutes. Runs inside SyncWorker (expedited, network constraint) and
// RefreshWorker. Plain suspend code, so tests call it with a fake API and a fixed clock.
// Error handling follows WIDGET_API_ERRORS (packages/shared/src/api, WidgetApiErrors): 401 reads
// the token again and retries once, then waits for the app; "retry" codes keep the log and try again
// with backoff; "drop" codes (malformed or stale) move the log to the rejected list for the app,
// never deleted. No code is about time: the server clamps loggedAt (migration 0020).

object Sync {
  data class Outcome(
    /** Something is still queued and should be tried again later. */
    val retry: Boolean,
    val sent: Int,
    val refreshed: Boolean,
    val unauthorized: Boolean = false,
  )

  suspend fun flush(context: Context, forceRefresh: Boolean = false): Outcome {
    val store = WidgetEnv.store(context)
    val vault = WidgetEnv.vault(context)
    val now = { Instant.now(WidgetEnv.clock) }
    val tz = WidgetEnv.clock.zone.id
    store.updateOutbox { OutboxLogic.expire(it, now()) }
    val api = WidgetEnv.api(context)
    var token = vault.get()
    if (api == null || token == null) {
      // Nothing can be sent yet (signed out, the mock backend, or no token registered). Logs
      // wait; the app hands over a token on its next launch, which flushes again.
      return Outcome(retry = false, sent = 0, refreshed = false)
    }
    var sent = 0
    var retry = false
    var unauthorized = false
    var reauthed = false
    val queue = ArrayDeque(OutboxLogic.due(store.snapshot().outbox, now()))
    while (queue.isNotEmpty()) {
      val entry = queue.first().entry
      // Flares and replies arrive with M4; until then nothing queues them on Android.
      if (entry !is OutboxEntry.Log) {
        queue.removeFirst()
        continue
      }
      val sentAt = now()
      val answer = api.postLog(token!!, entry, tz)
      if (answer.result == SendResult.Unauthorized && !reauthed) {
        // The app may have rotated the token since this job started: read it again, once.
        reauthed = true
        val fresh = vault.get()
        if (fresh != null && fresh != token) {
          token = fresh
          continue
        }
      }
      queue.removeFirst()
      store.updateOutbox { OutboxLogic.onResult(it, entry.id, answer.result, now()) }
      when (answer.result) {
        SendResult.Accepted -> {
          sent++
          // The answer's counts include every log acked before this request started.
          answer.todayJson?.let { store.putToday(it, now(), asOf = sentAt) }
        }
        SendResult.RetryLater -> retry = true
        SendResult.Unauthorized -> unauthorized = true
        is SendResult.Rejected -> Unit
      }
      if (retry || unauthorized) break
    }

    var refreshed = false
    if (!unauthorized) {
      val snap = store.snapshot()
      val stale =
        snap.stateReceivedAt == null ||
          Duration.between(snap.stateReceivedAt, now()) >= Duration.ofMinutes(Timers.WIDGET_STALE_AFTER_MIN)
      // One widget instance per call is reported for widget_added (ARCHITECTURE.md 3.5).
      val unreported = snap.configs.entries.firstOrNull { it.key !in snap.reported }
      if (sent > 0 || forceRefresh || stale || unreported != null) {
        val q = StateQuery(unreported?.key?.toString(), unreported?.value?.size?.key, tz)
        val askedAt = now()
        when (val r = api.getState(token!!, q)) {
          is StateResult.Ok -> {
            refreshed = store.putStateJson(r.json, now(), asOf = askedAt)
            if (refreshed && unreported != null) store.markReported(unreported.key)
          }
          StateResult.Unauthorized -> unauthorized = true
          StateResult.Failed -> Unit
        }
      }
    }
    return Outcome(retry = retry, sent = sent, refreshed = refreshed, unauthorized = unauthorized)
  }
}
