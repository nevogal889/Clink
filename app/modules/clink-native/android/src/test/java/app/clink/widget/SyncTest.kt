package app.clink.widget

import androidx.test.core.app.ApplicationProvider
import app.clink.widget.model.SendResult
import app.clink.widget.model.WidgetState
import app.clink.widget.net.ErrorAction
import app.clink.widget.net.HttpWidgetApi
import app.clink.widget.net.WidgetApiErrors
import app.clink.widget.net.LogResult
import app.clink.widget.net.StateQuery
import app.clink.widget.net.StateResult
import app.clink.widget.ui.LogDrink
import app.clink.widget.work.Sync
import android.content.Context
import java.time.Duration
import java.time.Instant
import kotlinx.coroutines.test.runTest
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

// Logging from the widget with the offline outbox (PRD AC 3.3.2, 3.20.1; ARCHITECTURE.md 3.2) and
// the widget-api error rules (WIDGET_API_ERRORS), against a scripted API and a fixed clock.

@RunWith(RobolectricTestRunner::class)
class SyncTest {
  private lateinit var env: TestEnv
  private val context: Context = ApplicationProvider.getApplicationContext()
  private val token = "A".repeat(43)

  @Before
  fun setUp() {
    env = TestEnv()
  }

  @After
  fun tearDown() = env.close()

  private suspend fun seed(withToken: Boolean = true) {
    val w4 = Fixtures.widgetStates().first { it.id == "W4" }
    assertTrue(env.store.putStateJson(w4.stateJson, env.clock.instant().minusSeconds(60)))
    if (withToken) WidgetEnv.vault(context).put(token)
  }

  private suspend fun today() = (env.store.snapshot().state as WidgetState.Ready).today

  @Test
  fun logQueuesAtOnceAndSyncsWhenOnline() = runTest {
    seed()
    val e = LogDrink.log(context, 7, 1)!!
    assertEquals("coffee.flat_white", e.payload.drinkId)
    assertEquals(1, e.payload.slot)
    assertEquals(1, env.store.snapshot().outbox.items.size)
    env.api.defaultLog =
      LogResult(SendResult.Accepted, """{"localDate":"2026-11-17","drinks":4,"water":4,"caffeinated":3,"lastDrinkAt":"2026-11-17T09:12:00Z"}""")
    val out = Sync.flush(context)
    assertEquals(1, out.sent)
    assertFalse(out.retry)
    assertTrue(env.store.snapshot().outbox.items.isEmpty())
    // The log answer's today replaced the stored counts.
    assertEquals(4, today().drinks)
    assertEquals(3, today().caffeinated)
    assertEquals(token, env.api.logs.single().first)
  }

  @Test
  fun airplaneModeThenOnlineSyncsAllThreeWithTheirOriginalTimes() = runTest {
    seed()
    val times = mutableListOf<Instant>()
    repeat(3) {
      times += LogDrink.log(context, 7, 2)!!.payload.loggedAt
      env.clock.advance(Duration.ofMinutes(5))
    }
    env.api.defaultLog = LogResult(SendResult.RetryLater)
    val offline = Sync.flush(context)
    assertTrue(offline.retry)
    assertEquals(3, env.store.snapshot().outbox.items.size)
    env.clock.advance(Duration.ofHours(3))
    env.api.logs.clear()
    env.api.defaultLog = LogResult(SendResult.Accepted)
    Sync.flush(context)
    assertTrue(env.store.snapshot().outbox.items.isEmpty())
    assertEquals(times, env.api.logs.map { it.second.payload.loggedAt })
    assertEquals(3, env.api.logs.map { it.second.id }.toSet().size)
  }

  @Test
  fun waterLogsStillWaterWithNoSlot() = runTest {
    seed()
    val e = LogDrink.log(context, 7, 0)!!
    assertEquals("water.still", e.payload.drinkId)
    assertNull(e.payload.slot)
    val body = HttpWidgetApi.logBody(e, "Europe/London")
    assertEquals(setOf("id", "drinkId", "slot", "category", "loggedAt", "timeZone"), body.keys().asSequence().toSet())
    assertTrue(body.isNull("slot"))
    assertEquals("water", body.getString("category"))
    assertFalse("whole seconds", body.getString("loggedAt").contains('.'))
  }

