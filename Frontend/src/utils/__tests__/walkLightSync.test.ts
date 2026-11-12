import AsyncStorage from '@react-native-async-storage/async-storage';
import type { LightSample, LightSamplesResponse } from '../../api/walks';
import type { WalkLightSampleSource } from '../walkLightSync';

let sync: typeof import('../walkLightSync');
let auth: typeof import('../../storage/tokenStorage');
let end: jest.Mock;
let upload: jest.Mock;
let pending: LightSample[];
let source: WalkLightSampleSource;
const key = 'walk.lightRetry.v1.19.81';
const payload = { end_time: '2026-10-13T06:00:00Z', distance: 1.2, path_coordinates: [] };
const sample = (index: number): LightSample => ({
  client_sample_id: `sample-${index}`, measured_at: '2026-10-13T05:55:00Z', lux: 4000,
});
const accepted = (count: number, duplicate = false): LightSamplesResponse => ({
  result: { received_count: count, saved_count: duplicate ? 0 : count, duplicate_count: duplicate ? count : 0 },
});
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };

beforeEach(async () => {
  jest.resetModules();
  jest.doMock('@react-native-async-storage/async-storage', () => ({ __esModule: true, default: AsyncStorage }));
  await AsyncStorage.clear();
  end = jest.fn().mockResolvedValue({ walk_id: 81 });
  upload = jest.fn().mockImplementation(async (_pet, _walk, samples: LightSample[]) => accepted(samples.length));
  jest.doMock('../../api/walks', () => ({ endPetWalk: end, uploadPetLightSamples: upload }));
  sync = require('../walkLightSync');
  auth = require('../../storage/tokenStorage');
  await auth.storeAuthTokens({ accessToken: 'test', refreshToken: 'test', expiration: 'later' });
  pending = [sample(0)];
  source = {
    getLightSamples: jest.fn(async () => [...pending]),
    acknowledgeLightSamples: jest.fn(async (_walkId, ids) => {
      pending = pending.filter(item => !ids.includes(item.client_sample_id));
    }),
  };
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => { jest.restoreAllMocks(); jest.useRealTimers(); });

it('ends the walk without waiting for a pending light upload and retains failed samples', async () => {
  const gate = deferred<LightSamplesResponse>();
  upload.mockReturnValue(gate.promise);
  const outcome = sync.flushWalkLightSamples(19, 81, source).catch(error => error);
  await flush();
  await expect(sync.finishWalkWithPendingLight(19, 81, payload, source)).resolves.toEqual({ walk_id: 81 });
  expect(end).toHaveBeenCalledWith(19, 81, payload);
  expect(JSON.parse((await AsyncStorage.getItem(key))!)).toEqual({ petId: 19, walkId: 81 });
  gate.reject(new Error('Light API unavailable'));
  expect(await outcome).toBeInstanceOf(Error);
  expect(pending).toHaveLength(1);
  expect(source.acknowledgeLightSamples).not.toHaveBeenCalled();
});

it('restores a failed retry after module restart and acknowledges server duplicates', async () => {
  await sync.finishWalkWithPendingLight(19, 81, payload, source);
  upload.mockRejectedValueOnce(new Error('HTTP 404'));
  await sync.retryPendingWalkLightSamples([19], source);
  expect(await AsyncStorage.getItem(key)).not.toBeNull();
  expect(pending).toHaveLength(1);
  jest.resetModules();
  sync = require('../walkLightSync');
  auth = require('../../storage/tokenStorage');
  await auth.storeAuthTokens({ accessToken: 'test', refreshToken: 'test', expiration: 'later' });
  upload.mockResolvedValueOnce(accepted(1, true));
  await sync.retryPendingWalkLightSamples([19], source);
  expect(pending).toHaveLength(0);
  expect(await AsyncStorage.getItem(key)).toBeNull();
});

it('keeps only unacknowledged batches when an upload fails midway', async () => {
  pending = Array.from({ length: 201 }, (_, index) => sample(index));
  await sync.finishWalkWithPendingLight(19, 81, payload, source);
  upload.mockResolvedValueOnce(accepted(100)).mockRejectedValueOnce(new Error('Network failed'));
  await sync.retryPendingWalkLightSamples([19], source);
  expect(pending).toHaveLength(101);
  expect(pending[0].client_sample_id).toBe('sample-100');
  expect(await AsyncStorage.getItem(key)).not.toBeNull();
  await sync.retryPendingWalkLightSamples([19], source);
  expect(pending).toHaveLength(0);
  expect(await AsyncStorage.getItem(key)).toBeNull();
});

it('does not acknowledge or forget samples when server counts do not match', async () => {
  await sync.finishWalkWithPendingLight(19, 81, payload, source);
  upload.mockResolvedValueOnce(accepted(0));
  await sync.retryPendingWalkLightSamples([19], source);
  expect(pending).toHaveLength(1);
  expect(source.acknowledgeLightSamples).not.toHaveBeenCalled();
  expect(await AsyncStorage.getItem(key)).not.toBeNull();
});

it('shares uploads between active-walk flushing and completed-walk retry', async () => {
  await sync.finishWalkWithPendingLight(19, 81, payload, source);
  const gate = deferred<LightSamplesResponse>();
  upload.mockReturnValueOnce(gate.promise);
  const activeFlush = sync.flushWalkLightSamples(19, 81, source);
  const retry = sync.retryPendingWalkLightSamples([19], source);
  await flush();
  expect(upload).toHaveBeenCalledTimes(1);
  gate.resolve(accepted(1));
  await Promise.all([activeFlush, retry]);
  expect(source.acknowledgeLightSamples).toHaveBeenCalledTimes(1);
  expect(await AsyncStorage.getItem(key)).toBeNull();
});

it('retries only pets returned for the current account', async () => {
  await sync.finishWalkWithPendingLight(19, 81, payload, source);
  await sync.retryPendingWalkLightSamples([23], source);
  expect(upload).not.toHaveBeenCalled();
  expect(await AsyncStorage.getItem(key)).not.toBeNull();
});

it('keeps samples and retry metadata when the account changes during upload', async () => {
  await sync.finishWalkWithPendingLight(19, 81, payload, source);
  const gate = deferred<LightSamplesResponse>();
  upload.mockReturnValueOnce(gate.promise);
  const outcome = sync.retryPendingWalkLightSamples([19], source).catch(error => error);
  await flush();
  await auth.clearAuthTokens();
  gate.resolve(accepted(1));
  expect(await outcome).toBeInstanceOf(Error);
  expect(source.acknowledgeLightSamples).not.toHaveBeenCalled();
  expect(await AsyncStorage.getItem(key)).not.toBeNull();
});

it('preserves pending records after timeout and retries them successfully later', async () => {
  jest.useFakeTimers();
  await sync.finishWalkWithPendingLight(19, 81, payload, source);
  upload.mockImplementationOnce((_pet, _walk, _samples, signal: AbortSignal) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(new Error('Aborted')), { once: true });
  }));
  const retry = sync.retryPendingWalkLightSamples([19], source);
  await flush();
  await jest.advanceTimersByTimeAsync(15000);
  await retry;
  expect(pending).toHaveLength(1);
  expect(await AsyncStorage.getItem(key)).not.toBeNull();
  await sync.retryPendingWalkLightSamples([19], source);
  expect(await AsyncStorage.getItem(key)).toBeNull();
  expect(jest.getTimerCount()).toBe(0);
});

it('does not treat a failed end request as a completed walk', async () => {
  end.mockRejectedValueOnce(new Error('End failed'));
  await expect(sync.finishWalkWithPendingLight(19, 81, payload, source)).rejects.toThrow('End failed');
  expect(pending).toHaveLength(1);
  expect(await AsyncStorage.getItem(key)).not.toBeNull();
});
