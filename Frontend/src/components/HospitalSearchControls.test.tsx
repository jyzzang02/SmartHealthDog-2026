import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Text, TextInput, TouchableOpacity } from 'react-native';
import Geolocation from 'react-native-geolocation-service';
import HospitalSearchControls from './HospitalSearchControls';
import { searchHospitals } from '../api/hospitals';

jest.mock('../api/hospitals', () => ({ searchHospitals: jest.fn() }));
let tree: renderer.ReactTestRenderer;
const press = (label: string) => {
  const button = tree.root.findAllByType(TouchableOpacity).find((node) =>
    node.findAllByType(Text).some((text) => [text.props.children].flat().join('') === label),
  );
  expect(button).toBeDefined();
  act(() => { button!.props.onPress(); });
};
const input = (id: string, value: string) => act(() => {
  tree.root.findAllByType(TextInput).find((node) => node.props.testID === id)!.props.onChangeText(value);
});
const texts = () => tree.root.findAllByType(Text).map((node) => node.props.children);
const chooseLocation = (label: string, value: string) => {
  press(label); input('hospital-location', value); press('적용');
};

beforeEach(() => {
  jest.clearAllMocks();
  act(() => { tree = renderer.create(<HospitalSearchControls />); });
});
afterEach(() => { act(() => { tree.unmount(); }); });

it('previews the keyword without starting a new API or GPS request', () => {
  input('hospital-query', ' 피부 ');
  press('검색 조건 미리보기');
  expect(texts()).toContain('현재 위치 · 피부 · 반경 10km · 거리순');
  expect(texts()).toContain('입력한 조건은 아직 지도와 검색 결과에 적용되지 않습니다.');
  expect(searchHospitals).not.toHaveBeenCalled();
  expect(Geolocation.getCurrentPosition).not.toHaveBeenCalled();
});

it('joins region and district while keeping the keyword unchanged', () => {
  chooseLocation('지역', ' 경기도 고양시 ');
  chooseLocation('군/구', ' 덕양구 ');
  input('hospital-query', '24시');
  press('검색 조건 미리보기');
  expect(texts()).toContain('경기도 고양시 덕양구 · 24시 · 반경 10km · 거리순');
  expect(searchHospitals).not.toHaveBeenCalled();
});

it('clears the old district when a different region is applied', () => {
  chooseLocation('지역', '경기도 고양시');
  chooseLocation('군/구', '덕양구');
  chooseLocation('지역 지정', '서울특별시');
  press('검색 조건 미리보기');
  expect(texts()).toContain('서울특별시 · 전체 동물병원 · 반경 10km · 거리순');
});

it('disables district selection without a region and does not accept blank locations', () => {
  const district = tree.root.findAllByType(TouchableOpacity).find((node) =>
    node.findAllByType(Text).some((text) => text.props.children === '군/구'),
  );
  expect(district!.props.disabled).toBe(true);
  press('지역'); input('hospital-location', '   ');
  const apply = tree.root.findAllByType(TouchableOpacity).find((node) =>
    node.findAllByType(Text).some((text) => text.props.children === '적용'),
  );
  expect(apply!.props.disabled).toBe(true);
  press('닫기');
  expect(texts()).not.toContain('지역 지정');
});

it('keeps a cancelled location edit out of the applied preview', () => {
  press('지역'); input('hospital-location', '서울특별시'); press('닫기');
  press('검색 조건 미리보기');
  expect(texts()).toContain('현재 위치 · 전체 동물병원 · 반경 10km · 거리순');
});

it('allows a documented radius and resets the location locally', () => {
  chooseLocation('지역', '경기도');
  press('반경 10km'); press('100km'); press('현재 위치');
  press('검색 조건 미리보기');
  expect(texts()).toContain('현재 위치 · 전체 동물병원 · 반경 100km · 거리순');
  expect(searchHospitals).not.toHaveBeenCalled();
});

it('offers only supported radii and clearly marks the current selection', () => {
  const sort = tree.root.findAllByType(TouchableOpacity).find((node) =>
    node.findAllByType(Text).some((text) => text.props.children === '거리순'),
  );
  expect(sort!.props.disabled).toBe(true);
  press('반경 10km');
  const options = tree.root.findAllByType(TouchableOpacity).filter((node) =>
    typeof node.props.accessibilityState?.selected === 'boolean',
  );
  expect(options.map((node) => Number(node.findByType(Text).props.children[0]))).toEqual([5, 10, 20, 50, 100]);
  expect(options.filter((node) => node.props.accessibilityState.selected)).toHaveLength(1);
  expect(options[1].props.accessibilityState.selected).toBe(true);
  press('50km');
  press('반경 50km');
  const selected = tree.root.findAllByType(TouchableOpacity).find((node) => node.props.accessibilityState?.selected);
  expect(selected!.findByType(Text).props.children).toEqual([50, 'km']);
  expect(searchHospitals).not.toHaveBeenCalled();
});
