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
  initialCoord: WalkLocation | null;
  currentCoord: WalkLocation | null;
  lastCoord: WalkLocation | null;
  updatedAtMs: number;
}

const ACTIVE_WALK_SESSION_KEY = 'walk.activeSession.v1';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

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
    !nullableLocation(session.initialCoord) ||
    !nullableLocation(session.currentCoord) ||
    !nullableLocation(session.lastCoord) ||
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
