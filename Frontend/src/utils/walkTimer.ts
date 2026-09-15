export interface WalkTimerState {
  startedAtMs: number;
  accumulatedActiveMs: number;
  activeSinceMs: number | null;
  isPaused: boolean;
}

export interface CompletedWalkTimer {
  timer: WalkTimerState;
  elapsedSeconds: number;
  endedAtMs: number;
}

export const createWalkTimer = (startedAtMs: number): WalkTimerState => ({
  startedAtMs,
  accumulatedActiveMs: 0,
  activeSinceMs: startedAtMs,
  isPaused: false,
});

export const getElapsedMilliseconds = (
  timer: WalkTimerState,
  nowMs: number
) => {
  if (timer.isPaused || timer.activeSinceMs === null) {
    return Math.max(0, timer.accumulatedActiveMs);
  }

  return Math.max(0, timer.accumulatedActiveMs + nowMs - timer.activeSinceMs);
};

export const getElapsedSeconds = (timer: WalkTimerState, nowMs: number) =>
  Math.floor(getElapsedMilliseconds(timer, nowMs) / 1000);

export const pauseWalkTimer = (
  timer: WalkTimerState,
  nowMs: number
): WalkTimerState => ({
  ...timer,
  accumulatedActiveMs: getElapsedMilliseconds(timer, nowMs),
  activeSinceMs: null,
  isPaused: true,
});

export const resumeWalkTimer = (
  timer: WalkTimerState,
  nowMs: number
): WalkTimerState => {
  if (!timer.isPaused && timer.activeSinceMs !== null) {
    return timer;
  }

  return {
    ...timer,
    activeSinceMs: nowMs,
    isPaused: false,
  };
};

export const completeWalkTimer = (
  timer: WalkTimerState,
  nowMs: number
): CompletedWalkTimer => {
  const completedTimer = pauseWalkTimer(timer, nowMs);
  const elapsedSeconds = getElapsedSeconds(completedTimer, nowMs);

  return {
    timer: completedTimer,
    elapsedSeconds,
    endedAtMs: completedTimer.startedAtMs + elapsedSeconds * 1000,
  };
};
