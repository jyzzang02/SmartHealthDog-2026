import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Text, TouchableOpacity, Image } from 'react-native';
import AdoptScreen from './AdoptScreen';
import { searchAllShelters, getAllShelterPets, PetDetail } from '../api/shelters';

const mockNavigation = { navigate: jest.fn(), addListener: jest.fn(() => jest.fn()) };
let mockFocus: () => void;
jest.mock('../dev/adoptionMock', () => ({ getAdoptionMock: () => null }));
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => mockNavigation,
  useFocusEffect: (callback: () => void) => {
    mockFocus = callback;
    jest.requireActual<typeof React>('react').useEffect(callback, [callback]);
  },
}));
jest.mock('../components/Header', () => 'Header');
jest.mock('../components/ShelterNearbyMap', () => 'ShelterNearbyMap');
jest.mock('../hooks/useNearbyShelters', () => ({ useNearbyShelters: () => ({
  center: null, shelters: [], loading: false, error: null, retry: jest.fn(),
}) }));
jest.mock('../api/shelters', () => ({ searchAllShelters: jest.fn(),
  getAllShelterPets: jest.fn(), getShelterDetail: jest.fn() }));

const shelter = (id: number) => ({ shelter_id: id, name: `Shelter ${id}`, address: `Address ${id}`,
  phone_number: '02-123-4567' });
const pet = (shelterId: number, id = 21): PetDetail => ({ pet_id: id, shelter_id: shelterId,
  name: 'Happy', species: 'dog', breed: `Breed ${shelterId}`, age: '2y',
  adoption_status: 'AVAILABLE', is_neutered: null, images: [`https://example.test/${shelterId}.jpg`] });
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
};
let tree: renderer.ReactTestRenderer | undefined;
const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
const mount = async () => { await act(async () => { tree = renderer.create(<AdoptScreen />); await flush(); }); };
const texts = () => tree!.root.findAllByType(Text).map(node => [node.props.children].flat().join(''));
const press = async (label: string) => {
  const button = tree!.root.findAllByType(TouchableOpacity).find(node => {
    const labels = node.findAllByType(Text);
    return labels.length === 1 && [labels[0].props.children].flat().join('') === label;
  });
  expect(button).toBeDefined();
  await act(async () => { button!.props.onPress(); await flush(); });
};
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(searchAllShelters).mockReset().mockResolvedValue({ items: [shelter(7)], total: 1 });
  jest.mocked(getAllShelterPets).mockReset().mockResolvedValue([pet(7)]);
});
afterEach(async () => {
  if (tree) await act(async () => { tree!.unmount(); });
  tree = undefined;
});

it('fetches real pets on a direct visit without first running a shelter search', async () => {
  await mount();
  expect(searchAllShelters).not.toHaveBeenCalled();
  await press('입양 홍보');
  expect(searchAllShelters).toHaveBeenCalledWith({ province: undefined, district: undefined }, expect.any(AbortSignal));
  expect(getAllShelterPets).toHaveBeenCalledWith(7, expect.any(AbortSignal));
  expect(texts()).toContain('Breed 7');
  expect(texts()).not.toContain('입양 홍보 동물이 없어요.');
  expect(texts()).not.toContain('중성화 X');
  const card = tree!.root.findAllByType(TouchableOpacity).find(node =>
    node.findAllByType(Text).some(label => label.props.children === 'Breed 7'))!;
  expect(card.findByType(Image).props.source).toEqual({ uri: 'https://example.test/7.jpg' });
  await act(async () => { card.props.onPress(); });
  expect(mockNavigation.navigate).toHaveBeenCalledWith('AnimalDetail', { animalData: expect.objectContaining({
    id: 21, shelterId: 7, shelterName: 'Shelter 7', shelterPhone: '02-123-4567', shelterAddress: 'Address 7',
  }) });
});

it('shows actual empty results without requesting a made-up detail or injecting Happy', async () => {
  jest.mocked(getAllShelterPets).mockResolvedValue([]);
  await mount(); await press('입양 홍보');
  expect(texts()).toContain('입양 홍보 동물이 없어요.');
  expect(texts()).not.toContain('Breed 7');
  expect(mockNavigation.navigate).not.toHaveBeenCalled();
});

