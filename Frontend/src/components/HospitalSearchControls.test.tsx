import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Geolocation from 'react-native-geolocation-service';
import HospitalSearchControls from './HospitalSearchControls';
import DropdownButton from './DropdownButton';
import { searchHospitals } from '../api/hospitals';

jest.mock('../api/hospitals', () => ({ searchHospitals: jest.fn() }));
let tree: renderer.ReactTestRenderer;
const onSearch = jest.fn();
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
  act(() => { tree = renderer.create(<HospitalSearchControls onSearch={onSearch} />); });
});
afterEach(() => { act(() => { tree.unmount(); }); });

it('submits a trimmed keyword through the parent search handler', () => {
  input('hospital-query', ' 피부 ');
  press('병원 검색');
  expect(texts()).toContain('현재 위치 · 피부 · 반경 10km');
  expect(onSearch).toHaveBeenCalledWith({ location: undefined, query: '피부', radius_km: 10 });
  expect(texts()).toContain('입력한 조건으로 지도와 검색 결과를 조회합니다.');
  expect(searchHospitals).not.toHaveBeenCalled();
  expect(Geolocation.getCurrentPosition).not.toHaveBeenCalled();
});

it('joins region and district while keeping the keyword unchanged', () => {
  chooseLocation('지역', ' 경기도 고양시 ');
  chooseLocation('군/구', ' 덕양구 ');
  input('hospital-query', '24시');
  press('병원 검색');
  expect(texts()).toContain('경기도 고양시 덕양구 · 24시 · 반경 10km');
  expect(onSearch).toHaveBeenCalledWith({ location: '경기도 고양시 덕양구', query: '24시', radius_km: 10 });
  expect(searchHospitals).not.toHaveBeenCalled();
});

it('clears the old district when a different region is applied', () => {
  chooseLocation('지역', '경기도 고양시');
  chooseLocation('군/구', '덕양구');
  chooseLocation('지역 지정', '서울특별시');
  press('병원 검색');
  expect(texts()).toContain('서울특별시 · 전체 동물병원 · 반경 10km');
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
  press('병원 검색');
  expect(texts()).toContain('현재 위치 · 전체 동물병원 · 반경 10km');
});

it('allows a documented radius and resets the location locally', () => {
  chooseLocation('지역', '경기도');
  press('반경 10km'); press('100km'); press('현재 위치');
  press('병원 검색');
  expect(texts()).toContain('현재 위치 · 전체 동물병원 · 반경 100km');
  expect(onSearch).toHaveBeenCalledWith({ location: undefined, query: undefined, radius_km: 100 });
  expect(searchHospitals).not.toHaveBeenCalled();
});

it('offers only supported radii and clearly marks the current selection', () => {
  const sort = tree.root.findAllByType(TouchableOpacity).find((node) =>
    node.findAllByType(Text).some((text) => text.props.children === '거리순'),
  );
  expect(sort).toBeUndefined();
  expect(texts()).not.toContain('거리순');
  expect(tree.root.findAllByType(Text).find((node) => node.props.accessibilityLabel === '정렬 기준: 거리순')).toBeUndefined();
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

it('prevents duplicate submission while loading, including keyboard search', () => {
  act(() => { tree.update(<HospitalSearchControls onSearch={onSearch} loading />); });
  const search = tree.root.findAllByType(TouchableOpacity).find((node) =>
    node.findAllByType(Text).some((text) => text.props.children === '병원 검색'));
  expect(search!.props.disabled).toBe(true);
  act(() => { tree.root.findAllByType(TextInput).find((node) => node.props.testID === 'hospital-query')!.props.onSubmitEditing(); });
  expect(onSearch).not.toHaveBeenCalled();
});

it('keeps all filters on one row after region, district and maximum radius selection', () => {
  chooseLocation('지역', '서울');
  chooseLocation('군/구', '강남구');
  press('반경 10km'); press('100km');
  const filters = tree.root.findAllByType(View).find((node) => node.props.testID === 'hospital-filters')!;
  expect(StyleSheet.flatten(filters.props.style).flexWrap).toBe('nowrap');
  const buttons = filters.findAllByType(DropdownButton);
  expect(buttons.map((node) => node.props.label)).toEqual(['지역 지정', '군/구 지정', '반경 100km']);
  buttons.forEach((node) => {
    expect(node.props.numberOfLines).toBe(1);
    expect(StyleSheet.flatten(node.props.style)).toEqual(expect.objectContaining({ minWidth: 0, paddingHorizontal: 4 }));
  });
  press('병원 검색');
  expect(onSearch).toHaveBeenCalledWith({ location: '서울 강남구', query: undefined, radius_km: 100 });
});
