package app.clink.widget.text

import android.content.Context
import android.text.format.DateFormat
import app.clink.nativemodule.R
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

// Every user-facing widget string comes from COPY.md through the generated resources
// (scripts/gen-android-strings.mjs: key "wm.pick.title" is R.string.clink_wm_pick_title). The time
// variables follow app/src/lib/format.ts: {ago}, {mins}, {ago_words} / {left_words} (COPY.md 4.27).

class Copy(private val lookup: (Int) -> String, private val is24Hour: () -> Boolean = { true }) {
  constructor(context: Context) : this({ id -> context.getString(id) }, { DateFormat.is24HourFormat(context) })

  fun t(id: Int, vararg vars: Pair<String, Any>): String = Icu.render(lookup(id), mapOf(*vars))

  /** The raw message, for the Chronometer format (its {ago} becomes the ticking %s). */
  fun raw(id: Int): String = lookup(id)

  /** {ago}: "just now", "12m", "1h 42m". */
  fun ago(minutes: Long): String {
    if (minutes < 1) return t(R.string.clink_fmt_ago_now)
    val h = minutes / 60
    val m = minutes % 60
    return when {
      h == 0L -> t(R.string.clink_fmt_ago_m, "m" to m)
      m == 0L -> t(R.string.clink_fmt_ago_h, "h" to h)
      else -> t(R.string.clink_fmt_ago_hm, "h" to h, "m" to m)
    }
  }

  /**
   * {time}: a clock time in the device's 12/24 h setting (COPY.md 0.3), "7:30" or "7:30 AM".
   * `short` drops AM/PM for the small widget (COPY.md `ws.last_at`).
   */
  fun time(at: Instant, zone: ZoneId, short: Boolean = false): String {
    val pattern = if (is24Hour()) "H:mm" else if (short) "h:mm" else "h:mm a"
    return DateTimeFormatter.ofPattern(pattern, Locale.US).withZone(zone).format(at)
  }

  /** {ago_words} / {left_words}: spoken at minute precision, never per second (DESIGN.md 5.6). */
  fun words(minutes: Long): String {
    val total = maxOf(0L, minutes)
    val h = total / 60
    val m = total % 60
    return when {
      h == 0L -> t(R.string.clink_fmt_words_m, "m" to m)
      m == 0L -> t(R.string.clink_fmt_words_h, "h" to h)
      else -> t(R.string.clink_fmt_words_hm, "h" to h, "m" to m)
    }
  }

  /** {mins} / {mins_cap}: "now" or "in 15 min". */
  fun mins(minutes: Long, capital: Boolean = false): String =
    if (minutes <= 0) {
      t(if (capital) R.string.clink_fmt_mins_cap_now else R.string.clink_fmt_mins_now)
    } else {
      t(if (capital) R.string.clink_fmt_mins_cap_in else R.string.clink_fmt_mins_in, "n" to minutes)
    }

  companion object {
    /** COPY.md 0.2 widget budgets: `{name}` 12, `{place}` 18, `{group}` 14, `{drink_short}` 15. */
    const val NAME = 12
    const val PLACE = 18
    const val GROUP = 14
    const val DRINK_SHORT = 15

    /**
     * Cuts a value to its budget: budget - 1 characters plus an ellipsis (COPY.md 0.2), counting
     * code points so a surrogate pair is never split (packages/shared truncateTo).
     */
    fun truncate(value: String, budget: Int): String {
      val count = value.codePointCount(0, value.length)
      if (count <= budget) return value
      val end = value.offsetByCodePoints(0, maxOf(0, budget - 1))
      return value.substring(0, end).trimEnd() + "…"
    }

    /** "3 drinks" -> ("3", "drinks"), so the number can be set large (app/src/lib/format.ts). */
    fun splitCount(text: String): Pair<String, String> {
      val m = Regex("""^(\d+)\s+(.+)$""").find(text) ?: return "" to text
      return m.groupValues[1] to m.groupValues[2]
    }
  }
}
