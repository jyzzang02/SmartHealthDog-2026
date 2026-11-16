package com.smarthealthdog

import android.app.Activity
import android.content.Intent
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Typeface
import android.graphics.pdf.PdfDocument
import android.provider.DocumentsContract
import android.text.Layout
import android.text.StaticLayout
import android.text.TextPaint
import android.text.TextUtils
import com.facebook.react.bridge.BaseActivityEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray
import java.io.IOException
import java.io.OutputStream
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicReference

class HealthReportPdfModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  private data class UrineResult(val label: String, val value: String, val abnormal: Boolean)
  private data class Content(
    val kind: String?, val label: String, val value: String, val detail: String,
    val tags: List<String>, val results: List<UrineResult>,
  )
  private data class Paragraph(val text: String, val heading: Boolean, val role: String?, val content: Content?)
  private data class Export(val paragraphs: List<Paragraph>, val promise: Promise)
  private val pending = AtomicReference<Export?>(null)
  private val writer = Executors.newSingleThreadExecutor()

  private val listener = object : BaseActivityEventListener() {
    override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {
      if (requestCode != CREATE_PDF) return
      val export = pending.getAndSet(null) ?: return
      if (resultCode == Activity.RESULT_CANCELED) {
        export.promise.resolve(false)
        return
      }
      val uri = data?.data
      if (resultCode != Activity.RESULT_OK || uri?.scheme != "content") {
        export.promise.reject("PDF_SAVE_FAILED", "No PDF destination")
        return
      }
      try {
        writer.execute {
          try {
            context.contentResolver.openOutputStream(uri, "w")?.use { render(export.paragraphs, it) }
              ?: throw IOException("Cannot open PDF destination")
            export.promise.resolve(true)
          } catch (_: Exception) {
            runCatching { DocumentsContract.deleteDocument(context.contentResolver, uri) }
            export.promise.reject("PDF_SAVE_FAILED", "Could not save PDF")
          }
        }
      } catch (_: Exception) {
        export.promise.reject("PDF_SAVE_FAILED", "PDF writer unavailable")
      }
    }
  }

  init { context.addActivityEventListener(listener) }

  override fun getName() = "HealthReportPdf"

  @ReactMethod
  fun save(fileName: String, rows: ReadableArray, promise: Promise) {
    val paragraphs = try {
      require(fileName.length <= 100 && fileName.endsWith(".pdf") &&
        fileName.none { it.code < 32 || it == '/' || it.code == 92 })
      require(rows.size() in 1..5000)
      List(rows.size()) { index ->
        val row = requireNotNull(rows.getMap(index))
        val data = if (row.hasKey("content")) row.getMap("content") else null
        val content = data?.let {
          val tags = if (it.hasKey("tags")) it.getArray("tags") else null
          val results = if (it.hasKey("results")) it.getArray("results") else null
          Content(
            it.getString("kind"), (if (it.hasKey("label")) it.getString("label") else null).orEmpty().take(4096),
            (if (it.hasKey("value")) it.getString("value") else null).orEmpty().take(4096), (if (it.hasKey("detail")) it.getString("detail") else null).orEmpty().take(4096),
            List(tags?.size() ?: 0) { index -> tags?.getString(index).orEmpty().take(4096) },
            List(results?.size() ?: 0) { index ->
              val result = requireNotNull(results?.getMap(index))
              UrineResult(result.getString("label").orEmpty().take(4096),
                result.getString("value").orEmpty().take(4096), result.getBoolean("isAbnormal"))
            },
          )
        }
        Paragraph(requireNotNull(row.getString("text")).take(4096), row.getBoolean("heading"),
          if (row.hasKey("role")) row.getString("role") else null, content)
      }
    } catch (_: Exception) {
      promise.reject("PDF_INVALID", "Invalid PDF content")
      return
    }

    val export = Export(paragraphs, promise)
    context.runOnUiQueueThread {
      val activity = context.currentActivity
      if (activity == null || writer.isShutdown || !pending.compareAndSet(null, export)) {
        promise.reject("PDF_UNAVAILABLE", "PDF save is unavailable")
        return@runOnUiQueueThread
      }
      try {
        val intent = Intent(Intent.ACTION_CREATE_DOCUMENT).apply {
          addCategory(Intent.CATEGORY_OPENABLE)
          type = "application/pdf"
          putExtra(Intent.EXTRA_TITLE, fileName)
        }
        activity.startActivityForResult(intent, CREATE_PDF)
      } catch (_: Exception) {
        pending.compareAndSet(export, null)
        promise.reject("PDF_UNAVAILABLE", "Cannot open PDF destination picker")
      }
    }
  }

  override fun invalidate() {
    context.removeActivityEventListener(listener)
    pending.getAndSet(null)?.promise?.resolve(false)
    writer.shutdown()
    super.invalidate()
  }

  private fun render(paragraphs: List<Paragraph>, output: OutputStream) {
    val pdf = PdfDocument()
    try {
      var pageNumber = 0
      fun nextPage() = pdf.startPage(PdfDocument.PageInfo.Builder(WIDTH, HEIGHT, ++pageNumber).create())
      var page = nextPage()
      var currentY = MARGIN
      val right = WIDTH - MARGIN
      val width = right - MARGIN
      val bottom = HEIGHT - MARGIN - 27
      val ink = Color.rgb(22, 48, 73)
      val muted = Color.rgb(96, 113, 128)
      val accent = Color.rgb(0, 112, 185)
      val border = Color.rgb(215, 225, 233)
      val fill = Paint(Paint.ANTI_ALIAS_FLAG)
      fun font(size: Float, color: Int = ink, bold: Boolean = false) =
        TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
          textSize = size
          this.color = color
          if (bold) typeface = Typeface.create("sans-serif", Typeface.BOLD)
        }
      val body = font(11f)
      val small = font(10f, muted)
      val section = font(14f, bold = true)
      val chip = font(10f, accent, true)
      val metric = font(22f, accent, true)
      val alert = font(11f, Color.rgb(163, 44, 48), true)
      fun layout(text: String, paint: TextPaint, available: Int = width,
                 alignment: Layout.Alignment = Layout.Alignment.ALIGN_NORMAL) =
        StaticLayout.Builder.obtain(text, 0, text.length, paint, available)
          .setIncludePad(false).setAlignment(alignment).setLineSpacing(2f, 1f).build()
      fun drawText(block: StaticLayout, x: Int, y: Int) {
        val canvas = page.canvas
        canvas.save()
        canvas.translate(x.toFloat(), y.toFloat())
        block.draw(canvas)
        canvas.restore()
      }
      fun line(left: Int, top: Int, end: Int = right, color: Int = border) {
        fill.color = color
        fill.strokeWidth = 0.8f
        page.canvas.drawLine(left.toFloat(), top.toFloat(), end.toFloat(), top.toFloat(), fill)
      }
      fun round(x: Int, y: Int, w: Int, h: Int, color: Int, outline: Boolean = false) {
        fill.color = color
        fill.style = if (outline) Paint.Style.STROKE else Paint.Style.FILL
        fill.strokeWidth = 1f
        page.canvas.drawRoundRect(x.toFloat(), y.toFloat(), (x + w).toFloat(), (y + h).toFloat(), 7f, 7f, fill)
        fill.style = Paint.Style.FILL
      }
      fun ensure(blockHeight: Int) {
        if (currentY + blockHeight > bottom && currentY > MARGIN) {
          pdf.finishPage(page)
          page = nextPage()
          currentY = MARGIN
        }
      }
      fun paragraph(block: StaticLayout, gap: Int, reserve: Int = 0) {
        if (block.height <= bottom - MARGIN) {
          ensure(block.height + reserve)
          drawText(block, MARGIN, currentY)
          currentY += block.height + gap
          return
        }
        for (index in 0 until block.lineCount) {
          val top = block.getLineTop(index)
          val height = block.getLineBottom(index) - top
          ensure(height)
          val canvas = page.canvas
          canvas.save()
          canvas.clipRect(MARGIN, currentY, right, currentY + height)
          drawText(block, MARGIN, currentY - top)
          canvas.restore()
          currentY += height
        }
        currentY += gap
      }
      fun metricRow(entries: List<Content>) {
        val cardWidth = (width - 12) / 2
        val values = entries.map { layout(it.value, metric, cardWidth - 24) }
        val labels = entries.map { layout(it.label, small, cardWidth - 24) }
        val height = 30 + entries.indices.maxOf { values[it].height + labels[it].height }
        ensure(height)
        entries.indices.forEach { index ->
          val x = MARGIN + index * (cardWidth + 12)
          round(x, currentY, cardWidth, height, Color.rgb(238, 246, 252))
          drawText(values[index], x + 12, currentY + 12)
          drawText(labels[index], x + 12, currentY + 18 + values[index].height)
        }
        currentY += height + 10
      }
      fun eyes(date: String, tags: List<String>) {
        data class Tag(val text: String, val width: Int)
        val inner = width - 24
        val rows = mutableListOf<MutableList<Tag>>()
        var used = 0
        tags.forEach { tag ->
          // Fit unusually long labels without letting them overlap the card border.
          val text = TextUtils.ellipsize(tag, chip, (inner - 18).toFloat(), TextUtils.TruncateAt.END).toString()
          val tagWidth = kotlin.math.ceil(chip.measureText(text)).toInt() + 18
          if (rows.isEmpty() || used + tagWidth > inner) {
            rows.add(mutableListOf())
            used = 0
          }
          rows.last().add(Tag(text, tagWidth))
          used += tagWidth + 6
        }
        val title = layout(date, section, inner)
        val lineHeight = 23
        val chrome = 27 + title.height
        val maxRows = ((bottom - MARGIN - chrome) / lineHeight).coerceAtLeast(1)
        rows.chunked(maxRows).forEach { batch ->
          val height = chrome + batch.size * lineHeight
          ensure(height)
          round(MARGIN, currentY, width, height, border, outline = true)
          drawText(title, MARGIN + 12, currentY + 10)
          batch.forEachIndexed { row, tagsInRow ->
            var x = MARGIN + 12
            val y = currentY + title.height + 17 + row * lineHeight
            tagsInRow.forEach { tag ->
              round(x, y, tag.width, 19, Color.rgb(234, 244, 253))
              val text = layout(tag.text, chip, tag.width)
              drawText(text, x + 9, y + (19 - text.height) / 2)
              x += tag.width + 6
            }
          }
          currentY += height + 12
        }
      }
      fun columns(label: String, value: String, valuePaint: TextPaint, labelPaint: TextPaint = body) =
        layout(label, labelPaint, width / 2 - 12) to
          layout(value, valuePaint, width / 2, Layout.Alignment.ALIGN_OPPOSITE)
      fun rowHeight(pair: Pair<StaticLayout, StaticLayout>) = maxOf(pair.first.height, pair.second.height) + 10
      fun row(pair: Pair<StaticLayout, StaticLayout>) {
        drawText(pair.first, MARGIN, currentY + 4)
        drawText(pair.second, right - width / 2, currentY + 4)
        currentY += rowHeight(pair)
        line(MARGIN, currentY)
      }
      fun urine(date: String, results: List<UrineResult>, sectionTitle: String? = null) {
        val sectionBlock = sectionTitle?.let { layout(it, section) }
        val title = layout(date, section)
        val tableHeader = columns("검사항목", "결과값", small, small)
        val rows = results.map { columns(it.label, it.value, if (it.abnormal) alert else body) }
        val topHeight = title.height + 4 + rowHeight(tableHeader)
        fun header() {
          drawText(title, MARGIN, currentY)
          currentY += title.height + 4
          row(tableHeader)
        }
        ensure((sectionBlock?.let { it.height + 8 + 12 } ?: 0) + topHeight +
          (rows.firstOrNull()?.let(::rowHeight) ?: 0))
        sectionBlock?.let {
          if (currentY > MARGIN) currentY += 12
          drawText(it, MARGIN, currentY)
          currentY += it.height + 8
        }
        header()
        rows.forEach { entry ->
          if (currentY + rowHeight(entry) > bottom) {
            ensure(bottom - currentY + 1)
            header()
          }
          row(entry)
        }
        currentY += 10
      }

      try {
        val footer = paragraphs.firstOrNull { it.content?.kind == "footer" }?.text
        val items = paragraphs.filterNot { it.content?.kind == "legacy" || it.content?.kind == "footer" }
        var index = 0
        while (index < items.size) {
          val item = items[index++]
          val data = item.content
          val nextItem = items.getOrNull(index)
          val nextData = nextItem?.content
          if (item.role == "section" && nextItem != null && nextData?.kind == "urines") {
            urine(nextItem.text, nextData.results, item.text)
            index++
            continue
          }
          when (data?.kind) {
            "metric" -> {
              val next = items.getOrNull(index)?.content
              metricRow(if (next?.kind == "metric") listOf(data, next).also { index++ } else listOf(data))
            }
            "eyes" -> eyes(item.text, data.tags)
            "urines" -> urine(item.text, data.results)
            "walk" -> {
              val result = columns(data.label, data.value, font(12f, bold = true))
              val duration = data.detail.takeIf { it.isNotEmpty() }?.let { layout(it, small) }
              ensure(rowHeight(result) + (duration?.let { it.height + 4 } ?: 0))
              row(result)
              duration?.let {
                drawText(it, MARGIN, currentY + 2)
                currentY += it.height + 4
              }
            }
            else -> when (item.role) {
              "title" -> paragraph(layout(item.text, font(26f, bold = true)), 9, 40)
              "pet" -> paragraph(layout(item.text, font(14f, bold = true)), 4)
              "period" -> {
                paragraph(layout(item.text, small), 8, 8)
                line(MARGIN, currentY, color = accent)
                currentY += 12
              }
              "muted" -> paragraph(layout(item.text, small), 5)
              "notice", "stage4" -> paragraph(layout(item.text, alert), 6)
              "stage2", "stage3" -> paragraph(layout(item.text, font(11f, Color.rgb(140, 78, 18), true)), 5)
              "section" -> {
                val title = layout(item.text, section)
                ensure(title.height + 12 + 8 + if (nextData?.kind == "eyes") 82 else 36)
                if (currentY > MARGIN) currentY += 12
                paragraph(title, 8)
              }
              else -> paragraph(layout(item.text, if (item.heading) section else body), 8)
            }
          }
        }
        footer?.let {
          val disclaimer = layout(it, small)
          val y = HEIGHT - MARGIN - disclaimer.height
          line(MARGIN, y - 7)
          drawText(disclaimer, MARGIN, y)
        }
      } finally {
        pdf.finishPage(page)
      }
      pdf.writeTo(output)
    } finally {
      pdf.close()
    }
  }

  private companion object {
    const val CREATE_PDF = 7311
    const val WIDTH = 595
    const val HEIGHT = 842
    const val MARGIN = 40
  }
}
