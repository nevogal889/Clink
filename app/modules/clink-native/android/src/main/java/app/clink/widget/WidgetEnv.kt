package app.clink.widget

import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import app.clink.widget.net.HttpWidgetApi
import app.clink.widget.net.WidgetApi
import app.clink.widget.store.KeystoreTokenCipher
import app.clink.widget.store.TokenCipher
import app.clink.widget.store.TokenVault
import app.clink.widget.store.WidgetStore
import java.time.Clock

// The widget's few dependencies in one place, so tests can swap the clock, the Keystore cipher
// and the network without a DI framework.

object WidgetEnv {
  /** The device clock and zone. Tests set a fixed clock (java.time.Clock.fixed / offset). */
  @Volatile var clock: Clock = Clock.systemDefaultZone()

  /** null = the Android Keystore. Robolectric has no Keystore, so tests set a fake. */
  @Volatile var cipherOverride: TokenCipher? = null

  /** null = HTTPS to widget-api. */
  @Volatile var apiOverride: WidgetApi? = null

  fun store(context: Context): WidgetStore = WidgetStore.get(context)

  fun vault(context: Context): TokenVault =
    TokenVault(store(context), cipherOverride ?: KeystoreTokenCipher())

  fun api(context: Context): WidgetApi? =
    apiOverride ?: AppConfig.read(context).let { c -> c.functionsUrl?.let { HttpWidgetApi(it, c.region) } }
}

/**
 * Public build-time values the config plugin (app.plugin.js) writes into the manifest: the
 * Supabase functions URL and region (public by design, ARCHITECTURE.md 8.5, supabase/projects.json)
 * and the app's URL scheme for deep links.
 */
data class AppConfig(val functionsUrl: String?, val region: String?, val scheme: String?) {
  companion object {
    const val META_FUNCTIONS_URL = "app.clink.FUNCTIONS_URL"
    const val META_REGION = "app.clink.REGION"
    const val META_SCHEME = "app.clink.SCHEME"

    @Volatile private var cached: AppConfig? = null

    fun read(context: Context): AppConfig {
      cached?.let { return it }
      val meta =
        try {
          val pm = context.packageManager
          val info =
            if (Build.VERSION.SDK_INT >= 33) {
              pm.getApplicationInfo(context.packageName, PackageManager.ApplicationInfoFlags.of(PackageManager.GET_META_DATA.toLong()))
            } else {
              @Suppress("DEPRECATION") pm.getApplicationInfo(context.packageName, PackageManager.GET_META_DATA)
            }
          info.metaData
        } catch (e: Exception) {
          null
        }
      fun s(key: String) = meta?.getString(key)?.takeIf { it.isNotBlank() }
      val url = s(META_FUNCTIONS_URL)?.takeIf { it.startsWith("https://") }
      return AppConfig(url, s(META_REGION), s(META_SCHEME)).also { cached = it }
    }
  }
}

/** Where a widget tap opens the app (Expo Router routes in app/src/app). */
enum class AppRoute(val path: String) {
  HOME(""),
  CAMERA("camera"),
  USUAL("usual"),
  SETTINGS("settings");

  fun intent(context: Context): Intent {
    val scheme = AppConfig.read(context).scheme
    val launch =
      context.packageManager.getLaunchIntentForPackage(context.packageName) ?: Intent(Intent.ACTION_MAIN)
    if (scheme == null || this == HOME) {
      return launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }
    return Intent(Intent.ACTION_VIEW, Uri.parse("$scheme:///$path"))
      .setPackage(context.packageName)
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
  }
}
