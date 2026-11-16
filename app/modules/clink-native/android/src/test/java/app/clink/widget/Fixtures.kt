package app.clink.widget

import app.clink.widget.model.Confirmation
import app.clink.widget.model.ConfirmationKind
import app.clink.widget.model.LocalMode
import app.clink.widget.model.Overlay
import app.clink.widget.model.WidgetConfig
import app.clink.widget.model.WidgetLocal
import app.clink.widget.model.WidgetSize
import app.clink.widget.model.WidgetStateDecoder
import app.clink.widget.model.WidgetView
import java.io.File
import java.time.Instant
import java.time.ZoneId
import org.json.JSONObject

/** The shared fixtures (packages/shared/fixtures), found through the clink.fixtures property. */
object Fixtures {
  val dir: File =
    File(System.getProperty("clink.fixtures") ?: error("clink.fixtures is not set (see clink-widget.gradle)"))

  data class StateFixture(
    val file: String,
    val id: String,
    val now: Instant,
    val zone: ZoneId,
    val audience: String,
    val stateJson: String,
    val local: WidgetLocal?,
    val expectSmall: JSONObject?,
    val expectMedium: JSONObject?,
  ) {
    fun config(size: WidgetSize) = WidgetConfig(size, audience)
  }

  fun widgetStates(): List<StateFixture> =
    File(dir, "widget-states").listFiles { f -> f.isFile && f.name.endsWith(".json") }!!.sortedBy { it.name }.map { f ->
      val o = JSONObject(f.readText())
      val expect = o.getJSONObject("expect")
      StateFixture(
        file = f.name,
        id = o.getString("id"),
        now = Instant.parse(o.getString("now")),
        zone = ZoneId.of(o.getString("timeZone")),
        audience = o.getJSONObject("config").getString("audience"),
        stateJson = o.getJSONObject("state").toString(),
        local = o.optJSONObject("local")?.let(::local),
        expectSmall = expect.optJSONObject("small"),
        expectMedium = expect.optJSONObject("medium"),
      )
    }

  fun invalidStates(): List<Pair<String, String>> =
    File(dir, "widget-states/invalid").listFiles { f -> f.name.endsWith(".json") }!!.sortedBy { it.name }.map { f ->
      f.name to JSONObject(f.readText()).getJSONObject("state").toString()
    }

  fun local(o: JSONObject): WidgetLocal {
    fun inst(k: String) = if (o.isNull(k)) null else WidgetStateDecoder.parseInstant(o.getString(k))
    val c = o.optJSONObject("confirmation")
    val dismissed = o.optJSONArray("dismissedFlareIds")
    return WidgetLocal(
      mode = LocalMode.of(o.getString("mode"))!!,
      modeFlareId = if (o.isNull("modeFlareId")) null else o.getString("modeFlareId"),
      modeOpenedAt = inst("modeOpenedAt"),
      confirmation =
        c?.let {
          Confirmation(
            ConfirmationKind.of(it.getString("kind"))!!,
            if (it.isNull("drinkShort")) null else it.getString("drinkShort"),
            Instant.parse(it.getString("until")),
          )
        },
      dismissedFlareIds = (0 until (dismissed?.length() ?: 0)).map { dismissed!!.getString(it) },
    )
  }

  /** A view in the TS shape (WidgetView in packages/shared/src/widget-state), for partial matching. */
  fun viewJson(v: WidgetView): JSONObject {
    val o = JSONObject().put("kind", v.kind)
    o.put(
      "overlay",
      when (val ov = v.overlay) {
        null -> JSONObject.NULL
        is Overlay.Confirm -> JSONObject().put("kind", "confirmation").put("confirmation", ov.kind.key)
        is Overlay.Sending -> JSONObject().put("kind", "sending").put("opId", ov.opId)
        is Overlay.Failed -> JSONObject().put("kind", "failed").put("opId", ov.opId)
      },
    )
    when (v) {
      is WidgetView.BringPicker -> o.put("flareId", v.flareId)
      is WidgetView.Incoming ->
        o.put("flareId", v.flareId).put("more", v.more).put("hasPhoto", v.hasPhoto).put("response", v.response ?: JSONObject.NULL)
      is WidgetView.MyFlareView ->
        o.put("flareId", v.flareId).put("replies", v.replies).put("chips", v.chips).put("moreReplies", v.moreReplies)
      is WidgetView.Idle ->
        o.put("drinks", v.drinks)
          .put("water", v.water)
          .put("caffeineNote", v.caffeineNote)
          .put("noFriends", v.noFriends)
          .put("noUsual", v.noUsual)
          .put("snapId", v.snapId ?: JSONObject.NULL)
          .put(
            "audience",
            v.audience?.let { JSONObject().put("type", it.type).put("groupId", it.groupId ?: JSONObject.NULL) } ?: JSONObject.NULL,
          )
          .put("audienceEmpty", v.audienceEmpty)
      else -> Unit
    }
    return o
  }

  /** Every key in `expected` equals the same key in `actual` (nested objects compared whole). */
  fun partialMismatch(expected: JSONObject, actual: JSONObject): String? {
    for (k in expected.keys()) {
      if (!actual.has(k)) return "$k missing"
      val e = expected.get(k)
      val a = actual.get(k)
      if (!same(e, a)) return "$k: expected $e, got $a"
    }
    return null
  }

  private fun same(e: Any?, a: Any?): Boolean =
    when {
      e is JSONObject && a is JSONObject ->
        e.keys().asSequence().toSet() == a.keys().asSequence().toSet() && e.keys().asSequence().all { same(e.get(it), a.get(it)) }
      e is Number && a is Number -> e.toDouble() == a.toDouble()
      else -> e == a
    }
}
