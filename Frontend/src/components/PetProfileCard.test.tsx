import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Text, TouchableOpacity } from 'react-native';
import PetProfileCard from './PetProfileCard';

it('shows the health check button and opens the selected pet action', () => {
  const onPressHealthInput = jest.fn();
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(<PetProfileCard name="하나" type="고양이" gender="미상" birth="" condition="정보 없음" onPressHealthInput={onPressHealthInput} />);
  });
  const button = tree.root.findAllByType(TouchableOpacity).find(item =>
    item.findAllByType(Text).some(text => text.props.children === '검진 정보 입력'));
  expect(button).toBeDefined();
  act(() => button!.props.onPress());
  expect(onPressHealthInput).toHaveBeenCalledTimes(1);
  act(() => tree.unmount());
});


it('shows all four categories even when no health records exist', () => {
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(<PetProfileCard name="하나" type="고양이" gender="미상" birth=""
      weightKg={5} checkupDate="2026.11.17 (화)" conditionRecords={[
        { label: '안구질환' }, { label: '소변키트' }, { label: '자가진단' }, { label: '수면호흡' },
      ]} />);
  });
  const texts = tree.root.findAllByType(Text).map(node => node.props.children);
  expect(texts).toEqual(expect.arrayContaining(['최근 검진일', '체중 5kg', '2026.11.17 (화)']));
  expect(texts).toContain('건강상태');
  expect(texts.filter(text => text === '기록 없음')).toHaveLength(4);
  expect(texts).toEqual(expect.arrayContaining(['안구질환', '소변키트', '자가진단', '수면호흡']));
  act(() => tree.unmount());
});

it('keeps recent checkup visible without records and retains the health stage and both actions', () => {
  let tree!: renderer.ReactTestRenderer;
  const onPressHistory = jest.fn();
  const onPressHealthInput = jest.fn();
  act(() => {
    tree = renderer.create(<PetProfileCard name="하나" type="고양이" gender="남" birth="2019-09-15"
      weightKg={5} conditionRecords={[
        { label: '안구질환', date: '2026.11.16 (월)' },
        { label: '소변키트' },
        { label: '자가진단', date: '2026.11.13 (금)', stage: 1 },
        { label: '수면호흡', date: '2026.11.11 (수)' },
      ]} onPressHistory={onPressHistory} onPressHealthInput={onPressHealthInput} />);
  });
  const texts = tree.root.findAllByType(Text).map(node => node.props.children);
  expect(texts).toEqual(expect.arrayContaining(['기록 없음', '안구질환', '소변키트', '자가진단', '1단계 · 현재 뚜렷한 이상 없음']));
  expect(texts.filter(text => text === '기록 없음')).toHaveLength(2);
  const buttons = tree.root.findAllByType(TouchableOpacity);
  act(() => buttons.forEach(button => button.props.onPress()));
  expect(onPressHistory).toHaveBeenCalledTimes(1);
  expect(onPressHealthInput).toHaveBeenCalledTimes(1);
  act(() => tree.unmount());
});

it.each([
  ['2019-11-18', '· 남 · 6살'],
  ['2019-11-17', '· 남 · 7살'],
  ['2025-11-17', '· 남 · 1살'],
  ['2025-11-18', '· 남 · 11개월'],
  ['2026-05-09', '· 남 · 6개월'],
  ['2026-10-18', '· 남 · 1개월 미만'],
  ['2026-11-18', '· 남'],
  ['2019-02-30', '· 남'],
])('keeps gender and birthday-adjusted age separate from a long breed name (%s)', (birth, details) => {
  const breed = '아주 긴 페르시안 친칠라 품종 이름';
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-11-16T16:00:00Z'));
  let tree!: renderer.ReactTestRenderer;
  try {
    act(() => { tree = renderer.create(<PetProfileCard name="하나" type={breed} gender="남" birth={birth} />); });
    const texts = tree.root.findAllByType(Text);
    expect(texts.find(node => node.props.children === breed)?.props.numberOfLines).toBe(1);
    expect(texts.map(node => node.props.children)).toContain(details);
    expect(texts.map(node => node.props.children)).not.toContain(birth);
  } finally {
    act(() => tree?.unmount());
    jest.useRealTimers();
  }
});
