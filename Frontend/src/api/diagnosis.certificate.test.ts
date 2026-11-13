import { getCertificateOcrResult, getPetSubmissions, mapCertificateOcrFields, requestCertificateOcr, updateCertificate } from './diagnosis';
import { storeAuthTokens } from '../storage/tokenStorage';

const id = '550e8400-e29b-41d4-a716-446655440000';
const originalFetch = globalThis.fetch;
let fetchMock: jest.Mock;
const response = (status: number, body: unknown) => ({
  status,
  ok: status >= 200 && status < 300,
  json: async () => body,
});
const image = { uri: 'file:///image.jpg', type: 'image/jpeg', fileSize: 1024 };

beforeEach(async () => {
  await storeAuthTokens({ accessToken: 'test-access', refreshToken: 'test-refresh', expiration: 'later' });
  fetchMock = jest.fn();
  globalThis.fetch = fetchMock;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  jest.restoreAllMocks();
});

it('uploads one multipart image and reads the accepted submission ID', async () => {
  fetchMock.mockResolvedValueOnce(response(202, { submission_id: id, status: 'PENDING' }));
  const { signal } = new AbortController();
  const append = jest.spyOn(FormData.prototype, 'append');

  await expect(requestCertificateOcr(12, image, signal)).resolves.toBe(id);

  const [[url, request]] = fetchMock.mock.calls;
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(url).toMatch(/\/api\/pets\/12\/submissions\/certificate$/);
  expect(request).toMatchObject({ method: 'POST', signal, headers: { Authorization: 'Bearer test-access' } });
  expect(append).toHaveBeenCalledWith('image', { uri: image.uri, type: image.type, name: 'certificate.jpg' });
});

it('does not repeat a POST after an ambiguous failure', async () => {
  fetchMock.mockRejectedValueOnce(new TypeError('Network request failed'));

  await expect(requestCertificateOcr(12, image, new AbortController().signal)).rejects.toThrow();
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it('reads the same submission from the filtered list if the OCR result row does not exist yet', async () => {
  fetchMock
    .mockResolvedValueOnce(response(404, { code: ['HEALTH_CERTIFICATE_NOT_FOUND'] }))
    .mockResolvedValueOnce(response(200, {
      submissions: [{ submissionId: 'another-id', status: 'FAILED' }, { submissionId: id, status: 'PROCESSING' }],
    }));

  await expect(getCertificateOcrResult(12, id, new AbortController().signal)).resolves.toEqual({ status: 'PROCESSING' });
  expect(fetchMock.mock.calls[1][0]).toMatch(/\/api\/submissions\/pets\/12\?type=HEALTH_CERTIFICATE$/);
});

it('maps OCR fields without overwriting inputs with blanks or unparsed dates', async () => {
  fetchMock.mockResolvedValueOnce(response(200, {
    status: 'COMPLETED',
    results: [{
      animal_name: ' Hana ', species_text: 'Cat', breed: 'Persian', gender_text: 'Female',
      coat_color: 'Grey', age_text: '7', features: ' ', disease_name: 'Test',
      onset_date: null, onset_date_text: 'Unknown', diagnosed_date: '2026-11-12',
      prognosis: 'Observe', remarks: null, ocr_confidence: null,
    }],
  }));

  await expect(getCertificateOcrResult(12, id, new AbortController().signal)).resolves.toEqual({
    status: 'COMPLETED',
    fields: {
      animalName: 'Hana', species: 'Cat', breed: 'Persian', sex: 'Female',
      coatColor: 'Grey', age: '7', diseaseName: 'Test', diagnosisDate: '2026-11-12', prognosis: 'Observe',
    },
  });
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it('does not request a result if the screen already cancelled the lookup', async () => {
  const controller = new AbortController();
  controller.abort();

  await expect(getCertificateOcrResult(12, id, controller.signal)).rejects.toThrow();
  expect(fetchMock).not.toHaveBeenCalled();
});

it('follows zero-based request pages and deduplicates submissions', async () => {
  const first = { id: 'first', type: 'EYE' };
  const second = { id: 'second', type: 'URINE' };
  fetchMock
    .mockResolvedValueOnce(response(200, { submissions: [first], pageNumber: 1, hasNext: true }))
    .mockResolvedValueOnce(response(200, { submissions: [first, second], pageNumber: 2, hasNext: false }));
  expect((await getPetSubmissions(12, undefined, true)).map(item => item.id)).toEqual(['first', 'second']);
  expect(fetchMock.mock.calls[1][0]).toContain('/api/submissions/pets/12?page=1');
});

it('does not fall back when the server returns an empty history', async () => {
  fetchMock.mockResolvedValueOnce(response(200, { submissions: [], pageNumber: 1, hasNext: false }));
  await expect(getPetSubmissions(12, undefined, true)).resolves.toEqual([]);
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it('uses the OCR diagnosis date text only as a valid date fallback', () => {
  expect(mapCertificateOcrFields({ diagnosed_date: null, diagnosed_date_text: '2026년 2월 3일' }))
    .toEqual({ diagnosisDate: '2026-02-03' });
  expect(mapCertificateOcrFields({ diagnosed_date_text: '2026.02.30' })).toEqual({});
  expect(mapCertificateOcrFields({ diagnosed_date: '2026-11-12', diagnosed_date_text: '2025/1/1' }))
    .toEqual({ diagnosisDate: '2026-11-12' });
});

it('patches the existing certificate with all DTO fields and never uploads a photo', async () => {
  fetchMock.mockResolvedValueOnce(response(200, {}));
  await updateCertificate(id, {
    animalName: 'Hana', species: 'Cat', breed: 'Persian', sex: 'Female', coatColor: 'Grey',
    age: '7', features: 'Quiet', diseaseName: 'Test', onsetDate: '', diagnosisDate: '2026-11-12',
    prognosis: 'Observe', remarks: '',
  });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const [[url, options]] = fetchMock.mock.calls;
  expect(url).toContain('/api/submissions/' + id + '/certificate');
  expect(options).toMatchObject({ method: 'PATCH', headers: { Authorization: 'Bearer test-access' } });
  expect(JSON.parse(options.body)).toEqual({
    animal_name: 'Hana', species_text: 'Cat', breed: 'Persian', gender_text: 'Female',
    coat_color: 'Grey', age_text: '7', features: 'Quiet', disease_name: 'Test',
    onset_date_text: '', diagnosed_date_text: '2026-11-12', prognosis: 'Observe', remarks: '',
  });
});

it('rejects a failed certificate update without resubmitting', async () => {
  fetchMock.mockResolvedValueOnce({ ok: false, status: 404, text: async () => '' });
  const certificate = {
    animalName: '', species: '', breed: '', sex: '', coatColor: '', age: '', features: '',
    diseaseName: 'Test', onsetDate: '', diagnosisDate: '2026-11-12', prognosis: '', remarks: '',
  };
  await expect(updateCertificate(id, certificate)).rejects.toThrow('404');
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
