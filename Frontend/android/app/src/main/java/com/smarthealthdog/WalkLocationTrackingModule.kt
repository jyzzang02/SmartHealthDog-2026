package com.smarthealthdog

import android.content.Intent
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import android.net.Uri

class WalkLocationTrackingModule(
  private val reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {
  override fun getName() = "WalkLocationTracking"

  @ReactMethod
  fun start(promise: Promise) {
    try {
      val intent = Intent(reactContext, WalkLocationService::class.java)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        reactContext.startForegroundService(intent)
      } else {
        reactContext.startService(intent)
      }
      promise.resolve(null)
    } catch (error: Exception) {
      promise.reject("TRACKING_START_FAILED", "산책 위치 기록을 시작하지 못했습니다.", error)
    }
  }

  @ReactMethod
  fun stop(promise: Promise) {
    reactContext.stopService(Intent(reactContext, WalkLocationService::class.java))
    promise.resolve(null)
  }

  @ReactMethod
  fun clearLocations(promise: Promise) {
    WalkLocationStore.clear(reactContext)
    promise.resolve(null)
  }

  @ReactMethod
  fun getLocations(promise: Promise) {
    val locations = WalkLocationStore.get(reactContext)
    val result = Arguments.createArray()
    for (index in 0 until locations.length()) {
      val location = locations.optJSONObject(index) ?: continue
      val item = Arguments.createMap().apply {
        putDouble("latitude", location.optDouble("latitude"))
        putDouble("longitude", location.optDouble("longitude"))
        putDouble("accuracy", location.optDouble("accuracy"))
        putDouble("timestamp", location.optLong("timestamp").toDouble())
      }
      result.pushMap(item)
    }
    promise.resolve(result)
  }

  @ReactMethod
  fun isIgnoringBatteryOptimizations(promise: Promise) {
    val powerManager = reactContext.getSystemService(PowerManager::class.java)
    promise.resolve(powerManager.isIgnoringBatteryOptimizations(reactContext.packageName))
  }

  @ReactMethod
  fun requestIgnoreBatteryOptimizations(promise: Promise) {
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
        val activity = reactContext.currentActivity
        if (activity != null) {
          activity.startActivity(
            Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
              data = Uri.parse("package:${reactContext.packageName}")
            },
          )
        }
      }
      promise.resolve(null)
    } catch (error: Exception) {
      promise.reject("BATTERY_SETTINGS_FAILED", "배터리 설정을 열지 못했습니다.", error)
    }
  }
}
