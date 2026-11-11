import AsyncStorage from '@react-native-async-storage/async-storage';

const PREVIEW_KEY = 'selfCheck.previewSeen.v1';

export async function shouldShowSelfCheckPreview() {
  try {
    return (await AsyncStorage.getItem(PREVIEW_KEY)) !== '1';
  } catch {
    return false;
  }
}

export async function markSelfCheckPreviewSeen() {
  try {
    await AsyncStorage.setItem(PREVIEW_KEY, '1');
  } catch {
    // Login must remain available if the device cannot save this preference.
  }
}
