import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import WalkPetHistoryScreen from './WalkPetHistoryScreen';
import { storeAuthTokens } from '../storage/tokenStorage';

const mockRoute = { params: { petId: 19, petName: 'Test', petImage: null } };
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }),
  useRoute: () => mockRoute,
  useFocusEffect: (callback: () => void) => {
    const { useEffect } = jest.requireActual('react');
    useEffect(callback, [callback]);
  },
}));

const originalFetch = globalThis.fetch;
let fetchMock: jest.Mock;
let tree: renderer.ReactTestRenderer | undefined;
let total: number;
const walk = (index: number) => ({
  walk_id: index + 1, start_time: '2026-09-25T05:00:00Z',
  end_time: '2026-09-25T05:10:00Z', duration: 600, distance: 1,
});
const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
const mount = async () => { await act(async () => { tree = renderer.create(<WalkPetHistoryScreen />); await flush(); }); };
const texts = () => tree!.root.findAllByType(Text).map(node => [node.props.children].flat().join(''));

beforeEach(async () => {
  total = 2;
  await storeAuthTokens({ accessToken: 'test-access', refreshToken: 'test-refresh', expiration: 'later' });
  fetchMock = jest.fn(async (url: string) => {
    const query = new URL(url).searchParams;
    const limit = Number(query.get('limit'));
    const offset = Number(query.get('offset'));
    // Match the current server contract: limit > 50 is rejected.
    if (limit > 50) return { ok: false, status: 400, json: async () => ({ message: 'INVALID_INPUT' }), text: async () => 'INVALID_INPUT' };
    const items = Array.from({ length: Math.max(0, Math.min(limit, total - offset)) }, (_, i) => walk(offset + i));
    return { ok: true, status: 200, json: async () => ({ pet_id: 19, total, items, page: { limit, offset } }) };
  });
  globalThis.fetch = fetchMock;
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'info').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  if (tree) act(() => tree!.unmount());
  tree = undefined;
  globalThis.fetch = originalFetch;
  jest.restoreAllMocks();
});

it('loads past walks using a request accepted by the current server', async () => {
  await mount();
  const query = new URL(fetchMock.mock.calls[0][0]).searchParams;
  expect(query.get('limit')).toBe('50');
  expect(query.get('timezone')).toBe('Asia/Seoul');
  expect(query.get('sort_by')).toBe('date_desc');
  expect(texts()).toContain('2회 · 2.0km');
  expect(texts()).toContain('산책일시 2026.09.25');
  expect(texts()).not.toContain('아직 산책 기록이 없습니다.');
});

it('keeps the existing 100-record range by requesting two valid pages', async () => {
  total = 120;
  await mount();
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(fetchMock.mock.calls.map(([url]) => new URL(url).searchParams.get('offset'))).toEqual(['0', '50']);
  expect(fetchMock.mock.calls.every(([url]) => new URL(url).searchParams.get('limit') === '50')).toBe(true);
  expect(texts()).toContain('100회 · 100.0km');
});

it('does not request an extra page when the first page contains all records', async () => {
  total = 50;
  await mount();
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(texts()).toContain('50회 · 50.0km');
});

it('logs HTTP 500 details without credentials and preserves the original UI error', async () => {
  const body = JSON.stringify({
    message: 'Server query failed', code: ['INTERNAL_SERVER_ERROR'],
    access_token: 'never-log-this', detail: 'Bearer never-log-that',
  });
  const clone = jest.fn(() => ({ text: async () => body }));
  fetchMock.mockResolvedValueOnce({
    ok: false, status: 500, clone,
    headers: { get: (name: string) => name === 'content-type' ? 'application/json' : 'request-123' },
    json: async () => JSON.parse(body), text: async () => body,
  });
  await mount();
  const messages = jest.mocked(console.info).mock.calls.map(call => String(call[0]));
  const requestLog = messages.find(message => message.startsWith('[walk-debug] walk-list:request '))!;
  const errorLog = messages.find(message => message.startsWith('[walk-debug] walk-list:http-error '))!;
  const request = JSON.parse(requestLog.slice(requestLog.indexOf('{')));
  const error = JSON.parse(errorLog.slice(errorLog.indexOf('{')));
  expect(request).toEqual(expect.objectContaining({ limit: 50, offset: 0, startDate: null, endDate: null }));
  expect(error).toEqual(expect.objectContaining({ requestId: request.requestId, status: 500, serverRequestId: 'request-123' }));
  expect(error.responseBody).toContain('INTERNAL_SERVER_ERROR');
  expect(error.responseBody).not.toContain('never-log-this');
  expect(error.responseBody).not.toContain('never-log-that');
  expect(messages.join(' ')).not.toContain('test-access');
  expect(clone).toHaveBeenCalledTimes(1);
  expect(texts()).toContain('Server query failed');
});

it('does not replace the API error when diagnostic body reading fails', async () => {
  fetchMock.mockResolvedValueOnce({
    ok: false, status: 500,
    clone: () => { throw new Error('Clone unavailable'); },
    json: async () => ({ message: 'Original server error' }), text: async () => '',
  });
  await mount();
  expect(texts()).toContain('Original server error');
  expect(texts()).not.toContain('Clone unavailable');
});
