import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  Animated,
  Easing,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { WebView } from 'react-native-webview';
import { RootStackParamList } from '../../App';
import { deleteWalk, endPetWalk, getWalkDetail, WalkCoordinate, WalkRecordDto } from '../api/walks';

type WalkLogDetailRouteProp = RouteProp<RootStackParamList, 'WalkLogDetail'>;
type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const formatDateLabel = (dateText: string) => dateText.replace(/\./g, '. ').trim();

const parseDuration = (duration: string) => {
  const cleaned = duration.replace(/\s/g, '');
  const [h = '0', m = '0', s = '0'] = cleaned.split(':');
  const hours = parseInt(h, 10) || 0;
  const minutes = parseInt(m, 10) || 0;
  const seconds = parseInt(s, 10) || 0;
  return { hours, minutes, seconds };
};

const addDurationToTime = (startTime: string, duration: string) => {
  const [sh = '0', sm = '0'] = startTime.split(':');
  const startMinutes = (parseInt(sh, 10) || 0) * 60 + (parseInt(sm, 10) || 0);
  const { hours, minutes, seconds } = parseDuration(duration);
  const durationMinutesTotal = hours * 60 + minutes + seconds / 60;
  const totalMinutes = startMinutes + durationMinutesTotal;
  const endHours = Math.floor(totalMinutes / 60) % 24;
  const endMinutes = Math.round(totalMinutes % 60);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${pad(endHours)}:${pad(endMinutes)}`;
};

const getPeriodLabel = (time: string) => {
  const hour = parseInt(time.split(':')[0] || '0', 10);
  return hour >= 12 ? '오후' : '오전';
};

const formatTime = (time: string) => {
  const [h = '0', m = '0'] = time.split(':');
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${pad(parseInt(h, 10) || 0)}:${pad(parseInt(m, 10) || 0)}`;
};

const formatDurationMinutes = (duration: string) => {
  const { hours, minutes, seconds } = parseDuration(duration);
  const totalMinutes = hours * 60 + minutes + seconds / 60;
  return `${Math.round(totalMinutes)}분`;
};

const formatDateFromIso = (value?: string) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;
};

const formatClockFromIso = (value?: string) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
};

const formatDurationFromSeconds = (durationSec?: number) => `${Math.round((durationSec ?? 0) / 60)}분`;

const formatDurationClock = (durationSec?: number) => {
  const total = durationSec ?? 0;
  const h = Math.floor(total / 3600).toString().padStart(2, '0');
  const m = Math.floor((total % 3600) / 60).toString().padStart(2, '0');
  const s = Math.floor(total % 60).toString().padStart(2, '0');
  return `${h}:${m}:${s}`;
};

const normalizePathCoordinates = (coordinates?: Array<[number, number]> | WalkCoordinate[]) =>
  (coordinates || [])
    .filter((point) => Array.isArray(point) && point.length >= 2)
    .map(([lat, lng]) => ({ lat, lng }))
    .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng));

