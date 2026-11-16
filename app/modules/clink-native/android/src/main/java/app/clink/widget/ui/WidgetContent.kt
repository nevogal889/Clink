package app.clink.widget.ui

import android.content.Context
import android.graphics.Paint
import android.graphics.Typeface
import android.os.SystemClock
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
import java.time.Duration
import java.time.Instant

// Glance layouts for every widget state (DESIGN.md 5, polish pass 2026-11-16). Sizes are the
// DESIGN.md widget scale: numeral.l 34, primary 15, secondary 13, micro 11; buttons 48 dp; 12 dp
// padding. The system sans stands in for Archivo (DESIGN.md 2.4); numerals use the condensed face.
//
// Nothing is ever cut. Every line, label and drink name is measured with the system font at the
// real text size (TextFit) before it is placed: what doesn't fit is removed in the DESIGN.md 5.1
// drop order, never ellipsized. WidgetScreenshotTest walks every rendered TextView to prove it.

/** Wall clock for the Chronometer bases; tests pin it. */
object UiClock {
  @Volatile var elapsedRealtime: () -> Long = { SystemClock.elapsedRealtime() }
}

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

  /** Roboto: 1.33 em for a line with font padding, 1.17 em for each further line. */
  fun height(sizeDp: Float, lines: Int): Float = sizeDp * (1.33f + 1.17f * (lines - 1))

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

