package com.smarthealthdog

import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.Build
import android.os.SystemClock
import kotlin.math.abs

/** Experimental upload gate on the tested Samsung sensor; Kelvin calibration is unverified. */
internal class WalkCctDiagnostics(private val sensorManager: SensorManager) : SensorEventListener {
  private var sensor: Sensor? = null
  private var latestValues: FloatArray? = null
  private var latestTimestampNs = 0L
  private var luxTimestampNs = 0L
  private var pairedValues: FloatArray? = null
  private var pairedTimestampNs = 0L

  fun start() {
    stop()
    try {
      val candidate = sensorManager.getSensorList(Sensor.TYPE_ALL).firstOrNull {
        it.stringType == SAMSUNG_CCT_SENSOR_TYPE
      }
      if (candidate == null || Build.MODEL != TEST_MODEL || !Build.MANUFACTURER.equals("samsung", true)) return
      sensor = candidate
      if (!sensorManager.registerListener(this, candidate, SensorManager.SENSOR_DELAY_NORMAL)) {
        sensorManager.unregisterListener(this)
        sensor = null
      }
    } catch (_: Exception) {
      stop()
    }
  }

  override fun onSensorChanged(event: SensorEvent) {
    if (event.sensor != sensor) return
    latestValues = event.values.copyOfRange(0, minOf(event.values.size, MAX_RAW_VALUES))
    latestTimestampNs = event.timestamp
    updatePair()
  }

  override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) = Unit

  fun onLuxEvent(timestampNs: Long) {
    luxTimestampNs = timestampNs
    pairedValues = null
    pairedTimestampNs = 0L
    updatePair()
  }

  private fun updatePair() {
    if (luxTimestampNs <= 0L || latestValues == null) return
    val gapNs = abs(luxTimestampNs - latestTimestampNs)
    if (gapNs <= WalkCctUploadPolicy.MAX_PAIR_GAP_NS &&
      (pairedValues == null || gapNs < abs(luxTimestampNs - pairedTimestampNs))) {
      pairedValues = latestValues
      pairedTimestampNs = latestTimestampNs
    }
  }

  fun evaluateForUpload(sampleTimestampNs: Long): WalkCctUploadPolicy.Decision {
    val now = SystemClock.elapsedRealtimeNanos()
    val values = pairedValues ?: latestValues
    val timestampNs = if (pairedValues != null) pairedTimestampNs else latestTimestampNs
    val candidate = values?.getOrNull(CCT_CANDIDATE_INDEX)
    val ageNs = now - timestampNs
    val pairGapNs = abs(sampleTimestampNs - timestampNs)
    val decision = WalkCctUploadPolicy.evaluate(
      sensor != null, candidate, ageNs, pairGapNs,
      sampleTimestampNs > 0L && sampleTimestampNs == luxTimestampNs,
    )
    return decision
  }

  fun stop() {
    try {
      if (sensor != null) sensorManager.unregisterListener(this)
    } catch (_: Exception) {
      // Clear local sensor state even if unregistering fails.
    }
    sensor = null
    latestValues = null
    latestTimestampNs = 0L
    luxTimestampNs = 0L
    pairedValues = null
    pairedTimestampNs = 0L
  }

  private companion object {
    const val SAMSUNG_CCT_SENSOR_TYPE = "com.samsung.sensor.light_cct"
    const val TEST_MODEL = "SM-S926N"
    // This is a test hypothesis, not a documented Samsung Kelvin mapping.
    const val CCT_CANDIDATE_INDEX = 1
    const val MAX_RAW_VALUES = 16
  }
}
