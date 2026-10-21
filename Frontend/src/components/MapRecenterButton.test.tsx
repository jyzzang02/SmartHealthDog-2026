import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Alert, PermissionsAndroid, Platform, TouchableOpacity } from 'react-native';
import Geolocation from 'react-native-geolocation-service';
import { WebView } from 'react-native-webview';
import MapRecenterButton from './MapRecenterButton';
import HospitalSearchMap from './HospitalSearchMap';
import ShelterNearbyMap from './ShelterNearbyMap';

jest.mock('react-native-webview', () => ({ WebView: 'WebView' }));
jest.mock('react-native-geolocation-service', () => ({
  getCurrentPosition: jest.fn(), requestAuthorization: jest.fn(),
  watchPosition: jest.fn(), stopObserving: jest.fn(),
}));
const { runInNewContext } = jest.requireActual('vm');
const point = { lat: 37.6, lng: 126.8 };
const position = { coords: { latitude: point.lat, longitude: point.lng, accuracy: 10,
  altitude: null, heading: null, speed: null }, timestamp: 1 };
const flush = async () => { for (let index = 0; index < 10; index++) await Promise.resolve(); };
let tree: renderer.ReactTestRenderer | undefined;
const onLocation = jest.fn();
const button = () => tree!.root.findAllByType(TouchableOpacity)
  .find(node => ['내 위치로 이동', '검색 위치로 이동'].includes(node.props.accessibilityLabel))!;
const press = async () => { await act(async () => { await button().props.onPress(); await flush(); }); };
const render = async (disabled = false) => {
  await act(async () => { tree = renderer.create(<MapRecenterButton disabled={disabled} onLocation={onLocation} />); });
};
beforeEach(() => {
  jest.clearAllMocks();
  jest.replaceProperty(Platform, 'OS', 'android');
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  jest.spyOn(PermissionsAndroid, 'check').mockResolvedValue(true);
  jest.spyOn(PermissionsAndroid, 'requestMultiple').mockResolvedValue({} as Awaited<ReturnType<typeof PermissionsAndroid.requestMultiple>>);
  jest.mocked(Geolocation.getCurrentPosition).mockImplementation(success => success(position));
});
afterEach(() => {
  if (tree) act(() => tree!.unmount());
  tree = undefined; jest.restoreAllMocks(); jest.useRealTimers();
});

it('gets a fresh fix, rejects duplicate clicks, and leaves walk subscriptions alone', async () => {
  let complete!: Parameters<typeof Geolocation.getCurrentPosition>[0];
  jest.mocked(Geolocation.getCurrentPosition).mockImplementation(callback => { complete = callback; });
  await render();
  await act(async () => { button().props.onPress(); button().props.onPress(); await flush(); });
  expect(Geolocation.getCurrentPosition).toHaveBeenCalledTimes(1);
  expect(button().props.disabled).toBe(true);
  expect(Geolocation.getCurrentPosition).toHaveBeenCalledWith(expect.any(Function), expect.any(Function),
    expect.objectContaining({ maximumAge: 0, timeout: 15000 }));
  await act(async () => { complete(position); await flush(); });
  expect(onLocation).toHaveBeenCalledWith(point);
  expect(button().props.disabled).toBe(false);
  expect(Geolocation.watchPosition).not.toHaveBeenCalled();
  expect(Geolocation.stopObserving).not.toHaveBeenCalled();
});

it('does not locate before the map is ready', async () => {
  await render(true); await press();
  expect(Geolocation.getCurrentPosition).not.toHaveBeenCalled();
});

it('explains denied permissions instead of moving to a fallback center', async () => {
  jest.mocked(PermissionsAndroid.check).mockResolvedValue(false);
  await render(); await press();
  expect(Alert.alert).toHaveBeenCalledWith('현재 위치', expect.stringContaining('위치 권한'));
  expect(onLocation).not.toHaveBeenCalled();
  expect(Geolocation.getCurrentPosition).not.toHaveBeenCalled();
});

it('accepts approximate location and permits retry after a GPS failure', async () => {
  jest.mocked(PermissionsAndroid.check).mockImplementation(async permission =>
    permission === PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION);
  jest.mocked(Geolocation.getCurrentPosition).mockImplementationOnce((_success, failure) =>
    failure!({ code: 3, message: 'timeout' }));
  await render(); await press();
  expect(onLocation).not.toHaveBeenCalled();
  expect(Alert.alert).toHaveBeenCalledTimes(1);
  await press();
  expect(onLocation).toHaveBeenCalledWith(point);
  expect(Geolocation.getCurrentPosition).toHaveBeenLastCalledWith(expect.any(Function), expect.any(Function),
    expect.objectContaining({ enableHighAccuracy: false }));
});

it('rejects invalid GPS coordinates', async () => {
  jest.mocked(Geolocation.getCurrentPosition).mockImplementation(success =>
    success({ ...position, coords: { ...position.coords, latitude: NaN } }));
  await render(); await press();
  expect(onLocation).not.toHaveBeenCalled();
  expect(Alert.alert).toHaveBeenCalledTimes(1);
});

