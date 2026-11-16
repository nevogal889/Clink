package app.clink.widget

import app.clink.widget.model.AckedLog
import app.clink.widget.model.Confirmation
import app.clink.widget.model.ConfirmationKind
import app.clink.widget.model.LocalMode
import app.clink.widget.model.LogCategory
import app.clink.widget.model.LogPayload
import app.clink.widget.model.Optimistic
import app.clink.widget.model.OutboxEntry
import app.clink.widget.model.OutboxLogic
import app.clink.widget.model.OutboxState
import app.clink.widget.model.Overlay
import app.clink.widget.model.Resolve
import app.clink.widget.model.SendResult
import app.clink.widget.model.WidgetConfig
import app.clink.widget.model.WidgetLocal
import app.clink.widget.model.WidgetSize
import app.clink.widget.model.WidgetState
import app.clink.widget.model.WidgetStateDecoder
import app.clink.widget.model.WidgetView
import app.clink.widget.store.Snapshot
import app.clink.widget.store.WidgetTimers
import app.clink.widget.work.Deadlines
import java.time.Instant
import java.time.ZoneId
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

// Outbox rules (ARCHITECTURE.md 3.2, PRD 3.20), midnight reset (PRD 3.11 rule 2) and the 30 s and
// 4 s timers (PRD 3.3 rule 3, DESIGN.md 5.2), all on a fake clock.

@RunWith(RobolectricTestRunner::class)
class OutboxAndTimersTest {
  private val london = ZoneId.of("Europe/London")
  private val t0 = Instant.parse("2026-11-17T09:12:00Z")

  private fun log(id: String, at: Instant, cat: LogCategory = LogCategory.COFFEE) =
    OutboxEntry.Log(id, at, LogPayload(if (cat == LogCategory.WATER) "water.still" else "coffee.flat_white", if (cat == LogCategory.WATER) null else 1, cat, at))

  private fun flare(id: String, at: Instant) =
    OutboxEntry.Flare(id, at, at.plusSeconds(120), "auto", 0, at, "Europe/London")

  private fun uuid(n: Int) = "00000000-0000-4000-8000-%012d".format(n)

  private fun ready(): WidgetState.Ready =
    WidgetStateDecoder.decode(Fixtures.widgetStates().first { it.id == "W4" }.stateJson) as WidgetState.Ready

  @Test
  fun logsRetryForeverAndAreNeverDropped() {
    var s = OutboxLogic.enqueue(OutboxState(), log(uuid(1), t0))
    var now = t0
    repeat(500) {
      now = now.plusSeconds(3600)
      s = OutboxLogic.expire(s, now)
      s = OutboxLogic.onResult(s, uuid(1), SendResult.RetryLater, now)
    }
    assertEquals(1, s.items.size)
    assertEquals(500, s.items[0].attempts)
    assertTrue(s.dropped.isEmpty())
    s = OutboxLogic.onResult(s, uuid(1), SendResult.Accepted, now)
    assertTrue(s.items.isEmpty())
    assertEquals(listOf(uuid(1)), s.acked.map { it.id })
  }

  @Test
  fun enqueueIsIdempotentOnTheDeviceId() {
    val e = log(uuid(2), t0)
    val s = OutboxLogic.enqueue(OutboxLogic.enqueue(OutboxState(), e), e)
    assertEquals(1, s.items.size)
  }

  @Test
  fun flareDropsAtTwoMinutesAndIsReported() {
    var s = OutboxLogic.enqueue(OutboxState(), flare(uuid(3), t0))
    s = OutboxLogic.expire(s, t0.plusSeconds(119))
    assertEquals(1, s.items.size)
    s = OutboxLogic.expire(s, t0.plusSeconds(120))
    assertTrue(s.items.isEmpty())
    assertEquals("flare", s.dropped.single().op)
    val (rest, drops) = OutboxLogic.drainDropped(s)
    assertEquals(1, drops.size)
    assertTrue(rest.dropped.isEmpty())
  }

