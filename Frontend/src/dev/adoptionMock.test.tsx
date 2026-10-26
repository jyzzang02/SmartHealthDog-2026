import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Image, Text, TouchableOpacity } from 'react-native';
import { getAdoptionMock, ADOPTION_MOCK } from './adoptionMock';
import AdoptScreen from '../screens/AdoptScreen';
import AnimalDetailScreen from '../screens/AnimalDetailScreen';
import CustomButton from '../components/CustomButton';
import { searchAllShelters, getAllShelterPets, getShelterPetDetail } from '../api/shelters';
import type { RootStackParamList } from '../../App';

const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), addListener: jest.fn(() => jest.fn()) };
let mockAnimalData: RootStackParamList['AnimalDetail']['animalData'];
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => mockNavigation,
  useRoute: () => ({ params: { animalData: mockAnimalData } }),
  useFocusEffect: (callback: () => void) => jest.requireActual<typeof React>('react').useEffect(callback, [callback]),
}));
jest.mock('../components/Header', () => 'Header');
jest.mock('../components/ShelterNearbyMap', () => 'ShelterNearbyMap');
jest.mock('../hooks/useNearbyShelters', () => ({ useNearbyShelters: () => ({
  center: null, shelters: [], loading: false, error: null, retry: jest.fn(),
}) }));
jest.mock('../api/shelters', () => ({ searchAllShelters: jest.fn(), getAllShelterPets: jest.fn(),
  getShelterPetDetail: jest.fn(), getShelterDetail: jest.fn() }));
const devGlobal = globalThis as typeof globalThis & { __DEV__: boolean };
const trees: renderer.ReactTestRenderer[] = [];
const flush = async () => { for (let i = 0; i < 15; i++) await Promise.resolve(); };
const texts = (tree: renderer.ReactTestRenderer) => tree.root.findAllByType(Text)
  .map(node => [node.props.children].flat().join(''));
beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Image, 'resolveAssetSource').mockReturnValue({
    uri: 'http://localhost:8081/assets/mock-animal.png', width: 100, height: 100, scale: 1,
  });
});
afterEach(async () => {
  await act(async () => { trees.splice(0).forEach(tree => tree.unmount()); });
  jest.restoreAllMocks();
});

it('provides three clearly marked local samples with no real contact or external image URL', () => {
  const mock = getAdoptionMock()!;
  const sources = mock.searchShelters({});
  expect(sources.items).toHaveLength(1);
  const id = sources.items[0].shelter_id;
  expect(sources.items[0].name).toContain('[목업]');
  expect(sources.items[0].phone_number).toBeUndefined();
  const pets = mock.getPets(id);
  expect(pets).toHaveLength(3);
  expect(new Set(pets.map(pet => pet.species))).toEqual(new Set(['dog', 'cat']));
  expect(pets.every(pet => pet.name.startsWith('[목업]'))).toBe(true);
  expect(pets.every(pet => pet.shelter_contact?.phone_number === undefined)).toBe(true);
  expect(pets.every(pet => pet.images?.[0]?.startsWith('http://localhost:8081/'))).toBe(true);
  const selected = mock.getPetDetail(id, pets[0].pet_id);
  expect(selected.name).toBe(pets[0].name);
  expect(selected.description).toContain('실제 입양 공고가 아닙니다.');
  selected.images!.push('changed');
  expect(mock.getPetDetail(id, pets[0].pet_id).images).toHaveLength(1);
});

it('respects region selections and rejects unknown IDs rather than falling back to the real API', () => {
  const mock = getAdoptionMock()!;
  expect(mock.searchShelters({ province: '경기도' }).items).toEqual([]);
  expect(mock.searchShelters({ province: '서울특별시', district: '마포구' }).items).toHaveLength(1);
  expect(() => mock.getPets(1)).toThrow();
  expect(() => mock.getPetDetail(9000001, 1)).toThrow();
  expect(searchAllShelters).not.toHaveBeenCalled();
  expect(getShelterPetDetail).not.toHaveBeenCalled();
});

