package app.clink.widget

import android.content.Context
import androidx.compose.ui.unit.DpSize
import androidx.glance.action.actionParametersOf
import androidx.glance.appwidget.testing.unit.assertHasRunCallbackClickAction
import androidx.glance.appwidget.testing.unit.runGlanceAppWidgetUnitTest
import androidx.glance.testing.unit.hasContentDescriptionEqualTo
import androidx.glance.testing.unit.hasText
import androidx.glance.testing.unit.hasTextEqualTo
import androidx.test.core.app.ApplicationProvider
import app.clink.widget.model.WidgetStateDecoder
import app.clink.widget.text.Copy
import app.clink.widget.ui.ClinkWidget
import app.clink.widget.ui.ClosePickerAction
import app.clink.widget.ui.Content
import app.clink.widget.ui.Layout
import app.clink.widget.ui.LogDrinkAction
import app.clink.widget.ui.ModelBuilder
import app.clink.widget.ui.OpenPickerAction
import app.clink.widget.ui.RetryAction
import app.clink.widget.ui.WidgetContent
import app.clink.widget.ui.WidgetModel
import java.time.Clock
import java.time.ZoneOffset
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

// Glance composition tests (glance-appwidget-testing) for the M2 states at small and medium:
// idle, +1 picker, failed, signed out and setup. Every string comes from the generated COPY.md
// resources, and every button has its COPY.md 4.26 label and the right action.

@RunWith(RobolectricTestRunner::class)
class GlanceRenderTest {
  private val context: Context = ApplicationProvider.getApplicationContext()
  private val copy = Copy(context)

  @After
  fun tearDown() {
    WidgetEnv.clock = Clock.system(ZoneOffset.UTC)
  }

  private fun model(id: String, layout: Layout, fontScale: Float = 1f): WidgetModel {
    val f = Fixtures.widgetStates().first { it.id == id }
    WidgetEnv.clock = Clock.fixed(f.now, f.zone)
    val state = WidgetStateDecoder.decode(f.stateJson)
    return ModelBuilder(copy).build(state, f.local ?: app.clink.widget.model.WidgetLocal.EMPTY, f.config(app.clink.widget.model.WidgetSize.MEDIUM), layout, fontScale, f.now, f.zone)
  }

  private fun size(layout: Layout): DpSize =
    when (layout) {
      Layout.SMALL -> ClinkWidget.SMALL
      Layout.SMALL_TALL -> ClinkWidget.SMALL_TALL
      Layout.MEDIUM_SHORT -> ClinkWidget.MEDIUM_SHORT
      Layout.MEDIUM -> ClinkWidget.MEDIUM
      Layout.MEDIUM_WIDE -> ClinkWidget.MEDIUM_WIDE
    }

  private fun render(m: WidgetModel, block: androidx.glance.appwidget.testing.unit.GlanceAppWidgetUnitTest.() -> Unit) =
    runGlanceAppWidgetUnitTest {
      setContext(context)
      setAppWidgetSize(size(m.layout))
      provideComposable { WidgetContent(m) }
      block()
    }

  private fun s(id: Int, vararg vars: Pair<String, Any>) = copy.t(id, *vars)

  @Test
  fun idleSmall() {
    val m = model("W4", Layout.SMALL)
    assertTrue(m.content is Content.Idle)
    render(m) {
      onNode(hasTextEqualTo("drinks")).assertExists()
      onNode(hasContentDescriptionEqualTo(s(app.clink.nativemodule.R.string.clink_a11y_w_log)))
        .assertHasRunCallbackClickAction<OpenPickerAction>()
      onNode(hasText(s(app.clink.nativemodule.R.string.clink_ws_log))).assertExists()
      // The small layout has no Who joins? (PRD 3.3 small states).
      onNode(hasText(s(app.clink.nativemodule.R.string.clink_wm_flare))).assertDoesNotExist()
    }
  }

  @Test
  fun idleMedium() {
    render(model("W4", Layout.MEDIUM)) {
      onNode(hasText(s(app.clink.nativemodule.R.string.clink_wm_flare))).assertExists()
      onNode(hasTextEqualTo("4 waters")).assertExists()
      // About 250 dp wide: the usual #1 line is the first text line to go (DESIGN.md 5.1).
      onNode(hasTextEqualTo("Flat White")).assertDoesNotExist()
    }
    val m = model("W4", Layout.MEDIUM_WIDE)
    render(m) {
      onNode(hasText(s(app.clink.nativemodule.R.string.clink_wm_flare))).assertExists()
      onNode(hasTextEqualTo("Flat White")).assertExists()
      onNode(hasText(s(app.clink.nativemodule.R.string.clink_wm_snap_none))).assertExists()
      onNode(hasContentDescriptionEqualTo(s(app.clink.nativemodule.R.string.clink_a11y_w_camera))).assertExists()
      onNode(hasContentDescriptionEqualTo("3 drinks and 4 waters today. Last drink 1 hour 42 minutes ago.")).assertExists()
      onNode(hasContentDescriptionEqualTo("Send a coffee flare to Work, now")).assertExists()
    }
  }

