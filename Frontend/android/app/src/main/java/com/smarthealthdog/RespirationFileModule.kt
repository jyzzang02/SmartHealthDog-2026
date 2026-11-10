package com.smarthealthdog

import android.net.Uri
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import okhttp3.Call
import okhttp3.Callback
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.asRequestBody
import okhttp3.Response
import java.io.File
import java.io.IOException
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference

class RespirationFileModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  private val client = OkHttpClient.Builder()
    .connectTimeout(30, TimeUnit.SECONDS)
    .writeTimeout(60, TimeUnit.SECONDS)
    .readTimeout(60, TimeUnit.SECONDS)
    .callTimeout(180, TimeUnit.SECONDS)
    .followRedirects(false)
    .followSslRedirects(false)
    .retryOnConnectionFailure(false)
    .build()
  private val activeUpload = AtomicReference<Call?>(null)

  override fun getName() = "RespirationFile"

  private fun file(path: String): File {
    val uri = Uri.parse(path)
    require(uri.scheme == null || uri.scheme == "file")
    val target = File(if (uri.scheme == "file") requireNotNull(uri.path) else path).canonicalFile
    val cache = context.cacheDir.canonicalFile
    require(target.path.startsWith(cache.path + File.separator) && target.isFile)
    return target
  }

  @ReactMethod fun size(path: String, promise: Promise) {
    try { promise.resolve(file(path).length().toDouble()) }
    catch (_: Exception) { promise.reject("FILE_ERROR", "Cannot read video") }
  }

  @ReactMethod fun discard(path: String, promise: Promise) {
    try { file(path).delete(); promise.resolve(null) }
    catch (_: Exception) { promise.reject("FILE_ERROR", "Cannot discard video") }
  }

  @ReactMethod fun upload(path: String, signedUrl: String, promise: Promise) {
    try {
      val request = Request.Builder().url(signedUrl)
        .put(file(path).asRequestBody("video/mp4".toMediaType()))
        .build()
      require(request.url.isHttps && request.url.username.isEmpty() && request.url.password.isEmpty())
      val call = client.newCall(request)
      if (!activeUpload.compareAndSet(null, call)) {
        promise.reject("UPLOAD_BUSY", "Video upload already running")
        return
      }
      try {
        call.enqueue(object : Callback {
          override fun onFailure(call: Call, e: IOException) {
            activeUpload.compareAndSet(call, null)
            promise.reject("UPLOAD_ERROR", "Video upload failed or timed out")
          }

          override fun onResponse(call: Call, response: Response) {
            val status = response.use { it.code }
            activeUpload.compareAndSet(call, null)
            if (status in 200..299) promise.resolve(status)
            else promise.reject("UPLOAD_HTTP_$status", "Video upload failed (HTTP $status)")
          }
        })
      } catch (e: Exception) {
        activeUpload.compareAndSet(call, null)
        throw e
      }
    } catch (_: Exception) {
      promise.reject("UPLOAD_ERROR", "Video upload failed")
    }
  }

  @ReactMethod fun cancelUpload() {
    activeUpload.get()?.cancel()
  }

  override fun invalidate() {
    cancelUpload()
    super.invalidate()
  }
}
