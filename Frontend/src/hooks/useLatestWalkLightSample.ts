import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import type { AppStateStatus } from 'react-native';

export interface LatestWalkLightSample {
  lux: number;
  measured_at: string;
}

export interface LatestWalkLightSampleSource {
  getLatestLightSample: (walkId: number) => Promise<LatestWalkLightSample | null>;
}

const DISPLAY_POLL_INTERVAL_MS = 5_000;

export const useLatestWalkLightSample = (
  walkId: number | null,
  source: LatestWalkLightSampleSource | undefined,
  isPaused: boolean,
): number | null => {
  const [latest, setLatest] = useState<{ walkId: number; sample: LatestWalkLightSample } | null>(null);

  useEffect(() => {
    if (!walkId || !source || typeof source.getLatestLightSample !== 'function') return;
    let alive = true;
    let reading = false;
    let appState = AppState.currentState;
    let lastTimestamp = -Infinity;
    let interval: ReturnType<typeof setInterval> | undefined;

    const readLatest = async () => {
      if (!alive || reading || appState !== 'active') return;
      reading = true;
      try {
        const sample = await source.getLatestLightSample(walkId);
        if (!alive || appState !== 'active' || !sample) return;
        const timestamp = Date.parse(sample.measured_at);
        if (!Number.isFinite(sample.lux) || sample.lux < 0 ||
            !Number.isFinite(timestamp) || timestamp <= lastTimestamp) return;
        lastTimestamp = timestamp;
        setLatest({ walkId, sample });
        console.info('[walk-light] display:updated', {
          walkId, lux: sample.lux, measuredAt: sample.measured_at,
        });
      } catch {
        // A display read failure must not stop native sampling or API uploads.
      } finally {
        reading = false;
      }
    };

    const stopPolling = () => {
      if (interval !== undefined) clearInterval(interval);
      interval = undefined;
    };
    const startPolling = () => {
      stopPolling();
      readLatest();
      if (!isPaused) interval = setInterval(readLatest, DISPLAY_POLL_INTERVAL_MS);
    };
    const handleAppState = (state: AppStateStatus) => {
      appState = state;
      if (state === 'active') startPolling();
      else stopPolling();
    };

    const subscription = AppState.addEventListener('change', handleAppState);
    if (appState === 'active') startPolling();
    return () => {
      alive = false;
      stopPolling();
      subscription.remove();
    };
  }, [walkId, source, isPaused]);

  return latest?.walkId === walkId ? latest.sample.lux : null;
};
