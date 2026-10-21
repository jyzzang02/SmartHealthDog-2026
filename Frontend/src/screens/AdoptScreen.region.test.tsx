import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Text, TouchableOpacity, Image, Modal, StyleSheet, Linking, Alert, Platform } from 'react-native';
import ShelterNearbyMap from '../components/ShelterNearbyMap';
import { useNearbyShelters } from '../hooks/useNearbyShelters';
import AdoptScreen from './AdoptScreen';
import { searchAllShelters, getShelterDetail, ShelterSearchResponse } from '../api/shelters';

jest.mock('react-native-webview', () => ({ WebView: 'WebView' }));

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn() }),
  useFocusEffect: (callback: () => void) => {
    const { useEffect } = jest.requireActual('react');
    useEffect(callback, [callback]);
  },
}));
jest.mock('../api/shelters', () => ({
  searchAllShelters: jest.fn(),
  getShelterDetail: jest.fn(), getShelterPets: jest.fn(),
}));

jest.mock('../hooks/useNearbyShelters', () => ({
  ...jest.requireActual('../hooks/useNearbyShelters'), useNearbyShelters: jest.fn(),
}));

let tree: renderer.ReactTestRenderer | undefined;
const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
const mount = async () => { await act(async () => { tree = renderer.create(<AdoptScreen />); await flush(); }); };
const texts = () => tree!.root.findAllByType(Text).map(node => [node.props.children].flat().join(''));
const press = async (label: string) => {
  const button = tree!.root.findAllByType(TouchableOpacity).find(node => {
    const children = node.findAllByType(Text);
    return children.length === 1 && [children[0].props.children].flat().join('') === label;
  });
  expect(button).toBeDefined();
  await act(async () => { button!.props.onPress(); await flush(); });
};
const choose = async (label: string, value: string) => { await press(label); await press(value); };
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
};
const result = (name: string): ShelterSearchResponse => ({
  items: [{ shelter_id: 1, name, address: '경기도 양주시' }], total: 1,
});
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(getShelterDetail).mockReset().mockRejectedValue(new Error('Detail unavailable'));
  jest.mocked(useNearbyShelters).mockReturnValue({
    center: null, shelters: [], loading: false, error: '위치 권한이 필요합니다.', retry: jest.fn(),
  });
  jest.mocked(searchAllShelters).mockReset().mockResolvedValue({ items: [], total: 0 });
});

afterEach(async () => {
  if (tree) await act(async () => { tree!.unmount(); });
  tree = undefined;
  jest.restoreAllMocks();
});

it('requests all documented regions without GPS or radius and clears the district on province change', async () => {
  await mount();
  expect(searchAllShelters).not.toHaveBeenCalled();
  await press('전체 보호소');
  expect(searchAllShelters).toHaveBeenCalledTimes(1);
  const allLabel = tree!.root.findAllByType(Text).find(node => node.props.children === '전체 보호소')!;
  const allButton = tree!.root.findAllByType(TouchableOpacity).find(node => node.findAllByType(Text).includes(allLabel))!;
  expect(StyleSheet.flatten(allButton.props.style)).toMatchObject({ backgroundColor: '#FFC94D', borderColor: '#FFC94D' });
  expect(StyleSheet.flatten(allLabel.props.style).color).toBe('#FFFFFF');
  await choose('지역', '경기도');
  await choose('군/구', '고양시');
  await choose('고양시', '파주시');
  await choose('경기도', '서울특별시');
  await choose('군/구', '마포구');
  const requests = jest.mocked(searchAllShelters).mock.calls.map(([params]) => params);
  expect(requests.map(({ province, district }) => [province, district])).toEqual([
    [undefined, undefined], ['경기도', undefined], ['경기도', '고양시'],
    ['경기도', '파주시'], ['서울특별시', undefined], ['서울특별시', '마포구'],
  ]);
  expect(requests[0]).toEqual(expect.objectContaining({ limit: 1000, offset: 0 }));
  expect(requests.every(params => params.lat === undefined && params.lng === undefined
    && !('radius_km' in params) && params.sort_by === undefined)).toBe(true);
  expect(tree!.root.findByType(ShelterNearbyMap).props.center).toBeNull();
});

