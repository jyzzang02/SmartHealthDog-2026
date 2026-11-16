import { getHealthReport } from './diagnosis';
import { refreshSessionAccessToken } from './refreshSession';

jest.mock('../storage/tokenStorage', () => ({
  getAuthSession: () => 'session',
  assertAuthSession: jest.fn(),
  getStoredAccessToken: jest.fn(async () => 'test-token'),
}));
jest.mock('./refreshSession', () => ({
  refreshSessionAccessToken: jest.fn(async () => 'new-token'),
}));

const originalFetch = globalThis.fetch;
const mockFetch = jest.fn();
const payload = {
  petId: 12, periodType: 'WEEK', startDate: '2026-11-09', endDate: '2026-11-15',
  timeZone: 'Asia/Seoul', summary: { respirationCompletedCount: 1 },
  sections: { selfChecks: [], certificates: [], walks: [], eyes: [], urines: [], respirations: [
    { status: 'COMPLETED', respiratoryRate: 33 },
  ] },
  assessment: { level: 'NOT_ASSESSED' },
};
const response = (body: unknown, status = 200) => ({ status, ok: status === 200, json: async () => body });
const request = (signal = new AbortController().signal) =>
  getHealthReport(12, 'WEEK', '2026-11-09', '2026-11-15', signal);

beforeEach(() => {
  mockFetch.mockReset();
  jest.mocked(refreshSessionAccessToken).mockClear();
  globalThis.fetch = mockFetch;
});

afterEach(() => { globalThis.fetch = originalFetch; });

it('sends the selected pet and period to the authenticated report API', async () => {
  mockFetch.mockResolvedValueOnce(response(payload));
  const { signal } = new AbortController();
  await expect(request(signal)).resolves.toEqual({
    summary: payload.summary, sections: payload.sections, assessmentLevel: 'NOT_ASSESSED',
  });
  expect(mockFetch).toHaveBeenCalledTimes(1);
  const [[url, options]] = mockFetch.mock.calls;
  expect(url).toMatch(/\/api\/pets\/12\/health-reports\?periodType=WEEK&date=2026-11-09$/);
  expect(options).toMatchObject({ signal, headers: { Authorization: 'Bearer test-token' } });
});

it('refreshes the token once for an unauthorized report request', async () => {
  mockFetch.mockResolvedValueOnce(response({}, 401)).mockResolvedValueOnce(response(payload));
  await expect(request()).resolves.toBeDefined();
  expect(refreshSessionAccessToken).toHaveBeenCalledTimes(1);
  expect(mockFetch.mock.calls[1][1].headers.Authorization).toBe('Bearer new-token');
});

it.each([
  { ...payload, petId: 13 },
  { ...payload, startDate: '2026-11-16' },
  { ...payload, sections: { ...payload.sections, respirations: null } },
])('does not accept mismatched or malformed reports', async body => {
  mockFetch.mockResolvedValueOnce(response(body));
  await expect(request()).rejects.toThrow();
  expect(mockFetch).toHaveBeenCalledTimes(1);
});

it('does not start a report request after cancellation', async () => {
  const controller = new AbortController();
  controller.abort();
  await expect(request(controller.signal)).rejects.toThrow();
  expect(mockFetch).not.toHaveBeenCalled();
});
