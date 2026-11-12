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
  expect(searchHospitals).toHaveBeenCalledWith(expect.objectContaining({ radius_km: 10, limit: 5 }), expect.anything());
  const signal = jest.mocked(searchHospitals).mock.calls[0][1];
  expect(signal?.aborted).toBe(false);
  act(() => { tree.unmount(); });
  expect(signal?.aborted).toBe(true);
});

const makeResponse = (offset = 0) => ({
  center: { lat: 37.6584, lng: 126.832 }, radius_km: 10, sort_by: 'distance' as const,
  total: 11, items: [], page: { limit: 5, offset },
});
let latest!: ReturnType<typeof useHospitalSearch>;
const SearchProbe = () => { latest = useHospitalSearch(); return null; };
const startSearch = async () => {
  jest.mocked(Geolocation.getCurrentPosition).mockImplementation((success) => success(position));
  jest.mocked(searchHospitals).mockImplementation(async (params) => makeResponse(params.offset));
  let tree!: renderer.ReactTestRenderer;
  await act(async () => { tree = renderer.create(<SearchProbe />); await flush(); });
  return tree;
};

it('searches a selected region without GPS or a permission request and passes the keyword unchanged', async () => {
  const tree = await startSearch();
  jest.clearAllMocks();
  await act(async () => { latest.search({ location: ' 고양시 덕양구 ', query: ' 24시 ', radius_km: 20 }); await flush(); });
  expect(searchHospitals).toHaveBeenCalledWith({
    location: '고양시 덕양구', query: '24시', radius_km: 20, sort_by: 'distance', limit: 5, offset: 0,
  }, expect.anything());
  expect(Geolocation.getCurrentPosition).not.toHaveBeenCalled();
  expect(PermissionsAndroid.check).not.toHaveBeenCalled();
  act(() => { tree.unmount(); });
});

it('sends server page offsets while retaining one GPS origin, and resets the page for a new keyword', async () => {
  const tree = await startSearch();
  await act(async () => { latest.goToPage(1); await flush(); });
  expect(searchHospitals).toHaveBeenLastCalledWith(expect.objectContaining({
    lat: 37.6584, lng: 126.832, offset: 5, limit: 5,
  }), expect.anything());
  await act(async () => { latest.goToPage(2); await flush(); });
  expect(searchHospitals).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 10 }), expect.anything());
  expect(Geolocation.getCurrentPosition).toHaveBeenCalledTimes(1);
  await act(async () => { latest.search({ query: '피부' }); await flush(); });
  expect(searchHospitals).toHaveBeenLastCalledWith(expect.objectContaining({ query: '피부', offset: 0 }), expect.anything());
  expect(Geolocation.getCurrentPosition).toHaveBeenCalledTimes(2);
  act(() => { tree.unmount(); });
});

it('rejects negative, fractional, out-of-range and duplicate page changes', async () => {
  const tree = await startSearch();
  await act(async () => {
    [-1, 0, 0.5, 3, Infinity, Number.MAX_SAFE_INTEGER].forEach(latest.goToPage);
    await flush();
  });
  expect(searchHospitals).toHaveBeenCalledTimes(1);
  act(() => { tree.unmount(); });
});

it('cancels superseded requests immediately and ignores their late success', async () => {
  const tree = await startSearch();
  let finish!: (response: ReturnType<typeof makeResponse>) => void;
  jest.mocked(searchHospitals).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  await act(async () => { latest.search({ location: '서울' }); await flush(); });
  const oldSignal = jest.mocked(searchHospitals).mock.calls[1][1];
  await act(async () => { latest.search({ location: '부산', radius_km: 5 }); await flush(); });
  expect(oldSignal?.aborted).toBe(true);
  const currentResult = latest.result;
  await act(async () => { finish({ ...makeResponse(), total: 99 }); await flush(); });
  expect(latest.result).toBe(currentResult);
  expect(latest.filters.location).toBe('부산');
  act(() => { tree.unmount(); });
});

it('deduplicates rapid identical submissions and page changes', async () => {
  const tree = await startSearch();
  await act(async () => { latest.search({ location: '서울' }); latest.search({ location: '서울' }); await flush(); });
  expect(searchHospitals).toHaveBeenCalledTimes(2);
  await act(async () => { latest.goToPage(1); latest.goToPage(1); await flush(); });
  expect(searchHospitals).toHaveBeenCalledTimes(3);
  act(() => { tree.unmount(); });
});

it('retries a failed page with the same filters, offset and cached GPS origin', async () => {
  const tree = await startSearch();
  jest.mocked(searchHospitals).mockRejectedValueOnce(new Error('HTTP 500'));
  await act(async () => { latest.goToPage(1); await flush(); });
  expect(latest.error).toBe('HTTP 500');
  expect(latest.result).toBeNull();
  await act(async () => { latest.retry(); await flush(); });
  expect(searchHospitals).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 5, limit: 5 }), expect.anything());
  expect(latest.error).toBeNull();
  expect(latest.result?.page.offset).toBe(5);
  expect(Geolocation.getCurrentPosition).toHaveBeenCalledTimes(1);
  act(() => { tree.unmount(); });
});

it('does not silently display a server page that ignores the requested offset', async () => {
  const tree = await startSearch();
  jest.mocked(searchHospitals).mockResolvedValueOnce(makeResponse());
  await act(async () => { latest.goToPage(1); await flush(); });
  expect(latest.error).toContain('응답 형식');
  expect(latest.result).toBeNull();
  act(() => { tree.unmount(); });
});