it('uses actual GPS for distance sorting across all six handbook selections without a region radius', async () => {
  const center = { lat: 37.6582, lng: 126.8224 };
  jest.mocked(useNearbyShelters).mockReturnValue({
    center, shelters: [], loading: false, error: null, retry: jest.fn(),
  });
  await mount();
  await press('전체 보호소');
  await choose('지역', '경기도');
  await choose('군/구', '고양시');
  await choose('고양시', '파주시');
  await choose('경기도', '서울특별시');
  await choose('군/구', '마포구');
  const requests = jest.mocked(searchAllShelters).mock.calls.map(([params]) => params);
  expect(requests.map(({ province, district }) => [province, district])).toEqual([
    [undefined, undefined], ['경기도', undefined], ['경기도', '고양시'],
    ['경기도', '파주시'], ['서울특별시', undefined], ['서울특별시', '마포구'],
  ]);
  for (const request of requests) {
    expect(request).toMatchObject({ lat: center.lat, lng: center.lng, sort_by: 'distance' });
    expect(request).not.toHaveProperty('radius_km');
  }
  expect(tree!.root.findByType(ShelterNearbyMap).props.center).toEqual(center);
});

it('ignores an older region response and preserves out-of-area shelters returned for the jurisdiction', async () => {
  const oldRequest = deferred<ShelterSearchResponse>();
  const newRequest = deferred<ShelterSearchResponse>();
  jest.mocked(searchAllShelters).mockReturnValueOnce(oldRequest.promise).mockReturnValueOnce(newRequest.promise);
  await mount();
  await choose('지역', '경기도');
  await choose('군/구', '고양시');
  expect(jest.mocked(searchAllShelters).mock.calls[0][1]!.aborted).toBe(true);
  await act(async () => { oldRequest.resolve(result('Old result')); await flush(); });
  expect(texts()).not.toContain('Old result');
  expect(texts()).toContain('보호소 정보를 불러오는 중...');
  await act(async () => { newRequest.resolve(result('Goyang entrusted shelter')); await flush(); });
  expect(texts()).toContain('Goyang entrusted shelter');
  expect(texts()).toContain('경기도 양주시');
  expect(texts()).not.toContain('Old result');
});

it('does not restore an old request error after resetting the filters', async () => {
  const pending = deferred<ShelterSearchResponse>();
  jest.mocked(searchAllShelters).mockReturnValueOnce(pending.promise);
  await mount();
  await choose('지역', '경기도');
  await press('초기화');
  await act(async () => { pending.reject(new Error('Old failure')); await flush(); });
  expect(texts()).not.toContain('Old failure');
  expect(texts()).not.toContain('보호소 정보를 불러오는 중...');
  expect(searchAllShelters).toHaveBeenCalledTimes(1);
});

it('can retry all-shelter search using the same button after a request failure', async () => {
  jest.mocked(searchAllShelters).mockRejectedValueOnce(new Error('Search failed')).mockResolvedValueOnce(result('Recovered'));
  await mount();
  await press('전체 보호소');
  expect(texts()).toContain('Search failed');
  await press('전체 보호소');
  expect(searchAllShelters).toHaveBeenCalledTimes(2);
  expect(texts()).toContain('Recovered');
  expect(texts()).not.toContain('Search failed');
});

