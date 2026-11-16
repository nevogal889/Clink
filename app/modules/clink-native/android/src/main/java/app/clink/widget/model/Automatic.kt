package app.clink.widget.model

import java.time.DayOfWeek
import java.time.Instant
import java.time.ZoneId

// Kotlin port of the "Automatic" audience rule (packages/shared/src/audience, PRD 3.10 rule 5,
// ARCHITECTURE.md 4.6): Monday to Friday, 08:00 to 17:59 local, the daytime group if it exists and
// has at least one friend, else Everyone; every other time the other-times group under the same
// condition. The label only; the server decides real recipients. Tested against
// packages/shared/fixtures/automatic-rule.json (T22 to T33, A1 to A8).

const val EVERYONE = "everyone"

object Automatic {
  const val DAYTIME_START_MIN = 8 * 60
  const val DAYTIME_END_MIN = 18 * 60
  private val DAYTIME_WEEKDAYS = setOf(1, 2, 3, 4, 5)

  data class LocalTime(val weekday: Int, val hour: Int, val minute: Int)

  data class AudienceGroup(val id: String, val memberCount: Int)

  fun isDaytime(t: LocalTime): Boolean {
    val minutes = t.hour * 60 + t.minute
    return t.weekday in DAYTIME_WEEKDAYS && minutes >= DAYTIME_START_MIN && minutes < DAYTIME_END_MIN
  }

  /** A group id, or [EVERYONE]. */
  fun resolve(t: LocalTime, settings: AutoSettings, groups: List<AudienceGroup>): String {
    val id = (if (isDaytime(t)) settings.daytimeGroupId else settings.otherGroupId) ?: return EVERYONE
    val g = groups.firstOrNull { it.id == id }
    return if (g != null && g.memberCount >= 1) g.id else EVERYONE
  }

  fun localTimeAt(at: Instant, zone: ZoneId): LocalTime {
    val z = at.atZone(zone)
    return LocalTime(z.dayOfWeek.value, z.hour, z.minute)
  }

  fun resolveAt(at: Instant, zone: ZoneId, settings: AutoSettings, groups: List<Group>): String =
    resolve(localTimeAt(at, zone), settings, groups.map { AudienceGroup(it.id, it.memberCount) })

  /** The next weekday 08:00 or 18:00 after `at`, when the Automatic label can change. */
  fun nextBoundary(at: Instant, zone: ZoneId): Instant {
    val local = at.atZone(zone)
    var day = local.toLocalDate()
    repeat(8) {
      if (day.dayOfWeek.value in DAYTIME_WEEKDAYS) {
        for (m in intArrayOf(DAYTIME_START_MIN, DAYTIME_END_MIN)) {
          val t = day.atTime(m / 60, m % 60).atZone(zone).toInstant()
          if (t.isAfter(at)) return t
        }
      }
      day = day.plusDays(1)
    }
    // Unreachable: a week always has a weekday boundary.
    return local.with(DayOfWeek.MONDAY).plusWeeks(1).toInstant()
  }
}
