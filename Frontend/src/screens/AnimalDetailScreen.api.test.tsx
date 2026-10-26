import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Text, Linking, Alert, Image, TouchableOpacity } from 'react-native';
import AnimalDetailScreen from './AnimalDetailScreen';
import CustomButton from '../components/CustomButton';
import { getShelterPetDetail, PetDetail } from '../api/shelters';

const initialAnimal = () => ({ id: 21, shelterId: 7, name: 'List Happy', shelterName: 'List shelter',
  shelterPhone: '02-123-4567', shelterAddress: 'List address', breed: 'List breed',
  image: { uri: 'https://example.test/list.jpg' } });
let mockAnimalData = initialAnimal();
const mockNavigation = { goBack: jest.fn() };
jest.mock('../dev/adoptionMock', () => ({ getAdoptionMock: () => null }));
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => mockNavigation, useRoute: () => ({ params: { animalData: mockAnimalData } }),
}));
jest.mock('../api/shelters', () => ({ getShelterPetDetail: jest.fn() }));
const detail = (id = 21): PetDetail => ({ pet_id: id, shelter_id: 7, name: 'Happy', species: 'dog',
  breed: 'Real breed', gender: null, is_neutered: null, images: ['https://example.test/detail.jpg'],
  shelter_contact: { name: 'Real shelter', phone_number: '031-123-4567', address: 'Real address' } });
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
};
let tree: renderer.ReactTestRenderer | undefined;
const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
const mount = async () => { await act(async () => { tree = renderer.create(<AnimalDetailScreen />); await flush(); }); };
const texts = () => tree!.root.findAllByType(Text).map(node => [node.props.children].flat().join(''));
beforeEach(() => {
  jest.clearAllMocks();
  mockAnimalData = initialAnimal();
  jest.mocked(getShelterPetDetail).mockReset().mockResolvedValue(detail());
  jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});
afterEach(async () => {
  if (tree) await act(async () => { tree!.unmount(); });
  tree = undefined; jest.restoreAllMocks();
});

it('loads the selected pet and uses its real image, contact and phone action', async () => {
  await mount();
  expect(getShelterPetDetail).toHaveBeenCalledWith(7, 21, expect.any(AbortSignal));
  expect(texts()).toContain('Real breed');
  expect(texts()).toContain('Real address');
  expect(texts()).not.toContain('중성화 X');
  expect(tree!.root.findAllByType(Image).some(node => node.props.source?.uri === 'https://example.test/detail.jpg')).toBe(true);
  const button = tree!.root.findByType(CustomButton);
  expect(button.props.disabled).toBe(false);
  await act(async () => { await button.props.onPress(); });
  expect(Linking.openURL).toHaveBeenCalledWith('tel:0311234567');
});

it('keeps list data and an explicit error when detail loading fails', async () => {
  jest.mocked(getShelterPetDetail).mockRejectedValue(new Error('Detail unavailable'));
  await mount();
  expect(texts()).toContain('Detail unavailable');
  expect(texts()).toContain('List breed');
  expect(texts()).toContain('List address');
  await act(async () => { await tree!.root.findByType(CustomButton).props.onPress(); });
  expect(Linking.openURL).toHaveBeenCalledWith('tel:021234567');
});

it.each(['', 'bad;number', '12', '02-123-4567,031-123-4567'])
('does not launch an invalid or missing phone number: %s', async phone => {
  mockAnimalData.shelterPhone = phone;
  jest.mocked(getShelterPetDetail).mockResolvedValue({ ...detail(), shelter_contact: { phone_number: phone } });
  await mount();
  const button = tree!.root.findByType(CustomButton);
  expect(button.props.disabled).toBe(true);
  await act(async () => { await button.props.onPress(); });
  expect(Linking.openURL).not.toHaveBeenCalled();
});

