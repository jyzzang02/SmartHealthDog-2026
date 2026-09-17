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
import android.os.Build
import android.os.IBinder
import android.os.Looper
import androidx.core.app.NotificationCompat
import org.json.JSONArray
import org.json.JSONObject
import kotlin.math.max

class WalkLocationService : Service(), LocationListener {
  private val locationManager by lazy {
    getSystemService(Context.LOCATION_SERVICE) as LocationManager
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    startForegroundNotification()
    requestLocationUpdates()
    return START_NOT_STICKY
  }

  override fun onDestroy() {
    locationManager.removeUpdates(this)
    super.onDestroy()
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
