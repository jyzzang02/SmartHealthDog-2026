import { getCertificateOcrResult, requestCertificateOcr } from './diagnosis';
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
