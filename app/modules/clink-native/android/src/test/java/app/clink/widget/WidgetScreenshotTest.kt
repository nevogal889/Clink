package app.clink.widget

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.view.View
import android.widget.FrameLayout
import androidx.compose.ui.unit.DpSize
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
// Without -PclinkScreens the test still renders every case (so CI catches a crash) and writes nothing.

@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(qualifiers = "w411dp-h891dp-xxhdpi")
class WidgetScreenshotTest {
  private val outDir = System.getProperty("clink.screens")?.let(::File)
  private val previewDir = System.getProperty("clink.previews")?.let(::File)

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

  private fun render(fixture: String, layout: Layout, night: Boolean, fontScale: Float = 1f): Bitmap {
    RuntimeEnvironment.setQualifiers(if (night) "+night" else "+notnight")
    RuntimeEnvironment.setFontScale(fontScale)
    val context: Context = ApplicationProvider.getApplicationContext()
    val f = Fixtures.widgetStates().first { it.id == fixture }
    WidgetEnv.clock = Clock.fixed(f.now, f.zone)
    val state = WidgetStateDecoder.decode(f.stateJson)
    val model =
      ModelBuilder(Copy(context)).build(state, f.local ?: WidgetLocal.EMPTY, f.config(WidgetSize.MEDIUM), layout, fontScale, f.now, f.zone)
    val dp = size(layout)
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
      Case("W5", "idle-no-friends", listOf(Layout.MEDIUM)),
      Case("W6", "idle-no-usual", listOf(Layout.SMALL, Layout.MEDIUM)),
      Case("W7", "idle-caffeine-note", listOf(Layout.MEDIUM_WIDE)),
      Case("W22", "idle-new-day", listOf(Layout.SMALL, Layout.MEDIUM)),
      Case("W8", "picker", listOf(Layout.SMALL, Layout.MEDIUM, Layout.MEDIUM_WIDE, Layout.MEDIUM_SHORT, Layout.SMALL_TALL)),
      Case("W17", "confirmation", listOf(Layout.SMALL, Layout.MEDIUM)),
      Case("W19", "failed", listOf(Layout.SMALL, Layout.MEDIUM)),
      Case("W1", "signed-out", listOf(Layout.SMALL, Layout.MEDIUM)),
      Case("W2", "setup", listOf(Layout.SMALL, Layout.MEDIUM)),
      Case("W9", "my-flare", listOf(Layout.SMALL, Layout.MEDIUM, Layout.MEDIUM_WIDE)),
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

  @Test
  fun rendersEveryState() {
    var n = 0
    for (c in cases) {
      for (layout in c.layouts) {
        for (night in listOf(false, true)) {
          val bmp = render(c.fixture, layout, night)
          assertTrue(bmp.width > 0)
          save(bmp, outDir, "${c.fixture.lowercase()}-${c.name}-${layoutName(layout)}-${if (night) "dark" else "light"}.png")
          n++
        }
      }
    }
    // Largest font scale (DESIGN.md 2.4, CLAUDE.md "Definition of done").
    for ((fx, name) in listOf("W4" to "idle", "W8" to "picker")) {
      for (layout in listOf(Layout.SMALL, Layout.MEDIUM, Layout.MEDIUM_WIDE)) {
        save(render(fx, layout, night = false, fontScale = 2.0f), outDir, "${fx.lowercase()}-$name-${layoutName(layout)}-light-font200.png")
        n++
      }
    }
    assertTrue(n > 60)
  }

  @Test
  fun widgetPickerPreviews() {
    previewDir ?: return
    // The widget picker preview (DESIGN.md 5.5): light idle, sample data from W4.
    save(render("W4", Layout.SMALL, night = false), File(previewDir, "drawable-nodpi"), "clink_widget_preview_small.png")
    save(render("W4", Layout.MEDIUM_WIDE, night = false), File(previewDir, "drawable-nodpi"), "clink_widget_preview_medium.png")
  }
}
