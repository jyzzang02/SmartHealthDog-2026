import { Linking, Platform } from 'react-native';
import type { HospitalItem } from '../api/hospitals';

// Keep these identifiers in sync with the Android and iOS build settings.
const APP_NAMES = {
  android: 'com.smarthealthdog',
  ios: 'org.reactjs.native.example.SmartHealthDog',
};

const shelterAddressRegion = (address: string | null): string => {
  const [province, district] = (address ?? '').replace(/\([^)]*\)/g, ' ').trim().split(/\s+/);
  const shortProvinces = ['서울', '부산', '대구', '인천', '광주', '대전', '울산', '세종',
    '경기', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주'];
  if (!province || !district || (!/[시도]$/.test(province) && !shortProvinces.includes(province))
    || !/^[가-힣]+[시군구]$/.test(district)) return '';
  return `${province.replace(/(?:특별자치시|특별시|광역시)$/, '')} ${district}`;
};

export const openNaverHospital = async (
  hospital: Pick<HospitalItem, 'name' | 'address'>,
  options: { includeRegion?: boolean } = {},
): Promise<void> => {
  const name = hospital.name.trim();
  if (!name) throw new Error('Missing hospital name');
  const normalizedName = name.replace(/\s+/g, ' ');
  const region = options.includeRegion ? shelterAddressRegion(hospital.address) : '';
  const query = region ? `${normalizedName} ${region}` : normalizedName;
  const encoded = encodeURIComponent(query);
  const webUrl = `https://map.naver.com/p/search/${encoded}`;
  const appName = Platform.OS === 'android' ? APP_NAMES.android : Platform.OS === 'ios' ? APP_NAMES.ios : null;
  if (appName) {
    try {
      // Attempt launch directly: canOpenURL needs extra app-visibility configuration.
      const opened = await Linking.openURL(`nmap://search?query=${encoded}&appname=${encodeURIComponent(appName)}`);
      if (opened !== false) return;
    } catch {
      // An absent or unavailable NAVER Maps app falls back to the same web search.
    }
  }
  await Linking.openURL(webUrl);
};
