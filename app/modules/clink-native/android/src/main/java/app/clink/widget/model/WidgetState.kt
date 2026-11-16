package app.clink.widget.model

import java.time.Instant
import java.time.LocalDate
import java.time.OffsetDateTime
import java.time.format.DateTimeFormatter
import java.time.format.DateTimeParseException
import org.json.JSONArray
import org.json.JSONObject
import org.json.JSONTokener

// Kotlin port of packages/shared/src/widget-state (ARCHITECTURE.md 3.1). Forward compatible
// (CTO decision, polish pass 2026-11-16): unknown keys are ignored and an unknown enum value drops
// only the item that carries it (a reply, a flare, a usual slot, an outbox op), so the first
// additive server field never freezes an older widget. It stays strict on what it reads: types,
// required fields, text budgets, list sizes, the version and timestamps with a zone, so a broken
// document never replaces the last good one (QA_PLAN.md ST8). An unknown `state` is refused: the
// widget can't draw it. Every fixture in packages/shared/fixtures/widget-states is decoded by
// DecoderAndResolveTest.

const val WIDGET_STATE_VERSION = 1

enum class FlareCategory(val key: String) {
  COFFEE("coffee"),
  MATCHA("matcha"),
  TEA("tea"),
  SMOOTHIE_JUICE("smoothie_juice");

  companion object {
    fun of(key: String): FlareCategory? = entries.firstOrNull { it.key == key }
  }
}

/** A drink log's category: the four flare categories plus water. */
enum class LogCategory(val key: String) {
  COFFEE("coffee"),
  MATCHA("matcha"),
  TEA("tea"),
  SMOOTHIE_JUICE("smoothie_juice"),
  WATER("water");

  companion object {
    fun of(key: String): LogCategory? = entries.firstOrNull { it.key == key }

    fun of(c: FlareCategory): LogCategory = entries.first { it.key == c.key }
  }
}

data class UsualSlot(
  val slot: Int,
  /** null for a custom drink. */
  val drinkId: String?,
  val category: FlareCategory,
  val name: String,
  val drinkShort: String,
  val summary: String,
  val hasDetails: Boolean,
)

data class Group(
  val id: String,
  val name: String,
  val emoji: String?,
  val memberCount: Int,
  val avatarFiles: List<String>,
)

sealed class Reply {
  abstract val name: String

  data class In(override val name: String) : Reply()

  data class Bring(override val name: String, val drinkShort: String, val hasNotes: Boolean) :
    Reply()
}

data class Audience(val type: String, val groupId: String?)

data class MyFlare(
  val id: String,
  val category: FlareCategory,
  val label: String,
  val drinkName: String,
  val place: String?,
  val audience: Audience,
  val createdAt: Instant,
  val meetAt: Instant,
  val expiresAt: Instant,
  val replies: List<Reply>,
)

sealed class MyResponse {
  data object In : MyResponse()

  data class Bring(val drinkShort: String) : MyResponse()
}

data class IncomingFlare(
  val flareId: String,
  val senderName: String,
  val avatarFile: String?,
  val category: FlareCategory,
  val wants: String,
  val label: String,
  val drinkName: String,
  val place: String?,
  val photoFile: String?,
  val sentAt: Instant,
  val meetAt: Instant,
  val expiresAt: Instant,
  val myResponse: MyResponse?,
)

data class Snap(
  val id: String,
  val senderName: String,
  val thumbFile: String,
  val place: String?,
  val createdAt: Instant,
  val expiresAt: Instant,
)

data class LogPayload(
  val drinkId: String?,
  val slot: Int?,
  val category: LogCategory,
  val loggedAt: Instant,
)

sealed class OutboxEntry {
  abstract val id: String
  abstract val createdAt: Instant
  /** null for logs: they retry forever (ARCHITECTURE.md 3.2). */
  abstract val dropAt: Instant?

