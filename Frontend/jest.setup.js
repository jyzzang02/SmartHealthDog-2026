/* eslint-env jest */

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

jest.mock('react-native-webview', () => 'WebView');

jest.mock('react-native-config', () => ({
  KAKAO_REST_API_KEY: '',
}));

jest.mock('react-native-geolocation-service', () => ({
  getCurrentPosition: jest.fn(),
  watchPosition: jest.fn(),
  clearWatch: jest.fn(),
  stopObserving: jest.fn(),
}));

jest.mock('react-native-vision-camera', () => {
  const React = require('react');

  return {
    Camera: React.forwardRef(() => null),
    useCameraDevice: jest.fn(() => undefined),
    useCameraFormat: jest.fn(() => undefined),
    useCameraPermission: jest.fn(() => ({
      hasPermission: false,
      requestPermission: jest.fn(async () => false),
    })),
  };
});
