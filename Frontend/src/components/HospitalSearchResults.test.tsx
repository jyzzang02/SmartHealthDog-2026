import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Alert, Image, Linking, StyleSheet, Text, TouchableOpacity } from 'react-native';
import type { HospitalItem } from '../api/hospitals';
import HospitalSearchResults from './HospitalSearchResults';
import HospitalCard from './HospitalCard';

const item = (index: number): HospitalItem => ({
  hospital_id: String(index), name: `Hospital ${index}`, address: null,
  location: { lat: 37.5, lng: 126.9 }, distance_m: index * 100,
  phone_number: null, rating: null, review_count: null,
  website_url: null, place_url: null, open_now: null,
});
let tree: renderer.ReactTestRenderer;
const changePage = jest.fn();
const texts = () => tree.root.findAllByType(Text).map((node) => node.props.children);
const button = (label: string) => tree.root.findAllByType(TouchableOpacity).find((node) =>
  node.findAllByType(Text).some((text) => text.props.children === label),
)!;
const render = (hospitals: HospitalItem[], total = hospitals.length, offset = 0, searchLocation?: string) => act(() => {
  tree = renderer.create(<HospitalSearchResults hospitals={hospitals} total={total}
    page={{ limit: 5, offset }} onPageChange={changePage} searchLocation={searchLocation} />);
});
const openDetails = () => act(() => { tree.root.findAllByType(HospitalCard)[0].props.onPress(); });

beforeEach(() => { jest.clearAllMocks(); });
afterEach(() => { act(() => { tree.unmount(); }); jest.restoreAllMocks(); });

it('shows real supplied items without fabricated ratings or contact information', () => {
  render([item(1)]);
  expect(texts()).toContain('Hospital 1');
  expect(texts()).not.toContain('기관 사진');
  const images = tree.root.findByType(HospitalCard).findAllByType(Image);
  expect(images).toHaveLength(1);
  expect(images[0].props.testID).toBe('hospital-naver-icon');
  expect(images[0].props.resizeMode).toBe('contain');
  expect(texts()).toContain('주소 정보 없음');
  expect(texts()).not.toContain('3.4');
  openDetails();
  expect(texts()).not.toContain('전화번호 정보 없음');
  expect(button('전화 걸기')).toBeUndefined();
  expect(button('홈페이지').props.disabled).toBe(true);
  expect(StyleSheet.flatten(button('홈페이지').props.style).backgroundColor).toBe('#E1E1E1');
});

it('hides supplied phone numbers in both list and details while keeping website launch', async () => {
  const openUrl = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
  render([{ ...item(1), phone_number: '+82 (2) 1234-5678', website_url: 'https://example.com/' }]);
  expect(texts()).not.toContain('+82 (2) 1234-5678');
  openDetails();
  expect(texts()).not.toContain('+82 (2) 1234-5678');
  expect(texts()).not.toContain('전화번호 정보 없음');
  expect(button('전화 걸기')).toBeUndefined();
  expect(button('홈페이지').props.disabled).toBe(false);
  expect(StyleSheet.flatten(button('홈페이지').props.style).backgroundColor).toBe('#FFC94D');
  await act(async () => { button('홈페이지').props.onPress(); });
  expect(openUrl.mock.calls).toEqual([['https://example.com/']]);
});

it.each([['javascript', 'alert(1)'].join(':'), 'intent://example', 'file:///tmp/a', 'https://user:password@example.com', 'https://example.com/ bad'])
('does not launch an unsafe website value: %s', (website_url) => {
  const openUrl = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
  render([{ ...item(1), website_url, phone_number: '*123#' }]);
  openDetails();
  expect(button('전화 걸기')).toBeUndefined();
  expect(button('홈페이지').props.disabled).toBe(true);
  expect(openUrl).not.toHaveBeenCalled();
});

it('reports a rejected device action without an unhandled rejection', async () => {
  jest.spyOn(Linking, 'openURL').mockRejectedValue(new Error('No handler'));
  const alert = jest.spyOn(Alert, 'alert');
  render([{ ...item(1), website_url: 'http://example.com/' }]);
  openDetails();
  await act(async () => { button('홈페이지').props.onPress(); });
  expect(alert).toHaveBeenCalledWith('연결 실패', '연결할 수 없습니다. 다시 시도해 주세요.');
});