  data class Log(override val id: String, override val createdAt: Instant, val payload: LogPayload) :
    OutboxEntry() {
    override val dropAt: Instant? = null
  }

  data class Flare(
    override val id: String,
    override val createdAt: Instant,
    override val dropAt: Instant,
    val audience: String,
    val timingMin: Int,
    val tappedAt: Instant,
    val timeZone: String,
  ) : OutboxEntry()

  data class Respond(
    override val id: String,
    override val createdAt: Instant,
    override val dropAt: Instant,
    val flareId: String,
    val kind: String,
    val slot: Int?,
  ) : OutboxEntry()

  val op: String
    get() =
      when (this) {
        is Log -> "log"
        is Flare -> "flare"
        is Respond -> "respond"
      }
}

data class Today(
  val localDate: LocalDate,
  val drinks: Int,
  val water: Int,
  val caffeinated: Int,
  val lastDrinkAt: Instant?,
)

data class AutoSettings(val daytimeGroupId: String?, val otherGroupId: String?)

sealed class WidgetState {
  abstract val updatedAt: Instant

  data class SignedOut(override val updatedAt: Instant) : WidgetState()

  /** Signed in, onboarding unfinished. */
  data class Setup(override val updatedAt: Instant) : WidgetState()

  data class Ready(
    override val updatedAt: Instant,
    val meInitial: String,
    val friendsCount: Int,
    val usual: List<UsualSlot>,
    val today: Today,
    val groups: List<Group>,
    val auto: AutoSettings,
    val lastPlace: String?,
    val myFlare: MyFlare?,
    val incoming: List<IncomingFlare>,
    val snaps: List<Snap>,
    val outbox: List<OutboxEntry>,
  ) : WidgetState()
}

/** Thrown for any document the schema would refuse. The message names the field. */
class WidgetStateException(message: String) : Exception(message)

/** An enum value this build doesn't know: the item that carries it is skipped, not the document. */
private class UnknownValue : Exception()

object WidgetStateDecoder {
  private val ISO_INSTANT_RE =
    Regex("""^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$""")
  private val LOCAL_DATE_RE = Regex("""^\d{4}-\d{2}-\d{2}$""")
  private val FILE_RE = Regex("""^[a-z]{1,3}_[A-Za-z0-9._-]{1,120}$""")
  private val UUID_RE =
    Regex(
      "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}" +
        "|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff" +
        "|FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF)$"
    )

  // PRD text limits (packages/shared/src/limits TEXT_LIMITS).
  private const val CUSTOM_DRINK_NAME = 30
  private const val PLACE = 40
  private const val GROUP_NAME = 20
  private const val GROUP_EMOJI = 16

  /** Decodes stored JSON; null when the schema would refuse it (keep the last good state). */
  fun decodeOrNull(json: String): WidgetState? =
    try {
      decode(json)
    } catch (e: WidgetStateException) {
      null
    }

  fun decode(json: String): WidgetState {
    val root =
      try {
        JSONTokener(json).nextValue()
      } catch (e: Exception) {
        throw WidgetStateException("not JSON")
      }
    return decode(root as? JSONObject ?: throw WidgetStateException("not an object"))
  }

  fun decode(o: JSONObject): WidgetState {
    val r = Reader(o, "")
    val v = r.int("v")
    if (v != WIDGET_STATE_VERSION) throw WidgetStateException("v must be $WIDGET_STATE_VERSION")
    val updatedAt = r.instant("updatedAt")
    return when (val s = r.string("state")) {
      "signed_out" -> {
        WidgetState.SignedOut(updatedAt)
      }
      "setup" -> {
        WidgetState.Setup(updatedAt)
      }
      "ready" -> ready(r, updatedAt)
      else -> throw WidgetStateException("unknown state \"$s\"")
    }
  }

