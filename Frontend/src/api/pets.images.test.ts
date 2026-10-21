import { getMyPets, updatePetPartial, requestUrineDiagnosis } from './pets';
import { storeAuthTokens } from '../storage/tokenStorage';

const originalFetch = globalThis.fetch;
const formDataGlobal = globalThis as typeof globalThis & { FormData: typeof FormData };
const originalFormData = formDataGlobal.FormData;
let fetchMock: jest.Mock;
const existing = { id: 2, name: '하나', species: 'CAT', profilePicture: 'https://images.example.test/pets/cat.jpg' };
const response = (data: unknown) => ({ ok: true, status: 200, json: async () => data });
beforeEach(async () => {
  formDataGlobal.FormData = jest.requireActual<{ default: typeof FormData }>('react-native/Libraries/Network/FormData').default;
  await storeAuthTokens({ accessToken: 'test-access', refreshToken: 'test-refresh', expiration: 'later' });
  globalThis.fetch = fetchMock = jest.fn();
});
afterEach(() => { globalThis.fetch = originalFetch; formDataGlobal.FormData = originalFormData; });

it('uses PATCH without an empty picture part when editing fields only, and preserves the returned picture', async () => {
  fetchMock.mockResolvedValueOnce(response(existing));
  const result = await updatePetPartial({ id: 2, request: { name: '하나', breed: '페르시안 친칠라' }, profilePicture: null });
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe('http://api.puppydoc.ovh:8080/api/pets/2');
  expect(init.method).toBe('PATCH');
  expect(init.body.getAll('profilePicture')).toEqual([]);
  expect(JSON.parse(init.body.getAll('request')[0].string)).toEqual({ name: '하나', breed: '페르시안 친칠라' });
  expect(result.profilePicture).toBe(existing.profilePicture);
});

it('includes a selected photo and birthDate in the existing multipart PATCH contract', async () => {
  fetchMock.mockResolvedValueOnce(response(existing));
  await updatePetPartial({ id: 2, request: { birthDate: '2019-09-15' },
    profilePicture: { uri: 'file:///cache/cat.jpg', type: 'image/jpeg', fileName: 'cat.jpg' } });
  const init = fetchMock.mock.calls[0][1];
  expect(init.body.getAll('profilePicture')).toEqual([{ uri: 'file:///cache/cat.jpg', type: 'image/jpeg', name: 'cat.jpg' }]);
  expect(JSON.parse(init.body.getAll('request')[0].string)).toEqual({ birthDate: '2019-09-15' });
});

it('normalizes the PATCH image response just like GET and PUT', async () => {
  fetchMock.mockResolvedValueOnce(response({ ...existing, profilePicture: undefined, photoUrl: existing.profilePicture }));
  expect((await updatePetPartial({ id: 2, request: { name: '하나' } })).profilePicture).toBe(existing.profilePicture);
});

it('retains different image URLs for two pets after another list fetch', async () => {
  const first = { ...existing, id: 1, name: '멍멍이', profilePicture: 'https://images.example.test/pets/dog.jpg' };
  fetchMock.mockResolvedValueOnce(response([first, existing]));
  const result = await getMyPets();
  expect(result.map(pet => [pet.id, pet.profilePicture])).toEqual([[1, first.profilePicture], [2, existing.profilePicture]]);
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it('performs missing-photo enrichment once in the API layer', async () => {
  fetchMock.mockResolvedValueOnce(response([{ ...existing, profilePicture: undefined }]))
    .mockResolvedValueOnce(response(existing));
  expect((await getMyPets())[0].profilePicture).toBe(existing.profilePicture);
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

it('keeps urine upload behavior without logging image paths or error contents', async () => {
  const log = jest.spyOn(console, 'log').mockImplementation(() => {});
  try {
    fetchMock.mockResolvedValueOnce({ ok: true, status: 201, json: async () => ({ submissionId: 'submission-1' }) });
    await expect(requestUrineDiagnosis(2, { uri: 'file:///private/cache/urine.jpg' }))
      .resolves.toEqual({ submissionId: 'submission-1' });
    expect(fetchMock.mock.calls[0][1].method).toBe('POST');
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500, text: async () => JSON.stringify({ message: 'Upload failed' }) });
    await expect(requestUrineDiagnosis(2, { uri: 'file:///private/cache/urine.jpg' })).rejects.toThrow();
    expect(log).not.toHaveBeenCalled();
  } finally { log.mockRestore(); }
});