it('prevents duplicate launches while a device action is pending', async () => {
  let finish!: () => void;
  const openUrl = jest.spyOn(Linking, 'openURL').mockImplementation(() => new Promise<void>((resolve) => { finish = resolve; }));
  render([{ ...item(1), website_url: 'https://example.com/' }]);
  openDetails();
  act(() => { button('홈페이지').props.onPress(); button('홈페이지').props.onPress(); });
  expect(openUrl).toHaveBeenCalledTimes(1);
  await act(async () => { finish(); });
});

it('does not invent a missing backend distance', () => {
  render([{ ...item(1), distance_m: null }]);
  openDetails();
  expect(texts().some((value) => Array.isArray(value) && value.includes('현재 위치'))).toBe(false);
});

it('uses server total and offset instead of slicing the supplied page', () => {
  render([item(1)], 11, 5);
  expect(tree.root.findAllByType(HospitalCard)).toHaveLength(1);
  expect(button('이전').props.disabled).toBe(false);
  expect(button('다음').props.disabled).toBe(false);
  act(() => { button('다음').props.onPress(); });
  expect(changePage).toHaveBeenLastCalledWith(2);
  act(() => { button('이전').props.onPress(); });
  expect(changePage).toHaveBeenLastCalledWith(0);
});

it('disables navigation at the server page boundaries', () => {
  render([item(1)], 1);
  expect(button('이전').props.disabled).toBe(true);
  expect(button('다음').props.disabled).toBe(true);
});

it('hides stale details when a new response replaces the selected item', () => {
  render([item(1)]);
  openDetails();
  act(() => { tree.update(<HospitalSearchResults hospitals={[]} total={0}
    page={{ limit: 5, offset: 0 }} onPageChange={changePage} />); });
  expect(texts()).not.toContain('Hospital 1');
  expect(texts()).toContain('표시할 병원이 없습니다.');
});

it('labels region-only distances relative to the search origin', () => {
  render([item(1)], 1, 0, '고양시');
  expect(tree.root.findByType(HospitalCard).props.distanceOrigin).toBe('검색 기준 위치');
  openDetails();
  expect(texts().some((value) => Array.isArray(value) && value.includes('검색 기준 위치'))).toBe(true);
});

it('closes the information modal without changing the list', () => {
  render([item(1)]);
  openDetails();
  act(() => { button('닫기').props.onPress(); });
  expect(texts()).not.toContain('홈페이지 정보가 있는 경우 연결할 수 있습니다.');
  expect(tree.root.findAllByType(HospitalCard)).toHaveLength(1);
});

it('opens NAVER search from the former photo area without opening the details modal', async () => {
  const openUrl = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
  render([{ ...item(1), name: '신원당동물의료센터', address: '경기도 고양시' }]);
  const mapButton = tree.root.findAllByType(TouchableOpacity).find((node) => node.props.accessibilityRole === 'link')!;
  expect(mapButton.findByType(Text).props.children.replace('\n', '')).toBe('네이버 지도에서 보기');
  expect(tree.root.findAllByType(TouchableOpacity).filter((node) => node.props.accessibilityLabel === '신원당동물의료센터 정보 보기')).toHaveLength(1);
  await act(async () => { mapButton.props.onPress(); });
  expect(new URL(openUrl.mock.calls[0][0]).searchParams.get('query')).toBe('신원당동물의료센터');
  expect(texts()).not.toContain('전화번호 정보 없음');
  expect(button('전화 걸기')).toBeUndefined();
});

it('prevents repeated map launches while opening the external app', async () => {
  let finish!: () => void;
  const openUrl = jest.spyOn(Linking, 'openURL').mockImplementation(() => new Promise<void>((resolve) => { finish = resolve; }));
  render([item(1)]);
  act(() => { tree.root.findByType(HospitalCard).props.onMapPress(); tree.root.findByType(HospitalCard).props.onMapPress(); });
  expect(openUrl).toHaveBeenCalledTimes(1);
  await act(async () => { finish(); });
});

it('reports failure if both the NAVER app and web search cannot open', async () => {
  jest.spyOn(Linking, 'openURL').mockRejectedValue(new Error('No handler'));
  const alert = jest.spyOn(Alert, 'alert');
  render([item(1)]);
  await act(async () => { tree.root.findByType(HospitalCard).props.onMapPress(); });
  expect(alert).toHaveBeenCalledWith('연결 실패', '연결할 수 없습니다. 다시 시도해 주세요.');
});
