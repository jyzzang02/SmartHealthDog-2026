import React from 'react';
import renderer, { act } from 'react-test-renderer';
import AdoptScreen from './AdoptScreen';
import HealthScreen from './HealthScreen';
import MyPageScreen from './MyPageScreen';
import { getMyPets } from '../api/pets';

type TabEvent = { defaultPrevented: boolean };
const mockListeners = new Map<string, (event: TabEvent) => void>();
const mockFrames = new Map<number, (timestamp: number) => void>();
const mockScrollTo = jest.fn();
let mockFocused = false;
const mockNavigation = {
  navigate: jest.fn(), isFocused: () => mockFocused,
  addListener: jest.fn((event: string, callback: (value: TabEvent) => void) => {
    mockListeners.set(event, callback);
    return () => { mockListeners.delete(event); };
  }),
};
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => mockNavigation,
  useFocusEffect: jest.fn(),
}));
jest.mock('react-native/Libraries/Components/ScrollView/ScrollView', () => {
  const ReactModule = jest.requireActual<typeof React>('react');
  return { __esModule: true, default: ReactModule.forwardRef((props: { horizontal?: boolean }, ref) => {
    ReactModule.useImperativeHandle(ref, () => ({ scrollTo: (options: unknown) =>
      mockScrollTo(options, Boolean(props.horizontal)) }));
    return ReactModule.createElement('ScrollView', props);
  }) };
});
jest.mock('../components/Header', () => 'Header');
jest.mock('../components/PetProfileCard', () => 'PetProfileCard');
jest.mock('../components/PetQnaEntryCard', () => 'PetQnaEntryCard');
jest.mock('../components/DiagnosisCard', () => 'DiagnosisCard');
jest.mock('../components/HospitalSearchMap', () => 'HospitalSearchMap');
jest.mock('../components/HospitalSearchControls', () => 'HospitalSearchControls');
jest.mock('../components/HospitalSearchResults', () => 'HospitalSearchResults');
jest.mock('../components/ShelterNearbyMap', () => 'ShelterNearbyMap');
jest.mock('../hooks/useNearbyShelters', () => ({ useNearbyShelters: () => ({
  center: null, shelters: [], loading: false, error: null, retry: jest.fn(),
}) }));
jest.mock('../hooks/useHospitalSearch', () => ({ useHospitalSearch: () => ({
  result: null, filters: {}, loading: false, error: null,
  search: jest.fn(), retry: jest.fn(), goToPage: jest.fn(),
}) }));
jest.mock('../api/pets', () => ({ getMyPets: jest.fn(async () => []) }));
jest.mock('../api/users', () => ({ getMyProfile: jest.fn(async () => ({ nickname: 'User' })) }));
jest.mock('../api/shelters', () => ({ searchAllShelters: jest.fn(), getShelterDetail: jest.fn(), getShelterPets: jest.fn() }));
jest.mock('../storage/tokenStorage', () => ({ getStoredAccessToken: jest.fn(async () => null) }));
jest.mock('../store/healthStore', () => ({ healthStore: { getAll: () => ({}) } }));

let tree: renderer.ReactTestRenderer | undefined;
let frameId = 0;
const frames = () => act(() => {
  const pending = [...mockFrames.values()]; mockFrames.clear();
  pending.forEach(callback => callback(0));
});
const tabPress = (event: TabEvent = { defaultPrevented: false }) => act(() => {
  mockListeners.get('tabPress')!(event);
});
beforeEach(() => {
  jest.clearAllMocks(); mockListeners.clear(); mockFrames.clear(); mockFocused = false;
  jest.spyOn(globalThis, 'requestAnimationFrame').mockImplementation(callback => {
    const id = ++frameId; mockFrames.set(id, callback); return id;
  });
  jest.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(id => { mockFrames.delete(id); });
});
afterEach(() => {
  if (tree) act(() => tree!.unmount());
  tree = undefined; jest.restoreAllMocks();
});

describe.each<[string, React.ComponentType]>([
  ['adoption', AdoptScreen], ['health', HealthScreen], ['my page', MyPageScreen],
])('%s tab vertical scroll', (_name, Screen) => {
  const mount = async () => { await act(async () => { tree = renderer.create(<Screen />); }); };
  it('resets on entry from another tab and on repeated presses without remounting or fetching again', async () => {
    await mount();
    const initialScreen = tree!.root.findByType(Screen);
    const requests = jest.mocked(getMyPets).mock.calls.length;
    tabPress(); mockFocused = true; frames();
    expect(mockScrollTo).toHaveBeenCalledWith({ y: 0, animated: false }, false);
    tabPress(); frames();
    expect(mockScrollTo).toHaveBeenCalledTimes(2);
    expect(tree!.root.findByType(Screen)).toBe(initialScreen);
    expect(getMyPets).toHaveBeenCalledTimes(requests);
  });
  it('does not reset just because a detail screen returns focus', async () => {
    await mount();
    act(() => { mockListeners.get('focus')?.({ defaultPrevented: false }); });
    frames();
    expect(mockScrollTo).not.toHaveBeenCalled();
  });
  it('honors preventDefault from another tab listener', async () => {
    await mount();
    const event = { defaultPrevented: false };
    tabPress(event); event.defaultPrevented = true; frames();
    expect(mockScrollTo).not.toHaveBeenCalled();
  });
  it('coalesces rapid presses to one pending scroll reset', async () => {
    await mount();
    tabPress(); tabPress(); tabPress();
    expect(mockFrames.size).toBe(1);
    frames();
    expect(mockScrollTo).toHaveBeenCalledTimes(1);
  });
  it('removes the tab listener and queued frame on unmount', async () => {
    await mount(); tabPress();
    act(() => tree!.unmount()); tree = undefined;
    expect(mockListeners.has('tabPress')).toBe(false);
    expect(mockFrames.size).toBe(0);
    frames();
    expect(mockScrollTo).not.toHaveBeenCalled();
  });
});
