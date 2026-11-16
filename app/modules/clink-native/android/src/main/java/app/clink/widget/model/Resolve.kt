package app.clink.widget.model

import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId

// Kotlin port of resolveWidgetView() (packages/shared/src/widget-state, PRD 3.3 priority,
// DESIGN.md 5.1 to 5.3). Every fixture's expect.small / expect.medium is checked against it.

object Timers {
  // packages/shared/src/limits TIMERS.
  const val PICKER_TIMEOUT_SEC = 30L
  const val WIDGET_CONFIRMATION_SEC = 4L
  const val SEND_FAILED_AFTER_SEC = 30L
  const val FLARE_DROP_AFTER_MIN = 2L
  const val WIDGET_CALL_TIMEOUT_SEC = 8L
  const val WIDGET_STALE_AFTER_MIN = 10L
}

/** CAPS.caffeineNoteAfter: the note shows after the 4th caffeinated drink (PRD 3.11 rule 6). */
const val CAFFEINE_NOTE_AFTER = 4

enum class WidgetSize(val key: String) {
  SMALL("small"),
  MEDIUM("medium");

  companion object {
    fun of(key: String): WidgetSize? = entries.firstOrNull { it.key == key }
  }
}

enum class LocalMode(val key: String) {
  IDLE("idle"),
  PICKER("picker"),
  BRING_PICKER("bring_picker");

  companion object {
    fun of(key: String): LocalMode? = entries.firstOrNull { it.key == key }
  }
}

enum class ConfirmationKind(val key: String) {
  LOGGED("logged"),
  SENT("sent"),
  IN("in"),
  ASKED("asked"),
  ENDED("ended");

  companion object {
    fun of(key: String): ConfirmationKind? = entries.firstOrNull { it.key == key }
  }
}

data class Confirmation(
  val kind: ConfirmationKind,
  val drinkShort: String?,
  val until: Instant,
  /** The logged drink's catalog id, so the confirmation can show its picture (polish pass). */
  val drinkId: String? = null,
)

/** State the widget keeps for itself (widgetLocalSchema). */
data class WidgetLocal(
  val mode: LocalMode = LocalMode.IDLE,
  val modeFlareId: String? = null,
  val modeOpenedAt: Instant? = null,
  val confirmation: Confirmation? = null,
  val dismissedFlareIds: List<String> = emptyList(),
) {
  companion object {
    val EMPTY = WidgetLocal()
  }
}

/** One widget instance (widgetConfigSchema). audience: "auto", "everyone" or a group id. */
data class WidgetConfig(val size: WidgetSize, val audience: String = "auto")

sealed class Overlay {
  data class Confirm(val kind: ConfirmationKind) : Overlay()

  data class Sending(val opId: String) : Overlay()

  data class Failed(val opId: String) : Overlay()
}

data class IdleAudience(val type: String, val groupId: String?)

sealed class WidgetView {
  abstract val overlay: Overlay?

  data class SignedOut(override val overlay: Overlay? = null) : WidgetView()

  data class Setup(override val overlay: Overlay? = null) : WidgetView()

  data class Picker(override val overlay: Overlay?) : WidgetView()

  data class BringPicker(val flareId: String, override val overlay: Overlay?) : WidgetView()

  data class Incoming(
    val flareId: String,
    val more: Int,
    val hasPhoto: Boolean,
    /** "in", "bring" or null. */
    val response: String?,
    override val overlay: Overlay?,
  ) : WidgetView()

  data class MyFlareView(
    val flareId: String,
    val replies: Int,
    val chips: Int,
    val moreReplies: Int,
    override val overlay: Overlay?,
  ) : WidgetView()

  data class Idle(
    val drinks: Int,
    val water: Int,
    val caffeineNote: Boolean,
    val noFriends: Boolean,
    val noUsual: Boolean,
    val snapId: String?,
    val audience: IdleAudience?,
    val audienceEmpty: Boolean,
    override val overlay: Overlay?,
  ) : WidgetView()

  val kind: String
    get() =
      when (this) {
        is SignedOut -> "signed_out"
        is Setup -> "setup"
        is Picker -> "picker"
        is BringPicker -> "bring_picker"
        is Incoming -> "incoming"
        is MyFlareView -> "my_flare"
        is Idle -> "idle"
      }
}

object Resolve {
  fun localDateAt(at: Instant, zone: ZoneId): LocalDate = at.atZone(zone).toLocalDate()

