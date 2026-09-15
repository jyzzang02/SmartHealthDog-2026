package com.smarthealthdog

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.io.InputStream
import java.util.UUID
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

class DiagnosisImageCropperModule(
  private val reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {
  override fun getName() = "DiagnosisImageCropper"

  @ReactMethod
  fun cropImage(
    uri: String,
    cropX: Double,
    cropY: Double,
    cropWidth: Double,
    cropHeight: Double,
    promise: Promise,
  ) {
    try {
      val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
      openInputStream(uri).use { BitmapFactory.decodeStream(it, null, bounds) }

      if (bounds.outWidth <= 0 || bounds.outHeight <= 0) {
        promise.reject("INVALID_IMAGE", "사진 크기를 확인할 수 없습니다.")
        return
      }

      val options = BitmapFactory.Options().apply {
        inSampleSize = calculateSampleSize(bounds.outWidth, bounds.outHeight)
        inPreferredConfig = Bitmap.Config.ARGB_8888
      }
      val source = openInputStream(uri).use { BitmapFactory.decodeStream(it, null, options) }

      if (source == null) {
        promise.reject("INVALID_IMAGE", "사진을 불러올 수 없습니다.")
        return
      }

      val scaleX = source.width.toDouble() / bounds.outWidth
      val scaleY = source.height.toDouble() / bounds.outHeight
      val left = cropX.times(scaleX).roundToInt().coerceIn(0, source.width - 1)
      val top = cropY.times(scaleY).roundToInt().coerceIn(0, source.height - 1)
      val width = max(1, cropWidth.times(scaleX).roundToInt())
      val height = max(1, cropHeight.times(scaleY).roundToInt())
      val croppedWidth = min(width, source.width - left)
      val croppedHeight = min(height, source.height - top)
      val cropped = Bitmap.createBitmap(source, left, top, croppedWidth, croppedHeight)
      val outputDirectory = File(reactContext.cacheDir, "diagnosis-crops")

      if (!outputDirectory.exists() && !outputDirectory.mkdirs()) {
        source.recycle()
        cropped.recycle()
        promise.reject("SAVE_FAILED", "정렬한 사진을 저장할 수 없습니다.")
        return
      }

      val outputFile = File(outputDirectory, "${UUID.randomUUID()}.jpg")
      FileOutputStream(outputFile).use { output ->
        if (!cropped.compress(Bitmap.CompressFormat.JPEG, 92, output)) {
          throw IllegalStateException("사진 저장에 실패했습니다.")
        }
      }

      if (cropped != source) cropped.recycle()
      source.recycle()
      promise.resolve("file://${outputFile.absolutePath}")
    } catch (error: Exception) {
      promise.reject("CROP_FAILED", "사진을 정렬하지 못했습니다.", error)
    }
  }

  private fun openInputStream(uri: String): InputStream {
    return if (uri.startsWith("content://")) {
      requireNotNull(reactContext.contentResolver.openInputStream(android.net.Uri.parse(uri)))
    } else {
      FileInputStream(uri.removePrefix("file://"))
    }
  }

  private fun calculateSampleSize(width: Int, height: Int): Int {
    val maxDimension = 2048
    var sampleSize = 1
    while (width / sampleSize > maxDimension || height / sampleSize > maxDimension) {
      sampleSize *= 2
    }
    return sampleSize
  }
}
