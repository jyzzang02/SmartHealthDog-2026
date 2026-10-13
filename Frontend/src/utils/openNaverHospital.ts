import { Linking, Platform } from 'react-native';
import type { HospitalItem } from '../api/hospitals';

// Keep these identifiers in sync with the Android and iOS build settings.
const APP_NAMES = {
  android: 'com.smarthealthdog',
  ios: 'org.reactjs.native.example.SmartHealthDog',
};

export const openNaverHospital = async (hospital: Pick<HospitalItem, 'name' | 'address'>): Promise<void> => {
  const name = hospital.name.trim();
  if (!name) throw new Error('Missing hospital name');
  const query = name.replace(/\s+/g, ' ');
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
