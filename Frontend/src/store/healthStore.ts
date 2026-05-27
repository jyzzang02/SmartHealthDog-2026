import { HealthSummary } from '../types/health';

/** 앱 세션 내 인메모리 건강검진 데이터 캐시 */
const _store: Record<number, HealthSummary> = {};

export const healthStore = {
  set(petId: number, summary: HealthSummary): void {
    _store[petId] = summary;
  },
  get(petId: number): HealthSummary | undefined {
    return _store[petId];
  },
  getAll(): Record<number, HealthSummary> {
    return { ..._store };
  },
};