  @Test
  fun pickerMediumLogsEachUsualAndWater() {
    val m = model("W8", Layout.MEDIUM)
    render(m) {
      onNode(hasText(s(app.clink.nativemodule.R.string.clink_wm_pick_title))).assertExists()
      onNode(hasContentDescriptionEqualTo("Log Flat White"))
        .assertHasRunCallbackClickAction<LogDrinkAction>(actionParametersOf(LogDrinkAction.SLOT to 1))
      onNode(hasContentDescriptionEqualTo("Log Ceremonial Matcha"))
        .assertHasRunCallbackClickAction<LogDrinkAction>(actionParametersOf(LogDrinkAction.SLOT to 2))
      onNode(hasContentDescriptionEqualTo(s(app.clink.nativemodule.R.string.clink_a11y_w_pick_water)))
        .assertHasRunCallbackClickAction<LogDrinkAction>(actionParametersOf(LogDrinkAction.SLOT to 0))
      onNode(hasContentDescriptionEqualTo(s(app.clink.nativemodule.R.string.clink_a11y_w_close)))
        .assertHasRunCallbackClickAction<ClosePickerAction>()
    }
  }

  @Test
  fun pickerSmallIsAGridWithNoHeader() {
    val m = model("W8", Layout.SMALL)
    render(m) {
      onNode(hasText(s(app.clink.nativemodule.R.string.clink_ws_pick_water))).assertExists()
      onAllNodes(hasText("Flat White")).assertCountEquals(1)
      // A short 2x2 drops the header and close button; the 30 s timeout is the cancel (DESIGN.md 5.3).
      onNode(hasContentDescriptionEqualTo(s(app.clink.nativemodule.R.string.clink_a11y_w_close))).assertDoesNotExist()
    }
    render(model("W8", Layout.SMALL_TALL)) {
      onNode(hasContentDescriptionEqualTo(s(app.clink.nativemodule.R.string.clink_a11y_w_close))).assertExists()
    }
  }

  @Test
  fun failedAtBothSizesRetriesInPlace() {
    val op = "3a4b5c6d-7e8f-4a9b-8c0d-1e2f3a4b5c6d"
    render(model("W19", Layout.MEDIUM)) {
      onNode(hasTextEqualTo(s(app.clink.nativemodule.R.string.clink_wm_failed))).assertExists()
      onNode(hasContentDescriptionEqualTo(s(app.clink.nativemodule.R.string.clink_a11y_w_failed)))
        .assertHasRunCallbackClickAction<RetryAction>(actionParametersOf(RetryAction.OP to op))
    }
    render(model("W19", Layout.SMALL)) {
      onNode(hasTextEqualTo(s(app.clink.nativemodule.R.string.clink_ws_failed))).assertExists()
    }
  }

  @Test
  fun signedOutAndSetupAtBothSizes() {
    render(model("W1", Layout.MEDIUM)) {
      onNode(hasTextEqualTo("Sign in to Clink")).assertExists()
      onNode(hasContentDescriptionEqualTo("Open Clink to sign in")).assertExists()
    }
    render(model("W1", Layout.SMALL)) { onNode(hasTextEqualTo("Open Clink")).assertExists() }
    render(model("W2", Layout.MEDIUM)) {
      onNode(hasTextEqualTo("Open Clink to finish setup")).assertExists()
      onNode(hasContentDescriptionEqualTo("Open Clink to finish setup")).assertExists()
    }
    render(model("W2", Layout.SMALL)) { onNode(hasTextEqualTo("Open Clink")).assertExists() }
  }

  @Test
  fun confirmationReplacesTheActionRow() {
    render(model("W17", Layout.MEDIUM)) {
      onNode(hasTextEqualTo(s(app.clink.nativemodule.R.string.clink_wm_logged))).assertExists()
      onNode(hasContentDescriptionEqualTo("Logged Flat White")).assertExists()
      onNode(hasText(s(app.clink.nativemodule.R.string.clink_wm_flare))).assertDoesNotExist()
    }
  }

  @Test
  fun largestFontScaleCapsTextAndDropsSecondaryLines() {
    val m = model("W4", Layout.MEDIUM_WIDE, fontScale = 2.0f)
    assertTrue(m.compactText)
    assertEquals(0.65f, m.textScale, 0.001f)
    render(m) {
      // Usual #1 goes first (DESIGN.md 5.1); counts and buttons stay.
      onNode(hasTextEqualTo("Flat White")).assertDoesNotExist()
      onNode(hasTextEqualTo("drinks")).assertExists()
      onNode(hasText(s(app.clink.nativemodule.R.string.clink_wm_flare))).assertExists()
    }
  }

  @Test
  fun noUsualOpensTheEditorAndNoFriendsInvites() {
    val noUsual = model("W6", Layout.MEDIUM).content as Content.Idle
    assertEquals(app.clink.widget.ui.Tap.Open(AppRoute.USUAL), noUsual.log.tap)
    val noFriends = model("W5", Layout.MEDIUM).content as Content.Idle
    assertEquals(s(app.clink.nativemodule.R.string.clink_wm_invite), noFriends.whoJoins.label)
    val caff = model("W7", Layout.MEDIUM_WIDE).content as Content.Idle
    assertEquals(s(app.clink.nativemodule.R.string.clink_wm_caff), caff.usual?.text)
  }
}
