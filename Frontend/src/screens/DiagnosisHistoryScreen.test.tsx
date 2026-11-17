import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Text, TouchableOpacity } from 'react-native';
import { getPetDiagnosisHistory } from '../api/diagnosis';
import { listRespirationRecords } from '../api/respiration';
import DiagnosisHistoryScreen from './DiagnosisHistoryScreen';

jest.mock('@react-navigation/native', () => ({ useFocusEffect: () => {} }));
jest.mock('../api/diagnosis', () => ({ getPetDiagnosisHistory: jest.fn() }));
jest.mock('../api/respiration', () => ({ listRespirationRecords: jest.fn() }));
jest.mock('../api/pets', () => ({ getMyPets: jest.fn() }));

const navigate = jest.fn();
const props = { route: { params: { petId: 1, petName: '하나' } }, navigation: { navigate } } as unknown as React.ComponentProps<typeof DiagnosisHistoryScreen>;
const sleep = { videoId: 'video', petId: 1, status: 'COMPLETED', durationSec: 60, fileSizeBytes: null, respiratoryRate: 25, failureReason: null, createdAt: '2026-11-16T00:00:00Z', uploadedAt: null, completedAt: null } as const;

afterEach(() => jest.resetAllMocks());

it('excludes certificates and opens the selected sleep record', async () => {
  jest.mocked(getPetDiagnosisHistory).mockResolvedValueOnce([
    { id: 'cert', type: 'HEALTH_CERTIFICATE', status: 'COMPLETED' },
    { id: 'eye', type: 'EYE', status: 'PENDING' },
  ]);
  jest.mocked(listRespirationRecords).mockResolvedValueOnce([sleep, { ...sleep, videoId: 'other', petId: 2 }]);
  let tree!: renderer.ReactTestRenderer;
  await act(async () => { tree = renderer.create(<DiagnosisHistoryScreen {...props} />); });
  const texts = tree.root.findAllByType(Text).map(item => item.props.children);
  expect(texts).toContain('수면 호흡 분석');
  expect(texts).toContain('안구 진단');
  expect(texts).not.toContain('HEALTH_CERTIFICATE');
  const row = tree.root.findAllByType(TouchableOpacity).find(item => item.findAllByType(Text).some(t => t.props.children === '수면 호흡 분석'))!;
  act(() => row.props.onPress());
  expect(navigate).toHaveBeenCalledWith('RespirationResult', { petId: 1, petName: '하나', videoId: 'video' });
  act(() => tree.unmount());
});

it('keeps available diagnosis records and reports partial failures', async () => {
  jest.mocked(getPetDiagnosisHistory).mockResolvedValueOnce([{ id: 'eye', type: 'EYE', status: 'COMPLETED' }]);
  jest.mocked(listRespirationRecords).mockRejectedValueOnce(new Error('offline'));
  let tree!: renderer.ReactTestRenderer;
  await act(async () => { tree = renderer.create(<DiagnosisHistoryScreen {...props} />); });
  const texts = tree.root.findAllByType(Text).map(item => item.props.children);
  expect(texts).toContain('안구 진단');
  expect(texts).toContain('일부 진단 이력을 불러오지 못했습니다.');
  act(() => tree.unmount());
});
