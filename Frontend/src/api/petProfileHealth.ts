import { createPetOwnershipCheck, getLatestCompletedPetSubmission } from './diagnosis';
import { listRespirationRecords } from './respiration';
import { listSelfChecks } from './selfCheck';
import type { CheckStage } from '../data/selfCheck';
import { getSeoulDateKey } from '../utils/walkWeek';

type RecordDate = { date?: string; failed?: true };
export type PetProfileHealth = {
  eye: RecordDate;
  urine: RecordDate;
  selfCheck: RecordDate & { stage?: CheckStage };
  respiration: RecordDate;
};

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

export const formatProfileRecordDate = (value?: string) => {
  if (!value) return undefined;
  const timestamp = new Date(value);
  if (!Number.isFinite(timestamp.getTime())) return undefined;
  const key = getSeoulDateKey(timestamp);
  const weekday = new Date(key + 'T00:00:00Z').getUTCDay();
  return key.replace(/-/g, '.') + ' (' + WEEKDAYS[weekday] + ')';
};

export const formatLatestProfileCheckupDate = (dates: (string | undefined)[]) => {
  let latest: string | undefined;
  for (const date of dates) {
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const parsed = new Date(date + 'T00:00:00Z');
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) continue;
    if (!latest || date > latest) latest = date;
  }
  return formatProfileRecordDate(latest);
};

const validStage = (value: unknown): CheckStage | undefined =>
  value === 1 || value === 2 || value === 3 || value === 4 ? value : undefined;

const settleOnAbort = <T>(request: Promise<T>, signal: AbortSignal): Promise<T> => {
  let onAbort: () => void;
  return new Promise<T>((resolve, reject) => {
    onAbort = () => reject(new Error('Request aborted'));
    request.then(resolve, reject);
    if (signal.aborted) onAbort();
    else signal.addEventListener('abort', onAbort);
  }).finally(() => signal.removeEventListener('abort', onAbort));
};

export const getPetProfileHealth = async (petId: number, signal: AbortSignal): Promise<PetProfileHealth> => {
  const confirmOwnedOn404 = createPetOwnershipCheck(petId, signal);
  const [eye, urine, selfCheck, respiration] = await Promise.allSettled([
    settleOnAbort(getLatestCompletedPetSubmission(petId, 'EYE', signal, confirmOwnedOn404), signal),
    settleOnAbort(getLatestCompletedPetSubmission(petId, 'URINE', signal, confirmOwnedOn404), signal),
    settleOnAbort(listSelfChecks(petId, 0, signal), signal).then(page => {
      if (!Array.isArray(page?.content)) throw new Error('Invalid self-check list');
      const latest = page.content[0];
      if (latest && latest.petId !== petId) throw new Error('Invalid self-check pet');
      return latest;
    }),
    settleOnAbort(listRespirationRecords(petId, signal), signal).then(records => {
      if (!Array.isArray(records)) throw new Error('Invalid respiration list');
      let latest: string | undefined;
      let latestTime = Number.NEGATIVE_INFINITY;
      for (const record of records) {
        if (record?.petId !== petId || record.status !== 'COMPLETED') continue;
        const date = record.uploadedAt ?? record.createdAt;
        const time = Date.parse(date);
        if (Number.isFinite(time) && time > latestTime) {
          latest = date;
          latestTime = time;
        }
      }
      return latest;
    }),
  ]);
  return {
    eye: eye.status === 'fulfilled' ? { date: eye.value?.submittedAt } : { failed: true },
    urine: urine.status === 'fulfilled' ? { date: urine.value?.submittedAt } : { failed: true },
    respiration: respiration.status === 'fulfilled' ? { date: respiration.value } : { failed: true },
    selfCheck: selfCheck.status === 'fulfilled'
      ? { date: selfCheck.value?.createdAt, stage: validStage(selfCheck.value?.overallStage) }
      : { failed: true },
  };
};
