package app.clink.widget.ui

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.unit.DpSize
import androidx.compose.ui.unit.dp
import androidx.glance.GlanceId
import androidx.glance.LocalContext
import androidx.glance.LocalSize
import androidx.glance.action.ActionParameters
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetManager
import androidx.glance.appwidget.SizeMode
import androidx.glance.appwidget.action.ActionCallback
import androidx.glance.appwidget.provideContent
import androidx.glance.appwidget.updateAll
import app.clink.widget.WidgetEnv
import app.clink.widget.model.Confirmation
import app.clink.widget.model.ConfirmationKind
import app.clink.widget.model.LocalMode
import app.clink.widget.model.LogCategory
import app.clink.widget.model.LogPayload
import app.clink.widget.model.Optimistic
import app.clink.widget.model.OutboxEntry
import app.clink.widget.model.OutboxLogic
import app.clink.widget.model.Timers
import app.clink.widget.model.WidgetConfig
import app.clink.widget.model.WidgetSize
import app.clink.widget.model.WidgetState
import app.clink.widget.store.Snapshot
import app.clink.widget.text.Copy
import app.clink.widget.work.Scheduler
import java.io.File
import java.time.Instant
import java.time.temporal.ChronoUnit
import java.util.UUID

// The Glance widget (ARCHITECTURE.md 1.1, 3; DESIGN.md 5.5). One GlanceAppWidget serves both
// providers (ClinkSmallWidgetReceiver, ClinkMediumWidgetReceiver); the layout follows the size the
// launcher gives it, with three responsive sizes plus a tall 2x2.

class ClinkWidget : GlanceAppWidget() {
  companion object {
    val SMALL = DpSize(120.dp, 120.dp)
    val SMALL_TALL = DpSize(120.dp, 150.dp)
    val MEDIUM_SHORT = DpSize(250.dp, 120.dp)
    val MEDIUM = DpSize(250.dp, 160.dp)
    val MEDIUM_WIDE = DpSize(300.dp, 160.dp)
  }

  override val sizeMode = SizeMode.Responsive(setOf(SMALL, SMALL_TALL, MEDIUM_SHORT, MEDIUM, MEDIUM_WIDE))

  override suspend fun provideGlance(context: Context, id: GlanceId) {
    val appWidgetId = GlanceAppWidgetManager(context).getAppWidgetId(id)
    val store = WidgetEnv.store(context)
    val first = store.snapshot()
    provideContent {
      val snap by store.snapshots.collectAsState(initial = first)
      Render(snap, appWidgetId)
    }
  }
}

@Composable
fun Render(snap: Snapshot, appWidgetId: Int) {
  val context = LocalContext.current
  val size = LocalSize.current
  val now = Instant.now(WidgetEnv.clock)
  val zone = WidgetEnv.clock.zone
  val layout = ModelBuilder.layoutFor(size.width.value, size.height.value)
  val config = snap.configs[appWidgetId] ?: WidgetConfig(if (layout.small) WidgetSize.SMALL else WidgetSize.MEDIUM)
  val state = Optimistic.apply(snap.state, snap.outbox, snap.countsReceivedAt, now, zone)
  val fontScale = context.resources.configuration.fontScale
  val model = ModelBuilder(Copy(context)).build(state, snap.local(appWidgetId), config, layout, fontScale, now, zone)
  WidgetContent(model)
}

/** Cached images the app downloaded for the widget (ARCHITECTURE.md 3.1): app cache, 480 px max. */
object WidgetFiles {
  private const val MAX_PX = 480

  fun dir(context: Context) = File(context.cacheDir, "clink-widget")

  fun thumb(context: Context, name: String): Bitmap? {
    if (!Regex("""^[a-z]{1,3}_[A-Za-z0-9._-]{1,120}$""").matches(name)) return null
    val f = File(dir(context), name)
    if (!f.isFile) return null
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeFile(f.path, bounds)
    var sample = 1
    while (bounds.outWidth / (sample * 2) >= MAX_PX || bounds.outHeight / (sample * 2) >= MAX_PX) sample *= 2
    return BitmapFactory.decodeFile(f.path, BitmapFactory.Options().apply { inSampleSize = sample })
  }
}

