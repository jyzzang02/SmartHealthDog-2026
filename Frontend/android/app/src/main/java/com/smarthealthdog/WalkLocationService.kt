package com.smarthealthdog

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.util.Log
import androidx.core.app.NotificationCompat
import org.json.JSONArray
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import java.util.UUID
import kotlin.math.max

class WalkLocationService : Service(), LocationListener, SensorEventListener {
  private val locationManager by lazy {
    getSystemService(Context.LOCATION_SERVICE) as LocationManager
  }
  private val sensorManager by lazy { getSystemService(Context.SENSOR_SERVICE) as SensorManager }
  private val cctDiagnostics by lazy { WalkCctDiagnostics(sensorManager) }
  private val handler = Handler(Looper.getMainLooper())
  private var lightSensor: Sensor? = null
  private var latestLux: Float? = null
  private var latestLuxTimestampNs = 0L
  private var walkId: Long = 0L
  private var startedAtMs: Long = 0L
  private var wakeLock: PowerManager.WakeLock? = null
  private var loggedFirstLightEvent = false
  private var firstLightSampleQueued = false
  private val oneMinuteTestLux = ArrayList<Float>(2)
  private val sampleLight = object : Runnable {
    override fun run() {
      val lux = latestLux
      if (walkId > 0L && lux != null && System.currentTimeMillis() >= startedAtMs) {
        cctDiagnostics.logSample(lux, latestLuxTimestampNs)
        try {
          val saved = WalkLightStore.append(applicationContext, walkId, lux.toDouble())
          Log.i(LIGHT_LOG_TAG, "sample:stored walkId=$walkId lux=$lux saved=$saved")
          if (saved) {
            oneMinuteTestLux.add(lux)
            if (oneMinuteTestLux.size == 2) {
              val average = oneMinuteTestLux.average()
              Log.i(LIGHT_LOG_TAG, "test:one-minute-average walkId=$walkId avgLux=$average reaches2000=${average >= 2_000.0}")
              oneMinuteTestLux.clear()
            }
          }
        } catch (error: Exception) {
          Log.e(LIGHT_LOG_TAG, "sample:store-failed walkId=$walkId", error)
        }
      } else {
        Log.w(LIGHT_LOG_TAG, "sample:skipped walkId=$walkId freshEvent=${lux != null}")
      }
      latestLux = null
      latestLuxTimestampNs = 0L
      lightSensor?.let { sensor ->
        try {
          sensorManager.unregisterListener(this@WalkLocationService)
          val registered = sensorManager.registerListener(
            this@WalkLocationService, sensor, SensorManager.SENSOR_DELAY_NORMAL,
          )
          if (!registered) {
            Log.w(LIGHT_LOG_TAG, "sensor:re-register-failed walkId=$walkId")
            stopLightTracking()
          }
        } catch (error: Exception) {
          Log.e(LIGHT_LOG_TAG, "sensor:re-register-error walkId=$walkId", error)
          stopLightTracking()
        }
      }
      if (lightSensor != null) handler.postDelayed(this, LIGHT_SAMPLE_INTERVAL_MS)
    }
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    startForegroundNotification()
    locationManager.removeUpdates(this)
    requestLocationUpdates()
    stopLightTracking()
    walkId = intent?.getLongExtra(EXTRA_WALK_ID, 0L) ?: 0L
    startedAtMs = intent?.getLongExtra(EXTRA_STARTED_AT_MS, 0L) ?: 0L
    Log.i(LIGHT_LOG_TAG, "service:start walkId=$walkId startedAtMs=$startedAtMs")
    if (walkId > 0L && startedAtMs > 0L) {
      try {
        startLightTracking()
      } catch (error: Exception) {
        Log.e(LIGHT_LOG_TAG, "sensor:start-error walkId=$walkId", error)
        stopLightTracking()
      }
    }
    else Log.w(LIGHT_LOG_TAG, "sensor:not-started invalid-walk-session")
    return START_NOT_STICKY
  }

