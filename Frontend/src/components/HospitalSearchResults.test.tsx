import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Linking, Text, TouchableOpacity } from 'react-native';
import type { HospitalItem } from '../api/hospitals';
import { searchHospitals } from '../api/hospitals';
import HospitalSearchResults from './HospitalSearchResults';
import HospitalCard from './HospitalCard';

jest.mock('../api/hospitals', () => ({ searchHospitals: jest.fn() }));
const item = (index: number): HospitalItem => ({
  hospital_id: String(index), name: `Hospital ${index}`, address: null,
  location: { lat: 37.5, lng: 126.9 }, distance_m: index * 100,
  phone_number: null, rating: null, review_count: null,
  website_url: null, place_url: null, open_now: null,
});
let tree: renderer.ReactTestRenderer;
const texts = () => tree.root.findAllByType(Text).map((node) => node.props.children);
const button = (label: string) => tree.root.findAllByType(TouchableOpacity).find((node) =>
  node.findAllByType(Text).some((text) => text.props.children === label),
)!;
const render = (hospitals: HospitalItem[]) => act(() => {
  tree = renderer.create(<HospitalSearchResults hospitals={hospitals} />);
});

beforeEach(() => { jest.clearAllMocks(); });
afterEach(() => { act(() => { tree.unmount(); }); jest.restoreAllMocks(); });

it('shows real supplied items without fabricating photos, ratings or contact fields', () => {
  render([item(1)]);
  expect(texts()).toContain('Hospital 1');
  expect(texts()).toContain('기관 사진');
  expect(texts()).toContain('주소 정보 없음');
  expect(texts()).not.toContain('3.4');
  act(() => { tree.root.findByType(HospitalCard).props.onPress(); });
  expect(texts()).toContain('전화번호 정보 없음');
  expect(searchHospitals).not.toHaveBeenCalled();
});

it('displays supplied contact information but does not launch preview-only actions', () => {
  const openUrl = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
  render([{ ...item(1), phone_number: '02-1234-5678', website_url: 'https://example.com' }]);
  act(() => { tree.root.findByType(HospitalCard).props.onPress(); });
  expect(texts()).toContain('https://example.com');
  expect(button('전화 걸기').props.disabled).toBe(true);
  expect(button('홈페이지').props.disabled).toBe(true);
  expect(openUrl).not.toHaveBeenCalled();
});

it('does not invent a distance when the backend returns null', () => {
  render([{ ...item(1), distance_m: null }]);
  act(() => { tree.root.findByType(HospitalCard).props.onPress(); });
  expect(texts().some((value) => Array.isArray(value) && value.includes('현재 위치에서 '))).toBe(false);
});

it('paginates only the existing list without requesting another server page', () => {
  render(Array.from({ length: 7 }, (_, index) => item(index + 1)));
  expect(tree.root.findAllByType(HospitalCard)).toHaveLength(5);
  expect(button('이전').props.disabled).toBe(true);
  act(() => { button('다음').props.onPress(); });
  expect(tree.root.findAllByType(HospitalCard)).toHaveLength(2);
  expect(button('다음').props.disabled).toBe(true);
  act(() => { button('이전').props.onPress(); });
  expect(tree.root.findAllByType(HospitalCard)).toHaveLength(5);
  expect(searchHospitals).not.toHaveBeenCalled();
});

it('hides stale selected details after results change and clamps the local page', () => {
  const hospitals = Array.from({ length: 7 }, (_, index) => item(index + 1));
  render(hospitals);
  act(() => { button('다음').props.onPress(); });
  act(() => { tree.root.findAllByType(HospitalCard)[0].props.onPress(); });
  act(() => { tree.update(<HospitalSearchResults hospitals={[]} />); });
  expect(texts()).not.toContain('Hospital 6');
  expect(texts()).toContain('표시할 병원이 없습니다.');
  expect(button('이전').props.disabled).toBe(true);
  expect(button('다음').props.disabled).toBe(true);
});

it('closes the information modal without changing the list', () => {
  render([item(1)]);
  act(() => { tree.root.findByType(HospitalCard).props.onPress(); });
  act(() => { button('닫기').props.onPress(); });
  expect(texts()).not.toContain('전화·홈페이지 연결은 추후 적용됩니다.');
  expect(tree.root.findAllByType(HospitalCard)).toHaveLength(1);
});
