import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  Image,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import type { RouteProp } from '@react-navigation/native';
import type { RootStackParamList } from '../../App';
import type { PhysicalResult, HealthSummary, OverallCondition } from '../types/health';

/* ─── 상수 ─── */
const EXAM_TYPES = [
  '일반 검진',
  '혈액검사',
  '소변검사',
  '분변검사',
  '안과검사',
  '구강/치주검사',
  '영상검사',
];

const PHYSICAL_ITEMS = [
  '체중',
  '체온',
  '심박수',
  '호흡수',
  '식욕',
  '활력',
  '눈',
  '귀',
  '피부/피모',
  '치아/구강',
  '심장/폐',
  '복부',
  '보행/관절',
];

const RESULT_OPTIONS: PhysicalResult[] = ['정상', '소견 있음', '미실시'];

const todayString = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const calcOverallCondition = (
  results: Record<string, PhysicalResult>
): OverallCondition => {
  const badCount = Object.values(results).filter(v => v === '소견 있음').length;
  if (badCount === 0) return '양호';
  if (badCount <= 3) return '주의';
  return '위험';
};

const calcRecommendation = (condition: OverallCondition): string => {
  if (condition === '양호') return '6개월 후 정기 검진 권장';
  if (condition === '주의') return '3개월 후 정기 검진 권장';
  return '1개월 후 정기 검진 권장';
};

const initPhysicalResults = (): Record<string, PhysicalResult> =>
  Object.fromEntries(PHYSICAL_ITEMS.map(item => [item, '미실시' as PhysicalResult]));

/* ─── 컴포넌트 ─── */
type NavProp = StackNavigationProp<RootStackParamList, 'HealthCheckInput'>;
type RoutePropType = RouteProp<RootStackParamList, 'HealthCheckInput'>;

