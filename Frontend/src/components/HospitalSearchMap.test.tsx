import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Text, TouchableOpacity } from 'react-native';
import { WebView } from 'react-native-webview';
import HospitalSearchMap from './HospitalSearchMap';
import type { HospitalMapItem } from './HospitalSearchMap';

jest.mock('react-native-webview', () => ({ WebView: 'WebView' }));
jest.mock('./MapRecenterButton', () => 'MapRecenterButton');

const { runInNewContext } = jest.requireActual<{
  runInNewContext: (code: string, context: Record<string, unknown>) => unknown;
}>('vm');

const center = { lat: 37.6584, lng: 126.8320 };
const hospitals: HospitalMapItem[] = [{
  name: 'Example hospital', address: null,
  location: { lat: 37.6544951, lng: 126.8404113 }, distance_m: 858,
}];
let tree: renderer.ReactTestRenderer;

const renderMap = (items = hospitals) => {
  act(() => { tree = renderer.create(<HospitalSearchMap center={center} hospitals={items} />); });
};
const texts = () => tree.root.findAllByType(Text).map((node) => node.props.children);
const documentId = () => {
  const html: string = tree.root.findByType(WebView).props.source.html;
  return JSON.parse(html.match(/var mapDocumentId = (.*);/)![1]) as string;
};
const sendMessage = (data: string) => {
  let message = data;
  try {
    const parsed = JSON.parse(data);
    if (parsed) message = JSON.stringify({ documentId: documentId(), ...parsed });
  } catch { /* Keep malformed input for bridge validation. */ }
  act(() => { tree.root.findByType(WebView).props.onMessage({ nativeEvent: { data: message } }); });
};

beforeEach(() => { jest.useFakeTimers(); });
afterEach(() => { act(() => { tree.unmount(); }); jest.useRealTimers(); });

it('shows only explicitly selected hospital information and handles a missing address', () => {
  renderMap();
  expect(texts()).not.toContain('Example hospital');
  sendMessage(JSON.stringify({ type: 'hospital-select', index: 0 }));
  expect(texts()).toContain('Example hospital');
  expect(texts()).toContain('주소 정보 없음');
});

it('shows a selectable hospital with unknown distance without inventing a zero distance', () => {
  renderMap([{ ...hospitals[0], distance_m: null }]);
  sendMessage('{"type":"hospital-select","index":0}');
  expect(texts()).toContain('Example hospital');
  expect(texts().some((text) => Array.isArray(text) && text.includes('현재 위치에서 '))).toBe(false);
});

it('ignores malformed and out-of-range selection messages', () => {
  renderMap();
  ['{', 'null', '{"type":"hospital-select","index":-1}', '{"type":"hospital-select","index":"0"}']
    .forEach(sendMessage);
  expect(texts()).not.toContain('Example hospital');
});

it('shows server errors and retries through the parent search handler', () => {
  const retry = jest.fn();
  act(() => { tree = renderer.create(<HospitalSearchMap center={center} hospitals={[]} error="HTTP 403" onRetry={retry} />); });
  expect(texts()).toContain('HTTP 403');
  act(() => { tree.root.findByType(TouchableOpacity).props.onPress(); });
  expect(retry).toHaveBeenCalledTimes(1);
});

it('clears visible selection when results change and supports an empty result', () => {
  renderMap();
  sendMessage('{"type":"hospital-select","index":0}');
  act(() => { tree.update(<HospitalSearchMap center={center} hospitals={[]} />); });
  expect(texts()).not.toContain('Example hospital');
  expect(texts()).toContain('표시할 병원이 없습니다.');
});

it('recreates the map after a load failure without contacting the hospital API', () => {
  renderMap();
  const html = tree.root.findByType(WebView).props.source.html;
  expect(html).not.toContain('/api/hospitals');
  sendMessage('{"type":"map-error"}');
  expect(texts()).toContain('지도를 불러오지 못했습니다.');
  act(() => { tree.root.findByType(TouchableOpacity).props.onPress(); });
  expect(tree.root.findByType(WebView).props.source.html).not.toBe(html);
});