  private fun overlayFor(state: WidgetState.Ready?, local: WidgetLocal, now: Instant): Overlay? {
    val c = local.confirmation
    if (c != null && now.isBefore(c.until)) return Overlay.Confirm(c.kind)
    if (state == null) return null
    // Logs never fail visibly (PRD 3.20). Flares and replies show Sending, then Failed at 30 s,
    // until their drop time.
    val pending =
      state.outbox
        .filter { it !is OutboxEntry.Log && (it.dropAt == null || now.isBefore(it.dropAt)) }
        .sortedBy { it.createdAt }
    val failed =
      pending.firstOrNull {
        now.toEpochMilli() - it.createdAt.toEpochMilli() >= Timers.SEND_FAILED_AFTER_SEC * 1000
      }
    if (failed != null) return Overlay.Failed(failed.id)
    return pending.firstOrNull()?.let { Overlay.Sending(it.id) }
  }

  private fun idleAudience(
    s: WidgetState.Ready,
    config: WidgetConfig,
    now: Instant,
    zone: ZoneId,
  ): Pair<IdleAudience, Boolean> {
    val target = config.audience
    if (target == "everyone") return IdleAudience("everyone", null) to false
    // An id that isn't in `groups` (deleted) is treated as Automatic (ARCHITECTURE.md 3.1).
    val known = s.groups.firstOrNull { it.id == target }
    if (target != "auto" && known != null) {
      return IdleAudience("group", target) to (known.memberCount == 0)
    }
    val r = Automatic.resolveAt(now, zone, s.auto, s.groups)
    return IdleAudience("auto", if (r == EVERYONE) null else r) to false
  }

  /**
   * What a widget shows now. Order (PRD 3.3, QA_PLAN.md 4.2): signed out / setup > an open picker >
   * the newest unreplied friend flare > your live flare > the newest replied friend flare > idle.
   */
  fun view(
    state: WidgetState,
    local: WidgetLocal?,
    config: WidgetConfig,
    now: Instant,
    zone: ZoneId,
  ): WidgetView {
    val loc = local ?: WidgetLocal.EMPTY
    val medium = config.size == WidgetSize.MEDIUM
    when (state) {
      is WidgetState.SignedOut -> return WidgetView.SignedOut()
      is WidgetState.Setup -> return WidgetView.Setup()
      is WidgetState.Ready -> Unit
    }
    val s = state as WidgetState.Ready
    val overlay = overlayFor(s, loc, now)
    val dismissed = loc.dismissedFlareIds.toSet()
    val live =
      s.incoming
        .filter { now.isBefore(it.expiresAt) && it.flareId !in dismissed }
        .sortedByDescending { it.sentAt }
    val unreplied = live.filter { it.myResponse == null }

    val openedAt = loc.modeOpenedAt
    val pickerOpen =
      loc.mode != LocalMode.IDLE &&
        openedAt != null &&
        now.toEpochMilli() - openedAt.toEpochMilli() < Timers.PICKER_TIMEOUT_SEC * 1000
    if (pickerOpen && loc.mode == LocalMode.PICKER) return WidgetView.Picker(overlay)
    if (pickerOpen && loc.mode == LocalMode.BRING_PICKER && medium) {
      val f = unreplied.firstOrNull { it.flareId == loc.modeFlareId }
      if (f != null) return WidgetView.BringPicker(f.flareId, overlay)
    }

    unreplied.firstOrNull()?.let { top ->
      return WidgetView.Incoming(top.flareId, unreplied.size - 1, top.photoFile != null, null, overlay)
    }
    val mine = s.myFlare
    if (mine != null && now.isBefore(mine.expiresAt)) {
      val replies = mine.replies.size
      val chips = if (medium) minOf(2, replies) else 0
      return WidgetView.MyFlareView(mine.id, replies, chips, if (medium) replies - chips else 0, overlay)
    }
    live.firstOrNull()?.let { replied ->
      val response =
        when (replied.myResponse) {
          is MyResponse.In -> "in"
          is MyResponse.Bring -> "bring"
          null -> null
        }
      return WidgetView.Incoming(replied.flareId, 0, replied.photoFile != null, response, overlay)
    }

    // Counts reset at local midnight with no network (PRD 3.11 rule 2).
    val isToday = s.today.localDate == localDateAt(now, zone)
    val snap =
      if (medium) s.snaps.filter { now.isBefore(it.expiresAt) }.maxByOrNull { it.createdAt } else null
    val aud = if (medium) idleAudience(s, config, now, zone) else null
    return WidgetView.Idle(
      drinks = if (isToday) s.today.drinks else 0,
      water = if (isToday) s.today.water else 0,
      caffeineNote = medium && (if (isToday) s.today.caffeinated else 0) >= CAFFEINE_NOTE_AFTER,
      noFriends = s.friendsCount == 0,
      noUsual = s.usual.isEmpty(),
      snapId = snap?.id,
      audience = aud?.first,
      audienceEmpty = aud?.second ?: false,
      overlay = overlay,
    )
  }
}
