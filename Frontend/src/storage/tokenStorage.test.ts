import type { AsyncStorageStatic } from '@react-native-async-storage/async-storage';
import type { AuthTokens } from '../api/auth';

let storage: typeof import('./tokenStorage');
let AsyncStorage: AsyncStorageStatic;
const tokens = (account: string): AuthTokens => ({
  accessToken: `${account}-access`, refreshToken: `${account}-refresh`, expiration: 'later',
});

beforeEach(async () => {
  jest.restoreAllMocks();
  jest.resetModules();
  jest.doMock('@react-native-async-storage/async-storage', () => ({
    __esModule: true,
    default: require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
  }));
  AsyncStorage = require('@react-native-async-storage/async-storage').default;
  await AsyncStorage.clear();
  jest.clearAllMocks();
  storage = require('./tokenStorage');
});

afterEach(() => jest.restoreAllMocks());

it('loads a persisted session before any login operation', async () => {
  await AsyncStorage.multiSet([
    ['auth.accessToken', 'existing-access'], ['auth.refreshToken', 'existing-refresh'],
  ]);
  expect(await storage.getStoredAccessToken()).toBe('existing-access');
  expect(await storage.getStoredRefreshToken()).toBe('existing-refresh');
});

it('persists a refresh without changing the active account session', async () => {
  await storage.storeAuthTokens(tokens('old'));
  const session = storage.getAuthSession();
  await storage.storeRefreshedAuthTokens(tokens('rotated'), 'old-refresh', session);
  expect(storage.getAuthSession()).toBe(session);
  expect(await storage.getStoredAccessToken()).toBe('rotated-access');
  expect(await AsyncStorage.getItem('auth.refreshToken')).toBe('rotated-refresh');
});

it('rejects a late refresh after logout without restoring credentials', async () => {
  await storage.storeAuthTokens(tokens('old'));
  const session = storage.getAuthSession();
  await storage.clearAuthTokens();
  await expect(storage.storeRefreshedAuthTokens(tokens('rotated'), 'old-refresh', session)).rejects.toThrow();
  expect(await storage.getStoredAccessToken()).toBeNull();
  expect(await AsyncStorage.getItem('auth.accessToken')).toBeNull();
});

it('rejects an old account refresh after a new account has logged in', async () => {
  await storage.storeAuthTokens(tokens('old'));
  const session = storage.getAuthSession();
  await storage.storeAuthTokens(tokens('new'));
  await expect(storage.storeRefreshedAuthTokens(tokens('rotated'), 'old-refresh', session)).rejects.toThrow();
  expect(await storage.getStoredAccessToken()).toBe('new-access');
  expect(await AsyncStorage.getItem('auth.accessToken')).toBe('new-access');
});

it('does not let another response overwrite an already rotated refresh token', async () => {
  await storage.storeAuthTokens(tokens('old'));
  const session = storage.getAuthSession();
  await storage.storeRefreshedAuthTokens(tokens('rotated'), 'old-refresh', session);
  await expect(storage.storeRefreshedAuthTokens(tokens('stale'), 'old-refresh', session)).rejects.toThrow();
  expect(await storage.getStoredRefreshToken()).toBe('rotated-refresh');
});

it.each(['login', 'logout'])('orders a pending native refresh write before a new %s', async (operation) => {
  await storage.storeAuthTokens(tokens('old'));
  const session = storage.getAuthSession();
  let release!: () => void;
  let started!: () => void;
  const writeStarted = new Promise<void>((resolve) => { started = resolve; });
  const writeGate = new Promise<void>((resolve) => { release = resolve; });
  const nativeSet = AsyncStorage.multiSet;
  jest.spyOn(AsyncStorage, 'multiSet').mockImplementationOnce(async (entries) => {
    started();
    await writeGate;
    await nativeSet(entries);
  });
  const refresh = storage.storeRefreshedAuthTokens(tokens('rotated'), 'old-refresh', session);
  const refreshOutcome = refresh.then(() => null, (error: unknown) => error);
  await writeStarted;
  const nextOperation = operation === 'login'
    ? storage.storeAuthTokens(tokens('new')) : storage.clearAuthTokens();
  expect(await storage.getStoredAccessToken()).toBe(operation === 'login' ? 'new-access' : null);
  release();
  expect(await refreshOutcome).toBeInstanceOf(Error);
  await nextOperation;
  expect(await AsyncStorage.getItem('auth.accessToken')).toBe(operation === 'login' ? 'new-access' : null);
});

it('invalidates the session immediately, even before logout persistence finishes', async () => {
  await storage.storeAuthTokens(tokens('old'));
  const session = storage.getAuthSession();
  const logout = storage.clearAuthTokens();
  expect(() => storage.assertAuthSession(session)).toThrow();
  expect(await storage.getStoredRefreshToken()).toBeNull();
  await logout;
});

it('does not expose old stored credentials when a new login write fails', async () => {
  await storage.storeAuthTokens(tokens('old'));
  jest.spyOn(AsyncStorage, 'multiSet').mockRejectedValueOnce(new Error('Storage unavailable'));
  await storage.storeAuthTokens(tokens('new'));
  expect(await storage.getStoredAccessToken()).toBe('new-access');
  await storage.clearAuthTokens();
  expect(await storage.getStoredAccessToken()).toBeNull();
});

it.each(['login', 'logout'])('ignores a stale native token read after %s', async (operation) => {
  await AsyncStorage.setItem('auth.accessToken', 'old-access');
  let release!: (token: string) => void;
  jest.spyOn(AsyncStorage, 'getItem').mockImplementationOnce(
    () => new Promise<string>((resolve) => { release = resolve; }),
  );
  const pendingRead = storage.getStoredAccessToken();
  if (operation === 'login') await storage.storeAuthTokens(tokens('new'));
  else await storage.clearAuthTokens();
  release('old-access');
  expect(await pendingRead).toBe(operation === 'login' ? 'new-access' : null);
});