  @Test
  fun rejectedLogsMoveToTheRejectedListAndUnauthorizedStay() {
    var s = OutboxLogic.enqueue(OutboxLogic.enqueue(OutboxState(), log(uuid(4), t0)), log(uuid(5), t0))
    s = OutboxLogic.onResult(s, uuid(4), SendResult.Rejected(400, "bad_input", "malformed"), t0)
    s = OutboxLogic.onResult(s, uuid(5), SendResult.Unauthorized, t0)
    assertEquals(listOf(uuid(5)), s.items.map { it.entry.id })
    assertTrue(s.acked.isEmpty())
    // Never deleted: the whole log waits for the app, with the reason.
    val r = s.rejected.single()
    assertEquals(log(uuid(4), t0), r.entry)
    assertEquals(400, r.status)
    assertEquals("bad_input", r.code)
    assertEquals("malformed", r.kind)
    assertTrue("a rejected log is not a dropped flare", s.dropped.isEmpty())
    // It survives a restart, and the app takes it once.
    val back = OutboxLogic.fromJson(OutboxLogic.toJson(s))
    assertEquals(s.rejected, back.rejected)
    val (rest, taken) = OutboxLogic.takeRejected(back)
    assertEquals(listOf(r), taken)
    assertTrue(rest.rejected.isEmpty())
    assertEquals(listOf(uuid(5)), rest.items.map { it.entry.id })
  }

  @Test
  fun aRejectedFlareIsReportedAsDropped() {
    var s = OutboxLogic.enqueue(OutboxState(), flare(uuid(14), t0))
    s = OutboxLogic.onResult(s, uuid(14), SendResult.Rejected(409, "conflict"), t0)
    assertTrue(s.items.isEmpty())
    assertEquals("flare", s.dropped.single().op)
    assertTrue(s.rejected.isEmpty())
  }

  @Test
  fun failedShowsAtThirtySecondsForFlaresButNeverForLogs() {
    val base = ready()
    val config = WidgetConfig(WidgetSize.MEDIUM)
    fun overlayAt(outbox: List<OutboxEntry>, at: Instant) =
      Resolve.view(base.copy(outbox = outbox), null, config, at, london).overlay
    val f = flare(uuid(6), t0)
    assertEquals(Overlay.Sending(uuid(6)), overlayAt(listOf(f), t0.plusSeconds(29)))
    assertEquals(Overlay.Failed(uuid(6)), overlayAt(listOf(f), t0.plusSeconds(30)))
    assertNull("dropped at 2 min", overlayAt(listOf(f), t0.plusSeconds(120)))
    assertNull("logs never fail visibly", overlayAt(listOf(log(uuid(7), t0)), t0.plusSeconds(3600)))
    // A tap retries in place: same op, same createdAt, so Failed stays until accepted or dropped.
    val retried = OutboxLogic.retryNow(OutboxLogic.enqueue(OutboxState(), f), uuid(6))
    assertEquals(t0, retried.items.single().entry.createdAt)
    assertNull(retried.items.single().lastAttemptAt)
  }

  @Test
  fun outboxSurvivesAJsonRoundTrip() {
    var s = OutboxLogic.enqueue(OutboxState(), log(uuid(8), t0))
    s = OutboxLogic.enqueue(s, flare(uuid(9), t0))
    s = OutboxLogic.onResult(s, uuid(8), SendResult.RetryLater, t0.plusSeconds(5))
    s = s.copy(acked = listOf(AckedLog(uuid(10), log(uuid(10), t0).payload, t0)))
    val back = OutboxLogic.fromJson(OutboxLogic.toJson(s))
    assertEquals(s, back)
    // The pending entries match the shared outbox schema exactly.
    for (e in back.entries) assertEquals(e, WidgetStateDecoder.outboxEntry(OutboxLogic.entryJson(e)))
  }

