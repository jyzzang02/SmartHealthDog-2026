import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { PermissionsAndroid, Platform } from 'react-native';
import Geolocation from 'react-native-geolocation-service';
import { getHospitalSearchLocation, useHospitalSearch } from './useHospitalSearch';
import { searchHospitals } from '../api/hospitals';

jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (callback: () => void) => {
    const { useEffect } = jest.requireActual('react');
    useEffect(callback, [callback]);
  },
}));
jest.mock('../api/hospitals', () => ({
  ...jest.requireActual('../api/hospitals'),
  searchHospitals: jest.fn(), logHospitalSearch: jest.fn(),
}));

const coarse = PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION;
const permissionResult = (status: 'granted' | 'denied') => Object.fromEntries(
  Object.values(PermissionsAndroid.PERMISSIONS).map((permission) => [permission, status]),
) as Awaited<ReturnType<typeof PermissionsAndroid.requestMultiple>>;
const position = {
  coords: { latitude: 37.6584, longitude: 126.832, accuracy: 20, altitude: null, heading: null, speed: null },
  timestamp: 1,
};
const flush = async () => { for (let index = 0; index < 8; index += 1) await Promise.resolve(); };

beforeEach(() => {
  jest.clearAllMocks();
  jest.replaceProperty(Platform, 'OS', 'android');
  jest.spyOn(PermissionsAndroid, 'check').mockResolvedValue(true);
  jest.spyOn(PermissionsAndroid, 'requestMultiple').mockResolvedValue(permissionResult('granted'));
});
afterEach(() => { jest.restoreAllMocks(); });

it('gets a single bounded GPS fix without interfering with walk tracking', async () => {
  jest.mocked(Geolocation.getCurrentPosition).mockImplementation((success) => success(position));
  const result = await getHospitalSearchLocation(new AbortController().signal);
  expect(result).toEqual({ lat: position.coords.latitude, lng: position.coords.longitude });
  expect(Geolocation.getCurrentPosition).toHaveBeenCalledWith(expect.any(Function), expect.any(Function),
    expect.objectContaining({ timeout: 15000, maximumAge: 60000, enableHighAccuracy: true }));
  expect(Geolocation.watchPosition).not.toHaveBeenCalled();
  expect(Geolocation.stopObserving).not.toHaveBeenCalled();
});

it('accepts approximate location without requiring precise permission', async () => {
  jest.mocked(PermissionsAndroid.check).mockImplementation(async (permission) => permission === coarse);
  jest.mocked(Geolocation.getCurrentPosition).mockImplementation((success) => success(position));
  await getHospitalSearchLocation(new AbortController().signal);
  expect(PermissionsAndroid.requestMultiple).not.toHaveBeenCalled();
  expect(Geolocation.getCurrentPosition).toHaveBeenCalledWith(expect.any(Function), expect.any(Function),
    expect.objectContaining({ enableHighAccuracy: false }));
});

it('handles denied permission before requesting GPS', async () => {
  jest.mocked(PermissionsAndroid.check).mockResolvedValue(false);
  jest.mocked(PermissionsAndroid.requestMultiple).mockResolvedValue(permissionResult('denied'));
  await expect(getHospitalSearchLocation(new AbortController().signal)).rejects.toThrow('위치 권한');
  expect(Geolocation.getCurrentPosition).not.toHaveBeenCalled();
});

it('does not start GPS when cancelled during permission initialization', async () => {
  const controller = new AbortController();
  jest.mocked(PermissionsAndroid.check).mockImplementation(async () => { controller.abort(); return true; });
  await expect(getHospitalSearchLocation(controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
  expect(Geolocation.getCurrentPosition).not.toHaveBeenCalled();
});

it('rejects GPS timeouts with a retryable message', async () => {
  jest.mocked(Geolocation.getCurrentPosition).mockImplementation((_success, failure) => failure?.({
    code: 3, message: 'timeout',
  }));
  await expect(getHospitalSearchLocation(new AbortController().signal)).rejects.toThrow('지연');
});

it('removes the cancellation listener if native GPS throws immediately', async () => {
  const controller = new AbortController();
  const remove = jest.spyOn(controller.signal, 'removeEventListener');
  jest.mocked(Geolocation.getCurrentPosition).mockImplementation(() => { throw new Error('Native GPS unavailable'); });
  await expect(getHospitalSearchLocation(controller.signal)).rejects.toThrow('GPS 설정');
  expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
});

it('ignores late GPS completion after leaving the screen', async () => {
  let success: Parameters<typeof Geolocation.getCurrentPosition>[0] | undefined;
  jest.mocked(Geolocation.getCurrentPosition).mockImplementation((callback) => { success = callback; });
  const Probe = () => { useHospitalSearch(); return null; };
  let tree!: renderer.ReactTestRenderer;
  await act(async () => { tree = renderer.create(<Probe />); await flush(); });
  expect(Geolocation.getCurrentPosition).toHaveBeenCalledTimes(1);
  await act(async () => { tree.unmount(); });
  await act(async () => { success?.(position); await flush(); });
  expect(searchHospitals).not.toHaveBeenCalled();
  expect(Geolocation.stopObserving).not.toHaveBeenCalled();
});

it('aborts the API request when the screen is disposed', async () => {
  jest.mocked(Geolocation.getCurrentPosition).mockImplementation((success) => success(position));
  jest.mocked(searchHospitals).mockImplementation(() => new Promise(() => {}));
  const Probe = () => { useHospitalSearch(); return null; };
  let tree!: renderer.ReactTestRenderer;
  await act(async () => { tree = renderer.create(<Probe />); await flush(); });
  expect(searchHospitals).toHaveBeenCalledWith(expect.objectContaining({ radius_km: 10, limit: 20 }), expect.anything());
  const signal = jest.mocked(searchHospitals).mock.calls[0][1];
  expect(signal?.aborted).toBe(false);
  act(() => { tree.unmount(); });
  expect(signal?.aborted).toBe(true);
});