  @Test
  fun unauthorizedReadsTheTokenAgainOnceThenWaits() = runTest {
    seed()
    LogDrink.log(context, 7, 1)
    env.api.logAnswers = ArrayDeque(listOf(LogResult(SendResult.Unauthorized), LogResult(SendResult.Unauthorized)))
    val out = Sync.flush(context)
    assertTrue(out.unauthorized)
    assertEquals(1, env.store.snapshot().outbox.items.size)
    assertEquals(1, env.api.logs.size) // same token: no second try
    // The app rotates the token; the next flush sends with the new one.
    WidgetEnv.vault(context).put("B".repeat(43))
    env.api.logAnswers = ArrayDeque()
    Sync.flush(context)
    assertTrue(env.store.snapshot().outbox.items.isEmpty())
    assertEquals("B".repeat(43), env.api.logs.last().first)
  }

  @Test
  fun aMalformedLogMovesToTheRejectedListForTheApp() = runTest {
    seed()
    val e = LogDrink.log(context, 7, 1)!!
    LogDrink.log(context, 7, 2)
    env.api.logAnswers = ArrayDeque(listOf(LogResult(HttpWidgetApi.classify(400, "bad_input"))))
    val out = Sync.flush(context)
    // The second log still went: a rejection doesn't stop the flush.
    assertEquals(1, out.sent)
    val snap = env.store.snapshot().outbox
    assertTrue(snap.items.isEmpty())
    assertEquals(e, snap.rejected.single().entry)
    assertEquals("bad_input", snap.rejected.single().code)
    assertEquals("malformed", snap.rejected.single().kind)
    // The app reads it, then takes it to report.
    val bridge = WidgetBridge(context)
    @Suppress("UNCHECKED_CAST")
    val listed = bridge.getOutbox()["rejected"] as List<Map<String, Any?>>
    assertEquals(400, listed.single()["status"])
    val taken = bridge.takeRejected()
    assertEquals(e.id, (taken.single()["entry"] as Map<*, *>)["id"])
    assertTrue(env.store.snapshot().outbox.rejected.isEmpty())
  }

  @Test
  fun aRetryableRefusalKeepsTheLogAndRetriesWithBackoff() = runTest {
    seed()
    LogDrink.log(context, 7, 1)
    env.api.defaultLog = LogResult(HttpWidgetApi.classify(429, "rate_limited"))
    val out = Sync.flush(context)
    assertTrue("WorkManager retries with backoff", out.retry)
    assertEquals(1, env.store.snapshot().outbox.items.single().attempts)
    assertTrue(env.store.snapshot().outbox.rejected.isEmpty())
  }

  @Test
  fun aStateRequestedBeforeAnAckDoesNotUndoTheCount() = runTest {
    seed()
    LogDrink.log(context, 7, 1)
    env.api.defaultLog = LogResult(SendResult.Accepted)
    // Another state request (the app's, or a refresh) left before the ack and lands after it,
    // built before the server saw the log (still 3 drinks).
    val asked = env.clock.instant()
    env.clock.advance(Duration.ofSeconds(1))
    Sync.flush(context)
    env.clock.advance(Duration.ofSeconds(1))
    env.store.putStateJson(Fixtures.widgetStates().first { it.id == "W4" }.stateJson, env.clock.instant(), asOf = asked)
    val snap = env.store.snapshot()
    assertEquals(1, snap.outbox.acked.size)
    val shown = app.clink.widget.model.Optimistic.apply(snap.state, snap.outbox, snap.countsReceivedAt, env.clock.instant(), env.clock.zone)
    assertEquals(4, (shown as WidgetState.Ready).today.drinks)
  }

  @Test
  fun signOutForgetsReportedWidgets() = runTest {
    seed()
    env.store.markReported(42)
    assertTrue(42 in env.store.snapshot().reported)
    env.store.clearAll(env.clock.instant())
    assertTrue(env.store.snapshot().reported.isEmpty())
    assertTrue(env.store.snapshot().state is WidgetState.SignedOut)
  }

  @Test
  fun withoutATokenNothingIsSentAndLogsWait() = runTest {
    seed(withToken = false)
    LogDrink.log(context, 7, 1)
    Sync.flush(context)
    assertTrue(env.api.logs.isEmpty())
    assertEquals(1, env.store.snapshot().outbox.items.size)
  }

  @Test
  fun staleStateIsRefreshedAndNewInstancesAreReported() = runTest {
    seed()
    env.store.putConfig(42, app.clink.widget.model.WidgetConfig(app.clink.widget.model.WidgetSize.MEDIUM))
    env.clock.advance(Duration.ofMinutes(11))
    val w3 = Fixtures.widgetStates().first { it.id == "W3" }
    env.api.state = StateResult.Ok(w3.stateJson)
    val out = Sync.flush(context)
    assertTrue(out.refreshed)
    assertEquals(StateQuery("42", "medium", "Europe/London"), env.api.stateCalls.single())
    assertTrue(42 in env.store.snapshot().reported)
    assertEquals("snp_leo1", (env.store.snapshot().state as WidgetState.Ready).snaps.first().id)
  }

