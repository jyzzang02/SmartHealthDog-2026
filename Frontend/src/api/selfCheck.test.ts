import { createSelfCheck, listSelfChecks, getSelfCheck, deleteSelfCheck } from './selfCheck';
import { refreshSessionAccessToken } from './refreshSession';
jest.mock('../storage/tokenStorage', () => ({ getAuthSession: () => 'session', assertAuthSession: jest.fn(), getStoredAccessToken: async () => 'old' }));
jest.mock('./refreshSession', () => ({ refreshSessionAccessToken: jest.fn(async () => 'new') }));
const originalFetch = globalThis.fetch;
const response = (data: unknown, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => data, text: async () => JSON.stringify(data) });
afterEach(() => { globalThis.fetch = originalFetch; jest.clearAllMocks(); });
it('submits selected pet and answers, refreshing only after 401', async () => {
  const fetchMock = jest.fn().mockResolvedValueOnce(response({}, 401)).mockResolvedValueOnce(response({ id: 2 }));
  globalThis.fetch = fetchMock;
  const answers = { ear: [1,0,0,0,0,0,0] };
  await expect(createSelfCheck(7, 'dog', answers)).resolves.toEqual({ id: 2 });
  expect(refreshSessionAccessToken).toHaveBeenCalledWith('session', 'old');
  expect(fetchMock.mock.calls[1][0]).toContain('/api/pets/7/health-checks');
  expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ species: 'dog', answers });
  expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe('Bearer new');
});
it('does not automatically repeat a potentially saved POST on network failure', async () => {
  globalThis.fetch = jest.fn().mockRejectedValue(new Error('network'));
  await expect(createSelfCheck(7, 'cat', {})).rejects.toThrow('network');
  expect(globalThis.fetch).toHaveBeenCalledTimes(1);
});
it('uses the pet-scoped list, detail and delete routes', async () => {
  const fetchMock = jest.fn().mockResolvedValue(response({ content: [], last: true })); globalThis.fetch = fetchMock;
  await listSelfChecks(7, 1); await getSelfCheck(7, 2); await deleteSelfCheck(7, 2);
  expect(fetchMock.mock.calls[0][0]).toContain('/7/health-checks?page=1&size=20');
  expect(fetchMock.mock.calls[1][0]).toContain('/7/health-checks/2');
  expect(fetchMock.mock.calls[2][1].method).toBe('DELETE');
});

it('aborts a stalled request after 30 seconds without resubmitting', async () => {
  jest.useFakeTimers();
  try {
    globalThis.fetch = jest.fn((_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new Error('Aborted')));
    }));
    const pending = createSelfCheck(7, 'dog', {}).catch(error => error);
    await jest.advanceTimersByTimeAsync(30000);
    expect(await pending).toBeInstanceOf(Error);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
  } finally { jest.useRealTimers(); }
});

it('cancels a trend detail request when its caller leaves the screen', async () => {
  globalThis.fetch = jest.fn().mockImplementation((_url, init: RequestInit) => new Promise((_resolve, reject) => {
    init.signal?.addEventListener('abort', () => reject(new Error('Aborted')));
  }));
  const controller = new AbortController();
  const result = getSelfCheck(7, 2, controller.signal);
  await Promise.resolve();
  controller.abort();
  await expect(result).rejects.toThrow('Aborted');
  expect(globalThis.fetch).toHaveBeenCalledTimes(1);
});
