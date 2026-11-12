import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { AppState } from 'react-native';
import type { AppStateStatus } from 'react-native';
import { useLatestWalkLightSample } from './useLatestWalkLightSample';
import type { LatestWalkLightSample, LatestWalkLightSampleSource } from './useLatestWalkLightSample';

jest.mock('react-native/Libraries/AppState/AppState', () => ({
  __esModule: true,
  default: { currentState: 'active', addEventListener: jest.fn() },
}));

const sample = (lux: number, seconds = 0): LatestWalkLightSample => ({
  lux, measured_at: new Date(Date.UTC(2026, 9, 7, 7, 0, seconds)).toISOString(),
});
const source: LatestWalkLightSampleSource = { getLatestLightSample: jest.fn() };
const read = jest.mocked(source.getLatestLightSample);
let tree: renderer.ReactTestRenderer | undefined;
let visibleLux: number | null;
let listeners: Set<(state: AppStateStatus) => void>;
const Probe = ({ walkId = 86, paused = false, available = true }) => {
  visibleLux = useLatestWalkLightSample(walkId, available ? source : undefined, paused);
  return null;
};
const flush = async () => { for (let i = 0; i < 4; i += 1) await Promise.resolve(); };
const mount = async () => {
  await act(async () => { tree = renderer.create(<Probe />); await flush(); });
};
const advance = async (ms = 5_000) => {
  await act(async () => { jest.advanceTimersByTime(ms); await flush(); });
};
const changeState = async (state: AppStateStatus) => {
  await act(async () => { listeners.forEach((listener) => listener(state)); await flush(); });
};

beforeEach(() => {
  jest.useFakeTimers();
  read.mockReset().mockResolvedValue(null);
  visibleLux = null;
  listeners = new Set();
  jest.replaceProperty(AppState, 'currentState', 'active');
  jest.spyOn(globalThis, 'setInterval');
  jest.spyOn(globalThis, 'clearInterval');
  jest.spyOn(console, 'info').mockImplementation(() => {});
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
    listeners.add(listener);
    return { remove: () => { listeners.delete(listener); } };
  });
});
afterEach(() => {
  act(() => { tree?.unmount(); });
  tree = undefined;
  jest.restoreAllMocks();
  jest.useRealTimers();
});

it('reads the latest saved sample immediately and refreshes independently of uploads', async () => {
  read.mockResolvedValueOnce(sample(1389)).mockResolvedValueOnce(sample(3302, 30));
  await mount();
  expect(visibleLux).toBe(1389);
  await advance();
  expect(visibleLux).toBe(3302);
  expect(read).toHaveBeenCalledWith(86);
});

it('retains the last value when there is no sample and retries failed display reads', async () => {
  read.mockResolvedValueOnce(sample(0)).mockRejectedValueOnce(new Error('native read failure'))
    .mockResolvedValueOnce(null).mockResolvedValueOnce(sample(4667, 30));
  await mount();
  await advance();
  expect(visibleLux).toBe(0);
  await advance();
  expect(visibleLux).toBe(0);
  await advance();
  expect(visibleLux).toBe(4667);
});

it('does not overlap pending native reads', async () => {
  let resolve!: (value: LatestWalkLightSample | null) => void;
  read.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
  await mount();
  await advance(20_000);
  expect(read).toHaveBeenCalledTimes(1);
  await act(async () => { resolve(sample(3902)); await flush(); });
  expect(visibleLux).toBe(3902);
});

it('stops polling in the background and reads the newest value on return', async () => {
  read.mockResolvedValueOnce(sample(1389)).mockResolvedValueOnce(sample(4667, 30));
  await mount();
  await changeState('background');
  await advance(60_000);
  expect(read).toHaveBeenCalledTimes(1);
  expect(clearInterval).toHaveBeenCalledWith(jest.mocked(setInterval).mock.results[0].value);
  await changeState('active');
  expect(visibleLux).toBe(4667);
});

it('ignores a native read that resolves while the app is in the background', async () => {
  let resolve!: (value: LatestWalkLightSample | null) => void;
  read.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
  await mount();
  await changeState('inactive');
  await act(async () => { resolve(sample(3902)); await flush(); });
  expect(visibleLux).toBeNull();
});

it('keeps the last reading while paused without running a polling timer', async () => {
  read.mockResolvedValue(sample(1389));
  await mount();
  await act(async () => { tree!.update(<Probe paused />); await flush(); });
  expect(visibleLux).toBe(1389);
  const calls = read.mock.calls.length;
  await advance(30_000);
  expect(read).toHaveBeenCalledTimes(calls);
  expect(clearInterval).toHaveBeenCalledWith(jest.mocked(setInterval).mock.results[0].value);
  await act(async () => { tree!.update(<Probe />); await flush(); });
  expect(setInterval).toHaveBeenCalledTimes(2);
});

it('does not show another walk or a late result from a previous walk', async () => {
  let resolve!: (value: LatestWalkLightSample | null) => void;
  read.mockImplementationOnce(() => new Promise((done) => { resolve = done; }))
    .mockResolvedValueOnce(sample(500));
  await mount();
  await act(async () => { tree!.update(<Probe walkId={87} />); await flush(); });
  expect(visibleLux).toBe(500);
  await act(async () => { resolve(sample(9999)); await flush(); });
  expect(visibleLux).toBe(500);
  await act(async () => { tree!.update(<Probe walkId={88} />); await flush(); });
  expect(visibleLux).toBeNull();
});

it('ignores invalid, repeated and older samples', async () => {
  read.mockResolvedValueOnce(sample(1000, 30)).mockResolvedValueOnce(sample(-1, 40))
    .mockResolvedValueOnce(sample(500, 0)).mockResolvedValueOnce(sample(1000, 30))
    .mockResolvedValueOnce({ lux: 2000, measured_at: 'invalid' });
  await mount();
  for (let i = 0; i < 4; i += 1) { await advance(); expect(visibleLux).toBe(1000); }
  expect(console.info).toHaveBeenCalledTimes(1);
});

it('removes its timer and app-state listener on unmount', async () => {
  await mount();
  expect(listeners.size).toBe(1);
  act(() => { tree!.unmount(); });
  tree = undefined;
  await advance(30_000);
  expect(read).toHaveBeenCalledTimes(1);
  expect(listeners.size).toBe(0);
  expect(clearInterval).toHaveBeenCalledWith(jest.mocked(setInterval).mock.results[0].value);
});

it('does not create a polling timer without a native module', async () => {
  await act(async () => { tree = renderer.create(<Probe available={false} />); await flush(); });
  expect(read).not.toHaveBeenCalled();
  expect(setInterval).not.toHaveBeenCalled();
});