it('ignores a late fix after the map document is removed', async () => {
  let complete!: Parameters<typeof Geolocation.getCurrentPosition>[0];
  jest.mocked(Geolocation.getCurrentPosition).mockImplementation(callback => { complete = callback; });
  await render();
  await act(async () => { button().props.onPress(); await flush(); });
  act(() => tree!.unmount()); tree = undefined;
  await act(async () => { complete(position); await flush(); });
  expect(onLocation).not.toHaveBeenCalled();
  expect(Alert.alert).not.toHaveBeenCalled();
});

it('handles iOS permission denial without asking for Android permissions', async () => {
  jest.replaceProperty(Platform, 'OS', 'ios');
  jest.mocked(Geolocation.requestAuthorization).mockResolvedValue('denied');
  await render(); await press();
  expect(Geolocation.requestAuthorization).toHaveBeenCalledWith('whenInUse');
  expect(PermissionsAndroid.check).not.toHaveBeenCalled();
  expect(Alert.alert).toHaveBeenCalledTimes(1);
});

it.each(['hospital', 'shelter'])('recenters the %s map without changing result markers', async kind => {
  jest.useFakeTimers();
  const injectJavaScript = jest.fn();
  const origin = { lat: 37, lng: 127 };
  await act(async () => {
    const map = kind === 'hospital'
      ? <HospitalSearchMap center={origin} hospitals={[{ name: 'Hospital', address: '', location: origin, distance_m: null }]} searchLocation="부산" />
      : <ShelterNearbyMap center={origin} shelters={[{ shelter_id: 1, name: 'Shelter', address: '', location: origin, distance_m: 5 }]}
        loading={false} error={null} onRetry={jest.fn()} onSelect={jest.fn()} />;
    tree = renderer.create(map, { createNodeMock: element => element.type === 'WebView' ? { injectJavaScript } : null });
  });
  expect(button().props.disabled).toBe(true);
  const html = tree!.root.findByType(WebView).props.source.html as string;
  const id = JSON.parse(html.match(/var mapDocumentId = (.*);/)![1]);
  const panTo = jest.fn();
  const setBounds = jest.fn();
  const setPosition = jest.fn();
  const maps = { load: (ready: () => void) => ready(), LatLng: jest.fn((lat, lng) => ({ lat, lng })),
    Map: jest.fn(() => ({ setBounds, panTo })), Marker: jest.fn(),
    Circle: jest.fn(() => ({ setPosition })), LatLngBounds: jest.fn(() => ({ extend: jest.fn() })),
    event: { addListener: jest.fn() } };
  const kakao = { maps };
  const window = { kakao, ReactNativeWebView: { postMessage: (data: string) =>
    tree!.root.findByType(WebView).props.onMessage({ nativeEvent: { data } }) } };
  const context = { window, kakao, document: { getElementById: () => ({}) } };
  act(() => { runInNewContext(Array.from(html.matchAll(/<script>([\s\S]*?)<\/script>/g), match => match[1]).join('\n'), context); });
  expect(button().props.disabled).toBe(false);
  await press();
  expect(injectJavaScript).toHaveBeenCalledTimes(1);
  const script = injectJavaScript.mock.calls[0][0];
  expect(script).toContain(JSON.stringify(kind === 'shelter' ? { documentId: id, point } : { documentId: id }));
  runInNewContext(script, context);
  expect(maps.Marker).toHaveBeenCalledTimes(1);
  if (kind === 'shelter') {
    expect(setPosition).toHaveBeenCalledWith(point);
    expect(panTo).toHaveBeenCalledWith(point);
  } else {
    expect(Geolocation.getCurrentPosition).not.toHaveBeenCalled();
    expect(PermissionsAndroid.check).not.toHaveBeenCalled();
    expect(setBounds).toHaveBeenCalledTimes(2);
  }
  const move = (window as unknown as { recenterMap: (data: unknown) => void }).recenterMap;
  move({ documentId: 'old-document', point });
  if (kind === 'shelter') {
    move({ documentId: id, point: { lat: NaN, lng: 127 } });
    expect(panTo).toHaveBeenCalledTimes(1);
  } else expect(setBounds).toHaveBeenCalledTimes(2);
});

it.each(['hospital', 'shelter'])('keeps unique sibling keys and a single WebView on %s map updates', async kind => {
  jest.useFakeTimers();
  const createMap = (location: { lat: number; lng: number }) => kind === 'hospital'
    ? <HospitalSearchMap center={location} hospitals={[]} />
    : <ShelterNearbyMap center={location} shelters={[]} loading={false} error={null}
      onRetry={jest.fn()} onSelect={jest.fn()} />;
  act(() => { tree = renderer.create(createMap(point)); });
  const assertSingleMap = () => {
    const siblings = React.Children.toArray(tree!.root.findByType(MapRecenterButton).parent!.props.children)
      .filter(React.isValidElement);
    expect(siblings).toHaveLength(2);
    expect(new Set(siblings.map(child => child.key)).size).toBe(siblings.length);
    expect(tree!.root.findAllByType(WebView)).toHaveLength(1);
    expect(tree!.root.findAllByType(MapRecenterButton)).toHaveLength(1);
  };
  assertSingleMap();
  act(() => { tree!.update(createMap({ lat: 35.18, lng: 129.07 })); });
  assertSingleMap();
});
