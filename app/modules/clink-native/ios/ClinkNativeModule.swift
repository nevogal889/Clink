import ExpoModulesCore

// iOS side of clink-native: a typed no-op until the Apple Developer account exists and the
// WidgetKit extension can be built (docs/build-notes/android-widget.md, "Deviation"). Same names
// and shapes as the Android module (android/src/expo/.../ClinkNativeModule.kt), so the app builds
// and runs on iOS today and the JS never branches on platform.
public class ClinkNativeModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ClinkNative")

    Constant("widgetsSupported") { false }

    AsyncFunction("setWidgetState") { (_: String) in }

    AsyncFunction("setWidgetToken") { (_: String?) in }

    AsyncFunction("getInstalledWidgets") { () -> [[String: Any]] in [] }

    AsyncFunction("requestPinWidget") { (_: String) -> Bool in false }

    AsyncFunction("reloadWidgets") {}

    AsyncFunction("getOutbox") { () -> [String: Any] in ["pending": [], "dropped": []] }

    AsyncFunction("drainOutbox") { () -> [[String: Any]] in [] }

    AsyncFunction("clearAll") {}
  }
}
