package app.clink.widget.ui

import java.time.Instant

// What one widget draws, with every string already made from COPY.md keys. The builder
// (ModelBuilder) does the state and text work; the Glance composables (WidgetContent) only lay it
// out. Tests check the model and the composition separately.

enum class Layout {
  /** 2x2, about 120 x 120 dp (DESIGN.md 5.5). */
  SMALL,
  /** 2x2 on a launcher with tall cells: room for the picker header and every tracker line. */
  SMALL_TALL,
  /** 4x2 under 150 dp high. */
  MEDIUM_SHORT,
  /** 4x2 at about 250 dp wide (DESIGN.md 5.5): compact strings and buttons. */
  MEDIUM,
  /** 4x2 at 300 dp wide and up: the full DESIGN.md 5.2 layout. */
  MEDIUM_WIDE;

  val small: Boolean
    get() = this == SMALL || this == SMALL_TALL

  val wide: Boolean
    get() = this == MEDIUM_WIDE
}

/** Where a tap goes. */
sealed class Tap {
  data class Open(val route: app.clink.widget.AppRoute) : Tap()

  data object OpenPicker : Tap()

  data object ClosePicker : Tap()

  /** slot 1 to 3, or null for water. */
  data class Log(val slot: Int?) : Tap()

  data class Retry(val opId: String) : Tap()
}

data class TrackerModel(
  val drinksNum: String,
  val drinksWord: String,
  val waterNum: String,
  val waterWord: String,
  /** The whole water count as COPY.md writes it ("4 waters"). */
  val waterText: String,
  /**
   * The last drink as a time of day ("Last drink 7:30 AM"; small "Last 7:30"): exact, never stale,
   * so no ticking and no per-minute redraws. null with no drink today: `noneText` shows instead.
   */
  val lastText: String?,
  val noneText: String,
  val a11y: String,
)

/** The usual #1 as a line (small tall widget): its picture and its short name. */
data class UsualLine(val art: Int, val text: String)

/**
 * The tile beside the tracker on the idle medium widget (DESIGN.md 5.2, polish pass): a friend's
 * snap when there is one today, otherwise your usual #1 drink on its tint, otherwise the nudge to
 * pick your usual 3.
 */
sealed class MediaTile {
  abstract val a11y: String
  abstract val tap: Tap

  data class Photo(val file: String, val caption: String, override val tap: Tap, override val a11y: String) : MediaTile()

  /** Usual #1 (or the herbal tea note after 4 caffeinated drinks): Icon L on its category plate. */
  data class Drink(val art: Int, val name: String, val background: Int, override val tap: Tap, override val a11y: String) : MediaTile()

  data class PickUsual(val text: String, override val tap: Tap, override val a11y: String) : MediaTile()
}

data class ButtonModel(
  val label: String,
  val icon: Int?,
  val background: Int,
  val textColor: Int,
  val tap: Tap,
  val a11y: String,
  /** A second line under the label (the Who joins? audience). */
  val subLabel: String? = null,
)

sealed class OverlayModel {
  abstract val a11y: String

  /** `art`: the logged drink's Icon L, shown at the end of the row. */
  data class Confirm(val text: String, val detail: String?, override val a11y: String, val art: Int? = null) : OverlayModel()

  data class Sending(val text: String, override val a11y: String) : OverlayModel()

  data class Failed(val text: String, val opId: String, override val a11y: String) : OverlayModel()
}

data class PickerCell(
  /** Icon L of the drink (the main thing in the cell). */
  val art: Int,
  val label: String,
  val background: Int,
  val tap: Tap,
  val a11y: String,
)

data class ReplyChip(val text: String)

sealed class Content {
  data class Prompt(val text: String, val a11y: String) : Content()

  data class Idle(
    val tracker: TrackerModel,
    val media: MediaTile,
    /** Usual #1 as a line, where a layout has room for it beside the counts. */
    val usual: UsualLine?,
    val log: ButtonModel,
    val camera: ButtonModel,
    val whoJoins: ButtonModel,
    val overlay: OverlayModel?,
  ) : Content()

  data class Picker(
    val title: String,
    val cells: List<PickerCell>,
    val closeA11y: String,
    val overlay: OverlayModel?,
  ) : Content()

  data class MyFlare(
    val background: Int,
    val glyph: Int,
    val hero: Int,
    val textColor: Int,
    val title: String,
    val place: String?,
    val expiresAt: Instant,
    val chips: List<ReplyChip>,
    val chipBackground: Int,
    val more: String?,
    val noneText: String?,
    val counts: String,
    val a11y: String,
    val overlay: OverlayModel?,
  ) : Content()

  data class Incoming(
    val background: Int,
    val hero: Int,
    val initial: String,
    val name: String,
    val title: String,
    val subTitle: String,
    val meta: String,
    val expiresAt: Instant,
    /** Chronometer format for the countdown: COPY.md `wm.in.left` / `ws.in.left` with %s. */
    val leftFormat: String,
    val more: String?,
    val moreA11y: String?,
    val join: ButtonModel?,
    val bring: ButtonModel?,
    /** "You're in" / "Asked for Cortado" after replying. */
    val replied: String?,
    val repliedA11y: String?,
    val a11y: String,
    val overlay: OverlayModel?,
  ) : Content()

  data class BringPicker(
    val background: Int,
    val title: String,
    val cells: List<PickerCell>,
    val closeA11y: String,
    val overlay: OverlayModel?,
  ) : Content()
}

data class WidgetModel(
  val layout: Layout,
  /** Text size multiplier that keeps scaled text within the widget's limits (DESIGN.md 2.4). */
  val textScale: Float,
  /** Android font scale 1.3 and up drops secondary lines (DESIGN.md 2.4). */
  val compactText: Boolean,
  /** The system font scale, to size the RemoteViews numerals in dp. */
  val fontScale: Float,
  val background: Int,
  val tap: Tap,
  val content: Content,
)