@Composable
fun WidgetContent(model: WidgetModel) {
  val context = LocalContext.current
  val s = Scale(model)
  val size = LocalSize.current
  val c = model.content
  // Pickers on the small and short sizes use 8 dp, so their 2 x 2 cells reach 48 dp.
  val pad = if (c is Content.Picker && (model.layout.small || model.layout == Layout.MEDIUM_SHORT)) 8f else PAD
  val area = Area(size.width.value - 2 * pad, size.height.value - 2 * pad)
  val rootLabel = (c as? Content.Picker)?.closeA11y
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
      is Content.MyFlare -> MyFlare(model, s, c)
      is Content.Incoming -> Incoming(model, s, c)
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Signed out and setup: the rim mark, the wordmark and one line. The whole widget opens the app.

@Composable
private fun Prompt(model: WidgetModel, s: Scale, c: Content.Prompt) {
  if (model.layout.small) {
    Column(modifier = GlanceModifier.fillMaxSize().semantics { contentDescription = c.a11y }, verticalAlignment = Alignment.Bottom) {
      Image(ImageProvider(R.drawable.clink_mark), contentDescription = null, modifier = GlanceModifier.width(48.dp).height(40.dp))
      Spacer(GlanceModifier.defaultWeight())
      Text(c.text, style = s.style(PRIMARY, R.color.clink_ink_primary, FontWeight.Medium), maxLines = 2)
    }
    return
  }
  Row(modifier = GlanceModifier.fillMaxSize().semantics { contentDescription = c.a11y }, verticalAlignment = Alignment.CenterVertically) {
    // The mark is 120 x 100 units (rim plus handle).
    Image(ImageProvider(R.drawable.clink_mark), contentDescription = null, modifier = GlanceModifier.width(84.dp).height(70.dp))
    Spacer(GlanceModifier.width(16.dp))
    Column(modifier = GlanceModifier.defaultWeight()) {
      // The wordmark, 24 dp high (viewBox 348 x 146).
      Image(ImageProvider(R.drawable.clink_wordmark), contentDescription = null, modifier = GlanceModifier.width(57.dp).height(24.dp))
      Spacer(GlanceModifier.height(6.dp))
      Text(c.text, style = s.style(PRIMARY, R.color.clink_ink_primary, FontWeight.Medium), maxLines = 2)
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Idle

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
  rv.setTextViewTextSize(R.id.clink_text, TypedValue.COMPLEX_UNIT_SP, numSize)
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
private fun WaterLine(s: Scale, text: String) {
  Row(verticalAlignment = Alignment.CenterVertically) {
    Image(ImageProvider(R.drawable.clink_ui_tumbler_water_ink), contentDescription = null, modifier = GlanceModifier.size(16.dp))
    Spacer(GlanceModifier.width(3.dp))
    Text(text, style = s.style(SECONDARY, R.color.clink_water_ink, FontWeight.Medium), maxLines = 1)
  }
}

private fun waterLineWidth(s: Scale, text: String) = 19f + s.w(text, SECONDARY)

/**
 * Small (DESIGN.md 5.3), 96 x 96 dp of content:
 *   3 | drinks ◦ 4
 *     | Last 7:30
 *   [   +1 Drink   ]
 * The tall 2x2 adds the usual #1 (picture and name) when it fits. Drop order: usual #1, then the
 * last-drink line (the water count moves under "drinks"), then the word "drinks".
 */
@Composable
private fun IdleSmall(model: WidgetModel, s: Scale, c: Content.Idle, area: Area) {
  val context = LocalContext.current
  val t = c.tracker
  val num = t.drinksNum.ifEmpty { "0" }
  val last = t.lastText ?: t.noneText
  // The numeral shrinks (never below 24) so it and the button always fit the height.
  val room = area.h - BUTTON_DP - 4f
  val numSize = minOf(NUMERAL * s.m.textScale, room / (1.18f * s.m.fontScale)).coerceAtLeast(24f / s.m.fontScale)
  val numW = TextFit.width(num, numSize * s.m.fontScale, TextFit.Face.NUMERAL)
  val colW = area.w - numW - 4f
  val waterNum = t.waterNum.ifEmpty { t.waterText }
  val firstLineW = s.w(t.drinksWord, SECONDARY) + 6f + 16f + 2f + s.w(waterNum, SECONDARY)
  val lastFits = s.w(last, SECONDARY, TextFit.Face.REGULAR) <= colW && firstLineW <= colW && s.h(SECONDARY, 2) <= numSize * s.m.fontScale * 1.18f + 4f
  val wordFits = s.w(t.drinksWord, SECONDARY) <= colW
  val u = c.usual
  val usualArt = 28f
  val usualFits =
    u != null && model.layout == Layout.SMALL_TALL &&
      countHeight(s, numSize) + 6f + usualArt + 6f + BUTTON_DP <= area.h &&
      usualArt + 6f + s.w(u.text, SECONDARY) <= area.w
  Column(modifier = GlanceModifier.fillMaxSize()) {
    Row(
      modifier = GlanceModifier.fillMaxWidth().semantics { contentDescription = t.a11y },
      verticalAlignment = Alignment.Bottom,
    ) {
      CountLine(s, R.layout.clink_numeral_ink, num, "", numSize, numSize)
      Spacer(GlanceModifier.width(4.dp))
      Column {
        if (lastFits) {
          Row(verticalAlignment = Alignment.CenterVertically) {
            Text(t.drinksWord, style = s.style(SECONDARY, R.color.clink_ink_primary, FontWeight.Medium), maxLines = 1)
            Spacer(GlanceModifier.width(6.dp))
            WaterLine(s, waterNum)
          }
          Text(last, style = s.style(SECONDARY, R.color.clink_ink_secondary), maxLines = 1)
        } else {
          if (wordFits) Text(t.drinksWord, style = s.style(SECONDARY, R.color.clink_ink_primary, FontWeight.Medium), maxLines = 1)
          WaterLine(s, waterNum)
        }
      }
    }
    if (usualFits && u != null) {
      Spacer(GlanceModifier.height(6.dp))
      Row(verticalAlignment = Alignment.CenterVertically) {
        Image(ImageProvider(u.art), contentDescription = null, modifier = GlanceModifier.size(usualArt.dp))
        Spacer(GlanceModifier.width(6.dp))
        Text(u.text, style = s.style(SECONDARY, R.color.clink_ink_primary, FontWeight.Medium), maxLines = 1)
      }
    }
    Spacer(GlanceModifier.defaultWeight())
    ActionRow(s, c.overlay, area.w) {
      PillButton(s, c.log, GlanceModifier.fillMaxWidth().height(BUTTON), context, PRIMARY, sub = false)
    }
  }
}

/** What fits in the medium action row, worked out before composing (DESIGN.md 5.1 drop order). */
private class ActionPlan(val label: Float, val plusW: Float, val camera: Boolean, val whoW: Float, val sub: Boolean)

private fun planActions(s: Scale, c: Content.Idle, w: Float): ActionPlan {
  fun plan(label: Float, camera: Boolean): ActionPlan? {
    val pad = if (label >= PRIMARY) 14f else 10f
    val plusW = s.w(c.log.label, label) + 2 * pad
    val whoW = w - plusW - GAP - (if (camera) BUTTON_DP + GAP else 0f)
    val glyph = if (c.whoJoins.icon != null) 16f + 5f else 0f
    val whoNeed = 2 * 10f + glyph + s.w(c.whoJoins.label, label)
    if (whoW < whoNeed) return null
    val sub =
      !s.m.compactText && c.whoJoins.subLabel != null &&
        2 * 10f + glyph + s.w(c.whoJoins.subLabel, MICRO) <= whoW && s.h(label) + s.h(MICRO) <= BUTTON_DP
    return ActionPlan(label, plusW, camera, whoW, sub)
  }
  // Labels first get smaller (15 to 13), then the camera goes: its action stays one tap away in the
  // app, which opens on the camera. +1 Drink, Who joins? and their labels never go.
  return plan(PRIMARY, true) ?: plan(SECONDARY, true) ?: plan(PRIMARY, false) ?: plan(SECONDARY, false)
    ?: ActionPlan(SECONDARY, s.w(c.log.label, SECONDARY) + 16f, false, w - s.w(c.log.label, SECONDARY) - 16f - GAP, false)
}

/**
 * Medium (DESIGN.md 5.2, polish pass). Two columns that line up: the counts over +1 Drink and the
 * camera; the drink tile (or a friend's snap) over Who joins?, so the drink a quick flare sends
 * sits right above the button that sends it, in its own colours.
 *   3 drinks            ┌▀▀▀ coffee ink ▀▀▀┐
 *   ◦ 4 waters          │ [Flat White art]  │
 *   Last drink 7:30 AM  │ Flat White        │
 *   (+1 Drink) (◉)      (☕ Who joins?      )
 */
@Composable
private fun IdleMedium(model: WidgetModel, s: Scale, c: Content.Idle, area: Area) {
  val context = LocalContext.current
  val t = c.tracker
  val plan = planActions(s, c, area.w)
  val gapV = if (model.layout == Layout.MEDIUM_SHORT) 6f else 8f
  val topH = area.h - BUTTON_DP - gapV
  val num = t.drinksNum.ifEmpty { "0" }
  val numSize = minOf(NUMERAL * s.m.textScale, topH / (1.18f * s.m.fontScale))
  val countH = countHeight(s, numSize)
  val countW = countWidth(s, num, t.drinksWord, numSize, SECONDARY * s.m.textScale)
  val waterText = t.waterText
  val waterW = waterLineWidth(s, waterText)
  val last = t.lastText ?: t.noneText
  val lastW = s.w(last, SECONDARY, TextFit.Face.REGULAR)
  // Lines from the top: counts, water, last drink. The last-drink line goes first, then water
  // joins the count line, then the word "waters" (the glyph and number stay).
  val lineH = s.h(SECONDARY)
  val showLast = countH + 2 * lineH <= topH + 2f
  val waterOwnLine = countH + lineH <= topH + 2f
  val trackerNeed =
    when {
      waterOwnLine -> maxOf(countW, waterW, if (showLast) lastW else 0f)
      else -> countW + 10f + waterLineWidth(s, t.waterNum.ifEmpty { waterText })
    }
  // The tile lines up with Who joins?; it narrows for the counts, and goes if under 64 dp.
  val tileW = minOf(plan.whoW, area.w - trackerNeed - GAP).let { if (it < minOf(64f, topH)) 0f else it }
  Column(modifier = GlanceModifier.fillMaxSize()) {
    Row(modifier = GlanceModifier.fillMaxWidth().height(topH.dp)) {
      Column(
        modifier = GlanceModifier.defaultWeight().fillMaxHeight().semantics { contentDescription = t.a11y },
        verticalAlignment = Alignment.Top,
      ) {
        if (waterOwnLine) {
          CountLine(s, R.layout.clink_numeral_ink, num, t.drinksWord, numSize, SECONDARY * s.m.textScale)
          Spacer(GlanceModifier.height(2.dp))
          WaterLine(s, waterText)
          if (showLast) Text(last, style = s.style(SECONDARY, R.color.clink_ink_secondary), maxLines = 1)
        } else {
          Row(verticalAlignment = Alignment.Bottom) {
            CountLine(s, R.layout.clink_numeral_ink, num, t.drinksWord, numSize, SECONDARY * s.m.textScale)
            Spacer(GlanceModifier.width(10.dp))
            WaterLine(s, t.waterNum.ifEmpty { waterText })
          }
        }
      }
      if (tileW > 0f) {
        Spacer(GlanceModifier.width(GAP.dp))
        Tile(s, c.media, tileW, topH, context)
      }
    }
    Spacer(GlanceModifier.height(gapV.dp))
    ActionRow(s, c.overlay, area.w) {
      Row(modifier = GlanceModifier.fillMaxWidth().height(BUTTON), verticalAlignment = Alignment.CenterVertically) {
        PillButton(s, c.log, GlanceModifier.width(plan.plusW.dp).height(BUTTON), context, plan.label, sub = false)
        if (plan.camera) {
          Spacer(GlanceModifier.width(GAP.dp))
          IconButton(c.camera, context)
        }
        Spacer(GlanceModifier.width(GAP.dp))
        PillButton(s, c.whoJoins, GlanceModifier.defaultWeight().height(BUTTON), context, plan.label, sub = plan.sub)
      }
    }
  }
}

/** The tile beside the counts: a friend's snap, the usual #1 on its plate, or "Pick your usual 3". */
@Composable
private fun Tile(s: Scale, t: MediaTile, w: Float, h: Float, context: Context) {
  val base = GlanceModifier.width(w.dp).height(h.dp).clickable(tapAction(context, t.tap)).semantics { contentDescription = t.a11y }
  when (t) {
    is MediaTile.Photo -> {
      val bmp = WidgetFiles.thumb(context, t.file)
      // The snap's name label drops before the photo (DESIGN.md 5.1 item 3).
      val caption = h >= 56f && s.w(t.caption, SECONDARY) + 16f <= w
      Box(modifier = base.background(ImageProvider(R.drawable.clink_bg_tile_sunk)), contentAlignment = Alignment.BottomStart) {
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
      // The drink is the picture: as large as the plate allows, with its name whole beside it or
      // under it, whichever leaves the bigger picture. No room for the name: the picture alone.
      val innerW = w - 14f
      val innerH = h - 3f - 10f
      val stacked = s.lines(t.name, SECONDARY, innerW).takeIf { it <= 2 }?.let { n -> n to minOf(72f, innerH - s.h(SECONDARY, n), innerW) }
      val longest = t.name.split(' ').maxOf { s.w(it, SECONDARY) }
      val besideArt = minOf(72f, innerH, innerW - 6f - longest)
      val beside =
        s.lines(t.name, SECONDARY, innerW - 6f - besideArt).takeIf { it <= 3 && s.h(SECONDARY, it) <= innerH }?.let { n -> n to besideArt }
      val best = listOfNotNull(stacked?.let { Triple(false, it.first, it.second) }, beside?.let { Triple(true, it.first, it.second) })
        .filter { it.third >= 32f }
        .maxByOrNull { it.third }
      val tile = base.background(ImageProvider(t.background)).padding(start = 8.dp, end = 6.dp, top = 8.dp, bottom = 5.dp)
      when {
        best == null ->
          Box(modifier = tile, contentAlignment = Alignment.Center) {
            Image(ImageProvider(t.art), contentDescription = null, modifier = GlanceModifier.size(minOf(72f, innerH, innerW).dp))
          }
        best.first ->
          Row(modifier = tile, verticalAlignment = Alignment.Bottom) {
            Text(t.name, style = s.style(SECONDARY, R.color.clink_ink_primary, FontWeight.Medium), maxLines = best.second, modifier = GlanceModifier.defaultWeight())
            Spacer(GlanceModifier.width(6.dp))
            Image(ImageProvider(t.art), contentDescription = null, modifier = GlanceModifier.size(best.third.dp))
          }
        else ->
          Column(modifier = tile, verticalAlignment = Alignment.Bottom) {
            Row(modifier = GlanceModifier.fillMaxWidth().defaultWeight(), verticalAlignment = Alignment.CenterVertically, horizontalAlignment = Alignment.End) {
              Image(ImageProvider(t.art), contentDescription = null, modifier = GlanceModifier.size(best.third.dp))
            }
            Text(t.name, style = s.style(SECONDARY, R.color.clink_ink_primary, FontWeight.Medium), maxLines = best.second)
          }
      }
    }
    is MediaTile.PickUsual -> {
      val lines = s.lines(t.text, SECONDARY, w - 16f)
      Column(
        modifier = base.background(ImageProvider(R.drawable.clink_bg_plate_cobalt)).padding(start = 8.dp, end = 8.dp, top = 8.dp, bottom = 6.dp),
        verticalAlignment = Alignment.Bottom,
      ) {
        Row(modifier = GlanceModifier.fillMaxWidth().defaultWeight(), horizontalAlignment = Alignment.End) {
          Image(ImageProvider(R.drawable.clink_mark), contentDescription = null, modifier = GlanceModifier.width(38.dp).height(32.dp))
        }
        if (lines <= 2 && s.h(SECONDARY, lines) + 32f + 14f <= h) {
          Text(t.text, style = s.style(SECONDARY, R.color.clink_cobalt, FontWeight.Medium), maxLines = lines)
        }
      }
    }
  }
}

@Composable
private fun PillButton(s: Scale, b: ButtonModel, modifier: GlanceModifier, context: Context, labelSize: Float, sub: Boolean) {
  Row(
    modifier =
      modifier
        .background(ImageProvider(b.background))
        .clickable(tapAction(context, b.tap))
        .semantics { contentDescription = b.a11y }
        .padding(horizontal = (if (labelSize >= PRIMARY) 12 else 8).dp),
    verticalAlignment = Alignment.CenterVertically,
    horizontalAlignment = Alignment.CenterHorizontally,
  ) {
    b.icon?.let {
      Image(ImageProvider(it), contentDescription = null, modifier = GlanceModifier.size(16.dp))
      Spacer(GlanceModifier.width(5.dp))
    }
    Column(verticalAlignment = Alignment.CenterVertically) {
      Text(b.label, style = s.style(labelSize, b.textColor, FontWeight.Medium), maxLines = 1)
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

/** Confirmation, Sending and Failed replace the action row in place (DESIGN.md 5.2). */
@Composable
private fun ActionRow(s: Scale, overlay: OverlayModel?, w: Float, actions: @Composable () -> Unit) {
  val context = LocalContext.current
  val small = s.m.layout.small
  if (overlay == null) {
    actions()
    return
  }
  val tap = (overlay as? OverlayModel.Failed)?.let { tapAction(context, Tap.Retry(it.opId)) }
  val padH = if (small) 10f else 14f
  Row(
    modifier =
      GlanceModifier.fillMaxWidth()
        .height(BUTTON)
        .background(ImageProvider(R.drawable.clink_bg_pill_raised))
        .let { m -> tap?.let { m.clickable(it) } ?: m }
        .semantics { contentDescription = overlay.a11y }
        .padding(start = padH.dp, end = (if (overlay is OverlayModel.Confirm && overlay.art != null) 6f else padH).dp),
    verticalAlignment = Alignment.CenterVertically,
  ) {
    when (overlay) {
      is OverlayModel.Confirm -> {
        val main = if (small) SECONDARY else PRIMARY
        val art = overlay.art?.takeIf { !small || s.w(overlay.text, main) + 18f + 36f <= w - 2 * padH }
        Image(ImageProvider(R.drawable.clink_ui_check), contentDescription = null, modifier = GlanceModifier.size(if (small) 16.dp else 18.dp))
        Spacer(GlanceModifier.width(6.dp))
        Text(overlay.text, style = s.style(main, R.color.clink_ink_primary, FontWeight.Medium), maxLines = 1)
        val room = w - padH - 6f - 18f - 6f - s.w(overlay.text, main) - 6f - (if (art != null) 42f else 0f)
        overlay.detail?.takeIf { !small && s.w(it, SECONDARY, TextFit.Face.REGULAR) <= room }?.let {
          Spacer(GlanceModifier.width(6.dp))
          Text(it, style = s.style(SECONDARY, R.color.clink_ink_secondary), maxLines = 1)
        }
        if (art != null) {
          Spacer(GlanceModifier.defaultWeight())
          Image(ImageProvider(art), contentDescription = null, modifier = GlanceModifier.size(36.dp))
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

/** How the cells of a picker are drawn, decided once so every cell matches. */
private class CellPlan(val art: Float, val nameSize: Float, val nameLines: Int)

/**
 * The biggest picture that leaves room for every name whole (up to 2 lines, 12 then 11 sp). If no
 * name size fits, names go and the pictures grow: a name is dropped, never cut (DESIGN.md 5.1).
 */
private fun planCells(s: Scale, labels: List<String>, cellW: Float, cellH: Float): CellPlan {
  val inner = cellW - 8f
  val artMax = 56f
  for (size in listOf(NAME, MICRO)) {
    val lines = labels.maxOf { s.lines(it, size, inner) }
    if (lines > 2) continue
    val art = minOf(artMax, cellH - 10f - s.h(size, lines), inner)
    if (art >= 30f) return CellPlan(art, size, lines)
  }
  return CellPlan(minOf(artMax, cellH - 10f, inner), NAME, 0)
}

@Composable
private fun Cell(s: Scale, cell: PickerCell, plan: CellPlan, w: Float, h: Float, context: Context) {
  Column(
    modifier =
      GlanceModifier.width(w.dp).height(h.dp)
        .background(ImageProvider(cell.background))
        .clickable(tapAction(context, cell.tap))
        .semantics { contentDescription = cell.a11y }
        .padding(horizontal = 4.dp, vertical = 4.dp),
    verticalAlignment = Alignment.CenterVertically,
    horizontalAlignment = Alignment.CenterHorizontally,
  ) {
    Image(ImageProvider(cell.art), contentDescription = null, modifier = GlanceModifier.size(plan.art.dp))
    if (plan.nameLines > 0) {
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
  val plan = planCells(s, cells.map { it.label }, cellW, cellH)
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
 * cell on its drink's tint with the drink's picture large and its name whole. The 4x2 at 300 dp
 * and up keeps a ✕ column at the right; everywhere a tap beside the cells closes it, and so does
 * the 30 s timeout.
 */
@Composable
private fun LogPicker(model: WidgetModel, s: Scale, c: Content.Picker, area: Area) {
  val context = LocalContext.current
  if (c.overlay != null) {
    Column(modifier = GlanceModifier.fillMaxSize(), verticalAlignment = Alignment.Bottom) { ActionRow(s, c.overlay, area.w) {} }
    return
  }
  val close = model.layout.wide
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

/** A ticking Chronometer through RemoteViews (ARCHITECTURE.md 3.3 Android item 5): flare countdowns. */
@Composable
private fun Chrono(layout: Int, sizeSp: Float, format: String, at: Instant, countDown: Boolean) {
  val context = LocalContext.current
  val rv = RemoteViews(context.packageName, layout)
  val nowWall = Instant.now(app.clink.widget.WidgetEnv.clock)
  val offset = Duration.between(nowWall, at).toMillis()
  // Up: base is the event in the elapsed-realtime clock. Down: base is the end time.
  rv.setChronometer(R.id.clink_chrono, UiClock.elapsedRealtime() + offset, format, true)
  rv.setChronometerCountDown(R.id.clink_chrono, countDown)
  rv.setTextViewTextSize(R.id.clink_chrono, TypedValue.COMPLEX_UNIT_SP, sizeSp)
  AndroidRemoteViews(rv, GlanceModifier.wrapContentWidth().height((sizeSp * fontScaleOf(context) * 1.25f).dp))
}

private fun fontScaleOf(context: Context) = context.resources.configuration.fontScale

// ---------------------------------------------------------------------------------------------
// Flares (rendered from the state; their buttons arrive with M4)


private fun chronoLayoutFor(textColor: Int): Int =
  when (textColor) {
    R.color.clink_coffee_on_solid -> R.layout.clink_chrono_on_solid_coffee
    R.color.clink_matcha_on_solid -> R.layout.clink_chrono_on_solid_matcha
    R.color.clink_tea_on_solid -> R.layout.clink_chrono_on_solid_tea
    else -> R.layout.clink_chrono_on_solid_smoothie_juice
  }

@Composable
private fun MyFlare(model: WidgetModel, s: Scale, c: Content.MyFlare) {
  val small = model.layout.small
  Column(modifier = GlanceModifier.fillMaxSize().semantics { contentDescription = c.a11y }) {
    Row(modifier = GlanceModifier.fillMaxWidth().defaultWeight()) {
      Column(modifier = GlanceModifier.defaultWeight()) {
        Row(verticalAlignment = Alignment.CenterVertically) {
          Image(ImageProvider(c.glyph), contentDescription = null, modifier = GlanceModifier.size(18.dp))
          Spacer(GlanceModifier.width(4.dp))
          Text(c.title, style = s.style(PRIMARY, c.textColor, FontWeight.Medium), maxLines = 1)
        }
        if (!small && c.place != null) Text(c.place, style = s.style(SECONDARY, c.textColor), maxLines = 1)
        Chrono(chronoLayoutFor(c.textColor), NUMERAL * s.m.textScale, "%s", c.expiresAt, countDown = true)
        if (small) {
          // Small (DESIGN.md 5.3): counts, then the hero at the bottom right.
          Row(modifier = GlanceModifier.fillMaxWidth(), verticalAlignment = Alignment.Bottom) {
            Text(c.counts, style = s.style(SECONDARY, c.textColor), maxLines = 1, modifier = GlanceModifier.defaultWeight())
            Image(ImageProvider(c.hero), contentDescription = null, modifier = GlanceModifier.size(40.dp))
          }
        }
      }
      if (!small) Image(ImageProvider(c.hero), contentDescription = null, modifier = GlanceModifier.size(heroDp(model)))
    }
    if (!small) {
      Spacer(GlanceModifier.height(4.dp))
      Row(verticalAlignment = Alignment.CenterVertically) {
        if (c.noneText != null) Text(c.noneText, style = s.style(SECONDARY, c.textColor), maxLines = 1)
        c.chips.forEach { chip ->
          Box(modifier = GlanceModifier.background(ImageProvider(c.chipBackground)).padding(horizontal = 10.dp, vertical = 4.dp)) {
            Text(chip.text, style = s.style(SECONDARY, R.color.clink_ink_primary, FontWeight.Medium), maxLines = 1)
          }
          Spacer(GlanceModifier.width(6.dp))
        }
        c.more?.let { Text(it, style = s.style(SECONDARY, c.textColor, FontWeight.Medium), maxLines = 1) }
      }
    }
  }
}

private fun heroDp(model: WidgetModel): Dp = if (model.layout.wide) 96.dp else 64.dp

@Composable
private fun Incoming(model: WidgetModel, s: Scale, c: Content.Incoming) {
  val context = LocalContext.current
  val small = model.layout.small
  Column(modifier = GlanceModifier.fillMaxSize()) {
    Row(modifier = GlanceModifier.fillMaxWidth().defaultWeight().semantics { contentDescription = c.a11y }) {
      Column(modifier = GlanceModifier.defaultWeight()) {
        Row(verticalAlignment = Alignment.CenterVertically) {
          Box(modifier = GlanceModifier.size(20.dp).background(ImageProvider(R.drawable.clink_bg_avatar)), contentAlignment = Alignment.Center) {
            Text(c.initial, style = s.style(MICRO, R.color.clink_ink_primary, FontWeight.Bold), maxLines = 1)
          }
          Spacer(GlanceModifier.width(6.dp))
          Text(c.name, style = s.style(SECONDARY, R.color.clink_ink_primary, FontWeight.Medium), maxLines = 1, modifier = if (small) GlanceModifier.defaultWeight() else GlanceModifier)
          // Small: the countdown takes the hero's corner; a countdown is never dropped (DESIGN.md 5.1).
          if (small) {
            Spacer(GlanceModifier.width(4.dp))
            Chrono(R.layout.clink_chrono_secondary, SECONDARY * s.m.textScale, c.leftFormat, c.expiresAt, countDown = true)
          }
          c.more?.let { more ->
            Spacer(GlanceModifier.width(6.dp))
            Box(modifier = GlanceModifier.background(ImageProvider(R.drawable.clink_bg_pill_ink)).padding(horizontal = 6.dp, vertical = 1.dp).semantics { contentDescription = c.moreA11y ?: more }) {
              Text(more, style = s.style(MICRO, R.color.clink_surface_base, FontWeight.Bold), maxLines = 1)
            }
          }
        }
        if (small) {
          Text(c.subTitle, style = s.style(PRIMARY, R.color.clink_ink_primary, FontWeight.Medium), maxLines = 1)
        } else {
          // COPY.md 6.2: the title may wrap to two lines (name, then "wants …").
          Text(c.title, style = s.style(if (model.layout.wide) 17f else PRIMARY, R.color.clink_ink_primary, FontWeight.Medium), maxLines = 2)
          Row(verticalAlignment = Alignment.CenterVertically) {
            Text(c.meta, style = s.style(SECONDARY, R.color.clink_ink_secondary), maxLines = 1)
            Spacer(GlanceModifier.width(6.dp))
            Chrono(R.layout.clink_chrono_secondary, SECONDARY * s.m.textScale, c.leftFormat, c.expiresAt, countDown = true)
          }
        }
      }
      if (!small) Image(ImageProvider(c.hero), contentDescription = null, modifier = GlanceModifier.size(if (model.layout.wide) 72.dp else 56.dp))
    }
    ActionRow(s, c.overlay, LocalSize.current.width.value - 2 * PAD) {
      if (c.replied != null) {
        Row(
          modifier = GlanceModifier.fillMaxWidth().height(BUTTON).background(ImageProvider(R.drawable.clink_bg_pill_raised)).semantics { contentDescription = c.repliedA11y ?: c.replied }.padding(horizontal = if (small) 8.dp else 14.dp),
          verticalAlignment = Alignment.CenterVertically,
        ) {
          Image(ImageProvider(R.drawable.clink_ui_check), contentDescription = null, modifier = GlanceModifier.size(if (small) 14.dp else 18.dp))
          Spacer(GlanceModifier.width(if (small) 3.dp else 6.dp))
          Text(c.replied, style = s.style(if (small) SECONDARY else PRIMARY, R.color.clink_ink_primary, FontWeight.Medium), maxLines = 1)
        }
      } else {
        Row(modifier = GlanceModifier.fillMaxWidth().height(BUTTON)) {
          val label = if (model.layout.wide) PRIMARY else SECONDARY
          c.join?.let { PillButton(s, it, GlanceModifier.defaultWeight().height(BUTTON), context, label, sub = false) }
          c.bring?.let {
            Spacer(GlanceModifier.width(8.dp))
            PillButton(s, it, GlanceModifier.defaultWeight().height(BUTTON), context, label, sub = false)
          }
        }
      }
    }
  }
}
