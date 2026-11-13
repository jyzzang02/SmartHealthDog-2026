import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Text, TouchableOpacity } from 'react-native';
import PetHealthCard from './PetHealthCard';
import type { HealthSummary } from '../types/health';

jest.mock('@react-navigation/native', () => ({ useFocusEffect: () => {} }));
jest.mock('../api/pets', () => ({ getMyPets: jest.fn() }));

it('shows each pet health information and passes the selected pet', () => {
  const onPressPet = jest.fn();
  const pets = [{ id: 1, name: '하나', species: 'CAT', weightKg: 5 }, { id: 2, name: '멍멍이', species: 'DOG' }];
  const healthData = { 1: { checkupDate: '2026-11-10' } as HealthSummary };
  let tree!: renderer.ReactTestRenderer;
  act(() => { tree = renderer.create(<PetHealthCard pets={pets} healthData={healthData} onPressPet={onPressPet} />); });
  const labels = tree.root.findAllByType(Text).map(item => item.props.children);
  expect(labels).toContain('체중 5kg');
  expect(labels).toContain('최근 검진 11.10');
  expect(labels).toContain('체중 정보 없음');
  expect(labels).toContain('검진 정보 없음');
  const cards = tree.root.findAllByType(TouchableOpacity);
  act(() => cards[1].props.onPress());
  expect(onPressPet).toHaveBeenCalledWith(pets[1]);
  act(() => tree.unmount());
});

