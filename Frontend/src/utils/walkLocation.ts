export type WalkCoordinate = {
  latitude: number;
  longitude: number;
};

export type WalkLocationDecision =
  | { type: 'baseline'; distanceKm: 0 }
  | { type: 'stationary'; distanceKm: 0 }
  | { type: 'reject'; distanceKm: 0 }
  | { type: 'accumulate'; distanceKm: number };

type EvaluateWalkLocationTransitionParams = {
  previous: WalkCoordinate | null;
  previousAtMs: number | null;
  current: WalkCoordinate;
  currentAtMs: number;
  minDistanceKm: number;
  maxSpeedMetersPerSecond: number;
  maxGapMs: number;
};

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

export const getDistanceKm = (
  from: WalkCoordinate,
  to: WalkCoordinate,
) => {
  const earthRadiusKm = 6371;
  const latitudeDelta = toRadians(to.latitude - from.latitude);
  const longitudeDelta = toRadians(to.longitude - from.longitude);
  const fromLatitude = toRadians(from.latitude);
  const toLatitude = toRadians(to.latitude);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(fromLatitude) *
      Math.cos(toLatitude) *
      Math.sin(longitudeDelta / 2) ** 2;

  return (
    2 *
    earthRadiusKm *
    Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
  );
};

export const evaluateWalkLocationTransition = ({
  previous,
  previousAtMs,
  current,
  currentAtMs,
  minDistanceKm,
  maxSpeedMetersPerSecond,
  maxGapMs,
}: EvaluateWalkLocationTransitionParams): WalkLocationDecision => {
  if (!previous || previousAtMs === null) {
    return { type: 'baseline', distanceKm: 0 };
  }

  const elapsedMs = currentAtMs - previousAtMs;
  if (elapsedMs <= 0) {
    return { type: 'reject', distanceKm: 0 };
  }

  const distanceKm = getDistanceKm(previous, current);
  if (distanceKm < minDistanceKm) {
    return { type: 'stationary', distanceKm: 0 };
  }

  if (elapsedMs > maxGapMs) {
    return { type: 'baseline', distanceKm: 0 };
  }

  const speedMetersPerSecond = (distanceKm * 1000) / (elapsedMs / 1000);
  if (speedMetersPerSecond > maxSpeedMetersPerSecond) {
    return { type: 'reject', distanceKm: 0 };
  }

  return { type: 'accumulate', distanceKm };
};

export const splitPathBySegmentStartIndices = <T>(
  points: readonly T[],
  segmentStartIndices: readonly number[],
): T[][] => {
  if (points.length === 0) return [];

  const starts = [
    0,
    ...new Set(
      segmentStartIndices.filter(
        (index) => Number.isInteger(index) && index > 0 && index < points.length,
      ),
    ),
    points.length,
  ].sort((a, b) => a - b);

  const segments: T[][] = [];
  for (let index = 0; index < starts.length - 1; index += 1) {
    const segment = points.slice(starts[index], starts[index + 1]);
    if (segment.length > 0) segments.push(segment);
  }
  return segments;
};