it('finishes with an empty list when no shelters exist', async () => {
  jest.mocked(searchAllShelters).mockResolvedValue({ items: [], total: 0 });
  await mount(); await press('입양 홍보');
  expect(getAllShelterPets).not.toHaveBeenCalled();
  expect(texts()).toContain('입양 홍보 동물이 없어요.');
});

it('uses selected administrative filters but not GPS or the previous shelter results', async () => {
  await mount(); await press('지역'); await press('경기도');
  await press('군/구'); await press('고양시');
  jest.mocked(searchAllShelters).mockResolvedValue({ items: [shelter(8)], total: 1 });
  jest.mocked(getAllShelterPets).mockResolvedValue([pet(8)]);
  await press('입양 홍보');
  expect(searchAllShelters).toHaveBeenLastCalledWith({ province: '경기도', district: '고양시' }, expect.any(AbortSignal));
  expect(getAllShelterPets).toHaveBeenCalledWith(8, expect.any(AbortSignal));
  expect(texts()).toContain('Breed 8');
});

it('filters dogs and cats without fetching again', async () => {
  jest.mocked(getAllShelterPets).mockResolvedValue([pet(7), { ...pet(7, 22), species: 'cat', breed: 'Cat breed' }]);
  await mount(); await press('입양 홍보');
  await press('모두'); await press('고양이');
  expect(texts()).toContain('Cat breed');
  expect(texts()).not.toContain('Breed 7');
  expect(getAllShelterPets).toHaveBeenCalledTimes(1);
});

it('contains a failed fetch and retries when the existing tab is pressed again', async () => {
  jest.mocked(getAllShelterPets).mockRejectedValueOnce(new Error('Server unavailable'));
  await mount(); await press('입양 홍보');
  expect(texts()).toContain('Server unavailable');
  expect(texts()).not.toContain('입양 홍보 동물이 없어요.');
  await press('입양 홍보');
  expect(texts()).toContain('Breed 7');
  expect(texts()).not.toContain('Server unavailable');
});

it('refreshes on focus so newly returned server pets become visible', async () => {
  jest.mocked(getAllShelterPets).mockResolvedValueOnce([]).mockResolvedValueOnce([pet(7)]);
  await mount(); await press('입양 홍보');
  expect(texts()).toContain('입양 홍보 동물이 없어요.');
  await act(async () => { mockFocus(); await flush(); });
  expect(texts()).toContain('Breed 7');
  expect(getAllShelterPets).toHaveBeenCalledTimes(2);
});

it('ignores and aborts an older request after leaving and reopening the tab', async () => {
  const pending = deferred<PetDetail[]>();
  jest.mocked(getAllShelterPets).mockReturnValueOnce(pending.promise).mockResolvedValueOnce([pet(8)]);
  await mount(); await press('입양 홍보');
  const signal = jest.mocked(getAllShelterPets).mock.calls[0][1]!;
  expect(texts()).toContain('입양 동물 정보를 불러오는 중...');
  await press('보호소 소개');
  expect(signal.aborted).toBe(true);
  await press('입양 홍보');
  await act(async () => { pending.resolve([pet(7)]); await flush(); });
  expect(texts()).toContain('Breed 8');
  expect(texts()).not.toContain('Breed 7');
});

it('limits concurrent shelter requests and preserves shelter order with colliding pet IDs', async () => {
  const pending = Array.from({ length: 6 }, () => deferred<PetDetail[]>());
  jest.mocked(searchAllShelters).mockResolvedValue({ items: pending.map((_, i) => shelter(i + 1)), total: 6 });
  jest.mocked(getAllShelterPets).mockImplementation(id => pending[id - 1].promise);
  await mount(); await press('입양 홍보');
  expect(getAllShelterPets).toHaveBeenCalledTimes(4);
  await act(async () => { pending[2].resolve([pet(3)]); await flush(); });
  expect(getAllShelterPets).toHaveBeenCalledTimes(5);
  await act(async () => { pending[0].resolve([pet(1)]); await flush(); });
  expect(getAllShelterPets).toHaveBeenCalledTimes(6);
  await act(async () => { pending.forEach((request, i) => request.resolve([pet(i + 1)])); await flush(); });
  expect(texts().filter(text => text.startsWith('Breed '))).toEqual([1, 2, 3, 4, 5, 6].map(id => `Breed ${id}`));
});

