package app.clink.widget

import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import app.clink.widget.model.OutboxEntry
import app.clink.widget.model.SendResult
import app.clink.widget.net.LogResult
import app.clink.widget.net.StateQuery
import app.clink.widget.net.StateResult
import app.clink.widget.net.WidgetApi
import app.clink.widget.store.TokenCipher
import app.clink.widget.store.WidgetStore
import java.io.File
import java.nio.file.Files
import java.time.Clock
import java.time.Duration
import java.time.Instant
import java.time.ZoneId
import java.time.ZoneOffset
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel

/** A clock the test moves by hand. */
class FakeClock(var now: Instant, private val zoneId: ZoneId) : Clock() {
  override fun getZone(): ZoneId = zoneId

  override fun withZone(zone: ZoneId): Clock = FakeClock(now, zone)

  override fun instant(): Instant = now

  fun advance(d: Duration) {
    now = now.plus(d)
  }
}

/** Robolectric has no AndroidKeyStore: a reversible stand-in that still never stores plain text. */
class FakeCipher : TokenCipher {
  override fun encrypt(plain: ByteArray) = plain.reversedArray() + byteArrayOf(7)

  override fun decrypt(sealed: ByteArray): ByteArray {
    require(sealed.last() == 7.toByte())
    return sealed.copyOf(sealed.size - 1).reversedArray()
  }
}

/** widget-api as a script: each call takes the next answer, or the default. */
class FakeApi : WidgetApi {
  val logs = mutableListOf<Pair<String, OutboxEntry.Log>>()
  val stateCalls = mutableListOf<StateQuery>()
  var logAnswers = ArrayDeque<LogResult>()
  var defaultLog: LogResult = LogResult(SendResult.Accepted)
  var state: StateResult = StateResult.Failed

  override fun postLog(token: String, entry: OutboxEntry.Log, timeZone: String): LogResult {
    logs += token to entry
    return logAnswers.removeFirstOrNull() ?: defaultLog
  }

  override fun getState(token: String, query: StateQuery): StateResult {
    stateCalls += query
    return state
  }
}

/** Fresh store, fake clock, cipher and API for one test. Call close() in @After. */
class TestEnv(start: Instant = Instant.parse("2026-11-17T09:12:00Z"), zone: ZoneId = ZoneId.of("Europe/London")) {
  val clock = FakeClock(start, zone)
  val api = FakeApi()
  private val dir: File = Files.createTempDirectory("clink-widget").toFile()
  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
  val store = WidgetStore(PreferenceDataStoreFactory.create(scope = scope) { File(dir, "store.preferences_pb") })

  init {
    WidgetStore.setInstanceForTests(store)
    WidgetEnv.clock = clock
    WidgetEnv.cipherOverride = FakeCipher()
    WidgetEnv.apiOverride = api
  }

  fun close() {
    WidgetStore.setInstanceForTests(null)
    WidgetEnv.clock = Clock.system(ZoneOffset.UTC)
    WidgetEnv.cipherOverride = null
    WidgetEnv.apiOverride = null
    scope.cancel()
    dir.deleteRecursively()
  }
}
