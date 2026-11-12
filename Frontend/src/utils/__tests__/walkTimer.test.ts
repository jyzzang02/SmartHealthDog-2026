import {
  completeWalkTimer,
  createWalkTimer,
  getElapsedSeconds,
  pauseWalkTimer,
  resumeWalkTimer,
} from '../walkTimer';

describe('walkTimer', () => {
  it('calculates elapsed time from timestamps even when interval callbacks do not run', () => {
    const startedAt = Date.parse('2026-08-19T00:00:00.000Z');
    const timer = createWalkTimer(startedAt);

    expect(getElapsedSeconds(timer, startedAt + 15 * 60 * 1000)).toBe(15 * 60);
  });

  it('excludes an explicit pause and continues after resume', () => {
    const startedAt = 1_000;
    const paused = pauseWalkTimer(
      createWalkTimer(startedAt),
      startedAt + 10_000
    );

    expect(getElapsedSeconds(paused, startedAt + 70_000)).toBe(10);

    const resumed = resumeWalkTimer(paused, startedAt + 70_000);
    expect(getElapsedSeconds(resumed, startedAt + 75_000)).toBe(15);
  });

  it('freezes the completion timestamp and elapsed time at the stop moment', () => {
    const startedAt = Date.parse('2026-09-15T13:57:00.000Z');
    const completed = completeWalkTimer(
      createWalkTimer(startedAt),
      startedAt + 65_000
    );

    expect(completed.elapsedSeconds).toBe(65);
    expect(completed.endedAtMs).toBe(startedAt + 65_000);
    expect(getElapsedSeconds(completed.timer, startedAt + 5 * 60_000)).toBe(65);
  });

  it('keeps the real end timestamp while excluding paused time from elapsed time', () => {
    const startedAt = Date.parse('2026-09-25T03:00:00.000Z');
    const paused = pauseWalkTimer(createWalkTimer(startedAt), startedAt + 5 * 60_000);
    const resumed = resumeWalkTimer(paused, startedAt + 15 * 60_000);
    const stoppedAt = startedAt + 20 * 60_000;

    const completed = completeWalkTimer(resumed, stoppedAt);

    expect(completed.elapsedSeconds).toBe(10 * 60);
    expect(completed.endedAtMs).toBe(stoppedAt);
  });
});
