import React, { useMemo, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  Modal,
  Animated,
  ActivityIndicator,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../App';
import CustomButton from '../components/CustomButton';
import { getMyPets, PetListItem } from '../api/pets';
import { getMyThisWeekWalks, getPetWalks, WalkRecordDto } from '../api/walks';

const WALK_SHEET_HEIGHT = 420;
const DAYS = ['일', '월', '화', '수', '목', '금', '토'];
const WALK_TIPS = [
  '여름에는 지면 온도 확인이 필수에요! 🔥',
  '산책 후 발바닥 체크는 꼭! 🐾',
  '물은 충분히 챙겨가세요! 💦',
  '저녁 산책은 시원하답니다! ⭐️',
  '간식으로 훈련해보세요! 🍖',
];

const PET_COLORS = ['#6665DD', '#74BC8C', '#0081D5', '#FFC94D'];
const PET_BADGE_BG_COLORS = ['#EFF1FF', '#E8F6EE', '#EEF7FD', '#FFF6D8'];

const getFallbackPetImage = (species?: string) => {
  const normalized = (species || '').toLowerCase();
  if (normalized.includes('cat')) return require('../assets/img_adoptCat.png');
  return require('../assets/img_adoptDog.png');
};

const normalizeWalk = (item: WalkRecordDto, petList: PetListItem[]) => {
  const itemPetId = item.pet_id ?? item.petId ?? item.pet?.id ?? 0;
  const pet = petList.find((p) => p.id === itemPetId);
  const walkId = item.walk_id ?? item.walkId ?? 0;
  const startTimeIso = item.start_time ?? item.startTime ?? '';
  const endTimeIso = item.end_time ?? item.endTime ?? '';
  const durationSec = item.duration ?? 0;
  const distanceKm = item.distance ?? 0;
  const pathCoordinates = item.path_coordinates ?? item.pathCoordinates ?? [];
  const petName = pet?.name ?? item.pet?.name ?? '반려동물';
  const petSpecies = pet?.species ?? item.pet?.species;
  const petImageUri = pet?.profilePicture ?? item.pet?.profilePicture;

  const startDate = startTimeIso ? new Date(startTimeIso) : null;
  const endDate = endTimeIso ? new Date(endTimeIso) : null;

  const dateLabel = startDate
    ? `${startDate.getFullYear()}.${String(startDate.getMonth() + 1).padStart(2, '0')}.${String(startDate.getDate()).padStart(2, '0')}`
    : '-';

  const h = Math.floor(durationSec / 3600)
    .toString()
    .padStart(2, '0');
  const m = Math.floor((durationSec % 3600) / 60)
    .toString()
    .padStart(2, '0');
  const s = Math.floor(durationSec % 60)
    .toString()
    .padStart(2, '0');

  const startClock = startDate
    ? `${String(startDate.getHours()).padStart(2, '0')}:${String(startDate.getMinutes()).padStart(2, '0')}`
    : '00:00';

  const endClock = endDate
    ? `${String(endDate.getHours()).padStart(2, '0')}:${String(endDate.getMinutes()).padStart(2, '0')}`
    : undefined;

  return {
    id: walkId,
    petId: itemPetId,
    petName,
    petImage: petImageUri ? { uri: petImageUri } : getFallbackPetImage(petSpecies),
    date: dateLabel,
    distance: `${distanceKm.toFixed(1)}km`,
    duration: `${h}:${m}:${s}`,
    startTime: startClock,
    endTime: endClock,
    distanceKm,
    durationSec,
    pathCoordinates,
  };
};

const getDayLabel = (dateText: string) => {
  const date = new Date(dateText.replace(/\./g, '-'));
  return DAYS[date.getDay()] ?? '일';
};

export default function WalkScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [isBottomSheetVisible, setBottomSheetVisible] = useState(false);
  const [selectedPetId, setSelectedPetId] = useState<number | null>(null);
  const [pets, setPets] = useState<PetListItem[]>([]);
  const [walkRecords, setWalkRecords] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const bottomSheetY = useRef(new Animated.Value(WALK_SHEET_HEIGHT)).current;
  const [randomTip, setRandomTip] = useState(() => {
    const randomIndex = Math.floor(Math.random() * WALK_TIPS.length);
    return WALK_TIPS[randomIndex];
  });

  const refreshTip = useCallback(() => {
    const randomIndex = Math.floor(Math.random() * WALK_TIPS.length);
    setRandomTip(WALK_TIPS[randomIndex]);
  }, []);

  const loadWalkData = useCallback(async () => {
    setIsLoading(true);
    try {
      const petList = await getMyPets();
      setPets(petList);

      let merged: ReturnType<typeof normalizeWalk>[] = [];

      try {
        const thisWeekWalks = await getMyThisWeekWalks('Asia/Seoul');
        merged = thisWeekWalks.map((item) => normalizeWalk(item, petList));
      } catch (error) {
        console.log('[walk] this-week endpoint failed; falling back to per-pet walk list');
        const settled = await Promise.allSettled(
          petList.map(async (pet) => {
            const response = await getPetWalks(pet.id, {
              timezone: 'Asia/Seoul',
              sortBy: 'date_desc',
              limit: 30,
              offset: 0,
            });
            return (response.items || []).map((item) => normalizeWalk(item, petList));
          })
        );

        merged = settled.flatMap((result) => (result.status === 'fulfilled' ? result.value : []));
      }

      merged.sort((a, b) => (b.id || 0) - (a.id || 0));
      setWalkRecords(merged);
    } catch (error) {
      console.warn('[walk] failed to load this week walks', error);
      setWalkRecords([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      refreshTip();
      loadWalkData();
    }, [loadWalkData, refreshTip])
  );

  const petOptions = useMemo(
    () =>
      pets.map((pet) => ({
        id: pet.id,
        name: pet.name,
        image: pet.profilePicture ? { uri: pet.profilePicture } : getFallbackPetImage(pet.species),
      })),
    [pets]
  );

  const openBottomSheet = () => {
    setSelectedPetId(null);
    setBottomSheetVisible(true);
    bottomSheetY.setValue(WALK_SHEET_HEIGHT);
    Animated.spring(bottomSheetY, {
      toValue: 0,
      useNativeDriver: false,
      tension: 50,
    }).start();
  };

  const closeBottomSheet = () => {
    Animated.timing(bottomSheetY, {
      toValue: WALK_SHEET_HEIGHT,
      duration: 250,
      useNativeDriver: false,
    }).start(() => {
      setBottomSheetVisible(false);
    });
  };

  const handleStartWalk = () => {
    const pet = petOptions.find((p) => p.id === selectedPetId);
    if (!pet) return;

    closeBottomSheet();
    navigation.navigate('WalkActive', {
      petId: pet.id,
      petName: pet.name,
      petImage: pet.image,
    });
  };

  const handleOpenPetWalkHistory = () => {
    const pet = petOptions.find((p) => p.id === selectedPetId);
    if (!pet) return;

    closeBottomSheet();
    navigation.navigate('WalkPetHistory', {
      petId: pet.id,
      petName: pet.name,
      petImage: pet.image,
    });
  };

  const weeklyData = useMemo(() => {
    const firstPet = petOptions[0]?.name;
    const secondPet = petOptions[1]?.name;
    const totals: Record<string, { [pet: string]: number }> = {};

    DAYS.forEach((day) => {
      totals[day] = {};
    });

    walkRecords.forEach((record) => {
      const day = getDayLabel(record.date);
      totals[day][record.petName] = (totals[day][record.petName] ?? 0) + record.distanceKm;
    });

    return DAYS.map((day) => ({
      day,
      pet1: firstPet ? totals[day][firstPet] ?? 0 : 0,
      pet2: secondPet ? totals[day][secondPet] ?? 0 : 0,
    }));
  }, [walkRecords, petOptions]);

  const getPetPaletteIndex = useCallback(
    (petId: number) => {
      const index = pets.findIndex((pet) => pet.id === petId);
      return index >= 0 ? index : 0;
    },
    [pets]
  );

  const getPetColor = useCallback(
    (petId: number) => PET_COLORS[getPetPaletteIndex(petId) % PET_COLORS.length],
    [getPetPaletteIndex]
  );

  const getPetBadgeColor = useCallback(
    (petId: number) => PET_BADGE_BG_COLORS[getPetPaletteIndex(petId) % PET_BADGE_BG_COLORS.length],
    [getPetPaletteIndex]
  );

  return (
    <View style={styles.container}>
      <View style={styles.headerContainer}>
        <View style={styles.headerRow}>
          <View style={styles.titleSection}>
            <Text style={styles.titleLine} numberOfLines={1}>
              <Text style={styles.titlePrimary}>오늘도 건강하</Text>
              <Text style={styles.titleHighlight}>개</Text>
            </Text>

            <Text style={styles.subtitle} numberOfLines={1}>
              산책해 볼까요?
            </Text>

            <Text style={styles.tipText} numberOfLines={1}>
              {randomTip}
            </Text>
          </View>

          <TouchableOpacity style={styles.startIconContainer} activeOpacity={0.8} onPress={openBottomSheet}>
            <Image source={require('../assets/icon_startWalk.png')} style={styles.startIcon} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.graphSection}>
        <View style={styles.graphHeader}>
          <Text style={styles.graphTitle}>요일 별 산책 그래프</Text>
          <TouchableOpacity activeOpacity={0.8} onPress={() => navigation.navigate('WalkWeeklyReport')}>
            <Image source={require('../assets/btn_more.png')} style={styles.graphMoreButton} />
          </TouchableOpacity>
        </View>

        <View style={styles.graphContainer}>
          {weeklyData.map((item, index) => {
            const total = item.pet1 + item.pet2;
            const maxHeight = 110;
            const scaledTotal = total > 0 ? (total / 5) * (maxHeight / 2) : 0;
            const h1 = total > 0 ? (item.pet1 / total) * scaledTotal : 0;
            const h2 = total > 0 ? (item.pet2 / total) * scaledTotal : 0;
            const hasPet1 = h1 > 0;
            const hasPet2 = h2 > 0;
            const barRadius = 4;
            return (
              <View key={index} style={styles.barColumn}>
                <View style={styles.barWrapper}>
                  <View
                    style={[
                      styles.barSegment,
                      {
                        height: h1,
                        backgroundColor: '#6665DD',
                        borderTopLeftRadius: barRadius,
                        borderTopRightRadius: barRadius,
                        borderBottomLeftRadius: hasPet2 ? 0 : barRadius,
                        borderBottomRightRadius: hasPet2 ? 0 : barRadius,
                      },
                    ]}
                  />
                  <View
                    style={[
                      styles.barSegment,
                      {
                        height: h2,
                        backgroundColor: '#74BC8C',
                        borderBottomLeftRadius: barRadius,
                        borderBottomRightRadius: barRadius,
                        borderTopLeftRadius: hasPet1 ? 0 : barRadius,
                        borderTopRightRadius: hasPet1 ? 0 : barRadius,
                      },
                    ]}
                  />
                </View>
                <Text style={styles.dayText}>{item.day}</Text>
              </View>
            );
          })}
        </View>
      </View>

      <View style={styles.bottomSheet}>
        {isLoading ? (
          <ActivityIndicator style={{ marginTop: 30 }} color="#0081D5" />
        ) : (
          <ScrollView
            style={styles.recordScrollView}
            contentContainerStyle={styles.recordScrollContent}
            showsVerticalScrollIndicator={false}
          >
            {walkRecords.map((record) => (
              <TouchableOpacity
                key={`${record.petId}-${record.id}`}
                activeOpacity={0.9}
                onPress={() => navigation.navigate('WalkLogDetail', { record })}
              >
                <View style={styles.recordCard}>
                  <Image source={record.petImage} style={styles.petImage} />
                  <View style={styles.recordInfo}>
                    <View style={[styles.petNameBadge, { backgroundColor: getPetBadgeColor(record.petId) }]}>
                      <Text style={[styles.petNameText, { color: getPetColor(record.petId) }]}>
                        {record.petName}
                      </Text>
                    </View>

                    <View style={styles.infoRow}>
                      <Text style={styles.infoLabel}>산책일시</Text>
                      <Text style={styles.infoValue}>{record.date}</Text>
                    </View>

                    <View style={styles.infoRow}>
                      <Text style={styles.infoLabel}>이동거리</Text>
                      <Text style={styles.infoValue}>{record.distance}</Text>
                    </View>

                    <Text style={[styles.durationText, { color: getPetColor(record.petId) }]}>
                      {record.duration}
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            ))}
            {walkRecords.length === 0 && <Text style={{ marginTop: 20 }}>이번 주 산책 기록이 없습니다.</Text>}
          </ScrollView>
        )}
      </View>

      <Modal visible={isBottomSheetVisible} transparent animationType="none" onRequestClose={closeBottomSheet}>
        <View style={styles.bottomSheetOverlay}>
          <TouchableOpacity style={styles.bottomSheetBackground} activeOpacity={1} onPress={closeBottomSheet} />
          <Animated.View style={[styles.selectionSheetContainer, { transform: [{ translateY: bottomSheetY }] }]}>
            <View style={styles.dragHandleArea}>
              <View style={styles.dragHandle} />
            </View>

            <View style={styles.selectionSheetContent}>
              <Text style={styles.sheetTitle}>산책할 반려동물을 선택해주세요</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.petCardsRow}
              >
                {petOptions.map((pet, index) => {
                  const isSelected = selectedPetId === pet.id;
                  return (
                    <TouchableOpacity
                      key={pet.id}
                      activeOpacity={0.9}
                      onPress={() => setSelectedPetId(pet.id)}
                      style={[styles.petCard, index !== petOptions.length - 1 && styles.petCardGap, isSelected && styles.petCardSelected]}
                    >
                      <Image source={pet.image} style={styles.petCardImage} />
                      <Text style={styles.petCardName}>{pet.name}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
              <View style={styles.selectionButtonContainer}>
                <View style={styles.selectionButtonRow}>
                  <CustomButton text="기록 보기" onPress={handleOpenPetWalkHistory} disabled={!selectedPetId} width={165} />
                  <CustomButton text="산책하기" onPress={handleStartWalk} disabled={!selectedPetId} width={165} />
                </View>
              </View>
            </View>
          </Animated.View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F8F8' },
  headerContainer: { paddingHorizontal: 20, paddingTop: 48, marginBottom: 4 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  titleSection: { flex: 1, paddingRight: 12 },
  titleLine: { fontSize: 28, lineHeight: 34, fontWeight: '700' },
  titlePrimary: { color: '#0081D5', fontSize: 28, fontWeight: '700', lineHeight: 34 },
  titleHighlight: { color: '#FFC94D', fontSize: 28, fontWeight: '700', lineHeight: 34 },
  subtitle: { color: '#000000', fontSize: 28, fontWeight: '700', lineHeight: 34, marginTop: 2 },
  tipText: { color: '#7B7C7D', fontSize: 11, fontWeight: '500', marginTop: 10 },
  startIconContainer: {
    width: 96,
    height: 96,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
  },
  startIcon: { width: 96, height: 96 },
  graphSection: { paddingHorizontal: 20, marginTop: 18, alignItems: 'center' },
  graphHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%' },
  graphTitle: { color: '#000000', fontSize: 18, fontWeight: '600', alignSelf: 'flex-start' },
  graphMoreButton: { width: 56, height: 30, resizeMode: 'contain' },
  graphContainer: { width: 310, height: 135, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 12, paddingBottom: 22 },
  barColumn: { alignItems: 'center', width: 20 },
  barWrapper: { width: 20, alignItems: 'center' },
  barSegment: { width: 20 },
  dayText: { color: '#040505', textAlign: 'center', fontSize: 14, fontWeight: '600', marginTop: 8 },
  bottomSheet: {
    flex: 1,
    marginTop: 12,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 10,
  },
  recordScrollView: { flex: 1 },
  recordScrollContent: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 100, alignItems: 'center' },
  recordCard: {
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
  recordInfo: { flex: 1 },
  petNameBadge: {
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 39,
    alignSelf: 'flex-start',
    marginBottom: 4,
  },
  petNameText: { textAlign: 'center', fontSize: 16, fontWeight: '600' },
  infoRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  infoLabel: { color: '#7B7C7D', fontSize: 14, fontWeight: '600' },
  infoValue: { color: '#040505', fontSize: 14, fontWeight: '500', marginLeft: 8 },
  durationText: { fontSize: 24, fontWeight: '600', marginTop: 4 },
  bottomSheetOverlay: { flex: 1 },
  bottomSheetBackground: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0, 0, 0, 0.30)' },
  selectionSheetContainer: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 20, borderTopRightRadius: 20, height: WALK_SHEET_HEIGHT, position: 'absolute', left: 0, right: 0, bottom: 0 },
  dragHandleArea: { width: '100%', height: 44, alignItems: 'center', paddingTop: 20 },
  dragHandle: { width: 40, height: 4, backgroundColor: '#B3B6B8', borderRadius: 2 },
  selectionSheetContent: { paddingHorizontal: 20 },
  sheetTitle: {
    marginTop: 35,
    color: '#000000',
    fontFamily: 'Pretendard',
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 30,
  },
  petCardsRow: { flexDirection: 'row', paddingHorizontal: 4, paddingBottom: 4, marginBottom: 26 },
  petCard: { width: 167, height: 170, borderRadius: 12, borderWidth: 1, borderColor: '#EAECEE', backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', padding: 12 },
  petCardGap: { marginRight: 16 },
  petCardSelected: { borderColor: '#0081D5', backgroundColor: '#EEF7FD' },
  petCardImage: { width: 80, height: 80, borderRadius: 40, marginBottom: 12, resizeMode: 'cover' },
  petCardName: { color: '#000', fontSize: 16, fontWeight: '600' },
  selectionButtonContainer: { alignItems: 'center' },
  selectionButtonRow: { width: 350, flexDirection: 'row', justifyContent: 'space-between' },
});
