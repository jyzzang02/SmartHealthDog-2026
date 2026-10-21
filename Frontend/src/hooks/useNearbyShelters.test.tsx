import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { PermissionsAndroid, Platform } from 'react-native';
import Geolocation from 'react-native-geolocation-service';
import { searchAllShelters, ShelterSearchResponse } from '../api/shelters';
import { selectNearbyShelters, useNearbyShelters } from './useNearbyShelters';

jest.mock('@react-navigation/native', () => ({ useFocusEffect: (callback: () => void) => {
  const { useEffect } = jest.requireActual('react'); useEffect(callback, [callback]);
} }));
jest.mock('../api/shelters', () => ({ searchAllShelters: jest.fn() }));

const position = { coords: { latitude: 0, longitude: 0, accuracy: 20, altitude: null, heading: null, speed: null }, timestamp: 1 };
const item = (id: number, lat: number, distance = 1112) => ({ shelter_id: id, name: `Shelter ${id}`, address: 'Address', location: { lat, lng: 0 }, distance_m: distance });
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
let latest!: ReturnType<typeof useNearbyShelters>;
let tree: renderer.ReactTestRenderer | undefined;
const Probe = () => { latest = useNearbyShelters(); return null; };
const mount = async () => { await act(async () => { tree = renderer.create(<Probe />); await flush(); }); };
const permission = (status: 'granted' | 'denied') => ({
  [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION]: status,
  [PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION]: status,
}) as Awaited<ReturnType<typeof PermissionsAndroid.requestMultiple>>;

beforeEach(() => {
  jest.useFakeTimers(); jest.clearAllMocks();
  jest.replaceProperty(Platform, 'OS', 'android');
  jest.spyOn(PermissionsAndroid, 'check').mockResolvedValue(true);
  jest.spyOn(PermissionsAndroid, 'requestMultiple').mockResolvedValue(permission('granted'));
  jest.mocked(Geolocation.getCurrentPosition).mockImplementation(success => success(position));
  jest.mocked(searchAllShelters).mockReset().mockResolvedValue({ items: [], total: 0 });
});
afterEach(async () => {
  if (tree) await act(async () => { tree!.unmount(); });
  tree = undefined; jest.restoreAllMocks(); jest.useRealTimers();
});

it('uses server distances and excludes invalid, duplicate, missing-distance, and out-of-radius results', () => {
  const nearby = selectNearbyShelters([
    item(2, 0.02, 2224), item(1, 0.01, 987), item(3, 1, 111195), item(1, 0.01), item(4, NaN),
    { shelter_id: 5, name: 'Missing coordinates', address: '' },
    { ...item(6, 0.01), distance_m: null }, item(7, 0.01, -1), item(8, 0.01, Infinity), item(9, 0.09, 10000), item(10, 0.09, 10001),
  ]);
  expect(nearby.map(value => value.shelter_id)).toEqual([1, 2, 9]);
  expect(nearby[0].distance_m).toBe(987);
  expect(nearby[1].distance_m).toBe(2224);
});

it('sends GPS without a radius and applies the local 10km limit without a location watcher', async () => {
  jest.mocked(searchAllShelters).mockResolvedValueOnce({ items: [item(1, 0.01), item(2, 1, 111195)], total: 2 });
  await mount();
  expect(searchAllShelters).toHaveBeenCalledWith({
    lat: 0, lng: 0, sort_by: 'distance', limit: 1000, offset: 0,
  }, expect.any(AbortSignal));
  expect(latest.shelters.map(value => value.shelter_id)).toEqual([1]);
  expect(latest.center).toEqual({ lat: 0, lng: 0 });
  expect(latest.loading).toBe(false);
  expect(Geolocation.watchPosition).not.toHaveBeenCalled();
  expect(Geolocation.stopObserving).not.toHaveBeenCalled();
});

it('shows permission denial without presenting an empty search or calling the API', async () => {
  jest.mocked(PermissionsAndroid.check).mockResolvedValue(false);
  jest.mocked(PermissionsAndroid.requestMultiple).mockResolvedValue(permission('denied'));
  await mount();
  expect(latest.error).toContain('위치 권한');
  expect(latest.center).toBeNull();
  expect(searchAllShelters).not.toHaveBeenCalled();
});

it('accepts approximate Android location', async () => {
  jest.mocked(PermissionsAndroid.check).mockImplementation(async key => key === PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION);
  await mount();
  expect(latest.error).toBeNull();
  expect(PermissionsAndroid.requestMultiple).not.toHaveBeenCalled();
  expect(Geolocation.getCurrentPosition).toHaveBeenCalledWith(expect.any(Function), expect.any(Function),
    expect.objectContaining({ enableHighAccuracy: false, timeout: 15000 }));
});

it('ignores late GPS completion after leaving the screen', async () => {
  let success!: Parameters<typeof Geolocation.getCurrentPosition>[0];
  jest.mocked(Geolocation.getCurrentPosition).mockImplementation(callback => { success = callback; });
  await mount();
  await act(async () => { tree!.unmount(); }); tree = undefined;
  await act(async () => { success(position); await flush(); });
  expect(searchAllShelters).not.toHaveBeenCalled();
});

it('cancels the old fetch on retry and ignores its delayed result', async () => {
  let finish!: (response: ShelterSearchResponse) => void;
  jest.mocked(searchAllShelters).mockReturnValueOnce(new Promise(resolve => { finish = resolve; }))
    .mockResolvedValueOnce({ items: [item(2, 0.02)], total: 1 });
  await mount();
  const oldSignal = jest.mocked(searchAllShelters).mock.calls[0][1]!;
  await act(async () => { latest.retry(); await flush(); });
  expect(oldSignal.aborted).toBe(true);
  await act(async () => { finish({ items: [item(1, 0.01)], total: 1 }); await flush(); });
  expect(latest.shelters.map(value => value.shelter_id)).toEqual([2]);
  expect(latest.error).toBeNull();
});

it('handles a fetch timeout and releases its request timer', async () => {
  const scheduled = jest.spyOn(globalThis, 'setTimeout');
  const cleared = jest.spyOn(globalThis, 'clearTimeout');
  jest.mocked(searchAllShelters).mockImplementation((_params, signal) => new Promise((_resolve, reject) => {
    signal!.addEventListener('abort', () => reject(new Error('aborted')));
  }));
  await mount();
  await act(async () => { jest.advanceTimersByTime(20000); await flush(); });
  expect(jest.mocked(searchAllShelters).mock.calls[0][1]!.aborted).toBe(true);
  expect(latest.error).toContain('지연');
  expect(latest.loading).toBe(false);
  const requestTimerIndex = scheduled.mock.calls.findIndex(([, delay]) => delay === 20000);
  expect(requestTimerIndex).toBeGreaterThanOrEqual(0);
  expect(cleared).toHaveBeenCalledWith(scheduled.mock.results[requestTimerIndex].value);
});

it('does not claim nearest results from an incomplete candidate response', async () => {
  jest.mocked(searchAllShelters).mockResolvedValueOnce({ items: [item(1, 0.01)], total: 29 });
  await mount();
  expect(latest.error).toContain('모두 확인하지 못했습니다');
  expect(latest.shelters).toEqual([]);
});
