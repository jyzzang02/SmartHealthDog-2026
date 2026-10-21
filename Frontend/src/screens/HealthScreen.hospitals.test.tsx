import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { PermissionsAndroid, Platform, Text, TextInput, TouchableOpacity } from 'react-native';
import Geolocation from 'react-native-geolocation-service';
import HealthScreen from './HealthScreen';
import HospitalSearchMap from '../components/HospitalSearchMap';
import HospitalSearchResults from '../components/HospitalSearchResults';
import { searchHospitals } from '../api/hospitals';

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn(), addListener: jest.fn(() => jest.fn()) }),
  useFocusEffect: (callback: () => void) => {
    const { useEffect } = jest.requireActual('react');
    useEffect(callback, [callback]);
  },
}));
jest.mock('../components/PetQnaEntryCard', () => 'PetQnaEntryCard');
jest.mock('../components/DiagnosisCard', () => 'DiagnosisCard');
jest.mock('../components/HospitalSearchMap', () => 'HospitalSearchMap');
jest.mock('../api/pets', () => ({ getMyPets: jest.fn(async () => []) }));
jest.mock('../store/healthStore', () => ({ healthStore: { getAll: () => ({}) } }));
jest.mock('../api/hospitals', () => ({
  ...jest.requireActual('../api/hospitals'), searchHospitals: jest.fn(), logHospitalSearch: jest.fn(),
}));

it('connects the health screen controls, map and server page navigation to the same API response', async () => {
  jest.replaceProperty(Platform, 'OS', 'android');
  jest.spyOn(PermissionsAndroid, 'check').mockResolvedValue(true);
  jest.mocked(Geolocation.getCurrentPosition).mockImplementation((success) => success({
    coords: { latitude: 37.6, longitude: 126.8, accuracy: 10, altitude: null, heading: null, speed: null }, timestamp: 1,
  }));
  jest.mocked(searchHospitals).mockImplementation(async (params) => ({
    center: { lat: 37.6, lng: 126.8 }, total: 6, sort_by: 'distance', radius_km: params.radius_km ?? 10,
    page: { limit: 5, offset: params.offset ?? 0 }, items: [{
      hospital_id: '1', name: 'Example hospital', address: null, location: { lat: 37.6, lng: 126.8 },
      distance_m: null, phone_number: null, website_url: null, place_url: null,
      rating: null, review_count: null, open_now: null,
    }],
  }));
  let tree!: renderer.ReactTestRenderer;
  const flush = async () => { for (let i = 0; i < 12; i += 1) await Promise.resolve(); };
  const press = (label: string) => act(() => {
    tree.root.findAllByType(TouchableOpacity).find((node) =>
      node.findAllByType(Text).some((text) => [text.props.children].flat().join('') === label))!.props.onPress();
  });
  const input = (id: string, text: string) => act(() => {
    tree.root.findAllByType(TextInput).find((node) => node.props.testID === id)!.props.onChangeText(text);
  });
  try {
    await act(async () => { tree = renderer.create(<HealthScreen />); await flush(); });
    press('지역'); input('hospital-location', '고양시'); press('적용');
    input('hospital-query', '피부'); press('반경 10km'); press('20km');
    await act(async () => { press('병원 검색'); await flush(); });
    expect(searchHospitals).toHaveBeenLastCalledWith({
      location: '고양시', query: '피부', radius_km: 20, sort_by: 'distance', limit: 5, offset: 0,
    }, expect.anything());
    const map = tree.root.findByType(HospitalSearchMap);
    const results = tree.root.findByType(HospitalSearchResults);
    expect(map.props.hospitals).toBe(results.props.hospitals);
    expect(map.props.searchLocation).toBe('고양시');
    expect(map.props.radiusKm).toBe(20);
    await act(async () => { press('다음'); await flush(); });
    expect(searchHospitals).toHaveBeenLastCalledWith(expect.objectContaining({
      location: '고양시', query: '피부', radius_km: 20, offset: 5,
    }), expect.anything());
    expect(Geolocation.getCurrentPosition).toHaveBeenCalledTimes(1);
  } finally {
    if (tree) act(() => { tree.unmount(); });
    jest.restoreAllMocks();
  }
});
