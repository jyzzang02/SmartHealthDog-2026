import type { AuthTokens } from './auth';

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
}));

let storage: typeof import('../storage/tokenStorage');
let refresh: typeof import('./refreshSession').refreshSessionAccessToken;
let pets: typeof import('./pets');
let hospitals: typeof import('./hospitals');
let fetchMock: jest.Mock;
const originalFetch = globalThis.fetch;
const tokens = (name: string): AuthTokens => ({
  accessToken: `${name}-access`, refreshToken: `${name}-refresh`, expiration: 'later',
});
const response = (data: unknown, status = 200) => ({
  ok: status >= 200 && status < 300, status,
  json: async () => data, text: async () => JSON.stringify(data),
});
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
const coordinates = { lat: 37.5, lng: 127 };
const hospitalResult = { center: coordinates, total: 0, items: [], page: { limit: 5, offset: 0 }, radius_km: 10 };

beforeEach(async () => {
  jest.resetModules();
  jest.spyOn(console, 'info').mockImplementation(() => {});
  storage = require('../storage/tokenStorage');
  refresh = require('./refreshSession').refreshSessionAccessToken;
  pets = require('./pets');
  hospitals = require('./hospitals');
  globalThis.fetch = fetchMock = jest.fn();
  await storage.storeAuthTokens(tokens('old'));
});
afterEach(() => { globalThis.fetch = originalFetch; jest.restoreAllMocks(); jest.useRealTimers(); });

it.each(['pets', 'hospitals'])('shares one persisted refresh when %s requests first', async (first) => {
  const gate = deferred<ReturnType<typeof response>>();
  fetchMock.mockImplementation(async (url: string, init: RequestInit) => {
    if (url.endsWith('/token/refresh')) return gate.promise;
    if ((init.headers as Record<string, string>).Authorization === 'Bearer old-access') return response({}, 401);
    return response(url.includes('/hospitals/') ? hospitalResult : []);
  });
  const calls = first === 'pets'
    ? [pets.getMyPets(), hospitals.searchHospitals({ ...coordinates, limit: 5 })]
    : [hospitals.searchHospitals({ ...coordinates, limit: 5 }), pets.getMyPets()];
  const result = Promise.all(calls);
  await flush();
  expect(fetchMock.mock.calls.filter(([url]) => url.endsWith('/token/refresh'))).toHaveLength(1);
  gate.resolve(response(tokens('new')));
  await expect(result).resolves.toHaveLength(2);
  expect(await storage.getStoredAccessToken()).toBe('new-access');
  const nativeStorage = require('@react-native-async-storage/async-storage').default;
  expect(await nativeStorage.getItem('auth.refreshToken')).toBe('new-refresh');
  expect(fetchMock.mock.calls.filter(([, init]) => init.headers.Authorization === 'Bearer new-access')).toHaveLength(2);
});

it('reuses the stored access token for a 401 arriving after refresh completes', async () => {
  fetchMock.mockResolvedValue(response(tokens('new')));
  const session = storage.getAuthSession();
  await expect(refresh(session, 'old-access')).resolves.toBe('new-access');
  await expect(refresh(session, 'old-access')).resolves.toBe('new-access');
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it('clears a failed shared operation so a later retry can succeed', async () => {
  fetchMock.mockRejectedValueOnce(new Error('Network failed')).mockResolvedValueOnce(response(tokens('new')));
  const session = storage.getAuthSession();
  const outcomes = await Promise.allSettled([refresh(session, 'old-access'), refresh(session, 'old-access')]);
  expect(outcomes.map(item => item.status)).toEqual(['rejected', 'rejected']);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  await expect(refresh(session, 'old-access')).resolves.toBe('new-access');
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

it('releases a stalled shared refresh after timeout and allows retry', async () => {
  jest.useFakeTimers();
  fetchMock.mockImplementationOnce((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
    init.signal?.addEventListener('abort', () => reject(new Error('Aborted')), { once: true });
  })).mockResolvedValueOnce(response(tokens('new')));
  const session = storage.getAuthSession();
  const outcome = refresh(session, 'old-access').catch((error: unknown) => error);
  await flush();
  await jest.advanceTimersByTimeAsync(30000);
  expect(await outcome).toBeInstanceOf(Error);
  await expect(refresh(session, 'old-access')).resolves.toBe('new-access');
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(jest.getTimerCount()).toBe(0);
});

it.each(['login', 'logout'])('does not restore old credentials after %s during refresh', async (action) => {
  const gate = deferred<ReturnType<typeof response>>();
  fetchMock.mockReturnValue(gate.promise);
  const oldSession = storage.getAuthSession();
  const outcome = refresh(oldSession, 'old-access').catch((error: unknown) => error);
  await flush();
  if (action === 'login') await storage.storeAuthTokens(tokens('other'));
  else await storage.clearAuthTokens();
  gate.resolve(response(tokens('stale')));
  expect(await outcome).toBeInstanceOf(Error);
  expect(await storage.getStoredAccessToken()).toBe(action === 'login' ? 'other-access' : null);
  expect(() => refresh(oldSession, 'old-access')).toThrow();
});

it('does not make a newly logged-in account wait for an old account refresh', async () => {
  const gate = deferred<ReturnType<typeof response>>();
  fetchMock.mockReturnValueOnce(gate.promise).mockResolvedValueOnce(response(tokens('other-new')));
  const oldOutcome = refresh(storage.getAuthSession(), 'old-access').catch((error: unknown) => error);
  await flush();
  await storage.storeAuthTokens(tokens('other'));
  await expect(refresh(storage.getAuthSession(), 'other-access')).resolves.toBe('other-new-access');
  gate.resolve(response(tokens('stale')));
  expect(await oldOutcome).toBeInstanceOf(Error);
  expect(await storage.getStoredAccessToken()).toBe('other-new-access');
});

it('cancels only the hospital wait while pets still uses the shared refresh', async () => {
  const gate = deferred<ReturnType<typeof response>>();
  fetchMock.mockImplementation(async (url: string, init: RequestInit) => {
    if (url.endsWith('/token/refresh')) return gate.promise;
    if ((init.headers as Record<string, string>).Authorization === 'Bearer old-access') return response({}, 401);
    return response([]);
  });
  const controller = new AbortController();
  const hospitalOutcome = hospitals.searchHospitals({ ...coordinates, limit: 5 }, controller.signal)
    .catch((error: unknown) => error);
  const petResult = pets.getMyPets();
  await flush();
  controller.abort();
  expect(await hospitalOutcome).toMatchObject({ name: 'AbortError' });
  gate.resolve(response(tokens('new')));
  await expect(petResult).resolves.toEqual([]);
  expect(fetchMock.mock.calls.filter(([url]) => url.endsWith('/token/refresh'))).toHaveLength(1);
  expect(await storage.getStoredAccessToken()).toBe('new-access');
  expect(fetchMock.mock.calls.filter(([url]) => url.includes('/hospitals/'))).toHaveLength(1);
});
