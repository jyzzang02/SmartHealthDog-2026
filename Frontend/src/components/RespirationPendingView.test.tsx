import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Text, TouchableOpacity } from 'react-native';
import { RespirationPendingView } from './DiagnosisAnalysisProgress';

it('shows registration and pending status without claiming analysis is running', () => {
  const onConfirm = jest.fn();
  let tree!: renderer.ReactTestRenderer;
  act(() => { tree = renderer.create(<RespirationPendingView onConfirm={onConfirm} />); });
  const texts = tree.root.findAllByType(Text).map(node => node.props.children);
  expect(texts).toContain('영상 등록 완료');
  expect(texts).toContain('2. 분석 대기');
  expect(texts).toContain('수면 영상이 등록되었습니다.');
  expect(texts).not.toContain('AI 분석 중');
  act(() => tree.root.findByType(TouchableOpacity).props.onPress());
  expect(onConfirm).toHaveBeenCalledTimes(1);
  act(() => tree.unmount());
});

