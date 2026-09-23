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
import android.util.Log

class WalkLocationTrackingModule(
  private val reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {
  override fun getName() = "WalkLocationTracking"

  @ReactMethod
  fun start(walkId: Double, startedAtMs: Double, promise: Promise) {
    try {
      val intent = Intent(reactContext, WalkLocationService::class.java).apply {
        putExtra(WalkLocationService.EXTRA_WALK_ID, walkId.toLong())
        putExtra(WalkLocationService.EXTRA_STARTED_AT_MS, startedAtMs.toLong())
      }
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        reactContext.startForegroundService(intent)
      } else {
        reactContext.startService(intent)
      }
      Log.i(LIGHT_LOG_TAG, "module:start-request walkId=${walkId.toLong()}")
      promise.resolve(null)
    } catch (error: Exception) {
      Log.e(LIGHT_LOG_TAG, "module:start-failed walkId=${walkId.toLong()}", error)
      promise.reject("TRACKING_START_FAILED", "산책 위치 기록을 시작하지 못했습니다.", error)
    }
  }

  @ReactMethod
  fun stop(promise: Promise) {
    reactContext.stopService(Intent(reactContext, WalkLocationService::class.java))
    Log.i(LIGHT_LOG_TAG, "module:stop-request")
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
  fun getLightSamples(walkId: Double, promise: Promise) {
    val samples = WalkLightStore.get(reactContext, walkId.toLong())
    Log.i(LIGHT_LOG_TAG, "module:pending walkId=${walkId.toLong()} count=${samples.length()}")
    val result = Arguments.createArray()
    for (index in 0 until samples.length()) {
      val sample = samples.optJSONObject(index) ?: continue
      result.pushMap(Arguments.createMap().apply {
        putString("client_sample_id", sample.optString("client_sample_id"))
        putString("measured_at", sample.optString("measured_at"))
        putDouble("lux", sample.optDouble("lux"))
      })
    }
    promise.resolve(result)
  }

  @ReactMethod
  fun acknowledgeLightSamples(walkId: Double, ids: com.facebook.react.bridge.ReadableArray, promise: Promise) {
    val acknowledged = (0 until ids.size()).mapNotNull { ids.getString(it) }.toSet()
    WalkLightStore.acknowledge(reactContext, walkId.toLong(), acknowledged)
    Log.i(LIGHT_LOG_TAG, "module:ack walkId=${walkId.toLong()} count=${acknowledged.size}")
    promise.resolve(null)
  }

  companion object {
    private const val LIGHT_LOG_TAG = "WalkLight"
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
