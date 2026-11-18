package app.clink.widget.ui

import android.content.Context
import android.graphics.Paint
import android.graphics.Typeface
import android.text.SpannableString
import android.text.Spanned
import android.text.style.RelativeSizeSpan
import android.text.style.StyleSpan
import android.text.style.TypefaceSpan
import android.util.TypedValue
import android.widget.RemoteViews
import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.GlanceModifier
import androidx.glance.Image
import androidx.glance.ImageProvider
import androidx.glance.LocalContext
import androidx.glance.LocalSize
import androidx.glance.action.Action
import androidx.glance.action.actionParametersOf
import androidx.glance.action.clickable
import androidx.glance.appwidget.AndroidRemoteViews
import androidx.glance.appwidget.cornerRadius
import androidx.glance.appwidget.action.actionRunCallback
import androidx.glance.appwidget.action.actionStartActivity
import androidx.glance.background
import androidx.glance.layout.Alignment
import androidx.glance.layout.Box
import androidx.glance.layout.Column
import androidx.glance.layout.ContentScale
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxHeight
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.height
import androidx.glance.layout.padding
import androidx.glance.layout.size
import androidx.glance.layout.width
import androidx.glance.layout.wrapContentWidth
import androidx.glance.semantics.contentDescription
import androidx.glance.semantics.semantics
import androidx.glance.text.FontFamily
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextAlign
import androidx.glance.text.TextStyle
import androidx.glance.unit.ColorProvider
import app.clink.nativemodule.R

// Glance layouts for every widget state (DESIGN.md 5, polish pass 2026-11-16). Sizes are the
// DESIGN.md widget scale: numeral.l 34, primary 15, secondary 13, micro 11; buttons 48 dp; 12 dp
// padding. The system sans stands in for Archivo (DESIGN.md 2.4); numerals use the condensed face.
//
// Nothing is ever cut. Every line, label and drink name is measured with the system font at the
// real text size (TextFit) before it is placed: what doesn't fit is removed in the DESIGN.md 5.1
// drop order, never ellipsized. WidgetScreenshotTest walks every rendered TextView to prove it.

private const val NUMERAL = 34f
private const val PRIMARY = 15f
private const val SECONDARY = 13f
private const val NAME = 12f
private const val MICRO = 11f
private const val BUTTON_DP = 48f
private val BUTTON = BUTTON_DP.dp
private const val PAD = 12f
private const val GAP = 6f

private val CONDENSED = FontFamily("sans-serif-condensed")

private fun color(id: Int) = ColorProvider(id)

private class Scale(val m: WidgetModel) {
  fun sp(v: Float) = (v * m.textScale).sp

  /** The size a TextView draws at, in dp: the scaled sp times the system font scale. */
  fun dp(v: Float) = v * m.textScale * m.fontScale

  fun style(size: Float, colorRes: Int, weight: FontWeight = FontWeight.Normal, condensed: Boolean = false, align: TextAlign? = null) =
    TextStyle(
      color = color(colorRes),
      fontSize = sp(size),
      fontWeight = weight,
      fontFamily = if (condensed) CONDENSED else null,
      textAlign = align,
    )

  /** Width in dp of one line of `text` at widget size `size` (Medium unless said otherwise). */
  fun w(text: String, size: Float, face: TextFit.Face = TextFit.Face.MEDIUM) = TextFit.width(text, dp(size), face)

  /** Height in dp of `lines` lines of Glance text at `size` (font padding included). */
  fun h(size: Float, lines: Int = 1) = TextFit.height(dp(size), lines)

  /** Lines `text` needs in `width` dp without breaking a word; Int.MAX_VALUE if a word is too long. */
  fun lines(text: String, size: Float, width: Float, face: TextFit.Face = TextFit.Face.MEDIUM) = TextFit.lines(text, dp(size), width, face)
}

/**
 * Text measurement with the system fonts the launcher draws with, so a layout can decide what fits
 * before it composes. Glance sets weight with a TextAppearanceSpan (weight 500 for Medium), so
 * MEDIUM is the 500 weight of the default family where the platform has it (API 28+). Widths carry
 * 5% plus 1 dp for pixel rounding.
 */
object TextFit {
  enum class Face {
    REGULAR,
    MEDIUM,
    NUMERAL,
  }

  private val paints = HashMap<Face, Paint>()

  private fun typeface(face: Face): Typeface =
    when (face) {
      Face.REGULAR -> Typeface.create("sans-serif", Typeface.NORMAL)
      Face.MEDIUM ->
        if (android.os.Build.VERSION.SDK_INT >= 28) Typeface.create(Typeface.DEFAULT, 500, false)
        else Typeface.create("sans-serif-medium", Typeface.NORMAL)
      Face.NUMERAL -> Typeface.create("sans-serif-condensed", Typeface.BOLD)
    }

  private fun paint(face: Face): Paint =
    synchronized(paints) { paints.getOrPut(face) { Paint(Paint.ANTI_ALIAS_FLAG).apply { typeface = typeface(face) } } }

  fun width(text: String, sizeDp: Float, face: Face): Float {
    val p = paint(face)
    synchronized(p) {
      p.textSize = sizeDp
      return p.measureText(text) * 1.05f + 1f
    }
  }

  /**
   * Roboto: 1.33 em for a line with font padding, 1.17 em for each further line; measured at
   * 1.36 and 1.2 plus 1 dp, which covers the launcher's rounding to whole pixels.
   */
  fun height(sizeDp: Float, lines: Int): Float = sizeDp * (1.36f + 1.2f * (lines - 1)) + 1f

  /**
   * How far below the baseline a text view ends, in dp: the descent for a view without font
   * padding (the numerals), the font's bottom for Glance Text (font padding on). Used to put a
   * small line on the numeral's baseline (review item 11).
   */
  fun belowBaseline(sizeDp: Float, face: Face, fontPadding: Boolean): Float {
    val p = paint(face)
    synchronized(p) {
      p.textSize = sizeDp
      val m = p.fontMetrics
      return if (fontPadding) m.bottom else m.descent
    }
  }

  fun lines(text: String, sizeDp: Float, widthDp: Float, face: Face): Int {
    val space = width(" ", sizeDp, face) - 1f
    var lines = 1
    var used = 0f
    for (word in text.split(' ').filter { it.isNotEmpty() }) {
      val ww = width(word, sizeDp, face)
      if (ww > widthDp) return Int.MAX_VALUE
      used =
        if (used == 0f) ww
        else if (used + space + ww <= widthDp) used + space + ww
        else {
          lines++
          ww
        }
    }
    return lines
  }
}

/** The Glance action for a model tap. */
fun tapAction(context: Context, tap: Tap): Action =
  when (tap) {
    is Tap.Open -> actionStartActivity(tap.route.intent(context))
    Tap.OpenPicker -> actionRunCallback<OpenPickerAction>()
    Tap.ClosePicker -> actionRunCallback<ClosePickerAction>()
    is Tap.Log -> actionRunCallback<LogDrinkAction>(actionParametersOf(LogDrinkAction.SLOT to (tap.slot ?: 0)))
    is Tap.Retry -> actionRunCallback<RetryAction>(actionParametersOf(RetryAction.OP to tap.opId))
  }

/** The content box, in dp, after the widget's padding. */
private class Area(val w: Float, val h: Float)

/** Width / height of a drawable (drink pictures are cropped to what is drawn, so each has its own). */
object ArtAspect {
  private val cache = HashMap<Int, Float>()

  fun of(context: Context, res: Int): Float =
    synchronized(cache) {
      cache.getOrPut(res) {
        val d = context.resources.getDrawable(res, null)
        if (d.intrinsicWidth > 0 && d.intrinsicHeight > 0) d.intrinsicWidth.toFloat() / d.intrinsicHeight else 1f
      }
    }

  /** The largest (w, h) with `aspect` inside a w x h box. */
  fun fit(aspect: Float, w: Float, h: Float): Pair<Float, Float> =
    when {
      w <= 0f || h <= 0f -> 0f to 0f
      w / h > aspect -> (h * aspect) to h
      else -> w to (w / aspect)
    }

  private val sizes = HashMap<Int, Pair<Float, Float>>()

  /**
   * The size to draw a drink picture in a w x h box: as large as its aspect allows, but never
   * over 1.5 times its drawn size (one 64-grid unit = 1.5 dp), where Icon L's 3-unit outline
   * would turn heavy (DESIGN.md 3.2).
   */
  fun box(context: Context, res: Int, w: Float, h: Float): Pair<Float, Float> {
    val (iw, ih) =
      synchronized(sizes) {
        sizes.getOrPut(res) {
          val d = context.resources.getDrawable(res, null)
          val density = context.resources.displayMetrics.density
          d.intrinsicWidth / density to d.intrinsicHeight / density
        }
      }
    return fit(of(context, res), minOf(w, iw * MAX_ART), minOf(h, ih * MAX_ART))
  }

