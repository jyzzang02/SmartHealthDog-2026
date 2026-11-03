import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Animated, Text } from 'react-native';
import WalkLogDetailScreen from './WalkLogDetailScreen';
import { WebView } from 'react-native-webview';
import { getPetTodaySunlight, getWalkDetail } from '../api/walks';
import type { SunlightTodayResponse, WalkRecordDto } from '../api/walks';
import type { RootStackParamList } from '../../App';

let mockRecord: RootStackParamList['WalkLogDetail']['record'];
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ goBack: jest.fn() }),
  useRoute: () => ({ params: { record: mockRecord } }),
}));
jest.mock('react-native-webview', () => ({ WebView: 'WebView' }));
jest.mock('../api/walks', () => ({ getWalkDetail: jest.fn(), getPetTodaySunlight: jest.fn(), deleteWalk: jest.fn() }));
jest.mock('../storage/walkSessionStorage', () => ({
  loadWalkRouteSegmentStartIndices: jest.fn(async () => []), clearWalkRouteSegmentStartIndices: jest.fn(),
}));

let tree: renderer.ReactTestRenderer | undefined;
const summary = (date: string, achieved = 20000): SunlightTodayResponse => ({
  date, target_lux_minutes: 60000, achieved_lux_minutes: achieved,
  qualifying_minutes: achieved ? 10 : 0, qualified_windows: achieved ? 1 : 0,
  sample_count: achieved ? 20 : 0, progress_percent: achieved ? 33.33 : 0, completed: false,
});
const flush = async () => { for (let i = 0; i < 16; i++) await Promise.resolve(); };
const texts = () => tree!.root.findAllByType(Text).map(node => [node.props.children].flat().join(''));
const mount = async () => { await act(async () => { tree = renderer.create(<WalkLogDetailScreen />); await flush(); }); };

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-10-14T06:00:00Z'));
  jest.spyOn(Animated, 'loop').mockReturnValue({ start: jest.fn(), stop: jest.fn(), reset: jest.fn() });
  mockRecord = { id: 81, petId: 19, petName: 'Test', petImage: null, date: '2026.09.25', distance: '1km', duration: '00:10:00' };
  jest.mocked(getWalkDetail).mockResolvedValue({ walk_id: 81, start_time: '2026-09-25T05:00:00Z' });
  jest.mocked(getPetTodaySunlight).mockImplementation(async (_petId, date) => summary(date ?? '2026-10-14'));
});
afterEach(() => {
  if (tree) act(() => tree!.unmount());
  tree = undefined;
  jest.restoreAllMocks();
  jest.useRealTimers();
});

it('loads the historical day and shows the approved historical labels', async () => {
  await mount();
  expect(getPetTodaySunlight).toHaveBeenLastCalledWith(19, '2026-09-25');
  expect(texts()).toContain('해당 날짜의 누적 일광 노출');
  expect(texts().some(text => text.includes('20,000'))).toBe(true);
  expect(texts().some(text => text.includes('해당 날짜 산책 전체 누적값입니다.'))).toBe(true);
});

it('keeps today queries and wording unchanged', async () => {
  mockRecord = { ...mockRecord, date: '2026.10.14' };
  jest.mocked(getWalkDetail).mockResolvedValue({ start_time: '2026-10-14T05:00:00Z' });
  await mount();
  expect(getPetTodaySunlight).toHaveBeenLastCalledWith(19, undefined);
  expect(texts()).toContain('오늘의 누적 일광 노출');
});

it('uses the Seoul day at the UTC midnight boundary', async () => {
  jest.mocked(getWalkDetail).mockResolvedValue({ start_time: '2026-09-25T15:30:00Z' });
  await mount();
  expect(getPetTodaySunlight).toHaveBeenLastCalledWith(19, '2026-09-26');
});