it('prevents duplicate phone launches and contains failures using the existing error wording', async () => {
  const pending = deferred<boolean>();
  jest.mocked(Linking.openURL).mockReturnValueOnce(pending.promise);
  await mount();
  const button = tree!.root.findByType(CustomButton);
  await act(async () => { button.props.onPress(); button.props.onPress(); await flush(); });
  expect(Linking.openURL).toHaveBeenCalledTimes(1);
  await act(async () => { pending.resolve(true); await flush(); });
  jest.mocked(Linking.openURL).mockRejectedValueOnce(new Error('No dialer'));
  await act(async () => { await button.props.onPress(); });
  expect(Alert.alert).toHaveBeenCalledWith('연결 실패', '연결할 수 없습니다. 다시 시도해 주세요.');
});

it('cancels stale detail requests when another pet is selected', async () => {
  const old = deferred<PetDetail>();
  jest.mocked(getShelterPetDetail).mockReturnValueOnce(old.promise).mockResolvedValueOnce({ ...detail(22), breed: 'New breed' });
  await mount();
  const signal = jest.mocked(getShelterPetDetail).mock.calls[0][2]!;
  mockAnimalData = { ...initialAnimal(), id: 22 };
  await act(async () => { tree!.update(<AnimalDetailScreen />); await flush(); });
  expect(signal.aborted).toBe(true);
  await act(async () => { old.resolve({ ...detail(), breed: 'Old breed' }); await flush(); });
  expect(texts()).toContain('New breed');
  expect(texts()).not.toContain('Old breed');
});

it('cancels the pending request on unmount', async () => {
  const pending = deferred<PetDetail>();
  jest.mocked(getShelterPetDetail).mockReturnValueOnce(pending.promise);
  await mount();
  const signal = jest.mocked(getShelterPetDetail).mock.calls[0][2]!;
  await act(async () => { tree!.unmount(); }); tree = undefined;
  expect(signal.aborted).toBe(true);
  await act(async () => { pending.resolve(detail()); await flush(); });
});

it('shows the server pet name separately from its breed and falls back to the selected list name', async () => {
  const pending = deferred<PetDetail>();
  jest.mocked(getShelterPetDetail).mockReturnValueOnce(pending.promise);
  await mount();
  expect(texts()).toContain('List Happy');
  expect(texts()).toContain('List breed');
  await act(async () => { pending.resolve({ ...detail(), name: ' Real Happy ' }); await flush(); });
  expect(texts()).toContain('Real Happy');
  expect(texts()).toContain('Real breed');
  expect(texts()).not.toContain('List Happy');
});

it.each([['AVAILABLE', '입양 가능'], ['PENDING', '입양 진행 중'], ['ADOPTED', '입양 완료']])
('shows %s as %s in the detail', async (status, expected) => {
  jest.mocked(getShelterPetDetail).mockResolvedValue({ ...detail(), adoption_status: status });
  await mount();
  expect(texts()).toContain(expected);
  expect(texts()).not.toContain(status);
});

it('retries the same detail and removes the retry button while loading and after success', async () => {
  const pending = deferred<PetDetail>();
  jest.mocked(getShelterPetDetail).mockRejectedValueOnce(new Error('Temporary failure'))
    .mockReturnValueOnce(pending.promise);
  await mount();
  expect(texts()).toContain('다시 시도');
  const retry = tree!.root.findAllByType(TouchableOpacity).find(node =>
    node.findAllByType(Text).some(label => label.props.children === '다시 시도'))!;
  expect(retry.props.accessibilityRole).toBe('button');
  await act(async () => { retry.props.onPress(); retry.props.onPress(); await flush(); });
  expect(getShelterPetDetail).toHaveBeenCalledTimes(2);
  expect(getShelterPetDetail).toHaveBeenLastCalledWith(7, 21, expect.any(AbortSignal));
  expect(texts()).toContain('동물 정보를 불러오는 중...');
  expect(texts()).not.toContain('다시 시도');
  await act(async () => { pending.resolve({ ...detail(), adoption_status: 'AVAILABLE' }); await flush(); });
  expect(texts()).toContain('Happy');
  expect(texts()).toContain('입양 가능');
  expect(texts()).not.toContain('Temporary failure');
  expect(texts()).not.toContain('다시 시도');
});
