import {
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
});
