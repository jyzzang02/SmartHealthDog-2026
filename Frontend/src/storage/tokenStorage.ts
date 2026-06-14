import { AuthTokens } from '../api/auth';

let AsyncStorage: any = null;
try {
  AsyncStorage = require('@react-native-async-storage/async-storage').default;
} catch {
  AsyncStorage = null;
}

const ACCESS_TOKEN_KEY = 'auth.accessToken';
const REFRESH_TOKEN_KEY = 'auth.refreshToken';
const EXPIRATION_KEY = 'auth.expiration';

let memoryStore: Partial<AuthTokens> = {};

const isAsyncStorageAvailable = () =>
  AsyncStorage &&
  typeof AsyncStorage.multiSet === 'function' &&
  typeof AsyncStorage.multiGet === 'function';

const getStorage = () => (isAsyncStorageAvailable() ? AsyncStorage : null);

export const storeAuthTokens = async (tokens: AuthTokens) => {
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
  memoryStore = tokens;
};

export const getStoredRefreshToken = async () => {
  const storage = getStorage();
  if (storage) {
    try {
      return await storage.getItem(REFRESH_TOKEN_KEY);
    } catch {
    }
  }
  return memoryStore.refreshToken ?? null;
};

export const getStoredAccessToken = async () => {
  const storage = getStorage();
  if (storage) {
    try {
      return await storage.getItem(ACCESS_TOKEN_KEY);
    } catch {
    }
  }
  return memoryStore.accessToken ?? null;
};

export const clearAuthTokens = async () => {
  const storage = getStorage();
  if (storage) {
    try {
      await storage.multiRemove([
        ACCESS_TOKEN_KEY,
        REFRESH_TOKEN_KEY,
        EXPIRATION_KEY,
      ]);
      return;
    } catch {
    }
  }
  memoryStore = {};
};