  @Test
  fun pendingLogsCountAtOnce() {
    val s = ready() // 3 drinks, 4 water on 2026-11-17
    val out = OutboxLogic.enqueue(OutboxLogic.enqueue(OutboxState(), log(uuid(11), t0)), log(uuid(12), t0, LogCategory.WATER))
    val shown = Optimistic.apply(s, out, t0.minusSeconds(60), t0, london) as WidgetState.Ready
    assertEquals(4, shown.today.drinks)
    assertEquals(5, shown.today.water)
    assertEquals(t0, shown.today.lastDrinkAt)
  }

  @Test
  fun ackedLogsCountUntilANewerStateArrives() {
    val s = ready()
    val acked = OutboxState(acked = listOf(AckedLog(uuid(13), log(uuid(13), t0).payload, t0.plusSeconds(1))))
    assertEquals(4, (Optimistic.apply(s, acked, t0, t0.plusSeconds(2), london) as WidgetState.Ready).today.drinks)
    // A state stored after the ack already has it.
    assertEquals(3, (Optimistic.apply(s, acked, t0.plusSeconds(5), t0.plusSeconds(6), london) as WidgetState.Ready).today.drinks)
    assertTrue(OutboxLogic.pruneAcked(acked, t0.plusSeconds(5)).acked.isEmpty())
  }

  @Test
  fun aStateWhoseRequestStartedBeforeTheAckKeepsTheAckedLog() {
    // The state request leaves at t0, the log is acked at t0 + 1 s, the state lands at t0 + 2 s
    // without it. Pruning goes by when the request started, so the log still counts.
    val s = ready()
    val acked = OutboxState(acked = listOf(AckedLog(uuid(15), log(uuid(15), t0).payload, t0.plusSeconds(1))))
    assertEquals(1, OutboxLogic.pruneAcked(acked, t0).acked.size)
    assertEquals(4, (Optimistic.apply(s, acked, t0, t0.plusSeconds(2), london) as WidgetState.Ready).today.drinks)
  }

  @Test
  fun midnightResetsCountsWithNoNetwork() {
    val s = ready() // today 2026-11-17 in London
    val before = Instant.parse("2026-11-17T23:59:30Z")
    val pending = OutboxLogic.enqueue(OutboxState(), log(uuid(14), Instant.parse("2026-11-17T23:59:00Z")))
    val atNight = Resolve.view(Optimistic.apply(s, pending, null, before, london), null, WidgetConfig(WidgetSize.SMALL), before, london) as WidgetView.Idle
    assertEquals(4, atNight.drinks)
    // 00:00:01 local: the stored state is yesterday's and the pending log is yesterday's.
    val after = Instant.parse("2026-11-18T00:00:01Z")
    val next = Resolve.view(Optimistic.apply(s, pending, null, after, london), null, WidgetConfig(WidgetSize.SMALL), after, london) as WidgetView.Idle
    assertEquals(0, next.drinks)
    assertEquals(0, next.water)
    // A job that fires hours late still draws today's zeros: nothing depends on when it ran.
    val late = Instant.parse("2026-11-18T07:45:00Z")
    assertEquals(0, (Resolve.view(Optimistic.apply(s, pending, null, late, london), null, WidgetConfig(WidgetSize.SMALL), late, london) as WidgetView.Idle).drinks)
    // A log made after midnight counts for the new day.
    val newDay = OutboxLogic.enqueue(pending, log(uuid(15), after))
    assertEquals(1, (Optimistic.apply(s, newDay, null, after, london) as WidgetState.Ready).today.drinks)
  }

  @Test
  fun nextMidnightIsTheStartOfTheNextLocalDayAcrossDst() {
    assertEquals(Instant.parse("2026-11-18T00:00:00Z"), Deadlines.nextMidnight(t0, london))
    // New York on the day clocks go back (2026-11-01): local midnight of the 2nd is 05:00 UTC.
    val ny = ZoneId.of("America/New_York")
    assertEquals(Instant.parse("2026-11-02T05:00:00Z"), Deadlines.nextMidnight(Instant.parse("2026-11-01T12:00:00Z"), ny))
    // Tokyo has no DST and is ahead of UTC.
    assertEquals(Instant.parse("2026-11-17T15:00:00Z"), Deadlines.nextMidnight(t0, ZoneId.of("Asia/Tokyo")))
  }

