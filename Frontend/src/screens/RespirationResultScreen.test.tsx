import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import { getRespirationRecord } from '../api/respiration';
import RespirationResultScreen from './RespirationResultScreen';

jest.mock('@react-navigation/native', () => ({ useIsFocused: () => true }));
jest.mock('../api/respiration', () => ({ getRespirationRecord: jest.fn(), listRespirationRecords: jest.fn() }));

it('shows a rate only after the selected video has completed analysis', async () => {
  const getRecord = jest.mocked(getRespirationRecord);
  const record = {
    videoId: 'test-video', petId: 1, durationSec: 60, fileSizeBytes: 100,
    respiratoryRate: 24, failureReason: null, createdAt: '', uploadedAt: null, completedAt: null,
  };
  getRecord.mockResolvedValueOnce({ ...record, status: 'PENDING' })
    .mockResolvedValueOnce({ ...record, status: 'COMPLETED' });
  const props = {
    route: { key: 'result', name: 'RespirationResult', params: { petId: 1, petName: '멍멍이', videoId: 'test-video' } },
    navigation: { goBack: jest.fn() },
  } as unknown as React.ComponentProps<typeof RespirationResultScreen>;
  let tree!: renderer.ReactTestRenderer;
  await act(async () => { tree = renderer.create(<RespirationResultScreen {...props} />); });
  const texts = () => tree.root.findAllByType(Text).map(node => node.props.children);
  expect(texts()).toContain('영상이 등록되었어요. 아직 분석 대기 중이에요.');
  expect(texts()).not.toContain('회/분');

  await act(async () => {
    const refresh = tree.root.findAll(node => typeof node.props.onPress === 'function' && node.props.children?.props?.children === '다시 확인')[0];
    refresh.props.onPress();
  });
  expect(texts()).toContain('회/분');
  expect(texts().some(value => Array.isArray(value) && value.includes(24))).toBe(true);
  expect(getRecord).toHaveBeenCalledTimes(2);
  expect(getRecord.mock.calls[0].slice(0, 2)).toEqual([1, 'test-video']);
  act(() => tree.unmount());
  expect(getRecord.mock.calls[1][2]?.aborted).toBe(true);
});