  override fun onDestroy() {
    Log.i(LIGHT_LOG_TAG, "service:stop walkId=$walkId")
    stopLightTracking()
    locationManager.removeUpdates(this)
    super.onDestroy()
  }

  override fun onSensorChanged(event: SensorEvent) {
    if (event.sensor.type != Sensor.TYPE_LIGHT) return
    val value = event.values.firstOrNull() ?: return
    if (value.isFinite() && value >= 0f) {
      latestLux = value
      latestLuxTimestampNs = event.timestamp
      cctDiagnostics.onLuxEvent(event.timestamp)
      if (!loggedFirstLightEvent) {
        loggedFirstLightEvent = true
        Log.i(LIGHT_LOG_TAG, "sensor:first-event walkId=$walkId lux=$value")
      }
      if (!firstLightSampleQueued) {
        firstLightSampleQueued = true
        handler.removeCallbacks(sampleLight)
        handler.post(sampleLight)
      }
    }
  }

  override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) = Unit

  private fun startLightTracking() {
    val sensor = sensorManager.getDefaultSensor(Sensor.TYPE_LIGHT)
    if (sensor == null) {
      Log.w(LIGHT_LOG_TAG, "sensor:unavailable walkId=$walkId")
      return
    }
    lightSensor = sensor
    latestLux = null
    loggedFirstLightEvent = false
    firstLightSampleQueued = false
    oneMinuteTestLux.clear()
    if (!sensorManager.registerListener(this, sensor, SensorManager.SENSOR_DELAY_NORMAL)) {
      Log.w(LIGHT_LOG_TAG, "sensor:register-failed walkId=$walkId")
      lightSensor = null
      return
    }
    Log.i(LIGHT_LOG_TAG, "sensor:registered walkId=$walkId name=${sensor.name}")
    cctDiagnostics.start(walkId)
    val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
    wakeLock = powerManager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "$packageName:WalkLight")
      .apply { acquire() }
    handler.postDelayed(sampleLight, LIGHT_SAMPLE_INTERVAL_MS)
  }

  private fun stopLightTracking() {
    handler.removeCallbacks(sampleLight)
    cctDiagnostics.stop()
    if (lightSensor != null) sensorManager.unregisterListener(this)
    lightSensor = null
    latestLux = null
    latestLuxTimestampNs = 0L
    firstLightSampleQueued = false
    oneMinuteTestLux.clear()
    wakeLock?.let { if (it.isHeld) it.release() }
    wakeLock = null
  }

  override fun onLocationChanged(location: Location) {
    if (location.accuracy > MAX_ACCURACY_METERS) return
    WalkLocationStore.append(applicationContext, location)
  }

  private fun requestLocationUpdates() {
    val hasFineLocation = checkSelfPermission(android.Manifest.permission.ACCESS_FINE_LOCATION) ==
      android.content.pm.PackageManager.PERMISSION_GRANTED
    val hasCoarseLocation = checkSelfPermission(android.Manifest.permission.ACCESS_COARSE_LOCATION) ==
      android.content.pm.PackageManager.PERMISSION_GRANTED

    if (!hasFineLocation && !hasCoarseLocation) return

    try {
      val providers = listOf(LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER)
      providers.filter { locationManager.isProviderEnabled(it) }.forEach { provider ->
        locationManager.requestLocationUpdates(
          provider,
          LOCATION_INTERVAL_MS,
          MIN_DISTANCE_METERS,
          this,
          Looper.getMainLooper(),
        )
      }
    } catch (_: SecurityException) {
      stopSelf()
    }
  }

  private fun startForegroundNotification() {
    val notificationManager = getSystemService(NotificationManager::class.java)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      notificationManager.createNotificationChannel(
        NotificationChannel(
          CHANNEL_ID,
          "산책 위치 기록",
          NotificationManager.IMPORTANCE_LOW,
        ),
      )
    }

    val launchIntent = packageManager.getLaunchIntentForPackage(packageName)
    val pendingIntent = launchIntent?.let {
      PendingIntent.getActivity(
        this,
        0,
        it,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
      )
    }
    val notification = NotificationCompat.Builder(this, CHANNEL_ID)
      .setSmallIcon(R.mipmap.ic_launcher)
      .setContentTitle("산책 경로 기록 중")
      .setContentText("화면이 꺼져도 산책 위치를 기록하고 있어요.")
      .setContentIntent(pendingIntent)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .build()

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      startForeground(
        NOTIFICATION_ID,
        notification,
        ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION,
      )
    } else {
      startForeground(NOTIFICATION_ID, notification)
    }
  }

  companion object {
    private const val CHANNEL_ID = "walk_location_tracking"
    private const val NOTIFICATION_ID = 3101
    private const val LOCATION_INTERVAL_MS = 2_000L
    private const val MIN_DISTANCE_METERS = 5f
    private const val MAX_ACCURACY_METERS = 25f
    const val EXTRA_WALK_ID = "walk_id"
    const val EXTRA_STARTED_AT_MS = "started_at_ms"
    private const val LIGHT_SAMPLE_INTERVAL_MS = 30_000L
    private const val LIGHT_LOG_TAG = "WalkLight"
  }
}