it('renders preview list and detail in release mode without API calls', async () => {
  jest.replaceProperty(devGlobal, '__DEV__', false);
  let list!: renderer.ReactTestRenderer;
  await act(async () => { list = renderer.create(<AdoptScreen />); trees.push(list); await flush(); });
  const press = async (label: string) => {
    const button = list.root.findAllByType(TouchableOpacity).find(node => {
      const labels = node.findAllByType(Text);
      return labels.length === 1 && labels[0].props.children === label;
    })!;
    expect(button).toBeDefined();
    await act(async () => { button.props.onPress(); await flush(); });
  };
  await press('입양 홍보');
  expect(texts(list)).toContain('[목업] 해피');
  expect(texts(list)).toContain('[목업] 나비');
  await press('모두'); await press('고양이');
  expect(texts(list)).toContain('[목업] 나비');
  expect(texts(list)).not.toContain('[목업] 해피');
  const card = list.root.findAllByType(TouchableOpacity).find(node =>
    node.findAllByType(Text).some(label => label.props.children === '[목업] 나비'))!;
  await act(async () => { card.props.onPress(); });
  mockAnimalData = mockNavigation.navigate.mock.calls[0][1].animalData;
  let detail!: renderer.ReactTestRenderer;
  await act(async () => { detail = renderer.create(<AnimalDetailScreen />); trees.push(detail); await flush(); });
  expect(texts(detail)).toContain('[목업] 나비');
  expect(texts(detail)).toContain('입양 가능');
  expect(detail.root.findByType(CustomButton).props.disabled).toBe(true);
  expect(searchAllShelters).not.toHaveBeenCalled();
  expect(getAllShelterPets).not.toHaveBeenCalled();
  expect(getShelterPetDetail).not.toHaveBeenCalled();
});

it('restores the real list and detail API paths when the preview switch is off', async () => {
  jest.replaceProperty(devGlobal, '__DEV__', false);
  jest.replaceProperty(ADOPTION_MOCK, 'enabled', false);
  expect(getAdoptionMock()).toBeNull();
  expect(Image.resolveAssetSource).not.toHaveBeenCalled();
  jest.mocked(searchAllShelters).mockResolvedValue({ items: [
    { shelter_id: 7, name: 'Server shelter', address: 'Server address' },
  ], total: 1 });
  jest.mocked(getAllShelterPets).mockResolvedValue([
    { pet_id: 21, shelter_id: 7, name: 'Server pet', species: 'dog', breed: 'Server breed' },
  ]);
  jest.mocked(getShelterPetDetail).mockResolvedValue({
    pet_id: 21, shelter_id: 7, name: 'Server detail', species: 'dog', breed: 'Server breed',
  });
  let list!: renderer.ReactTestRenderer;
  await act(async () => { list = renderer.create(<AdoptScreen />); trees.push(list); await flush(); });
  const tab = list.root.findAllByType(TouchableOpacity).find(node => {
    const labels = node.findAllByType(Text);
    return labels.length === 1 && labels[0].props.children === '입양 홍보';
  })!;
  await act(async () => { tab.props.onPress(); await flush(); });
  expect(texts(list)).toContain('Server pet');
  expect(texts(list)).not.toContain('[목업] 해피');
  expect(searchAllShelters).toHaveBeenCalled();
  expect(getAllShelterPets).toHaveBeenCalledWith(7, expect.any(AbortSignal));
  const card = list.root.findAllByType(TouchableOpacity).find(node =>
    node.findAllByType(Text).some(label => label.props.children === 'Server pet'))!;
  await act(async () => { card.props.onPress(); });
  mockAnimalData = mockNavigation.navigate.mock.calls[0][1].animalData;
  let detail!: renderer.ReactTestRenderer;
  await act(async () => { detail = renderer.create(<AnimalDetailScreen />); trees.push(detail); await flush(); });
  expect(texts(detail)).toContain('Server detail');
  expect(getShelterPetDetail).toHaveBeenCalledWith(7, 21, expect.any(AbortSignal));
});
