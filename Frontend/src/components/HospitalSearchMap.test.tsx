import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Text, TouchableOpacity } from 'react-native';
import { WebView } from 'react-native-webview';
import HospitalSearchMap from './HospitalSearchMap';
import type { HospitalMapItem } from './HospitalSearchMap';

jest.mock('react-native-webview', () => ({ WebView: 'WebView' }));

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
const sendMessage = (data: string) => {
  act(() => { tree.root.findByType(WebView).props.onMessage({ nativeEvent: { data } }); });
};

afterEach(() => { act(() => { tree.unmount(); }); });

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
  expect(tree.root.findByType(WebView).props.source.html).toBe(html);
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
  expect(postMessage).toHaveBeenCalledWith('{"type":"hospital-select","index":0}');
});