object WalkLightStore {
  private const val PREFERENCES_NAME = "walk_light_samples"

  @Synchronized
  fun append(context: Context, walkId: Long, lux: Double): Boolean {
    val samples = get(context, walkId)
    val format = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
      timeZone = TimeZone.getTimeZone("UTC")
    }
    samples.put(JSONObject().apply {
      put("client_sample_id", UUID.randomUUID().toString())
      put("measured_at", format.format(Date()))
      put("lux", lux)
    })
    return context.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)
      .edit().putString(walkId.toString(), samples.toString()).commit()
  }

  @Synchronized
  fun get(context: Context, walkId: Long): JSONArray {
    val raw = context.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)
      .getString(walkId.toString(), "[]")
    return try { JSONArray(raw) } catch (_: Exception) { JSONArray() }
  }

  @Synchronized
  fun acknowledge(context: Context, walkId: Long, ids: Set<String>) {
    val pending = get(context, walkId)
    val remaining = JSONArray()
    for (index in 0 until pending.length()) {
      val sample = pending.optJSONObject(index) ?: continue
      if (sample.optString("client_sample_id") !in ids) remaining.put(sample)
    }
    context.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)
      .edit().putString(walkId.toString(), remaining.toString()).commit()
  }
}

object WalkLocationStore {
  private const val PREFERENCES_NAME = "walk_location_tracking"
  private const val LOCATIONS_KEY = "locations"
  private const val MAX_LOCATION_COUNT = 5_000

  @Synchronized
  fun append(context: Context, location: Location) {
    val locations = readArray(context)
    val last = locations.optJSONObject(locations.length() - 1)
    if (last != null) {
      val previousTime = last.optLong("timestamp", 0L)
      val previousLocation = Location("stored").apply {
        latitude = last.optDouble("latitude")
        longitude = last.optDouble("longitude")
      }
      if (
        location.time - previousTime < 1_500L ||
        location.distanceTo(previousLocation) < 5f
      ) {
        return
      }
    }

    locations.put(
      JSONObject().apply {
        put("latitude", location.latitude)
        put("longitude", location.longitude)
        put("accuracy", location.accuracy.toDouble())
        put("timestamp", location.time)
      },
    )

    val trimmed = JSONArray()
    val startIndex = max(0, locations.length() - MAX_LOCATION_COUNT)
    for (index in startIndex until locations.length()) {
      trimmed.put(locations.getJSONObject(index))
    }
    writeArray(context, trimmed)
  }

  @Synchronized
  fun get(context: Context): JSONArray = readArray(context)

  @Synchronized
  fun clear(context: Context) {
    writeArray(context, JSONArray())
  }

  private fun readArray(context: Context): JSONArray {
    val raw = context.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)
      .getString(LOCATIONS_KEY, "[]")
    return try {
      JSONArray(raw)
    } catch (_: Exception) {
      JSONArray()
    }
  }

  private fun writeArray(context: Context, locations: JSONArray) {
    context.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)
      .edit()
      .putString(LOCATIONS_KEY, locations.toString())
      .apply()
  }
}
