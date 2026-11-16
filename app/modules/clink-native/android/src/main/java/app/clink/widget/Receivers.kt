package app.clink.widget

import android.appwidget.AppWidgetManager
import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.updateAll
import app.clink.widget.model.WidgetConfig
import app.clink.widget.model.WidgetSize
import app.clink.widget.ui.ClinkWidget
import app.clink.widget.work.Scheduler
import app.clink.widget.work.redrawAll
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

// Two providers so the widget picker offers Small and Medium (PRD F8: "Clink, Medium"), both
// resizable and drawn by the same ClinkWidget. The provider an instance came from is its size for
// getInstalledWidgets(); the layout itself follows the actual size.

private val receiverScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

private fun BroadcastReceiver.async(block: suspend () -> Unit) {
  val pending = goAsync()
  receiverScope.launch {
    try {
      block()
    } finally {
      pending.finish()
    }
  }
}

abstract class ClinkWidgetReceiverBase(private val size: WidgetSize) : GlanceAppWidgetReceiver() {
  override val glanceAppWidget: GlanceAppWidget = ClinkWidget()

  override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
    super.onUpdate(context, appWidgetManager, appWidgetIds)
    val store = WidgetEnv.store(context)
    async {
      val known = store.snapshot().configs
      for (id in appWidgetIds) if (id !in known) store.putConfig(id, WidgetConfig(size))
      Scheduler.ensurePeriodic(context)
      Scheduler.replan(context)
      // A new instance is reported to the server on the next state call (ARCHITECTURE.md 3.5).
      Scheduler.sync(context)
    }
  }

  override fun onDeleted(context: Context, appWidgetIds: IntArray) {
    super.onDeleted(context, appWidgetIds)
    async { WidgetEnv.store(context).forgetWidgets(appWidgetIds) }
  }

  override fun onDisabled(context: Context) {
    super.onDisabled(context)
    if (Widgets.installed(context).isEmpty()) Scheduler.cancelAll(context)
  }
}

class ClinkSmallWidgetReceiver : ClinkWidgetReceiverBase(WidgetSize.SMALL)

class ClinkMediumWidgetReceiver : ClinkWidgetReceiverBase(WidgetSize.MEDIUM)

/**
 * Boot, clock and zone changes: the Chronometer bases and the midnight job depend on the clock, so
 * every widget redraws and the jobs are planned again.
 */
class ClinkSystemEventsReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    when (intent.action) {
      Intent.ACTION_BOOT_COMPLETED,
      Intent.ACTION_TIME_CHANGED,
      Intent.ACTION_TIMEZONE_CHANGED,
      Intent.ACTION_LOCALE_CHANGED,
      Intent.ACTION_MY_PACKAGE_REPLACED -> Unit
      else -> return
    }
    if (Widgets.installed(context).isEmpty()) return
    async {
      redrawAll(context)
      Scheduler.ensurePeriodic(context)
    }
  }
}

object Widgets {
  data class Installed(val id: Int, val size: WidgetSize)

  fun installed(context: Context): List<Installed> {
    val m = AppWidgetManager.getInstance(context) ?: return emptyList()
    fun ids(cls: Class<*>) = m.getAppWidgetIds(ComponentName(context, cls)).toList()
    return ids(ClinkSmallWidgetReceiver::class.java).map { Installed(it, WidgetSize.SMALL) } +
      ids(ClinkMediumWidgetReceiver::class.java).map { Installed(it, WidgetSize.MEDIUM) }
  }

  /** Asks the launcher to add a widget (Android 8+ where the launcher supports it). */
  fun requestPin(context: Context, size: WidgetSize): Boolean {
    val m = AppWidgetManager.getInstance(context) ?: return false
    if (!m.isRequestPinAppWidgetSupported) return false
    val cls = if (size == WidgetSize.SMALL) ClinkSmallWidgetReceiver::class.java else ClinkMediumWidgetReceiver::class.java
    return m.requestPinAppWidget(ComponentName(context, cls), null, null)
  }

  suspend fun reloadAll(context: Context) {
    ClinkWidget().updateAll(context)
  }
}