  @Test
  fun aRefusedStateKeepsTheLastGoodOne() = runTest {
    seed()
    val before = env.store.snapshot().state
    assertFalse(env.store.putStateJson("""{"v":2,"state":"ready"}""", env.clock.instant()))
    assertEquals(before, env.store.snapshot().state)
  }

  @Test
  fun tokenIsStoredSealed() = runTest {
    WidgetEnv.vault(context).put(token)
    val raw = env.store.snapshot().hasToken
    assertTrue(raw)
    // What DataStore holds went through the cipher: the token itself is not in it.
    val stored = env.store.prefs()[app.clink.widget.store.WidgetStore.TOKEN]!!
    assertFalse(stored.contains(token))
    assertEquals(token, WidgetEnv.vault(context).get())
    WidgetEnv.vault(context).put(null)
    assertNull(WidgetEnv.vault(context).get())
    assertNotEquals(0, token.length)
  }

  @Test
  fun errorCodesFollowTheSharedTable() {
    assertEquals(SendResult.Accepted, HttpWidgetApi.classify(200))
    assertEquals(SendResult.Unauthorized, HttpWidgetApi.classify(401))
    for (c in listOf(403, 408, 429, 500, 503)) assertEquals("$c", SendResult.RetryLater, HttpWidgetApi.classify(c))
    for (c in listOf(400, 404, 405, 409, 413, 422)) assertEquals("$c", SendResult.Rejected(c), HttpWidgetApi.classify(c))
    // By code: the table decides, whatever the status.
    for ((code, rule) in WidgetApiErrors.TABLE) {
      val expected =
        when (rule.action) {
          ErrorAction.REAUTH -> SendResult.Unauthorized
          ErrorAction.RETRY -> SendResult.RetryLater
          ErrorAction.REJECT -> SendResult.Rejected(rule.status, code, rule.kind.key)
        }
      assertEquals(code, expected, HttpWidgetApi.classify(rule.status, code))
    }
    // A code this build doesn't know is judged by its status.
    assertEquals(SendResult.Rejected(422, "new_code"), HttpWidgetApi.classify(422, "new_code"))
    // A stale custom slot is kept for the app too, never deleted.
    assertEquals(SendResult.Rejected(409, "usual_changed", "stale"), HttpWidgetApi.classify(409, "usual_changed"))
    // The retired too_old is a 422 like any unknown code: kept for the app, not dropped.
    assertEquals(SendResult.Rejected(422, "too_old"), HttpWidgetApi.classify(422, "too_old"))
    assertEquals(SendResult.RetryLater, HttpWidgetApi.classify(503, "new_code"))
    assertEquals("", HttpWidgetApi.queryString(StateQuery()))
    assertEquals("?instance=7&size=small&tz=Europe%2FLondon", HttpWidgetApi.queryString(StateQuery("7", "small", "Europe/London")))
  }

  @Test
  fun theKotlinErrorTableMatchesWidgetApiErrors() {
    // packages/shared/src/api/index.ts, next to the fixtures this test already reads.
    val src = java.io.File(Fixtures.dir, "../src/api/index.ts").readText()
    val block = src.substringAfter("export const WIDGET_API_ERRORS = {").substringBefore("} as const")
    val rows =
      Regex("""(\w+):\s*\{\s*status:\s*(\d+),\s*then:\s*'(\w+)',\s*kind:\s*'(\w+)'\s*\}""").findAll(block).associate { m ->
        val action =
          when (val then = m.groupValues[3]) {
            "reauth" -> ErrorAction.REAUTH
            "retry" -> ErrorAction.RETRY
            "drop", "reject" -> ErrorAction.REJECT
            else -> throw AssertionError("WIDGET_API_ERRORS.${m.groupValues[1]}: unknown then '$then'")
          }
        val kind =
          app.clink.widget.net.ErrorKind.entries.firstOrNull { it.key == m.groupValues[4] }
            ?: throw AssertionError("WIDGET_API_ERRORS.${m.groupValues[1]}: unknown kind '${m.groupValues[4]}'")
        m.groupValues[1] to app.clink.widget.net.ErrorRule(m.groupValues[2].toInt(), action, kind)
      }
    assertTrue("parsed the shared table", rows.size >= 10)
    assertEquals(rows, WidgetApiErrors.TABLE)
  }
}