  private fun ready(r: Reader, updatedAt: Instant): WidgetState.Ready {
    val me = r.obj("me")
    val today = r.obj("today")
    val auto = r.obj("auto")
    return WidgetState.Ready(
      updatedAt = updatedAt,
      meInitial = me.string("initial", minUtf16 = 1, maxUtf16 = 2),
      friendsCount = me.count("friendsCount", max = 20),
      usual = r.array("usual", max = 3).knownEach { usual(it) },
      today =
        Today(
          localDate = today.localDate("localDate"),
          drinks = today.count("drinks"),
          water = today.count("water"),
          caffeinated = today.count("caffeinated"),
          lastDrinkAt = today.instantOrNull("lastDrinkAt"),
        ),
      groups = r.array("groups", max = 10).map { group(it) },
      auto = AutoSettings(auto.idOrNull("daytimeGroupId"), auto.idOrNull("otherGroupId")),
      lastPlace = r.textOrNull("lastPlace", PLACE),
      myFlare = r.objOrNull("myFlare")?.let { f -> known { myFlare(f) } },
      incoming = r.array("incoming", max = 20).knownEach { incoming(it) },
      snaps = r.array("snaps", max = 20).map { snap(it) },
      outbox = r.array("outbox", max = 100).knownEach { outboxEntry(it) },
    )
  }

  private fun usual(r: Reader): UsualSlot {
    return UsualSlot(
      slot = r.int("slot", 1, 3),
      drinkId = r.idOrNull("drinkId"),
      category = r.knownFlareCategory("category"),
      name = r.text("name", CUSTOM_DRINK_NAME),
      drinkShort = r.text("drinkShort", 15),
      summary = r.string("summary", maxUtf16 = 200),
      hasDetails = r.bool("hasDetails"),
    )
  }

  private fun group(r: Reader): Group {
    return Group(
      id = r.id("id"),
      name = r.text("name", GROUP_NAME),
      emoji = r.stringOrNull("emoji", maxUtf16 = GROUP_EMOJI),
      memberCount = r.count("memberCount", max = 20),
      avatarFiles = r.strings("avatarFiles", max = 3).map { r.file(it, "avatarFiles") },
    )
  }

  private fun reply(r: Reader): Reply {
    return when (val kind = r.string("kind")) {
      "in" -> {
        Reply.In(r.firstName("name"))
      }
      "bring" -> {
        Reply.Bring(r.firstName("name"), r.text("drinkShort", 15), r.bool("hasNotes"))
      }
      else -> throw UnknownValue()
    }
  }

  private fun myFlare(r: Reader): MyFlare {
    val aud = r.obj("audience")
    // An unknown audience type is kept as it came: the widget only shows the flare, never edits it.
    val type = aud.string("type", minUtf16 = 1, maxUtf16 = 32)
    return MyFlare(
      id = r.id("id"),
      category = r.knownFlareCategory("category"),
      label = r.string("label", minUtf16 = 1, maxUtf16 = 10),
      drinkName = r.text("drinkName", CUSTOM_DRINK_NAME),
      place = r.textOrNull("place", PLACE),
      audience = Audience(type, aud.idOrNull("groupId")),
      createdAt = r.instant("createdAt"),
      meetAt = r.instant("meetAt"),
      expiresAt = r.instant("expiresAt"),
      replies = r.array("replies", max = 20).knownEach { reply(it) },
    )
  }

  private fun incoming(r: Reader): IncomingFlare {
    val resp =
      r.objOrNull("myResponse")?.let { m ->
        when (val kind = m.string("kind")) {
          "in" -> {
            MyResponse.In
          }
          "bring" -> {
            MyResponse.Bring(m.text("drinkShort", 15))
          }
          // A reply kind this build doesn't know: the flare shows without it, and the app has
          // the truth when the friend opens it.
          else -> null
        }
      }
    return IncomingFlare(
      flareId = r.id("flareId"),
      senderName = r.firstName("senderName"),
      avatarFile = r.stringOrNull("avatarFile")?.let { r.file(it, "avatarFile") },
      category = r.knownFlareCategory("category"),
      wants = r.string("wants", minUtf16 = 1, maxUtf16 = 10),
      label = r.string("label", minUtf16 = 1, maxUtf16 = 10),
      drinkName = r.text("drinkName", CUSTOM_DRINK_NAME),
      place = r.textOrNull("place", PLACE),
      photoFile = r.stringOrNull("photoFile")?.let { r.file(it, "photoFile") },
      sentAt = r.instant("sentAt"),
      meetAt = r.instant("meetAt"),
      expiresAt = r.instant("expiresAt"),
      myResponse = resp,
    )
  }

