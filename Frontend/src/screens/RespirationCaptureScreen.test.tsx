import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { NativeModules, Text } from 'react-native';
import { launchImageLibrary } from 'react-native-image-picker';
import { completeRespirationUpload, prepareRespirationUpload } from '../api/respiration';

jest.mock('@react-navigation/native', () => ({ useIsFocused: () => true, usePreventRemove: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: 'SafeAreaView' }));
jest.mock('react-native-vision-camera', () => ({
  useCameraDevice: () => undefined,
  useCameraFormat: () => undefined,
  useCameraPermission: () => ({ hasPermission: false }),
  useMicrophonePermission: () => ({ hasPermission: false }),
}));
jest.mock('react-native-image-picker', () => ({ launchImageLibrary: jest.fn() }));
jest.mock('../api/respiration', () => ({ prepareRespirationUpload: jest.fn(), completeRespirationUpload: jest.fn() }));

const files = { size: jest.fn(), upload: jest.fn(), discard: jest.fn() };
NativeModules.RespirationFile = files;
const Screen = require('./RespirationCaptureScreen').default as typeof import('./RespirationCaptureScreen').default;

const path = 'file:///cache/video.mp4';
const url = 'https://example.test/video';
const size = 1024;
const props = {
  route: { params: { petId: 1, petName: '하나' } },
  navigation: { goBack: jest.fn() },
} as unknown as React.ComponentProps<typeof Screen>;
let tree: renderer.ReactTestRenderer;

beforeEach(async () => {
  jest.clearAllMocks();
  files.size.mockResolvedValue(size);
  files.upload.mockResolvedValue(200);
  files.discard.mockResolvedValue(undefined);
  await act(async () => { tree = renderer.create(<Screen {...props} />); });
});
afterEach(() => { act(() => tree.unmount()); });
afterAll(() => { delete NativeModules.RespirationFile; });

const button = (label: string) => tree.root.findAll(node =>
  typeof node.props.onPress === 'function' && node.props.children?.props?.children === label)[0];

it('registers a gallery video through the existing upload flow only after confirmation', async () => {
  jest.mocked(launchImageLibrary).mockResolvedValueOnce({ assets: [{ uri: path, type: 'video/mp4', duration: 60 }] });
  jest.mocked(prepareRespirationUpload).mockResolvedValueOnce({ videoId: 'test', uploadUrl: url, objectKey: 'test', expiresInSeconds: 900 });
  jest.mocked(completeRespirationUpload).mockResolvedValueOnce({
    videoId: 'test', petId: 1, status: 'PENDING', durationSec: 60, fileSizeBytes: size,
    respiratoryRate: null, failureReason: null, createdAt: '', uploadedAt: null, completedAt: null,
  });

  await act(async () => { await button('갤러리에서 영상 선택').props.onPress(); });
  expect(launchImageLibrary).toHaveBeenCalledWith({ mediaType: 'video', selectionLimit: 1 });
  expect(prepareRespirationUpload).not.toHaveBeenCalled();
  await act(async () => { await button('영상 등록').props.onPress(); });
  expect(prepareRespirationUpload).toHaveBeenCalledWith(1, size, 60);
  expect(files.upload).toHaveBeenCalledWith(path, url);
  expect(completeRespirationUpload).toHaveBeenCalledWith(1, 'test');
  expect(files.discard).toHaveBeenCalledWith(path);
});

it.each([
  ['video/quicktime', 60, size, 'MP4 형식의 영상을 선택해 주세요.'],
  ['video/mp4', 29, size, '영상 길이는 30~120초여야 합니다. 다른 영상을 선택해 주세요.'],
  ['video/mp4', 60, 31457281, '영상이 30MB를 초과했습니다. 더 작은 영상을 선택해 주세요.'],
])('rejects invalid gallery video (%s, %s seconds, %s bytes)', async (type, duration, bytes, message) => {
  files.size.mockResolvedValue(bytes);
  jest.mocked(launchImageLibrary).mockResolvedValueOnce({ assets: [{ uri: path, type, duration }] });
  await act(async () => { await button('갤러리에서 영상 선택').props.onPress(); });
  expect(tree.root.findAllByType(Text).some(node => node.props.children === message)).toBe(true);
  expect(button('영상 등록')).toBeUndefined();
  expect(prepareRespirationUpload).not.toHaveBeenCalled();
  expect(files.discard).toHaveBeenCalledWith(path);
});
