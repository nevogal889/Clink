package app.clink.nativemodule

import android.content.Context
import app.clink.widget.InvalidWidgetStateException
import app.clink.widget.WidgetBridge
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

// The Expo module the app calls as `ClinkNative` (app/modules/clink-native/src/ClinkNative.ts).
// A thin adapter over WidgetBridge, which holds the logic and is tested without React Native.

private class WidgetStateRejected(message: String) : CodedException("ERR_WIDGET_STATE_INVALID", message, null)

class ClinkNativeModule : Module() {
  private val context: Context
    get() = appContext.reactContext?.applicationContext ?: throw Exceptions.AppContextLost()

  private val bridge by lazy { WidgetBridge(context) }

  override fun definition() = ModuleDefinition {
    Name("ClinkNative")

    Constant("widgetsSupported") { true }

    AsyncFunction("setWidgetState") Coroutine { json: String ->
      try {
        bridge.setWidgetState(json)
      } catch (e: InvalidWidgetStateException) {
        throw WidgetStateRejected(e.message ?: "Widget state refused")
      }
    }

    AsyncFunction("setWidgetToken") Coroutine { token: String? -> bridge.setWidgetToken(token) }

    AsyncFunction("getInstalledWidgets") { bridge.getInstalledWidgets() }

    AsyncFunction("requestPinWidget") { size: String -> bridge.requestPinWidget(size) }

    AsyncFunction("reloadWidgets") Coroutine { -> bridge.reloadWidgets() }

    AsyncFunction("getOutbox") Coroutine { -> bridge.getOutbox() }

    AsyncFunction("drainOutbox") Coroutine { -> bridge.drainOutbox() }

    AsyncFunction("takeRejected") Coroutine { -> bridge.takeRejected() }

    AsyncFunction("clearAll") Coroutine { -> bridge.clearAll() }
  }
}