it('builds markers from response coordinates and sends the selected index through the bridge', () => {
  renderMap();
  const html: string = tree.root.findByType(WebView).props.source.html;
  const postMessage = jest.fn();
  const addListener = jest.fn();
  const maps = {
    load: (callback: () => void) => callback(),
    LatLng: jest.fn((lat, lng) => ({ lat, lng })),
    Map: jest.fn(() => ({ setBounds: jest.fn() })),
    Marker: jest.fn((_options: { position: typeof center }) => ({})),
    LatLngBounds: jest.fn(() => ({ extend: jest.fn() })),
    event: { addListener },
  };
  const kakao = { maps };
  const window = { kakao, ReactNativeWebView: { postMessage } };
  const document = { getElementById: jest.fn(() => ({})) };
  const scripts = Array.from(html.matchAll(/<script>([\s\S]*?)<\/script>/g), (match) => match[1]);
  // Execute only our generated inline scripts against a map stub, not the remote SDK.
  runInNewContext(scripts.join('\n'), { window, kakao, document });
  expect(maps.Marker).toHaveBeenCalledTimes(1);
  expect(maps.Marker.mock.calls[0][0]).toEqual(expect.objectContaining({
    position: hospitals[0].location,
  }));
  addListener.mock.calls[0][2]();
  expect(postMessage).toHaveBeenCalledWith(JSON.stringify({ type: 'hospital-select', index: 0, documentId: documentId() }));
});

it('shows the applied region and radius rather than a hard-coded GPS search', () => {
  act(() => { tree = renderer.create(<HospitalSearchMap center={center} hospitals={hospitals}
    searchLocation="고양시 덕양구" radiusKm={20} />); });
  expect(texts()).toContain('고양시 덕양구 기준 반경 20km');
  sendMessage('{"type":"hospital-select","index":0}');
  expect(texts().some((text) => Array.isArray(text) && text.includes('검색 기준 위치'))).toBe(true);
});

it('shows retry when the SDK never reports readiness, and cancels the timeout after retry succeeds', () => {
  renderMap();
  act(() => { jest.advanceTimersByTime(20000); });
  expect(texts()).toContain('지도를 불러오지 못했습니다.');
  act(() => { tree.root.findByType(TouchableOpacity).props.onPress(); });
  sendMessage('{"type":"map-ready"}');
  act(() => { jest.advanceTimersByTime(60000); });
  expect(tree.root.findAllByType(WebView)).toHaveLength(1);
  expect(jest.getTimerCount()).toBe(0);
});

it('ignores delayed readiness and failure messages from an old document', () => {
  renderMap();
  const oldId = documentId();
  act(() => { tree.update(<HospitalSearchMap center={center} hospitals={[]} searchLocation="부산" />); });
  sendMessage(JSON.stringify({ type: 'map-error', documentId: oldId }));
  sendMessage(JSON.stringify({ type: 'map-ready', documentId: oldId }));
  expect(tree.root.findAllByType(WebView)).toHaveLength(1);
  act(() => { jest.advanceTimersByTime(20000); });
  expect(texts()).toContain('지도를 불러오지 못했습니다.');
});

