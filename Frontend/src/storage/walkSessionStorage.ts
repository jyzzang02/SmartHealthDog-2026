import AsyncStorage from '@react-native-async-storage/async-storage';
import type { WalkCoordinate } from '../api/walks';
import type { WalkTimerState } from '../utils/walkTimer';

export interface WalkLocation {
  lat: number;
  lng: number;
}

export interface ActiveWalkSession {
  version: 1;
  petId: number;
  walkId?: number | null;
  timer: WalkTimerState;
  distanceKm: number;
  pathCoordinates: WalkCoordinate[];
  pathSegmentStartIndices?: number[];
  initialCoord: WalkLocation | null;
  currentCoord: WalkLocation | null;
  lastCoord: WalkLocation | null;
  lastAcceptedLocationAtMs?: number | null;
  lastProcessedLocationAtMs?: number | null;
  updatedAtMs: number;
}

const ACTIVE_WALK_SESSION_KEY = 'walk.activeSession.v1';
const WALK_ROUTE_SEGMENTS_KEY_PREFIX = 'walk.routeSegments.v1.';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const isOptionalNullableNumber = (value: unknown) =>
  value === undefined || value === null || isFiniteNumber(value);

const isLocation = (value: unknown): value is WalkLocation => {
  if (!value || typeof value !== 'object') return false;
  const location = value as Partial<WalkLocation>;
  return isFiniteNumber(location.lat) && isFiniteNumber(location.lng);
};

const isTimer = (value: unknown): value is WalkTimerState => {
  if (!value || typeof value !== 'object') return false;
  const timer = value as Partial<WalkTimerState>;
  return (
    isFiniteNumber(timer.startedAtMs) &&
    isFiniteNumber(timer.accumulatedActiveMs) &&
    (timer.activeSinceMs === null || isFiniteNumber(timer.activeSinceMs)) &&
    typeof timer.isPaused === 'boolean'
  );
};

const isCoordinate = (value: unknown): value is WalkCoordinate =>
  Array.isArray(value) &&
  value.length === 2 &&
  isFiniteNumber(value[0]) &&
  isFiniteNumber(value[1]);

const isSegmentStartIndex = (value: unknown): value is number =>
  Number.isInteger(value) && Number(value) > 0;

const parseSession = (value: unknown): ActiveWalkSession | null => {
  if (!value || typeof value !== 'object') return null;
  const session = value as Partial<ActiveWalkSession>;
  const nullableLocation = (location: unknown) =>
    location === null || isLocation(location);

  if (
    session.version !== 1 ||
    !isFiniteNumber(session.petId) ||
    !(
      session.walkId === undefined ||
      session.walkId === null ||
      isFiniteNumber(session.walkId)
    ) ||
    !isTimer(session.timer) ||
    !isFiniteNumber(session.distanceKm) ||
    !Array.isArray(session.pathCoordinates) ||
    !session.pathCoordinates.every(isCoordinate) ||
    !(
      session.pathSegmentStartIndices === undefined ||
      (Array.isArray(session.pathSegmentStartIndices) &&
        session.pathSegmentStartIndices.every(isSegmentStartIndex))
    ) ||
    !nullableLocation(session.initialCoord) ||
    !nullableLocation(session.currentCoord) ||
    !nullableLocation(session.lastCoord) ||
    !isOptionalNullableNumber(session.lastAcceptedLocationAtMs) ||
    !isOptionalNullableNumber(session.lastProcessedLocationAtMs) ||
    !isFiniteNumber(session.updatedAtMs)
  ) {
    return null;
  }

  return session as ActiveWalkSession;
};

export const loadActiveWalkSession = async (petId: number) => {
  try {
    const raw = await AsyncStorage.getItem(ACTIVE_WALK_SESSION_KEY);
    if (!raw) return null;

    const session = parseSession(JSON.parse(raw));
    return session?.petId === petId ? session : null;
  } catch {
    return null;
  }
};

export const saveActiveWalkSession = async (session: ActiveWalkSession) => {
  await AsyncStorage.setItem(ACTIVE_WALK_SESSION_KEY, JSON.stringify(session));
};

export const clearActiveWalkSession = async () => {
  await AsyncStorage.removeItem(ACTIVE_WALK_SESSION_KEY);
};

export const saveWalkRouteSegmentStartIndices = async (
  walkId: number,
  segmentStartIndices: number[],
) => {
  await AsyncStorage.setItem(
    `${WALK_ROUTE_SEGMENTS_KEY_PREFIX}${walkId}`,
    JSON.stringify(segmentStartIndices),
  );
};

export const loadWalkRouteSegmentStartIndices = async (walkId: number) => {
  try {
    const raw = await AsyncStorage.getItem(
      `${WALK_ROUTE_SEGMENTS_KEY_PREFIX}${walkId}`,
    );
    if (!raw) return [];
    const value = JSON.parse(raw);
    return Array.isArray(value) && value.every(isSegmentStartIndex)
      ? value
      : [];
  } catch {
    return [];
  }
};

export const clearWalkRouteSegmentStartIndices = async (walkId: number) => {
  await AsyncStorage.removeItem(`${WALK_ROUTE_SEGMENTS_KEY_PREFIX}${walkId}`);
};
