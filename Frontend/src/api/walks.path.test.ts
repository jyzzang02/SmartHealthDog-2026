import { endPetWalk, getMyThisWeekWalks, getPetWalks, getWalkDetail } from './walks';
import { parseWalkPathCoordinates } from '../utils/walkPath';
import { createWalkTimer, pauseWalkTimer, resumeWalkTimer, completeWalkTimer } from '../utils/walkTimer';
import { storeAuthTokens } from '../storage/tokenStorage';

const coordinates: Array<[number, number]> = [[37.5, 126.9], [37.501, 126.901]];
const originalFetch = globalThis.fetch;
let fetchMock: jest.Mock;
beforeEach(async () => {
  await storeAuthTokens({ accessToken: 'test-access', refreshToken: 'test-refresh', expiration: 'later' });
  globalThis.fetch = fetchMock = jest.fn();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'info').mockImplementation(() => {});
});
afterEach(() => { globalThis.fetch = originalFetch; jest.restoreAllMocks(); });
const respond = (data: unknown) => fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => data });

it.each([coordinates, JSON.stringify(coordinates)])('preserves tuple order for an array or JSON text: %j', value => {
  expect(parseWalkPathCoordinates(value)).toEqual(coordinates);
});
it.each([undefined, null, '', '[]', 'null', '{}', 'invalid-json', {}, 5, true])
('safely handles an empty or malformed path: %j', value => {
  expect(parseWalkPathCoordinates(value)).toEqual([]);
});
it('only accepts finite, bounded numeric coordinate pairs and does not mutate the source', () => {
  const valid = [0, 0];
  const source = [valid, [90, 180], [-90, -180], [91, 127], [37, 181], [NaN, 127], [37, Infinity],
    ['37', 127], [37], null, {}];
  expect(parseWalkPathCoordinates(source)).toEqual([[0, 0], [90, 180], [-90, -180]]);
  expect(valid).toEqual([0, 0]);
});
it('normalizes the pet history response before it is passed to navigation', async () => {
  respond({ total: 1, items: [{ walk_id: 81, path_coordinates: JSON.stringify(coordinates) }] });
  const result = await getPetWalks(19, { limit: 50, offset: 0 });
  expect(result.items![0].path_coordinates).toEqual(coordinates);
});
it('normalizes this-week cards including JSON-encoded empty paths', async () => {
  respond([{ walk_id: 81, path_coordinates: '[]' }, { walk_id: 82, pathCoordinates: JSON.stringify(coordinates) }]);
  const result = await getMyThisWeekWalks('Asia/Seoul');
  expect(result[0].path_coordinates).toEqual([]);
  expect(result[1].path_coordinates).toEqual(coordinates);
  expect(result[1].pathCoordinates).toEqual(coordinates);
});
it.each([coordinates, JSON.stringify(coordinates), '[]', null])('normalizes detail path data: %j', async value => {
  respond({ walk: { walk_id: 81, path_coordinates: value } });
  const result = await getWalkDetail(81);
  expect(result.path_coordinates).toEqual(value === null || value === '[]' ? [] : coordinates);
});
it('sends active seconds excluding a pause while preserving the actual end time', async () => {
  const startedAt = Date.parse('2026-10-21T09:45:00Z');
  const paused = pauseWalkTimer(createWalkTimer(startedAt), startedAt + 5 * 60_000);
  const resumed = resumeWalkTimer(paused, startedAt + 10 * 60_000);
  const completed = completeWalkTimer(resumed, startedAt + 15 * 60_000);
  respond({ walk: { walk_id: 81, duration: 600, path_coordinates: JSON.stringify(coordinates) } });
  const payload = { end_time: new Date(completed.endedAtMs).toISOString(),
    active_duration_seconds: completed.elapsedSeconds, distance: 1, path_coordinates: coordinates };
  const result = await endPetWalk(19, 81, payload);
  expect(result.path_coordinates).toEqual(coordinates);
  expect(result.duration).toBe(600);
  expect(payload.active_duration_seconds).toBe(600);
  expect(payload.end_time).toBe('2026-10-21T10:00:00.000Z');
  expect(fetchMock.mock.calls[0][1].method).toBe('PATCH');
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual(payload);
});
