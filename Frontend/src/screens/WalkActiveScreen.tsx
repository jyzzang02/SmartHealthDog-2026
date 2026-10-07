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
import { useLatestWalkLightSample } from '../hooks/useLatestWalkLightSample';
import type { LatestWalkLightSampleSource } from '../hooks/useLatestWalkLightSample';
import { RootStackParamList } from '../../App';
import CustomButton from '../components/CustomButton';
import {
  endPetWalk,
  findActivePetWalkId,
  getPetTodaySunlight,
  startPetWalk,
  uploadPetLightSamples,
} from '../api/walks';
import type { LightSample, SunlightTodayResponse, WalkCoordinate } from '../api/walks';
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

type WalkLocationTrackingModule = LatestWalkLightSampleSource & {
  start: (walkId: number, startedAtMs: number) => Promise<void>;
  stop: () => Promise<void>;
  clearLocations: () => Promise<void>;
  getLocations: () => Promise<BackgroundWalkLocation[]>;
  getLightSamples: (walkId: number) => Promise<LightSample[]>;
  acknowledgeLightSamples: (walkId: number, ids: string[]) => Promise<void>;
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
const SUNLIGHT_TARGET_LUX_MINUTES = 60_000;
const LIGHT_BATCH_SIZE = 100;

function SunlightProgressCard({
  data,
  lastMeasuredLux,
  isUnavailable = false,
}: {
  data: SunlightTodayResponse | null;
  lastMeasuredLux: number | null;
  isUnavailable?: boolean;
}) {
  const targetLuxMinutes = data?.target_lux_minutes ?? SUNLIGHT_TARGET_LUX_MINUTES;
  const achievedLuxMinutes = data?.achieved_lux_minutes ?? null;
  const progressPercent = data && Number.isFinite(data.progress_percent)
    ? Math.max(0, Math.min(100, data.progress_percent))
    : achievedLuxMinutes === null || targetLuxMinutes <= 0
      ? 0
      : Math.max(0, Math.min(100, achievedLuxMinutes / targetLuxMinutes * 100));

  return (
    <View style={styles.sunlightCard}>
      <View style={styles.sunlightCardHeader}>
        <Text style={styles.sunlightCardTitle}>오늘의 일광 노출</Text>
        <Text style={styles.sunlightCardPercent}>{achievedLuxMinutes === null ? '--' : `${progressPercent}%`}</Text>
      </View>
      <Text style={styles.sunlightCardAmount}>
        <Text style={styles.sunlightCardAchieved}>{achievedLuxMinutes === null ? '--' : achievedLuxMinutes.toLocaleString()}</Text>
        {' / ' + targetLuxMinutes.toLocaleString() + ' Lux·min'}
      </Text>
      <View style={styles.sunlightProgressTrack}>
        <View style={[styles.sunlightProgressFill, { width: `${progressPercent}%` }]} />
      </View>
      <View style={styles.sunlightCardFooter}>
        <Text style={styles.sunlightCardNote}>
          {isUnavailable
            ? '오늘의 일광 정보를 불러오지 못했습니다'
            : data
              ? data.qualifying_minutes + '분 달성 · 측정 ' + data.sample_count + '회'
              : '오늘의 일광 정보를 불러오는 중...'}
        </Text>
        <Text style={styles.sunlightCardLastLux}>
          마지막 측정 {lastMeasuredLux === null ? '--' : Math.round(lastMeasuredLux).toLocaleString()} Lux
        </Text>
      </View>
    </View>
  );
}

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
  const [todaySunlight, setTodaySunlight] = useState<SunlightTodayResponse | null>(null);
  const [sunlightUnavailable, setSunlightUnavailable] = useState(false);

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
  const lightUploadPromiseRef = useRef<Promise<void> | null>(null);

  const lastMeasuredLux = useLatestWalkLightSample(
    isSessionReady ? walkIdRef.current : null,
    Platform.OS === 'android' ? walkLocationTrackingModule : undefined,
    isPaused || showResultModal,
  );

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

  const flushLightSamples = useCallback(async () => {
    if (Platform.OS !== 'android' || !walkLocationTrackingModule || !walkIdRef.current) return;
    if (lightUploadPromiseRef.current) return lightUploadPromiseRef.current;
    const walkId = walkIdRef.current;
    const upload = (async () => {
      const pending = await walkLocationTrackingModule.getLightSamples(walkId);
      if (pending.length > 0) {
        console.info('[walk-light] upload:pending', {
          walkId,
          count: pending.length,
          firstLux: pending[0].lux,
          firstMeasuredAt: pending[0].measured_at,
        });
        for (const sample of pending) {
          const secondsFromWalkStart = (Date.parse(sample.measured_at) - timerStateRef.current.startedAtMs) / 1000;
          console.info('[walk-light] upload:sample', {
            walkId,
            lux: sample.lux,
            measuredAt: sample.measured_at,
            secondsFromWalkStart,
            inFirstWindow: secondsFromWalkStart >= 0 && secondsFromWalkStart < 600,
          });
        }
      }
      for (let index = 0; index < pending.length; index += LIGHT_BATCH_SIZE) {
        const batch = pending.slice(index, index + LIGHT_BATCH_SIZE);
        const response = await uploadPetLightSamples(petId, walkId, batch);
        const result = response.result;
        console.info('[walk-light] upload:response', { walkId, count: batch.length, result });
        if (
          result?.received_count !== batch.length ||
          result.saved_count + result.duplicate_count !== batch.length
        ) {
          throw new Error('조도 기록 일부가 저장되지 않아 전송을 다시 시도합니다.');
        }
        await walkLocationTrackingModule.acknowledgeLightSamples(
          walkId,
          batch.map((sample) => sample.client_sample_id),
        );
      }
      if (pending.length > 0 && appStateRef.current === 'active') {
        try {
          const sunlight = await getPetTodaySunlight(petId);
          console.info('[walk-light] summary:after-upload', {
            walkId,
            sampleCount: sunlight.sample_count,
            qualifyingMinutes: sunlight.qualifying_minutes,
            achievedLuxMinutes: sunlight.achieved_lux_minutes,
          });
          setTodaySunlight(sunlight);
          setSunlightUnavailable(false);
        } catch (error) {
          console.warn('[walk-light] summary:refresh-failed', error);
          // The samples are already saved; a progress refresh can retry later.
        }
      }
    })();
    lightUploadPromiseRef.current = upload;
    try {
      await upload;
    } catch (error) {
      console.warn('[walk-light] upload:failed', { walkId, error });
      throw error;
    } finally {
      lightUploadPromiseRef.current = null;
    }
  }, [petId]);

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
    let isMounted = true;
    getPetTodaySunlight(petId)
      .then((sunlight) => {
        if (isMounted) {
          console.info('[walk-light] summary:initial', {
            sampleCount: sunlight.sample_count,
            qualifyingMinutes: sunlight.qualifying_minutes,
            achievedLuxMinutes: sunlight.achieved_lux_minutes,
          });
          setTodaySunlight(sunlight);
          setSunlightUnavailable(false);
        }
      })
      .catch((error) => {
        console.warn('[walk-light] summary:initial-failed', error);
        if (isMounted) setSunlightUnavailable(true);
      });
    return () => {
      isMounted = false;
    };
  }, [isSessionReady, petId]);

  useEffect(() => {
    if (!isSessionReady) return;
    flushLightSamples().catch(() => undefined);
    const interval = setInterval(() => {
      if (appStateRef.current === 'active') {
        flushLightSamples().catch(() => undefined);
      }
    }, 60_000);
    return () => clearInterval(interval);
  }, [flushLightSamples, isSessionReady]);

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
          if (!isActive) return;
          if (!pauseTrackingRef.current) {
            await walkLocationTrackingModule.start(
              walkIdRef.current!,
              timerStateRef.current.startedAtMs,
            );
            console.info('[walk-light] service:started', {
              walkId: walkIdRef.current,
              startedAt: new Date(timerStateRef.current.startedAtMs).toISOString(),
            });
          }
          nativeTrackingStarted = !pauseTrackingRef.current;
        } catch (error) {
          console.warn('[walk-light] service:start-failed', error);
          // Foreground location tracking remains available if native tracking cannot start.
        }
      }

      await mergeBackgroundLocations();
      if (!isActive) return;

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

      if (!isActive) return;
      Geolocation.getCurrentPosition((pos) => {
        if (isActive) showInitialLocationPreview(pos);
      }, () => {}, {
        enableHighAccuracy: false,
        timeout: 5000,
        maximumAge: 60_000,
      });
      Geolocation.getCurrentPosition((pos) => {
        if (isActive) recordForegroundLocation(pos);
      }, () => {}, {
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
        flushLightSamples().catch(() => undefined);
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
    flushLightSamples,
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
        : walkLocationTrackingModule.start(
          walkIdRef.current!,
          timerStateRef.current.startedAtMs,
        );
      operation.then(() => {
        if (timerStateRef.current.isPaused) flushLightSamples().catch(() => undefined);
      }).catch(() => undefined);
    }
  };

  const handleStop = useCallback(async () => {
    if (!isSessionReady || isStoppingRef.current) return;
    isStoppingRef.current = true;
    await mergeBackgroundLocations();
    if (Platform.OS === 'android' && walkLocationTrackingModule) {
      await walkLocationTrackingModule.stop().catch(() => undefined);
    }
    flushLightSamples().catch(() => undefined);
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
    flushLightSamples,
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
      walkLocationTrackingModule.start(
        walkIdRef.current!,
        timerStateRef.current.startedAtMs,
      ).catch(() => undefined);
    }
  };

  const handleConfirmYes = () => {
    setShowConfirmModal(false);
    setShowResultModal(true);
    setTodaySunlight(null);
    setSunlightUnavailable(false);
    const refreshResult = async () => {
      try {
        await flushLightSamples();
      } catch (error) {
        console.warn('[walk-light] result:upload-failed', error);
      }
      try {
        const sunlight = await getPetTodaySunlight(petId);
        console.info('[walk-light] result:summary', {
          sampleCount: sunlight.sample_count,
          qualifyingMinutes: sunlight.qualifying_minutes,
          achievedLuxMinutes: sunlight.achieved_lux_minutes,
        });
        setTodaySunlight(sunlight);
      } catch (error) {
        console.warn('[walk-light] result:summary-failed', error);
        setSunlightUnavailable(true);
      }
    };
    refreshResult().catch(() => undefined);
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
      await flushLightSamples();
      // A sample may have arrived while an earlier upload was in flight.
      await flushLightSamples();
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

  const pushCurrentLocationToMap = (forceCenter = false) => {
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
        forceCenter,
      })
    );
  };

  return (
    <View style={styles.container}>
      {mapLoadError ? (
        <View style={[styles.mapBackground, styles.mapViewport, { bottom: 338 + insets.bottom }, styles.mapFallback]} />
      ) : (
        <WebView
          ref={webViewRef}
          key="walk-active-map"
          originWhitelist={['*']}
          source={{ html: kakaoHtml }}
          style={[styles.mapBackground, styles.mapViewport, { bottom: 338 + insets.bottom }]}
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

      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel="내 위치로 이동"
        activeOpacity={0.8}
        onPress={() => pushCurrentLocationToMap(true)}
        style={[styles.recenterButton, { top: insets.top + 12 }]}
      >
        <View style={styles.recenterTarget}>
          <View style={styles.recenterDot} />
        </View>
      </TouchableOpacity>

      <Animated.View style={[styles.statusBadge, { opacity: badgeAnim }]}>
        <Text style={styles.statusBadgeText}>{`${petName}와(과) 산책 중입니다`}</Text>
      </Animated.View>

      <View style={[styles.bottomSheet, { height: 338 + insets.bottom, paddingBottom: 8 + insets.bottom }]}>
        <SunlightProgressCard data={todaySunlight} lastMeasuredLux={lastMeasuredLux} isUnavailable={sunlightUnavailable} />
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
            <View style={styles.resultSunlightSection}>
              <SunlightProgressCard data={todaySunlight} lastMeasuredLux={lastMeasuredLux} isUnavailable={sunlightUnavailable} />
            </View>
            <View style={styles.resultButtonContainer}><CustomButton text={isSubmitting ? '저장 중...' : '확인'} onPress={handleResultConfirm} width={230} disabled={isSubmitting} /></View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  sunlightCard: { borderWidth: 1, borderColor: '#EAECEE', borderRadius: 16, padding: 14, backgroundColor: '#FFF', marginBottom: 18 },
  sunlightCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sunlightCardTitle: { color: '#3C4144', fontSize: 14, fontWeight: '600' },
  sunlightCardPercent: { color: '#7B7C7D', fontSize: 13, fontWeight: '600' },
  sunlightCardAmount: { color: '#7B7C7D', fontSize: 13, marginTop: 10 },
  sunlightCardAchieved: { color: '#F4B844', fontWeight: '700' },
  sunlightProgressTrack: { height: 8, borderRadius: 4, backgroundColor: '#F2F4F7', marginTop: 12, overflow: 'hidden' },
  sunlightProgressFill: { height: 8, backgroundColor: '#FFC94D' },
  sunlightCardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 },
  sunlightCardNote: { color: '#7B7C7D', fontSize: 12, flexShrink: 1 },
  sunlightCardLastLux: { color: '#7B7C7D', fontSize: 12, marginLeft: 8 },
  resultSunlightSection: { marginTop: 16 },
  container: { flex: 1, backgroundColor: '#E5E7EB' }, mapBackground: { backgroundColor: '#DCE2EA' }, mapViewport: { position: 'absolute', top: 0, left: 0, right: 0 }, mapFallback: { backgroundColor: '#E9ECEF' },
  recenterButton: { position: 'absolute', right: 16, width: 44, height: 44, borderRadius: 22, backgroundColor: '#FFF', alignItems: 'center', justifyContent: 'center', elevation: 4, shadowColor: '#000', shadowOpacity: 0.16, shadowRadius: 5, shadowOffset: { width: 0, height: 2 } },
  recenterTarget: { width: 22, height: 22, borderWidth: 2, borderColor: '#0081D5', borderRadius: 11, alignItems: 'center', justifyContent: 'center' }, recenterDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#0081D5' },
  statusBadge: { position: 'absolute', top: 70, alignSelf: 'center', width: 180, height: 32, borderRadius: 12, backgroundColor: '#7B7C7D', alignItems: 'center', justifyContent: 'center' },
  statusBadgeText: { color: '#FFF', fontSize: 12, fontWeight: '500' },
  bottomSheet: { position: 'absolute', left: 0, right: 0, bottom: 0, borderTopLeftRadius: 20, borderTopRightRadius: 20, backgroundColor: '#FFF', paddingTop: 24, paddingHorizontal: 24 },
  metricsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginHorizontal: 12 },
  metricBox: { flex: 1, alignItems: 'center' }, metricValue: { color: '#3C4144', fontSize: 32, fontWeight: '500' }, metricValuePaused: { color: '#EF5F5F' }, metricLabel: { marginTop: 8, color: '#7B7C7D', fontSize: 14, fontWeight: '500' }, metricDivider: { width: 1, height: 56, backgroundColor: '#EAECEE', marginHorizontal: 12 },
  buttonRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 14, gap: 28 }, controlButton: { width: 72, height: 72, resizeMode: 'contain' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  confirmModal: { width: 290, paddingVertical: 30, paddingHorizontal: 30, borderRadius: 16, backgroundColor: '#FFF', alignItems: 'center' }, confirmText: { color: '#000', fontSize: 20, fontWeight: '700', textAlign: 'center' }, confirmButtons: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', marginTop: 24 },
  confirmNoButton: { width: 110, height: 55, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: '#E1E1E1' }, confirmNoText: { fontSize: 18, fontWeight: '600', color: '#7B7C7D' },
  resultModal: { width: 290, paddingVertical: 30, paddingHorizontal: 30, borderRadius: 16, backgroundColor: '#FFF' }, resultTitle: { color: '#000', fontSize: 20, fontWeight: '700', textAlign: 'center' }, resultSection: { marginTop: 16 }, resultSectionSpacing: { marginTop: 8 }, resultSubtitle: { color: '#3C4144', fontSize: 16, fontWeight: '700' }, resultAvatarWrapper: { marginTop: 8, alignItems: 'flex-start' }, resultAvatar: { width: 60, height: 60, borderRadius: 30 }, resultTexts: { marginTop: 4 }, resultInfoText: { color: '#7B7C7D', fontSize: 14, fontWeight: '600', marginTop: 4 }, resultButtonContainer: { marginTop: 24, alignItems: 'center' },
  resultPetName: { marginTop: 8, color: '#3C4144', fontSize: 14, fontWeight: '600' },
});
