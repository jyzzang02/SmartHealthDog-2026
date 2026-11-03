import { searchShelters, searchAllShelters, getShelterDetail, getShelterPets } from './shelters';
import { storeAuthTokens } from '../storage/tokenStorage';

const originalFetch = globalThis.fetch;
let fetchMock: jest.Mock;

beforeEach(async () => {
  await storeAuthTokens({ accessToken: 'test-access', refreshToken: 'test-refresh', expiration: 'later' });
  fetchMock = jest.fn().mockResolvedValue({
    ok: true, status: 200, json: async () => ({ items: [], total: 0 }),
  });
  globalThis.fetch = fetchMock;
});

afterEach(() => { globalThis.fetch = originalFetch; });

it('serializes all six documented region selections and omits empty filters', async () => {
  const selections = [
    {},
    { province: '경기도' },
    { province: '경기도', district: '고양시' },
    { province: '경기도', district: '파주시' },
    { province: '서울특별시' },
    { province: '서울특별시', district: '마포구' },
  ];
  for (const selection of selections) {
    await searchShelters(selection);
    const [url, init] = fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
    expect(new URL(url).pathname).toBe('/api/shelters/search');
    expect(Object.fromEntries(new URL(url).searchParams)).toEqual(selection);
    expect(init.headers.Authorization).toBe('Bearer test-access');
  }
  expect(fetchMock.mock.calls[0][0]).toBe('http://api.puppydoc.ovh:8080/api/shelters/search');
  await searchShelters({ province: ' ', district: '' });
  expect(new URL(fetchMock.mock.calls[6][0]).search).toBe('');
});

it('sends region filters with actual coordinates for distance sorting without a radius', async () => {
  await searchShelters({
    province: ' 경기도 ', district: ' 고양시 ', lat: 37.6, lng: 126.9, sort_by: 'distance',
  });
  expect(Object.fromEntries(new URL(fetchMock.mock.calls[0][0]).searchParams)).toEqual({
    province: '경기도', district: '고양시', lat: '37.6', lng: '126.9', sort_by: 'distance',
  });
});


it('preserves the existing HTTP error handling', async () => {
  fetchMock.mockResolvedValueOnce({ ok: false, status: 500, text: async () =>
    JSON.stringify({ message: 'server-error-message' }) });
  await expect(searchShelters({})).rejects.toThrow('server-error-message');
});

it('maps the list image URL and parent shelter ID for adoption details without inventing a photo', async () => {
  fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({
    shelter_id: 7,
    items: [
      { pet_id: 21, name: 'Photo pet', species: 'dog', image_url: 'https://example.test/pet.jpg' },
      { pet_id: 22, name: 'No photo pet', species: 'cat', image_url: null },
    ], total: 2,
  }) });
  const response = await getShelterPets(7, { limit: 20, offset: 0 });
  expect(response.items[0]).toMatchObject({ pet_id: 21, shelter_id: 7, images: ['https://example.test/pet.jpg'] });
  expect(response.items[1]).toMatchObject({ pet_id: 22, shelter_id: 7 });
  expect(response.items[1].images).toBeUndefined();
});


it('passes the nearby GPS query and cancellation signal through to fetch', async () => {
  const controller = new AbortController();
  await searchShelters({ lat: 37.65, lng: 126.85, sort_by: 'distance', limit: 1000, offset: 0 }, controller.signal);
  expect(Object.fromEntries(new URL(fetchMock.mock.calls[0][0]).searchParams)).toEqual({
    lat: '37.65', lng: '126.85', sort_by: 'distance', limit: '1000', offset: '0',
  });
  expect(fetchMock.mock.calls[0][1].signal).toBe(controller.signal);
});

it('omits incomplete or invalid coordinate pairs', async () => {
  for (const params of [{ lat: 37 }, { lng: 127 }, { lat: NaN, lng: 127 }, { lat: 37, lng: 181 }]) {
    await searchShelters(params);
    const [url] = fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
    expect(new URL(url).search).toBe('');
  }
});

it('preserves nullable fields and does not expose compatibility center or radius', async () => {
  const item = { shelter_id: 1, name: 'Shelter', address: '', distance_m: null, rating: null, review_count: null };
  fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({
    items: [item], total: 1, center: { lat: 37.5665, lng: 126.978 }, radius_km: 0,
  }) });
  const response = await searchShelters({});
  expect(response.items).toEqual([item]);
  expect(response).not.toHaveProperty('center');
  expect(response).not.toHaveProperty('radius_km');
});

it.each([null, {}, { items: null, total: 0 }, { items: [null], total: 1 }, { items: [], total: -1 }])
('rejects malformed successful responses instead of showing an empty result: %j', async data => {
  fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => data });
  await expect(searchShelters({})).rejects.toThrow();
});

it('rejects an invalid JSON response and missing shelter detail', async () => {
  fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => { throw new SyntaxError(); } });
  await expect(searchShelters({})).rejects.toThrow();
  fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ shelter: null }) });
  await expect(getShelterDetail(1)).rejects.toThrow();
});

const shelter = (id: number) => ({ shelter_id: id, name: 'Shelter ' + id, address: '' });
const pageResponse = (items: ReturnType<typeof shelter>[], total: number, offset: number) => ({
  ok: true, status: 200, json: async () => ({ items, total, page: { limit: 20, offset } }),
});
it('loads every regional page even when the server caps the requested limit', async () => {
  fetchMock.mockResolvedValueOnce(pageResponse([shelter(1), shelter(2)], 3, 0))
    .mockResolvedValueOnce(pageResponse([shelter(3)], 3, 2));
  const response = await searchAllShelters({ province: '경기도', district: '고양시', lat: 37, lng: 127 });
  expect(response.items.map(item => item.shelter_id)).toEqual([1, 2, 3]);
  expect(fetchMock.mock.calls.map(([url]) => Object.fromEntries(new URL(url).searchParams))).toEqual([
    { province: '경기도', district: '고양시', lat: '37', lng: '127', limit: '1000', offset: '0' },
    { province: '경기도', district: '고양시', lat: '37', lng: '127', limit: '1000', offset: '2' },
  ]);
});

it.each(['empty', 'duplicate', 'wrong-offset', 'changed-total'])('rejects a non-progressing or inconsistent %s page', async kind => {
  fetchMock.mockResolvedValueOnce(pageResponse([shelter(1)], 2, 0))
    .mockResolvedValueOnce(pageResponse(kind === 'empty' ? [] : [shelter(kind === 'duplicate' ? 1 : 2)],
      kind === 'changed-total' ? 3 : 2, kind === 'wrong-offset' ? 0 : 1));
  await expect(searchAllShelters({})).rejects.toThrow('모두 확인하지 못했습니다');
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

it('does not start another page after cancellation', async () => {
  const controller = new AbortController();
  fetchMock.mockImplementationOnce(async () => {
    controller.abort();
    return pageResponse([shelter(1)], 2, 0);
  });
  await expect(searchAllShelters({}, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