  @Test
  fun pickerClosesAtThirtySeconds() {
    val s = ready()
    val opened = WidgetLocal(mode = LocalMode.PICKER, modeOpenedAt = t0)
    val cfg = WidgetConfig(WidgetSize.MEDIUM)
    assertTrue(Resolve.view(s, opened, cfg, t0.plusSeconds(29), london) is WidgetView.Picker)
    assertTrue(Resolve.view(s, opened, cfg, t0.plusSeconds(30), london) is WidgetView.Idle)
    assertEquals(LocalMode.PICKER, WidgetTimers.settle(opened, t0.plusSeconds(29)).mode)
    assertEquals(LocalMode.IDLE, WidgetTimers.settle(opened, t0.plusSeconds(30)).mode)
  }

  @Test
  fun confirmationLastsFourSeconds() {
    val s = ready()
    val c = WidgetLocal(confirmation = Confirmation(ConfirmationKind.LOGGED, "Flat White", t0.plusSeconds(4)))
    val cfg = WidgetConfig(WidgetSize.SMALL)
    assertEquals(Overlay.Confirm(ConfirmationKind.LOGGED), Resolve.view(s, c, cfg, t0.plusSeconds(3), london).overlay)
    assertNull(Resolve.view(s, c, cfg, t0.plusSeconds(4), london).overlay)
    assertNull(WidgetTimers.settle(c, t0.plusSeconds(4)).confirmation)
  }

  @Test
  fun deadlinesPlanTheNextRedraw() {
    val s = ready()
    fun snap(locals: Map<Int, WidgetLocal>, out: OutboxState = OutboxState()) =
      Snapshot(s, t0, t0, emptySet(), out, locals, mapOf(1 to WidgetConfig(WidgetSize.SMALL)), emptyList(), true, 0)
    val picker = snap(mapOf(1 to WidgetLocal(mode = LocalMode.PICKER, modeOpenedAt = t0)))
    assertEquals(t0.plusSeconds(30), Deadlines.nextUiChange(picker, t0.plusSeconds(1), london))
    val confirm = snap(mapOf(1 to WidgetLocal(confirmation = Confirmation(ConfirmationKind.LOGGED, null, t0.plusSeconds(4)))))
    assertEquals(t0.plusSeconds(4), Deadlines.nextUiChange(confirm, t0, london))
    val failed = snap(emptyMap(), OutboxLogic.enqueue(OutboxState(), flare(uuid(16), t0)))
    assertEquals(t0.plusSeconds(30), Deadlines.nextUiChange(failed, t0.plusSeconds(10), london))
    assertEquals(t0.plusSeconds(120), Deadlines.nextUiChange(failed, t0.plusSeconds(31), london))
    // A queued log needs no timer: it never shows Failed.
    assertNull(Deadlines.nextUiChange(snap(emptyMap(), OutboxLogic.enqueue(OutboxState(), log(uuid(17), t0))), t0, london))
  }

  @Test
  fun theDefaultClockFollowsATimeZoneChange() {
    // A travelling phone: today's date and the midnight job must use the zone it is in now.
    val before = java.util.TimeZone.getDefault()
    try {
      java.util.TimeZone.setDefault(java.util.TimeZone.getTimeZone("Europe/London"))
      assertEquals(london, DeviceZoneClock.zone)
      java.util.TimeZone.setDefault(java.util.TimeZone.getTimeZone("America/New_York"))
      assertEquals(ZoneId.of("America/New_York"), DeviceZoneClock.zone)
    } finally {
      java.util.TimeZone.setDefault(before)
    }
  }
}
