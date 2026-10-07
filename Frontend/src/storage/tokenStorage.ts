import type { AuthTokens } from '../api/auth';
import type { AsyncStorageStatic } from '@react-native-async-storage/async-storage';

let AsyncStorage: AsyncStorageStatic | null = null;
try {
  AsyncStorage = require('@react-native-async-storage/async-storage').default;
} catch {
  AsyncStorage = null;
}

const ACCESS_TOKEN_KEY = 'auth.accessToken';
const REFRESH_TOKEN_KEY = 'auth.refreshToken';
const EXPIRATION_KEY = 'auth.expiration';

let memoryStore: Partial<AuthTokens> = {};
let hasMemorySession = false;
let authSession = Symbol('auth-session');
let storageWrites: Promise<unknown> = Promise.resolve();

export const getAuthSession = () => authSession;

export const assertAuthSession = (session: symbol) => {
  if (session !== authSession) {
    throw new Error('세션이 만료되었습니다. 다시 로그인해 주세요.');
  }
};

// Serialize native writes so a late refresh cannot finish after a newer login/logout.
const enqueueStorageWrite = <T>(operation: () => Promise<T>): Promise<T> => {
  const result = storageWrites.then(operation);
  storageWrites = result.then(() => undefined, () => undefined);
  return result;
};

const isAsyncStorageAvailable = () =>
  AsyncStorage &&
  typeof AsyncStorage.multiSet === 'function' &&
  typeof AsyncStorage.multiGet === 'function';

const getStorage = () => (isAsyncStorageAvailable() ? AsyncStorage : null);

const persistAuthTokens = async (tokens: AuthTokens) => {
  const storage = getStorage();
  if (storage) {
    try {
      await storage.multiSet([
        [ACCESS_TOKEN_KEY, tokens.accessToken],
        [REFRESH_TOKEN_KEY, tokens.refreshToken],
        [EXPIRATION_KEY, tokens.expiration],
      ]);
      return;
    } catch {
    }
  }
};

export const storeAuthTokens = (tokens: AuthTokens) => {
  authSession = Symbol('auth-session');
  hasMemorySession = true;
  memoryStore = { ...tokens };
  return enqueueStorageWrite(() => persistAuthTokens(tokens));
};

export const storeRefreshedAuthTokens = (
  tokens: AuthTokens,
  expectedRefreshToken: string,
  session: symbol,
) => enqueueStorageWrite(async () => {
  assertAuthSession(session);
  const currentRefreshToken = await getStoredRefreshToken();
  assertAuthSession(session);
  if (currentRefreshToken !== expectedRefreshToken) {
    throw new Error('세션이 만료되었습니다. 다시 로그인해 주세요.');
  }
  hasMemorySession = true;
  memoryStore = { ...tokens };
  await persistAuthTokens(tokens);
  assertAuthSession(session);
});

export const getStoredRefreshToken = async () => {
  if (hasMemorySession) return memoryStore.refreshToken ?? null;
  const storage = getStorage();
  if (storage) {
    try {
      const token = await storage.getItem(REFRESH_TOKEN_KEY);
      return hasMemorySession ? memoryStore.refreshToken ?? null : token;
    } catch {
    }
  }
  return memoryStore.refreshToken ?? null;
};

export const getStoredAccessToken = async () => {
  if (hasMemorySession) return memoryStore.accessToken ?? null;
  const storage = getStorage();
  if (storage) {
    try {
      const token = await storage.getItem(ACCESS_TOKEN_KEY);
      return hasMemorySession ? memoryStore.accessToken ?? null : token;
    } catch {
    }
  }
  return memoryStore.accessToken ?? null;
};

export const clearAuthTokens = () => {
  authSession = Symbol('auth-session');
  hasMemorySession = true;
  memoryStore = {};
  return enqueueStorageWrite(async () => {
    const storage = getStorage();
    if (storage) {
      try {
        await storage.multiRemove([
          ACCESS_TOKEN_KEY,
          REFRESH_TOKEN_KEY,
          EXPIRATION_KEY,
        ]);
      } catch {
      }
    }
  });
};
