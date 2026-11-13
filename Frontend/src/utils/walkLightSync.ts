import AsyncStorage from '@react-native-async-storage/async-storage';
import { endPetWalk, uploadPetLightSamples } from '../api/walks';
import type { EndWalkRequest, LightSample } from '../api/walks';
import { assertAuthSession, getAuthSession } from '../storage/tokenStorage';

export interface WalkLightSampleSource {
  getLightSamples: (walkId: number) => Promise<LightSample[]>;
  acknowledgeLightSamples: (walkId: number, ids: string[]) => Promise<void>;
}

const RETRY_KEY_PREFIX = 'walk.lightRetry.v1.';
const BATCH_SIZE = 100;
const MAX_RETRY_FAILURES = 5;
type RetryState = { failures: number; nextAt: number; blocked: boolean };
type RetryJob = { petId: number; walkId: number; retry?: RetryState };
const retryStates = new Map<string, RetryState>();
let retrySession = getAuthSession();
const activeRetryStates = (session: symbol) => {
  if (retrySession !== session) {
    retryStates.clear();
    retrySession = session;
  }
  return retryStates;
};
const failedRetry = (error: unknown, previous?: RetryState): RetryState => {
  const status = typeof error === 'object' && error !== null && 'status' in error ? error.status : null;
  const permanent = typeof status === 'number' && status >= 400 && status < 500 &&
    ![401, 403, 408, 425, 429].includes(status);
  const failures = (previous?.failures ?? 0) + 1;
  return { failures, nextAt: Date.now() + 30_000 * 2 ** Math.min(failures - 1, 4),
    blocked: permanent || failures >= MAX_RETRY_FAILURES };
};
const canRetry = (retry?: RetryState) => !retry || (!retry.blocked && Date.now() >= retry.nextAt);
const UPLOAD_TIMEOUT_MS = 15_000;
const uploads = new Map<string, { session: symbol; promise: Promise<number> }>();
const retryKey = (petId: number, walkId: number) => `${RETRY_KEY_PREFIX}${petId}.${walkId}`;

export const flushWalkLightSamples = (
  petId: number,
  walkId: number,
  source: WalkLightSampleSource,
): Promise<number> => {
  const session = getAuthSession();
  const key = retryKey(petId, walkId);
  const existing = uploads.get(key);
  if (existing?.session === session) return existing.promise;

  const states = activeRetryStates(session);
  const previous = states.get(key);
  if (!canRetry(previous)) return Promise.resolve(0);

  const promise = (async () => {
    const samples = await source.getLightSamples(walkId);
    assertAuthSession(session);
    for (let index = 0; index < samples.length; index += BATCH_SIZE) {
      const batch = samples.slice(index, index + BATCH_SIZE);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);
      try {
        assertAuthSession(session);
        const { result } = await uploadPetLightSamples(petId, walkId, batch, controller.signal);
        assertAuthSession(session);
        if (!result || result.received_count !== batch.length ||
            !Number.isInteger(result.saved_count) || result.saved_count < 0 ||
            !Number.isInteger(result.duplicate_count) || result.duplicate_count < 0 ||
            result.saved_count + result.duplicate_count !== batch.length) {
          throw new Error('조도 기록 일부가 저장되지 않아 전송을 다시 시도합니다.');
        }
        // Remove only IDs whose server persistence (including duplicates) was confirmed.
        await source.acknowledgeLightSamples(walkId, batch.map(sample => sample.client_sample_id));
      } finally {
        clearTimeout(timeout);
      }
    }
    states.delete(key);
    return samples.length;
  })().catch(error => {
    assertAuthSession(session);
    states.set(key, failedRetry(error, previous));
    throw error;
  });
  const entry = { session, promise };
  uploads.set(key, entry);
  const cleanup = () => { if (uploads.get(key) === entry) uploads.delete(key); };
  promise.then(cleanup, cleanup);
  return promise;
};

export const finishWalkWithPendingLight = async (
  petId: number,
  walkId: number,
  payload: EndWalkRequest,
  source?: WalkLightSampleSource,
) => {
  const session = getAuthSession();
  if (source) {
    // The samples already live in native persistent storage; retain their retry address
    // before clearing the active walk, including when the app exits just after ending.
    const key = retryKey(petId, walkId);
    const retry = activeRetryStates(session).get(key);
    await AsyncStorage.setItem(key, JSON.stringify({ petId, walkId, retry }));
    assertAuthSession(session);
  }
  return endPetWalk(petId, walkId, payload);
};

export const retryPendingWalkLightSamples = async (
  petIds: number[],
  source: WalkLightSampleSource,
) => {
  const session = getAuthSession();
  const allowedPets = new Set(petIds);
  const keys = (await AsyncStorage.getAllKeys()).filter(key => key.startsWith(RETRY_KEY_PREFIX));
  assertAuthSession(session);
  for (const key of keys) {
    assertAuthSession(session);
    const raw = await AsyncStorage.getItem(key);
    assertAuthSession(session);
    if (!raw) continue;
    let job: RetryJob;
    try { job = JSON.parse(raw); } catch { continue; }
    if (!job || !Number.isSafeInteger(job.petId) || job.petId <= 0 ||
        !Number.isSafeInteger(job.walkId) || job.walkId <= 0 ||
        key !== retryKey(job.petId, job.walkId) || !allowedPets.has(job.petId)) continue;
    const states = activeRetryStates(session);
    const previous = states.get(key);
    if (job.retry && (!previous || job.retry.failures > previous.failures)) states.set(key, job.retry);
    if (!canRetry(states.get(key))) continue;
    try {
      await flushWalkLightSamples(job.petId, job.walkId, source);
      assertAuthSession(session);
      // A final read also catches a sample queued while an earlier upload was running.
      if ((await source.getLightSamples(job.walkId)).length === 0) {
        assertAuthSession(session);
        await AsyncStorage.removeItem(key);
      }
    } catch {
      assertAuthSession(session);
      const retry = activeRetryStates(session).get(key);
      if (retry) await AsyncStorage.setItem(key, JSON.stringify({ petId: job.petId, walkId: job.walkId, retry }));
    }
  }
};
