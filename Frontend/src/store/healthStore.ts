import { HealthSummary } from '../types/health';

/** 앱 세션 내 인메모리 건강검진 이력 캐시 (펫당 회차별 배열, 마지막 = 최신) */
const _store: Record<number, HealthSummary[]> = {};

export const healthStore = {
  set(petId: number, summary: HealthSummary): void {
    if (!_store[petId]) _store[petId] = [];
    _store[petId].push(summary);
  },
  get(petId: number): HealthSummary | undefined {
    const records = _store[petId];
    return records && records.length > 0 ? records[records.length - 1] : undefined;
  },
  getPrevious(petId: number): HealthSummary | undefined {
    const records = _store[petId];
    return records && records.length >= 2 ? records[records.length - 2] : undefined;
  },
  getAll(): Record<number, HealthSummary> {
    const result: Record<number, HealthSummary> = {};
    for (const key of Object.keys(_store)) {
      const records = _store[Number(key)];
      if (records.length > 0) result[Number(key)] = records[records.length - 1];
    }
    return result;
  },
};
