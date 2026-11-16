import { clearAuthTokens } from '../storage/tokenStorage';

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
}));
import { healthStore } from './healthStore';
import type { HealthSummary } from '../types/health';

const createSummary = (petId: number, checkupDate: string): HealthSummary => ({
  petId,
  checkupDate,
  certificate: {
    animalName: '',
    species: '',
    breed: '',
    sex: '',
    coatColor: '',
    age: '',
    features: '',
    diseaseName: '',
    onsetDate: '',
    diagnosisDate: '',
    prognosis: '',
    remarks: '',
  },
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

it('does not expose saved checkups after an account session ends', async () => {
  healthStore.set(1, createSummary(1, '2026-03-10'));
  await clearAuthTokens();
  expect(healthStore.getHistory(1)).toEqual([]);
  expect(healthStore.getAll()).toEqual({});
});

it('updates or removes only the matching server submission in the pet cache', () => {
  const petId = 4;
  const original = { ...createSummary(petId, '2026-11-15'), certificateSubmissionId: 'saved' };
  const other = { ...createSummary(petId, '2026-11-14'), certificateSubmissionId: 'other' };
  const edited = { ...original, hospitalName: '수정 병원' };
  healthStore.set(petId, original);
  healthStore.set(petId, other);
  healthStore.set(petId, edited);
  expect(healthStore.getHistory(petId)).toEqual([edited, other]);
  healthStore.remove(petId, 'saved');
  expect(healthStore.getHistory(petId)).toEqual([other]);
});
