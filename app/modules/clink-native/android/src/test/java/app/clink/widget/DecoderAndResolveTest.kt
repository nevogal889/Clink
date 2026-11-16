package app.clink.widget

import app.clink.widget.model.Automatic
import app.clink.widget.model.AutoSettings
import app.clink.widget.model.Resolve
import app.clink.widget.model.WidgetSize
import app.clink.widget.model.WidgetState
import app.clink.widget.model.WidgetStateDecoder
import app.clink.widget.model.WidgetStateException
import java.io.File
import java.time.Instant
import java.time.ZoneId
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

// The Kotlin decoder and view rule against the same fixtures as the TS and Swift ports
// (ARCHITECTURE.md 9 "Widget state contract", QA_PLAN.md 4.1 W1 to W22, 6.3 T22 to T33).

@RunWith(RobolectricTestRunner::class)
class DecoderAndResolveTest {
  @Test
  fun everyWidgetStateFixtureDecodes() {
    val all = Fixtures.widgetStates()
    assertEquals("W1 to W22", 22, all.size)
    for (f in all) {
      try {
        WidgetStateDecoder.decode(f.stateJson)
      } catch (e: WidgetStateException) {
        fail("${f.file} did not decode: ${e.message}")
      }
    }
  }

  @Test
  fun everyInvalidFixtureIsRefused() {
    val bad = Fixtures.invalidStates()
    assertTrue(bad.size >= 9)
    for ((name, json) in bad) {
      assertNull("$name should be refused", WidgetStateDecoder.decodeOrNull(json))
    }
  }

  @Test
  fun everyFixtureResolvesToItsExpectedView() {
    for (f in Fixtures.widgetStates()) {
      val state = WidgetStateDecoder.decode(f.stateJson)
      for ((size, expected) in listOf(WidgetSize.SMALL to f.expectSmall, WidgetSize.MEDIUM to f.expectMedium)) {
        expected ?: continue
        val view = Resolve.view(state, f.local, f.config(size), f.now, f.zone)
        val mismatch = Fixtures.partialMismatch(expected, Fixtures.viewJson(view))
        assertNull("${f.id} ${size.key}: $mismatch", mismatch)
      }
    }
  }

  @Test
  fun automaticRuleMatchesEveryCase() {
    val o = JSONObject(File(Fixtures.dir, "automatic-rule.json").readText())
    val cases = o.getJSONArray("cases")
    assertTrue(cases.length() >= 20)
    for (i in 0 until cases.length()) {
      val c = cases.getJSONObject(i)
      val s = c.getJSONObject("settings")
      val settings =
        AutoSettings(
          if (s.isNull("daytimeGroupId")) null else s.getString("daytimeGroupId"),
          if (s.isNull("otherGroupId")) null else s.getString("otherGroupId"),
        )
      val ga = c.getJSONArray("groups")
      val groups = (0 until ga.length()).map { ga.getJSONObject(it).let { g -> Automatic.AudienceGroup(g.getString("id"), g.getInt("memberCount")) } }
      val at = Instant.parse(c.getString("at"))
      val zone = ZoneId.of(c.getString("timeZone"))
      val local = Automatic.localTimeAt(at, zone)
      val l = c.getJSONObject("local")
      assertEquals(c.getString("id"), Automatic.LocalTime(l.getInt("weekday"), l.getInt("hour"), l.getInt("minute")), local)
      assertEquals(c.getString("id"), c.getString("expected"), Automatic.resolve(local, settings, groups))
    }
  }

  @Test
  fun decoderIsStrictLikeZod() {
    val ok = """{"v":1,"state":"signed_out","updatedAt":"2026-11-17T09:12:00Z"}"""
    assertNotNull(WidgetStateDecoder.decodeOrNull(ok))
    // Unknown key, wrong version, missing seconds, numeric offset without a colon, impossible date.
    for (bad in listOf(
      """{"v":1,"state":"signed_out","updatedAt":"2026-11-17T09:12:00Z","xp":3}""",
      """{"v":2,"state":"signed_out","updatedAt":"2026-11-17T09:12:00Z"}""",
      """{"v":1,"state":"signed_out","updatedAt":"2026-11-17T09:12Z"}""",
      """{"v":1,"state":"signed_out","updatedAt":"2026-11-17T09:12:00+0100"}""",
      """{"v":1,"state":"signed_out","updatedAt":"2026-02-30T09:12:00Z"}""",
      "not json",
    )) {
      assertNull(bad, WidgetStateDecoder.decodeOrNull(bad))
    }
    assertEquals(
      Instant.parse("2026-11-17T08:12:00Z"),
      WidgetStateDecoder.parseInstant("2026-11-17T09:12:00.250+01:00")?.minusMillis(250),
    )
  }

  @Test
  fun readyStateKeepsItsFields() {
    val w3 = Fixtures.widgetStates().first { it.id == "W3" }
    val s = WidgetStateDecoder.decode(w3.stateJson) as WidgetState.Ready
    assertEquals(3, s.usual.size)
    assertEquals("coffee.flat_white", s.usual[0].drinkId)
    assertEquals(3, s.today.drinks)
    assertEquals(4, s.today.water)
  }
}
