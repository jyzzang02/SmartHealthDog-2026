import React from 'react';
import renderer, { act } from 'react-test-renderer';
import MyPageScreen from './MyPageScreen';
import PetProfileCard from '../components/PetProfileCard';
import { getMyPets, getPetDetail, PetListItem } from '../api/pets';

const mockFocus = jest.fn((callback: () => void | (() => void)) => {
  const { useEffect } = jest.requireActual('react');
  useEffect(callback, [callback]);
});
jest.mock('@react-navigation/native', () => ({ useNavigation: () => ({ navigate: jest.fn() }),
  useFocusEffect: (callback: () => void | (() => void)) => mockFocus(callback) }));
jest.mock('../components/Header', () => 'Header');
jest.mock('../components/PetProfileCard', () => 'PetProfileCard');
jest.mock('../api/pets', () => ({ getMyPets: jest.fn(), getPetDetail: jest.fn() }));
jest.mock('../api/users', () => ({ getMyProfile: jest.fn(async () => ({ nickname: 'User' })) }));
jest.mock('../storage/tokenStorage', () => ({ getStoredAccessToken: jest.fn(async () => null) }));
jest.mock('../store/healthStore', () => ({ healthStore: { getAll: () => ({}) } }));

const current: PetListItem = { id: 2, name: '하나', species: 'CAT', breed: '페르시안 친칠라',
  profilePicture: 'https://images.example.test/pets/current.jpg' };
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
};
let tree: renderer.ReactTestRenderer | undefined;
beforeEach(() => { jest.clearAllMocks(); jest.mocked(getMyPets).mockReset(); jest.mocked(getPetDetail).mockReset(); });
afterEach(() => { if (tree) act(() => tree!.unmount()); tree = undefined; });
const mount = async () => { await act(async () => { tree = renderer.create(<MyPageScreen />); await flush(); }); };
const focusAgain = async () => { await act(async () => { mockFocus.mock.calls[0][0](); await flush(); }); };

it('ignores an older profile list response after a newer focus refresh has loaded the new photo', async () => {
  const old = deferred<PetListItem[]>();
  jest.mocked(getMyPets).mockReturnValueOnce(old.promise).mockResolvedValueOnce([current]);
  await mount(); await focusAgain();
  expect(tree!.root.findByType(PetProfileCard).props.imageUrl).toBe(current.profilePicture);
  await act(async () => { old.resolve([{ ...current, name: 'Old name', profilePicture: undefined }]); await flush(); });
  expect(tree!.root.findByType(PetProfileCard).props.imageUrl).toBe(current.profilePicture);
  expect(tree!.root.findByType(PetProfileCard).props.name).toBe(current.name);
});

it('does not repeat the image enrichment already performed by the pets API', async () => {
  jest.mocked(getMyPets).mockResolvedValueOnce([{ ...current, profilePicture: undefined }]);
  await mount();
  expect(getPetDetail).not.toHaveBeenCalled();
  expect(tree!.root.findByType(PetProfileCard).props.imageUrl).toBeNull();
});
