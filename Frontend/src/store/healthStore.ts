import { HealthSummary } from '../types/health';

/** 앱 세션 내 인메모리 건강검진 이력 캐시 (펫당 회차별 배열, 마지막 = 최신) */
const _store: Record<number, HealthSummary[]> = {};

const getCheckupTimestamp = (summary: HealthSummary) => {
  const timestamp = Date.parse(`${summary.checkupDate}T00:00:00`);
  return Number.isFinite(timestamp) ? timestamp : Number.NEGATIVE_INFINITY;
};

const getSortedRecords = (petId: number): HealthSummary[] =>
  (_store[petId] || [])
    .map((summary, index) => ({ summary, index }))
    .sort((a, b) => {
      const timestampDifference = getCheckupTimestamp(b.summary) - getCheckupTimestamp(a.summary);
      return timestampDifference || b.index - a.index;
    })
    .map(({ summary }) => summary);

export const healthStore = {
  set(petId: number, summary: HealthSummary): void {
    if (!_store[petId]) _store[petId] = [];
    _store[petId].push(summary);
  },
  getHistory(petId: number): HealthSummary[] {
    return getSortedRecords(petId);
  },
  get(petId: number): HealthSummary | undefined {
    return getSortedRecords(petId)[0];
  },
  getPrevious(petId: number): HealthSummary | undefined {
    return getSortedRecords(petId)[1];
  },
  getAll(): Record<number, HealthSummary> {
    const result: Record<number, HealthSummary> = {};
    for (const key of Object.keys(_store)) {
      const latestRecord = getSortedRecords(Number(key))[0];
      if (latestRecord) result[Number(key)] = latestRecord;
    }
    return result;
  },
};
