import React, { useState, useCallback, useRef } from 'react';
import {
  Animated,
  View,
  Text,
  Image,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  useWindowDimensions
} from 'react-native';

import { useNavigation, useFocusEffect, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../App';

import PetQnaEntryCard from '../components/PetQnaEntryCard';
import DiagnosisCard from '../components/DiagnosisCard';
import HospitalSearchMap from '../components/HospitalSearchMap';
import HospitalSearchControls from '../components/HospitalSearchControls';
import HospitalSearchResults from '../components/HospitalSearchResults';
import { useHospitalSearch } from '../hooks/useHospitalSearch';
import { useTabScrollToTop } from '../hooks/useTabScrollToTop';
import { getMyPets, PetListItem } from '../api/pets';
import { healthStore } from '../store/healthStore';
import type { HealthSummary } from '../types/health';

const eyeDog = require('../assets/eyeDog.png');
const urineDog = require('../assets/urineDog.png');
const selfCheckDog = require('../assets/selfCheckDog.png');

const emptyHospitalCenter = { lat: 37.5665, lng: 126.9780 };

const HealthScreen: React.FC = () => {

  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { width: screenWidth } = useWindowDimensions();
  // 진단 카드 폭/간격: 기존 2열 배치(48% / 4%)와 동일하게 유지
  const cardWidth = (screenWidth - 40) * 0.48;
  const cardGap = (screenWidth - 40) * 0.04;
  const cardScrollX = useRef(new Animated.Value(0)).current;
  const cardScrollRange = Math.max(3 * cardWidth + 2 * cardGap + 40 - screenWidth, 1);

  const route = useRoute<RouteProp<{ '건강': { openHospitalSearch?: boolean } | undefined }, '건강'>>();
  const scrollRef = useRef<ScrollView>(null);
  const hospitalY = useRef<number | null>(null);
  const [petsReady, setPetsReady] = useState(false);
  const moveToHospital = useCallback(() => {
    if (petsReady && route.params?.openHospitalSearch && hospitalY.current !== null) {
      scrollRef.current?.scrollTo({ y: hospitalY.current, animated: false });
      navigation.setParams({ openHospitalSearch: undefined } as never);
    }
  }, [navigation, petsReady, route.params?.openHospitalSearch]);
  useFocusEffect(useCallback(() => {
    const frame = requestAnimationFrame(moveToHospital);
    return () => cancelAnimationFrame(frame);
  }, [moveToHospital]));
  useTabScrollToTop(scrollRef);

  const [showPetModal, setShowPetModal] = useState(false);

  const [petList, setPetList] = useState<PetListItem[]>([]);
  const [selectedPetId, setSelectedPetId] = useState<number | null>(null);
  const [healthData, setHealthData] = useState<Record<number, HealthSummary>>({});
  const hospitalSearch = useHospitalSearch();

  useFocusEffect(
    useCallback(() => {
      let mounted = true;
      getMyPets()
        .then((pets) => {
          if (!mounted) return;
          setPetList(pets);
          setSelectedPetId((previousPetId) =>
            pets.some((pet) => pet.id === previousPetId)
              ? previousPetId
              : pets[0]?.id ?? null
          );
        })
        .catch(() => {
          if (!mounted) return;
          setPetList([]);
          setSelectedPetId(null);
        })
        .finally(() => { if (mounted) setPetsReady(true); });
      setHealthData(healthStore.getAll());
      return () => { mounted = false; };
    }, [])
  );

  const currentPet = petList.find((pet) => pet.id === selectedPetId);
  const currentSummary = currentPet ? healthData[currentPet.id] : undefined;
  const hasHealthData = Boolean(currentSummary);

  return (
    <ScrollView ref={scrollRef} style={styles.container} showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">

      {/* HEADER */}
      <View style={styles.headerContainer}>
        <Text style={styles.titleLine}>
          <Text style={styles.titlePrimary}>똑똑하</Text>
          <Text style={styles.titleHighlight}>개</Text>
        </Text>

        <Text style={styles.subtitle}>스마트 진단하기</Text>
      </View>
      
      <PetQnaEntryCard />

      {/* ============================ */}
      {/* 진단 기능 버튼 */}
      {/* ============================ */}
      <Animated.ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: cardScrollX } } }], { useNativeDriver: true })}
        scrollEventThrottle={16}
        contentContainerStyle={[styles.cardRow, { gap: cardGap }]}
      >

        {/* 안구질환 진단 → EyeDiagnosis로 이동 */}
        <DiagnosisCard
          title="안구질환 진단"
          description="강아지, 고양이의 안구 질환을 간단하게 진단"
          image={eyeDog}
          imageType="eye"
          style={{ width: cardWidth }}
          onPress={() => navigation.navigate('EyeDiagnosis')}   // ★ 이동 추가
        />

        {/* 소변키트 진단 → 다른 화면으로 이동 */}
        <DiagnosisCard
          title="소변키트 진단"
          description="소변키트 촬영을 통해 10종 항목 진단"
          image={urineDog}
          imageType="urine"
          style={{ width: cardWidth }}
          onPress={() => navigation.navigate('UrineDiagnosis')}    // ★ 이동 추가
        />

        {/* 반려동물 자가진단 → SelfCheck로 이동 */}
        <DiagnosisCard
          title={'반려동물\n자가진단'}
          description="반려동물의 상태를 분석해 이상 징후 점수 제공"
          image={selfCheckDog}
          imageType="eye"
          style={{ width: cardWidth }}
          onPress={() => navigation.navigate('SelfCheck')}
        />

      </Animated.ScrollView>
      <View style={styles.cardScrollTrack} accessible={false}>
        <Animated.View style={[styles.cardScrollThumb, { transform: [{ translateX: cardScrollX.interpolate({
          inputRange: [0, cardScrollRange], outputRange: [0, 40], extrapolate: 'clamp',
        }) }] }]} />
      </View>

      {/* ============================ */}
      {/* 보건 정보 */}
      {/* ============================ */}
      {currentPet && (
        <View style={styles.healthInfoCard}>
          <View style={styles.healthInfoHeaderRow}>
            <Text style={styles.healthInfoTitle}>보건 정보</Text>
            {petList.length > 1 && (
              <TouchableOpacity
                style={styles.petSelectButton}
                activeOpacity={0.8}
                accessibilityRole="button"
                onPress={() => setShowPetModal(true)}
              >
                <Text style={styles.petSelectButtonText} numberOfLines={1}>{currentPet.name}</Text>
                <Image
                  source={require('../assets/icon_arrowDown.png')}
                  style={styles.petSelectChevron}
                  accessible={false}
                />
              </TouchableOpacity>
            )}
          </View>
          <View style={styles.healthInfoRow}>
            <View style={styles.healthInfoTextBox}>
              {hasHealthData ? (
                <Text style={styles.healthInfoDesc}>
                  반려동물의 건강 정보를 확인해보세요.{'\n'}최근 검진 결과를 살펴보세요.
                </Text>
              ) : (
                <Text style={styles.healthInfoDesc}>
                  등록된 건강검진 정보가 없습니다.{'\n'}건강검진 정보를 등록해보세요.
                </Text>
              )}
            </View>
            <TouchableOpacity
              style={styles.healthInfoBtn}
              activeOpacity={0.8}
              onPress={() => {
                if (hasHealthData) {
                  navigation.navigate('HealthDetail', { petId: currentPet.id, petName: currentPet.name });
                } else {
                  navigation.navigate('HealthCheckInput', { petId: currentPet.id, petName: currentPet.name });
                }
              }}
            >
              <Text style={styles.healthInfoBtnText}>
                {hasHealthData ? '건강 상세' : '등록하기'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ============================ */}
      {/* 동물병원 검색 */}
      {/* ============================ */}
      <View style={styles.whiteSection} onLayout={event => { hospitalY.current = event.nativeEvent.layout.y; moveToHospital(); }}>
        <Text style={styles.sectionTitle}>동물병원 검색</Text>
        <HospitalSearchControls onSearch={hospitalSearch.search} loading={hospitalSearch.loading} />

        <HospitalSearchMap
          center={hospitalSearch.result?.center ?? emptyHospitalCenter}
          hospitals={hospitalSearch.result?.items ?? []}
          loading={hospitalSearch.loading}
          error={hospitalSearch.error}
          onRetry={hospitalSearch.retry}
          radiusKm={hospitalSearch.result?.radius_km ?? hospitalSearch.filters.radius_km ?? 10}
          searchLocation={hospitalSearch.filters.location}
        />
        {!hospitalSearch.loading && !hospitalSearch.error && <HospitalSearchResults
          hospitals={hospitalSearch.result?.items ?? []}
          total={hospitalSearch.result?.total ?? 0}
          page={hospitalSearch.result?.page ?? { limit: 5, offset: 0 }}
          onPageChange={hospitalSearch.goToPage}
          searchLocation={hospitalSearch.filters.location}
        />}

      </View>

      <Modal visible={showPetModal} transparent animationType="fade" onRequestClose={() => setShowPetModal(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowPetModal(false)}>
          <View style={styles.modalContent}>
            <ScrollView>
              {petList.map((pet) => (
                <TouchableOpacity
                  key={pet.id}
                  style={styles.modalItem}
                  onPress={() => {
                    setSelectedPetId(pet.id);
                    setShowPetModal(false);
                  }}
                >
                  <Text style={styles.modalItemText}>{pet.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

    </ScrollView>
  );
};

export default HealthScreen;


const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F8F8' },

  scrollContent: { paddingBottom: 80 },

  headerContainer: { paddingHorizontal: 20, paddingTop: 48, marginBottom: 12 },

  titleLine: { fontSize: 32, lineHeight: 40 },

  titlePrimary: { color: '#0081D5', fontSize: 32, fontWeight: '600', lineHeight: 40 },

  titleHighlight: { color: '#FFC94D', fontWeight: '600', fontSize: 32, lineHeight: 40 },

  subtitle: { color: '#000', fontSize: 32, fontWeight: '600', lineHeight: 40, marginTop: 2 },

  // 가로 스크롤 시 카드 그림자가 잘리지 않도록 상하 여백 확보 (marginTop으로 기존 간격 보정)
  cardRow: { flexDirection: 'row', paddingHorizontal: 20, paddingVertical: 8, marginTop: 24 },
  cardScrollTrack: { width: 72, height: 4, borderRadius: 2, backgroundColor: '#DDE3E8', alignSelf: 'center', marginTop: 4 },
  cardScrollThumb: { width: 32, height: 4, borderRadius: 2, backgroundColor: '#0081D5' },

  healthInfoCard: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 20,
    marginTop: 32,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
    paddingHorizontal: 20,
    paddingVertical: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },

  healthInfoTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#000',
    lineHeight: 22,
  },

  healthInfoHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },

  petSelectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    maxWidth: '55%',
    minHeight: 30,
    paddingHorizontal: 10,
    paddingVertical: 5,
    gap: 6,
    borderRadius: 15,
    backgroundColor: '#EDF6FF',
    borderWidth: 1,
    borderColor: '#D8EBFA',
  },

  petSelectButtonText: {
    flexShrink: 1,
    fontSize: 14,
    fontWeight: '600',
    color: '#0081D5',
  },

  petSelectChevron: {
    width: 12,
    height: 12,
    tintColor: '#0081D5',
    resizeMode: 'contain',
  },

  healthInfoRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },

  healthInfoTextBox: { flex: 1, paddingRight: 12 },

  healthInfoDesc: {
    fontSize: 14,
    fontWeight: '600',
    color: '#7B7C7D',
    lineHeight: 22,
  },

  healthInfoBtn: {
    backgroundColor: '#EEF7FD',
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 38,
  },

  healthInfoBtnText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#0081D5',
  },

  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center',
  },

  modalContent: {
    backgroundColor: '#FFFFFF', borderRadius: 12, width: '80%', maxHeight: '70%', paddingVertical: 10,
  },

  modalItem: { paddingVertical: 15, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: '#EAECEE' },

  modalItemText: { fontSize: 16, color: '#1F2024' },

  whiteSection: {
    backgroundColor: '#FFFFFF', marginTop: 32, paddingHorizontal: 20, paddingTop: 24, paddingBottom: 12,
  },

  sectionTitle: { fontSize: 20, fontWeight: '700', color: '#000', marginBottom: 16 },

});
