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

type NavProp = StackNavigationProp<RootStackParamList, 'HealthDetail'>;
type RoutePropType = RouteProp<RootStackParamList, 'HealthDetail'>;

const TAB_LABELS = ['검진 기록', '변화 추이', '모니터링', '혈통 위험도'];

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

  useFocusEffect(
    useCallback(() => {
      setSummary(healthStore.get(petId));
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
          {TAB_LABELS.map((label) => (
            <View key={label} style={styles.tabItem}>
              <Text
                style={[
                  styles.tabText,
                  label === '검진 기록' ? styles.tabTextActive : styles.tabTextInactive,
                ]}
              >
                {label}
              </Text>
              <View
                style={[
                  styles.tabIndicator,
                  label === '검진 기록' ? styles.tabIndicatorActive : styles.tabIndicatorInactive,
                ]}
              />
            </View>
          ))}
        </View>

        {/* 검진 기록 리스트 */}
        <View style={styles.recordListContainer}>
          {summary && summary.examTypes.length > 0 ? (
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
});
