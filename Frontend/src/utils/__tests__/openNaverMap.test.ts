import { Linking, Platform } from 'react-native';
import { openNaverMap } from '../openNaverMap';

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
  await openNaverMap(hospital);
  expect(open).toHaveBeenCalledTimes(1);
  expect(open).toHaveBeenCalledWith(`nmap://search?query=${encodeURIComponent(query)}&appname=com.smarthealthdog`);
});

it('uses the current iOS bundle identifier', async () => {
  jest.replaceProperty(Platform, 'OS', 'ios');
  await openNaverMap(hospital);
  expect(open.mock.calls[0][0]).toContain('appname=org.reactjs.native.example.SmartHealthDog');
});

it('falls back to web search when the app is unavailable', async () => {
  open.mockRejectedValueOnce(new Error('No app'));
  await openNaverMap(hospital);
  expect(open.mock.calls[1][0]).toBe(`https://map.naver.com/p/search/${encodeURIComponent(query)}`);
});

it('falls back when native launch resolves false', async () => {
  open.mockResolvedValueOnce(false);
  await openNaverMap(hospital);
  expect(open).toHaveBeenCalledTimes(2);
  expect(open.mock.calls[1][0]).toMatch(/^https:\/\/map\.naver\.com\/p\/search\//);
});

it('encodes a name so reserved characters cannot change the action', async () => {
  const name = '병원 & appname=other/#?';
  await openNaverMap({ name, address: null });
  const params = new URL(open.mock.calls[0][0]).searchParams;
  expect(params.get('query')).toBe(name);
  expect(params.get('appname')).toBe('com.smarthealthdog');
  expect(Array.from(params.keys())).toEqual(['query', 'appname']);
});

it('supports a missing address without inventing a place ID', async () => {
  await openNaverMap({ name: '병원', address: null });
  expect(open).toHaveBeenCalledWith(`nmap://search?query=${encodeURIComponent('병원')}&appname=com.smarthealthdog`);
});

it('rejects a missing place name before any external launch', async () => {
  await expect(openNaverMap({ name: ' ', address: '서울' })).rejects.toThrow('Missing place name');
  expect(open).not.toHaveBeenCalled();
});

it('propagates a failed web fallback for the UI to report', async () => {
  open.mockRejectedValue(new Error('Unavailable'));
  await expect(openNaverMap(hospital)).rejects.toThrow('Unavailable');
  expect(open).toHaveBeenCalledTimes(2);
});

it('searches only the hospital name even when the full address is provided', async () => {
  await openNaverMap({
    name: '헬릭스동물메디컬센터 일산', address: '경기도 고양시 덕양구 중앙로 439',
  });
  expect(new URL(open.mock.calls[0][0]).searchParams.get('query')).toBe('헬릭스동물메디컬센터 일산');
});

it.each([
  ['고양시동물보호센터', '경기도 고양시 덕양구 고양대로 1695 (원흥동, 고양시 농업기술센터) 고양시동물보호센터', '고양시동물보호센터 경기도 고양시'],
  ['홍익동물병원', '서울특별시 마포구 독막로 45 (합정동)', '홍익동물병원 서울 마포구'],
  ['늘푸른동물병원', ' 인천광역시   부평구 경인로 100 늘푸른동물병원 ', '늘푸른동물병원 인천 부평구'],
])('searches %s by name followed by its physical address region', async (name, address, expected) => {
  await openNaverMap({ name, address }, { includeRegion: true });
  expect(new URL(open.mock.calls[0][0]).searchParams.get('query')).toBe(expected);
});

it('uses the same name and region for the web fallback without a street or repeated name', async () => {
  open.mockRejectedValueOnce(new Error('No app'));
  await openNaverMap({ name: '구로댕냥이네', address: '서울특별시 구로구 경인로 472 (구로동) 구로댕냥이네' }, { includeRegion: true });
  const shelterQuery = '구로댕냥이네 서울 구로구';
  expect(new URL(open.mock.calls[0][0]).searchParams.get('query')).toBe(shelterQuery);
  expect(open.mock.calls[1][0]).toBe('https://map.naver.com/p/search/' + encodeURIComponent(shelterQuery));
});

it.each([null, '', '경인로 100', '지역 정보 없음'])('does not treat an unavailable address region as a search location: %s', async address => {
  await openNaverMap({ name: '보호소', address }, { includeRegion: true });
  expect(new URL(open.mock.calls[0][0]).searchParams.get('query')).toBe('보호소');
});