  private fun snap(r: Reader): Snap {
    return Snap(
      id = r.id("id"),
      senderName = r.firstName("senderName"),
      thumbFile = r.file(r.string("thumbFile"), "thumbFile"),
      place = r.textOrNull("place", PLACE),
      createdAt = r.instant("createdAt"),
      expiresAt = r.instant("expiresAt"),
    )
  }

  /** One outbox entry; null when its op or category is one this build doesn't know. */
  fun outboxEntry(o: JSONObject): OutboxEntry? = known { outboxEntry(Reader(o, "")) }

  private fun outboxEntry(r: Reader): OutboxEntry {
    val id = r.string("id")
    if (!UUID_RE.matches(id)) throw WidgetStateException("${r.path}id: not a UUID")
    val createdAt = r.instant("createdAt")
    val p = r.obj("payload")
    return when (val op = r.string("op")) {
      "log" -> {
        if (!r.isNull("dropAt")) throw WidgetStateException("${r.path}dropAt: must be null for logs")
        val category = LogCategory.of(p.string("category")) ?: throw UnknownValue()
        OutboxEntry.Log(
          id,
          createdAt,
          LogPayload(p.idOrNull("drinkId"), p.intOrNull("slot", 1, 3), category, p.instant("loggedAt")),
        )
      }
      "flare" -> {
        val audience = p.string("audience")
        if (audience != "auto" && audience != "everyone") p.checkId(audience, "audience")
        val timing = p.int("timingMin")
        if (timing != 0) throw WidgetStateException("${p.path}timingMin: must be 0")
        OutboxEntry.Flare(
          id,
          createdAt,
          r.instant("dropAt"),
          audience,
          timing,
          p.instant("tappedAt"),
          p.string("timeZone", minUtf16 = 1, maxUtf16 = 64),
        )
      }
      "respond" -> {
        val kind = p.string("kind")
        if (kind != "in" && kind != "bring") throw UnknownValue()
        OutboxEntry.Respond(
          id,
          createdAt,
          r.instant("dropAt"),
          p.id("flareId"),
          kind,
          p.intOrNull("slot", 1, 3),
        )
      }
      else -> throw UnknownValue()
    }
  }

  /** The value, or null when it carries an enum value this build doesn't know. */
  private fun <T> known(block: () -> T): T? =
    try {
      block()
    } catch (e: UnknownValue) {
      null
    }

  private fun <T> List<Reader>.knownEach(block: (Reader) -> T): List<T> = mapNotNull { r -> known { block(r) } }

  fun parseInstant(s: String): Instant? {
    if (!ISO_INSTANT_RE.matches(s)) return null
    return try {
      OffsetDateTime.parse(s, DateTimeFormatter.ISO_OFFSET_DATE_TIME).toInstant()
    } catch (e: DateTimeParseException) {
      null
    }
  }

  /** Characters as Postgres counts them: code points (limits.ts charLength). */
  fun charLength(s: String): Int = s.codePointCount(0, s.length)

  private class Reader(val o: JSONObject, val path: String) {
    private fun fail(key: String, why: String): Nothing = throw WidgetStateException("$path$key: $why")

    private fun raw(key: String): Any {
      if (!o.has(key)) fail(key, "missing")
      return o.get(key)
    }

    fun isNull(key: String): Boolean = raw(key) == JSONObject.NULL

