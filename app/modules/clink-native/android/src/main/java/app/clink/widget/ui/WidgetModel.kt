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
  /** null: nothing today, `noneText` is shown instead. */
  val lastDrinkAt: Instant?,
  /** The Chronometer format: the COPY.md line with {ago} as %s. */
  val lastFormat: String,
  /** The same line as minute text, for the fallback and for tests. */
  val lastText: String,
  val noneText: String,
  val a11y: String,
)

data class UsualLine(val icon: Int, val text: String)

sealed class SnapTileModel {
  abstract val a11y: String?
  abstract val tap: Tap

  data class Empty(val text: String, override val tap: Tap, override val a11y: String? = null) : SnapTileModel()

  data class Invite(val text: String, override val tap: Tap, override val a11y: String) : SnapTileModel()

  data class Photo(
    val file: String,
    val caption: String,
    override val tap: Tap,
    override val a11y: String,
  ) : SnapTileModel()
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

  data class Confirm(val text: String, val detail: String?, override val a11y: String) : OverlayModel()

  data class Sending(val text: String, override val a11y: String) : OverlayModel()

  data class Failed(val text: String, val opId: String, override val a11y: String) : OverlayModel()
}

data class PickerCell(
  val icon: Int,
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
    val usual: UsualLine?,
    val snap: SnapTileModel,
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
