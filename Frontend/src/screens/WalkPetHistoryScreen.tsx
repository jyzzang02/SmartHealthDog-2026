import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { RouteProp, useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../App';
import { getPetWalks, WalkRecordDto } from '../api/walks';

type RouteProps = RouteProp<RootStackParamList, 'WalkPetHistory'>;
type NavigationProps = NativeStackNavigationProp<RootStackParamList>;

const formatDate = (value?: string) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;
};

const formatClock = (value?: string) => {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
};

const formatDuration = (durationSec?: number) => {
  const total = durationSec ?? 0;
  const h = Math.floor(total / 3600).toString().padStart(2, '0');
  const m = Math.floor((total % 3600) / 60).toString().padStart(2, '0');
  const s = Math.floor(total % 60).toString().padStart(2, '0');
  return `${h}:${m}:${s}`;
};

const normalizeWalk = (item: WalkRecordDto, routeParams: RouteProps['params']) => {
  const startIso = item.start_time ?? item.startTime;
  const endIso = item.end_time ?? item.endTime;
  const distanceKm = item.distance ?? 0;
  const durationSec = item.duration ?? 0;

  return {
    id: item.walk_id ?? item.walkId ?? 0,
    petId: routeParams.petId,
    petName: routeParams.petName,
    petImage: routeParams.petImage,
    date: formatDate(startIso),
    distance: `${distanceKm.toFixed(1)}km`,
    duration: formatDuration(durationSec),
    distanceKm,
    durationSec,
    startTime: formatClock(startIso),
    endTime: formatClock(endIso),
    pathCoordinates: item.path_coordinates ?? item.pathCoordinates ?? [],
  };
};

export default function WalkPetHistoryScreen() {
  const navigation = useNavigation<NavigationProps>();
  const route = useRoute<RouteProps>();
  const { petId, petName, petImage } = route.params;
  const [records, setRecords] = useState<ReturnType<typeof normalizeWalk>[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadPetWalks = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const response = await getPetWalks(petId, {
        timezone: 'Asia/Seoul',
        sortBy: 'date_desc',
        limit: 100,
        offset: 0,
      });
      setRecords((response.items || []).map((item) => normalizeWalk(item, route.params)));
    } catch (error) {
      const message = error instanceof Error ? error.message : '산책 기록을 불러오지 못했습니다.';
      setErrorMessage(message);
      setRecords([]);
    } finally {
      setIsLoading(false);
    }
  }, [petId, route.params]);

  useFocusEffect(
    useCallback(() => {
      loadPetWalks();
    }, [loadPetWalks])
  );

  const totalDistance = useMemo(
    () => records.reduce((sum, record) => sum + (record.distanceKm || 0), 0),
    [records]
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Image source={require('../assets/icon_navBack.png')} style={styles.backIcon} />
        </TouchableOpacity>
        <View style={styles.headerTextBox}>
          <Text style={styles.headerTitle}>{petName} 산책 기록</Text>
          <Text style={styles.headerSubtitle}>{records.length}회 · {totalDistance.toFixed(1)}km</Text>
        </View>
        <Image source={petImage} style={styles.headerAvatar} />
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color="#0081D5" />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {!!errorMessage && <Text style={styles.errorText}>{errorMessage}</Text>}
          {records.map((record) => (
            <TouchableOpacity
              key={`${record.petId}-${record.id}`}
              activeOpacity={0.9}
              onPress={() => navigation.navigate('WalkLogDetail', { record })}
            >
              <View style={styles.card}>
                <Image source={record.petImage} style={styles.petImage} />
                <View style={styles.cardInfo}>
                  <Text style={styles.petName}>{record.petName}</Text>
                  <Text style={styles.infoText}>산책일시 {record.date}</Text>
                  <Text style={styles.infoText}>이동거리 {record.distance}</Text>
                  <Text style={styles.durationText}>{record.duration}</Text>
                </View>
              </View>
            </TouchableOpacity>
          ))}
          {!errorMessage && records.length === 0 && (
            <Text style={styles.emptyText}>아직 산책 기록이 없습니다.</Text>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F8F8' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 18,
    backgroundColor: '#FFFFFF',
  },
  backButton: { padding: 8, marginRight: 8 },
  backIcon: { width: 20, height: 20 },
  headerTextBox: { flex: 1 },
  headerTitle: { color: '#1F2024', fontSize: 20, fontWeight: '700' },
  headerSubtitle: { color: '#7B7C7D', fontSize: 13, fontWeight: '600', marginTop: 4 },
  headerAvatar: { width: 44, height: 44, borderRadius: 22 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 100, alignItems: 'center' },
  card: {
    width: 340,
    height: 140,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#EAECEE',
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    padding: 16,
    paddingHorizontal: 20,
    alignItems: 'center',
    gap: 16,
    marginBottom: 12,
  },
  petImage: { width: 90, height: 90, borderRadius: 45 },
  cardInfo: { flex: 1 },
  petName: { color: '#6665DD', fontSize: 16, fontWeight: '700', marginBottom: 4 },
  infoText: { color: '#7B7C7D', fontSize: 14, fontWeight: '600', marginTop: 2 },
  durationText: { color: '#6665DD', fontSize: 24, fontWeight: '700', marginTop: 4 },
  errorText: { color: '#EF5F5F', fontSize: 13, fontWeight: '600', marginTop: 20 },
  emptyText: { color: '#7B7C7D', fontSize: 14, fontWeight: '600', marginTop: 40 },
});