    fun string(key: String, minUtf16: Int = 0, maxUtf16: Int = Int.MAX_VALUE): String {
      val v = raw(key) as? String ?: fail(key, "not a string")
      if (v.length < minUtf16 || v.length > maxUtf16) fail(key, "length out of range")
      return v
    }

    fun stringOrNull(key: String, maxUtf16: Int = Int.MAX_VALUE): String? =
      if (isNull(key)) null else string(key, 0, maxUtf16)

    /** maxText(): at most `max` code points. */
    fun text(key: String, max: Int): String {
      val v = string(key)
      if (charLength(v) > max) fail(key, "at most $max characters")
      return v
    }

    fun textOrNull(key: String, max: Int): String? = if (isNull(key)) null else text(key, max)

    fun firstName(key: String): String {
      val v = text(key, 12)
      if (v.isEmpty()) fail(key, "empty")
      return v
    }

    fun checkId(v: String, key: String) {
      if (v.isEmpty() || v.length > 64) fail(key, "not an id")
    }

    fun id(key: String): String = string(key).also { checkId(it, key) }

    fun idOrNull(key: String): String? = if (isNull(key)) null else id(key)

    fun file(v: String, key: String): String {
      if (!FILE_RE.matches(v)) fail(key, "not a cached file name")
      return v
    }

    fun int(key: String, min: Int = Int.MIN_VALUE, max: Int = Int.MAX_VALUE): Int {
      val v = raw(key)
      val n =
        when (v) {
          is Int -> v.toLong()
          is Long -> v
          is Double -> if (v % 1.0 == 0.0 && !v.isInfinite()) v.toLong() else fail(key, "not an integer")
          is java.math.BigDecimal ->
            try {
              v.longValueExact()
            } catch (e: ArithmeticException) {
              fail(key, "not an integer")
            }
          is Number -> v.toLong()
          else -> fail(key, "not a number")
        }
      if (n < min || n > max) fail(key, "out of range")
      return n.toInt()
    }

    fun intOrNull(key: String, min: Int, max: Int): Int? = if (isNull(key)) null else int(key, min, max)

    fun count(key: String, max: Int = Int.MAX_VALUE): Int = int(key, 0, max)

    fun bool(key: String): Boolean = raw(key) as? Boolean ?: fail(key, "not a boolean")

    fun instant(key: String): Instant = parseInstant(string(key)) ?: fail(key, "not an ISO time with a zone")

    fun instantOrNull(key: String): Instant? = if (isNull(key)) null else instant(key)

    fun localDate(key: String): LocalDate {
      val s = string(key)
      if (!LOCAL_DATE_RE.matches(s)) fail(key, "not a date")
      return try {
        LocalDate.parse(s)
      } catch (e: DateTimeParseException) {
        fail(key, "not a date")
      }
    }

    /** A flare category; one this build doesn't know (water included) skips the item. */
    fun knownFlareCategory(key: String): FlareCategory = FlareCategory.of(string(key)) ?: throw UnknownValue()

    fun obj(key: String): Reader = Reader(raw(key) as? JSONObject ?: fail(key, "not an object"), "$path$key.")

    fun objOrNull(key: String): Reader? = if (isNull(key)) null else obj(key)

    fun array(key: String, max: Int): List<Reader> {
      val a = raw(key) as? JSONArray ?: fail(key, "not an array")
      if (a.length() > max) fail(key, "more than $max items")
      return (0 until a.length()).map { i ->
        Reader(a.get(i) as? JSONObject ?: fail("$key[$i]", "not an object"), "$path$key[$i].")
      }
    }

    fun strings(key: String, max: Int): List<String> {
      val a = raw(key) as? JSONArray ?: fail(key, "not an array")
      if (a.length() > max) fail(key, "more than $max items")
      return (0 until a.length()).map { i -> a.get(i) as? String ?: fail("$key[$i]", "not a string") }
    }
  }
}
