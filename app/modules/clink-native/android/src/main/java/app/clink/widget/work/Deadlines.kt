package app.clink.widget.work

import app.clink.widget.model.Automatic
import app.clink.widget.model.LocalMode
import app.clink.widget.model.OutboxEntry
import app.clink.widget.model.Timers
import app.clink.widget.model.WidgetState
import app.clink.widget.store.Snapshot
import java.time.Instant
import java.time.ZoneId

// When the widget next looks different with no new data (ARCHITECTURE.md 3.3 Android item 3,
// DESIGN.md 5.2): a picker closing at 30 s, a confirmation ending at 4 s, Failed at createdAt + 30 s,
// a flare or reply dropped, a flare or snap expiring, the Automatic label flipping at 08:00 or
// 18:00, and local midnight. Pure, so the timers are tested with a fake clock.

object Deadlines {
  fun nextUiChange(s: Snapshot, now: Instant, zone: ZoneId): Instant? {
    val times = mutableListOf<Instant>()
    for (l in s.locals.values) {
      if (l.mode != LocalMode.IDLE) l.modeOpenedAt?.let { times += it.plusSeconds(Timers.PICKER_TIMEOUT_SEC) }
      l.confirmation?.let { times += it.until }
    }
    for (e in s.outbox.entries) {
      if (e is OutboxEntry.Log) continue
      times += e.createdAt.plusSeconds(Timers.SEND_FAILED_AFTER_SEC)
      e.dropAt?.let { times += it }
    }
    val st = s.state
    if (st is WidgetState.Ready) {
      for (e in st.outbox) {
        if (e is OutboxEntry.Log) continue
        times += e.createdAt.plusSeconds(Timers.SEND_FAILED_AFTER_SEC)
        e.dropAt?.let { times += it }
      }
      st.myFlare?.let { times += it.expiresAt }
      st.incoming.forEach { times += it.expiresAt }
      st.snaps.forEach { times += it.expiresAt }
      if (s.configs.isEmpty() || s.configs.values.any { it.size == app.clink.widget.model.WidgetSize.MEDIUM }) {
        times += Automatic.nextBoundary(now, zone)
      }
    }
    return times.filter { it.isAfter(now) }.minOrNull()
  }

  /** The next local midnight after `now`, in `zone` (DST-safe: the start of the next day). */
  fun nextMidnight(now: Instant, zone: ZoneId): Instant =
    now.atZone(zone).toLocalDate().plusDays(1).atStartOfDay(zone).toInstant()
}
