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
} from 'react-native';
import type { AppStateStatus } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { WebView } from 'react-native-webview';
import Geolocation from 'react-native-geolocation-service';
import type { GeoPosition } from 'react-native-geolocation-service';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootStackParamList } from '../../App';
import CustomButton from '../components/CustomButton';
import { createPetWalk } from '../api/walks';
import type { WalkCoordinate } from '../api/walks';
import {
  clearActiveWalkSession,
  loadActiveWalkSession,
  saveActiveWalkSession,
} from '../storage/walkSessionStorage';
import type { ActiveWalkSession, WalkLocation } from '../storage/walkSessionStorage';
import {
  createWalkTimer,
  getElapsedSeconds,
  pauseWalkTimer,
  resumeWalkTimer,
} from '../utils/walkTimer';

type RouteProps = RouteProp<RootStackParamList, 'WalkActive'>;
type NavigationProps = NativeStackNavigationProp<RootStackParamList>;

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
const toRad = (deg: number) => (deg * Math.PI) / 180;

const haversine = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const h = sinDLat * sinDLat + sinDLng * sinDLng * Math.cos(lat1) * Math.cos(lat2);
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return R * c;
};

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
  const [isSubmitting, setIsSubmitting] = useState(false);

  const timerStateRef = useRef(createWalkTimer(startedAtMs));
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const badgeAnim = useRef(new Animated.Value(0.6)).current;
  const watchIdRef = useRef<number | null>(null);
  const lastCoordRef = useRef<{ lat: number; lng: number } | null>(null);
  const pauseTrackingRef = useRef(false);
  const hasInitialCoordRef = useRef(false);
  const pathCoordinatesRef = useRef<WalkCoordinate[]>([]);
  const initialCoordRef = useRef<WalkLocation | null>(null);
  const currentCoordRef = useRef<WalkLocation | null>(null);
  const distanceKmRef = useRef(0);
  const persistQueueRef = useRef<Promise<void>>(Promise.resolve());
  const lastPersistedAtRef = useRef(0);
  const isFinishingRef = useRef(false);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const webViewRef = useRef<WebView>(null);

  const startDate = useMemo(() => new Date(startedAtMs), [startedAtMs]);
  const startTimeText = useMemo(() => formatClock(startDate), [startDate]);
  const startPeriod = useMemo(() => formatPeriod(startTimeText), [startTimeText]);
  const endDate = useMemo(() => new Date(startDate.getTime() + elapsedSeconds * 1000), [startDate, elapsedSeconds]);
  const endTimeText = useMemo(() => formatClock(endDate), [endDate]);
  const endPeriod = useMemo(() => formatPeriod(endTimeText), [endTimeText]);
  const dateLabel = useMemo(() => formatDateLabel(startDate), [startDate]);
  const displayPetName = petName?.trim() || '이름 없음';

  const queueSessionSave = useCallback((force = false) => {
    if (isFinishingRef.current) return;
    const now = Date.now();
    if (!force && now - lastPersistedAtRef.current < 5000) return;
    lastPersistedAtRef.current = now;

    const snapshot: ActiveWalkSession = {
      version: 1,
      petId,
      timer: { ...timerStateRef.current },
      distanceKm: distanceKmRef.current,
      pathCoordinates: pathCoordinatesRef.current.map((point) => [...point] as WalkCoordinate),
      initialCoord: initialCoordRef.current ? { ...initialCoordRef.current } : null,
      currentCoord: currentCoordRef.current ? { ...currentCoordRef.current } : null,
      lastCoord: lastCoordRef.current ? { ...lastCoordRef.current } : null,
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
      const savedSession = await loadActiveWalkSession(petId);
      if (!isMounted) return;

      if (savedSession) {
        timerStateRef.current = savedSession.timer;
        setStartedAtMs(savedSession.timer.startedAtMs);
        setElapsedSeconds(getElapsedSeconds(savedSession.timer, Date.now()));
        setIsPaused(savedSession.timer.isPaused);
        pauseTrackingRef.current = savedSession.timer.isPaused;

        distanceKmRef.current = savedSession.distanceKm;
        setDistanceKm(savedSession.distanceKm);
        pathCoordinatesRef.current = savedSession.pathCoordinates.slice();
        initialCoordRef.current = savedSession.initialCoord;
        currentCoordRef.current = savedSession.currentCoord;
        lastCoordRef.current = savedSession.lastCoord;
        hasInitialCoordRef.current = savedSession.initialCoord !== null;
        setInitialCoord(savedSession.initialCoord);
        setCurrentCoord(savedSession.currentCoord);
      } else {
        const now = Date.now();
        const timer = createWalkTimer(now);
        timerStateRef.current = timer;
        setStartedAtMs(now);
        await saveActiveWalkSession({
          version: 1,
          petId,
          timer,
          distanceKm: 0,
          pathCoordinates: [],
          initialCoord: null,
          currentCoord: null,
          lastCoord: null,
          updatedAtMs: now,
        }).catch(() => undefined);
      }

      if (isMounted) setIsSessionReady(true);
    };

    restoreSession();
    return () => {
      isMounted = false;
    };
  }, [petId]);

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

  const recordLocation = useCallback((pos: GeoPosition) => {
    const { latitude, longitude } = pos.coords;
    const current = { lat: latitude, lng: longitude };

    if (!hasInitialCoordRef.current) {
      hasInitialCoordRef.current = true;
      initialCoordRef.current = current;
      setInitialCoord(current);
    }
    currentCoordRef.current = current;
    setCurrentCoord(current);

    if (pauseTrackingRef.current) {
      lastCoordRef.current = current;
      queueSessionSave();
      return;
    }

    pathCoordinatesRef.current.push([latitude, longitude]);
    webViewRef.current?.postMessage(
      JSON.stringify({
        type: 'LOCATION_UPDATE',
        coord: current,
        path: pathCoordinatesRef.current,
      })
    );

    const previous = lastCoordRef.current;
    if (previous) {
      distanceKmRef.current += haversine(previous, current);
      setDistanceKm(distanceKmRef.current);
    }
    lastCoordRef.current = current;
    queueSessionSave();
  }, [queueSessionSave]);

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
        return granted === PermissionsAndroid.RESULTS.GRANTED;
      }
      return true;
    };

    const startWatch = async () => {
      const ok = await requestPermission();
      if (!ok || !isActive) return;

      watchIdRef.current = Geolocation.watchPosition(
        (pos: GeoPosition) => {
          if (isActive) recordLocation(pos);
        },
        () => {},
        { enableHighAccuracy: true, distanceFilter: 1, interval: 2000, fastestInterval: 1000 }
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
  }, [isSessionReady, recordLocation]);

  useEffect(() => {
    if (!isSessionReady) return;

    const subscription = AppState.addEventListener('change', (nextState) => {
      const previousState = appStateRef.current;

      if (nextState === 'active' && previousState !== 'active') {
        syncElapsedTime();
        Geolocation.getCurrentPosition(recordLocation, () => {}, {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 5000,
        });
      } else if (nextState === 'background' || nextState === 'inactive') {
        syncElapsedTime();
        queueSessionSave(true);
      }

      appStateRef.current = nextState;
    });

    return () => subscription.remove();
  }, [isSessionReady, queueSessionSave, recordLocation, syncElapsedTime]);

  const handlePauseToggle = () => {
    const now = Date.now();
    timerStateRef.current = isPaused
      ? resumeWalkTimer(timerStateRef.current, now)
      : pauseWalkTimer(timerStateRef.current, now);
    pauseTrackingRef.current = timerStateRef.current.isPaused;
    setIsPaused(timerStateRef.current.isPaused);
    setElapsedSeconds(getElapsedSeconds(timerStateRef.current, now));
    queueSessionSave(true);
  };

  const handleStop = () => {
    const now = Date.now();
    timerStateRef.current = pauseWalkTimer(timerStateRef.current, now);
    setElapsedSeconds(getElapsedSeconds(timerStateRef.current, now));
    setIsPaused(true);
    pauseTrackingRef.current = true;
    queueSessionSave(true);
    setShowConfirmModal(true);
  };

  const handleConfirmNo = () => {
    const now = Date.now();
    timerStateRef.current = resumeWalkTimer(timerStateRef.current, now);
    setShowConfirmModal(false);
    setIsPaused(false);
    pauseTrackingRef.current = false;
    queueSessionSave(true);
  };

  const handleConfirmYes = () => {
    setShowConfirmModal(false);
    setShowResultModal(true);
  };

  const handleResultConfirm = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      const finalElapsedSeconds = getElapsedSeconds(timerStateRef.current, Date.now());
      await createPetWalk(petId, {
        startTime: startDate.toISOString(),
        endTime: new Date(startDate.getTime() + finalElapsedSeconds * 1000).toISOString(),
        distanceKm: Number(distanceKmRef.current.toFixed(3)),
        pathCoordinates: pathCoordinatesRef.current,
      });
      isFinishingRef.current = true;
      await persistQueueRef.current.catch(() => undefined);
      await clearActiveWalkSession().catch(() => undefined);
      navigation.goBack();
    } catch (error) {
      const message = error instanceof Error ? error.message : '산책 기록 저장에 실패했습니다.';
      Alert.alert('오류', message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const distanceText = useMemo(() => `${distanceKm.toFixed(1)}`, [distanceKm]);
  const timerText = useMemo(() => formatTime(elapsedSeconds), [elapsedSeconds]);
  const resultDuration = useMemo(() => formatDurationMinutes(elapsedSeconds), [elapsedSeconds]);
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
              width: 22px;
              height: 22px;
              border-radius: 50%;
              background: #0081D5;
              border: 4px solid #FFFFFF;
              box-shadow: 0 2px 10px rgba(0, 129, 213, 0.55);
              position: relative;
            }
            .current-marker:after {
              content: '';
              position: absolute;
              left: -10px;
              top: -10px;
              width: 34px;
              height: 34px;
              border-radius: 50%;
              border: 2px solid rgba(0, 129, 213, 0.35);
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
              var polyline;
              var hasCentered = false;

              function toLatLng(coord) {
                return new kakao.maps.LatLng(coord.lat, coord.lng);
              }

              function ensureMarker(position) {
                if (!marker) {
                  marker = new kakao.maps.CustomOverlay({
                    position: position,
                    yAnchor: 0.5,
                    xAnchor: 0.5,
                    content: '<div class="current-marker"></div>'
                  });
                  marker.setMap(map);
                  return;
                }
                marker.setPosition(position);
              }

              function updateLocation(payload) {
                if (!map || !payload || !payload.coord) return;
                var position = toLatLng(payload.coord);
                ensureMarker(position);

                var linePath = (payload.path || []).map(function(point) {
                  return new kakao.maps.LatLng(point[0], point[1]);
                });

                if (!polyline) {
                  polyline = new kakao.maps.Polyline({
                    map: map,
                    path: linePath,
                    strokeWeight: 5,
                    strokeColor: '#0081D5',
                    strokeOpacity: 0.9,
                    strokeStyle: 'solid'
                  });
                } else {
                  polyline.setPath(linePath);
                }

                if (!hasCentered || linePath.length % 5 === 0) {
                  map.setCenter(position);
                  hasCentered = true;
                }
              }

              kakao.maps.load(function() {
                map = new kakao.maps.Map(document.getElementById('map'), {
                  center: new kakao.maps.LatLng(${center.lat}, ${center.lng}),
                  level: 4
                });
              });

              document.addEventListener('message', function(event) {
                try { updateLocation(JSON.parse(event.data)); } catch (e) {}
              });
              window.addEventListener('message', function(event) {
                try { updateLocation(JSON.parse(event.data)); } catch (e) {}
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
        path: pathCoordinatesRef.current,
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
                <Text style={styles.resultInfoText}>{dateLabel} {startPeriod} {startTimeText} ~ {endPeriod} {endTimeText}</Text>
                <Text style={styles.resultInfoText}>{distanceText}km, {resultDuration}</Text>
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
