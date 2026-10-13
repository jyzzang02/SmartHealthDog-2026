import { Linking, Platform } from 'react-native';
import { openNaverHospital } from '../openNaverHospital';

const hospital = { name: ' 신원당동물의료센터 ', address: ' 경기도 고양시 호국로 88 ' };
const query = '신원당동물의료센터';
let open: jest.SpyInstance;
beforeEach(() => {
  jest.clearAllMocks();
  jest.replaceProperty(Platform, 'OS', 'android');
  open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
});
afterEach(() => { jest.restoreAllMocks(); });

it('opens an Android app search with the documented query and current application ID', async () => {
  await openNaverHospital(hospital);
  expect(open).toHaveBeenCalledTimes(1);
  expect(open).toHaveBeenCalledWith(`nmap://search?query=${encodeURIComponent(query)}&appname=com.smarthealthdog`);
});

it('uses the current iOS bundle identifier', async () => {
  jest.replaceProperty(Platform, 'OS', 'ios');
  await openNaverHospital(hospital);
  expect(open.mock.calls[0][0]).toContain('appname=org.reactjs.native.example.SmartHealthDog');
});

it('falls back to web search when the app is unavailable', async () => {
  open.mockRejectedValueOnce(new Error('No app'));
  await openNaverHospital(hospital);
  expect(open.mock.calls[1][0]).toBe(`https://map.naver.com/p/search/${encodeURIComponent(query)}`);
});

it('falls back when native launch resolves false', async () => {
  open.mockResolvedValueOnce(false);
  await openNaverHospital(hospital);
  expect(open).toHaveBeenCalledTimes(2);
  expect(open.mock.calls[1][0]).toMatch(/^https:\/\/map\.naver\.com\/p\/search\//);
});

it('encodes a name so reserved characters cannot change the action', async () => {
  const name = '병원 & appname=other/#?';
  await openNaverHospital({ name, address: null });
  const params = new URL(open.mock.calls[0][0]).searchParams;
  expect(params.get('query')).toBe(name);
  expect(params.get('appname')).toBe('com.smarthealthdog');
  expect(Array.from(params.keys())).toEqual(['query', 'appname']);
});

it('supports a missing address without inventing a place ID', async () => {
  await openNaverHospital({ name: '병원', address: null });
  expect(open).toHaveBeenCalledWith(`nmap://search?query=${encodeURIComponent('병원')}&appname=com.smarthealthdog`);
});

it('rejects a missing hospital name before any external launch', async () => {
  await expect(openNaverHospital({ name: ' ', address: '서울' })).rejects.toThrow('Missing hospital name');
  expect(open).not.toHaveBeenCalled();
});

it('propagates a failed web fallback for the UI to report', async () => {
  open.mockRejectedValue(new Error('Unavailable'));
  await expect(openNaverHospital(hospital)).rejects.toThrow('Unavailable');
  expect(open).toHaveBeenCalledTimes(2);
});

it('searches only the hospital name even when the full address is provided', async () => {
  await openNaverHospital({
    name: '헬릭스동물메디컬센터 일산', address: '경기도 고양시 덕양구 중앙로 439',
  });
  expect(new URL(open.mock.calls[0][0]).searchParams.get('query')).toBe('헬릭스동물메디컬센터 일산');
});
