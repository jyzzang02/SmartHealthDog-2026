import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { TouchableOpacity, Text } from 'react-native';
import SelfCheckScreen from './SelfCheckScreen';
import { SELF_CHECK, STAGES } from '../data/selfCheck';
import { getMyPets } from '../api/pets';
import { shouldShowSelfCheckPreview } from '../storage/selfCheckPreviewStorage';
import AsyncStorage from '@react-native-async-storage/async-storage';
let mockSpecies = 'DOG';
let mockParams: { preview: true } | { petId: number; recordId: number } | undefined;
import { createSelfCheck, getSelfCheck } from '../api/selfCheck';
import type { SelfCheckRecord } from '../api/selfCheck';
const mockNavigation = { goBack: jest.fn(), navigate: jest.fn(), push: jest.fn(), reset: jest.fn() };
jest.mock('@react-navigation/native', () => ({ useNavigation: () => mockNavigation, useRoute: () => ({ params: mockParams }) }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: 'SafeAreaView' }));
jest.mock('../api/pets', () => ({ getMyPets: jest.fn(async () => [{ id: 8, species: null }, { id: 9, species: 123 }, { id: 7, name: '하나', species: mockSpecies }]) }));
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

const findButton = (tree: renderer.ReactTestRenderer, label: string) =>
  tree.root.findAllByType(TouchableOpacity).find(button =>
    button.findAllByType(Text).some(text => text.props.children === label));

it('opens history for the pet selected in the header', async () => {
  jest.clearAllMocks();
  jest.mocked(getMyPets).mockResolvedValueOnce([
    { id: 7, name: '하나', species: 'DOG' },
    { id: 8, name: '멍멍이', species: 'CAT' },
  ]);
  let tree!: renderer.ReactTestRenderer;
  await act(async () => { tree = renderer.create(<SelfCheckScreen />); });
  expect(findButton(tree, '멍멍이')).toBeUndefined();
  act(() => findButton(tree, '하나')!.props.onPress());
  act(() => findButton(tree, '멍멍이')!.props.onPress());
  expect(findButton(tree, '하나')).toBeUndefined();
  act(() => findButton(tree, '과거 자가진단 기록')!.props.onPress());
  expect(mockNavigation.navigate).toHaveBeenCalledWith('SelfCheckHistory', { petId: 8, petName: '멍멍이' });
  act(() => tree.unmount());
});

it('does not show the history button while viewing a past result', async () => {
  mockParams = { petId: 7, recordId: 9 };
  jest.mocked(getSelfCheck).mockResolvedValueOnce({
    id: 9, petId: 7, species: 'dog', scoringVersion: 'v1', overallStage: 2, createdAt: '2026-11-03T00:00:00Z', areas: [],
  });
  let tree!: renderer.ReactTestRenderer;
  try {
    await act(async () => { tree = renderer.create(<SelfCheckScreen />); });
    expect(tree.root.findAllByType(Text).some(text => text.props.children === STAGES[2].label)).toBe(true);
    expect(findButton(tree, '과거 자가진단 기록')).toBeUndefined();
  } finally {
    if (tree) act(() => tree.unmount());
    mockParams = undefined;
  }
});

describe('signup preview', () => {
  let tree: renderer.ReactTestRenderer;
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
    mockParams = { preview: true };
    await act(async () => { tree = renderer.create(<SelfCheckScreen />); });
  });
  afterEach(() => {
    act(() => tree.unmount());
    mockParams = undefined;
  });

  it('skips to login without making any diagnosis requests', async () => {
    expect(findButton(tree, '체험 시작')).toBeDefined();
    expect(findButton(tree, '없음')).toBeUndefined();
    await act(async () => { await findButton(tree, '건너뛰기')!.props.onPress(); });
    expect(mockNavigation.reset).toHaveBeenCalledWith({ index: 0, routes: [{ name: 'Login' }] });
    expect(await shouldShowSelfCheckPreview()).toBe(false);
    expect(getMyPets).not.toHaveBeenCalled();
    expect(getSelfCheck).not.toHaveBeenCalled();
    expect(createSelfCheck).not.toHaveBeenCalled();
  });

  it('calculates the cat result locally and preserves the highest urgent stage', async () => {
    act(() => findButton(tree, '체험 시작')!.props.onPress());
    expect(findButton(tree, '체험 시작')).toBeUndefined();
    expect(findButton(tree, '고양이')).toBeUndefined();
    act(() => findButton(tree, '강아지')!.props.onPress());
    act(() => findButton(tree, '고양이')!.props.onPress());
    expect(findButton(tree, '강아지')).toBeUndefined();
    for (const [step, area] of SELF_CHECK.cat.entries()) {
      const answers = tree.root.findAllByType(TouchableOpacity).filter(button =>
        button.findAllByType(Text).some(text => text.props.children === '없음'));
      expect(answers).toHaveLength(area.questions.length);
      act(() => answers.forEach(button => button.props.onPress()));
      if (step === 0) {
        const urgentIndex = area.questions.findIndex(question => question.weight === 'urgent');
        const mild = tree.root.findAllByType(TouchableOpacity).filter(button =>
          button.findAllByType(Text).some(text => text.props.children === '가끔 / 약함'));
        act(() => mild[urgentIndex].props.onPress());
      }
      const label = step === 4 ? '결과 확인하기' : '다음 · ' + SELF_CHECK.cat[step + 1].title;
      await act(async () => { await findButton(tree, label)!.props.onPress(); });
    }
    expect(tree.root.findAllByType(Text).some(text => text.props.children === STAGES[4].label)).toBe(true);
    expect(getMyPets).not.toHaveBeenCalled();
    expect(getSelfCheck).not.toHaveBeenCalled();
    expect(createSelfCheck).not.toHaveBeenCalled();
    await act(async () => { await findButton(tree, '로그인·회원가입')!.props.onPress(); });
    expect(mockNavigation.reset).toHaveBeenCalledWith({ index: 0, routes: [{ name: 'Login' }] });
  });
});
