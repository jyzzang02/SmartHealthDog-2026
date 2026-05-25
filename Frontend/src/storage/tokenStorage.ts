import { AuthTokens } from '../api/auth';

// Lazy-load AsyncStorage to avoid crashing when the native module is missing.
let AsyncStorage: any = null;
try {
  AsyncStorage = require('@react-native-async-storage/async-storage').default;
  console.log('[auth] AsyncStorage successfully loaded');
} catch (error) {
  console.error(
    '[auth] AsyncStorage native module not found at import time; app WILL NOT persist tokens across restarts. ' +
    'Please ensure @react-native-async-storage/async-storage is installed and linked properly.',
    error
  );
}

const ACCESS_TOKEN_KEY = 'auth.accessToken';
const REFRESH_TOKEN_KEY = 'auth.refreshToken';
const EXPIRATION_KEY = 'auth.expiration';

const describeToken = (token?: string | null) => (token ? `len=${token.length}` : 'empty');

// In-memory fallback when native AsyncStorage is unavailable (e.g., not linked/rebuilt).
let memoryStore: Partial<AuthTokens> = {};

const isAsyncStorageAvailable = () =>
  AsyncStorage &&
  typeof AsyncStorage.multiSet === 'function' &&
  typeof AsyncStorage.multiGet === 'function';

const warnIfFallback = () => {
  console.error(
    '[auth] ❌ AsyncStorage native module not available; using in-memory fallback. ' +
    'Tokens will NOT persist after app restart. ' +
    'Action required: Install and link @react-native-async-storage/async-storage, then rebuild the app.'
  );
};

const getStorage = () => {
  if (isAsyncStorageAvailable()) {
    return AsyncStorage;
  }
  warnIfFallback();
  return null;
};

export const storeAuthTokens = async (tokens: AuthTokens) => {
  console.log('[auth] store tokens', {
    accessToken: describeToken(tokens.accessToken),
    refreshToken: describeToken(tokens.refreshToken),
    expiration: tokens.expiration,
  });
  const storage = getStorage();
  if (storage) {
    try {
      await storage.multiSet([
        [ACCESS_TOKEN_KEY, tokens.accessToken],
        [REFRESH_TOKEN_KEY, tokens.refreshToken],
        [EXPIRATION_KEY, tokens.expiration],
      ]);
      console.log('[auth] ✅ store tokens success (AsyncStorage)');
      return;
    } catch (error) {
      console.error('[auth] ❌ AsyncStorage store failed, falling back to memory', error);
    }
  } else {
    warnIfFallback();
  }
  // Fallback to memory (not persistent)
  memoryStore = tokens;
  console.warn('[auth] ⚠️  store tokens (memory fallback - will NOT persist on restart)');
};

export const getStoredRefreshToken = async () => {
  const storage = getStorage();
  if (storage) {
    try {
      const token = await storage.getItem(REFRESH_TOKEN_KEY);
      console.log('[auth] ✅ get refreshToken (AsyncStorage)', describeToken(token));
      return token;
    } catch (error) {
      console.error('[auth] ❌ AsyncStorage get refreshToken failed, using memory', error);
    }
  } else {
    warnIfFallback();
  }
  const token = memoryStore.refreshToken ?? null;
  console.log('[auth] get refreshToken (memory)', describeToken(token));
  return token;
};

export const getStoredAccessToken = async () => {
  const storage = getStorage();
  if (storage) {
    try {
      const token = await storage.getItem(ACCESS_TOKEN_KEY);
      console.log('[auth] ✅ get accessToken (AsyncStorage)', describeToken(token));
      return token;
    } catch (error) {
      console.error('[auth] ❌ AsyncStorage get accessToken failed, using memory', error);
    }
  } else {
    warnIfFallback();
  }
  const token = memoryStore.accessToken ?? null;
  console.log('[auth] get accessToken (memory)', describeToken(token));
  return token;
};

export const clearAuthTokens = async () => {
  console.log('[auth] 🚪 clear tokens');
  const storage = getStorage();
  if (storage) {
    try {
      await storage.multiRemove([
        ACCESS_TOKEN_KEY,
        REFRESH_TOKEN_KEY,
        EXPIRATION_KEY,
      ]);
      console.log('[auth] ✅ clear tokens success (AsyncStorage)');
      return;
    } catch (error) {
      console.error('[auth] ❌ AsyncStorage clear failed, clearing memory only', error);
    }
  } else {
    warnIfFallback();
  }
  memoryStore = {};
  console.log('[auth] ✅ clear tokens (memory fallback)');
};

