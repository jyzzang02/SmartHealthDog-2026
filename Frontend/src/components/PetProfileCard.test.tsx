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

