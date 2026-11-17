package app.clink.widget

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.BitmapFactory
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.TextView
import androidx.compose.ui.unit.DpSize
import androidx.compose.ui.unit.dp
import androidx.glance.GlanceId
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.compose
import androidx.glance.appwidget.provideContent
import androidx.test.core.app.ApplicationProvider
import app.clink.widget.model.WidgetLocal
import app.clink.widget.model.WidgetSize
import app.clink.widget.model.WidgetStateDecoder
import app.clink.widget.text.Copy
import app.clink.widget.ui.ClinkWidget
import app.clink.widget.ui.Layout
import app.clink.widget.ui.ModelBuilder
import app.clink.widget.ui.WidgetContent
import app.clink.widget.ui.WidgetModel
import java.io.File
import java.time.Clock
import java.time.ZoneOffset
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

// Renders widget states to PNG the way a launcher does: Glance composes RemoteViews, the
// RemoteViews inflate into real Android views, and Robolectric's native graphics draw them.
//   gradlew ... testDebugUnitTest --tests '*WidgetScreenshotTest*' -PclinkScreens=<dir> [-PclinkPreviews=<res dir>]
// Without -PclinkScreens the test still renders every case and writes nothing. Every render is
// checked for cut text (DESIGN.md 5.1: lines drop, nothing is cut), and the key states are compared
// with golden PNGs in src/test/resources/goldens with a small tolerance, so a visual regression
// fails. After an intended change: -PclinkUpdateGoldens, then look at every golden before committing.

@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(qualifiers = "w411dp-h891dp-xxhdpi")
class WidgetScreenshotTest {
  private val outDir = System.getProperty("clink.screens")?.let(::File)
  private val previewDir = System.getProperty("clink.previews")?.let(::File)
  private val goldenOut = System.getProperty("clink.goldens.out")?.let(::File)

  @After
  fun tearDown() {
    WidgetEnv.clock = Clock.system(ZoneOffset.UTC)
    RuntimeEnvironment.setFontScale(1f)
  }

  private class Fixed(val model: WidgetModel) : GlanceAppWidget() {
    override suspend fun provideGlance(context: Context, id: GlanceId) = provideContent { WidgetContent(model) }
  }

  private fun size(layout: Layout): DpSize =
    when (layout) {
      Layout.SMALL -> ClinkWidget.SMALL
      Layout.SMALL_TALL -> ClinkWidget.SMALL_TALL
      Layout.MEDIUM_SHORT -> ClinkWidget.MEDIUM_SHORT
      Layout.MEDIUM -> ClinkWidget.MEDIUM
      Layout.MEDIUM_WIDE -> ClinkWidget.MEDIUM_WIDE
    }

  /** Every TextView that shows less than its text: ellipsized, too many lines, clipped or broken mid-word. */
  private fun cutTexts(root: View): List<String> {
    val out = mutableListOf<String>()
    val d = root.resources.displayMetrics.density
    fun walk(v: View, chain: List<View>) {
      if (v.visibility != View.VISIBLE) return
      if (v is ViewGroup) for (i in 0 until v.childCount) walk(v.getChildAt(i), chain + v)
      if (v !is TextView || v.text.isNullOrEmpty()) return
      val l = v.layout ?: return
      val text = v.text.toString()
      val shown = minOf(l.lineCount, v.maxLines)
      val avail = v.width - v.totalPaddingLeft - v.totalPaddingRight
      val why =
        when {
          (0 until l.lineCount).any { l.getEllipsisCount(it) > 0 } ->
            "ellipsized (box %.1f dp, text %.1f dp, %d lines max)".format(avail / d, v.paint.measureText(text) / d, v.maxLines)
          l.lineCount > v.maxLines -> "needs ${l.lineCount} lines, shows ${v.maxLines}"
          (0 until shown).any { l.getLineWidth(it) > avail + 1 } -> "wider (${l.getLineWidth(0) / d} dp) than its box (${avail / d} dp)"
          v.height + 1 < l.getLineBottom(shown - 1) + v.totalPaddingTop + v.totalPaddingBottom -> "taller than its box"
          (1 until l.lineCount).any { i -> !text[l.getLineStart(i) - 1].isWhitespace() && text[l.getLineStart(i) - 1] != '-' } -> "a word is broken"
          else -> null
        }
      if (why != null) {
        out += "\"$text\": $why"
        return
      }
      // Clipped by an ancestor: the text box must sit inside every parent.
      var x = 0
      var y = 0
      var child: View = v
      for (p in chain.reversed()) {
        x += child.left
        y += child.top
        if (x < -1 || y < -1 || x + v.width > p.width + 1 || y + v.height > p.height + 1) {
          out += "\"$text\": clipped by a parent"
          return
        }
        child = p
      }
    }
    walk(root, emptyList())
    return out
  }

