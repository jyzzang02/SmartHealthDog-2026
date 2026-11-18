import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Alert, Text, TouchableOpacity } from 'react-native';
import { launchImageLibrary } from 'react-native-image-picker';
import { deleteCertificateSubmission, requestCertificateOcr } from '../api/diagnosis';
import HealthCheckInputScreen from './HealthCheckInputScreen';

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ isFocused: () => true }),
  useRoute: () => ({ params: { petId: 1, petName: '하나' } }),
  useFocusEffect: () => {},
  usePreventRemove: () => {},
}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) }));
jest.mock('../api/pets', () => ({ getMyPets: async () => [] }));
jest.mock('../api/users', () => ({ getMyProfile: async () => ({ id: 1 }) }));
jest.mock('../storage/tokenStorage', () => {
  const session = Symbol();
  return { getAuthSession: () => session, assertAuthSession: () => {} };
});
jest.mock('../storage/certificateRecovery', () => ({
  clearPendingCertificate: async () => {}, storePendingCertificate: async () => {},
}));
jest.mock('../api/diagnosis', () => ({
  deleteCertificateSubmission: jest.fn(), requestCertificateOcr: jest.fn(), getCertificateOcrResult: jest.fn(),
}));
jest.mock('react-native-image-picker', () => ({ launchImageLibrary: jest.fn() }));

let tree: renderer.ReactTestRenderer;
const labels = () => tree.root.findAllByType(Text).map(node => node.props.children);
const press = (label: string) => tree.root.findAllByType(TouchableOpacity)
  .find(button => button.findAllByType(Text).some(node => node.props.children === label))!.props.onPress();

beforeEach(async () => {
  jest.useFakeTimers();
  jest.mocked(launchImageLibrary).mockResolvedValue({ assets: [{ uri: 'file:///test.jpg' }] });
  await act(async () => { tree = renderer.create(<HealthCheckInputScreen />); });
});
afterEach(() => {
  act(() => tree?.unmount());
  jest.clearAllTimers();
  jest.useRealTimers();
  jest.resetAllMocks();
  jest.restoreAllMocks();
});

it('waits for the upload receipt before deleting the exact server submission', async () => {
  let acceptUpload!: (id: string) => void;
  jest.mocked(requestCertificateOcr).mockImplementationOnce(() => new Promise(resolve => { acceptUpload = resolve; }));
  jest.mocked(deleteCertificateSubmission).mockResolvedValueOnce(undefined);
  await act(async () => { await press('앨범에서 선택'); });
  let removal!: Promise<void>;
  act(() => { removal = press('삭제'); });
  expect(deleteCertificateSubmission).not.toHaveBeenCalled();
  expect(labels()).toContain('삭제');
  await act(async () => { acceptUpload('uploaded-record'); await removal; });
  expect(deleteCertificateSubmission).toHaveBeenCalledWith('uploaded-record', expect.anything());
  expect(labels()).not.toContain('삭제');
});

it('keeps the photo and submission ID when server deletion fails', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  jest.mocked(requestCertificateOcr).mockResolvedValueOnce('uploaded-record');
  jest.mocked(deleteCertificateSubmission).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(undefined);
  await act(async () => { await press('앨범에서 선택'); });
  await act(async () => { await press('삭제'); });
  expect(labels()).toContain('삭제');
  expect(alert).toHaveBeenCalledWith('오류', '진단서를 삭제하지 못했어요. 다시 시도해 주세요.');
  await act(async () => { await press('삭제'); });
  expect(deleteCertificateSubmission).toHaveBeenLastCalledWith('uploaded-record', expect.anything());
  expect(labels()).not.toContain('삭제');
});
