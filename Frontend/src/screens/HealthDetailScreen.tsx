import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image } from 'react-native';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import type { RouteProp } from '@react-navigation/native';
import type { RootStackParamList } from '../../App';
import { healthStore } from '../store/healthStore';
import { getMyPets, PetListItem } from '../api/pets';
import { CONDITION_COLORS } from '../types/health';
import type { HealthSummary } from '../types/health';
import {
  BREED_RISK_LIST,
  RISK_COLORS,
  PEDIGREE_INTRO_TEXT,
  PEDIGREE_INFO_TITLE,
  PEDIGREE_INFO_DESC,
} from '../data/breedRisk';

type NavProp = StackNavigationProp<RootStackParamList, 'HealthDetail'>;
type RoutePropType = RouteProp<RootStackParamList, 'HealthDetail'>;

const TAB_LABELS = ['검진 기록', '변화 추이', '모니터링', '혈통 위험도'];

type ActiveTab = '검진 기록' | '변화 추이' | '모니터링' | '혈통 위험도';

const VITAL_ITEMS: { key: 'weight' | 'heartRate' | 'temperature'; label: string; unit: string }[] = [
  { key: 'weight', label: '체중', unit: 'kg' },
  { key: 'heartRate', label: '심박수', unit: 'bpm' },
  { key: 'temperature', label: '체온', unit: '°C' },
];

const MONITORING_MEMO = '일상 생활에서 건강 상태를 지속적으로 관찰하고 있습니다.';

const MONITORING_ITEMS = [
  { label: '생활 적응 상태', status: '양호', description: '새로운 환경에 잘 적응하고 있음' },
  { label: '식욕', status: '정상', description: '식사량 안정적' },
  { label: '활력', status: '양호', description: '활동성 증가' },
  { label: '이상 행동', status: '없음', description: '특이사항 없음' },
] as const;

const MONITORING_WARNING = '정기적인 건강검진을 통해 지속적으로 모니터링하고 있습니다.';