it('does not present a partial list as successful when another shelter fails', async () => {
  jest.mocked(searchAllShelters).mockResolvedValue({ items: [shelter(7), shelter(8)], total: 2 });
  jest.mocked(getAllShelterPets).mockResolvedValueOnce([pet(7)]).mockRejectedValueOnce(new Error('Incomplete'));
  await mount(); await press('입양 홍보');
  expect(texts()).toContain('Incomplete');
  expect(texts()).not.toContain('Breed 7');
  expect(jest.mocked(getAllShelterPets).mock.calls.every(([, signal]) => signal?.aborted)).toBe(true);
});

it('aborts source loading on unmount and does not launch child requests afterward', async () => {
  const pending = deferred<{ items: ReturnType<typeof shelter>[]; total: number }>();
  jest.mocked(searchAllShelters).mockReturnValueOnce(pending.promise);
  await mount(); await press('입양 홍보');
  const signal = jest.mocked(searchAllShelters).mock.calls[0][1]!;
  await act(async () => { tree!.unmount(); }); tree = undefined;
  expect(signal.aborted).toBe(true);
  await act(async () => { pending.resolve({ items: [shelter(7)], total: 1 }); await flush(); });
  expect(getAllShelterPets).not.toHaveBeenCalled();
});

it('shows real pet names and shelter information instead of a blank rescue location', async () => {
  const name = '이름이 길어도 카드 안에서 확인할 수 있는 동물';
  const shelterName = '지역 이름이 포함된 긴 동물보호센터';
  jest.mocked(searchAllShelters).mockResolvedValue({ items: [{ ...shelter(7), name: shelterName }], total: 1 });
  jest.mocked(getAllShelterPets).mockResolvedValue([{ ...pet(7), name: ` ${name} ` }]);
  await mount(); await press('입양 홍보');
  expect(texts()).toContain(name);
  expect(texts()).toContain('보호소');
  expect(texts()).toContain(shelterName);
  expect(texts()).not.toContain('구조장소');
  expect(texts()).not.toContain('다시 시도');
  const card = tree!.root.findAllByType(TouchableOpacity).find(node =>
    node.findAllByType(Text).some(label => label.props.children === name))!;
  await act(async () => { card.props.onPress(); });
  expect(mockNavigation.navigate).toHaveBeenCalledWith('AnimalDetail', {
    animalData: expect.objectContaining({ name, shelterName }),
  });
});

it('uses the existing missing-name fallback and real address when the shelter has no name', async () => {
  jest.mocked(searchAllShelters).mockResolvedValue({ items: [{ ...shelter(7), name: ' ' }], total: 1 });
  jest.mocked(getAllShelterPets).mockResolvedValue([{ ...pet(7), name: ' ' }]);
  await mount(); await press('입양 홍보');
  expect(texts()).toContain('이름 없음');
  expect(texts()).toContain('Address 7');
});

it.each([['AVAILABLE', '입양 가능'], ['PENDING', '입양 진행 중'], ['ADOPTED', '입양 완료']])
('shows %s as %s in the list', async (status, expected) => {
  jest.mocked(getAllShelterPets).mockResolvedValue([{ ...pet(7), adoption_status: status }]);
  await mount(); await press('입양 홍보');
  expect(texts()).toContain(expected);
  expect(texts()).not.toContain(status);
});

it('retries a list error with the dedicated button and hides it during loading and after recovery', async () => {
  const pending = deferred<PetDetail[]>();
  jest.mocked(getAllShelterPets).mockRejectedValueOnce(new Error('Temporary failure'))
    .mockReturnValueOnce(pending.promise);
  await mount(); await press('입양 홍보');
  expect(texts()).toContain('다시 시도');
  const retry = tree!.root.findAllByType(TouchableOpacity).find(node =>
    node.findAllByType(Text).some(label => label.props.children === '다시 시도'))!;
  expect(retry.props.accessibilityRole).toBe('button');
  await act(async () => { retry.props.onPress(); retry.props.onPress(); await flush(); });
  expect(getAllShelterPets).toHaveBeenCalledTimes(2);
  expect(texts()).toContain('입양 동물 정보를 불러오는 중...');
  expect(texts()).not.toContain('다시 시도');
  await act(async () => { pending.resolve([pet(7)]); await flush(); });
  expect(texts()).toContain('Happy');
  expect(texts()).not.toContain('Temporary failure');
  expect(texts()).not.toContain('다시 시도');
});
