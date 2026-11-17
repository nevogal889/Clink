package app.clink.widget.model

import java.time.Duration
import java.time.Instant

/**
 * Flare countdowns in whole minutes (DESIGN.md 5.1 "Time", round 3: "14 min left", never a clock
 * time). The number is rounded up, so an open flare never reads 0; under a minute the widget says
 * so in words. The text changes only at a minute boundary, so the widget redraws then (Deadlines)
 * and nothing ticks every second.
 */
object Countdown {
  /** Whole minutes left, rounded up; 0 when under a minute or past. */
  fun minutesLeft(now: Instant, at: Instant): Long {
    val ms = Duration.between(now, at).toMillis()
    if (ms < 60_000L) return 0L
    return (ms + 59_999L) / 60_000L
  }

  /** The next moment after `now` when minutesLeft(now, at) changes, or null once `at` has passed. */
  fun nextChange(now: Instant, at: Instant): Instant? {
    val ms = Duration.between(now, at).toMillis()
    if (ms <= 0L) return null
    // The shown number drops when the time left reaches a whole minute: at - k minutes.
    val k = (ms - 1L) / 60_000L
    return at.minusMillis(k * 60_000L)
  }
}
