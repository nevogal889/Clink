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

@Composable
private fun Counts(s: Scale, t: TrackerModel, small: Boolean, dropWaterWord: Boolean) {
  Row(verticalAlignment = Alignment.Bottom) {
    if (t.drinksNum.isNotEmpty()) {
      Text(t.drinksNum, style = s.style(NUMERAL, R.color.clink_ink_primary, FontWeight.Bold, condensed = true), maxLines = 1)
      Spacer(GlanceModifier.width(4.dp))
    }
    Text(t.drinksWord, style = s.style(SECONDARY, R.color.clink_ink_primary, FontWeight.Medium), maxLines = 1, modifier = GlanceModifier.padding(bottom = 5.dp))
    Spacer(GlanceModifier.width(if (small) 8.dp else 12.dp))
    Image(ImageProvider(R.drawable.clink_ui_tumbler_water_ink), contentDescription = null, modifier = GlanceModifier.size(16.dp))
    Spacer(GlanceModifier.width(2.dp))
    Text(
      t.waterNum.ifEmpty { t.waterWord },
      style = s.style(if (small) PRIMARY else 22f, R.color.clink_water_ink, FontWeight.Bold, condensed = true),
      maxLines = 1,
      modifier = GlanceModifier.padding(bottom = if (small) 4.dp else 3.dp),
    )
    if (!dropWaterWord && t.waterNum.isNotEmpty()) {
      Spacer(GlanceModifier.width(3.dp))
      Text(t.waterWord, style = s.style(SECONDARY, R.color.clink_ink_primary, FontWeight.Medium), maxLines = 1, modifier = GlanceModifier.padding(bottom = 5.dp))
    }
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
  val now = UiClock.elapsedRealtime()
  val nowWall = Instant.now(app.clink.widget.WidgetEnv.clock)
  val offset = Duration.between(nowWall, at).toMillis()
  // Up: base is the event in the elapsed-realtime clock. Down: base is the end time.
  rv.setChronometer(R.id.clink_chrono, now + offset, format, true)
  rv.setChronometerCountDown(R.id.clink_chrono, countDown)
  rv.setTextViewTextSize(R.id.clink_chrono, TypedValue.COMPLEX_UNIT_SP, sizeSp)
  AndroidRemoteViews(rv)
}

@Composable
private fun IdleSmall(model: WidgetModel, s: Scale, c: Content.Idle) {
  val context = LocalContext.current
  val tall = model.layout == Layout.SMALL_TALL
  Column(modifier = GlanceModifier.fillMaxSize()) {
    Column(modifier = GlanceModifier.fillMaxWidth().defaultWeight().semantics { contentDescription = c.tracker.a11y }) {
      Counts(s, c.tracker, small = true, dropWaterWord = true)
      // What drops first (DESIGN.md 5.1): the last-drink line goes before counts and buttons.
      if (tall || !model.compactText) LastLine(s, c.tracker)
    }
    ActionRow(s, c.overlay) {
      PillButton(s, c.log, GlanceModifier.fillMaxWidth().height(BUTTON), context)
    }
  }
}

@Composable
private fun IdleMedium(model: WidgetModel, s: Scale, c: Content.Idle) {
  val context = LocalContext.current
  val short = model.layout == Layout.MEDIUM_SHORT
  Column(modifier = GlanceModifier.fillMaxSize()) {
    Row(modifier = GlanceModifier.fillMaxWidth().defaultWeight()) {
      Column(modifier = GlanceModifier.defaultWeight().fillMaxHeight().semantics { contentDescription = c.tracker.a11y }) {
        Counts(s, c.tracker, small = false, dropWaterWord = model.compactText)
        if (!short) {
          LastLine(s, c.tracker)
          val u = c.usual
          if (u != null && !model.compactText) {
            Spacer(GlanceModifier.height(4.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
              Image(ImageProvider(u.icon), contentDescription = null, modifier = GlanceModifier.size(16.dp))
              Spacer(GlanceModifier.width(4.dp))
              Text(u.text, style = s.style(SECONDARY, R.color.clink_ink_primary, FontWeight.Medium), maxLines = 1)
            }
          }
        } else if (!model.compactText) {
          LastLine(s, c.tracker)
        }
      }
      Spacer(GlanceModifier.width(8.dp))
      SnapTile(s, c.snap, if (short) GlanceModifier.size(56.dp) else GlanceModifier.width(112.dp).fillMaxHeight(), context, short)
    }
    Spacer(GlanceModifier.height(8.dp))
    ActionRow(s, c.overlay) {
      Row(modifier = GlanceModifier.fillMaxWidth().height(BUTTON), verticalAlignment = Alignment.CenterVertically) {
        PillButton(s, c.log, GlanceModifier.defaultWeight().height(BUTTON), context)
        Spacer(GlanceModifier.width(8.dp))
        IconButton(c.camera, context)
        Spacer(GlanceModifier.width(8.dp))
        PillButton(s, c.whoJoins, GlanceModifier.defaultWeight().height(BUTTON), context)
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
          Box(modifier = GlanceModifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Image(ImageProvider(R.drawable.clink_ui_camera_ink_secondary), contentDescription = null, modifier = GlanceModifier.size(24.dp))
          }
        }
        if (!thumb) {
          // The snap's name label sits on the photo scrim (DESIGN.md 3.6).
          Box(modifier = GlanceModifier.fillMaxSize().background(ImageProvider(R.drawable.clink_bg_scrim)), contentAlignment = Alignment.BottomStart) {
            Text(t.caption, style = TextStyle(color = ColorProvider(android.R.color.white), fontSize = s.sp(SECONDARY), fontWeight = FontWeight.Medium), maxLines = 1, modifier = GlanceModifier.padding(8.dp))
          }
        }
      }
    }
    is SnapTileModel.Empty,
    is SnapTileModel.Invite -> {
      val icon = if (t is SnapTileModel.Invite) R.drawable.clink_ui_share else R.drawable.clink_ui_camera_ink_secondary
      val text = if (t is SnapTileModel.Invite) t.text else (t as SnapTileModel.Empty).text
      Column(
        modifier = base.background(ImageProvider(R.drawable.clink_bg_tile_sunk)).padding(8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalAlignment = Alignment.CenterHorizontally,
      ) {
        Image(ImageProvider(icon), contentDescription = null, modifier = GlanceModifier.size(if (thumb) 20.dp else 24.dp))
        if (!thumb) {
          Spacer(GlanceModifier.height(4.dp))
          Text(text, style = s.style(SECONDARY, R.color.clink_ink_secondary, FontWeight.Medium, align = TextAlign.Center), maxLines = 3)
        }
      }
    }
  }
}

@Composable
private fun PillButton(s: Scale, b: ButtonModel, modifier: GlanceModifier, context: Context) {
  Row(
    modifier =
      modifier
        .background(ImageProvider(b.background))
        .clickable(tapAction(context, b.tap))
        .semantics { contentDescription = b.a11y }
        .padding(horizontal = 12.dp),
    verticalAlignment = Alignment.CenterVertically,
    horizontalAlignment = Alignment.CenterHorizontally,
  ) {
    b.icon?.let {
      Image(ImageProvider(it), contentDescription = null, modifier = GlanceModifier.size(18.dp))
      Spacer(GlanceModifier.width(6.dp))
    }
    Column(verticalAlignment = Alignment.CenterVertically) {
      Text(b.label, style = s.style(PRIMARY, b.textColor, FontWeight.Medium), maxLines = 1)
      b.subLabel?.let { Text(it, style = s.style(MICRO, b.textColor, FontWeight.Medium), maxLines = 1) }
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
        .padding(horizontal = 14.dp),
    verticalAlignment = Alignment.CenterVertically,
  ) {
    when (overlay) {
      is OverlayModel.Confirm -> {
        Image(ImageProvider(R.drawable.clink_ui_check), contentDescription = null, modifier = GlanceModifier.size(18.dp))
        Spacer(GlanceModifier.width(6.dp))
        Text(overlay.text, style = s.style(PRIMARY, R.color.clink_ink_primary, FontWeight.Medium), maxLines = 1)
        overlay.detail?.let {
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
  val header = !(model.layout == Layout.SMALL)
  Column(modifier = GlanceModifier.fillMaxSize()) {
    if (header) {
      Row(modifier = GlanceModifier.fillMaxWidth().height(BUTTON), verticalAlignment = Alignment.CenterVertically) {
        if (!small) Text(title, style = s.style(PRIMARY, R.color.clink_ink_primary, FontWeight.Medium), maxLines = 1, modifier = GlanceModifier.defaultWeight())
        else Spacer(GlanceModifier.defaultWeight())
        Box(
          modifier =
            GlanceModifier.size(BUTTON).clickable(tapAction(context, Tap.ClosePicker)).semantics { contentDescription = closeA11y },
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
      // 2 x 2 grid, each cell at least 48 dp.
      for (row in cells.chunked(2)) {
        Row(modifier = GlanceModifier.fillMaxWidth().defaultWeight()) {
          row.forEachIndexed { i, cell ->
            if (i > 0) Spacer(GlanceModifier.width(4.dp))
            Cell(s, cell, GlanceModifier.defaultWeight().fillMaxHeight(), context, iconDp = 24, textSize = MICRO, lines = 1)
          }
        }
        if (row !== cells.chunked(2).last()) Spacer(GlanceModifier.height(4.dp))
      }
    } else {
      val tall = model.layout == Layout.MEDIUM
      Row(modifier = GlanceModifier.fillMaxWidth().defaultWeight()) {
        cells.forEachIndexed { i, cell ->
          if (i > 0) Spacer(GlanceModifier.width(6.dp))
          Cell(s, cell, GlanceModifier.defaultWeight().fillMaxHeight(), context, iconDp = if (tall) 28 else 24, textSize = if (tall) SECONDARY else MICRO, lines = if (tall) 2 else 1)
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
        .padding(horizontal = 4.dp, vertical = 4.dp),
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
        if (small) Text(c.counts, style = s.style(SECONDARY, c.textColor), maxLines = 1)
      }
      Image(ImageProvider(c.hero), contentDescription = null, modifier = GlanceModifier.size(if (small) 48.dp else heroDp(model)))
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

private fun heroDp(model: WidgetModel): Dp = if (model.layout == Layout.MEDIUM) 96.dp else 64.dp

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
          Text(c.name, style = s.style(SECONDARY, R.color.clink_ink_primary, FontWeight.Medium), maxLines = 1)
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
          Text(c.title, style = s.style(17f, R.color.clink_ink_primary, FontWeight.Medium), maxLines = 1)
          Row(verticalAlignment = Alignment.CenterVertically) {
            Text(c.meta, style = s.style(SECONDARY, R.color.clink_ink_secondary), maxLines = 1)
          }
        }
        Chrono(R.layout.clink_chrono_secondary, SECONDARY * s.m.textScale, "%s", c.expiresAt, countDown = true)
      }
      Image(ImageProvider(c.hero), contentDescription = null, modifier = GlanceModifier.size(if (small) 48.dp else 72.dp))
    }
    ActionRow(s, c.overlay) {
      if (c.replied != null) {
        Row(
          modifier = GlanceModifier.fillMaxWidth().height(BUTTON).background(ImageProvider(R.drawable.clink_bg_pill_raised)).semantics { contentDescription = c.repliedA11y ?: c.replied }.padding(horizontal = 14.dp),
          verticalAlignment = Alignment.CenterVertically,
        ) {
          Image(ImageProvider(R.drawable.clink_ui_check), contentDescription = null, modifier = GlanceModifier.size(18.dp))
          Spacer(GlanceModifier.width(6.dp))
          Text(c.replied, style = s.style(PRIMARY, R.color.clink_ink_primary, FontWeight.Medium), maxLines = 1)
        }
      } else {
        Row(modifier = GlanceModifier.fillMaxWidth().height(BUTTON)) {
          c.join?.let { PillButton(s, it, GlanceModifier.defaultWeight().height(BUTTON), context) }
          c.bring?.let {
            Spacer(GlanceModifier.width(8.dp))
            PillButton(s, it, GlanceModifier.defaultWeight().height(BUTTON), context)
          }
        }
      }
    }
  }
}