it('displays regional markers without including the server fallback center in map bounds', () => {
  const regionalHospital = { ...hospitals[0], location: { lat: 35.1796, lng: 129.0756 } };
  act(() => { tree = renderer.create(<HospitalSearchMap center={{ lat: 37.5665, lng: 126.978 }}
    hospitals={[regionalHospital]} searchLocation="부산" />); });
  const extend = jest.fn();
  const postMessage = jest.fn();
  const maps = {
    load: (callback: () => void) => callback(),
    LatLng: jest.fn((lat, lng) => ({ lat, lng })),
    Map: jest.fn(() => ({ setBounds: jest.fn() })),
    Marker: jest.fn(), LatLngBounds: jest.fn(() => ({ extend })),
    event: { addListener: jest.fn() },
  };
  const kakao = { maps };
  const html: string = tree.root.findByType(WebView).props.source.html;
  const scripts = Array.from(html.matchAll(/<script>([\s\S]*?)<\/script>/g), (match) => match[1]);
  runInNewContext(scripts.join('\n'), { window: { kakao, ReactNativeWebView: { postMessage } },
    kakao, document: { getElementById: () => ({}) } });
  expect(extend).toHaveBeenCalledTimes(1);
  expect(extend).toHaveBeenCalledWith(regionalHospital.location);
  expect(postMessage).toHaveBeenCalledWith(JSON.stringify({ type: 'map-ready', documentId: documentId() }));
});

it('releases the watchdog when unmounted and handles WebView process termination', () => {
  renderMap();
  const terminate = tree.root.findByType(WebView).props.onRenderProcessGone;
  act(() => { terminate(); });
  expect(texts()).toContain('지도를 불러오지 못했습니다.');
  expect(jest.getTimerCount()).toBe(0);
});

it('clears a pending load timeout when the map is unmounted', () => {
  renderMap();
  expect(jest.getTimerCount()).toBe(1);
  act(() => { tree.unmount(); });
  expect(jest.getTimerCount()).toBe(0);
});

it('reports SDK initialization exceptions through the existing failure bridge', () => {
  renderMap();
  const postMessage = jest.fn();
  const kakao = { maps: { load: () => { throw new Error('SDK failed'); } } };
  const html: string = tree.root.findByType(WebView).props.source.html;
  const scripts = Array.from(html.matchAll(/<script>([\s\S]*?)<\/script>/g), (match) => match[1]);
  expect(() => runInNewContext(scripts.join('\n'), {
    window: { kakao, ReactNativeWebView: { postMessage } }, kakao,
  })).not.toThrow();
  expect(postMessage).toHaveBeenCalledWith(JSON.stringify({ type: 'map-error', documentId: documentId() }));
});

it('starts a fresh watchdog when returning to previously loaded search results', () => {
  renderMap();
  const originalId = documentId();
  sendMessage('{"type":"map-ready"}');
  act(() => { tree.update(<HospitalSearchMap center={center} hospitals={[]} searchLocation="부산" />); });
  act(() => { tree.update(<HospitalSearchMap center={center} hospitals={hospitals} />); });
  expect(documentId()).not.toBe(originalId);
  sendMessage(JSON.stringify({ type: 'map-ready', documentId: originalId }));
  act(() => { jest.advanceTimersByTime(20000); });
  expect(texts()).toContain('지도를 불러오지 못했습니다.');
});

it('does not reuse a previous failed map when the same results are revisited', () => {
  renderMap();
  const originalId = documentId();
  sendMessage('{"type":"map-error"}');
  act(() => { tree.update(<HospitalSearchMap center={center} hospitals={[]} searchLocation="부산" />); });
  act(() => { tree.update(<HospitalSearchMap center={center} hospitals={hospitals} />); });
  expect(tree.root.findAllByType(WebView)).toHaveLength(1);
  expect(documentId()).not.toBe(originalId);
  sendMessage('{"type":"map-ready"}');
  act(() => { jest.advanceTimersByTime(20000); });
  expect(tree.root.findAllByType(WebView)).toHaveLength(1);
});

it.each([[999, '999m'], [1000, '1km'], [1134, '1.1km'], [2012, '2km'], [2313, '2.3km']])
('formats the selected marker distance %s as %s', (distance, expected) => {
  renderMap([{ ...hospitals[0], distance_m: distance as number }]);
  sendMessage('{"type":"hospital-select","index":0}');
  expect(texts().map(value => [value].flat().join(''))).toContain('현재 위치에서 ' + expected);
});
