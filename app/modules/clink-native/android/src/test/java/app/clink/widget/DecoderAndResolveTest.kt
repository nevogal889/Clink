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
  fun everyInvalidFixtureIsRefusedOrDegradesGracefully() {
    val bad = Fixtures.invalidStates()
    assertTrue(bad.size >= 9)
    // Forward compatibility (CTO decision): an unknown key is ignored and an unknown enum value
    // drops only its item. The server's strict schema still refuses these before they leave.
    val degraded = setOf("xp-field.json", "water-flare.json")
    for ((name, json) in bad) {
      if (name in degraded) {
        assertNotNull("$name should decode", WidgetStateDecoder.decodeOrNull(json))
      } else {
        assertNull("$name should be refused", WidgetStateDecoder.decodeOrNull(json))
      }
    }
    val water = WidgetStateDecoder.decode(bad.first { it.first == "water-flare.json" }.second) as WidgetState.Ready
    assertNull("a flare with a category this build can't draw is skipped", water.myFlare)
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
  fun decoderIgnoresUnknownKeysAndSkipsUnknownValues() {
    // An extra key anywhere decodes (the first additive server field must not freeze old widgets).
    assertNotNull(WidgetStateDecoder.decodeOrNull("""{"v":1,"state":"signed_out","updatedAt":"2026-11-17T09:12:00Z","newField":3}"""))
    val w11 = JSONObject(Fixtures.widgetStates().first { it.id == "W11" }.stateJson)
    w11.put("streak", JSONObject().put("days", 4))
    w11.getJSONObject("today").put("coffeeMg", 120)
    w11.getJSONArray("usual").getJSONObject(0).put("temperature", "iced")
    val incoming = w11.getJSONArray("incoming")
    incoming.getJSONObject(0).put("reactions", org.json.JSONArray())
    // Unknown enum values: a category the widget can't draw and a reply kind it doesn't know.
    incoming.put(JSONObject(incoming.getJSONObject(0).toString()).put("flareId", "flr_new").put("category", "boba"))
    incoming.put(
      JSONObject(incoming.getJSONObject(0).toString()).put("flareId", "flr_maybe").put("myResponse", JSONObject().put("kind", "maybe"))
    )
    w11.getJSONArray("usual").getJSONObject(2).put("category", "kombucha")
    val s = WidgetStateDecoder.decode(w11.toString()) as WidgetState.Ready
    val before = WidgetStateDecoder.decode(Fixtures.widgetStates().first { it.id == "W11" }.stateJson) as WidgetState.Ready
    assertEquals("the slot with an unknown category is skipped", before.usual.take(2), s.usual)
    assertEquals(before.incoming.map { it.flareId } + "flr_maybe", s.incoming.map { it.flareId })
    assertNull(s.incoming.first { it.flareId == "flr_maybe" }.myResponse)
    assertTrue(s.incoming.none { it.flareId == "flr_new" })
  }

  @Test
  fun decoderStaysStrictOnWhatItReads() {
    val ok = """{"v":1,"state":"signed_out","updatedAt":"2026-11-17T09:12:00Z"}"""
    assertNotNull(WidgetStateDecoder.decodeOrNull(ok))
    // Wrong version, missing seconds, numeric offset without a colon, impossible date, unknown state.
    for (bad in listOf(
      """{"v":1,"state":"paused","updatedAt":"2026-11-17T09:12:00Z"}""",
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
  fun wrongTypesMissingFieldsAndBudgetsAreStillRefused() {
    val w4 = Fixtures.widgetStates().first { it.id == "W4" }.stateJson
    fun refused(edit: (JSONObject) -> Unit) {
      val o = JSONObject(w4)
      edit(o)
      assertNull(o.toString(), WidgetStateDecoder.decodeOrNull(o.toString()))
    }
    refused { it.getJSONObject("today").put("drinks", "3") }
    refused { it.getJSONObject("today").remove("localDate") }
    refused { it.remove("usual") }
    refused { it.getJSONArray("usual").getJSONObject(0).put("drinkShort", "A very long drink name") }
    refused { o -> repeat(2) { o.getJSONArray("usual").put(o.getJSONArray("usual").getJSONObject(0)) } }
    refused { it.getJSONObject("me").put("friendsCount", 21) }
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
