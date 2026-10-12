import { searchHospitals } from './hospitals';
import {
  getStoredAccessToken, getStoredRefreshToken, getAuthSession,
  assertAuthSession, storeRefreshedAuthTokens,
} from '../storage/tokenStorage';
import { refreshAuthToken } from './auth';

jest.mock('../storage/tokenStorage', () => ({
  getStoredAccessToken: jest.fn(), getStoredRefreshToken: jest.fn(),
  getAuthSession: jest.fn(), assertAuthSession: jest.fn(), storeRefreshedAuthTokens: jest.fn(),
}));
jest.mock('./auth', () => ({ refreshAuthToken: jest.fn() }));

const coordinates = { lat: 37.6584, lng: 126.8320 };
const sample = {
  center: coordinates, radius_km: 10, sort_by: 'distance', total: 1,
  items: [{
    hospital_id: '9062394545949535228', name: '신원당동물의료센터', address: null,
    location: { lat: 37.6544951, lng: 126.8404113 }, distance_m: 858,
    phone_number: null, rating: null, review_count: null, website_url: 'http://sinwondangamc.co.kr/',
    place_url: null, open_now: null,
  }], page: { limit: 20, offset: 0 },
};
const rawExample = JSON.stringify(sample).replace('"hospital_id":"9062394545949535228"', '"hospital_id":9062394545949535228');
const response = (body = rawExample, status = 200) => ({
  ok: status >= 200 && status < 300, status, text: jest.fn().mockResolvedValue(body),
});
const originalFetch = globalThis.fetch;
const session = Symbol('test-session');
let fetchMock: jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(getAuthSession).mockReturnValue(session);
  jest.mocked(assertAuthSession).mockImplementation(() => {});
  jest.mocked(storeRefreshedAuthTokens).mockResolvedValue(undefined);
  jest.spyOn(console, 'info').mockImplementation(() => {});
  jest.mocked(getStoredAccessToken).mockResolvedValue('test-access-token');
  jest.mocked(getStoredRefreshToken).mockResolvedValue('test-refresh-token');
  globalThis.fetch = fetchMock = jest.fn().mockResolvedValue(response());
});
afterEach(() => { jest.restoreAllMocks(); jest.useRealTimers(); globalThis.fetch = originalFetch; });

it('requests the documented endpoint and retains the exact Long ID and nullable fields', async () => {
  const result = await searchHospitals(coordinates);
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toContain('/api/hospitals/search?');
  const params = new URL(url).searchParams;
  expect(Object.fromEntries(params)).toEqual({
    lat: '37.6584', lng: '126.832', radius_km: '10', sort_by: 'distance', limit: '20', offset: '0',
  });
  expect(init.headers.Authorization).toBe('Bearer test-access-token');
  expect(result.items[0]).toEqual(sample.items[0]);
  expect(result.page).toEqual(sample.page);
  expect(console.info).not.toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ accessToken: expect.anything() }));
});

it('passes query unchanged and supports a specified region and pagination', async () => {
  await searchHospitals({ location: ' 고양시 덕양구 ', query: ' 24시 ', radius_km: 5, limit: 10, offset: 10 });
  const query = new URL(fetchMock.mock.calls[0][0]).searchParams;
  expect(query.get('location')).toBe('고양시 덕양구');
  expect(query.get('query')).toBe('24시');
  expect(query.get('lat')).toBeNull();
  expect(query.get('limit')).toBe('10');
  expect(query.get('offset')).toBe('10');
});

it('keeps region-only search results with a null distance returned by the backend', async () => {
  fetchMock.mockResolvedValue(response(JSON.stringify({ ...sample, items: [{ ...sample.items[0], distance_m: null }] })));
  const result = await searchHospitals({ location: '고양시 덕양구' });
  expect(result.items).toHaveLength(1);
  expect(result.items[0].distance_m).toBeNull();
});

it('rejects missing or invalid request parameters before contacting the server', async () => {
  for (const params of [{}, { lat: 37 }, { lat: 91, lng: 126 }, { ...coordinates, limit: 51 }, { ...coordinates, radius_km: 101 }]) {
    await expect(searchHospitals(params)).rejects.toThrow();
  }
  expect(fetchMock).not.toHaveBeenCalled();
});

it('refreshes once on 401 using the existing login flow', async () => {
  fetchMock.mockResolvedValueOnce(response('', 401));
  jest.mocked(refreshAuthToken).mockResolvedValue({ accessToken: 'new-token', refreshToken: 'new-refresh', expiration: 'later' });
  await searchHospitals(coordinates);
  expect(refreshAuthToken).toHaveBeenCalledWith('test-refresh-token');
  expect(storeRefreshedAuthTokens).toHaveBeenCalledWith(
    { accessToken: 'new-token', refreshToken: 'new-refresh', expiration: 'later' },
    'test-refresh-token', session,
  );
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe('Bearer new-token');
});

it('preserves a negative generated Long ID without rounding', async () => {
  fetchMock.mockResolvedValue(response(rawExample.replace('9062394545949535228', '-8195880282984156422')));
  expect((await searchHospitals(coordinates)).items[0].hospital_id).toBe('-8195880282984156422');
});