it('hides missing ratings and shelter stock photos while preserving a real zero rating', async () => {
  jest.mocked(searchAllShelters).mockResolvedValueOnce({ total: 2, items: [
    { shelter_id: 1, name: 'No rating', address: '서울특별시 마포구', rating: null },
    { shelter_id: 2, name: 'Real zero', address: '경기도 고양시', rating: 0 },
  ] });
  jest.mocked(getShelterDetail).mockResolvedValueOnce({ shelter_id: 1, name: 'No rating', address: '서울특별시 마포구', phone_number: '02-123-4567' });
  await mount();
  await press('전체 보호소');
  expect(texts().filter(value => value === '0.0')).toHaveLength(1);
  const card = tree!.root.findAllByType(TouchableOpacity).find(node =>
    node.findAllByType(Text).some(child => child.props.children === 'No rating'))!;
  expect(card.findAllByType(Image)).toHaveLength(1);
  await act(async () => { await card.props.onPress(); await flush(); });
  const detail = tree!.root.findAllByType(Modal).find(node => node.props.visible && node.props.animationType === 'none')!;
  expect(detail.findAllByType(Image)).toHaveLength(4);
  const phoneLabel = detail.findAllByType(Text).find(node => node.props.children === '전화하기')!;
  const phoneButton = detail.findAllByType(TouchableOpacity).find(node => node.findAllByType(Text).includes(phoneLabel))!;
  expect(StyleSheet.flatten(phoneButton.props.style).backgroundColor).toBe('#FFC94D');
  expect(StyleSheet.flatten(phoneLabel.props.style).color).toBe('#FFFFFF');
  expect(detail.findAllByType(Text).some(node => node.props.children === '0.0')).toBe(false);
});

it.each([[850, '850m'], [1000, '1.0km'], [10339, '10.3km']])('formats the server distance %s as %s in shelter details', async (distance, expected) => {
  jest.mocked(getShelterDetail).mockResolvedValueOnce({ shelter_id: 7, name: 'Map shelter', address: 'Address' });
  await mount();
  await act(async () => { await tree!.root.findByType(ShelterNearbyMap).props.onSelect({
    shelter_id: 7, name: 'Map shelter', address: 'Address', location: { lat: 37, lng: 127 }, distance_m: distance as number,
  }); await flush(); });
  expect(getShelterDetail).toHaveBeenLastCalledWith(7, expect.any(AbortSignal));
  expect(texts()).toContain('Map shelter');
  expect(texts()).toContain(`직선거리 ${expected}`);
});

it('has no NAVER link in the list but retains it in shelter details', async () => {
  jest.mocked(searchAllShelters).mockResolvedValueOnce(result('한국동물구조관리협회'));
  jest.mocked(getShelterDetail).mockResolvedValueOnce({ shelter_id: 1, name: '한국동물구조관리협회', address: '경기도 양주시' });
  await mount(); await press('전체 보호소');
  expect(tree!.root.findAllByType(TouchableOpacity).filter(node => node.props.accessibilityRole === 'link')).toHaveLength(0);
  const info = tree!.root.findAllByType(TouchableOpacity).find(node => node.props.accessibilityLabel === '한국동물구조관리협회 정보 보기')!;
  await act(async () => { await info.props.onPress(); await flush(); });
  expect(tree!.root.findAllByType(TouchableOpacity).filter(node => node.props.accessibilityRole === 'link')).toHaveLength(1);
});

it('falls back to the web and contains a failed map launch without changing the search results', async () => {
  jest.replaceProperty(Platform, 'OS', 'android');
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  const open = jest.spyOn(Linking, 'openURL').mockRejectedValueOnce(new Error('No app')).mockResolvedValueOnce(true);
  jest.mocked(searchAllShelters).mockResolvedValueOnce(result('한국동물구조관리협회'));
  await mount(); await press('전체 보호소');
  const info = tree!.root.findAllByType(TouchableOpacity).find(node => node.props.accessibilityRole === 'button'
    && String(node.props.accessibilityLabel).endsWith(' 정보 보기'))!;
  await act(async () => { await info.props.onPress(); await flush(); });
  const button = tree!.root.findAllByType(TouchableOpacity).find(node => node.props.accessibilityRole === 'link')!;
  await act(async () => { button.props.onPress(); await flush(); });
  expect(open.mock.calls[1][0]).toBe('https://map.naver.com/p/search/' + encodeURIComponent('한국동물구조관리협회 경기도 양주시'));
  expect(alert).not.toHaveBeenCalled();
  open.mockRejectedValue(new Error('Unavailable'));
  await act(async () => { button.props.onPress(); await flush(); });
  expect(alert).toHaveBeenCalledWith('연결 실패', '연결할 수 없습니다. 다시 시도해 주세요.');
  expect(texts()).toContain('한국동물구조관리협회');
});