it('shows a valid zero result for a day with no samples', async () => {
  jest.mocked(getPetTodaySunlight).mockResolvedValue(summary('2026-09-25', 0));
  await mount();
  expect(texts()).toContain('0%');
  expect(texts().some(text => text.includes('측정 0회'))).toBe(true);
  expect(texts()).not.toContain('해당 날짜의 조도 기록을 불러오지 못했습니다.');
});

it('does not display today data returned for a historical request', async () => {
  jest.mocked(getPetTodaySunlight).mockResolvedValue(summary('2026-10-14'));
  await mount();
  expect(texts()).toContain('해당 날짜의 조도 기록을 불러오지 못했습니다.');
  expect(texts().some(text => text.includes('20,000'))).toBe(false);
});

it('ignores stale sunlight responses after switching records', async () => {
  let oldSunlight!: (value: SunlightTodayResponse) => void;
  jest.mocked(getPetTodaySunlight).mockImplementationOnce(() => new Promise(resolve => { oldSunlight = resolve; }));
  await mount();
  mockRecord = { ...mockRecord, id: 82, date: '2026.09.26' };
  jest.mocked(getWalkDetail).mockResolvedValue({ start_time: '2026-09-26T05:00:00Z' });
  await act(async () => { tree!.update(<WalkLogDetailScreen />); await flush(); });
  await act(async () => {
    oldSunlight(summary('2026-09-25', 60000));
    await flush();
  });
  expect(getPetTodaySunlight).toHaveBeenLastCalledWith(19, '2026-09-26');
  expect(texts().some(text => text.includes('20,000'))).toBe(true);
});

it('ignores a stale detail response and waits for the selected walk date', async () => {
  let oldDetail!: (value: WalkRecordDto) => void;
  jest.mocked(getWalkDetail).mockImplementationOnce(() => new Promise(resolve => { oldDetail = resolve; }));
  await mount();
  expect(getPetTodaySunlight).not.toHaveBeenCalled();
  mockRecord = { ...mockRecord, id: 82, date: '2026.09.26' };
  jest.mocked(getWalkDetail).mockResolvedValue({ start_time: '2026-09-26T05:00:00Z' });
  await act(async () => { tree!.update(<WalkLogDetailScreen />); await flush(); });
  await act(async () => { oldDetail({ start_time: '2026-09-25T05:00:00Z' }); await flush(); });
  expect(getPetTodaySunlight).toHaveBeenLastCalledWith(19, '2026-09-26');
  expect(texts().some(text => text.includes('20,000'))).toBe(true);
});

it.each(['[]', '[[37.5,126.9],[37.501,126.901]]'])
('opens the card with a serialized route path before detail has loaded: %s', async path => {
  mockRecord = { ...mockRecord, pathCoordinates: path as unknown as Array<[number, number]> };
  jest.mocked(getWalkDetail).mockImplementation(() => new Promise(() => {}));
  await mount();
  const html = tree!.root.findByType(WebView).props.source.html as string;
  expect(html).toContain(path === '[]' ? 'var pathSegments = [];' :
    'var pathSegments = [[{"lat":37.5,"lng":126.9},{"lat":37.501,"lng":126.901}]];');
});

it('keeps a valid route path when the detail path is malformed', async () => {
  mockRecord = { ...mockRecord, pathCoordinates: [[37.5, 126.9]] };
  jest.mocked(getWalkDetail).mockResolvedValue({ start_time: '2026-09-25T05:00:00Z',
    path_coordinates: 'not-json' as unknown as Array<[number, number]> });
  await mount();
  expect(tree!.root.findByType(WebView).props.source.html).toContain('var pathSegments = [[{"lat":37.5,"lng":126.9}]];');
});

it.each([null, {}, 'null', '{"bad":true}', '[null,[91,127],[37,181],["37",127]]'])
('does not crash on an invalid serialized or non-array route path: %j', async path => {
  mockRecord = { ...mockRecord, pathCoordinates: path as unknown as Array<[number, number]> };
  await mount();
  expect(tree!.root.findByType(WebView).props.source.html).toContain('var pathSegments = [];');
});
