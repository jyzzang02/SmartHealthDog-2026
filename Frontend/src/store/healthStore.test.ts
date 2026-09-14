import { healthStore } from './healthStore';
import type { HealthSummary } from '../types/health';

const createSummary = (petId: number, checkupDate: string): HealthSummary => ({
  petId,
  checkupDate,
  examTypes: ['일반 검진', '혈액검사'],
  physicalResults: {},
  overallCondition: '양호',
  healthTags: [],
  recommendation: '6개월 후 정기 검진 권장',
});

describe('healthStore', () => {
  it('returns every saved checkup in descending checkup-date order', () => {
    const petId = 9_999_999;
    const oldest = createSummary(petId, '2026-01-10');
    const latest = createSummary(petId, '2026-03-10');
    const middle = createSummary(petId, '2026-02-10');

    healthStore.set(petId, oldest);
    healthStore.set(petId, latest);
    healthStore.set(petId, middle);

    expect(healthStore.getHistory(petId)).toEqual([latest, middle, oldest]);
    expect(healthStore.get(petId)).toBe(latest);
    expect(healthStore.getPrevious(petId)).toBe(middle);
  });
});