it('prevents duplicate NAVER launches while a previous request is pending', async () => {
  jest.replaceProperty(Platform, 'OS', 'android');
  let finish!: (value: boolean) => void;
  const open = jest.spyOn(Linking, 'openURL').mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  jest.mocked(searchAllShelters).mockResolvedValueOnce(result('Shelter'));
  await mount(); await press('전체 보호소');
  const info = tree!.root.findAllByType(TouchableOpacity).find(node => node.props.accessibilityRole === 'button'
    && String(node.props.accessibilityLabel).endsWith(' 정보 보기'))!;
  await act(async () => { await info.props.onPress(); await flush(); });
  const button = tree!.root.findAllByType(TouchableOpacity).find(node => node.props.accessibilityRole === 'link')!;
  await act(async () => { button.props.onPress(); button.props.onPress(); await flush(); });
  expect(open).toHaveBeenCalledTimes(1);
  await act(async () => { finish(true); await flush(); });
});

it('opens the detail map button with the latest detail address even without a distance', async () => {
  jest.replaceProperty(Platform, 'OS', 'android');
  const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
  jest.mocked(searchAllShelters).mockResolvedValueOnce(result('늘푸른동물병원'));
  jest.mocked(getShelterDetail).mockResolvedValueOnce({ shelter_id: 1, name: '늘푸른동물병원',
    address: '인천광역시 부평구 경인로 100 늘푸른동물병원' });
  await mount(); await press('전체 보호소');
  const info = tree!.root.findAllByType(TouchableOpacity).find(node =>
    node.props.accessibilityLabel === '늘푸른동물병원 정보 보기')!;
  await act(async () => { await info.props.onPress(); await flush(); });
  const detail = tree!.root.findAllByType(Modal).find(node => node.props.visible && node.props.animationType === 'none')!;
  const map = detail.findAllByType(TouchableOpacity).find(node => node.props.accessibilityRole === 'link')!;
  await act(async () => { map.props.onPress(); await flush(); });
  expect(new URL(open.mock.calls[0][0]).searchParams.get('query')).toBe('늘푸른동물병원 인천 부평구');
});

it('cancels the previous detail request when the same shelter is opened again', async () => {
  const old = deferred<{ shelter_id: number; name: string; address: string }>();
  jest.mocked(getShelterDetail).mockReturnValueOnce(old.promise)
    .mockResolvedValueOnce({ shelter_id: 7, name: 'New detail', address: '서울특별시 마포구' });
  await mount();
  const shelter = { shelter_id: 7, name: 'Map shelter', address: 'Address', location: { lat: 37, lng: 127 }, distance_m: 5 };
  let first!: Promise<void>;
  await act(async () => { first = tree!.root.findByType(ShelterNearbyMap).props.onSelect(shelter); await flush(); });
  await act(async () => { await tree!.root.findByType(ShelterNearbyMap).props.onSelect(shelter); await flush(); });
  expect(jest.mocked(getShelterDetail).mock.calls[0][1]!.aborted).toBe(true);
  await act(async () => { old.resolve({ shelter_id: 7, name: 'Old detail', address: 'Old address' }); await first; });
  expect(texts()).toContain('New detail');
  expect(texts()).not.toContain('Old detail');
});
