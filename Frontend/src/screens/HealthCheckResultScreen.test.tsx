import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Text, TextInput, TouchableOpacity } from 'react-native';
import { getSavedCertificate, updateSavedCertificate } from '../api/diagnosis';
import type { HealthSummary } from '../types/health';
import HealthCheckResultScreen from './HealthCheckResultScreen';

jest.mock('@react-navigation/native', () => ({
  useIsFocused: () => true,
  useNavigation: () => ({}),
  useRoute: () => ({ params: { petId: 1, petName: '하나', historySubmissionId: 'record', viewOnly: true } }),
  useFocusEffect: () => {},
}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ bottom: 0, top: 0 }) }));
jest.mock('../storage/tokenStorage', () => {
  const session = Symbol();
  return { getAuthSession: () => session };
});
jest.mock('../storage/certificateRecovery', () => ({}));
jest.mock('../store/healthStore', () => ({ healthStore: { set: jest.fn(), remove: jest.fn() } }));
jest.mock('../api/diagnosis', () => ({
  getSavedCertificate: jest.fn(), updateSavedCertificate: jest.fn(), getCertificateImageUrl: jest.fn(),
}));

const before: HealthSummary = {
  petId: 1, certificateSubmissionId: 'record', checkupDate: '2026-11-16', hospitalName: '기존 병원',
  certificate: {
    animalName: '하나', species: '', breed: '', sex: '', coatColor: '', age: '', features: '',
    diseaseName: '기존 병명', onsetDate: '', diagnosisDate: '2026-11-16', prognosis: '', remarks: '',
  },
};
let tree: renderer.ReactTestRenderer;
const labels = () => tree.root.findAllByType(Text).map(node => node.props.children);
const press = (label: string) => tree.root.findAllByType(TouchableOpacity)
  .find(button => button.findAllByType(Text).some(node => node.props.children === label))!.props.onPress();

beforeEach(() => {
  jest.mocked(getSavedCertificate).mockResolvedValueOnce(before);
  jest.mocked(updateSavedCertificate).mockResolvedValue(undefined);
});
afterEach(() => {
  act(() => tree?.unmount());
  jest.resetAllMocks();
});

it('sends explicit clears then displays the server result rather than the draft', async () => {
  jest.mocked(getSavedCertificate).mockResolvedValueOnce({
    ...before, hospitalName: '서버 병원', checkupDate: '',
    certificate: { ...before.certificate, diseaseName: '', diagnosisDate: '' },
  });
  await act(async () => { tree = renderer.create(<HealthCheckResultScreen />); });
  act(() => press('수정하기'));
  act(() => {
    for (const label of ['병명', '진단 연월일']) {
      tree.root.findAllByType(TextInput).find(node => node.props.accessibilityLabel === label)!.props.onChangeText('');
    }
  });
  await act(async () => { await press('저장하기'); });
  expect(updateSavedCertificate).toHaveBeenCalledWith('record', { diseaseName: '', diagnosisDate: '' }, undefined, expect.anything());
  expect(getSavedCertificate).toHaveBeenCalledTimes(2);
  expect(labels()).toContain('서버 병원');
  expect(labels()).not.toContain('기존 병명');
});

it('retries the GET without resending the PATCH when the refresh fails', async () => {
  jest.mocked(getSavedCertificate).mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValueOnce({ ...before, hospitalName: '서버 병원' });
  await act(async () => { tree = renderer.create(<HealthCheckResultScreen />); });
  act(() => press('수정하기'));
  await act(async () => { await press('저장하기'); });
  expect(labels()).toContain('검진 기록을 불러오지 못했어요. 다시 시도');
  await act(async () => { press('검진 기록을 불러오지 못했어요. 다시 시도'); });
  expect(getSavedCertificate).toHaveBeenCalledTimes(3);
  expect(updateSavedCertificate).toHaveBeenCalledTimes(1);
  expect(labels()).toContain('서버 병원');
});
