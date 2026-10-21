import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Text, TouchableOpacity } from 'react-native';
import { WebView } from 'react-native-webview';
import ShelterNearbyMap from './ShelterNearbyMap';
import type { NearbyShelter } from '../hooks/useNearbyShelters';
jest.mock('react-native-webview', () => ({ WebView: 'WebView' }));
jest.mock('./MapRecenterButton', () => 'MapRecenterButton');
const { runInNewContext } = jest.requireActual('vm');
const center = { lat: 37.65, lng: 126.85 };
const shelters: NearbyShelter[] = [{ shelter_id: 1, name: 'Nearby shelter', address: 'Address',
  location: { lat: 37.66, lng: 126.85 }, distance_m: 1112 }];
let tree: renderer.ReactTestRenderer;
const onSelect = jest.fn();
const onRetry = jest.fn();
const render = (props = {}) => { act(() => { tree = renderer.create(<ShelterNearbyMap
  center={center} shelters={shelters} loading={false} error={null} onRetry={onRetry} onSelect={onSelect} {...props} />); }); };
const html = () => tree.root.findByType(WebView).props.source.html as string;
const documentId = () => JSON.parse(html().match(/var mapDocumentId = (.*);/)![1]);
const message = (value: Record<string, unknown>) => {
  const data = JSON.stringify({ documentId: documentId(), ...value });
  act(() => { tree.root.findByType(WebView).props.onMessage({ nativeEvent: { data } }); });
};
const texts = () => tree.root.findAllByType(Text).map(node => [node.props.children].flat().join(''));
beforeEach(() => { jest.useFakeTimers(); jest.clearAllMocks(); });
afterEach(() => { act(() => tree.unmount()); jest.useRealTimers(); });

it('builds real shelter markers and bounds including the user, and opens the selected shelter', () => {
  render();
  const postMessage = jest.fn();
  const addListener = jest.fn();
  const extend = jest.fn();
  const maps = { load: (callback: () => void) => callback(),
    LatLng: jest.fn((lat, lng) => ({ lat, lng })), Map: jest.fn(() => ({ setBounds: jest.fn() })),
    Marker: jest.fn(), Circle: jest.fn(), LatLngBounds: jest.fn(() => ({ extend })), event: { addListener } };
  const kakao = { maps };
  const scripts = Array.from(html().matchAll(/<script>([\s\S]*?)<\/script>/g), match => match[1]);
  runInNewContext(scripts.join('\n'), { kakao, window: { kakao, ReactNativeWebView: { postMessage } },
    document: { getElementById: () => ({}) } });
  expect(maps.Marker).toHaveBeenCalledTimes(1);
  expect(maps.Marker).toHaveBeenCalledWith(expect.objectContaining({ position: shelters[0].location }));
  expect(maps.Circle).toHaveBeenCalledWith(expect.objectContaining({ center }));
  expect(extend).toHaveBeenCalledWith(center);
  expect(extend).toHaveBeenCalledWith(shelters[0].location);
  addListener.mock.calls[0][2]();
  expect(postMessage).toHaveBeenCalledWith(JSON.stringify({ type: 'shelter-select', index: 0, documentId: documentId() }));
  message({ type: 'map-ready' });
  message({ type: 'shelter-select', index: 0 });
  expect(texts()).toContain('Nearby shelter');
  expect(texts()).toContain('현재 위치에서 1,112m');
  act(() => tree.root.findAllByType(TouchableOpacity).find(node => node.findAllByType(Text).some(text => text.props.children === 'Nearby shelter'))!.props.onPress());
  expect(onSelect).toHaveBeenCalledWith(shelters[0]);
  expect(jest.getTimerCount()).toBe(0);
});

it('ignores stale and out-of-range bridge messages', () => {
  render(); const old = documentId();
  act(() => tree.update(<ShelterNearbyMap center={center} shelters={[{ ...shelters[0] }]}
    loading={false} error={null} onRetry={onRetry} onSelect={onSelect} />));
  for (const value of [{ type: 'shelter-select', index: -1 }, { type: 'shelter-select', index: 5 },
    { type: 'shelter-select', index: 0, documentId: old }, { type: 'map-error', documentId: old }]) message(value);
  expect(texts()).not.toContain('Nearby shelter');
  expect(tree.root.findAllByType(WebView)).toHaveLength(1);
});

it('offers a map-only retry on readiness timeout and cleans up the timer', () => {
  render(); const old = html();
  act(() => jest.advanceTimersByTime(20000));
  expect(texts()).toContain('지도를 불러오지 못했습니다.');
  act(() => tree.root.findByType(TouchableOpacity).props.onPress());
  expect(html()).not.toBe(old);
  expect(onRetry).not.toHaveBeenCalled();
  message({ type: 'map-ready' });
  act(() => jest.advanceTimersByTime(30000));
  expect(tree.root.findAllByType(WebView)).toHaveLength(1);
  expect(jest.getTimerCount()).toBe(0);
});

it('handles permission failure separately from an empty nearby result', () => {
  render({ center: null, shelters: [], error: '위치 권한이 필요합니다.' });
  expect(tree.root.findAllByType(WebView)).toHaveLength(0);
  expect(texts()).toContain('위치 권한이 필요합니다.');
  expect(texts()).not.toContain('반경 10km 안에 표시할 보호소가 없습니다.');
  act(() => tree.root.findByType(TouchableOpacity).props.onPress());
  expect(onRetry).toHaveBeenCalledTimes(1);
});

it('shows a true empty result without inventing a shelter marker', () => {
  render({ shelters: [] });
  message({ type: 'map-ready' });
  expect(texts()).toContain('반경 10km 안에 표시할 보호소가 없습니다.');
});

it('releases the watchdog after WebView termination and unmount', () => {
  render();
  act(() => tree.root.findByType(WebView).props.onRenderProcessGone());
  expect(texts()).toContain('지도를 불러오지 못했습니다.');
  expect(jest.getTimerCount()).toBe(0);
});
