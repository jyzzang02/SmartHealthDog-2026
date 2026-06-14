import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import type { RouteProp } from '@react-navigation/native';
import type { RootStackParamList } from '../../App';
import { healthStore } from '../store/healthStore';
import { CONDITION_COLORS } from '../types/health';

type NavProp = StackNavigationProp<RootStackParamList, 'HealthCheckResult'>;
type RoutePropType = RouteProp<RootStackParamList, 'HealthCheckResult'>;

const HealthCheckResultScreen = () => {
  const navigation = useNavigation<NavProp>();
  const route = useRoute<RoutePropType>();
  const { petId, petName, summary } = route.params;

  const conditionColor = CONDITION_COLORS[summary.overallCondition].text;
  const summaryText =
    summary.healthTags.length > 0 ? summary.healthTags.join(', ') : '특이사항 없음';

  const handleSave = () => {
    healthStore.set(petId, summary);
    navigation.pop(2);
  };

  return (
    <View style={styles.screen}>
      {/* NavBar */}
      <View style={styles.navBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backRow}>
          <Image
            source={require('../assets/icon_navBack.png')}
            style={styles.backIcon}
          />
          <Text style={styles.navTitle}>검진결과 확인</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.description}>
          불러오거나 입력한 검진결과를 확인해주세요
        </Text>

        <View style={styles.card}>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>반려동물</Text>
            <Text style={styles.infoValue}>{petName}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>검진일</Text>
            <Text style={styles.infoValue}>{summary.checkupDate}</Text>
          </View>

          <View style={styles.summaryBox}>
            <Text style={styles.summaryLabel}>건강 상태 요약</Text>
            <Text style={[styles.summaryValue, { color: conditionColor }]}>
              {summaryText}
            </Text>
          </View>

          <View style={styles.trackBox}>
            <Text style={styles.trackText}>{`✓ ${summary.recommendation}`}</Text>
          </View>
        </View>
      </ScrollView>

      {/* 하단 버튼 */}
      <View style={styles.bottomBtns}>
        <TouchableOpacity style={styles.editBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.editBtnText}>수정하기</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
          <Text style={styles.saveBtnText}>저장하기</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

export default HealthCheckResultScreen;

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
    color: '#7B7C7D',
    lineHeight: 22,
    marginBottom: 16,
  },

  /* 카드 */
  card: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#EAECEE',
    borderRadius: 12,
    padding: 20,
    gap: 16,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 0 },
    elevation: 2,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  infoLabel: {
    fontSize: 14,
    color: '#7B7C7D',
  },
  infoValue: {
    fontSize: 16,
    color: '#040505',
    fontWeight: '500',
  },

  /* 건강 상태 요약 */
  summaryBox: {
    backgroundColor: '#F3F4F5',
    borderRadius: 12,
    padding: 16,
    gap: 8,
  },
  summaryLabel: {
    fontSize: 14,
    color: '#7B7C7D',
  },
  summaryValue: {
    fontSize: 18,
    fontWeight: '700',
  },

  /* 추적관찰 */
  trackBox: {
    backgroundColor: '#EEF7FD',
    borderRadius: 8,
    padding: 12,
  },
  trackText: {
    fontSize: 14,
    color: '#0081D5',
    fontWeight: '500',
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
  editBtn: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#EAECEE',
    alignItems: 'center',
  },
  editBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#7B7C7D',
  },
  saveBtn: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 12,
    backgroundColor: '#0081D5',
    alignItems: 'center',
  },
  saveBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});
