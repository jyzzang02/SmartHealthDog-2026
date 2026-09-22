import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  Modal,
  Animated,
  Easing,
  Platform,
  PermissionsAndroid,
  Alert,
  AppState,
  DeviceEventEmitter,
  NativeModules,
} from 'react-native';
import type { AppStateStatus } from 'react-native';
import {
  useNavigation,
  usePreventRemove,
  useRoute,
  RouteProp,
} from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { WebView } from 'react-native-webview';
import Geolocation from 'react-native-geolocation-service';
import type { GeoPosition } from 'react-native-geolocation-service';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootStackParamList } from '../../App';
import CustomButton from '../components/CustomButton';
import { endPetWalk, findActivePetWalkId, startPetWalk } from '../api/walks';
import type { WalkCoordinate } from '../api/walks';
import {
  clearActiveWalkSession,
  loadActiveWalkSession,
  saveActiveWalkSession,
  saveWalkRouteSegmentStartIndices,
} from '../storage/walkSessionStorage';
import type { ActiveWalkSession, WalkLocation } from '../storage/walkSessionStorage';
import {
  completeWalkTimer,
  createWalkTimer,
  getElapsedSeconds,
  pauseWalkTimer,
  resumeWalkTimer,
} from '../utils/walkTimer';
import {
  evaluateWalkLocationTransition,
  splitPathBySegmentStartIndices,
} from '../utils/walkLocation';

type RouteProps = RouteProp<RootStackParamList, 'WalkActive'>;
type NavigationProps = NativeStackNavigationProp<RootStackParamList>;

type CompassHeadingModule = {
  start: () => void;
  stop: () => void;
};

type BackgroundWalkLocation = {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: number;
};

type WalkLocationTrackingModule = {
  start: () => Promise<void>;
  stop: () => Promise<void>;
  clearLocations: () => Promise<void>;
  getLocations: () => Promise<BackgroundWalkLocation[]>;
  isIgnoringBatteryOptimizations: () => Promise<boolean>;
  requestIgnoreBatteryOptimizations: () => Promise<void>;
};

const compassHeadingModule = NativeModules.SmartHealthDogCompass as
  | CompassHeadingModule
  | undefined;
const walkLocationTrackingModule = NativeModules.WalkLocationTracking as
  | WalkLocationTrackingModule
  | undefined;

const normalizeHeading = (value: unknown): number | null => {
  const heading = Number(value);
  if (!Number.isFinite(heading) || heading < 0) return null;
  return heading % 360;
};

interface CompletedWalkSnapshot {
  startTime: string;
  endTime: string;
  elapsedSeconds: number;
  distanceKm: number;
  pathCoordinates: WalkCoordinate[];
  pathSegmentStartIndices: number[];
}

