import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import { getCertificateFields, getPetSubmissions } from '../api/diagnosis';
import HealthDetailScreen from './HealthDetailScreen';

jest.mock('@react-navigation/native', () => ({
  useIsFocused: () => true,
  useNavigation: () => ({}),
  useRoute: () => ({ params: { petId: 1, petName: '하나' } }),
  useFocusEffect: () => {},
}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0 }) }));
jest.mock('../api/diagnosis', () => ({ getPetSubmissions: jest.fn(), getCertificateFields: jest.fn() }));
jest.mock('../api/pets', () => ({ getMyPets: jest.fn() }));
jest.mock('../api/selfCheck', () => ({}));
jest.mock('../store/healthStore', () => ({ healthStore: { getHistory: () => [] } }));

const records = [
  { id: 'older', type: 'HEALTH_CERTIFICATE', status: 'COMPLETED', submittedAt: '2026-11-16T00:01:00' },
  { id: 'latest', type: 'HEALTH_CERTIFICATE', status: 'COMPLETED', submittedAt: '2026-11-16T00:02:00' },
];
let tree: renderer.ReactTestRenderer;
const labels = () => tree.root.findAllByType(Text).map(node => node.props.children);

beforeEach(() => {
  jest.useFakeTimers();
  jest.mocked(getPetSubmissions).mockResolvedValue(records);
});
afterEach(() => {
  act(() => tree?.unmount());
  jest.useRealTimers();
  jest.resetAllMocks();
});

it('uses the same newest registered record in the header and list even when its name arrives last', async () => {
  let resolveLatest!: (result: { hospitalName?: string }) => void;
  jest.mocked(getCertificateFields).mockImplementation(id => id === 'latest'
    ? new Promise(resolve => { resolveLatest = resolve; })
    : Promise.resolve({ hospitalName: '이전 병원' }));
  await act(async () => { tree = renderer.create(<HealthDetailScreen />); });
  expect(labels()).toContain('불러오는 중...');
  expect(labels().filter(label => label === '이전 병원')).toHaveLength(1);
  await act(async () => { resolveLatest({ hospitalName: '최근 병원' }); });
  expect(labels().filter(label => label === '최근 병원')).toHaveLength(2);
  expect(labels().filter(label => label === '2026-11-16')).toHaveLength(3);
});

it('sets a terminal status for timed-out hospital fields without hiding successful rows', async () => {
  jest.mocked(getCertificateFields).mockImplementation(id => id === 'latest'
    ? new Promise(() => {})
    : Promise.resolve({ hospitalName: '이전 병원' }));
  await act(async () => { tree = renderer.create(<HealthDetailScreen />); });
  await act(async () => { jest.advanceTimersByTime(30_000); });
  expect(labels()).not.toContain('불러오는 중...');
  expect(labels().filter(label => label === '조회 실패')).toHaveLength(2);
  expect(labels()).toContain('이전 병원');
});
