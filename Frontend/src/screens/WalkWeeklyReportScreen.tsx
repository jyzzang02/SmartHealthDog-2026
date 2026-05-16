import React, { useMemo, useState, useCallback } from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../App';
import { getMyPets, PetListItem } from '../api/pets';
import { getMyThisWeekWalks, getPetWalks, getWeeklyWalkComparison } from '../api/walks';

const DAYS = ['일', '월', '화', '수', '목', '금', '토'];

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const getFallbackPetImage = (species?: string) => {
  const normalized = (species || '').toLowerCase();
  if (normalized.includes('cat')) return require('../assets/img_adoptCat.png');
  return require('../assets/img_adoptDog.png');
};

const formatTotalDuration = (totalSeconds: number) => {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  if (hours > 0) return `${pad(hours)}:${pad(minutes)}`;
  return `${pad(minutes)}:${pad(seconds)}`;
};

const getDayLabel = (dateText?: string) => {
  if (!dateText) return '일';
  const date = new Date(dateText);
  return DAYS[date.getDay()] ?? '일';
};

export default function WalkWeeklyReportScreen() {
  const navigation = useNavigation<NavigationProp>();
  const [pets, setPets] = useState<PetListItem[]>([]);
  const [selectedPetId, setSelectedPetId] = useState<number | null>(null);
  const [weeklySummaryByPetId, setWeeklySummaryByPetId] = useState<Record<number, any>>({});
  const [dailyDistanceByPetId, setDailyDistanceByPetId] = useState<Record<number, Record<string, number>>>({});
  const [isLoading, setIsLoading] = useState(false);

  const loadReportData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [petList, weekly] = await Promise.all([getMyPets(), getWeeklyWalkComparison('Asia/Seoul')]);
      setPets(petList);
      if (!selectedPetId && petList[0]) setSelectedPetId(petList[0].id);

      const summaryMap: Record<number, any> = {};
      (weekly.pets || []).forEach((petSummary) => {
        summaryMap[petSummary.petId] = petSummary;
      });
      setWeeklySummaryByPetId(summaryMap);

      const dailyMap: Record<number, Record<string, number>> = {};
      petList.forEach((pet) => {
        dailyMap[pet.id] = Object.fromEntries(DAYS.map((d) => [d, 0]));
      });

      let thisWeekWalks = [];
      try {
        thisWeekWalks = await getMyThisWeekWalks('Asia/Seoul');
      } catch (error) {
        console.log('[walk] this-week endpoint failed in report; falling back to per-pet walk list');
        const settled = await Promise.allSettled(
          petList.map(async (pet) => {
            const response = await getPetWalks(pet.id, {
              timezone: 'Asia/Seoul',
              sortBy: 'date_desc',
              limit: 30,
              offset: 0,
            });
            return response.items || [];
          })
        );
        thisWeekWalks = settled.flatMap((result) => (result.status === 'fulfilled' ? result.value : []));
      }

      thisWeekWalks.forEach((walk) => {
        const petId = walk.pet_id ?? walk.petId ?? walk.pet?.id;
        if (!petId) return;
        if (!dailyMap[petId]) {
          dailyMap[petId] = Object.fromEntries(DAYS.map((d) => [d, 0]));
        }
        const day = getDayLabel(walk.start_time || walk.startTime);
        dailyMap[petId][day] = (dailyMap[petId][day] ?? 0) + (walk.distance ?? 0);
      });

      setDailyDistanceByPetId(dailyMap);
    } catch (error) {
      console.warn('[walk] failed to load weekly report', error);
    } finally {
      setIsLoading(false);
    }
  }, [selectedPetId]);

  useFocusEffect(
    useCallback(() => {
      loadReportData();
    }, [loadReportData])
  );

  const selectedPet = useMemo(
    () => pets.find((pet) => pet.id === selectedPetId) ?? null,
    [pets, selectedPetId]
  );

  const selectedSummary = selectedPetId ? weeklySummaryByPetId[selectedPetId] : null;

  const totalCount = selectedSummary?.currentWeekSummary?.totalWalks ?? 0;
  const totalDistance = selectedSummary?.currentWeekSummary?.totalDistanceKm ?? 0;
  const totalDurationSec = selectedSummary?.currentWeekSummary?.totalDurationSec ?? 0;
  const distancePct = selectedSummary?.delta?.distancePct;

  const weeklyData = useMemo(() => {
    if (!selectedPetId) return DAYS.map((day) => ({ day, value: 0 }));
    const byDay = dailyDistanceByPetId[selectedPetId] || {};
    return DAYS.map((day) => ({ day, value: byDay[day] ?? 0 }));
  }, [dailyDistanceByPetId, selectedPetId]);

  if (isLoading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator color="#0081D5" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Image source={require('../assets/icon_navBack.png')} style={styles.backIcon} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>이번주 산책 리포트</Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.petSelector}
        >
          {pets.map((pet, index) => (
            <TouchableOpacity
              key={pet.id}
              onPress={() => setSelectedPetId(pet.id)}
              activeOpacity={0.8}
              style={[styles.petCircleWrapper, index !== pets.length - 1 && styles.petCircleGap]}
            >
              <Image
                source={pet.profilePicture ? { uri: pet.profilePicture } : getFallbackPetImage(pet.species)}
                style={[styles.petCircle, selectedPetId === pet.id && styles.petCircleActive]}
              />
            </TouchableOpacity>
          ))}
        </ScrollView>

        <View style={[styles.card, styles.cardRecord]}>
          <Text style={styles.cardTitle}>{selectedPet?.name || '-'} 산책 기록</Text>
          <View style={styles.cardPetImageWrapper}>
            {selectedPet && (
              <Image
                source={selectedPet.profilePicture ? { uri: selectedPet.profilePicture } : getFallbackPetImage(selectedPet.species)}
                style={styles.cardPetImage}
              />
            )}
          </View>

          <View style={styles.statsRow}>
            <View style={styles.statItem}><Text style={styles.statLabel}>총 횟수(회)</Text><Text style={styles.statValue}>{totalCount}</Text></View>
            <View style={styles.statItem}><Text style={styles.statLabel}>총 거리(km)</Text><Text style={styles.statValue}>{totalDistance.toFixed(1)}</Text></View>
            <View style={styles.statItem}><Text style={styles.statLabel}>총 시간</Text><Text style={styles.statValue}>{formatTotalDuration(totalDurationSec)}</Text></View>
          </View>
        </View>

        <View style={[styles.card, styles.cardGraph]}>
          <Text style={styles.cardTitle}>
            지난주 대비 산책 거리 {' '}
            <Text style={styles.highlightText}>{distancePct === null || distancePct === undefined ? '-' : `${Math.round(Math.abs(distancePct))}%`}</Text>{' '}
            {distancePct === null || distancePct === undefined ? '비교 불가' : distancePct >= 0 ? '증가' : '감소'}
          </Text>

          <View style={styles.graphContainer}>
            {weeklyData.map((item, index) => {
              const maxHeight = 120;
              const scaledHeight = item.value > 0 ? (item.value / 5) * (maxHeight / 2) : 0;
              return (
                <View key={index} style={styles.barColumn}>
                  <View style={[styles.barSegmentSingle, { height: scaledHeight, backgroundColor: '#0081D5' }]} />
                  <Text style={styles.dayText}>{item.day}</Text>
                </View>
              );
            })}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F5' },
  center: { justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 60, paddingBottom: 16 },
  backButton: { padding: 8, marginRight: 8 },
  backIcon: { width: 20, height: 20 },
  headerTitle: { color: '#1F2024', fontSize: 20, fontWeight: '700' },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 60 },
  petSelector: { flexDirection: 'row', alignItems: 'center', marginTop: 30, paddingLeft: 20, paddingRight: 24 },
  petCircleWrapper: { borderRadius: 34 },
  petCircleGap: { marginRight: 12 },
  petCircle: { width: 60, height: 60, borderRadius: 30, borderWidth: 4, borderColor: '#FFF' },
  petCircleActive: { borderColor: '#0081D5' },
  card: { width: 350, alignSelf: 'center', paddingVertical: 24, paddingHorizontal: 20, borderRadius: 16, backgroundColor: '#FFFFFF', marginTop: 24 },
  cardRecord: { marginTop: 24 },
  cardGraph: { minHeight: 268, marginTop: 32 },
  cardTitle: { color: '#000', fontSize: 18, fontWeight: '600' },
  cardPetImageWrapper: { marginTop: 20, alignItems: 'center', justifyContent: 'center' },
  cardPetImage: { width: 80, height: 80, borderRadius: 40 },
  statsRow: { flexDirection: 'row', alignItems: 'center', marginTop: 16, justifyContent: 'space-between' },
  statItem: { flex: 1, alignItems: 'center' },
  statLabel: { color: '#7B7C7D', fontSize: 14, fontWeight: '500', textAlign: 'center' },
  statValue: { color: '#3C4144', fontSize: 20, fontWeight: '700', marginTop: 4, textAlign: 'center' },
  highlightText: { color: '#0081D5' },
  graphContainer: { width: '100%', height: 160, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 20, paddingHorizontal: 10, paddingBottom: 10 },
  barColumn: { alignItems: 'center', width: 24 },
  barSegmentSingle: { width: 20, borderRadius: 4 },
  dayText: { color: '#040505', fontSize: 14, fontWeight: '600', marginTop: 8 },
});