const formatTime = (seconds: number) => {
  const mm = Math.floor(seconds / 60).toString().padStart(2, '0');
  const ss = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${mm}:${ss}`;
};

const formatPeriod = (time: string) => {
  const hour = parseInt(time.split(':')[0] || '0', 10);
  return hour >= 12 ? '오후' : '오전';
};

const formatDateLabel = (date: Date) => {
  const yyyy = date.getFullYear();
  const mm = (date.getMonth() + 1).toString().padStart(2, '0');
  const dd = date.getDate().toString().padStart(2, '0');
  return `${yyyy}. ${mm}. ${dd}`;
};

const formatClock = (date: Date) => {
  const hh = date.getHours().toString().padStart(2, '0');
  const mm = date.getMinutes().toString().padStart(2, '0');
  return `${hh}:${mm}`;
};

const formatDurationMinutes = (seconds: number) => `${Math.round(seconds / 60)}분`;
const MAX_LOCATION_ACCURACY_METERS = 25;
const MIN_ROUTE_POINT_DISTANCE_KM = 0.005;
const MAX_WALK_SPEED_METERS_PER_SECOND = 8;
const MAX_DISTANCE_ACCUMULATION_GAP_MS = 5 * 60_000;

export default function WalkActiveScreen() {
  const navigation = useNavigation<NavigationProps>();
  const route = useRoute<RouteProps>();
  const { petId, petName, petImage } = route.params;
  const insets = useSafeAreaInsets();

  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [startedAtMs, setStartedAtMs] = useState(() => Date.now());
  const [isPaused, setIsPaused] = useState(false);
  const [isSessionReady, setIsSessionReady] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showResultModal, setShowResultModal] = useState(false);
  const [distanceKm, setDistanceKm] = useState(0);
  const [mapLoadError, setMapLoadError] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [initialCoord, setInitialCoord] = useState<{ lat: number; lng: number } | null>(null);
  const [currentCoord, setCurrentCoord] = useState<{ lat: number; lng: number } | null>(null);
  const [completedWalk, setCompletedWalk] = useState<CompletedWalkSnapshot | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [canLeaveScreen, setCanLeaveScreen] = useState(false);

  const timerStateRef = useRef(createWalkTimer(startedAtMs));
  const walkIdRef = useRef<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const badgeAnim = useRef(new Animated.Value(0.6)).current;
  const watchIdRef = useRef<number | null>(null);
  const lastCoordRef = useRef<{ lat: number; lng: number } | null>(null);
  const pauseTrackingRef = useRef(false);
  const hasInitialCoordRef = useRef(false);
  const pathCoordinatesRef = useRef<WalkCoordinate[]>([]);
  const pathSegmentStartIndicesRef = useRef<number[]>([]);
  const shouldStartNewPathSegmentRef = useRef(false);
  const initialCoordRef = useRef<WalkLocation | null>(null);
  const currentCoordRef = useRef<WalkLocation | null>(null);
  const distanceKmRef = useRef(0);
  const persistQueueRef = useRef<Promise<void>>(Promise.resolve());
  const lastPersistedAtRef = useRef(0);
  const isFinishingRef = useRef(false);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const webViewRef = useRef<WebView>(null);
  const headingRef = useRef<number | null>(null);
  const lastAcceptedLocationAtMsRef = useRef<number | null>(null);
  const lastProcessedLocationAtMsRef = useRef<number | null>(null);
  const shouldBufferForegroundLocationsRef = useRef(true);
  const pendingForegroundLocationsRef = useRef<GeoPosition[]>([]);
  const backgroundMergePromiseRef = useRef<Promise<void> | null>(null);
  const shouldResetBackgroundLocationsRef = useRef(false);
  const isStoppingRef = useRef(false);

  const startDate = useMemo(() => new Date(startedAtMs), [startedAtMs]);
  const endDate = useMemo(() => new Date(startDate.getTime() + elapsedSeconds * 1000), [startDate, elapsedSeconds]);
  const displayPetName = petName?.trim() || '이름 없음';

  const createCompletedWalkSnapshot = useCallback((now: number): CompletedWalkSnapshot => {
    const completedTimer = completeWalkTimer(timerStateRef.current, now);
    const startedAt = new Date(completedTimer.timer.startedAtMs);

    timerStateRef.current = completedTimer.timer;

    return {
      startTime: startedAt.toISOString(),
      endTime: new Date(completedTimer.endedAtMs).toISOString(),
      elapsedSeconds: completedTimer.elapsedSeconds,
      distanceKm: Number(distanceKmRef.current.toFixed(3)),
      pathCoordinates: pathCoordinatesRef.current.map(
        (point) => [...point] as WalkCoordinate
      ),
      pathSegmentStartIndices: [...pathSegmentStartIndicesRef.current],
    };
  }, []);

  const queueSessionSave = useCallback((force = false) => {
    if (isFinishingRef.current) return;
    const now = Date.now();
    if (!force && now - lastPersistedAtRef.current < 5000) return;
    lastPersistedAtRef.current = now;

    const snapshot: ActiveWalkSession = {
      version: 1,
      petId,
      walkId: walkIdRef.current,
      timer: { ...timerStateRef.current },
      distanceKm: distanceKmRef.current,
      pathCoordinates: pathCoordinatesRef.current.map((point) => [...point] as WalkCoordinate),
      pathSegmentStartIndices: [...pathSegmentStartIndicesRef.current],
      initialCoord: initialCoordRef.current ? { ...initialCoordRef.current } : null,
      currentCoord: currentCoordRef.current ? { ...currentCoordRef.current } : null,
      lastCoord: lastCoordRef.current ? { ...lastCoordRef.current } : null,
      lastAcceptedLocationAtMs: lastAcceptedLocationAtMsRef.current,
      lastProcessedLocationAtMs: lastProcessedLocationAtMsRef.current,
      updatedAtMs: now,
    };

    persistQueueRef.current = persistQueueRef.current
      .catch(() => undefined)
      .then(() => saveActiveWalkSession(snapshot))
      .catch(() => undefined);
  }, [petId]);

  const syncElapsedTime = useCallback(() => {
    const seconds = getElapsedSeconds(timerStateRef.current, Date.now());
    setElapsedSeconds(seconds);
    return seconds;
  }, []);

  useEffect(() => {
    let isMounted = true;

    const restoreSession = async () => {
      try {
        const savedSession = await loadActiveWalkSession(petId);
        if (!isMounted) return;

        if (savedSession) {
          shouldResetBackgroundLocationsRef.current = false;
          const startedAt = new Date(savedSession.timer.startedAtMs).toISOString();
          const walkId =
            savedSession.walkId ??
            (await findActivePetWalkId(petId, startedAt)) ??
            (await startPetWalk(petId, { startTime: startedAt }));
          if (!isMounted) return;

          walkIdRef.current = walkId;
          timerStateRef.current = savedSession.timer;
          setStartedAtMs(savedSession.timer.startedAtMs);
          setElapsedSeconds(getElapsedSeconds(savedSession.timer, Date.now()));
          setIsPaused(savedSession.timer.isPaused);
          pauseTrackingRef.current = savedSession.timer.isPaused;

          distanceKmRef.current = savedSession.distanceKm;
          setDistanceKm(savedSession.distanceKm);
          pathCoordinatesRef.current = savedSession.pathCoordinates.slice();
          pathSegmentStartIndicesRef.current = (
            savedSession.pathSegmentStartIndices ?? []
          ).filter(
            (index) => index > 0 && index < savedSession.pathCoordinates.length,
          );
          shouldStartNewPathSegmentRef.current = savedSession.timer.isPaused;
          initialCoordRef.current = savedSession.initialCoord;
          currentCoordRef.current = savedSession.currentCoord;
          lastCoordRef.current = savedSession.lastCoord;
          const restoredLocationAtMs =
            savedSession.lastProcessedLocationAtMs ??
            savedSession.lastAcceptedLocationAtMs ??
            savedSession.updatedAtMs;
          lastAcceptedLocationAtMsRef.current =
            savedSession.lastAcceptedLocationAtMs ?? restoredLocationAtMs;
          lastProcessedLocationAtMsRef.current = restoredLocationAtMs;
          hasInitialCoordRef.current = savedSession.initialCoord !== null;
          setInitialCoord(savedSession.initialCoord);
          setCurrentCoord(savedSession.currentCoord);

          await saveActiveWalkSession({
            ...savedSession,
            walkId,
            lastAcceptedLocationAtMs: lastAcceptedLocationAtMsRef.current,
            lastProcessedLocationAtMs: lastProcessedLocationAtMsRef.current,
            updatedAtMs: Date.now(),
          });
        } else {
          shouldResetBackgroundLocationsRef.current = true;
          const now = Date.now();
          const timer = createWalkTimer(now);
          const walkId = await startPetWalk(petId, {
            startTime: new Date(now).toISOString(),
          });
          if (!isMounted) return;

          walkIdRef.current = walkId;
          timerStateRef.current = timer;
          setStartedAtMs(now);
          await saveActiveWalkSession({
            version: 1,
            petId,
            walkId,
            timer,
            distanceKm: 0,
            pathCoordinates: [],
            pathSegmentStartIndices: [],
            initialCoord: null,
            currentCoord: null,
            lastCoord: null,
            lastAcceptedLocationAtMs: null,
            lastProcessedLocationAtMs: null,
            updatedAtMs: now,
          });
        }

        if (isMounted) setIsSessionReady(true);
      } catch (error) {
        if (!isMounted) return;
        const message =
          error instanceof Error ? error.message : '산책을 시작하지 못했습니다.';
        Alert.alert('오류', message, [
          { text: '확인', onPress: () => navigation.goBack() },
        ]);
      }
    };

    restoreSession();
    return () => {
      isMounted = false;
    };
  }, [navigation, petId]);

  useEffect(() => {
    if (!isSessionReady) return;
    if (intervalRef.current) clearInterval(intervalRef.current);
    syncElapsedTime();
    if (!isPaused) {
      intervalRef.current = setInterval(syncElapsedTime, 1000);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isPaused, isSessionReady, syncElapsedTime]);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(badgeAnim, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(badgeAnim, { toValue: 0.6, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [badgeAnim]);

  useEffect(() => {
    if (!isSessionReady || Platform.OS !== 'android' || !compassHeadingModule) return;

    const subscription = DeviceEventEmitter.addListener(
      'smartHealthDogCompassHeading',
      (event: { heading?: unknown }) => {
        const heading = normalizeHeading(event?.heading);
        if (heading === null) return;

        headingRef.current = heading;
        webViewRef.current?.postMessage(
          JSON.stringify({ type: 'HEADING_UPDATE', heading })
        );
      }
    );

    compassHeadingModule.start();
    return () => {
      subscription.remove();
      compassHeadingModule.stop();
    };
  }, [isSessionReady]);

  const showInitialLocationPreview = useCallback((pos: GeoPosition) => {
    const { accuracy, latitude, longitude } = pos.coords;
    if (typeof accuracy === 'number' && accuracy > 150) return;
    if (
      Number.isFinite(pos.timestamp) &&
      lastProcessedLocationAtMsRef.current !== null &&
      pos.timestamp <= lastProcessedLocationAtMsRef.current
    ) {
      return;
    }

    const current = { lat: latitude, lng: longitude };
    const gpsHeading = normalizeHeading(pos.coords.heading);
    if (headingRef.current === null && gpsHeading !== null) {
      headingRef.current = gpsHeading;
    }

    if (!hasInitialCoordRef.current) {
      hasInitialCoordRef.current = true;
      initialCoordRef.current = current;
      setInitialCoord(current);
    }

    currentCoordRef.current = current;
    setCurrentCoord(current);
    webViewRef.current?.postMessage(
      JSON.stringify({
        type: 'LOCATION_UPDATE',
        coord: current,
        pathSegments: splitPathBySegmentStartIndices(
          pathCoordinatesRef.current,
          pathSegmentStartIndicesRef.current,
        ),
        heading: headingRef.current,
        forceCenter: true,
      })
    );
  }, []);

  const recordLocation = useCallback((pos: GeoPosition) => {
    const { accuracy, latitude, longitude } = pos.coords;
    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      (typeof accuracy === 'number' && accuracy > MAX_LOCATION_ACCURACY_METERS)
    ) {
      return;
    }

    const current = { lat: latitude, lng: longitude };
    const recordedAtMs = Number.isFinite(pos.timestamp) ? pos.timestamp : Date.now();
    const lastProcessedAtMs = lastProcessedLocationAtMsRef.current;
    if (lastProcessedAtMs !== null && recordedAtMs <= lastProcessedAtMs) {
      return;
    }
    lastProcessedLocationAtMsRef.current = recordedAtMs;

    const previous = lastCoordRef.current;
    const decision = evaluateWalkLocationTransition({
      previous: previous
        ? { latitude: previous.lat, longitude: previous.lng }
        : null,
      previousAtMs: lastAcceptedLocationAtMsRef.current,
      current: { latitude, longitude },
      currentAtMs: recordedAtMs,
      minDistanceKm: MIN_ROUTE_POINT_DISTANCE_KM,
      maxSpeedMetersPerSecond: MAX_WALK_SPEED_METERS_PER_SECOND,
      maxGapMs: MAX_DISTANCE_ACCUMULATION_GAP_MS,
    });

    if (decision.type === 'reject') {
      return;
    }
    if (decision.type === 'stationary') {
      lastAcceptedLocationAtMsRef.current = recordedAtMs;
      return;
    }

    lastAcceptedLocationAtMsRef.current = recordedAtMs;
    const gpsHeading = normalizeHeading(pos.coords.heading);
    if (headingRef.current === null && gpsHeading !== null) {
      headingRef.current = gpsHeading;
    }

    if (!hasInitialCoordRef.current) {
      hasInitialCoordRef.current = true;
      initialCoordRef.current = current;
      setInitialCoord(current);
    }
    currentCoordRef.current = current;
    setCurrentCoord(current);

    if (pauseTrackingRef.current) {
      lastCoordRef.current = current;
      shouldStartNewPathSegmentRef.current = true;
      queueSessionSave();
      return;
    }

    if (
      pathCoordinatesRef.current.length > 0 &&
      (decision.type === 'baseline' || shouldStartNewPathSegmentRef.current)
    ) {
      const segmentStartIndex = pathCoordinatesRef.current.length;
      const previousSegmentStart =
        pathSegmentStartIndicesRef.current[
          pathSegmentStartIndicesRef.current.length - 1
        ];
      if (previousSegmentStart !== segmentStartIndex) {
        pathSegmentStartIndicesRef.current.push(segmentStartIndex);
      }
    }
    shouldStartNewPathSegmentRef.current = false;
    pathCoordinatesRef.current.push([latitude, longitude]);
    webViewRef.current?.postMessage(
      JSON.stringify({
        type: 'LOCATION_UPDATE',
        coord: current,
        pathSegments: splitPathBySegmentStartIndices(
          pathCoordinatesRef.current,
          pathSegmentStartIndicesRef.current,
        ),
        heading: headingRef.current,
        forceCenter: previous === null,
      })
    );

    if (decision.type === 'accumulate') {
      distanceKmRef.current += decision.distanceKm;
      setDistanceKm(distanceKmRef.current);
    }
    lastCoordRef.current = current;
    queueSessionSave();
  }, [queueSessionSave]);

  const recordForegroundLocation = useCallback((position: GeoPosition) => {
    if (shouldBufferForegroundLocationsRef.current) {
      pendingForegroundLocationsRef.current.push(position);
      return;
    }
    recordLocation(position);
  }, [recordLocation]);

  const mergeBackgroundLocations = useCallback((): Promise<void> => {
    if (Platform.OS !== 'android' || !walkLocationTrackingModule) {
      if (appStateRef.current === 'active') {
        pendingForegroundLocationsRef.current
          .splice(0)
          .sort((a, b) => a.timestamp - b.timestamp)
          .forEach(recordLocation);
        shouldBufferForegroundLocationsRef.current = false;
      }
      return Promise.resolve();
    }
    if (backgroundMergePromiseRef.current) {
      return backgroundMergePromiseRef.current;
    }

    const mergePromise = (async () => {
      shouldBufferForegroundLocationsRef.current = true;
      const nativeLocations: GeoPosition[] = [];
      try {
        const locations = await walkLocationTrackingModule.getLocations();
        locations
          .filter(
            (location) =>
              Number.isFinite(location.latitude) &&
              Number.isFinite(location.longitude) &&
              Number.isFinite(location.timestamp)
          )
          .sort((a, b) => a.timestamp - b.timestamp)
          .forEach((location) => {
            nativeLocations.push({
              coords: {
                latitude: location.latitude,
                longitude: location.longitude,
                accuracy: location.accuracy,
                heading: -1,
              },
              timestamp: location.timestamp,
            } as GeoPosition);
          });
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      } catch {
        // The foreground service is supplemental; foreground tracking remains available.
      } finally {
        const mergedLocations = [
          ...nativeLocations,
          ...pendingForegroundLocationsRef.current.splice(0),
        ].sort((a, b) => a.timestamp - b.timestamp);
        mergedLocations.forEach(recordLocation);
        shouldBufferForegroundLocationsRef.current =
          appStateRef.current !== 'active';
      }
    })();

    backgroundMergePromiseRef.current = mergePromise;
    mergePromise
      .finally(() => {
        if (backgroundMergePromiseRef.current === mergePromise) {
          backgroundMergePromiseRef.current = null;
        }
      })
      .catch(() => undefined);
    return mergePromise;
  }, [recordLocation]);

  useEffect(() => {
    if (!isSessionReady) return;
    let isActive = true;

    const requestPermission = async () => {
      if (Platform.OS === 'android') {
        const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION, {
          title: '위치 권한',
          message: '산책 거리 측정을 위해 위치 권한이 필요합니다.',
          buttonNeutral: '나중에',
          buttonNegative: '취소',
          buttonPositive: '확인',
        });
        if (granted !== PermissionsAndroid.RESULTS.GRANTED) return false;

        if (
          Number(Platform.Version) >= 33 &&
          PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS
        ) {
          await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS
          );
        }

        return true;
      }
      return true;
    };

    const startWatch = async () => {
      const ok = await requestPermission();
      if (!ok || !isActive) return;

      let nativeTrackingStarted = false;
      if (Platform.OS === 'android' && walkLocationTrackingModule) {
        try {
          if (shouldResetBackgroundLocationsRef.current) {
            await walkLocationTrackingModule.clearLocations();
          }
          await walkLocationTrackingModule.start();
          nativeTrackingStarted = true;
        } catch {
          // Foreground location tracking remains available if native tracking cannot start.
        }
      }

      await mergeBackgroundLocations();

      if (
        nativeTrackingStarted &&
        walkLocationTrackingModule &&
        shouldResetBackgroundLocationsRef.current
      ) {
        try {
          const isBatteryExempt =
            await walkLocationTrackingModule.isIgnoringBatteryOptimizations();
          if (!isBatteryExempt && isActive) {
            Alert.alert(
              '배터리 설정 안내',
              '화면을 끈 상태에서도 산책 경로를 정확히 기록하려면 배터리 사용량을 제한 없음으로 설정해 주세요.',
              [
                { text: '나중에', style: 'cancel' },
                {
                  text: '설정하기',
                  onPress: () =>
                    walkLocationTrackingModule
                      ?.requestIgnoreBatteryOptimizations()
                      .catch(() => undefined),
                },
              ]
            );
          }
        } catch {
          // Battery optimization guidance is optional.
        }
      }

      Geolocation.getCurrentPosition(showInitialLocationPreview, () => {}, {
        enableHighAccuracy: false,
        timeout: 5000,
        maximumAge: 60_000,
      });
      Geolocation.getCurrentPosition(recordForegroundLocation, () => {}, {
        enableHighAccuracy: true,
        timeout: 15_000,
        maximumAge: 5_000,
      });

      watchIdRef.current = Geolocation.watchPosition(
        (pos: GeoPosition) => {
          if (isActive) recordForegroundLocation(pos);
        },
        () => {},
        { enableHighAccuracy: true, distanceFilter: 5, interval: 2000, fastestInterval: 1000 }
      );
    };

    startWatch();

    return () => {
      isActive = false;
      if (watchIdRef.current !== null) {
        Geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [
    isSessionReady,
    mergeBackgroundLocations,
    recordForegroundLocation,
    showInitialLocationPreview,
  ]);

  useEffect(() => {
    if (!isSessionReady) return;

    const subscription = AppState.addEventListener('change', (nextState) => {
      const previousState = appStateRef.current;

      if (nextState === 'active' && previousState !== 'active') {
        syncElapsedTime();
        const resumeLocationUpdates = async () => {
          await mergeBackgroundLocations();
          if (appStateRef.current !== 'active') return;
          Geolocation.getCurrentPosition(recordForegroundLocation, () => {}, {
            enableHighAccuracy: true,
            timeout: 15000,
            maximumAge: 5000,
          });
        };
        resumeLocationUpdates().catch(() => undefined);
      } else if (nextState === 'background' || nextState === 'inactive') {
        shouldBufferForegroundLocationsRef.current = true;
        syncElapsedTime();
        queueSessionSave(true);
      }

      appStateRef.current = nextState;
    });

    return () => subscription.remove();
  }, [
    isSessionReady,
    mergeBackgroundLocations,
    queueSessionSave,
    recordForegroundLocation,
    syncElapsedTime,
  ]);

  const handlePauseToggle = () => {
    if (!isSessionReady) return;
    const now = Date.now();
    timerStateRef.current = isPaused
      ? resumeWalkTimer(timerStateRef.current, now)
      : pauseWalkTimer(timerStateRef.current, now);
    if (!isPaused) {
      shouldStartNewPathSegmentRef.current = true;
    }
    pauseTrackingRef.current = timerStateRef.current.isPaused;
    setIsPaused(timerStateRef.current.isPaused);
    setElapsedSeconds(getElapsedSeconds(timerStateRef.current, now));
    queueSessionSave(true);

    if (Platform.OS === 'android' && walkLocationTrackingModule) {
      const operation = timerStateRef.current.isPaused
        ? walkLocationTrackingModule.stop()
        : walkLocationTrackingModule.start();
      operation.catch(() => undefined);
    }
  };

  const handleStop = useCallback(async () => {
    if (!isSessionReady || isStoppingRef.current) return;
    isStoppingRef.current = true;
    await mergeBackgroundLocations();
    if (Platform.OS === 'android' && walkLocationTrackingModule) {
      await walkLocationTrackingModule.stop().catch(() => undefined);
    }
    const now = Date.now();
    const snapshot = createCompletedWalkSnapshot(now);
    setCompletedWalk(snapshot);
    setElapsedSeconds(snapshot.elapsedSeconds);
    setIsPaused(true);
    pauseTrackingRef.current = true;
    queueSessionSave(true);
    setShowConfirmModal(true);
    isStoppingRef.current = false;
  }, [
    createCompletedWalkSnapshot,
    isSessionReady,
    mergeBackgroundLocations,
    queueSessionSave,
  ]);

  const requestWalkExit = useCallback(() => {
    if (
      !isSessionReady ||
      isStoppingRef.current ||
      showConfirmModal ||
      showResultModal
    ) {
      return;
    }
    handleStop();
  }, [handleStop, isSessionReady, showConfirmModal, showResultModal]);

  usePreventRemove(isSessionReady && !canLeaveScreen, requestWalkExit);

  useEffect(() => {
    if (canLeaveScreen) {
      navigation.goBack();
    }
  }, [canLeaveScreen, navigation]);

  const handleConfirmNo = () => {
    if (!isSessionReady) return;
    const now = Date.now();
    timerStateRef.current = resumeWalkTimer(timerStateRef.current, now);
    setCompletedWalk(null);
    setShowConfirmModal(false);
    setIsPaused(false);
    pauseTrackingRef.current = false;
    queueSessionSave(true);
    if (Platform.OS === 'android' && walkLocationTrackingModule) {
      walkLocationTrackingModule.start().catch(() => undefined);
    }
  };

  const handleConfirmYes = () => {
    setShowConfirmModal(false);
    setShowResultModal(true);
  };

  const handleResultConfirm = async () => {
    if (isSubmitting) return;
    const snapshot = completedWalk;
    if (!snapshot) {
      Alert.alert('오류', '산책 종료 정보를 준비하지 못했습니다. 다시 시도해 주세요.');
      return;
    }
    const walkId = walkIdRef.current;
    if (!walkId) {
      Alert.alert('오류', '진행 중인 산책 기록 ID를 확인하지 못했습니다.');
      return;
    }

    setIsSubmitting(true);
    try {
      await endPetWalk(petId, walkId, {
        end_time: snapshot.endTime,
        distance: snapshot.distanceKm,
        path_coordinates: snapshot.pathCoordinates,
      });
      await saveWalkRouteSegmentStartIndices(
        walkId,
        snapshot.pathSegmentStartIndices,
      ).catch(() => undefined);
      isFinishingRef.current = true;
      await persistQueueRef.current.catch(() => undefined);
      await clearActiveWalkSession().catch(() => undefined);
      await walkLocationTrackingModule?.clearLocations().catch(() => undefined);
      setCanLeaveScreen(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : '산책 기록 저장에 실패했습니다.';
      Alert.alert('오류', message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const distanceText = useMemo(() => `${distanceKm.toFixed(1)}`, [distanceKm]);
  const timerText = useMemo(() => formatTime(elapsedSeconds), [elapsedSeconds]);
  const resultStartDate = useMemo(
    () => (completedWalk ? new Date(completedWalk.startTime) : startDate),
    [completedWalk, startDate]
  );
  const resultEndDate = useMemo(
    () => (completedWalk ? new Date(completedWalk.endTime) : endDate),
    [completedWalk, endDate]
  );
  const resultStartTimeText = useMemo(() => formatClock(resultStartDate), [resultStartDate]);
  const resultEndTimeText = useMemo(() => formatClock(resultEndDate), [resultEndDate]);
  const resultDuration = useMemo(
    () => formatDurationMinutes(completedWalk?.elapsedSeconds ?? elapsedSeconds),
    [completedWalk, elapsedSeconds]
  );
  const resultDistanceText = useMemo(
    () => `${(completedWalk?.distanceKm ?? distanceKm).toFixed(1)}`,
    [completedWalk, distanceKm]
  );
  const kakaoHtml = useMemo(() => {
    const center = initialCoord ?? { lat: 37.5665, lng: 126.9780 };
    return `<!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="initial-scale=1.0, maximum-scale=1.0" />
          <style>
            html, body, #map { margin: 0; padding: 0; width: 100%; height: 100%; background: #E9ECEF; }
            .current-marker {
              --heading: 0deg;
              width: 46px;
              height: 46px;
              position: relative;
            }
            .marker-accuracy {
              position: absolute;
              inset: 2px;
              border-radius: 50%;
              background: rgba(0, 129, 213, 0.16);
              border: 2px solid rgba(0, 129, 213, 0.35);
            }
            .direction-arrow {
              position: absolute;
              left: 7px;
              top: 2px;
              width: 32px;
              height: 42px;
              transform: rotate(var(--heading));
              transform-origin: 50% 50%;
              filter: drop-shadow(0 2px 3px rgba(0, 67, 126, 0.35));
            }
            .direction-arrow path {
              fill: #0081D5;
              stroke: #FFFFFF;
              stroke-width: 2;
              stroke-linejoin: round;
            }
            .marker-dot {
              position: absolute;
              left: 16px;
              top: 16px;
              width: 14px;
              height: 14px;
              border-radius: 50%;
              background: #FFFFFF;
              box-shadow: 0 1px 3px rgba(0, 67, 126, 0.3);
            }
          </style>
          <script src="https://dapi.kakao.com/v2/maps/sdk.js?appkey=e65e93f752b1590bf9b8be83566dd5b6&autoload=false"></script>
        </head>
        <body>
          <div id="map"></div>
          <script>
            (function() {
              var map;
              var marker;
              var markerElement;
              var polylines = [];
              var hasCentered = false;

              function toLatLng(coord) {
                return new kakao.maps.LatLng(coord.lat, coord.lng);
              }

              function ensureMarker(position) {
                if (!marker) {
                  markerElement = document.createElement('div');
                  markerElement.className = 'current-marker';
                  markerElement.innerHTML =
                    '<div class="marker-accuracy"></div>' +
                    '<svg class="direction-arrow" viewBox="0 0 32 42" aria-hidden="true">' +
                    '<path d="M16 1 L29 34 L16 29 L3 34 Z"></path>' +
                    '</svg>' +
                    '<div class="marker-dot"></div>';
                  marker = new kakao.maps.CustomOverlay({
                    position: position,
                    yAnchor: 0.5,
                    xAnchor: 0.5,
                    content: markerElement
                  });
                  marker.setMap(map);
                  return;
                }
                marker.setPosition(position);
              }

              function updateHeading(heading) {
                if (!markerElement || typeof heading !== 'number' || !isFinite(heading)) return;
                markerElement.style.setProperty('--heading', (heading % 360) + 'deg');
              }

              function updateRoute(segments) {
                segments.forEach(function(segment, index) {
                  var linePath = segment.map(function(point) {
                    return new kakao.maps.LatLng(point[0], point[1]);
                  });
                  if (!polylines[index]) {
                    polylines[index] = new kakao.maps.Polyline({
                      map: map,
                      path: linePath,
                      strokeWeight: 5,
                      strokeColor: '#0081D5',
                      strokeOpacity: 0.9,
                      strokeStyle: 'solid'
                    });
                  } else {
                    polylines[index].setPath(linePath);
                  }
                });
                while (polylines.length > segments.length) {
                  polylines.pop().setMap(null);
                }
              }

              function updateLocation(payload) {
                if (!map || !payload || !payload.coord) return;
                var position = toLatLng(payload.coord);
                ensureMarker(position);
                updateHeading(payload.heading);

                var pathSegments = payload.pathSegments ||
                  (payload.path && payload.path.length ? [payload.path] : []);
                var pointCount = pathSegments.reduce(function(total, segment) {
                  return total + segment.length;
                }, 0);
                updateRoute(pathSegments);

                if (payload.forceCenter || !hasCentered || pointCount % 5 === 0) {
                  map.setCenter(position);
                  hasCentered = true;
                }
              }

              kakao.maps.load(function() {
                map = new kakao.maps.Map(document.getElementById('map'), {
                  center: new kakao.maps.LatLng(${center.lat}, ${center.lng}),
                  level: 4
                });
                map.setDraggable(true);
                map.setZoomable(true);
              });

              function handleMessage(payload) {
                if (!payload) return;
                if (payload.type === 'HEADING_UPDATE') {
                  updateHeading(payload.heading);
                  return;
                }
                if (payload.type === 'LOCATION_UPDATE') {
                  updateLocation(payload);
                }
              }

              document.addEventListener('message', function(event) {
                try { handleMessage(JSON.parse(event.data)); } catch (e) {}
              });
              window.addEventListener('message', function(event) {
                try { handleMessage(JSON.parse(event.data)); } catch (e) {}
              });
            })();
          </script>
        </body>
      </html>`;
  }, [initialCoord]);

  const pushCurrentLocationToMap = () => {
    if (!currentCoord) return;
    webViewRef.current?.postMessage(
      JSON.stringify({
        type: 'LOCATION_UPDATE',
        coord: currentCoord,
        pathSegments: splitPathBySegmentStartIndices(
          pathCoordinatesRef.current,
          pathSegmentStartIndicesRef.current,
        ),
        heading: headingRef.current,
      })
    );
  };

  return (
    <View style={styles.container}>
      {mapLoadError ? (
        <View style={[styles.mapBackground, styles.mapFallback]} />
      ) : (
        <WebView
          ref={webViewRef}
          key="walk-active-map"
          originWhitelist={['*']}
          source={{ html: kakaoHtml }}
          style={styles.mapBackground}
          javaScriptEnabled
          domStorageEnabled
          cacheEnabled={false}
          onLoadStart={() => {
            setMapReady(false);
            setMapLoadError(false);
          }}
          onLoadEnd={() => {
            setMapReady(true);
            pushCurrentLocationToMap();
          }}
          onError={() => {
            if (!mapReady) setMapLoadError(true);
          }}
          onHttpError={() => {
            if (!mapReady) setMapLoadError(true);
          }}
        />
      )}

      <Animated.View style={[styles.statusBadge, { opacity: badgeAnim }]}>
        <Text style={styles.statusBadgeText}>{`${petName}와(과) 산책 중입니다`}</Text>
      </Animated.View>

      <View style={[styles.bottomSheet, { height: 250 + insets.bottom, paddingBottom: 24 + insets.bottom }]}>
        <View style={styles.metricsRow}>
          <View style={styles.metricBox}><Text style={styles.metricValue}>{distanceText}</Text><Text style={styles.metricLabel}>거리(km)</Text></View>
          <View style={styles.metricDivider} />
          <View style={styles.metricBox}><Text style={[styles.metricValue, isPaused && styles.metricValuePaused]}>{timerText}</Text><Text style={styles.metricLabel}>시간(분)</Text></View>
        </View>

        <View style={styles.buttonRow}>
          <TouchableOpacity activeOpacity={0.85} onPress={handlePauseToggle}><Image source={require('../assets/btn_pause.png')} style={styles.controlButton} /></TouchableOpacity>
          <TouchableOpacity activeOpacity={0.85} onPress={handleStop}><Image source={require('../assets/btn_stop.png')} style={styles.controlButton} /></TouchableOpacity>
        </View>
      </View>

      <Modal visible={showConfirmModal} transparent animationType="fade" onRequestClose={handleConfirmNo}>
        <View style={styles.modalOverlay}><View style={styles.confirmModal}><Text style={styles.confirmText}>산책을 종료하시겠습니까?</Text><View style={styles.confirmButtons}><TouchableOpacity activeOpacity={0.9} onPress={handleConfirmNo} style={styles.confirmNoButton}><Text style={styles.confirmNoText}>아니요</Text></TouchableOpacity><CustomButton text="네" onPress={handleConfirmYes} width={110} /></View></View></View>
      </Modal>

      <Modal visible={showResultModal} transparent animationType="fade" onRequestClose={handleResultConfirm}>
        <View style={styles.modalOverlay}>
          <View style={styles.resultModal}>
            <Text style={styles.resultTitle}>오늘의 산책 기록</Text>
            <View style={styles.resultSection}>
              <Text style={styles.resultSubtitle}>함께한 반려동물</Text>
              <View style={styles.resultAvatarWrapper}>
                <Image source={petImage} style={styles.resultAvatar} />
                <Text style={styles.resultPetName}>{displayPetName}</Text>
              </View>
            </View>
            <View style={[styles.resultSection, styles.resultSectionSpacing]}>
              <Text style={styles.resultSubtitle}>산책 기록</Text>
              <View style={styles.resultTexts}>
                <Text style={styles.resultInfoText}>{formatDateLabel(resultStartDate)} {formatPeriod(resultStartTimeText)} {resultStartTimeText} ~ {formatPeriod(resultEndTimeText)} {resultEndTimeText}</Text>
                <Text style={styles.resultInfoText}>{resultDistanceText}km, {resultDuration}</Text>
              </View>
            </View>
            <View style={styles.resultButtonContainer}><CustomButton text={isSubmitting ? '저장 중...' : '확인'} onPress={handleResultConfirm} width={230} disabled={isSubmitting} /></View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#E5E7EB' }, mapBackground: { flex: 1, backgroundColor: '#DCE2EA' }, mapFallback: { backgroundColor: '#E9ECEF' },
  statusBadge: { position: 'absolute', top: 70, alignSelf: 'center', width: 180, height: 32, borderRadius: 12, backgroundColor: '#7B7C7D', alignItems: 'center', justifyContent: 'center' },
  statusBadgeText: { color: '#FFF', fontSize: 12, fontWeight: '500' },
  bottomSheet: { position: 'absolute', left: 0, right: 0, bottom: 0, borderTopLeftRadius: 20, borderTopRightRadius: 20, backgroundColor: '#FFF', paddingTop: 34, paddingHorizontal: 24 },
  metricsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginHorizontal: 12 },
  metricBox: { flex: 1, alignItems: 'center' }, metricValue: { color: '#3C4144', fontSize: 32, fontWeight: '500' }, metricValuePaused: { color: '#EF5F5F' }, metricLabel: { marginTop: 8, color: '#7B7C7D', fontSize: 14, fontWeight: '500' }, metricDivider: { width: 1, height: 56, backgroundColor: '#EAECEE', marginHorizontal: 12 },
  buttonRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 18, gap: 28 }, controlButton: { width: 82, height: 82, resizeMode: 'contain' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  confirmModal: { width: 290, paddingVertical: 30, paddingHorizontal: 30, borderRadius: 16, backgroundColor: '#FFF', alignItems: 'center' }, confirmText: { color: '#000', fontSize: 20, fontWeight: '700', textAlign: 'center' }, confirmButtons: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', marginTop: 24 },
  confirmNoButton: { width: 110, height: 55, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: '#E1E1E1' }, confirmNoText: { fontSize: 18, fontWeight: '600', color: '#7B7C7D' },
  resultModal: { width: 290, paddingVertical: 30, paddingHorizontal: 30, borderRadius: 16, backgroundColor: '#FFF' }, resultTitle: { color: '#000', fontSize: 20, fontWeight: '700', textAlign: 'center' }, resultSection: { marginTop: 16 }, resultSectionSpacing: { marginTop: 8 }, resultSubtitle: { color: '#3C4144', fontSize: 16, fontWeight: '700' }, resultAvatarWrapper: { marginTop: 8, alignItems: 'flex-start' }, resultAvatar: { width: 60, height: 60, borderRadius: 30 }, resultTexts: { marginTop: 4 }, resultInfoText: { color: '#7B7C7D', fontSize: 14, fontWeight: '600', marginTop: 4 }, resultButtonContainer: { marginTop: 24, alignItems: 'center' },
  resultPetName: { marginTop: 8, color: '#3C4144', fontSize: 14, fontWeight: '600' },
});
