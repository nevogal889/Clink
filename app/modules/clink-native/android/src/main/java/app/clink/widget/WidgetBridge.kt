package app.clink.widget

import android.content.Context
import app.clink.widget.model.OutboxLogic
import app.clink.widget.model.WidgetSize
import app.clink.widget.model.WidgetStateDecoder
import app.clink.widget.model.WidgetStateException
import app.clink.widget.work.Scheduler
import app.clink.widget.work.redrawAll
import java.time.Instant
import org.json.JSONObject

// What the JS module calls (app/modules/clink-native/src/ClinkNative.ts), as plain Kotlin so the
// harness tests run it without React Native. ClinkNativeModule (src/expo) is a thin adapter.

class InvalidWidgetStateException(message: String) : IllegalArgumentException(message)

class WidgetBridge(private val context: Context) {
  private val store = WidgetEnv.store(context)
  private fun now() = Instant.now(WidgetEnv.clock)

  /** Stores the state from widget-api/state (or one the app built) and redraws. */
  suspend fun setWidgetState(json: String) {
    try {
      WidgetStateDecoder.decode(json)
    } catch (e: WidgetStateException) {
      // The message names the field, never its value.
      throw InvalidWidgetStateException("Widget state refused: ${e.message}")
    }
    store.putStateJson(json, now())
    redrawAll(context)
  }

  /** Stores (or with null, removes) the widget token, then flushes anything queued. */
  suspend fun setWidgetToken(token: String?) {
    if (token != null) require(Regex("^[A-Za-z0-9_-]{43}$").matches(token)) { "Not a widget token" }
    WidgetEnv.vault(context).put(token)
    if (token != null) {
      Scheduler.ensurePeriodic(context)
      Scheduler.sync(context)
    }
  }

  fun getInstalledWidgets(): List<Map<String, Any>> =
    Widgets.installed(context).map { mapOf("id" to it.id, "size" to it.size.key) }

  fun requestPinWidget(size: String): Boolean {
    val s = WidgetSize.of(size) ?: throw IllegalArgumentException("Unknown size")
    return Widgets.requestPin(context, s)
  }

  suspend fun reloadWidgets() = redrawAll(context)

  suspend fun getOutbox(): Map<String, Any> {
    val out = store.snapshot().outbox
    return mapOf("pending" to out.items.map { jsonToMap(OutboxLogic.entryJson(it.entry)) }, "dropped" to dropped(out.dropped))
  }

  /** Flushes now (on app open, ARCHITECTURE.md 3.2) and hands over the drops for off.* messages. */
  suspend fun drainOutbox(): List<Map<String, Any>> {
    store.updateOutbox { OutboxLogic.expire(it, now()) }
    var taken = emptyList<app.clink.widget.model.DroppedOp>()
    store.updateOutbox { s ->
      val (rest, drops) = OutboxLogic.drainDropped(s)
      taken = drops
      rest
    }
    if (store.snapshot().outbox.items.isNotEmpty()) Scheduler.sync(context)
    return dropped(taken)
  }

  /** Sign-out (ARCHITECTURE.md 3.6): everything goes, every widget shows signed out. */
  suspend fun clearAll() {
    store.clearAll(now())
    WidgetFilesCleaner.clear(context)
    redrawAll(context)
  }

  private fun dropped(list: List<app.clink.widget.model.DroppedOp>) =
    list.map { mapOf("id" to it.id, "op" to it.op, "droppedAt" to it.droppedAt.toString()) }

  companion object {
    fun jsonToMap(o: JSONObject): Map<String, Any?> =
      o.keys().asSequence().associateWith { k ->
        when (val v = o.get(k)) {
          JSONObject.NULL -> null
          is JSONObject -> jsonToMap(v)
          else -> v
        }
      }
  }
}

object WidgetFilesCleaner {
  fun clear(context: Context) {
    app.clink.widget.ui.WidgetFiles.dir(context).deleteRecursively()
  }
}
