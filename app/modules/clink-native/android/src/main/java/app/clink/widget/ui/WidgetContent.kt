package app.clink.widget.ui

import android.content.Context
import android.os.SystemClock
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

// Glance layouts for every widget state (DESIGN.md 5.1 to 5.3). Sizes are the DESIGN.md widget
// scale: numeral.l 34, primary 15, secondary 13, micro 11; buttons 48 dp; 16 dp padding, 12 dp
// under 140 dp. The system sans stands in for Archivo (DESIGN.md 2.4: RemoteViews can't use our
// font files dependably); numerals use the condensed system face.

/** Wall clock for the Chronometer bases; tests pin it. */
object UiClock {
  @Volatile var elapsedRealtime: () -> Long = { SystemClock.elapsedRealtime() }
}

private const val NUMERAL = 34f
private const val PRIMARY = 15f
private const val SECONDARY = 13f
private const val MICRO = 11f
private val BUTTON = 48.dp

private val CONDENSED = FontFamily("sans-serif-condensed")

private fun color(id: Int) = ColorProvider(id)

private class Scale(val m: WidgetModel) {
  fun sp(v: Float) = (v * m.textScale).sp

  fun style(size: Float, colorRes: Int, weight: FontWeight = FontWeight.Normal, condensed: Boolean = false, align: TextAlign? = null) =
    TextStyle(
      color = color(colorRes),
      fontSize = sp(size),
      fontWeight = weight,
      fontFamily = if (condensed) CONDENSED else null,
      textAlign = align,
    )
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

@Composable
fun WidgetContent(model: WidgetModel) {
  val context = LocalContext.current
  val s = Scale(model)
  val pad = if (model.layout == Layout.MEDIUM) 16.dp else 12.dp
  Box(
    modifier =
      GlanceModifier.fillMaxSize()
        .background(ImageProvider(model.background))
        .clickable(tapAction(context, model.tap))
        .padding(start = pad, end = pad, top = pad, bottom = pad),
  ) {
    when (val c = model.content) {
      is Content.Prompt -> Prompt(model, s, c)
      is Content.Idle -> if (model.layout.small) IdleSmall(model, s, c) else IdleMedium(model, s, c)
      is Content.Picker -> Picker(model, s, c.title, c.cells, c.closeA11y, c.overlay)
      is Content.BringPicker -> Picker(model, s, c.title, c.cells, c.closeA11y, c.overlay)
      is Content.MyFlare -> MyFlare(model, s, c)
      is Content.Incoming -> Incoming(model, s, c)
    }
  }
}

// ---------------------------------------------------------------------------------------------

@Composable
private fun Prompt(model: WidgetModel, s: Scale, c: Content.Prompt) {
  Column(
    modifier = GlanceModifier.fillMaxSize().semantics { contentDescription = c.a11y },
    verticalAlignment = Alignment.CenterVertically,
  ) {
    if (model.layout.small) {
      Image(ImageProvider(R.drawable.clink_mark), contentDescription = null, modifier = GlanceModifier.size(32.dp))
    } else {
      // The wordmark at 20 dp high (viewBox 348 x 146).
      Image(ImageProvider(R.drawable.clink_wordmark), contentDescription = null, modifier = GlanceModifier.width(48.dp).height(20.dp))
    }
    Spacer(GlanceModifier.height(8.dp))
    Text(c.text, style = s.style(SECONDARY, R.color.clink_ink_primary, FontWeight.Medium), maxLines = 2)
  }
}

// ---------------------------------------------------------------------------------------------
// Idle


/**
 * A count in numeral.l through RemoteViews, so the line has no font padding (clink_numeral_*).
 * The box is sized explicitly: one line of the condensed face is about 1.2 em, and each digit
 * about 0.5 em wide, at the scaled size.
 */
@Composable
private fun Numeral(s: Scale, layout: Int, text: String, sizeSp: Float) {
  val context = LocalContext.current
  val rv = RemoteViews(context.packageName, layout)
  rv.setTextViewText(R.id.clink_text, text)
  rv.setTextViewTextSize(R.id.clink_text, TypedValue.COMPLEX_UNIT_SP, sizeSp)
  val em = sizeSp * s.m.fontScale
  AndroidRemoteViews(rv, GlanceModifier.width((em * 0.52f * text.length + 2f).dp).height((em * 1.2f).dp))
}

@Composable
private fun WaterCount(s: Scale, t: TrackerModel, withWord: Boolean) {
  Row(verticalAlignment = Alignment.CenterVertically) {
    Image(ImageProvider(R.drawable.clink_ui_tumbler_water_ink), contentDescription = null, modifier = GlanceModifier.size(14.dp))
    Spacer(GlanceModifier.width(2.dp))
    val text = if (withWord) t.waterText else t.waterNum.ifEmpty { t.waterText }
    Text(text, style = s.style(SECONDARY, R.color.clink_water_ink, FontWeight.Medium), maxLines = 1)
  }
}

@Composable
private fun LastLine(s: Scale, t: TrackerModel) {
  val at = t.lastDrinkAt
  if (at == null) {
    Text(t.noneText, style = s.style(SECONDARY, R.color.clink_ink_secondary), maxLines = 1)
  } else {
    Chrono(R.layout.clink_chrono_secondary, SECONDARY * s.m.textScale, t.lastFormat, at, countDown = false)
  }
}

/** A ticking Chronometer through RemoteViews (ARCHITECTURE.md 3.3 Android item 5). */
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

/**
 * Small (DESIGN.md 5.3), fitted into 96 x 96 dp:
 *   3 | drinks  ◦ 4
 *     | Last 1:42:07
 *   [    +1 Drink    ]
 */
@Composable
private fun IdleSmall(model: WidgetModel, s: Scale, c: Content.Idle) {
  val context = LocalContext.current
  val t = c.tracker
  Column(modifier = GlanceModifier.fillMaxSize()) {
    Row(
      modifier = GlanceModifier.fillMaxWidth().defaultWeight().semantics { contentDescription = t.a11y },
      verticalAlignment = Alignment.Top,
    ) {
      Numeral(s, R.layout.clink_numeral_ink, t.drinksNum.ifEmpty { "0" }, NUMERAL * s.m.textScale)
      Spacer(GlanceModifier.width(4.dp))
      Column {
        Row(verticalAlignment = Alignment.CenterVertically) {
          Text(t.drinksWord, style = s.style(SECONDARY, R.color.clink_ink_primary, FontWeight.Medium), maxLines = 1)
          if (!model.compactText) {
            Spacer(GlanceModifier.width(6.dp))
            WaterCount(s, t, withWord = false)
          }
        }
        // At large text the water count takes the second line and the last-drink line drops
        // (DESIGN.md 5.1: the last-drink line goes before counts and buttons).
        if (model.compactText) WaterCount(s, t, withWord = false) else LastLine(s, t)
      }
    }
    ActionRow(s, c.overlay) {
      PillButton(s, c.log, GlanceModifier.fillMaxWidth().height(BUTTON), context, PRIMARY)
    }
  }
}

/**
 * Medium (DESIGN.md 5.2). The wide layout is the design as drawn; at about 250 dp the water
 * count takes its own line, the usual #1 line drops (DESIGN.md 5.1 order) and labels are 13.
 */
@Composable
private fun IdleMedium(model: WidgetModel, s: Scale, c: Content.Idle) {
  val context = LocalContext.current
  val t = c.tracker
  val short = model.layout == Layout.MEDIUM_SHORT
  val wide = model.layout.wide
  val label = if (wide) PRIMARY else SECONDARY
  Column(modifier = GlanceModifier.fillMaxSize()) {
    Row(modifier = GlanceModifier.fillMaxWidth().defaultWeight()) {
      Column(modifier = GlanceModifier.defaultWeight().fillMaxHeight().semantics { contentDescription = t.a11y }) {
        Row(verticalAlignment = Alignment.Bottom) {
          Numeral(s, R.layout.clink_numeral_ink, t.drinksNum.ifEmpty { "0" }, NUMERAL * s.m.textScale)
          Spacer(GlanceModifier.width(4.dp))
          Text(t.drinksWord, style = s.style(SECONDARY, R.color.clink_ink_primary, FontWeight.Medium), maxLines = 1)
          if (wide || short) {
            Spacer(GlanceModifier.width(10.dp))
            if (wide) {
              Image(ImageProvider(R.drawable.clink_ui_tumbler_water_ink), contentDescription = null, modifier = GlanceModifier.size(16.dp))
              Spacer(GlanceModifier.width(2.dp))
              Numeral(s, R.layout.clink_numeral_water, t.waterNum.ifEmpty { "0" }, 22f * s.m.textScale)
              if (!model.compactText) {
                Spacer(GlanceModifier.width(3.dp))
                Text(t.waterWord, style = s.style(SECONDARY, R.color.clink_ink_primary, FontWeight.Medium), maxLines = 1)
              }
            } else {
              WaterCount(s, t, withWord = false)
            }
          }
        }
        if (!wide && !short) WaterCount(s, t, withWord = !model.compactText)
        if (!short) LastLine(s, t)
        val u = c.usual
        if (u != null && !model.compactText && !short) {
          Spacer(GlanceModifier.height(2.dp))
          Row(verticalAlignment = Alignment.CenterVertically) {
            Image(ImageProvider(u.icon), contentDescription = null, modifier = GlanceModifier.size(16.dp))
            Spacer(GlanceModifier.width(4.dp))
            Text(u.text, style = s.style(SECONDARY, R.color.clink_ink_primary, FontWeight.Medium), maxLines = 1)
          }
        }
      }
      Spacer(GlanceModifier.width(8.dp))
      // Under 150 dp high the snap tile becomes a thumbnail beside the counts (DESIGN.md 5.2).
      val tile = if (short) GlanceModifier.size(40.dp) else GlanceModifier.width(if (wide) 112.dp else 88.dp).fillMaxHeight()
      SnapTile(s, c.snap, tile, context, thumb = short)
    }
    Spacer(GlanceModifier.height(if (short) 6.dp else 8.dp))
    ActionRow(s, c.overlay) {
      Row(modifier = GlanceModifier.fillMaxWidth().height(BUTTON), verticalAlignment = Alignment.CenterVertically) {
        // About 250 dp leaves 218 dp for three buttons: tighter padding and gaps keep every
        // label whole, the Who joins? glyph included (DESIGN.md 7: never colour alone).
        val gap = if (wide) 8.dp else 4.dp
        PillButton(s, c.log, GlanceModifier.height(BUTTON), context, label, padDp = if (wide) 14 else 8)
        Spacer(GlanceModifier.width(gap))
        IconButton(c.camera, context)
        Spacer(GlanceModifier.width(gap))
        PillButton(s, c.whoJoins, GlanceModifier.defaultWeight().height(BUTTON), context, label, padDp = if (wide) 10 else 6)
      }
    }
  }
}

@Composable
private fun SnapTile(s: Scale, t: SnapTileModel, modifier: GlanceModifier, context: Context, thumb: Boolean) {
  val base = modifier.clickable(tapAction(context, t.tap)).let { m -> t.a11y?.let { a -> m.semantics { contentDescription = a } } ?: m }
  when (t) {
    is SnapTileModel.Photo -> {
      val bmp = WidgetFiles.thumb(context, t.file)
      Box(modifier = base.background(ImageProvider(R.drawable.clink_bg_tile_sunk)), contentAlignment = Alignment.BottomStart) {
        if (bmp != null) {
          Image(ImageProvider(bmp), contentDescription = null, modifier = GlanceModifier.fillMaxSize(), contentScale = androidx.glance.layout.ContentScale.Crop)
        } else {
          // The thumbnail isn't cached yet: the tile keeps its place with the camera glyph.
          Box(modifier = GlanceModifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Image(ImageProvider(R.drawable.clink_ui_camera_ink_secondary), contentDescription = null, modifier = GlanceModifier.size(20.dp))
          }
        }
        if (!thumb) {
          // The snap's name label sits on the photo scrim (DESIGN.md 3.6), white, 13 minimum.
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
    is SnapTileModel.Empty,
    is SnapTileModel.Invite -> {
      val icon = if (t is SnapTileModel.Invite) R.drawable.clink_ui_share else R.drawable.clink_ui_camera_ink_secondary
      val text = if (t is SnapTileModel.Invite) t.text else (t as SnapTileModel.Empty).text
      Column(
        modifier = base.background(ImageProvider(R.drawable.clink_bg_tile_sunk)).padding(6.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalAlignment = Alignment.CenterHorizontally,
      ) {
        Image(ImageProvider(icon), contentDescription = null, modifier = GlanceModifier.size(20.dp))
        if (!thumb) {
          Spacer(GlanceModifier.height(2.dp))
          Text(text, style = s.style(MICRO, R.color.clink_ink_secondary, FontWeight.Medium, align = TextAlign.Center), maxLines = 3)
        }
      }
    }
  }
}

@Composable
private fun PillButton(s: Scale, b: ButtonModel, modifier: GlanceModifier, context: Context, labelSize: Float = PRIMARY, padDp: Int = 10) {
  Row(
    modifier =
      modifier
        .background(ImageProvider(b.background))
        .clickable(tapAction(context, b.tap))
        .semantics { contentDescription = b.a11y }
        .padding(horizontal = padDp.dp),
    verticalAlignment = Alignment.CenterVertically,
    horizontalAlignment = Alignment.CenterHorizontally,
  ) {
    b.icon?.let {
      Image(ImageProvider(it), contentDescription = null, modifier = GlanceModifier.size(if (labelSize < PRIMARY) 14.dp else 16.dp))
      Spacer(GlanceModifier.width(if (labelSize < PRIMARY) 3.dp else 4.dp))
    }
    Column(verticalAlignment = Alignment.CenterVertically) {
      Text(b.label, style = s.style(labelSize, b.textColor, FontWeight.Medium), maxLines = 1)
      // The audience line inside Who joins? is the first thing to drop at large text (DESIGN.md 5.1).
      if (!s.m.compactText) b.subLabel?.let { Text(it, style = s.style(MICRO, b.textColor, FontWeight.Medium), maxLines = 1) }
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
private fun ActionRow(s: Scale, overlay: OverlayModel?, actions: @Composable () -> Unit) {
  val context = LocalContext.current
  val small = s.m.layout.small
  val main = if (small) SECONDARY else PRIMARY
  if (overlay == null) {
    actions()
    return
  }
  val tap = (overlay as? OverlayModel.Failed)?.let { tapAction(context, Tap.Retry(it.opId)) }
  Row(
    modifier =
      GlanceModifier.fillMaxWidth()
        .height(BUTTON)
        .background(ImageProvider(R.drawable.clink_bg_pill_raised))
        .let { m -> tap?.let { m.clickable(it) } ?: m }
        .semantics { contentDescription = overlay.a11y }
        .padding(horizontal = if (small) 8.dp else 12.dp),
    verticalAlignment = Alignment.CenterVertically,
  ) {
    when (overlay) {
      is OverlayModel.Confirm -> {
        Image(ImageProvider(R.drawable.clink_ui_check), contentDescription = null, modifier = GlanceModifier.size(if (small) 14.dp else 18.dp))
        Spacer(GlanceModifier.width(if (small) 3.dp else 6.dp))
        Text(overlay.text, style = s.style(main, R.color.clink_ink_primary, FontWeight.Medium), maxLines = 1)
        if (!small) overlay.detail?.let {
          Spacer(GlanceModifier.width(6.dp))
          Text(it, style = s.style(SECONDARY, R.color.clink_ink_secondary), maxLines = 1)
        }
      }
      is OverlayModel.Sending -> {
        Image(ImageProvider(R.drawable.clink_ui_clock_ink_secondary), contentDescription = null, modifier = GlanceModifier.size(18.dp))
        Spacer(GlanceModifier.width(6.dp))
        Text(overlay.text, style = s.style(SECONDARY, R.color.clink_ink_secondary, FontWeight.Medium), maxLines = 1)
      }
      is OverlayModel.Failed ->
        Text(overlay.text, style = s.style(SECONDARY, R.color.clink_danger, FontWeight.Medium), maxLines = 2)
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Pickers

@Composable
private fun Picker(model: WidgetModel, s: Scale, title: String, cells: List<PickerCell>, closeA11y: String, overlay: OverlayModel?) {
  val context = LocalContext.current
  val small = model.layout.small
  // A short 2x2 has no room for a header: the 30 s timeout is the cancel (DESIGN.md 5.3).
  val header = model.layout != Layout.SMALL
  Column(modifier = GlanceModifier.fillMaxSize()) {
    if (header) {
      Row(modifier = GlanceModifier.fillMaxWidth().height(if (small) 40.dp else BUTTON), verticalAlignment = Alignment.CenterVertically) {
        if (!small) Text(title, style = s.style(PRIMARY, R.color.clink_ink_primary, FontWeight.Medium), maxLines = 1, modifier = GlanceModifier.defaultWeight())
        else Spacer(GlanceModifier.defaultWeight())
        Box(
          modifier = GlanceModifier.size(BUTTON).clickable(tapAction(context, Tap.ClosePicker)).semantics { contentDescription = closeA11y },
          contentAlignment = Alignment.Center,
        ) {
          Image(ImageProvider(R.drawable.clink_ui_close), contentDescription = null, modifier = GlanceModifier.size(22.dp))
        }
      }
    }
    if (overlay != null) {
      Spacer(GlanceModifier.defaultWeight())
      ActionRow(s, overlay) {}
      return@Column
    }
    if (small) {
      // 2 x 2 grid of 48 dp cells (DESIGN.md 5.3).
      val rows = cells.chunked(2)
      rows.forEachIndexed { r, row ->
        if (r > 0) Spacer(GlanceModifier.height(4.dp))
        Row(modifier = GlanceModifier.fillMaxWidth().defaultWeight()) {
          row.forEachIndexed { i, cell ->
            if (i > 0) Spacer(GlanceModifier.width(4.dp))
            Cell(s, cell, GlanceModifier.defaultWeight().fillMaxHeight(), context, iconDp = 22, textSize = MICRO, lines = 1)
          }
        }
      }
    } else {
      val roomy = model.layout == Layout.MEDIUM || model.layout.wide
      Row(modifier = GlanceModifier.fillMaxWidth().defaultWeight()) {
        cells.forEachIndexed { i, cell ->
          if (i > 0) Spacer(GlanceModifier.width(6.dp))
          Cell(
            s,
            cell,
            GlanceModifier.defaultWeight().fillMaxHeight(),
            context,
            iconDp = if (roomy) 28 else 24,
            textSize = MICRO,
            // Long one-word names would break mid-word in a narrow cell; they end in "…" instead.
            lines = if (model.layout.wide && !model.compactText) 2 else 1,
          )
        }
      }
    }
  }
}

@Composable
private fun Cell(s: Scale, cell: PickerCell, modifier: GlanceModifier, context: Context, iconDp: Int, textSize: Float, lines: Int) {
  Column(
    modifier =
      modifier
        .background(ImageProvider(cell.background))
        .clickable(tapAction(context, cell.tap))
        .semantics { contentDescription = cell.a11y }
        .padding(horizontal = 2.dp, vertical = 3.dp),
    verticalAlignment = Alignment.CenterVertically,
    horizontalAlignment = Alignment.CenterHorizontally,
  ) {
    Image(ImageProvider(cell.icon), contentDescription = null, modifier = GlanceModifier.size(iconDp.dp))
    Spacer(GlanceModifier.height(2.dp))
    Text(cell.label, style = s.style(textSize, R.color.clink_ink_primary, FontWeight.Medium, align = TextAlign.Center), maxLines = lines)
  }
}

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
          if (small) Image(ImageProvider(c.hero), contentDescription = null, modifier = GlanceModifier.size(28.dp))
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
            Chrono(R.layout.clink_chrono_secondary, SECONDARY * s.m.textScale, "%s", c.expiresAt, countDown = true)
          }
        }
        if (small) Chrono(R.layout.clink_chrono_secondary, SECONDARY * s.m.textScale, "%s", c.expiresAt, countDown = true)
      }
      if (!small) Image(ImageProvider(c.hero), contentDescription = null, modifier = GlanceModifier.size(if (model.layout.wide) 72.dp else 56.dp))
    }
    ActionRow(s, c.overlay) {
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
          c.join?.let { PillButton(s, it, GlanceModifier.defaultWeight().height(BUTTON), context, label) }
          c.bring?.let {
            Spacer(GlanceModifier.width(8.dp))
            PillButton(s, it, GlanceModifier.defaultWeight().height(BUTTON), context, label)
          }
        }
      }
    }
  }
}