export default function WalkLogDetailScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<WalkLogDetailRouteProp>();
  const { record } = route.params;
  const pulseAnim = useRef(new Animated.Value(0.6)).current;
  const [walkDetail, setWalkDetail] = useState<WalkRecordDto | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isEnding, setIsEnding] = useState(false);

  const loadDetail = useCallback(async () => {
    if (!record.id) return;
    setIsLoading(true);
    try {
      const detail = await getWalkDetail(record.id);
      setWalkDetail(detail);
    } catch (error) {
      console.warn('[walk] failed to load walk detail', error);
    } finally {
      setIsLoading(false);
    }
  }, [record.id]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  const resolved = useMemo(() => {
    const startIso = walkDetail?.start_time ?? walkDetail?.startTime;
    const endIso = walkDetail?.end_time ?? walkDetail?.endTime;
    const durationSec = walkDetail?.duration;
    const distanceKm = walkDetail?.distance;

    const date = formatDateFromIso(startIso) || record.date;
    const startTime = formatClockFromIso(startIso) || record.startTime || '00:00';
    const endTime = formatClockFromIso(endIso) || record.endTime || addDurationToTime(startTime, record.duration);

    return {
      date,
      startTime,
      endTime,
      distance: typeof distanceKm === 'number' ? `${distanceKm.toFixed(1)}km` : record.distance,
      durationText: typeof durationSec === 'number' ? formatDurationFromSeconds(durationSec) : formatDurationMinutes(record.duration),
      durationClock: typeof durationSec === 'number' ? formatDurationClock(durationSec) : record.duration,
    };
  }, [record, walkDetail]);

  const pathPoints = useMemo(() => {
    const detailPath = walkDetail?.path_coordinates ?? walkDetail?.pathCoordinates;
    return normalizePathCoordinates(detailPath?.length ? detailPath : record.pathCoordinates);
  }, [record.pathCoordinates, walkDetail]);

  const kakaoMapHtml = useMemo(() => {
    const fallbackCenter = { lat: 37.5665, lng: 126.9780 };
    const center = pathPoints[0] ?? fallbackCenter;
    const serializedPath = JSON.stringify(pathPoints);

    return `<!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="initial-scale=1.0, maximum-scale=1.0" />
          <style>
            html, body, #map { margin: 0; padding: 0; width: 100%; height: 100%; background: #E9ECEF; }
          </style>
          <script src="https://dapi.kakao.com/v2/maps/sdk.js?appkey=e65e93f752b1590bf9b8be83566dd5b6&autoload=false"></script>
        </head>
        <body>
          <div id="map"></div>
          <script>
            (function() {
              var path = ${serializedPath};
              kakao.maps.load(function() {
                var map = new kakao.maps.Map(document.getElementById('map'), {
                  center: new kakao.maps.LatLng(${center.lat}, ${center.lng}),
                  level: path.length > 1 ? 5 : 4
                });
                map.setDraggable(true);
                map.setZoomable(true);

                if (path.length > 0) {
                  var bounds = new kakao.maps.LatLngBounds();
                  var linePath = path.map(function(point) {
                    var latLng = new kakao.maps.LatLng(point.lat, point.lng);
                    bounds.extend(latLng);
                    return latLng;
                  });

                  new kakao.maps.Polyline({
                    map: map,
                    path: linePath,
                    strokeWeight: 5,
                    strokeColor: '#0081D5',
                    strokeOpacity: 0.9,
                    strokeStyle: 'solid'
                  });

                  new kakao.maps.Marker({ map: map, position: linePath[0] });
                  if (linePath.length > 1) {
                    new kakao.maps.Marker({ map: map, position: linePath[linePath.length - 1] });
                    map.setBounds(bounds);
                  }
                }
              });
            })();
          </script>
        </body>
      </html>`;
  }, [pathPoints]);

  const handleDelete = () => {
    Alert.alert('삭제 확인', '이 산책 기록을 삭제하시겠습니까?', [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: async () => {
          if (isDeleting) return;
          setIsDeleting(true);
          try {
            await deleteWalk(record.id);
            navigation.goBack();
          } catch (error) {
            const message = error instanceof Error ? error.message : '산책 기록을 삭제하지 못했습니다.';
            Alert.alert('오류', message);
          } finally {
            setIsDeleting(false);
          }
        },
      },
    ]);
  };

  const handleEndWalk = async () => {
    if (isEnding) return;
    setIsEnding(true);
    try {
      const endedWalk = await endPetWalk(record.petId, record.id);
      setWalkDetail(endedWalk);
      Alert.alert('완료', '산책 종료 처리가 완료되었습니다.');
    } catch (error) {
      const message = error instanceof Error ? error.message : '산책 종료 처리에 실패했습니다.';
      Alert.alert('오류', message);
    } finally {
      setIsEnding(false);
    }
  };

  const startPeriod = useMemo(() => getPeriodLabel(resolved.startTime), [resolved.startTime]);
  const endPeriod = useMemo(() => getPeriodLabel(resolved.endTime), [resolved.endTime]);
  const headerTitle = `${resolved.date} 산책 일지`;
  const formattedDate = formatDateLabel(resolved.date);
  const startTimeFormatted = formatTime(resolved.startTime);
  const endTimeFormatted = formatTime(resolved.endTime);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0.6,
          duration: 800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulseAnim]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Image source={require('../assets/icon_navBack.png')} style={styles.backIcon} />
        </TouchableOpacity>
        <View style={styles.logoContainer}>
          <Text style={styles.headerTitle}>{headerTitle}</Text>
        </View>
        <TouchableOpacity style={styles.deleteButton} onPress={handleDelete} disabled={isDeleting}>
          <Text style={styles.deleteButtonText}>{isDeleting ? '삭제 중' : '삭제'}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        <View style={styles.mapContainer}>
          <WebView
            key={`walk-detail-map-${record.id}-${pathPoints.length}`}
            originWhitelist={['*']}
            source={{ html: kakaoMapHtml }}
            style={styles.mapWebView}
            javaScriptEnabled
            domStorageEnabled
            cacheEnabled={false}
          />
          {pathPoints.length === 0 && (
            <Animated.View style={[styles.mapEmptyOverlay, { opacity: pulseAnim }]}>
              <Text style={styles.mapEmptyText}>저장된 산책 경로가 없습니다.</Text>
            </Animated.View>
          )}
        </View>

        {isLoading && <ActivityIndicator style={styles.loadingIndicator} color="#0081D5" />}

        <View style={styles.section}>
          <Text style={styles.subtitle}>함께한 반려동물</Text>
          <View style={styles.petAvatarWrapper}>
            <Image source={record.petImage} style={styles.petAvatar} />
          </View>
        </View>

        <View style={[styles.section, styles.sectionSpacing]}>
          <Text style={styles.subtitle}>산책 기록</Text>
          <View style={styles.walkTexts}>
            <Text style={styles.walkInfoText}>
              {formattedDate} {startPeriod} {startTimeFormatted} ~ {endPeriod} {endTimeFormatted}
            </Text>
            <Text style={styles.walkInfoText}>
              {resolved.distance}, {resolved.durationText}
            </Text>
            <Text style={styles.durationClock}>{resolved.durationClock}</Text>
          </View>
          <TouchableOpacity style={styles.endWalkButton} onPress={handleEndWalk} disabled={isEnding}>
            <Text style={styles.endWalkButtonText}>{isEnding ? '종료 처리 중' : '산책 종료 처리'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 16,
    backgroundColor: '#FFFFFF',
  },
  backButton: {
    padding: 8,
    marginRight: 8,
  },
  backIcon: {
    width: 20,
    height: 20,
  },
  logoContainer: {
    flex: 1,
    alignItems: 'flex-start',
    marginLeft: 8,
    justifyContent: 'center',
  },
  headerTitle: {
    color: '#1F2024',
    textAlign: 'left',
    fontFamily: 'Pretendard',
    fontSize: 20,
    fontWeight: '700',
    lineHeight: 24,
  },
  deleteButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  deleteButtonText: {
    color: '#EF5F5F',
    fontSize: 14,
    fontWeight: '700',
  },
  content: {
    flex: 1,
  },
  mapContainer: {
    width: '100%',
    height: 250,
    backgroundColor: '#E9ECEF',
  },
  mapWebView: {
    flex: 1,
    backgroundColor: '#E9ECEF',
  },
  mapEmptyOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(233, 236, 239, 0.88)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapEmptyText: {
    color: '#7B7C7D',
    fontSize: 14,
    fontWeight: '600',
  },
  loadingIndicator: { marginTop: 12 },
  section: {
    marginTop: 14,
    marginLeft: 20,
  },
  sectionSpacing: {
    marginTop: 6,
  },
  subtitle: {
    color: '#3C4144',
    textAlign: 'left',
    fontFamily: 'Pretendard',
    fontSize: 16,
    fontWeight: '700',
  },
  petAvatarWrapper: {
    marginTop: 8,
  },
  petAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
  },
  walkTexts: {
    marginTop: 4,
  },
  walkInfoText: {
    color: '#7B7C7D',
    textAlign: 'left',
    fontFamily: 'Pretendard',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 4,
  },
  durationClock: {
    color: '#6665DD',
    fontSize: 24,
    fontWeight: '700',
    marginTop: 8,
  },
  endWalkButton: {
    width: 180,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#0081D5',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    marginBottom: 24,
  },
  endWalkButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
});
