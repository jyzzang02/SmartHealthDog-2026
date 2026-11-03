import { getAllShelterPets, getShelterPets, getShelterPetDetail } from './shelters';
import { storeAuthTokens } from '../storage/tokenStorage';

const originalFetch = globalThis.fetch;
let fetchMock: jest.Mock;
const pet = (id: number) => ({ pet_id: id, name: 'Happy', species: 'dog', breed: 'Jindo' });
const batch = (start: number, count: number) => Array.from({ length: count }, (_, i) => pet(start + i));
const json = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
const page = (items: unknown[], total: number, offset = 0, limit = 20) =>
  json({ shelter_id: 7, items, total, limit, offset, status: 'AVAILABLE' });

beforeEach(async () => {
  await storeAuthTokens({ accessToken: 'test-access', refreshToken: 'test-refresh', expiration: 'later' });
  fetchMock = jest.fn();
  globalThis.fetch = fetchMock;
});
afterEach(() => { globalThis.fetch = originalFetch; });

it('reads root pagination and maps list images and nullable fields without fabricated data', async () => {
  const controller = new AbortController();
  fetchMock.mockResolvedValueOnce(page([
    { ...pet(1), image_url: ' https://example.test/happy.jpg ', gender: null, is_neutered: null },
    { ...pet(2), image_url: null },
  ], 9, 0, 2));
  const result = await getShelterPets(7, { status: 'AVAILABLE', limit: 20, offset: 0 }, controller.signal);
  expect(result.page).toEqual({ limit: 2, offset: 0 });
  expect(result.total).toBe(9);
  expect(result.items[0]).toMatchObject({ shelter_id: 7, pet_id: 1,
    images: ['https://example.test/happy.jpg'], gender: null, is_neutered: null });
  expect(result.items[1].images).toBeUndefined();
  expect(Object.fromEntries(new URL(fetchMock.mock.calls[0][0]).searchParams))
    .toEqual({ status: 'AVAILABLE', limit: '20', offset: '0' });
  expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'GET', signal: controller.signal });
});

it('supports the existing nested page shape', async () => {
  fetchMock.mockResolvedValueOnce(json({ items: [pet(1)], total: 1, page: { limit: 20, offset: 0 } }));
  expect((await getShelterPets(7)).page).toEqual({ limit: 20, offset: 0 });
});

it('loads more than twenty pets using the global total', async () => {
  fetchMock.mockResolvedValueOnce(page(batch(1, 20), 21))
    .mockResolvedValueOnce(page([pet(21)], 21, 20));
  expect((await getAllShelterPets(7)).map(item => item.pet_id)).toEqual(batch(1, 21).map(item => item.pet_id));
  expect(fetchMock.mock.calls.map(([url]) => new URL(url).searchParams.get('offset'))).toEqual(['0', '20']);
});

it('follows a server-capped limit without skipping pets', async () => {
  fetchMock.mockResolvedValueOnce(page(batch(1, 2), 3, 0, 2))
    .mockResolvedValueOnce(page([pet(3)], 3, 2, 2));
  expect((await getAllShelterPets(7)).map(item => item.pet_id)).toEqual([1, 2, 3]);
});

it('also exhausts full pages when the legacy backend reports a page count as total', async () => {
  fetchMock.mockResolvedValueOnce(page(batch(1, 20), 20))
    .mockResolvedValueOnce(page([pet(21)], 1, 20));
  expect(await getAllShelterPets(7)).toHaveLength(21);
});

it('checks one more page for an exact multiple and accepts the real empty result', async () => {
  fetchMock.mockResolvedValueOnce(page(batch(1, 20), 20)).mockResolvedValueOnce(page([], 0, 20));
  expect(await getAllShelterPets(7)).toHaveLength(20);
  expect(fetchMock).toHaveBeenCalledTimes(2);
  fetchMock.mockResolvedValueOnce(page([], 0));
  expect(await getAllShelterPets(7)).toEqual([]);
});

