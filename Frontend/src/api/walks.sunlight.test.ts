import { getPetTodaySunlight } from './walks';
import { storeAuthTokens } from '../storage/tokenStorage';

const originalFetch = globalThis.fetch;
let fetchMock: jest.Mock;
const summary = {
  date: '2026-09-25', target_lux_minutes: 60000, achieved_lux_minutes: 20000,
  qualifying_minutes: 10, qualified_windows: 1, sample_count: 20,
  progress_percent: 33.33, completed: false,
};

beforeEach(async () => {
  await storeAuthTokens({ accessToken: 'test-access', refreshToken: 'test-refresh', expiration: 'later' });
  globalThis.fetch = fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ sunlight: summary }) });
  jest.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => { globalThis.fetch = originalFetch; jest.restoreAllMocks(); });

it('keeps date-free today calls compatible with existing screens', async () => {
  await getPetTodaySunlight(19);
  expect(fetchMock.mock.calls[0][0]).toBe('http://api.puppydoc.ovh:8080/api/pets/19/sunlight/today');
  expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer test-access');
});

it('sends the requested historical date and returns its summary', async () => {
  await expect(getPetTodaySunlight(19, '2026-09-25')).resolves.toEqual(summary);
  expect(new URL(fetchMock.mock.calls[0][0]).searchParams.get('date')).toBe('2026-09-25');
});

it('rejects malformed or impossible dates before contacting the server', async () => {
  for (const date of ['2026.09.25', '2026-02-30', '2026-13-01', '', '2026-2-01']) {
    await expect(getPetTodaySunlight(19, date)).rejects.toThrow();
  }
  expect(fetchMock).not.toHaveBeenCalled();
});

it('does not treat a different response date as the requested historical result', async () => {
  await expect(getPetTodaySunlight(19, '2026-09-26')).rejects.toThrow();
});