const calcAgeYears = (birthDate?: string): number | null => {
  if (!birthDate) return null;
  const parsed = new Date(birthDate.split('T')[0]);
  if (Number.isNaN(parsed.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - parsed.getFullYear();
  const hadBirthdayThisYear =
    now.getMonth() > parsed.getMonth() ||
    (now.getMonth() === parsed.getMonth() && now.getDate() >= parsed.getDate());
  if (!hadBirthdayThisYear) age -= 1;
  return Math.max(age, 0);
};

const mapSpeciesLabel = (species?: string) => {
  if (!species) return '';
  const n = species.toLowerCase();
  if (n.includes('dog') || n.includes('강아지')) return '강아지';
  if (n.includes('cat') || n.includes('고양이')) return '고양이';
  return species;
};

const mapGenderSuffix = (sex?: string) => {
  if (!sex) return '';
  const n = sex.toLowerCase();
  if (n.includes('female') || n.includes('여')) return '여아';
  if (n.includes('male') || n.includes('남')) return '남아';
  return '';
};

const HealthDetailScreen = () => {
  const navigation = useNavigation<NavProp>();
  const route = useRoute<RoutePropType>();
  const { petId, petName } = route.params;

  const [pet, setPet] = useState<PetListItem | null>(null);
  const [summary, setSummary] = useState<HealthSummary | undefined>(undefined);
  const [previous, setPrevious] = useState<HealthSummary | undefined>(undefined);
  const [activeTab, setActiveTab] = useState<ActiveTab>('검진 기록');

  useFocusEffect(
    useCallback(() => {
      setSummary(healthStore.get(petId));
      setPrevious(healthStore.getPrevious(petId));
      let mounted = true;
      getMyPets()
        .then((pets) => {
          if (mounted) setPet(pets.find((p) => p.id === petId) || null);
        })
        .catch(() => {
          if (mounted) setPet(null);
        });
      return () => {
        mounted = false;
      };
    }, [petId])
  );

  const displayName = pet?.name || petName;
  const breedLabel = pet?.breed || mapSpeciesLabel(pet?.species) || '';
  const ageYears = calcAgeYears(pet?.birthDate || pet?.birthday);
  const ageLabel = ageYears !== null ? `${ageYears}세` : '';
  const genderLabel = mapGenderSuffix(pet?.sex || pet?.gender);
  const subInfoText = [breedLabel, ageLabel, genderLabel].filter(Boolean).join(' · ');

  const recentStatusText = summary
    ? summary.healthTags.length > 0
      ? summary.healthTags.join(', ')
      : '특이사항 없음'
    : '등록된 건강검진 정보가 없습니다.';
  const recentStatusColor = summary ? CONDITION_COLORS[summary.overallCondition].text : '#7B7C7D';

  const noteLine = summary
    ? [summary.hospitalName, summary.notes].filter(Boolean).join(' · ') || '추가 메모 없음'
    : '';
  const resultValue = summary
    ? summary.healthTags.length > 0
      ? summary.healthTags.join(', ')
      : '특이사항 없음'
    : '';
  const resultColor = summary ? CONDITION_COLORS[summary.overallCondition].text : '#7B7C7D';

  return (
    <View style={styles.screen}>
      {/* NavBar */}
      <View style={styles.navBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backRow}>
          <Image source={require('../assets/icon_navBack.png')} style={styles.backIcon} />
          <Text style={styles.navTitle}>건강 상세</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* 펫 정보 카드 */}
        <View style={styles.petCard}>
          <View style={styles.petCardHeaderRow}>
            <View>
              <Text style={styles.petName}>{displayName}</Text>
              <Text style={styles.petSubInfo}>{subInfoText}</Text>
            </View>
            <TouchableOpacity
              style={styles.addExamBtn}
              activeOpacity={0.8}
              onPress={() => navigation.navigate('HealthCheckInput', { petId, petName: displayName })}
            >
              <Text style={styles.addExamBtnText}>검진 추가</Text>
            </TouchableOpacity>
          </View>

          {/* 최근 건강 상태 */}
          <View style={styles.recentStatusBox}>
            <View style={styles.recentStatusHeaderRow}>
              <Text style={styles.recentStatusLabel}>최근 건강 상태</Text>
              {summary && <Text style={styles.recentStatusDate}>{summary.checkupDate}</Text>}
            </View>
            <Text style={[styles.recentStatusValue, { color: recentStatusColor }]}>
              {recentStatusText}
            </Text>
          </View>
        </View>

        {/* 탭 행 */}
        <View style={styles.tabRow}>
          {TAB_LABELS.map((label) => {
            const isActive = label === activeTab;
            return (
              <TouchableOpacity
                key={label}
                style={styles.tabItem}
                activeOpacity={0.7}
                onPress={() => setActiveTab(label as ActiveTab)}
              >
                <Text
                  style={[
                    styles.tabText,
                    isActive ? styles.tabTextActive : styles.tabTextInactive,
                  ]}
                >
                  {label}
                </Text>
                <View
                  style={[
                    styles.tabIndicator,
                    isActive ? styles.tabIndicatorActive : styles.tabIndicatorInactive,
                  ]}
                />
              </TouchableOpacity>
            );
          })}
        </View>

        {/* 탭별 콘텐츠 */}
        <View style={styles.recordListContainer}>
          {activeTab === '검진 기록' && (
            summary && summary.examTypes.length > 0 ? (
              summary.examTypes.map((examType, idx) => (
                <View key={examType + idx} style={styles.examCard}>
                  <View style={styles.examCardTopRow}>
                    <View style={styles.examTagChip}>
                      <Text style={styles.examTagChipText}>{examType}</Text>
                    </View>
                    <Text style={styles.examDate}>{summary.checkupDate}</Text>
                  </View>
                  <Text style={styles.examNoteLine}>{noteLine}</Text>
                  <View style={styles.examResultBox}>
                    <Text style={styles.examResultLabel}>검진 결과</Text>
                    <Text style={[styles.examResultValue, { color: resultColor }]}>{resultValue}</Text>
                  </View>
                  <View style={styles.examBottomNoteWrap}>
                    <Text style={styles.examBottomNoteText}>{summary.recommendation}</Text>
                  </View>
                </View>
              ))
            ) : (
              <Text style={styles.emptyRecordText}>등록된 검진 기록이 없습니다.</Text>
            )
          )}

          {activeTab === '변화 추이' && (
            summary ? (
              <View style={styles.trendCard}>
                <Text style={styles.trendCardTitle}>주요 수치 비교</Text>
                <View style={styles.vitalsList}>
                  {VITAL_ITEMS.map(({ key, label, unit }) => {
                    const currentValue = summary[key];
                    const previousValue = previous?.[key];
                    return (
                      <View key={key} style={styles.vitalRow}>
                        <Text style={styles.vitalLabel}>{label}</Text>
                        <View style={styles.vitalValueGroup}>
                          {currentValue === undefined ? (
                            <Text style={styles.vitalEmptyValue}>측정값 없음</Text>
                          ) : (
                            <>
                              {previousValue !== undefined && (
                                <>
                                  <Text style={styles.vitalPrevValue}>{previousValue}{unit}</Text>
                                  <Text style={styles.vitalArrow}>→</Text>
                                </>
                              )}
                              <Text style={styles.vitalCurrentValue}>{currentValue}{unit}</Text>
                            </>
                          )}
                        </View>
                      </View>
                    );
                  })}
                </View>
              </View>
            ) : (
              <Text style={styles.emptyRecordText}>등록된 건강검진 정보가 없습니다.</Text>
            )
          )}

          {activeTab === '모니터링' && (
            <>
              <View style={styles.monitoringMemoCard}>
                <View style={styles.monitoringMemoRow}>
                  <View style={styles.monitoringMemoIconWrap}>
                    <Text style={styles.monitoringMemoIconText}>〜</Text>
                  </View>
                  <View style={styles.monitoringMemoTextWrap}>
                    <Text style={styles.monitoringMemoTitle}>보호소 관찰 메모</Text>
                    <Text style={styles.monitoringMemoDesc}>{MONITORING_MEMO}</Text>
                  </View>
                </View>
              </View>

              {MONITORING_ITEMS.map((item) => (
                <View key={item.label} style={styles.monitoringCard}>
                  <View style={styles.monitoringCardRow}>
                    <Text style={styles.monitoringCardLabel}>{item.label}</Text>
                    <View style={styles.monitoringBadge}>
                      <Text style={styles.monitoringBadgeText}>{item.status}</Text>
                    </View>
                  </View>
                  <Text style={styles.monitoringCardDesc}>{item.description}</Text>
                </View>
              ))}

              <View style={styles.monitoringWarningCard}>
                <Text style={styles.monitoringWarningTitle}>추가 확인 필요</Text>
                <Text style={styles.monitoringWarningDesc}>{MONITORING_WARNING}</Text>
              </View>
            </>
          )}

          {activeTab === '혈통 위험도' && (
            <>
              <Text style={styles.pedigreeIntroText}>{PEDIGREE_INTRO_TEXT}</Text>

              {/* 목록 안내 (단순 텍스트 카드) */}
              <View style={styles.pedigreeInfoCard}>
                <View style={styles.pedigreeInfoIcon}>
                  <Text style={styles.pedigreeInfoIconText}>i</Text>
                </View>
                <View style={styles.pedigreeInfoTextWrap}>
                  <Text style={styles.pedigreeInfoTitle}>{PEDIGREE_INFO_TITLE}</Text>
                  <Text style={styles.pedigreeInfoDesc}>{PEDIGREE_INFO_DESC}</Text>
                </View>
              </View>

              {/* 견종 목록 (클릭 시 견종별 유전병 목록 페이지로 이동 예정) */}
              {BREED_RISK_LIST.map((breed, idx) => (
                <TouchableOpacity
                  key={breed.name + idx}
                  style={styles.breedCard}
                  activeOpacity={0.8}
                  onPress={() => navigation.navigate('BreedDetail', { breedName: breed.name })}
                >
                  <View style={styles.breedCardLeft}>
                    <View style={styles.breedAvatar}>
                      <Image
                        source={breed.image}
                        style={styles.breedAvatarImage}
                        resizeMode="cover"
                      />
                    </View>
                    <View style={styles.breedInfo}>
                      <Text style={styles.breedName}>{breed.name}</Text>
                      <Text style={styles.breedRiskCount}>위험 항목 {breed.riskCount}개</Text>
                    </View>
                  </View>
                  <View style={styles.breedCardRight}>
                    <View style={[styles.breedBadge, { backgroundColor: RISK_COLORS[breed.riskLevel] }]}>
                      <Text style={styles.breedBadgeText}>{breed.riskLevel}</Text>
                    </View>
                    <Image source={require('../assets/icon_right.png')} style={styles.breedChevron} />
                  </View>
                </TouchableOpacity>
              ))}
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
};

export default HealthDetailScreen;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fff' },

  navBar: {
    height: 56,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F5',
  },
  backRow: { flexDirection: 'row', alignItems: 'center' },
  backIcon: { width: 20, height: 20, tintColor: '#333', marginRight: 8 },
  navTitle: { fontSize: 20, fontWeight: '600', color: '#040505' },

  scroll: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 40 },

  petCard: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#EAECEE',
    borderRadius: 12,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.08,
    shadowRadius: 5,
    elevation: 2,
    gap: 16,
  },
  petCardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  petName: { fontSize: 20, fontWeight: '700', color: '#040505', marginBottom: 4 },
  petSubInfo: { fontSize: 14, color: '#7B7C7D' },
  addExamBtn: { backgroundColor: '#0081D5', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  addExamBtnText: { fontSize: 14, fontWeight: '600', color: '#fff' },

  recentStatusBox: {
    backgroundColor: '#F8F9FA',
    borderLeftWidth: 3,
    borderLeftColor: '#0081D5',
    borderRadius: 10,
    padding: 16,
    gap: 8,
  },
  recentStatusHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  recentStatusLabel: { fontSize: 14, color: '#7B7C7D' },
  recentStatusDate: { fontSize: 13, color: '#7B7C7D' },
  recentStatusValue: { fontSize: 18, fontWeight: '700' },

  tabRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#EAECEE', marginTop: 24 },
  tabItem: { flex: 1, alignItems: 'center', paddingVertical: 12 },
  tabText: { fontSize: 15, marginBottom: 8 },
  tabTextActive: { color: '#0081D5', fontWeight: '700' },
  tabTextInactive: { color: '#7B7C7D', fontWeight: '500' },
  tabIndicator: { width: '100%', height: 2 },
  tabIndicatorActive: { backgroundColor: '#0081D5' },
  tabIndicatorInactive: { backgroundColor: 'transparent' },

  recordListContainer: {
    backgroundColor: '#F3F4F5',
    marginHorizontal: -20,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 16,
    gap: 12,
  },
  emptyRecordText: { fontSize: 14, color: '#7B7C7D', textAlign: 'center', paddingVertical: 24 },

  examCard: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#EAECEE',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
    gap: 8,
  },
  examCardTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  examTagChip: { backgroundColor: '#EEF7FD', borderRadius: 24, paddingHorizontal: 12, paddingVertical: 6 },
  examTagChipText: { fontSize: 14, color: '#0081D5', fontWeight: '600' },
  examDate: { fontSize: 14, color: '#7B7C7D' },
  examNoteLine: { fontSize: 14, color: '#7B7C7D', lineHeight: 20 },
  examResultBox: { backgroundColor: '#F8F9FA', borderRadius: 8, padding: 12, gap: 4 },
  examResultLabel: { fontSize: 13, color: '#7B7C7D' },
  examResultValue: { fontSize: 16, fontWeight: '700' },
  examBottomNoteWrap: { borderTopWidth: 1, borderTopColor: '#F3F4F5', paddingTop: 8, marginTop: 4 },
  examBottomNoteText: { fontSize: 14, color: '#3C4144' },

  trendCard: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#EAECEE',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
    gap: 16,
  },
  trendCardTitle: { fontSize: 16, color: '#2F3036' },
  vitalsList: { gap: 12 },
  vitalRow: {
    backgroundColor: '#F8F9FA',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  vitalLabel: { fontSize: 14, color: '#3C4144' },
  vitalValueGroup: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  vitalPrevValue: { fontSize: 13, color: '#B3B6B8' },
  vitalArrow: { fontSize: 14, color: '#B3B6B8' },
  vitalCurrentValue: { fontSize: 14, color: '#0081D5' },
  vitalEmptyValue: { fontSize: 14, color: '#B3B6B8' },

  monitoringMemoCard: {
    backgroundColor: '#EEF7FD',
    borderRadius: 12,
    padding: 16,
  },
  monitoringMemoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  monitoringMemoIconWrap: {
    width: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 2,
  },
  monitoringMemoIconText: { fontSize: 16, color: '#0081D5' },
  monitoringMemoTextWrap: { flex: 1 },
  monitoringMemoTitle: { fontSize: 15, color: '#2F3036', marginBottom: 4 },
  monitoringMemoDesc: { fontSize: 14, color: '#7B7C7D', lineHeight: 20 },

  monitoringCard: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#EAECEE',
    borderRadius: 12,
    padding: 16,
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  monitoringCardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  monitoringCardLabel: { fontSize: 15, color: '#2F3036' },
  monitoringBadge: {
    backgroundColor: '#EEF7FD',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  monitoringBadgeText: { fontSize: 13, color: '#0081D5' },
  monitoringCardDesc: { fontSize: 14, color: '#7B7C7D' },

  monitoringWarningCard: {
    backgroundColor: '#FFF9E6',
    borderWidth: 1,
    borderColor: '#FFE0A3',
    borderRadius: 12,
    padding: 16,
    gap: 4,
  },
  monitoringWarningTitle: { fontSize: 14, color: '#8B6914' },
  monitoringWarningDesc: { fontSize: 13, color: '#8B6914', lineHeight: 19.5 },

  // 혈통 위험도 탭
  pedigreeIntroText: { fontSize: 14, color: '#7B7C7D', lineHeight: 21, marginBottom: 4 },

  pedigreeInfoCard: {
    backgroundColor: '#EAF4FB',
    borderWidth: 1,
    borderColor: '#0081D5',
    borderLeftWidth: 3,
    borderRadius: 10,
    paddingVertical: 14,
    paddingLeft: 16,
    paddingRight: 16,
    flexDirection: 'row',
    gap: 10,
  },
  pedigreeInfoIcon: {
    width: 18,
    height: 18,
    borderRadius: 999,
    backgroundColor: '#0081D5',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 1,
  },
  pedigreeInfoIconText: { fontSize: 12, color: '#fff', fontWeight: '700', lineHeight: 18 },
  pedigreeInfoTextWrap: { flex: 1, gap: 4 },
  pedigreeInfoTitle: { fontSize: 13, color: '#0081D5', fontWeight: '600', lineHeight: 19.5 },
  pedigreeInfoDesc: { fontSize: 12, color: '#3C4144', lineHeight: 18 },

  breedCard: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#EAECEE',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 17,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  breedCardLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1, marginRight: 8 },
  breedAvatar: {
    width: 48,
    height: 48,
    borderRadius: 999,
    backgroundColor: '#F3F4F5',
    borderWidth: 1,
    borderColor: '#EAECEE',
    overflow: 'hidden',
  },
  breedAvatarImage: { width: '100%', height: '100%' },
  breedInfo: { flex: 1, gap: 4 },
  breedName: { fontSize: 16, color: '#2F3036', lineHeight: 24 },
  breedRiskCount: { fontSize: 13, color: '#7B7C7D', lineHeight: 19.5 },

  breedCardRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  breedBadge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  breedBadgeText: { fontSize: 12, color: '#fff', lineHeight: 18 },
  breedChevron: { width: 18, height: 18, tintColor: '#C4C4C4' },
});