const HealthCheckInputScreen = () => {
  const navigation = useNavigation<NavProp>();
  const route = useRoute<RoutePropType>();
  const { petId, petName } = route.params;

  const [checkupDate, setCheckupDate] = useState(todayString());
  const [hospitalName, setHospitalName] = useState('');
  const [selectedExamTypes, setSelectedExamTypes] = useState<string[]>([]);
  const [physicalResults, setPhysicalResults] = useState<Record<string, PhysicalResult>>(
    initPhysicalResults
  );
  const [notes, setNotes] = useState('');

  /* ─── 핸들러 ─── */
  const toggleExamType = (type: string) => {
    setSelectedExamTypes(prev =>
      prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
    );
  };

  const setPhysicalResult = (item: string, result: PhysicalResult) => {
    setPhysicalResults(prev => ({ ...prev, [item]: result }));
  };

  const handleSubmit = () => {
    const overallCondition = calcOverallCondition(physicalResults);
    const healthTags = Object.entries(physicalResults)
      .filter(([, v]) => v === '소견 있음')
      .map(([k]) => k);

    const summary: HealthSummary = {
      petId,
      checkupDate,
      hospitalName: hospitalName.trim() || undefined,
      examTypes: selectedExamTypes,
      physicalResults,
      notes: notes.trim() || undefined,
      overallCondition,
      healthTags,
      recommendation: calcRecommendation(overallCondition),
    };

    navigation.navigate('HealthCheckResult', { petId, petName, summary });
  };

  /* ─── 렌더 ─── */
  return (
    <View style={styles.screen}>
      {/* NavBar */}
      <View style={styles.navBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backRow}>
          <Image
            source={require('../assets/icon_navBack.png')}
            style={styles.backIcon}
          />
          <Text style={styles.navTitle}>건강검진 정보 입력</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.description}>
          반려동물의 건강검진 결과를 입력하거나 불러올 수 있습니다.
        </Text>

        {/* ── 기본 정보 ── */}
        <Text style={styles.sectionTitle}>기본 정보</Text>

        {/* 반려동물 이름 */}
        <View style={styles.inputBox}>
          <Text style={styles.inputValue}>{petName}</Text>
          <Image
            source={require('../assets/icon_arrowDown.png')}
            style={styles.dropdownIcon}
          />
        </View>

        {/* 날짜 */}
        <View style={styles.inputBox}>
          <TextInput
            style={styles.inputValue}
            value={checkupDate}
            onChangeText={setCheckupDate}
            placeholder="YYYY-MM-DD"
            placeholderTextColor="#aaa"
            keyboardType="numeric"
          />
        </View>

        {/* 병원명 */}
        <View style={styles.inputBox}>
          <TextInput
            style={styles.inputValue}
            value={hospitalName}
            onChangeText={setHospitalName}
            placeholder="병원명 (선택)"
            placeholderTextColor="#aaa"
          />
        </View>

        {/* 검진 종류 */}
        <View style={styles.examTypeSection}>
          <Text style={styles.subLabel}>검진 종류</Text>
          <View style={styles.examTypeRow}>
            {EXAM_TYPES.map(type => {
              const active = selectedExamTypes.includes(type);
              return (
                <TouchableOpacity
                  key={type}
                  style={[styles.examTypeBtn, active && styles.examTypeBtnActive]}
                  onPress={() => toggleExamType(type)}
                >
                  <Text
                    style={[
                      styles.examTypeBtnText,
                      active && styles.examTypeBtnTextActive,
                    ]}
                  >
                    {type}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* ── 기본 신체검사 결과 ── */}
        <Text style={[styles.sectionTitle, { marginTop: 28 }]}>기본 신체검사 결과</Text>
        <View style={styles.physicalContainer}>
          {PHYSICAL_ITEMS.map((item, idx) => (
            <View
              key={item}
              style={[
                styles.physicalRow,
                idx < PHYSICAL_ITEMS.length - 1 && styles.physicalRowBorder,
              ]}
            >
              <Text style={styles.physicalLabel}>{item}</Text>
              <View style={styles.physicalBtns}>
                {RESULT_OPTIONS.map(result => {
                  const active = physicalResults[item] === result;
                  return (
                    <TouchableOpacity
                      key={result}
                      style={[
                        styles.physicalBtn,
                        active && styles.physicalBtnActive,
                      ]}
                      onPress={() => setPhysicalResult(item, result)}
                    >
                      <Text
                        style={[
                          styles.physicalBtnText,
                          active && styles.physicalBtnTextActive,
                        ]}
                      >
                        {result}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          ))}
        </View>

        {/* ── 검진결과 불러오기 ── */}
        <View style={styles.importBox}>
          <Text style={styles.importTitle}>검진결과를 빠르게 불러오세요</Text>
          <Text style={styles.importDesc}>
            병원 연동 또는 진단서 업로드로 자동 입력할 수 있습니다
          </Text>
          <TouchableOpacity
            style={styles.importBtn}
            onPress={() => Alert.alert('알림', '준비 중인 기능입니다.')}
          >
            <Text style={styles.importBtnText}>검진결과 불러오기</Text>
          </TouchableOpacity>
        </View>

        {/* ── 특이사항 ── */}
        <Text style={[styles.subLabel, { marginTop: 28 }]}>특이사항</Text>
        <TextInput
          style={styles.notesInput}
          value={notes}
          onChangeText={setNotes}
          placeholder="특이사항을 입력해주세요"
          placeholderTextColor="#aaa"
          multiline
          numberOfLines={4}
          textAlignVertical="top"
        />
      </ScrollView>

      {/* 하단 버튼 */}
      <View style={styles.bottomBtns}>
        <TouchableOpacity
          style={styles.cancelBtn}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.cancelBtnText}>취소</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.submitBtn} onPress={handleSubmit}>
          <Text style={styles.submitBtnText}>다음</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

export default HealthCheckInputScreen;

/* ─── 스타일 ─── */
const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#fff',
  },

  /* NavBar */
  navBar: {
    height: 56,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F5',
  },
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  backIcon: {
    width: 20,
    height: 20,
    tintColor: '#333',
    marginRight: 8,
  },
  navTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#040505',
  },

  /* 스크롤 */
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 24,
  },
  description: {
    fontSize: 14,
    color: '#555',
    lineHeight: 22,
    marginBottom: 24,
  },

  /* 섹션 */
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#040505',
    marginBottom: 12,
  },
  subLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#040505',
    marginBottom: 10,
  },

  /* 입력 박스 */
  inputBox: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  inputValue: {
    flex: 1,
    fontSize: 15,
    color: '#040505',
  },
  dropdownIcon: {
    width: 14,
    height: 14,
    tintColor: '#aaa',
  },

  /* 검진 종류 */
  examTypeSection: {
    marginTop: 4,
  },
  examTypeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  examTypeBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D0D0D0',
    backgroundColor: '#fff',
    marginBottom: 4,
  },
  examTypeBtnActive: {
    borderColor: '#0081D5',
    backgroundColor: '#EEF7FD',
  },
  examTypeBtnText: {
    fontSize: 14,
    color: '#333',
  },
  examTypeBtnTextActive: {
    color: '#0081D5',
    fontWeight: '600',
  },

  /* 신체검사 */
  physicalContainer: {
    borderWidth: 1,
    borderColor: '#E8E8E8',
    borderRadius: 10,
    overflow: 'hidden',
    marginBottom: 4,
  },
  physicalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
  },
  physicalRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F5',
  },
  physicalLabel: {
    width: 72,
    fontSize: 14,
    color: '#333',
  },
  physicalBtns: {
    flexDirection: 'row',
    gap: 6,
  },
  physicalBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#D0D0D0',
    backgroundColor: '#fff',
  },
  physicalBtnActive: {
    backgroundColor: '#0081D5',
    borderColor: '#0081D5',
  },
  physicalBtnText: {
    fontSize: 13,
    color: '#333',
  },
  physicalBtnTextActive: {
    color: '#fff',
    fontWeight: '600',
  },

  /* 검진결과 불러오기 */
  importBox: {
    marginTop: 24,
    backgroundColor: '#EEF7FD',
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: '#0081D5',
  },
  importTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#040505',
    marginBottom: 6,
  },
  importDesc: {
    fontSize: 13,
    color: '#555',
    lineHeight: 20,
    marginBottom: 16,
  },
  importBtn: {
    backgroundColor: '#0081D5',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  importBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },

  /* 특이사항 */
  notesInput: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 14,
    color: '#040505',
    minHeight: 100,
    marginTop: 4,
  },

  /* 하단 버튼 */
  bottomBtns: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 16,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F5',
    backgroundColor: '#fff',
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 12,
    backgroundColor: '#F3F4F5',
    alignItems: 'center',
  },
  cancelBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  submitBtn: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 12,
    backgroundColor: '#0081D5',
    alignItems: 'center',
  },
  submitBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});
