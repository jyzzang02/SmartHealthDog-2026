import { formatLatestProfileCheckupDate, formatProfileRecordDate, getPetProfileHealth } from './petProfileHealth';
import { getLatestCompletedPetSubmission } from './diagnosis';
import { listRespirationRecords, type RespirationRecord } from './respiration';
import { listSelfChecks } from './selfCheck';

jest.mock('./diagnosis', () => ({ createPetOwnershipCheck: jest.fn(() => jest.fn()), getLatestCompletedPetSubmission: jest.fn() }));
jest.mock('./respiration', () => ({ listRespirationRecords: jest.fn() }));
jest.mock('./selfCheck', () => ({ listSelfChecks: jest.fn() }));

it('formats the weekday in Seoul even across a UTC date boundary', () => {
  expect(formatProfileRecordDate('2026-11-16T16:00:00Z')).toBe('2026.11.17 (화)');
  expect(formatProfileRecordDate('not a date')).toBeUndefined();
});

it('loads all four record types independently and only shows completed respiration records', async () => {
  const submittedAt = '2026-11-16T16:00:00Z';
  const createdAt = '2026-11-17T10:00:00Z';
  const record: RespirationRecord = {
    videoId: 'one', petId: 1, status: 'COMPLETED', createdAt, uploadedAt: submittedAt,
    completedAt: null, durationSec: 60, fileSizeBytes: null, respiratoryRate: null, failureReason: null,
  };
  jest.mocked(listRespirationRecords).mockResolvedValueOnce([
    { ...record, petId: 2, uploadedAt: createdAt },
    { ...record, status: 'PROCESSING', uploadedAt: createdAt },
    { ...record, uploadedAt: '2026-11-10T09:00:00Z' },
    record,
  ]);
  const { signal } = new AbortController();
  const submit = jest.mocked(getLatestCompletedPetSubmission);
  submit.mockResolvedValueOnce({ submittedAt }).mockRejectedValueOnce(new Error('offline'));
  jest.mocked(listSelfChecks).mockResolvedValueOnce({ number: 0, last: true, content: [
    { id: 4, petId: 1, species: 'dog', overallStage: 4, scoringVersion: 'test', createdAt },
  ] });

  await expect(getPetProfileHealth(1, signal)).resolves.toEqual({
    eye: { date: submittedAt }, urine: { failed: true },
    selfCheck: { date: createdAt, stage: 4 },
    respiration: { date: submittedAt },
  });
  expect(submit.mock.calls.map(call => call[1])).toEqual(['EYE', 'URINE']);
  expect(submit.mock.calls[0][3]).toBe(submit.mock.calls[1][3]);
  expect(listSelfChecks).toHaveBeenCalledWith(1, 0, signal);
  expect(listRespirationRecords).toHaveBeenCalledWith(1, signal);
});

it('uses the latest valid checkup date, not an invalid calendar date or upload timestamp', () => {
  expect(formatLatestProfileCheckupDate(['2026-11-13', '2026-11-17', '2026-11-31', '2026-11-18T09:00:00Z']))
    .toBe('2026.11.17 (화)');
});

it('preserves completed record lookups when one request remains pending until cancellation', async () => {
  const controller = new AbortController();
  const date = '2026-11-17T10:00:00Z';
  const submit = jest.mocked(getLatestCompletedPetSubmission);
  submit.mockResolvedValueOnce({ submittedAt: date }).mockResolvedValueOnce(undefined);
  jest.mocked(listSelfChecks).mockResolvedValueOnce({ content: [], number: 0, last: true });
  jest.mocked(listRespirationRecords).mockImplementationOnce(() => new Promise(() => {}));
  const lookup = getPetProfileHealth(1, controller.signal);
  await Promise.resolve();
  controller.abort();

  await expect(lookup).resolves.toEqual({
    eye: { date },
    urine: { date: undefined },
    selfCheck: { date: undefined, stage: undefined },
    respiration: { failed: true },
  });
});
