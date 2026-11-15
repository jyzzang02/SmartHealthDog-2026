import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import { getRespirationRecord, listRespirationRecords, type RespirationRecord } from '../api/respiration';
import RespirationResultScreen from './RespirationResultScreen';

jest.mock('@react-navigation/native', () => ({ useIsFocused: () => true }));
jest.mock('../api/respiration', () => ({ getRespirationRecord: jest.fn(), listRespirationRecords: jest.fn() }));

const getRecord = jest.mocked(getRespirationRecord);
const listRecords = jest.mocked(listRespirationRecords);
const record: RespirationRecord = {
  videoId: 'test-video', petId: 1, durationSec: 60, fileSizeBytes: 100,
  status: 'COMPLETED', respiratoryRate: 24, failureReason: null, createdAt: '', uploadedAt: null, completedAt: null,
};
let tree: renderer.ReactTestRenderer;
const push = jest.fn();

const mount = async (videoId?: string) => {
  const props = {
    route: { key: 'result', name: 'RespirationResult', params: { petId: 1, petName: '멍멍이', videoId } },
    navigation: { goBack: jest.fn(), push },
  } as unknown as React.ComponentProps<typeof RespirationResultScreen>;
  await act(async () => { tree = renderer.create(<RespirationResultScreen {...props} />); });
};
const texts = () => tree.root.findAllByType(Text).map(node => node.props.children);
const tick = async () => {
  await act(async () => { await jest.advanceTimersByTimeAsync(5000); });
};

beforeEach(() => {
  jest.resetAllMocks();
  jest.useFakeTimers();
});

afterEach(() => {
  act(() => tree?.unmount());
  jest.useRealTimers();
});

it('automatically checks pending and processing results and stops once complete', async () => {
  getRecord.mockResolvedValueOnce({ ...record, status: 'PENDING' })
    .mockResolvedValueOnce({ ...record, status: 'PROCESSING' })
    .mockResolvedValueOnce(record);
  await mount(record.videoId);
  expect(texts()).toContain('영상이 등록되었어요. 아직 분석 대기 중이에요.');
  expect(texts()).not.toContain('회/분');
  await tick();
  expect(texts()).toContain('수면 영상을 분석하고 있어요.');
  expect(texts()).not.toContain('회/분');
  await tick();
  expect(texts()).toContain('회/분');
  expect(texts().some(value => Array.isArray(value) && value.includes(24))).toBe(true);
  await tick();
  expect(getRecord).toHaveBeenCalledTimes(3);
});

it('stops automatically checking a long-running analysis and allows manual refresh', async () => {
  getRecord.mockResolvedValue({ ...record, status: 'PROCESSING', respiratoryRate: null });
  await mount(record.videoId);
  await act(async () => { await jest.advanceTimersByTimeAsync(120_000); });
  const count = getRecord.mock.calls.length;
  expect(count).toBeGreaterThan(1);
  await tick();
  expect(getRecord).toHaveBeenCalledTimes(count);
  getRecord.mockResolvedValueOnce(record);
  const refresh = tree.root.findAll(node => typeof node.props.onPress === 'function' && node.props.children?.props?.children === '다시 확인')[0];
  await act(async () => { refresh.props.onPress(); });
  expect(texts()).toContain('회/분');
});

it('cancels an in-flight poll at the deadline without losing the last known status', async () => {
  getRecord.mockResolvedValueOnce({ ...record, status: 'PROCESSING', respiratoryRate: null });
  getRecord.mockImplementationOnce(() => new Promise(() => {}));
  await mount(record.videoId);
  await tick();

  const signal = getRecord.mock.calls[1][2];
  expect(signal?.aborted).toBe(false);
  await act(async () => { await jest.advanceTimersByTimeAsync(115_000); });
  expect(signal?.aborted).toBe(true);
  expect(getRecord).toHaveBeenCalledTimes(2);
  expect(texts()).toContain('수면 영상을 분석하고 있어요.');
});

it('aborts the request scope and cancels the next poll on unmount', async () => {
  getRecord.mockResolvedValue({ ...record, status: 'PENDING', respiratoryRate: null });
  await mount(record.videoId);
  act(() => tree.unmount());
  expect(getRecord.mock.calls[0][2]?.aborted).toBe(true);
  await tick();
  expect(getRecord).toHaveBeenCalledTimes(1);
});

it('shows failed results without internal error codes or a zero rate', async () => {
  getRecord.mockResolvedValue({ ...record, status: 'FAILED', respiratoryRate: null, failureReason: 'INFERENCE_ERROR' });
  await mount(record.videoId);
  expect(texts()).toContain('영상을 분석하지 못했어요.');
  expect(texts()).not.toContain('INFERENCE_ERROR');
  expect(texts()).not.toContain('회/분');
  await tick();
  expect(getRecord).toHaveBeenCalledTimes(1);
});

it('shows previous results for the selected pet even if the latest upload is pending', async () => {
  listRecords.mockResolvedValue([
    { ...record, videoId: 'latest', status: 'PENDING', respiratoryRate: null, uploadedAt: '2026-11-15T09:48:39Z' },
    record,
    { ...record, petId: 2, videoId: 'other-pet', respiratoryRate: 99 },
  ]);
  await mount();
  expect(texts()).toContain('24회/분');
  expect(texts()).not.toContain('99회/분');
  const row = tree.root.findAll(node => typeof node.props.onPress === 'function' &&
    node.findAllByType(Text).some(text => text.props.children === '24회/분'))[0];
  act(() => row.props.onPress());
  expect(push).toHaveBeenCalledWith('RespirationResult', { petId: 1, petName: '멍멍이', videoId: record.videoId });
  await tick();
  expect(listRecords).toHaveBeenCalledTimes(1);
  expect(getRecord).not.toHaveBeenCalled();
});