  const val MAX_ART = 1.5f
}

/** A drink picture, exactly as big as it may be in the box, so the ImageView has no slack. */
@Composable
private fun Art(res: Int, boxW: Float, boxH: Float) {
  val (w, h) = ArtAspect.box(LocalContext.current, res, boxW, boxH)
  Image(ImageProvider(res), contentDescription = null, modifier = GlanceModifier.width(w.dp).height(h.dp))
}

@Composable
fun WidgetContent(model: WidgetModel) {
  val context = LocalContext.current
  val s = Scale(model)
  val size = LocalSize.current
  val c = model.content
  // The idle 4x2 is split edge to edge into the counts and the drink panel: each part pads itself.
  val split = (c is Content.Idle || c is Content.Prompt) && !model.layout.small
  // Pickers on the small and short sizes use 8 dp, so their 2 x 2 cells stay large.
  val pad =
    when {
      split -> 0f
      c is Content.Picker && (model.layout.small || model.layout == Layout.MEDIUM_SHORT) -> 8f
      // The 2x2 uses 10 dp, so four rows (counts, usual #1, button) fit a 150 dp tall cell.
      model.layout.small -> 10f
      else -> PAD
    }
  val area = Area(size.width.value - 2 * pad, size.height.value - 2 * pad)
  // The 2x2 picker has no ✕: the whole widget closes it, so the widget itself is labelled "Close".
  val rootLabel = (c as? Content.Picker)?.closeA11y?.takeIf { model.layout.small }
  Box(
    modifier =
      GlanceModifier.fillMaxSize()
        .background(ImageProvider(model.background))
        .clickable(tapAction(context, model.tap))
        .let { m -> rootLabel?.let { l -> m.semantics { contentDescription = l } } ?: m }
        .padding(pad.dp),
  ) {
    when (c) {
      is Content.Prompt -> Prompt(model, s, c)
      is Content.Idle -> if (model.layout.small) IdleSmall(model, s, c, area) else IdleMedium(model, s, c, area)
      is Content.Picker -> LogPicker(model, s, c, area)
      is Content.BringPicker -> BringPicker(model, s, c, area)
      is Content.MyFlare -> MyFlare(model, s, c, area)
      is Content.Incoming -> Incoming(model, s, c, area)
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Signed out and setup: the rim mark, the wordmark and one line. The whole widget opens the app.

@Composable
private fun Prompt(model: WidgetModel, s: Scale, c: Content.Prompt) {
  if (model.layout.small) {
    Column(modifier = GlanceModifier.fillMaxSize().semantics { contentDescription = c.a11y }, verticalAlignment = Alignment.Bottom) {
      Image(ImageProvider(R.drawable.clink_mark), contentDescription = null, modifier = GlanceModifier.width(62.dp).height(52.dp))
      Spacer(GlanceModifier.defaultWeight())
      Text(c.text, style = s.style(PRIMARY, R.color.clink_ink_primary, FontWeight.Medium), maxLines = 2)
    }
    return
  }
  // The 4x2 keeps the idle widget's split: the words on enamel, the rim mark on a cobalt panel
  // where the drink will be, so the widget looks like itself before sign-in.
  val w = LocalSize.current.width.value
  val panelW = w * PANEL_SHARE
  Row(modifier = GlanceModifier.fillMaxSize().semantics { contentDescription = c.a11y }) {
    Column(
      modifier = GlanceModifier.defaultWeight().fillMaxHeight().padding(start = PAD.dp, top = (PAD + 4f).dp, end = SEAM.dp, bottom = PAD.dp),
      verticalAlignment = Alignment.Bottom,
    ) {
      // The wordmark, 28 dp high (viewBox 348 x 146).
      Image(ImageProvider(R.drawable.clink_wordmark), contentDescription = null, modifier = GlanceModifier.width(67.dp).height(28.dp))
      Spacer(GlanceModifier.defaultWeight())
      Text(c.text, style = s.style(PRIMARY, R.color.clink_ink_primary, FontWeight.Medium), maxLines = s.lines(c.text, PRIMARY, w - panelW - PAD - SEAM).coerceIn(1, 3))
    }
    Box(
      modifier = GlanceModifier.width(panelW.dp).fillMaxHeight().background(ImageProvider(R.drawable.clink_bg_panel_cobalt)),
      contentAlignment = Alignment.Center,
    ) {
      // The mark is 120 x 100 units (rim plus handle).
      Image(ImageProvider(R.drawable.clink_mark), contentDescription = null, modifier = GlanceModifier.width(84.dp).height(70.dp))
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Idle: the counts

/**
 * "3 drinks" as one RemoteViews text: the number in condensed bold at `numSize`, the word in
 * medium at `wordSize`, on one baseline, with no font padding (Glance Text can do neither).
 */
@Composable
private fun CountLine(s: Scale, layout: Int, num: String, word: String, numSize: Float, wordSize: Float) {
  val context = LocalContext.current
  val text = if (word.isEmpty()) num else "$num $word"
  val span = SpannableString(text)
  span.setSpan(StyleSpan(Typeface.BOLD), 0, num.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
  if (word.isNotEmpty()) {
    span.setSpan(RelativeSizeSpan(wordSize / numSize), num.length, text.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
    span.setSpan(TypefaceSpan("sans-serif-medium"), num.length, text.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
  }
  val rv = RemoteViews(context.packageName, layout)
  rv.setTextViewText(R.id.clink_text, span)
  // In dp, already times the font scale: Android 14+ scales large sp sizes non-linearly, and the
  // layout has measured this line at exactly numSize x fontScale.
  rv.setTextViewTextSize(R.id.clink_text, TypedValue.COMPLEX_UNIT_DIP, numSize * s.m.fontScale)
  // Sized explicitly: an unsized AndroidRemoteViews fills its parent.
  AndroidRemoteViews(rv, GlanceModifier.width((countWidth(s, num, word, numSize, wordSize) + 2f).dp).height(countHeight(s, numSize).dp))
}

/** Width in dp of a CountLine (sizes are scaled sp). */
private fun countWidth(s: Scale, num: String, word: String, numSize: Float, wordSize: Float): Float =
  TextFit.width(num, numSize * s.m.fontScale, TextFit.Face.NUMERAL) +
    (if (word.isEmpty()) 0f else TextFit.width(" $word", wordSize * s.m.fontScale, TextFit.Face.MEDIUM))

/** Height in dp of a CountLine: the condensed face without font padding is about 1.18 em. */
private fun countHeight(s: Scale, numSize: Float) = numSize * s.m.fontScale * 1.18f

@Composable
private fun WaterLine(s: Scale, text: String, color: Int = R.color.clink_ink_secondary) {
  Row(verticalAlignment = Alignment.CenterVertically) {
    Image(ImageProvider(R.drawable.clink_ui_tumbler_water_ink), contentDescription = null, modifier = GlanceModifier.size(16.dp))
    Spacer(GlanceModifier.width(3.dp))
    Text(text, style = s.style(SECONDARY, color, FontWeight.Medium), maxLines = 1)
  }
}

private fun waterLineWidth(s: Scale, text: String) = 19f + s.w(text, SECONDARY)

/** The first option that fits `w` at the secondary size (regular face), or null. */
private fun firstFitting(s: Scale, options: List<String>, w: Float): String? = options.firstOrNull { s.w(it, SECONDARY, TextFit.Face.REGULAR) <= w }

/** Largest numeral on the 4x2, in dp of text size: past this it stops reading as a count. */
private const val NUMERAL_MAX_DP = 96f

/** The word beside the numeral: 13 next to numeral.l, 15 once the numeral is twice that or more. */
private fun countWordSize(s: Scale, numSize: Float) = (if (numSize * s.m.fontScale >= 2 * NUMERAL * s.m.textScale) PRIMARY else SECONDARY) * s.m.textScale

/** A count line's plan: the numeral size (scaled sp), its word (or none) and the word's size. */
private class CountPlan(val numSize: Float, val word: String, val wordSize: Float)

/**
 * The largest count line that fits `w` x `h` dp: the numeral grows with the height it is given
 * (CEO, 2026-11-17: empty space under the count is a bug), and shrinks for the width before the
 * word "drinks" goes. Never below numeral.l unless the height itself is smaller.
 */
private fun planCount(s: Scale, num: String, word: String, w: Float, h: Float): CountPlan {
  val fs = s.m.fontScale
  val byH = minOf(h / (1.18f * fs), NUMERAL_MAX_DP / fs)
  val floor = minOf(byH, NUMERAL * s.m.textScale)
  var size = byH
  while (size >= floor) {
    val ws = countWordSize(s, size)
    if (word.isNotEmpty() && countWidth(s, num, word, size, ws) <= w) return CountPlan(size, word, ws)
    size -= 1f
  }
  // No room for the word: the numeral alone, as large as the box allows.
  var bare = byH
  while (bare > 12f && countWidth(s, num, "", bare, bare) > w) bare -= 1f
  return CountPlan(bare, "", countWordSize(s, bare))
}

/**
 * The counts on the 4x2, in `w` x `h` dp (CEO, 2026-11-17):
 *   3 drinks                the numeral fills the height left by the line under it
 *   ◦ 4 · Last 7:30 AM      one small line: the water count, then the last drink
 * Water never gets a numeral of its own. With no drink today the line is only "◦ 4". The short
 * 4x2 (under 150 dp) puts the water line beside the count, on the numeral's baseline.
 */
@Composable
private fun Tracker(s: Scale, t: TrackerModel, w: Float, h: Float, short: Boolean) {
  val num = t.drinksNum.ifEmpty { "0" }
  Column(modifier = GlanceModifier.semantics { contentDescription = t.a11y }) {
    if (!short) {
      val lineH = s.h(SECONDARY)
      val line = t.waterLine.firstOrNull { waterLineWidth(s, it) <= w } ?: t.waterLine.last()
      val c = planCount(s, num, t.drinksWord, w, h - lineH - 2f)
      CountLine(s, R.layout.clink_numeral_ink, num, c.word, c.numSize, c.wordSize)
      Spacer(GlanceModifier.height(2.dp))
      WaterLine(s, line, R.color.clink_ink_secondary)
    } else {
      // Beside the count: the water count alone fits more often than the whole line.
      val c0 = planCount(s, num, t.drinksWord, w * 0.55f, h)
      val countW = countWidth(s, num, c0.word, c0.numSize, c0.wordSize)
      val line = t.waterLine.firstOrNull { countW + 10f + waterLineWidth(s, it) <= w }
      val c = if (line != null) c0 else planCount(s, num, "", w - 10f - waterLineWidth(s, t.waterLine.last()), h)
      val shown = line ?: t.waterLine.last()
      // The small line's baseline on the numeral's (review item 11): both views end below their
      // baseline by different amounts, so the line is lifted by the difference.
      val lift =
        TextFit.belowBaseline(c.numSize * s.m.fontScale, TextFit.Face.NUMERAL, false) - 0.01f * c.numSize * s.m.fontScale -
          TextFit.belowBaseline(s.dp(SECONDARY), TextFit.Face.MEDIUM, true)
      Row(verticalAlignment = Alignment.Bottom) {
        CountLine(s, R.layout.clink_numeral_ink, num, c.word, c.numSize, c.wordSize)
        Spacer(GlanceModifier.width(10.dp))
        Box(modifier = GlanceModifier.padding(bottom = maxOf(0f, lift).dp)) { WaterLine(s, shown, R.color.clink_ink_secondary) }
      }
    }
  }
}

/**
 * Small (DESIGN.md 5.3), 100 x 100 dp of content at the smallest:
 *   3 | drinks ◦ 4
 *     | Last 12:54
 *   [   +1 Drink   ]
 * The numeral grows with the height it is given. The tall 2x2 adds the usual #1 (its picture and
 * name) above the button. Drop order: usual #1, then the last-drink line (the water count moves
 * under "drinks"), then the word "drinks". With no drink today there is no last-drink line.
 */
@Composable
private fun IdleSmall(model: WidgetModel, s: Scale, c: Content.Idle, area: Area) {
  val context = LocalContext.current
  val t = c.tracker
  val num = t.drinksNum.ifEmpty { "0" }
  val fs = s.m.fontScale
  val base = NUMERAL * s.m.textScale
  val waterNum = t.waterNum.ifEmpty { t.waterText }
  val lastOpt = t.lastOptions.firstOrNull()
  val firstLineW = s.w(t.drinksWord, SECONDARY) + 6f + waterLineWidth(s, waterNum)
  class Col(val numSize: Float, val last: String?, val wordFits: Boolean)
  // The column beside the numeral, for a numeral of `numSize`: both lines when they fit beside it.
  fun col(numSize: Float): Col {
    val numW = TextFit.width(num, numSize * fs, TextFit.Face.NUMERAL)
    val colW = area.w - numW - 4f
    val twoLines = s.h(SECONDARY, 2) <= countHeight(s, numSize) + 4f
    val last = if (lastOpt != null && twoLines && firstLineW <= colW && s.w(lastOpt, SECONDARY, TextFit.Face.REGULAR) <= colW) lastOpt else null
    val wordFits = s.w(t.drinksWord, SECONDARY) <= colW && (last != null || twoLines)
    return Col(numSize, last, wordFits)
  }
  // Usual #1 on the tall 2x2: the picture and the name beside it (one or two lines, 13 then 12),
  // the picture as large as the room allows (up to 1.5x its drawn size).
  val u = c.usual
  val baseH = countHeight(s, minOf(base, (area.h - BUTTON_DP - 4f) / (1.18f * fs)))
  val rowRoom = area.h - baseH - BUTTON_DP - 8f
  class UsualPlan(val art: Pair<Float, Float>, val size: Float, val lines: Int) {
    val height get() = maxOf(art.second, 0f)
  }
  val usual: UsualPlan? =
    u?.takeIf { model.layout == Layout.SMALL_TALL && !s.m.compactText }?.let {
      listOf(SECONDARY, NAME).flatMap { size -> listOf(1, 2).map { size to it } }.mapNotNull { (size, lines) ->
        if (s.h(size, lines) > rowRoom) return@mapNotNull null
        val nameW = if (lines == 1) s.w(it.text, size) else it.text.split(' ').maxOf { word -> s.w(word, size) }
        if (s.lines(it.text, size, nameW) > lines) return@mapNotNull null
        val art = ArtAspect.box(context, it.art, area.w - nameW - 6f, rowRoom)
        UsualPlan(art, size, lines).takeIf { art.second >= 20f }
      }.maxByOrNull { p -> p.art.first * p.art.second }
    }
  val usualH = usual?.let { maxOf(it.height, s.h(it.size, it.lines)) + 4f } ?: 0f
  // The numeral takes what the button and the usual #1 leave (never a dead gap), then shrinks
  // until the column beside it keeps its lines.
  val byH = ((area.h - BUTTON_DP - 4f - usualH) / (1.18f * fs)).coerceAtMost(NUMERAL_MAX_DP / fs)
  val floor = minOf(base, byH).coerceAtLeast(24f / fs)
  val want = col(floor)
  var plan = want
  var size = byH
  while (size > floor) {
    val p = col(size)
    if ((p.last != null) == (want.last != null) && p.wordFits == want.wordFits) {
      plan = p
      break
    }
    size -= 1f
  }
  val numSize = plan.numSize
  val last = plan.last
  // The column's last line sits on the numeral's baseline.
  val lift = TextFit.belowBaseline(numSize * fs, TextFit.Face.NUMERAL, false) - 0.01f * numSize * fs - TextFit.belowBaseline(s.dp(SECONDARY), TextFit.Face.MEDIUM, true)
  Column(modifier = GlanceModifier.fillMaxSize()) {
    Row(modifier = GlanceModifier.fillMaxWidth().semantics { contentDescription = t.a11y }, verticalAlignment = Alignment.Bottom) {
      CountLine(s, R.layout.clink_numeral_ink, num, "", numSize, numSize)
      Spacer(GlanceModifier.width(4.dp))
      Column(modifier = GlanceModifier.padding(bottom = maxOf(0f, lift).dp)) {
        if (last != null) {
          Row(verticalAlignment = Alignment.CenterVertically) {
            Text(t.drinksWord, style = s.style(SECONDARY, R.color.clink_ink_primary, FontWeight.Medium), maxLines = 1)
            Spacer(GlanceModifier.width(6.dp))
            WaterLine(s, waterNum)
          }
          Text(last, style = s.style(SECONDARY, R.color.clink_ink_secondary), maxLines = 1)
        } else {
          if (plan.wordFits) Text(t.drinksWord, style = s.style(SECONDARY, R.color.clink_ink_primary, FontWeight.Medium), maxLines = 1)
          WaterLine(s, waterNum)
        }
      }
    }
    if (u != null && usual != null) {
      Spacer(GlanceModifier.defaultWeight())
      Row(verticalAlignment = Alignment.Bottom, modifier = GlanceModifier.fillMaxWidth()) {
        Image(ImageProvider(u.art), contentDescription = null, modifier = GlanceModifier.width(usual.art.first.dp).height(usual.art.second.dp))
        Spacer(GlanceModifier.width(6.dp))
        Text(u.text, style = s.style(usual.size, R.color.clink_ink_primary, FontWeight.Medium), maxLines = usual.lines)
      }
      Spacer(GlanceModifier.height(4.dp))
    } else {
      Spacer(GlanceModifier.defaultWeight())
    }
    ActionRow(s, c.overlay, area.w) {
      PillButton(s, c.log, GlanceModifier.fillMaxWidth().height(BUTTON), context, PRIMARY, pad = 12f, glyph = true, sub = false)
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Idle 4x2: the counts and the drink panel

/** Inner gap on the seam side of each part of the split 4x2. */
private const val SEAM = 10f

/** Inner padding of the drink panel, both sides (round 3: the panel is 40% of the width). */
private const val PANEL_PAD = 10f

/** The drink panel's share of the 4x2 (CEO, 2026-11-17: counts 60%, the usual #1 panel 40%). */
private const val PANEL_SHARE = 0.40f

/** What fits on the 4x2, worked out before composing (DESIGN.md 5.1 drop order). */
private class MediumPlan(val panelW: Float, val label: Float, val pad: Float, val camera: Boolean, val glyph: Boolean, val sub: Boolean, val whoLines: Int = 1)

private fun planMedium(s: Scale, c: Content.Idle, w: Float): MediumPlan {
  val panelW = w * PANEL_SHARE
  val leftInner = w - panelW - PAD - SEAM
  val panelInner = panelW - 2 * PANEL_PAD
  fun plusW(label: Float, pad: Float) = s.w(c.log.label, label) + 2 * pad
  fun whoW(label: Float, pad: Float, glyph: Boolean, lines: Int): Float {
    val g = if (glyph && c.whoJoins.icon != null) 16f + 5f else 0f
    val text = if (lines == 1) s.w(c.whoJoins.label, label) else c.whoJoins.label.split(' ').maxOf { s.w(it, label) }
    return 2 * pad + g + text
  }
  fun sub(label: Float, pad: Float, glyph: Boolean, lines: Int, inner: Float): Boolean {
    val g = if (glyph && c.whoJoins.icon != null) 16f + 5f else 0f
    return lines == 1 && !s.m.compactText && c.whoJoins.subLabel != null &&
      2 * pad + g + s.w(c.whoJoins.subLabel, MICRO) <= inner && s.h(label) + s.h(MICRO) <= BUTTON_DP
  }
  // Each side fits its own share: the counts' buttons in 60%, Who joins? in the 40% panel. The
  // label size is shared so the two pills match. Drop order (DESIGN.md 5.1): the camera (only
  // when the left side has no room for it), labels 15 then 13, the Who joins? glyph, padding,
  // and last the Who joins? label on two lines ("Invite / friends"), so the panel stays 40%.
  val steps =
    listOf(
      Triple(PRIMARY, 12f, true), Triple(PRIMARY, 10f, true), Triple(SECONDARY, 10f, true),
      Triple(SECONDARY, 10f, false), Triple(SECONDARY, 6f, false),
    )
  for (lines in 1..2) {
    for ((label, pad, glyph) in steps) {
      if (lines == 2 && (glyph || pad != 6f || s.lines(c.whoJoins.label, label, panelInner - 2 * pad) > 2 || s.h(label, 2) > BUTTON_DP)) continue
      if (whoW(label, pad, glyph, lines) > panelInner || plusW(label, pad) > leftInner) continue
      val camera = plusW(label, pad) + GAP + BUTTON_DP <= leftInner
      return MediumPlan(panelW, label, pad, camera, glyph, sub(label, pad, glyph, lines, panelInner), lines)
    }
  }
  // Nothing fits at 40% (very large text on the narrowest 4x2): the panel takes what Who joins?
  // needs, so its label is never cut.
  val need = whoW(SECONDARY, 6f, false, 1) + 2 * PANEL_PAD
  return MediumPlan(maxOf(panelW, need).coerceAtMost(w - (PAD + SEAM + plusW(SECONDARY, 6f))), SECONDARY, 6f, false, false, false)
}

/**
 * Medium (DESIGN.md 5.2, round 3). The widget is split edge to edge: the counts on enamel under
 * the cobalt rim (60%), and the drink panel in the usual #1's tint under its own rim (40%),
 * holding the drink over the Who joins? button that sends it. The numeral fills the height the
 * buttons leave, so a taller cell has no gap under the count.
 *   ▀▀▀▀▀ cobalt ▀▀▀▀▀▀▀▀▀▀▀▀▀▀ coffee ink ▀▀▀▀
 *   3 drinks              │   [Flat White art]
 *   ◦ 4 · Last 7:30 AM    │   Flat White
 *   (+1 Drink)  (◉)       │  (☕ Who joins?)
 */
@Composable
private fun IdleMedium(model: WidgetModel, s: Scale, c: Content.Idle, area: Area) {
  val context = LocalContext.current
  val plan = planMedium(s, c, area.w)
  val short = model.layout == Layout.MEDIUM_SHORT
  val gapV = if (short) 6f else 8f
  val topH = area.h - 2 * PAD - BUTTON_DP - gapV
  val leftW = area.w - plan.panelW
  val o = c.overlay
  if (o != null) {
    // Confirmation, Sending and Failed take the whole bottom row (DESIGN.md 5.2), across both
    // parts: the panel stays in place behind it, so nothing jumps for the 4 s it shows.
    Box(modifier = GlanceModifier.fillMaxSize()) {
      Row(modifier = GlanceModifier.fillMaxSize()) {
        Spacer(GlanceModifier.defaultWeight())
        Box(modifier = GlanceModifier.width(plan.panelW.dp).fillMaxHeight().background(ImageProvider(c.panel))) {}
      }
      Column(modifier = GlanceModifier.fillMaxSize().padding(PAD.dp)) {
        Row(modifier = GlanceModifier.fillMaxWidth().height(topH.dp)) {
          Box(modifier = GlanceModifier.width((leftW - PAD + PANEL_PAD).dp).fillMaxHeight()) { Tracker(s, c.tracker, leftW - PAD - SEAM, topH, short) }
          PanelMedia(s, c.media, plan.panelW - 2 * PANEL_PAD, topH, context)
        }
        Spacer(GlanceModifier.defaultWeight())
        ActionRow(s, o, area.w - 2 * PAD) {}
      }
    }
    return
  }
  Row(modifier = GlanceModifier.fillMaxSize()) {
    Column(modifier = GlanceModifier.defaultWeight().fillMaxHeight().padding(start = PAD.dp, top = PAD.dp, end = SEAM.dp, bottom = PAD.dp)) {
      Box(modifier = GlanceModifier.fillMaxWidth().height(topH.dp)) { Tracker(s, c.tracker, leftW - PAD - SEAM, topH, short) }
      Spacer(GlanceModifier.defaultWeight())
      Row(modifier = GlanceModifier.fillMaxWidth().height(BUTTON), verticalAlignment = Alignment.CenterVertically) {
        PillButton(s, c.log, GlanceModifier.defaultWeight().height(BUTTON), context, plan.label, plan.pad, glyph = true, sub = false)
        if (plan.camera) {
          Spacer(GlanceModifier.width(GAP.dp))
          IconButton(c.camera, context)
        }
      }
    }
    Column(
      modifier =
        GlanceModifier.width(plan.panelW.dp).fillMaxHeight()
          .background(ImageProvider(c.panel))
          .padding(start = PANEL_PAD.dp, top = PAD.dp, end = PANEL_PAD.dp, bottom = PAD.dp),
    ) {
      PanelMedia(s, c.media, plan.panelW - 2 * PANEL_PAD, topH, context)
      Spacer(GlanceModifier.defaultWeight())
      PillButton(s, c.whoJoins, GlanceModifier.fillMaxWidth().height(BUTTON), context, plan.label, plan.pad, plan.glyph, plan.sub, plan.whoLines)
    }
  }
}

/**
 * What the drink panel shows above Who joins?, in `w` x `h` dp: a friend's snap today, else the
 * usual #1 (or the herbal tea note), else "Pick your usual 3".
 */
@Composable
private fun PanelMedia(s: Scale, t: MediaTile, w: Float, h: Float, context: Context) {
  val base = GlanceModifier.clickable(tapAction(context, t.tap)).semantics { contentDescription = t.a11y }
  when (t) {
    is MediaTile.Photo -> {
      val bmp = WidgetFiles.thumb(context, t.file)
      // The snap's name label drops before the photo (DESIGN.md 5.1 item 3).
      val caption = h >= 56f && s.w(t.caption, SECONDARY) + 16f <= w
      Box(
        modifier = base.width(w.dp).height(h.dp).cornerRadius(12.dp).background(ImageProvider(R.drawable.clink_bg_tile_sunk)),
        contentAlignment = Alignment.BottomStart,
      ) {
        if (bmp != null) {
          Image(ImageProvider(bmp), contentDescription = null, modifier = GlanceModifier.fillMaxSize(), contentScale = ContentScale.Crop)
        } else {
          // The thumbnail isn't cached yet: the tile keeps its place with the camera glyph.
          Box(modifier = GlanceModifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Image(ImageProvider(R.drawable.clink_ui_camera_ink_secondary), contentDescription = null, modifier = GlanceModifier.size(22.dp))
          }
        }
        if (caption) {
          // On the photo scrim (DESIGN.md 3.6), white, 13 minimum.
          Box(modifier = GlanceModifier.fillMaxSize().background(ImageProvider(R.drawable.clink_bg_scrim)), contentAlignment = Alignment.BottomStart) {
            Text(
              t.caption,
              style = TextStyle(color = ColorProvider(android.R.color.white), fontSize = s.sp(SECONDARY), fontWeight = FontWeight.Medium),
              maxLines = 1,
              modifier = GlanceModifier.padding(horizontal = 8.dp, vertical = 6.dp),
            )
          }
        }
      }
    }
    is MediaTile.Drink -> {
      // The drink is the picture: as large as the panel allows, its name whole under it or beside
      // it, whichever leaves the bigger picture. No room for the name: the picture alone.
      // The name at 15 (it names the anchor of the widget), else 13.
      class Option(val beside: Boolean, val size: Float, val lines: Int, val nameW: Float, val art: Pair<Float, Float>)
      val options = mutableListOf<Option>()
      for (name in listOf(PRIMARY, SECONDARY)) {
        for (lines in 1..2) {
          if (s.lines(t.name, name, w) <= lines) {
            options += Option(false, name, lines, w, ArtAspect.box(context, t.art, w, h - s.h(name, lines) - 2f))
          }
          val nameW = if (lines == 1) s.w(t.name, name) else t.name.split(' ').maxOf { s.w(it, name) }
          if (s.lines(t.name, name, nameW) <= lines && s.h(name, lines) <= h && w - nameW - 6f > 0f) {
            options += Option(true, name, lines, nameW, ArtAspect.box(context, t.art, w - nameW - 6f, h))
          }
        }
        // A bigger picture wins; at equal pictures the bigger name does (sizes are tried 15 first).
        if (options.any { it.art.second >= 36f }) break
      }
      val best = options.filter { it.art.second >= 28f }.maxByOrNull { it.art.first * it.art.second }
      val img = @Composable { a: Pair<Float, Float> ->
        Image(ImageProvider(t.art), contentDescription = null, modifier = GlanceModifier.width(a.first.dp).height(a.second.dp))
      }
      when {
        best == null ->
          Box(modifier = base.width(w.dp).height(h.dp), contentAlignment = Alignment.BottomStart) { img(ArtAspect.box(context, t.art, w, h)) }
        best.beside ->
          Row(modifier = base.width(w.dp).height(h.dp), verticalAlignment = Alignment.Bottom) {
            Text(t.name, style = s.style(best.size, R.color.clink_ink_primary, FontWeight.Medium), maxLines = best.lines, modifier = GlanceModifier.width(best.nameW.dp))
            Spacer(GlanceModifier.defaultWeight())
            img(best.art)
          }
        else ->
          Column(modifier = base.width(w.dp).height(h.dp), verticalAlignment = Alignment.Bottom) {
            img(best.art)
            Spacer(GlanceModifier.height(2.dp))
            Text(t.name, style = s.style(best.size, R.color.clink_ink_primary, FontWeight.Medium), maxLines = best.lines)
          }
      }
    }
    is MediaTile.PickUsual -> {
      val lines = s.lines(t.text, SECONDARY, w)
      val showText = lines <= 2 && s.h(SECONDARY, lines) + 4f + 26f <= h
      Column(modifier = base.width(w.dp).height(h.dp), verticalAlignment = Alignment.Bottom) {
        // The rim mark, the brand's cup: your drinks go here.
        Image(ImageProvider(R.drawable.clink_mark), contentDescription = null, modifier = GlanceModifier.width(38.dp).height(32.dp))
        if (showText) {
          Spacer(GlanceModifier.height(4.dp))
          Text(t.text, style = s.style(SECONDARY, R.color.clink_cobalt, FontWeight.Medium), maxLines = lines)
        }
      }
    }
  }
}

@Composable
private fun PillButton(s: Scale, b: ButtonModel, modifier: GlanceModifier, context: Context, labelSize: Float, pad: Float, glyph: Boolean, sub: Boolean, lines: Int = 1) {
  Row(
    modifier =
      modifier
        .background(ImageProvider(b.background))
        .clickable(tapAction(context, b.tap))
        .semantics { contentDescription = b.a11y }
        .padding(horizontal = pad.dp),
    verticalAlignment = Alignment.CenterVertically,
    horizontalAlignment = Alignment.CenterHorizontally,
  ) {
    if (glyph) {
      b.icon?.let {
        Image(ImageProvider(it), contentDescription = null, modifier = GlanceModifier.size(16.dp))
        Spacer(GlanceModifier.width(5.dp))
      }
    }
    Column(verticalAlignment = Alignment.CenterVertically) {
      Text(b.label, style = s.style(labelSize, b.textColor, FontWeight.Medium, align = if (lines > 1) TextAlign.Center else null), maxLines = lines)
      // The audience line is the first thing to drop (DESIGN.md 5.1 item 1).
      if (sub) b.subLabel?.let { Text(it, style = s.style(MICRO, b.textColor, FontWeight.Medium), maxLines = 1) }
    }
  }
}

@Composable
private fun IconButton(b: ButtonModel, context: Context) {
  Box(
    modifier =
      GlanceModifier.size(BUTTON)
        .background(ImageProvider(b.background))
        .clickable(tapAction(context, b.tap))
        .semantics { contentDescription = b.a11y },
    contentAlignment = Alignment.Center,
  ) {
    b.icon?.let { Image(ImageProvider(it), contentDescription = null, modifier = GlanceModifier.size(22.dp)) }
  }
}

/** Confirmation, Sending and Failed replace the action row in place (DESIGN.md 5.2), `w` dp wide. */
@Composable
private fun ActionRow(s: Scale, overlay: OverlayModel?, w: Float, actions: @Composable () -> Unit) {
  val context = LocalContext.current
  val small = w < 140f
  if (overlay == null) {
    actions()
    return
  }
  val tap = (overlay as? OverlayModel.Failed)?.let { tapAction(context, Tap.Retry(it.opId)) }
  val padH = if (small) 10f else 14f
  val hasArt = overlay is OverlayModel.Confirm && overlay.art != null
  Row(
    modifier =
      GlanceModifier.fillMaxWidth()
        .height(BUTTON)
        // The +1 Drink pill turns into the confirmation: same cobalt tint, ink text and a check.
        .background(ImageProvider(R.drawable.clink_bg_pill_cobalt_tint))
        .let { m -> tap?.let { m.clickable(it) } ?: m }
        .semantics { contentDescription = overlay.a11y }
        .padding(start = padH.dp, end = (if (hasArt) 8f else padH).dp),
    verticalAlignment = Alignment.CenterVertically,
  ) {
    when (overlay) {
      is OverlayModel.Confirm -> {
        val inner = w - padH - (if (hasArt) 8f else padH)
        // 15 with the check, 13 with the check, 13 alone: the word never gets cut.
        val (main, check) =
          listOf(PRIMARY to true, SECONDARY to true, SECONDARY to false).firstOrNull { (sz, ck) -> (if (ck) 24f else 0f) + s.w(overlay.text, sz) <= inner }
            ?: (SECONDARY to false)
        val textW = (if (check) 24f else 0f) + s.w(overlay.text, main)
        // The logged drink's picture at the end, then its name, each only if it fits whole.
        val artBox = if (hasArt && textW + 6f + 24f <= inner) minOf(36f, inner - textW - 6f) else 0f
        val art = overlay.art?.takeIf { artBox > 0f }
        val artW = art?.let { ArtAspect.box(context, it, artBox, 34f).first } ?: 0f
        val room = inner - textW - (if (art != null) artW + 6f else 0f) - 6f
        if (check) {
          Image(ImageProvider(R.drawable.clink_ui_check), contentDescription = null, modifier = GlanceModifier.size(18.dp))
          Spacer(GlanceModifier.width(6.dp))
        }
        Text(overlay.text, style = s.style(main, R.color.clink_ink_primary, FontWeight.Medium), maxLines = 1)
        overlay.detail?.takeIf { s.w(it, SECONDARY, TextFit.Face.REGULAR) <= room }?.let {
          Spacer(GlanceModifier.width(6.dp))
          Text(it, style = s.style(SECONDARY, R.color.clink_ink_secondary), maxLines = 1)
        }
        if (art != null) {
          Spacer(GlanceModifier.defaultWeight())
          Art(art, artBox, 34f)
        }
      }
      is OverlayModel.Sending -> {
        Image(ImageProvider(R.drawable.clink_ui_clock_ink_secondary), contentDescription = null, modifier = GlanceModifier.size(18.dp))
        Spacer(GlanceModifier.width(6.dp))
        Text(overlay.text, style = s.style(SECONDARY, R.color.clink_ink_secondary, FontWeight.Medium), maxLines = 1)
      }
      is OverlayModel.Failed -> {
        val lines = s.lines(overlay.text, SECONDARY, w - 2 * padH).coerceAtMost(2)
        Text(overlay.text, style = s.style(SECONDARY, R.color.clink_danger, FontWeight.Medium), maxLines = lines)
      }
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Pickers

private const val CELL_PAD = 3f

/** How the cells of a picker are drawn, decided once so every cell matches. */
private data class CellPlan(val artW: Float, val artH: Float, val nameSize: Float, val nameLines: Int, val beside: Boolean = false, val nameW: Float = 0f)

/**
 * The biggest picture box that leaves room for every name whole (up to 2 lines, 13 then 12 sp):
 * the name under the picture, or beside it in a wide, low cell. If no name fits, names go and the
 * pictures grow: a name is dropped, never cut (DESIGN.md 5.1); the cell keeps its spoken label.
 */
private fun planCells(s: Scale, labels: List<String>, cellW: Float, cellH: Float): CellPlan {
  val innerW = cellW - 2 * CELL_PAD
  val innerH = cellH - 2 * CELL_PAD
  // A name tells two look-alike cups apart (review item 4): names are tried with a 28 dp picture
  // first (13, 12, 11), then with a picture down to 22 dp before they give way.
  for (minArt in listOf(28f, 22f)) {
    for (size in listOf(SECONDARY, NAME, MICRO)) {
      val lines = labels.maxOf { s.lines(it, size, innerW) }
      if (lines > 2) continue
      val artH = minOf(64f, innerH - s.h(size, lines) - 2f)
      if (artH >= minArt) return CellPlan(innerW, artH, size, lines)
    }
  }
  for (size in listOf(SECONDARY, NAME, MICRO)) {
    val nameW = labels.maxOf { l -> l.split(' ').maxOf { s.w(it, size) } }
    val lines = labels.maxOf { s.lines(it, size, nameW) }
    val artW = innerW - nameW - 4f
    if (lines <= 2 && s.h(size, lines) <= innerH && artW >= 28f && innerH >= 28f) return CellPlan(artW, innerH, size, lines, beside = true, nameW = nameW)
  }
  return CellPlan(innerW, minOf(64f, innerH), NAME, 0)
}

@Composable
private fun Cell(s: Scale, cell: PickerCell, plan: CellPlan, w: Float, h: Float, context: Context) {
  val modifier =
    GlanceModifier.width(w.dp).height(h.dp)
      .background(ImageProvider(cell.background))
      .clickable(tapAction(context, cell.tap))
      .semantics { contentDescription = cell.a11y }
      .padding(CELL_PAD.dp)
  if (plan.beside) {
    Row(modifier = modifier, verticalAlignment = Alignment.CenterVertically, horizontalAlignment = Alignment.CenterHorizontally) {
      Art(cell.art, plan.artW, plan.artH)
      Spacer(GlanceModifier.width(4.dp))
      Text(cell.label, style = s.style(plan.nameSize, R.color.clink_ink_primary, FontWeight.Medium), maxLines = plan.nameLines, modifier = GlanceModifier.width(plan.nameW.dp))
    }
    return
  }
  Column(modifier = modifier, verticalAlignment = Alignment.CenterVertically, horizontalAlignment = Alignment.CenterHorizontally) {
    // Every picture stands on the same line, so the names line up across the cells.
    Box(modifier = GlanceModifier.width(plan.artW.dp).height(plan.artH.dp), contentAlignment = Alignment.BottomCenter) { Art(cell.art, plan.artW, plan.artH) }
    if (plan.nameLines > 0) {
      Spacer(GlanceModifier.height(2.dp))
      Text(cell.label, style = s.style(plan.nameSize, R.color.clink_ink_primary, FontWeight.Medium, align = TextAlign.Center), maxLines = plan.nameLines)
    }
  }
}

@Composable
private fun Grid(s: Scale, cells: List<PickerCell>, cols: Int, w: Float, h: Float, context: Context) {
  val rows = cells.chunked(cols)
  val gap = 4f
  val cellW = (w - gap * (cols - 1)) / cols
  val cellH = (h - gap * (rows.size - 1)) / rows.size
  val box = planCells(s, cells.map { it.label }, cellW, cellH)
  // Every picture is drawn at the same height (review item 11): each is cropped to what is drawn,
  // so a narrow glass would otherwise stand twice as tall as a wide cup beside it.
  val common = cells.minOf { ArtAspect.box(context, it.art, box.artW, box.artH).second }
  val plan = box.copy(artH = common)
  Column {
    rows.forEachIndexed { r, row ->
      if (r > 0) Spacer(GlanceModifier.height(gap.dp))
      Row {
        row.forEachIndexed { i, cell ->
          if (i > 0) Spacer(GlanceModifier.width(gap.dp))
          Cell(s, cell, plan, cellW, cellH, context)
        }
      }
    }
  }
}

@Composable
private fun CloseButton(closeA11y: String, context: Context) {
  Box(
    modifier = GlanceModifier.size(BUTTON).clickable(tapAction(context, Tap.ClosePicker)).semantics { contentDescription = closeA11y },
    contentAlignment = Alignment.Center,
  ) {
    Image(ImageProvider(R.drawable.clink_ui_close), contentDescription = null, modifier = GlanceModifier.size(22.dp))
  }
}

/**
 * The +1 picker (DESIGN.md 5.2, 5.3, polish pass): usual 1 to 3 and Water in a 2 x 2 grid, each
 * cell on its drink's tint with the drink's picture as large as the cell allows and its name
 * whole. The 4x2 at 300 dp and up keeps a ✕ column at the right; everywhere a tap beside the
 * cells closes it, and so does the 30 s timeout.
 */
@Composable
private fun LogPicker(model: WidgetModel, s: Scale, c: Content.Picker, area: Area) {
  val context = LocalContext.current
  if (c.overlay != null) {
    Column(modifier = GlanceModifier.fillMaxSize(), verticalAlignment = Alignment.Bottom) { ActionRow(s, c.overlay, area.w) {} }
    return
  }
  // Every 4x2 has a 48 dp ✕ at the right (review item 6; DESIGN.md 5.1: 48 dp on Android). The
  // 2x2 has no room for it: a tap beside the cells and the 30 s timeout close it (DESIGN.md 5.3).
  val close = !model.layout.small
  val gridW = area.w - if (close) BUTTON_DP + 4f else 0f
  Row(modifier = GlanceModifier.fillMaxSize()) {
    Grid(s, c.cells, 2, gridW, area.h, context)
    if (close) {
      Spacer(GlanceModifier.width(4.dp))
      CloseButton(c.closeA11y, context)
    }
  }
}

/** Bring me one (M4 sends from here): the title, ✕, and the usual 3 on raised cells. */
@Composable
private fun BringPicker(model: WidgetModel, s: Scale, c: Content.BringPicker, area: Area) {
  val context = LocalContext.current
  Column(modifier = GlanceModifier.fillMaxSize()) {
    Row(modifier = GlanceModifier.fillMaxWidth().height(BUTTON), verticalAlignment = Alignment.CenterVertically) {
      Text(c.title, style = s.style(PRIMARY, R.color.clink_ink_primary, FontWeight.Medium), maxLines = 1, modifier = GlanceModifier.defaultWeight())
      CloseButton(c.closeA11y, context)
    }
    if (c.overlay != null) {
      Spacer(GlanceModifier.defaultWeight())
      ActionRow(s, c.overlay, area.w) {}
    } else {
      Grid(s, c.cells, if (model.layout.small) 2 else c.cells.size.coerceAtLeast(1), area.w, area.h - BUTTON_DP, context)
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Flares (rendered from the state; their buttons arrive with M4)

private fun numeralLayoutFor(textColor: Int): Int =
  when (textColor) {
    R.color.clink_coffee_on_solid -> R.layout.clink_numeral_on_solid_coffee
    R.color.clink_matcha_on_solid -> R.layout.clink_numeral_on_solid_matcha
    R.color.clink_tea_on_solid -> R.layout.clink_numeral_on_solid_tea
    else -> R.layout.clink_numeral_on_solid_smoothie_juice
  }

/** The title of a flare: glyph and text at 15, then 13, then without the glyph, then on two lines. */
private class TitlePlan(val size: Float, val glyph: Boolean, val lines: Int) {
  fun height(s: Scale) = maxOf(if (glyph) 18f else 0f, s.h(size, lines))
}

private fun planTitle(s: Scale, text: String, w: Float, sizes: List<Float> = listOf(PRIMARY, SECONDARY)): TitlePlan {
  for (size in sizes) if (22f + s.w(text, size) <= w) return TitlePlan(size, true, 1)
  for (size in sizes) if (s.w(text, size) <= w) return TitlePlan(size, false, 1)
  return TitlePlan(sizes.last(), false, s.lines(text, sizes.last(), w).coerceIn(1, 2))
}

@Composable
private fun FlareTitle(s: Scale, glyph: Int, text: String, color: Int, p: TitlePlan) {
  Row(verticalAlignment = Alignment.CenterVertically) {
    if (p.glyph) {
      Image(ImageProvider(glyph), contentDescription = null, modifier = GlanceModifier.size(18.dp))
      Spacer(GlanceModifier.width(4.dp))
    }
    Text(text, style = s.style(p.size, color, FontWeight.Medium), maxLines = p.lines)
  }
}

/**
 * The countdown of your live flare, in `w` x `h` dp: the minutes as a numeral with "min left"
 * (then "min") beside it on its baseline, like the drinks count (round 3: minutes, never a clock
 * time). In the last minute: "Under a minute left" in words.
 */
@Composable
private fun FlareCountdown(s: Scale, c: Content.MyFlare, w: Float, h: Float) {
  val num = c.leftNum
  if (num == null) {
    val text = c.leftWords.firstOrNull { s.w(it, PRIMARY) <= w } ?: c.leftWords.last()
    Text(text, style = s.style(PRIMARY, c.textColor, FontWeight.Medium), maxLines = s.lines(text, PRIMARY, w).coerceIn(1, 2))
    return
  }
  // Like the drinks count: the numeral fills the height it is given, the words stay beside it.
  val p = c.leftWords.map { planCount(s, num, it, w, h) }.firstOrNull { it.word.isNotEmpty() } ?: planCount(s, num, "", w, h)
  CountLine(s, numeralLayoutFor(c.textColor), num, p.word, p.numSize, p.wordSize)
}

/**
 * Your live flare (DESIGN.md 5.2, 5.3): category solid, title, place, the countdown in numeral.l
 * ("14 min left"), reply chips, the hero. The countdown shrinks before anything goes; then the
 * place line, then the hero (small), then chips (their count joins "+N more").
 */
@Composable
private fun MyFlare(model: WidgetModel, s: Scale, c: Content.MyFlare, area: Area) {
  val small = model.layout.small
  val fs = s.m.fontScale
  if (small) {
    val title = planTitle(s, c.title, area.w)
    // "No replies yet" wraps rather than being cut at the largest text sizes; the numeral gives
    // way to it.
    val oneLine = s.w(c.counts, SECONDARY) <= area.w
    val countsLines = if (oneLine) 1 else s.lines(c.counts, SECONDARY, area.w).coerceIn(1, 2)
    val countsH = s.h(SECONDARY, countsLines)
    // The hero sits beside the counts line when it fits; the countdown fills what is left.
    val hero = 48f.takeIf { oneLine && s.w(c.counts, SECONDARY) + 4f + it <= area.w && area.h - title.height(s) - it - 2f >= countHeight(s, 18f / fs) }
    val numH = area.h - title.height(s) - maxOf(countsH, hero ?: 0f) - 4f
    Column(modifier = GlanceModifier.fillMaxSize().semantics { contentDescription = c.a11y }) {
      FlareTitle(s, c.glyph, c.title, c.textColor, title)
      FlareCountdown(s, c, area.w, numH)
      Spacer(GlanceModifier.defaultWeight())
      Row(modifier = GlanceModifier.fillMaxWidth(), verticalAlignment = Alignment.Bottom) {
        Text(c.counts, style = s.style(SECONDARY, c.textColor), maxLines = countsLines, modifier = GlanceModifier.defaultWeight())
        hero?.let { Image(ImageProvider(c.hero), contentDescription = null, modifier = GlanceModifier.size(it.dp)) }
      }
    }
    return
  }
  val chipsH = 26f
  val heroSize = minOf(if (model.layout.wide) 96f else 64f, area.h - chipsH - 4f)
  val textW = area.w - heroSize - 8f
  val title = planTitle(s, c.title, textW)
  val placeH = s.h(SECONDARY)
  val roomForNum = area.h - title.height(s) - chipsH - 4f
  val showPlace = c.place != null && !s.m.compactText && s.w(c.place, SECONDARY, TextFit.Face.REGULAR) <= textW && roomForNum - placeH >= countHeight(s, 24f / fs)
  val numH = roomForNum - (if (showPlace) placeH else 0f)
  // Chips that fit whole, left to right; the rest are counted in "+N more".
  val chipW = c.chips.map { 20f + s.w(it.text, SECONDARY) }
  var shown = c.chips.size
  fun rowW(n: Int) = chipW.take(n).sum() + 6f * n + (c.moreByShown[n]?.let { s.w(it, SECONDARY) } ?: 0f)
  while (shown > 0 && rowW(shown) > area.w) shown--
  val more = c.moreByShown[shown]?.takeIf { rowW(shown) <= area.w }
  val none = c.noneText?.takeIf { s.w(it, SECONDARY, TextFit.Face.REGULAR) <= area.w }
  Column(modifier = GlanceModifier.fillMaxSize().semantics { contentDescription = c.a11y }) {
    Row(modifier = GlanceModifier.fillMaxWidth().defaultWeight()) {
      Column(modifier = GlanceModifier.defaultWeight()) {
        FlareTitle(s, c.glyph, c.title, c.textColor, title)
        if (showPlace && c.place != null) Text(c.place, style = s.style(SECONDARY, c.textColor), maxLines = 1)
        FlareCountdown(s, c, textW, numH)
      }
      Spacer(GlanceModifier.width(8.dp))
      Image(ImageProvider(c.hero), contentDescription = null, modifier = GlanceModifier.size(heroSize.dp))
    }
    Spacer(GlanceModifier.height(4.dp))
    Row(modifier = GlanceModifier.height(chipsH.dp), verticalAlignment = Alignment.CenterVertically) {
      none?.let { Text(it, style = s.style(SECONDARY, c.textColor), maxLines = 1) }
      c.chips.take(shown).forEach { chip ->
        Box(modifier = GlanceModifier.background(ImageProvider(c.chipBackground)).padding(horizontal = 10.dp, vertical = 4.dp)) {
          Text(chip.text, style = s.style(SECONDARY, R.color.clink_ink_primary, FontWeight.Medium), maxLines = 1)
        }
        Spacer(GlanceModifier.width(6.dp))
      }
      more?.let { Text(it, style = s.style(SECONDARY, c.textColor, FontWeight.Medium), maxLines = 1) }
    }
  }
}

/** The friend's avatar: their initial on the sunk circle (DESIGN.md 2.3 rule 6). */
@Composable
private fun Avatar(s: Scale, initial: String) {
  Box(modifier = GlanceModifier.size(20.dp).background(ImageProvider(R.drawable.clink_bg_avatar)), contentAlignment = Alignment.Center) {
    Text(initial, style = s.style(MICRO, R.color.clink_ink_primary, FontWeight.Bold), maxLines = 1)
  }
}

@Composable
private fun MoreBadge(s: Scale, more: String, a11y: String?) {
  Box(modifier = GlanceModifier.background(ImageProvider(R.drawable.clink_bg_pill_ink)).padding(horizontal = 6.dp, vertical = 1.dp).semantics { contentDescription = a11y ?: more }) {
    Text(more, style = s.style(MICRO, R.color.clink_surface_base, FontWeight.Bold), maxLines = 1)
  }
}

private fun badgeWidth(s: Scale, more: String?) = more?.let { 6f + 12f + s.w(it, MICRO) } ?: 0f

/**
 * A friend's flare (DESIGN.md 5.2, 5.3). Who and the countdown on the first line, what on the
 * second, where and when on the third (medium), I'm in and Bring me one at the bottom. Lines drop
 * in this order: the meeting place (then the meta line), the avatar, the hero; the countdown moves
 * to its own line rather than go.
 */
@Composable
private fun Incoming(model: WidgetModel, s: Scale, c: Content.Incoming, area: Area) {
  val context = LocalContext.current
  val small = model.layout.small
  val badgeW = badgeWidth(s, c.more)
  val headH = maxOf(20f, s.h(SECONDARY))
  val timerLineH = s.h(SECONDARY)
  // The 2x2 keeps its text 2 dp above the button, so at the largest text the drink stays (review item 8).
  val bottom = BUTTON_DP + if (small) 2f else 6f
  val titleSize = if (model.layout.wide) 17f else PRIMARY
  class Plan(val heroSize: Float, val headText: String, val avatar: Boolean, val timerInHead: String?, val what: Triple<String, Float, Int>?, val meta: String?, val timerSize: Float = SECONDARY)
  fun plan(headText: String, hero: Boolean): Plan {
    // 72 dp (DESIGN.md 3.6) where the cell is wide or tall enough; 56 on the smallest 4x2.
    val heroSize = if (small || !hero) 0f else minOf(if (model.layout.wide || area.h >= 150f) 72f else 56f, area.h - BUTTON_DP - 8f).takeIf { it >= 40f } ?: 0f
    val textW = area.w - (if (heroSize > 0f) heroSize + 8f else 0f)
    val nameW = s.w(headText, SECONDARY)
    // First line: who, then the countdown at the end. Tried in order: avatar and "13 min left", no
    // avatar and "13 min left", avatar and "13 min", no avatar and "13 min"; else the countdown
    // gets its own line. The countdown never goes, and always says "min" (DESIGN.md 5.1).
    // On the 2x2 at large text, the countdown can go down to 11 to stay beside the name, so the
    // drink keeps its line (review item 8).
    val timerSizes = if (small) listOf(SECONDARY, MICRO) else listOf(SECONDARY)
    var timerSize = SECONDARY
    val head =
      timerSizes.firstNotNullOfOrNull { size ->
        c.leftOptions.flatMap { listOf(true to it, false to it) }.firstOrNull { (av, text) ->
          (if (av) 26f else 0f) + nameW + badgeW + 8f + s.w(text, size, TextFit.Face.REGULAR) <= textW
        }?.also { timerSize = size }
      }
    val avatar = head?.first ?: (26f + nameW + badgeW <= textW)
    val timerInHead = head?.second
    var room = area.h - bottom - headH - (if (timerInHead == null) timerLineH else 0f)
    // Second line: what. Small: "Matcha · in 10 min", then "Matcha"; medium: "Maya wants matcha"
    // on 1 or 2 lines (not again when it already is the first line).
    val what: Triple<String, Float, Int>? =
      if (small) {
        listOf(PRIMARY, SECONDARY).firstNotNullOfOrNull { sz -> c.subOptions.firstOrNull { s.w(it, sz) <= textW && s.h(sz) <= room }?.let { Triple(it, sz, 1) } }
      } else if (headText == c.title) {
        null
      } else {
        listOf(titleSize, PRIMARY, SECONDARY).distinct().firstNotNullOfOrNull { sz ->
          s.lines(c.title, sz, textW).takeIf { it <= 2 && s.h(sz, it) <= room }?.let { Triple(c.title, sz, it) }
        }
      }
    room -= what?.let { s.h(it.second, it.third) } ?: 0f
    val meta = if (small || s.m.compactText) null else c.metaOptions.firstOrNull { s.w(it, SECONDARY, TextFit.Face.REGULAR) <= textW && s.h(SECONDARY) <= room }
    return Plan(heroSize, headText, avatar, timerInHead, what, meta, timerSize)
  }
  // The title never goes: with no room for a second line (short 4x2, large text), "Maya wants
  // matcha" becomes the first line and the hero gives way.
  val p = plan(c.name, hero = true).let { if (!small && it.what == null) plan(c.title, hero = false) else it }
  val heroSize = p.heroSize
  // A tall 2x2 has room under the text: the hero fills it instead of a gap (DESIGN.md 5.3 hero 48).
  val smallHero =
    if (!small) 0f
    else {
      val used = headH + (if (p.timerInHead == null) timerLineH else 0f) + (p.what?.let { s.h(it.second, it.third) } ?: 0f)
      minOf(72f, area.h - bottom - used - 4f).takeIf { it >= 40f } ?: 0f
    }
  val avatar = p.avatar
  val timerInHead = p.timerInHead
  val timerOwn = if (timerInHead == null) c.leftOptions.firstOrNull { s.w(it, SECONDARY, TextFit.Face.REGULAR) <= area.w } ?: c.leftOptions.last() else null
  val what = p.what
  val meta = p.meta
  Column(modifier = GlanceModifier.fillMaxSize()) {
    Row(modifier = GlanceModifier.fillMaxWidth().defaultWeight().semantics { contentDescription = c.a11y }) {
      Column(modifier = GlanceModifier.defaultWeight().fillMaxHeight()) {
        Row(modifier = GlanceModifier.fillMaxWidth().height(headH.dp), verticalAlignment = Alignment.CenterVertically) {
          if (avatar) {
            Avatar(s, c.initial)
            Spacer(GlanceModifier.width(6.dp))
          }
          Text(p.headText, style = s.style(SECONDARY, R.color.clink_ink_primary, FontWeight.Medium), maxLines = 1)
          c.more?.let {
            Spacer(GlanceModifier.width(6.dp))
            MoreBadge(s, it, c.moreA11y)
          }
          if (timerInHead != null) {
            Spacer(GlanceModifier.defaultWeight())
            Text(timerInHead, style = s.style(p.timerSize, R.color.clink_ink_secondary), maxLines = 1)
          }
        }
        timerOwn?.let { Text(it, style = s.style(SECONDARY, R.color.clink_ink_secondary), maxLines = 1) }
        what?.let { (text, size, lines) -> Text(text, style = s.style(size, R.color.clink_ink_primary, FontWeight.Medium), maxLines = lines) }
        meta?.let { Text(it, style = s.style(SECONDARY, R.color.clink_ink_secondary), maxLines = 1) }
        if (smallHero > 0f) {
          Spacer(GlanceModifier.defaultWeight())
          Row(modifier = GlanceModifier.fillMaxWidth(), horizontalAlignment = Alignment.End) {
            Image(ImageProvider(c.hero), contentDescription = null, modifier = GlanceModifier.size(smallHero.dp))
          }
        }
      }
      if (heroSize > 0f) {
        Spacer(GlanceModifier.width(8.dp))
        Image(ImageProvider(c.hero), contentDescription = null, modifier = GlanceModifier.size(heroSize.dp))
      }
    }
    Spacer(GlanceModifier.height((if (small) 2f else 6f).dp))
    ActionRow(s, c.overlay, area.w) {
      if (c.replied != null) {
        Row(
          modifier = GlanceModifier.fillMaxWidth().height(BUTTON).background(ImageProvider(R.drawable.clink_bg_pill_raised)).semantics { contentDescription = c.repliedA11y ?: c.replied }.padding(horizontal = if (small) 10.dp else 14.dp),
          verticalAlignment = Alignment.CenterVertically,
        ) {
          // The label at 15 or 13 with the check; at large text the check gives way, then two lines.
          val padW = 2 * (if (small) 10f else 14f)
          val checkW = (if (small) 14f else 18f) + 6f
          val sizes = listOf(if (small) SECONDARY else PRIMARY, SECONDARY)
          val withCheck = sizes.firstOrNull { checkW + s.w(c.replied, it) <= area.w - padW }
          val size = withCheck ?: SECONDARY
          val lines = if (withCheck != null || s.w(c.replied, size) <= area.w - padW) 1 else s.lines(c.replied, size, area.w - padW).coerceIn(1, 2)
          if (withCheck != null) {
            Image(ImageProvider(R.drawable.clink_ui_check), contentDescription = null, modifier = GlanceModifier.size(if (small) 14.dp else 18.dp))
            Spacer(GlanceModifier.width(6.dp))
          }
          Text(c.replied, style = s.style(size, R.color.clink_ink_primary, FontWeight.Medium), maxLines = lines)
        }
      } else {
        // Equal halves when both labels fit; otherwise each button is as wide as its label needs.
        val join = c.join
        val bring = c.bring
        val sizes = listOf(if (model.layout.wide) PRIMARY else SECONDARY, SECONDARY)
        val half = (area.w - 8f) / 2
        val label = sizes.firstOrNull { sz -> listOfNotNull(join, bring).all { s.w(it.label, sz) + 20f <= (if (bring == null) area.w else half) } }
        Row(modifier = GlanceModifier.fillMaxWidth().height(BUTTON)) {
          if (label != null || bring == null) {
            val sz = label ?: SECONDARY
            join?.let { PillButton(s, it, GlanceModifier.defaultWeight().height(BUTTON), context, sz, 10f, glyph = false, sub = false) }
            bring?.let {
              Spacer(GlanceModifier.width(8.dp))
              PillButton(s, it, GlanceModifier.defaultWeight().height(BUTTON), context, sz, 10f, glyph = false, sub = false)
            }
          } else {
            val joinW = join?.let { s.w(it.label, SECONDARY) + 24f } ?: 0f
            join?.let { PillButton(s, it, GlanceModifier.width(joinW.dp).height(BUTTON), context, SECONDARY, 8f, glyph = false, sub = false) }
            Spacer(GlanceModifier.width(8.dp))
            PillButton(s, bring, GlanceModifier.defaultWeight().height(BUTTON), context, SECONDARY, 8f, glyph = false, sub = false)
          }
        }
      }
    }
  }
}
