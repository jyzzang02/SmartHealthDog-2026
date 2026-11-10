package com.smarthealthdog

import android.util.Base64
import android.view.WindowInsets
import androidx.core.graphics.Insets
import androidx.core.view.WindowInsetsCompat
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.security.SecureRandom
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.ViewManager
import com.reactnativecommunity.webview.RNCWebView
import com.reactnativecommunity.webview.RNCWebViewManager
import com.reactnativecommunity.webview.RNCWebViewWrapper

class KakaoLoginWebViewPackage : ReactPackage {
  override fun createNativeModules(context: ReactApplicationContext): List<NativeModule> = listOf(KakaoOAuthModule(context))

  override fun createViewManagers(context: ReactApplicationContext): List<ViewManager<*, *>> =
    listOf(KakaoLoginWebViewManager())
}

private class KakaoLoginWebViewManager : RNCWebViewManager() {
  override fun getName(): String = "KakaoLoginWebView"

  override fun createViewInstance(context: ThemedReactContext): RNCWebViewWrapper =
    super.createViewInstance(context, KakaoLoginWebView(context))
}

private class KakaoLoginWebView(context: ThemedReactContext) : RNCWebView(context) {
  override fun onApplyWindowInsets(insets: WindowInsets): WindowInsets {
    // The modal already resizes above the IME. Chromium must not subtract it again.
    val handledInsets = WindowInsetsCompat.Builder(WindowInsetsCompat.toWindowInsetsCompat(insets, this))
      .setInsets(WindowInsetsCompat.Type.ime(), Insets.NONE)
      .build()
      .toWindowInsets() ?: insets
    // Forward zero insets as well, so hiding the keyboard clears Chromium's previous offset.
    return super.onApplyWindowInsets(handledInsets)
  }
}

private class KakaoOAuthModule(context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  override fun getName() = "KakaoOAuth"

  @ReactMethod fun createState(promise: Promise) {
    val bytes = ByteArray(32)
    SecureRandom().nextBytes(bytes)
    promise.resolve(Base64.encodeToString(bytes, Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING))
  }
}
