package app.clink.widget.work

import android.content.Context
import android.os.Build
import androidx.glance.appwidget.updateAll
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.OutOfQuotaPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import app.clink.widget.WidgetEnv
import app.clink.widget.ui.ClinkWidget
import java.time.Duration
import java.time.Instant
import java.util.concurrent.TimeUnit

// WorkManager jobs (ARCHITECTURE.md 3.2, 3.3 Android item 3). No JS runs in any of them.
//   clink.sync      expedited one-off with a network constraint: flush the outbox, then refresh
//   clink.tick      one-off at the next UI deadline (picker 30 s, confirmation 4 s, Failed 30 s)
//   clink.midnight  one-off at local midnight: today's counts reset with no network
//   clink.refresh   every 15 minutes (the platform minimum), refresh state older than 10 minutes

object Scheduler {
  const val SYNC = "clink.sync"
  const val TICK = "clink.tick"
  const val MIDNIGHT = "clink.midnight"
  const val REFRESH = "clink.refresh"

  private val online = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()

  fun sync(context: Context) {
    val b =
      OneTimeWorkRequestBuilder<SyncWorker>()
        .setConstraints(online)
        .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 10, TimeUnit.SECONDS)
    // Expedited work before Android 12 needs a foreground notification; a plain job with the same
    // network constraint runs promptly there, so only 12+ asks for expedited.
    if (Build.VERSION.SDK_INT >= 31) b.setExpedited(OutOfQuotaPolicy.RUN_AS_NON_EXPEDITED_WORK_REQUEST)
    // Append so ops queued while a flush runs are sent by the next one, never skipped.
    WorkManager.getInstance(context).enqueueUniqueWork(SYNC, ExistingWorkPolicy.APPEND_OR_REPLACE, b.build())
  }

  /** Re-plans the tick and midnight jobs from the stored data. Call after every change. */
  suspend fun replan(context: Context) {
    val now = Instant.now(WidgetEnv.clock)
    val zone = WidgetEnv.clock.zone
    val snap = WidgetEnv.store(context).snapshot()
    val wm = WorkManager.getInstance(context)
    val next = Deadlines.nextUiChange(snap, now, zone)
    if (next != null) {
      wm.enqueueUniqueWork(
        TICK,
        ExistingWorkPolicy.REPLACE,
        OneTimeWorkRequestBuilder<TickWorker>().setInitialDelay(delayMs(now, next), TimeUnit.MILLISECONDS).build(),
      )
    }
    // A second past midnight, so the render is past the date change even with a little drift.
    val midnight = Deadlines.nextMidnight(now, zone).plusSeconds(1)
    wm.enqueueUniqueWork(
      MIDNIGHT,
      ExistingWorkPolicy.REPLACE,
      OneTimeWorkRequestBuilder<TickWorker>().setInitialDelay(delayMs(now, midnight), TimeUnit.MILLISECONDS).build(),
    )
  }

  fun ensurePeriodic(context: Context) {
    WorkManager.getInstance(context)
      .enqueueUniquePeriodicWork(
        REFRESH,
        ExistingPeriodicWorkPolicy.KEEP,
        PeriodicWorkRequestBuilder<RefreshWorker>(15, TimeUnit.MINUTES).setConstraints(online).build(),
      )
  }

  fun cancelAll(context: Context) {
    val wm = WorkManager.getInstance(context)
    listOf(SYNC, TICK, MIDNIGHT, REFRESH).forEach { wm.cancelUniqueWork(it) }
  }

  fun delayMs(now: Instant, at: Instant): Long = maxOf(0L, Duration.between(now, at).toMillis())
}

/** Redraws every widget and re-plans the timers. */
suspend fun redrawAll(context: Context) {
  val now = Instant.now(WidgetEnv.clock)
  val store = WidgetEnv.store(context)
  store.settleLocals(now)
  store.updateOutbox { app.clink.widget.model.OutboxLogic.expire(it, now) }
  store.bumpTick(now)
  ClinkWidget().updateAll(context)
  Scheduler.replan(context)
}

class SyncWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
  override suspend fun doWork(): Result {
    val out = Sync.flush(applicationContext)
    redrawAll(applicationContext)
    return if (out.retry) Result.retry() else Result.success()
  }
}

class TickWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
  override suspend fun doWork(): Result {
    // Late is fine: the render works out the date and timers from the clock, not from when the job
    // was meant to run (a midnight job delayed by Doze still draws today's zeros).
    redrawAll(applicationContext)
    return Result.success()
  }
}

class RefreshWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
  override suspend fun doWork(): Result {
    val out = Sync.flush(applicationContext)
    redrawAll(applicationContext)
    return if (out.retry) Result.retry() else Result.success()
  }
}
