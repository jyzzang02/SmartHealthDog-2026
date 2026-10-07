package com.smarthealthdog

/** Experimental vendor CCT gate; this is not a validated outdoor classifier. */
internal object WalkCctUploadPolicy {
  const val MIN_CCT = 5_000f
  const val MAX_SAMPLE_AGE_NS = 35_000_000_000L
  const val MAX_PAIR_GAP_NS = 5_000_000_000L
  const val MODE_LUX_ONLY = "lux_only"
  const val MODE_CCT_FILTERED = "cct_filtered"

  data class Decision(
    val allowed: Boolean,
    val cctCandidate: Float?,
    val mode: String,
    val reason: String,
  )

  fun evaluate(
    cctAvailable: Boolean,
    candidate: Float?,
    ageNs: Long,
    pairGapNs: Long,
    pairedWithLux: Boolean,
  ): Decision {
    if (!cctAvailable) return Decision(true, null, MODE_LUX_ONLY, "cct_unavailable_lux_fallback")
    val rejection = rejectionReason(candidate, ageNs, pairGapNs, pairedWithLux)
    return Decision(rejection == null, candidate, MODE_CCT_FILTERED, rejection ?: "accepted")
  }

  fun permitsStoredSample(mode: String?, candidate: Float?): Boolean = when (mode) {
    MODE_LUX_ONLY -> true
    MODE_CCT_FILTERED -> meetsThreshold(candidate)
    // Preserve qualified samples queued before upload modes were introduced.
    null -> meetsThreshold(candidate)
    else -> false
  }

  fun meetsThreshold(candidate: Float?): Boolean =
    candidate != null && candidate.isFinite() && candidate >= MIN_CCT

  fun rejectionReason(
    candidate: Float?,
    ageNs: Long,
    pairGapNs: Long,
    pairedWithLux: Boolean,
  ): String? = when {
    candidate == null -> "missing_cct"
    !candidate.isFinite() || candidate < 0f -> "invalid_cct"
    !pairedWithLux || ageNs < 0L || ageNs > MAX_SAMPLE_AGE_NS ||
      pairGapNs < 0L || pairGapNs > MAX_PAIR_GAP_NS -> "stale_or_unpaired"
    !meetsThreshold(candidate) -> "below_threshold"
    else -> null
  }
}
