import { refreshAuthToken } from './auth';
import {
  assertAuthSession, getStoredAccessToken, getStoredRefreshToken,
  storeRefreshedAuthTokens,
} from '../storage/tokenStorage';

const pendingRefreshes = new Map<symbol, Promise<string>>();

export const refreshSessionAccessToken = (
  session: symbol,
  rejectedAccessToken: string,
): Promise<string> => {
  assertAuthSession(session);
  const pending = pendingRefreshes.get(session);
  if (pending) return pending;

  // Share the complete refresh AND persistence operation across API modules.
  const operation = (async () => {
    const currentAccessToken = await getStoredAccessToken();
    assertAuthSession(session);
    // A delayed 401 may arrive after another request has already refreshed.
    if (currentAccessToken && currentAccessToken !== rejectedAccessToken) {
      return currentAccessToken;
    }
    const refreshToken = await getStoredRefreshToken();
    assertAuthSession(session);
    if (!refreshToken) throw new Error('세션이 만료되었습니다. 다시 로그인해 주세요.');
    const tokens = await refreshAuthToken(refreshToken);
    await storeRefreshedAuthTokens(tokens, refreshToken, session);
    assertAuthSession(session);
    return tokens.accessToken;
  })();
  pendingRefreshes.set(session, operation);
  const cleanup = () => { pendingRefreshes.delete(session); };
  operation.then(cleanup, cleanup);
  return operation;
};