it('sends the GPS keyword to the backend without appending a hospital search phrase', async () => {
  await searchHospitals({ ...coordinates, query: '피부' });
  const params = new URL(fetchMock.mock.calls[0][0]).searchParams;
  expect(params.get('query')).toBe('피부');
  expect(params.get('lat')).toBe(String(coordinates.lat));
  expect(params.get('lng')).toBe(String(coordinates.lng));
});

it('cancels a search waiting for refresh without discarding rotated session tokens', async () => {
  const controller = new AbortController();
  let completeRefresh!: (tokens: Awaited<ReturnType<typeof refreshAuthToken>>) => void;
  fetchMock.mockResolvedValueOnce(response('', 401));
  jest.mocked(refreshAuthToken).mockImplementation(() => new Promise((resolve) => { completeRefresh = resolve; }));
  const pending = searchHospitals(coordinates, controller.signal);
  for (let index = 0; index < 8; index += 1) await Promise.resolve();
  expect(refreshAuthToken).toHaveBeenCalledTimes(1);
  controller.abort();
  await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  const tokens = { accessToken: 'rotated', refreshToken: 'rotated-refresh', expiration: 'later' };
  completeRefresh(tokens);
  for (let index = 0; index < 8; index += 1) await Promise.resolve();
  expect(storeRefreshedAuthTokens).toHaveBeenCalledWith(tokens, 'test-refresh-token', session);
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it('ends a search on timeout even when token refresh has not completed', async () => {
  jest.useFakeTimers();
  fetchMock.mockResolvedValueOnce(response('', 401));
  jest.mocked(refreshAuthToken).mockImplementation(() => new Promise(() => {}));
  const pending = searchHospitals(coordinates).then(
    () => { throw new Error('Expected request timeout'); },
    (error: Error) => { expect(error.message).toContain('응답이 지연'); },
  );
  await jest.advanceTimersByTimeAsync(25000);
  await pending;
  expect(jest.getTimerCount()).toBe(0);
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it('does not refresh on 403 and displays the server error', async () => {
  fetchMock.mockResolvedValue(response('{"message":"병원검색 권한 없음"}', 403));
  await expect(searchHospitals(coordinates)).rejects.toThrow('병원검색 권한 없음');
  expect(refreshAuthToken).not.toHaveBeenCalled();
});

it('does not retry when refresh belongs to a logged-out or replaced session', async () => {
  fetchMock.mockResolvedValueOnce(response('', 401));
  jest.mocked(refreshAuthToken).mockResolvedValue({ accessToken: 'old-rotated', refreshToken: 'old-refresh', expiration: 'later' });
  jest.mocked(storeRefreshedAuthTokens).mockRejectedValue(new Error('세션이 만료되었습니다. 다시 로그인해 주세요.'));
  await expect(searchHospitals(coordinates)).rejects.toThrow('세션이 만료');
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it('does not refresh the new account after a late 401 from the old account', async () => {
  fetchMock.mockImplementationOnce(async () => {
    jest.mocked(assertAuthSession).mockImplementation(() => { throw new Error('Session changed'); });
    return response('', 401);
  });
  await expect(searchHospitals(coordinates)).rejects.toThrow('Session changed');
  expect(refreshAuthToken).not.toHaveBeenCalled();
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it('does not contact the server without a login session', async () => {
  jest.mocked(getStoredAccessToken).mockResolvedValue(null);
  await expect(searchHospitals(coordinates)).rejects.toThrow('로그인이 필요');
  expect(fetchMock).not.toHaveBeenCalled();
});

it('distinguishes empty results from malformed responses', async () => {
  fetchMock.mockResolvedValueOnce(response(JSON.stringify({ ...sample, total: 0, items: [] })));
  expect((await searchHospitals(coordinates)).items).toEqual([]);
  fetchMock.mockResolvedValueOnce(response('{"items":[]}'));
  await expect(searchHospitals(coordinates)).rejects.toThrow('응답 형식');
  fetchMock.mockResolvedValueOnce(response('<html>bad response</html>'));
  await expect(searchHospitals(coordinates)).rejects.toThrow('해석하지 못했습니다');
});

it('excludes invalid coordinates while preserving valid items', async () => {
  fetchMock.mockResolvedValue(response(JSON.stringify({ ...sample, items: [sample.items[0], {
    ...sample.items[0], location: { lat: null, lng: 126 },
  }] })));
  expect((await searchHospitals(coordinates)).items).toHaveLength(1);
});

it('honors cancellation before starting a request', async () => {
  const controller = new AbortController(); controller.abort();
  await expect(searchHospitals(coordinates, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
  expect(fetchMock).not.toHaveBeenCalled();
});

it('aborts and cleans up a timed-out network request', async () => {
  jest.useFakeTimers();
  fetchMock.mockImplementation((_url, init) => new Promise((_resolve, reject) => {
    init.signal.addEventListener('abort', () => reject(Object.assign(new Error(), { name: 'AbortError' })));
  }));
  const request = searchHospitals(coordinates).then(
    () => { throw new Error('Expected request timeout'); },
    (error: Error) => { expect(error.message).toContain('응답이 지연'); },
  );
  await jest.advanceTimersByTimeAsync(25000);
  await request;
  expect(jest.getTimerCount()).toBe(0);
});