// ---------------------------------------------------------------------------------------------
// Actions. Each returns quickly: it writes local state, then hands network work to WorkManager
// (ARCHITECTURE.md 3.2: an ActionCallback must return fast).

private suspend fun idOf(context: Context, glanceId: GlanceId) = GlanceAppWidgetManager(context).getAppWidgetId(glanceId)

private suspend fun afterChange(context: Context) {
  WidgetEnv.store(context).bumpTick(Instant.now(WidgetEnv.clock))
  ClinkWidget().updateAll(context)
  Scheduler.replan(context)
}

class OpenPickerAction : ActionCallback {
  override suspend fun onAction(context: Context, glanceId: GlanceId, parameters: ActionParameters) {
    val now = Instant.now(WidgetEnv.clock)
    WidgetEnv.store(context).updateLocal(idOf(context, glanceId)) {
      it.copy(mode = LocalMode.PICKER, modeFlareId = null, modeOpenedAt = now, confirmation = null)
    }
    afterChange(context)
  }
}

class ClosePickerAction : ActionCallback {
  override suspend fun onAction(context: Context, glanceId: GlanceId, parameters: ActionParameters) {
    WidgetEnv.store(context).updateLocal(idOf(context, glanceId)) {
      it.copy(mode = LocalMode.IDLE, modeFlareId = null, modeOpenedAt = null)
    }
    afterChange(context)
  }
}

class LogDrinkAction : ActionCallback {
  companion object {
    /** 1 to 3: the usual slot. 0: water. */
    val SLOT = ActionParameters.Key<Int>("slot")
  }

  override suspend fun onAction(context: Context, glanceId: GlanceId, parameters: ActionParameters) {
    val slot = parameters[SLOT] ?: return
    val id = idOf(context, glanceId)
    LogDrink.log(context, id, slot)
    afterChange(context)
    Scheduler.sync(context)
  }
}

/** The log itself, outside Glance so tests can drive it. */
object LogDrink {
  /** Water from the widget logs still water (PRD 3.11 rule 8). */
  const val WATER_ID = "water.still"

  /** Returns the queued entry, or null when the slot no longer exists. */
  suspend fun log(context: Context, appWidgetId: Int, slot: Int): OutboxEntry.Log? {
    val store = WidgetEnv.store(context)
    val now = Instant.now(WidgetEnv.clock).truncatedTo(ChronoUnit.SECONDS)
    val state = store.snapshot().state as? WidgetState.Ready ?: return null
    val payload: LogPayload
    val short: String?
    if (slot == 0) {
      payload = LogPayload(WATER_ID, null, LogCategory.WATER, now)
      short = null
    } else {
      val u = state.usual.firstOrNull { it.slot == slot } ?: return null
      // A catalog drink sends its slot too, so a saved Decaf counts right (widgetLogInput).
      payload = LogPayload(u.drinkId, u.slot, LogCategory.of(u.category), now)
      short = u.drinkShort
    }
    val entry = OutboxEntry.Log(UUID.randomUUID().toString(), now, payload)
    store.updateOutbox { OutboxLogic.enqueue(it, entry) }
    store.updateLocal(appWidgetId) {
      it.copy(
        mode = LocalMode.IDLE,
        modeFlareId = null,
        modeOpenedAt = null,
        confirmation = Confirmation(ConfirmationKind.LOGGED, short, now.plusSeconds(Timers.WIDGET_CONFIRMATION_SEC)),
      )
    }
    return entry
  }
}

class RetryAction : ActionCallback {
  companion object {
    val OP = ActionParameters.Key<String>("op")
  }

  override suspend fun onAction(context: Context, glanceId: GlanceId, parameters: ActionParameters) {
    val op = parameters[OP] ?: return
    WidgetEnv.store(context).updateOutbox { OutboxLogic.retryNow(it, op) }
    afterChange(context)
    Scheduler.sync(context)
  }
}