  private var lastCut: List<String> = emptyList()

  private fun dump(v: View, depth: Int) {
    val d = v.resources.displayMetrics.density
    val extra =
      if (v is TextView) {
        val first = v.text.toString().split(' ').last()
        " \"${v.text}\" size=${v.textSize / d} tf=${v.typeface?.weight} lastWord=${v.paint.measureText(first) / d} fit=${app.clink.widget.ui.TextFit.width(first, v.textSize / d, app.clink.widget.ui.TextFit.Face.MEDIUM)} spacing=${v.letterSpacing} span=${(v.text as? android.text.Spanned)?.getSpans(0, v.text.length, Any::class.java)?.joinToString { it.javaClass.simpleName }}"
      } else ""
    println("DUMP " + "  ".repeat(depth) + v.javaClass.simpleName + " x=${v.left / d} w=${v.width / d} h=${v.height / d} pad=${v.paddingLeft / d},${v.paddingRight / d}" + extra)
    if (v is ViewGroup) for (i in 0 until v.childCount) dump(v.getChildAt(i), depth + 1)
  }

  private fun render(fixture: String, layout: Layout, night: Boolean, fontScale: Float = 1f, at: DpSize? = null): Bitmap {
    RuntimeEnvironment.setQualifiers(if (night) "+night" else "+notnight")
    RuntimeEnvironment.setFontScale(fontScale)
    val context: Context = ApplicationProvider.getApplicationContext()
    val f = Fixtures.widgetStates().first { it.id == fixture }
    WidgetEnv.clock = Clock.fixed(f.now, f.zone)
    val state = WidgetStateDecoder.decode(f.stateJson)
    val model =
      ModelBuilder(Copy(context)).build(state, f.local ?: WidgetLocal.EMPTY, f.config(WidgetSize.MEDIUM), layout, fontScale, f.now, f.zone)
    val dp = at ?: size(layout)
    val rv = runBlocking { Fixed(model).compose(context, size = dp) }
    val density = context.resources.displayMetrics.density
    val w = (dp.width.value * density).toInt()
    val h = (dp.height.value * density).toInt()
    // A neutral launcher backdrop with a margin, so the widget's own corners show.
    val margin = (12 * density).toInt()
    val parent = FrameLayout(context)
    val view = rv.apply(context, parent)
    view.measure(View.MeasureSpec.makeMeasureSpec(w, View.MeasureSpec.EXACTLY), View.MeasureSpec.makeMeasureSpec(h, View.MeasureSpec.EXACTLY))
    view.layout(0, 0, w, h)
    lastCut = cutTexts(view)
    if (System.getProperty("clink.dump") == "$fixture-$layout-$night-$fontScale") dump(view, 0)
    val bmp = Bitmap.createBitmap(w + 2 * margin, h + 2 * margin, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(bmp)
    canvas.drawColor(if (night) Color.rgb(0x2B, 0x2F, 0x36) else Color.rgb(0xC9, 0xD1, 0xD8))
    canvas.translate(margin.toFloat(), margin.toFloat())
    view.draw(canvas)
    return bmp
  }

  private fun save(bmp: Bitmap, dir: File?, name: String) {
    dir ?: return
    dir.mkdirs()
    File(dir, name).outputStream().use { bmp.compress(Bitmap.CompressFormat.PNG, 100, it) }
  }

  private data class Case(val fixture: String, val name: String, val layouts: List<Layout>)

  private val cases =
    listOf(
      Case("W4", "idle", listOf(Layout.SMALL, Layout.MEDIUM, Layout.MEDIUM_WIDE, Layout.MEDIUM_SHORT, Layout.SMALL_TALL)),
      Case("W3", "idle-snap", listOf(Layout.MEDIUM, Layout.MEDIUM_WIDE)),
      Case("W5", "idle-no-friends", listOf(Layout.SMALL, Layout.MEDIUM, Layout.MEDIUM_WIDE, Layout.MEDIUM_SHORT)),
      Case("W21", "idle-audience-empty", listOf(Layout.MEDIUM)),
      Case("W6", "idle-no-usual", listOf(Layout.SMALL, Layout.MEDIUM)),
      Case("W7", "idle-caffeine-note", listOf(Layout.MEDIUM_WIDE)),
      Case("W22", "idle-new-day", listOf(Layout.SMALL, Layout.MEDIUM)),
      Case("W8", "picker", listOf(Layout.SMALL, Layout.MEDIUM, Layout.MEDIUM_WIDE, Layout.MEDIUM_SHORT, Layout.SMALL_TALL)),
      Case("W17", "confirmation", listOf(Layout.SMALL, Layout.MEDIUM)),
      Case("W19", "failed", listOf(Layout.SMALL, Layout.MEDIUM)),
      Case("W1", "signed-out", listOf(Layout.SMALL, Layout.MEDIUM)),
      Case("W2", "setup", listOf(Layout.SMALL, Layout.MEDIUM)),
      Case("W9", "my-flare", listOf(Layout.SMALL, Layout.MEDIUM, Layout.MEDIUM_WIDE, Layout.MEDIUM_SHORT)),
      Case("W10", "my-flare-replies", listOf(Layout.MEDIUM)),
      Case("W11", "incoming", listOf(Layout.SMALL, Layout.MEDIUM, Layout.MEDIUM_WIDE)),
      Case("W13", "incoming-more", listOf(Layout.MEDIUM)),
      Case("W14", "bring-picker", listOf(Layout.MEDIUM)),
      Case("W15", "replied-in", listOf(Layout.SMALL, Layout.MEDIUM)),
    )

  private fun layoutName(l: Layout) =
    when (l) {
      Layout.SMALL -> "small"
      Layout.SMALL_TALL -> "small-tall"
      Layout.MEDIUM_SHORT -> "medium-short"
      Layout.MEDIUM -> "medium"
      Layout.MEDIUM_WIDE -> "medium-wide"
    }

  /** The states compared with goldens: every main state, light and dark, small and medium, large text. */
  private val goldens =
    setOf(
      "w4-idle-small-light", "w4-idle-small-dark", "w4-idle-medium-light", "w4-idle-medium-wide-light", "w4-idle-medium-wide-dark",
      "w3-idle-snap-medium-wide-light", "w6-idle-no-usual-medium-light", "w7-idle-caffeine-note-medium-wide-light",
      "w8-picker-small-light", "w8-picker-medium-light", "w8-picker-medium-wide-dark", "w17-confirmation-medium-light",
      "w1-signed-out-medium-light", "w1-signed-out-small-dark", "w2-setup-medium-dark", "w9-my-flare-medium-wide-light",
      "w11-incoming-medium-light", "w4-idle-medium-wide-light-font200", "w4-idle-small-light-font200", "w8-picker-medium-light-font200",
    )

  /** Half size, so goldens stay small; the tolerance absorbs the resampling. */
  private fun half(b: Bitmap) = Bitmap.createScaledBitmap(b, b.width / 2, b.height / 2, true)

  /** null when `actual` matches the golden: at most 0.5% of pixels differ by more than 24 in a channel. */
  private fun goldenMismatch(name: String, actual: Bitmap): String? {
    val small = half(actual)
    goldenOut?.let {
      save(small, it, "$name.png")
      return null
    }
    val stream = javaClass.classLoader!!.getResourceAsStream("goldens/$name.png") ?: return "no golden (run with -PclinkUpdateGoldens)"
    val golden = stream.use { BitmapFactory.decodeStream(it) }
    if (golden.width != small.width || golden.height != small.height) return "size ${small.width}x${small.height}, golden ${golden.width}x${golden.height}"
    var off = 0
    for (y in 0 until small.height) for (x in 0 until small.width) {
      val a = small.getPixel(x, y)
      val g = golden.getPixel(x, y)
      val d = maxOf(Math.abs(Color.red(a) - Color.red(g)), Math.abs(Color.green(a) - Color.green(g)), Math.abs(Color.blue(a) - Color.blue(g)))
      if (d > 24) off++
    }
    val share = off.toDouble() / (small.width * small.height)
    return if (share > 0.005) "%.2f%% of pixels differ".format(share * 100) else null
  }

  private val problems = mutableListOf<String>()

  private fun shot(fixture: String, name: String, layout: Layout, night: Boolean, fontScale: Float = 1f, at: DpSize? = null): Bitmap {
    val bmp = render(fixture, layout, night, fontScale, at)
    val sizeName = at?.let { "-${it.width.value.toInt()}x${it.height.value.toInt()}" } ?: ""
    val file = "${fixture.lowercase()}-$name-${layoutName(layout)}$sizeName-${if (night) "dark" else "light"}${if (fontScale != 1f) "-font${(fontScale * 100).toInt()}" else ""}"
    for (cut in lastCut) problems += "$file: $cut"
    if (file in goldens) goldenMismatch(file, bmp)?.let { problems += "$file: $it" }
    save(bmp, outDir, "$file.png")
    return bmp
  }

  @Test
  fun rendersEveryStateWithNothingCut() {
    var n = 0
    for (c in cases) {
      for (layout in c.layouts) {
        for (night in listOf(false, true)) {
          assertTrue(shot(c.fixture, c.name, layout, night).width > 0)
          n++
        }
      }
    }
    // Large text (DESIGN.md 2.4, CLAUDE.md "Definition of done"): 1.3 and the largest, 2.0.
    for (scale in listOf(1.3f, 2.0f)) {
      for ((fx, name) in listOf("W4" to "idle", "W5" to "idle-no-friends", "W8" to "picker", "W17" to "confirmation", "W1" to "signed-out", "W11" to "incoming", "W9" to "my-flare", "W15" to "replied-in")) {
        for (layout in listOf(Layout.SMALL, Layout.SMALL_TALL, Layout.MEDIUM, Layout.MEDIUM_WIDE, Layout.MEDIUM_SHORT)) {
          shot(fx, name, layout, night = false, fontScale = scale)
          n++
        }
      }
    }
    // Real cells are taller and wider than the smallest size of each arrangement (round 3: the
    // CEO's Pixel 8 4x2). The widget is composed at its exact size, so these must fill, not stretch.
    val real =
      listOf(
        DpSize(250.dp, 180.dp), DpSize(250.dp, 200.dp), DpSize(300.dp, 180.dp), DpSize(300.dp, 200.dp),
        DpSize(360.dp, 200.dp), DpSize(170.dp, 140.dp), DpSize(170.dp, 190.dp), DpSize(330.dp, 140.dp),
      )
    for (at in real) {
      val layout = ModelBuilder.layoutFor(at.width.value, at.height.value)
      for ((fx, name) in listOf("W4" to "idle", "W5" to "idle-no-friends", "W8" to "picker", "W11" to "incoming", "W9" to "my-flare")) {
        for (night in listOf(false, true)) {
          shot(fx, name, layout, night, at = at)
          n++
        }
        if (fx == "W4" || fx == "W5") {
          for (scale in listOf(1.3f, 2.0f)) {
            shot(fx, name, layout, night = false, fontScale = scale, at = at)
            n++
          }
        }
      }
    }
    assertTrue(n > 60)
    val goldenNames = goldens.size
    assertTrue("$goldenNames goldens", goldenNames >= 20)
    assertTrue(problems.joinToString("\n"), problems.isEmpty())
  }

  /** Every drink picture as the widget draws it (cropped, capped at 1.5x), on its picker cell. */
  @Test
  fun drinkArtSheet() {
    val dir = outDir ?: return
    val catalog = org.json.JSONObject(File(Fixtures.dir, "../generated/catalog.json").readText()).getJSONArray("drinks")
    for (night in listOf(false, true)) {
      RuntimeEnvironment.setQualifiers(if (night) "+night" else "+notnight")
      val context: Context = ApplicationProvider.getApplicationContext()
      val d = context.resources.displayMetrics.density
      val cols = 7
      val cell = 96f
      val gap = 6f
      val rows = (catalog.length() + cols - 1) / cols
      val bmp = Bitmap.createBitmap(((cols * (cell + gap) + gap) * d).toInt(), ((rows * (cell + gap) + gap) * d).toInt(), Bitmap.Config.ARGB_8888)
      val canvas = Canvas(bmp)
      canvas.drawColor(context.getColor(app.clink.nativemodule.R.color.clink_surface_base))
      val paint = android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG).apply {
        textSize = 12f * d
        typeface = android.graphics.Typeface.create("sans-serif-medium", android.graphics.Typeface.NORMAL)
        color = context.getColor(app.clink.nativemodule.R.color.clink_ink_primary)
        textAlign = android.graphics.Paint.Align.CENTER
      }
      for (i in 0 until catalog.length()) {
        val drink = catalog.getJSONObject(i)
        val x = gap + (i % cols) * (cell + gap)
        val y = gap + (i / cols) * (cell + gap)
        val cat = drink.getString("category")
        val bg = context.resources.getIdentifier("clink_bg_cell_$cat", "drawable", context.packageName)
        context.getDrawable(bg)!!.apply { setBounds((x * d).toInt(), (y * d).toInt(), ((x + cell) * d).toInt(), ((y + cell) * d).toInt()) }.draw(canvas)
        val res = app.clink.widget.ui.DrinkIcons.iconL(drink.getString("id"))!!
        val (w, h) = app.clink.widget.ui.ArtAspect.box(context, res, cell - 12f, cell - 30f)
        val left = x + (cell - w) / 2
        val top = y + 6f + (cell - 30f - h)
        context.getDrawable(res)!!.apply { setBounds((left * d).toInt(), (top * d).toInt(), ((left + w) * d).toInt(), ((top + h) * d).toInt()) }.draw(canvas)
        canvas.drawText(drink.getString("widgetName"), (x + cell / 2) * d, (y + cell - 9f) * d, paint)
      }
      save(bmp, dir, "art-sheet-${if (night) "dark" else "light"}.png")
    }
  }

  @Test
  fun widgetPickerPreviews() {
    previewDir ?: return
    // The widget picker preview (DESIGN.md 5.5): light idle, sample data from W4.
    save(render("W4", Layout.SMALL, night = false), File(previewDir, "drawable-nodpi"), "clink_widget_preview_small.png")
    save(render("W4", Layout.MEDIUM_WIDE, night = false), File(previewDir, "drawable-nodpi"), "clink_widget_preview_medium.png")
  }
}
