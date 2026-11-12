package com.smarthealthdog

import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.Build
import android.os.SystemClock
import android.util.Log
import kotlin.math.abs

/** Experimental upload gate on the tested Samsung sensor; Kelvin calibration is unverified. */
internal class WalkCctDiagnostics(private val sensorManager: SensorManager) : SensorEventListener {
  private var sensor: Sensor? = null
  private var walkId = 0L
  private var latestValues: FloatArray? = null
  private var latestTimestampNs = 0L
  private var luxTimestampNs = 0L
  private var pairedValues: FloatArray? = null
  private var pairedTimestampNs = 0L
  private var status = "not_started"
  private var loggedFirstEvent = false

  fun start(sessionId: Long) {
    stop()
    walkId = sessionId
    try {
      val candidate = sensorManager.getSensorList(Sensor.TYPE_ALL).firstOrNull {
        it.stringType == SAMSUNG_CCT_SENSOR_TYPE
      }
      if (candidate == null) {
        status = "unavailable"
      } else if (Build.MODEL != TEST_MODEL || !Build.MANUFACTURER.equals("samsung", true)) {
        status = "unsupported_device"
      } else {
        sensor = candidate
        status = if (sensorManager.registerListener(this, candidate, SensorManager.SENSOR_DELAY_NORMAL)) {
          "waiting_for_event"
        } else {
          sensorManager.unregisterListener(this)
          sensor = null
          "registration_failed"
        }
      }
      Log.i(TAG, "sensor:start walkId=$walkId model=${Build.MODEL} name=${candidate?.name} " +
        "status=$status verified=false candidateIndex=$CCT_CANDIDATE_INDEX")
    } catch (error: Exception) {
      stop()
      status = "registration_failed"
      Log.w(TAG, "sensor:start-failed walkId=$sessionId", error)
    }
  }

  override fun onSensorChanged(event: SensorEvent) {
    if (event.sensor != sensor) return
    latestValues = event.values.copyOfRange(0, minOf(event.values.size, MAX_RAW_VALUES))
    latestTimestampNs = event.timestamp
    updatePair()
    status = "unverified_candidate"
    if (!loggedFirstEvent) {
      loggedFirstEvent = true
      Log.i(TAG, "sensor:first-event walkId=$walkId raw=${latestValues?.contentToString()} " +
        "candidateIndex=$CCT_CANDIDATE_INDEX verified=false")
    }
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

  fun evaluateForUpload(lux: Float, sampleTimestampNs: Long): WalkCctUploadPolicy.Decision {
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
    Log.i(TAG, "sample:upload-gate walkId=$walkId lux=$lux raw=${values?.contentToString()} " +
      "candidateKelvin=$candidate cctMin=${WalkCctUploadPolicy.MIN_CCT} " +
      "sensorStatus=$status reason=${decision.reason} mode=${decision.mode} " +
      "uploadAllowed=${decision.allowed} verified=false affectsServer=true " +
      "ageMs=${if (values == null) -1L else ageNs / 1_000_000L} " +
      "pairGapMs=${if (values == null) -1L else pairGapNs / 1_000_000L}")
    return decision
  }

  fun stop() {
    try {
      if (sensor != null) sensorManager.unregisterListener(this)
    } catch (error: Exception) {
      Log.w(TAG, "sensor:unregister-failed walkId=$walkId", error)
    }
    sensor = null
    latestValues = null
    latestTimestampNs = 0L
    luxTimestampNs = 0L
    pairedValues = null
    pairedTimestampNs = 0L
    loggedFirstEvent = false
    status = "not_started"
  }

  private companion object {
    const val TAG = "WalkCct"
    const val SAMSUNG_CCT_SENSOR_TYPE = "com.samsung.sensor.light_cct"
    const val TEST_MODEL = "SM-S926N"
    // This is a test hypothesis, not a documented Samsung Kelvin mapping.
    const val CCT_CANDIDATE_INDEX = 1
    const val MAX_RAW_VALUES = 16
  }
}
