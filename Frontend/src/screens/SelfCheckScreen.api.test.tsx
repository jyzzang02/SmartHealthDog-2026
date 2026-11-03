import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { TouchableOpacity, Text } from 'react-native';
import SelfCheckScreen from './SelfCheckScreen';
import { STAGES } from '../data/selfCheck';
let mockSpecies = 'DOG';
import { createSelfCheck } from '../api/selfCheck';
import type { SelfCheckRecord } from '../api/selfCheck';
const mockNavigation = { goBack: jest.fn(), navigate: jest.fn(), push: jest.fn(), reset: jest.fn() };
jest.mock('@react-navigation/native', () => ({ useNavigation: () => mockNavigation, useRoute: () => ({ params: undefined }) }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: 'SafeAreaView' }));
jest.mock('../api/pets', () => ({ getMyPets: async () => [{ id: 8, species: null }, { id: 9, species: 123 }, { id: 7, name: '하나', species: mockSpecies }] }));
jest.mock('../api/selfCheck', () => ({ createSelfCheck: jest.fn(), getSelfCheck: jest.fn() }));
it.each(['DOG', 'CAT'])('submits complete %s answers once and displays the server result', async (petSpecies) => {
  jest.clearAllMocks();
  mockSpecies = petSpecies;
  let tree!: renderer.ReactTestRenderer;
  let finish!: (value: SelfCheckRecord) => void;
  jest.mocked(createSelfCheck).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  await act(async () => { tree = renderer.create(<SelfCheckScreen />); });
  for (let step = 0; step < 5; step++) {
    const buttons = tree.root.findAllByType(TouchableOpacity).filter(button => button.findAllByType(Text).some(text => text.props.children === '없음'));
    act(() => buttons.forEach(button => button.props.onPress()));
    const next = tree.root.findAllByType(TouchableOpacity).find(button => button.findAllByType(Text).some(text => typeof text.props.children === 'string' && (/^다음 ·|^결과 확인하기/.test(text.props.children))));
    await act(async () => { next!.props.onPress(); if (step === 4) next!.props.onPress(); });
  }
  expect(createSelfCheck).toHaveBeenCalledTimes(1);
  const [petId, species, answers] = jest.mocked(createSelfCheck).mock.calls[0];
  expect(petId).toBe(7); expect(species).toBe(petSpecies.toLowerCase());
  expect(Object.values(answers).map(values => values.length)).toEqual(petSpecies === 'DOG' ? [7,7,9,7,6] : [7,8,10,8,9]);
  await act(async () => { finish({ id: 1, petId: 7, species: 'dog', scoringVersion: 'v1', overallStage: 2, createdAt: '2026-11-03T00:00:00Z', areas: [] }); });
  expect(tree.root.findAllByType(Text).some(text => text.props.children === STAGES[2].label)).toBe(true);
  const home = tree.root.findAllByType(TouchableOpacity).find(button => button.findAllByType(Text).some(text => text.props.children === '건강탭으로'));
  act(() => home!.props.onPress());
  expect(mockNavigation.reset).toHaveBeenCalledWith({ index: 0, routes: [{ name: 'Main', params: { screen: '건강' } }] });
  act(() => tree.unmount());
});
