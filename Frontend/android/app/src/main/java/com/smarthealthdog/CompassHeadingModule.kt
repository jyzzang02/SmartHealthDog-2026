package com.smarthealthdog

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.LifecycleEventListener
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule
import kotlin.math.abs

class CompassHeadingModule(
  private val reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext), SensorEventListener, LifecycleEventListener {
  private val sensorManager =
    reactContext.getSystemService(Context.SENSOR_SERVICE) as SensorManager
  private val rotationVectorSensor = sensorManager.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR)

  private var isTracking = false
  private var isSensorRegistered = false
  private var lastHeading = Float.NaN
  private var lastEmittedAt = 0L

  init {
    reactContext.addLifecycleEventListener(this)
  }

  override fun getName() = "SmartHealthDogCompass"

  @ReactMethod
  fun start() {
    isTracking = true
    registerSensor()
  }

  @ReactMethod
  fun stop() {
    isTracking = false
    unregisterSensor()
  }

  private fun registerSensor() {
    if (isSensorRegistered || rotationVectorSensor == null) return

    isSensorRegistered = sensorManager.registerListener(
      this,
      rotationVectorSensor,
      SensorManager.SENSOR_DELAY_UI,
    )
  }

  private fun unregisterSensor() {
    if (!isSensorRegistered) return
    sensorManager.unregisterListener(this)
    isSensorRegistered = false
  }

  override fun onSensorChanged(event: SensorEvent) {
    if (event.sensor.type != Sensor.TYPE_ROTATION_VECTOR) return

    val rotationMatrix = FloatArray(9)
    val orientation = FloatArray(3)
    SensorManager.getRotationMatrixFromVector(rotationMatrix, event.values)
    SensorManager.getOrientation(rotationMatrix, orientation)

    val heading = ((Math.toDegrees(orientation[0].toDouble()) + 360.0) % 360.0).toFloat()
    emitHeading(heading)
  }

  override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) = Unit

  private fun emitHeading(heading: Float) {
    val now = System.currentTimeMillis()
    val delta = if (lastHeading.isNaN()) {
      Float.MAX_VALUE
    } else {
      abs(((heading - lastHeading + 540f) % 360f) - 180f)
    }

    if (now - lastEmittedAt < 100L && delta < 2f) return

    lastHeading = heading
    lastEmittedAt = now

    val payload = Arguments.createMap().apply {
      putDouble("heading", heading.toDouble())
    }
    reactContext
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit("smartHealthDogCompassHeading", payload)
  }

  override fun onHostResume() {
    if (isTracking) registerSensor()
  }

  override fun onHostPause() {
    unregisterSensor()
  }

  override fun onHostDestroy() {
    isTracking = false
    unregisterSensor()
    reactContext.removeLifecycleEventListener(this)
  }
}
