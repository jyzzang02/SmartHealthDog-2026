import { getMyProfile } from './users';
import { storeAuthTokens } from '../storage/tokenStorage';
import { isApiError } from './auth';

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
}));
const originalFetch = globalThis.fetch;
const response = (status: number, body: unknown) => ({
  status, ok: status >= 200 && status < 300,
  text: async () => JSON.stringify(body), json: async () => body,
}) as Response;
afterEach(() => { globalThis.fetch = originalFetch; });
beforeEach(async () => {
  await storeAuthTokens({ accessToken: 'access', refreshToken: 'refresh', expiration: 'later' });
});

it('passes through network errors during refresh', async () => {
  globalThis.fetch = jest.fn().mockResolvedValueOnce(response(401, {})).mockRejectedValueOnce(new Error('network'));
  await expect(getMyProfile({ preserveRefreshError: true })).rejects.toThrow('network');
});

it('passes through the server invalid-token code during refresh', async () => {
  globalThis.fetch = jest.fn().mockResolvedValueOnce(response(401, {})).mockResolvedValueOnce(response(401, { code: ['INVALID_JWT'] }));
  try {
    await getMyProfile({ preserveRefreshError: true });
    throw new Error('expected rejection');
  } catch (error) {
    expect(isApiError(error)).toBe(true);
    if (isApiError(error)) expect(error.codes).toContain('INVALID_JWT');
  }
});