it.each(['duplicate', 'empty', 'changed-total', 'wrong-offset'])
('rejects an incomplete or inconsistent %s page', async kind => {
  fetchMock.mockResolvedValueOnce(page(batch(1, 20), 21))
    .mockResolvedValueOnce(page(kind === 'empty' ? [] : [pet(kind === 'duplicate' ? 1 : 21)],
      kind === 'changed-total' ? 22 : 21, kind === 'wrong-offset' ? 0 : 20));
  await expect(getAllShelterPets(7)).rejects.toThrow('입양 동물 정보를 불러오지 못했습니다.');
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

it('bounds requests when a server never finishes a result', async () => {
  fetchMock.mockImplementation(async (url: string) => {
    const offset = Number(new URL(url).searchParams.get('offset'));
    return page(batch(offset + 1, 20), 2001, offset);
  });
  await expect(getAllShelterPets(7)).rejects.toThrow();
  expect(fetchMock).toHaveBeenCalledTimes(100);
});

it('cancels before the first page and between pages', async () => {
  const before = new AbortController(); before.abort();
  await expect(getAllShelterPets(7, before.signal)).rejects.toMatchObject({ name: 'AbortError' });
  expect(fetchMock).not.toHaveBeenCalled();
  const during = new AbortController();
  fetchMock.mockImplementationOnce(async () => { during.abort(); return page(batch(1, 20), 21); });
  await expect(getAllShelterPets(7, during.signal)).rejects.toMatchObject({ name: 'AbortError' });
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it.each([null, {}, { items: null }, { items: [null] }, { items: [{ ...pet(1), is_neutered: 'false' }] },
  { items: [{ ...pet(1), images: [null] }] }, { items: [{ ...pet(1), shelter_id: 8 }] },
  { shelter_id: 8, items: [] }, { items: [], total: -1 }, { items: [], limit: 0 },
  { items: [], offset: '0' }, { items: [], total: 1.5 }])
('rejects malformed list payloads: %j', async payload => {
  fetchMock.mockResolvedValueOnce(json(payload));
  await expect(getShelterPets(7)).rejects.toThrow();
});

it.each([0, -1, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1])
('rejects invalid IDs before making requests: %s', async id => {
  await expect(getShelterPets(id)).rejects.toThrow();
  await expect(getShelterPetDetail(7, id)).rejects.toThrow();
  expect(fetchMock).not.toHaveBeenCalled();
});

it.each([{ limit: 0 }, { limit: 1001 }, { offset: -1 }, { offset: 2147483648 }])
('rejects unsafe pagination: %j', async params => {
  await expect(getShelterPets(7, params)).rejects.toThrow();
  expect(fetchMock).not.toHaveBeenCalled();
});

it('validates detail identities and passes through cancellation and real image/contact values', async () => {
  const controller = new AbortController();
  const detail = { ...pet(21), shelter_id: 7, images: [' https://example.test/real.jpg ', ''],
    shelter_contact: { name: 'Shelter', phone_number: null, website_url: null } };
  fetchMock.mockResolvedValueOnce(json({ pet: detail }));
  expect(await getShelterPetDetail(7, 21, controller.signal)).toMatchObject({ pet_id: 21,
    shelter_id: 7, images: ['https://example.test/real.jpg'], shelter_contact: detail.shelter_contact });
  expect(new URL(fetchMock.mock.calls[0][0]).pathname).toBe('/api/shelters/7/pets/21');
  expect(fetchMock.mock.calls[0][1].signal).toBe(controller.signal);
});

it.each([null, { pet: null }, { pet: { ...pet(21), shelter_id: 8 } },
  { pet: { ...pet(22), shelter_id: 7 } }, { pet: { ...pet(21), shelter_id: 7, shelter_contact: [] } }])
('does not display an invalid or unrelated detail: %j', async data => {
  fetchMock.mockResolvedValueOnce(json(data));
  await expect(getShelterPetDetail(7, 21)).rejects.toThrow();
});

it('keeps server errors as failures rather than empty lists', async () => {
  fetchMock.mockResolvedValueOnce({ ok: false, status: 500,
    text: async () => JSON.stringify({ message: 'Unavailable' }) });
  await expect(getAllShelterPets(7)).rejects.toThrow('Unavailable');
});
