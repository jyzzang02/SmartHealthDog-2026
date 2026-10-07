package com.smarthealthdog

// Standalone JVM checks: no Android runtime or additional test dependency is required.
internal object WalkCctUploadPolicyTest {
  @JvmStatic
  fun main(args: Array<String>) {
    var checked = 0
    fun expect(candidate: Float?, age: Long, gap: Long, paired: Boolean, reason: String?) {
      check(WalkCctUploadPolicy.rejectionReason(candidate, age, gap, paired) == reason) {
        "Unexpected gate result for CCT=$candidate age=$age gap=$gap paired=$paired"
      }
      checked++
    }

    expect(null, 0, 0, true, "missing_cct")
    expect(Float.NaN, 0, 0, true, "invalid_cct")
    expect(Float.POSITIVE_INFINITY, 0, 0, true, "invalid_cct")
    expect(-1f, 0, 0, true, "invalid_cct")
    expect(0f, 0, 0, true, "below_threshold")
    expect(4_999f, 0, 0, true, "below_threshold")
    expect(5_000f, 0, 0, true, null)
    expect(7_001f, 0, 0, true, null)
    expect(26_562f, 0, 0, true, null)
    expect(44_791f, 0, 0, true, null)
    expect(5_000f, 35_000_000_000L, 5_000_000_000L, true, null)
    expect(5_000f, 35_000_000_001L, 0, true, "stale_or_unpaired")
    expect(5_000f, -1, 0, true, "stale_or_unpaired")
    expect(5_000f, 0, 5_000_000_001L, true, "stale_or_unpaired")
    expect(5_000f, 0, -1, true, "stale_or_unpaired")
    expect(5_000f, 0, 0, false, "stale_or_unpaired")
    check(!WalkCctUploadPolicy.meetsThreshold(null))
    check(!WalkCctUploadPolicy.meetsThreshold(Float.NaN))
    check(!WalkCctUploadPolicy.meetsThreshold(4_999f))
    check(WalkCctUploadPolicy.meetsThreshold(5_000f))
    checked += 4

    fun expectDecision(available: Boolean, candidate: Float?, allowed: Boolean, mode: String) {
      val result = WalkCctUploadPolicy.evaluate(available, candidate, 0, 0, true)
      check(result.allowed == allowed && result.mode == mode)
      if (!available) check(result.cctCandidate == null)
      checked++
    }
    val luxOnly = WalkCctUploadPolicy.MODE_LUX_ONLY
    val filtered = WalkCctUploadPolicy.MODE_CCT_FILTERED
    expectDecision(false, null, true, luxOnly)
    expectDecision(false, 0f, true, luxOnly)
    expectDecision(false, Float.NaN, true, luxOnly)
    expectDecision(true, null, false, filtered)
    expectDecision(true, 0f, false, filtered)
    expectDecision(true, 4_999f, false, filtered)
    expectDecision(true, 5_000f, true, filtered)
    expectDecision(true, 26_562f, true, filtered)
    val unavailable = WalkCctUploadPolicy.evaluate(false, null, -1, Long.MAX_VALUE, false)
    check(unavailable.allowed && unavailable.reason == "cct_unavailable_lux_fallback")
    checked++
    check(!WalkCctUploadPolicy.evaluate(true, 5_000f, 35_000_000_001L, 0, true).allowed)
    checked++

    fun expectStored(mode: String?, candidate: Float?, allowed: Boolean) {
      check(WalkCctUploadPolicy.permitsStoredSample(mode, candidate) == allowed)
      checked++
    }
    expectStored(luxOnly, null, true)
    expectStored(luxOnly, Float.NaN, true)
    expectStored(filtered, null, false)
    expectStored(filtered, 0f, false)
    expectStored(filtered, 4_999f, false)
    expectStored(filtered, 5_000f, true)
    expectStored(filtered, 44_791f, true)
    expectStored(null, 26_562f, true)
    expectStored(null, null, false)
    expectStored("unknown", 26_562f, false)
    println("CCT upload policy: $checked checks passed")
  }
}
