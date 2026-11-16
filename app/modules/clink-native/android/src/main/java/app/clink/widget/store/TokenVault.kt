package app.clink.widget.store

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

// The widget token (ARCHITECTURE.md 3.1, 4.4) at rest: AES-256-GCM with a key that lives in the
// Android Keystore and never leaves it. Jetpack Security Crypto is deprecated, so the Keystore is
// used directly. Stored as base64(iv || ciphertext) in the widget DataStore. The token is never
// logged and never returned to JS.

interface TokenCipher {
  fun encrypt(plain: ByteArray): ByteArray

  /** Throws when the key is gone (restore to a new device, key invalidated): the token is dropped. */
  fun decrypt(sealed: ByteArray): ByteArray
}

class KeystoreTokenCipher(private val alias: String = ALIAS) : TokenCipher {
  companion object {
    const val ALIAS = "clink.widget.token.v1"
    private const val PROVIDER = "AndroidKeyStore"
    private const val TRANSFORM = "AES/GCM/NoPadding"
    private const val IV_BYTES = 12
    private const val TAG_BITS = 128
  }

  private fun key(): SecretKey {
    val ks = KeyStore.getInstance(PROVIDER).apply { load(null) }
    (ks.getEntry(alias, null) as? KeyStore.SecretKeyEntry)?.let { return it.secretKey }
    val gen = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, PROVIDER)
    gen.init(
      KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
        .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
        .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
        .setKeySize(256)
        // Widgets and workers run while the phone is locked after first unlock, so no user auth.
        .setUserAuthenticationRequired(false)
        .build()
    )
    return gen.generateKey()
  }

  override fun encrypt(plain: ByteArray): ByteArray {
    val c = Cipher.getInstance(TRANSFORM)
    c.init(Cipher.ENCRYPT_MODE, key())
    val iv = c.iv
    check(iv.size == IV_BYTES)
    return iv + c.doFinal(plain)
  }

  override fun decrypt(sealed: ByteArray): ByteArray {
    require(sealed.size > IV_BYTES)
    val c = Cipher.getInstance(TRANSFORM)
    c.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(TAG_BITS, sealed, 0, IV_BYTES))
    return c.doFinal(sealed, IV_BYTES, sealed.size - IV_BYTES)
  }

  fun deleteKey() {
    runCatching { KeyStore.getInstance(PROVIDER).apply { load(null) }.deleteEntry(alias) }
  }
}

class TokenVault(private val store: WidgetStore, private val cipher: TokenCipher) {
  suspend fun put(token: String?) {
    if (token == null) {
      store.edit { it.remove(WidgetStore.TOKEN) }
      return
    }
    val sealed = cipher.encrypt(token.toByteArray(Charsets.UTF_8))
    val text = Base64.encodeToString(sealed, Base64.NO_WRAP)
    store.edit { it[WidgetStore.TOKEN] = text }
  }

  suspend fun get(): String? {
    val text = store.prefs()[WidgetStore.TOKEN] ?: return null
    return try {
      String(cipher.decrypt(Base64.decode(text, Base64.NO_WRAP)), Charsets.UTF_8)
    } catch (e: Exception) {
      // The key can't open it any more: forget it. The app registers again on next launch.
      store.edit { it.remove(WidgetStore.TOKEN) }
      null
    }
  }
}
