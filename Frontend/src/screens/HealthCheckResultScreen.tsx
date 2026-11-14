import React, { useCallback, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, Alert } from 'react-native';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import type { RouteProp } from '@react-navigation/native';
import type { RootStackParamList } from '../../App';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { updateCertificate } from '../api/diagnosis';
import { clearPendingCertificate } from '../storage/certificateRecovery';
import { getAuthSession } from '../storage/tokenStorage';
import { healthStore } from '../store/healthStore';

type NavProp = StackNavigationProp<RootStackParamList, 'HealthCheckResult'>;
type RoutePropType = RouteProp<RootStackParamList, 'HealthCheckResult'>;

const HealthCheckResultScreen = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavProp>();
  const route = useRoute<RoutePropType>();
  const { petId, petName, summary, certificateSubmissionId, certificateOwnerId, viewOnly } = route.params;
  const [saving, setSaving] = useState(false);
  const saveRequest = useRef<AbortController | null>(null);
  const session = useRef(getAuthSession()).current;
  useFocusEffect(useCallback(() => () => {
    saveRequest.current?.abort();
    saveRequest.current = null;
  }, []));
  const fields = [
    ['동물명', summary.certificate.animalName], ['종류', summary.certificate.species],
    ['품종', summary.certificate.breed], ['성별', summary.certificate.sex],
    ['모색', summary.certificate.coatColor], ['연령', summary.certificate.age],
    ['특징', summary.certificate.features], ['병명', summary.certificate.diseaseName],
    ['발병 연월일', summary.certificate.onsetDate], ['진단 연월일', summary.certificate.diagnosisDate],
    ['예후 소견', summary.certificate.prognosis], ['그 외의 사항(비고)', summary.certificate.remarks],
  ];

  const handleSave = async () => {
    if (viewOnly || saveRequest.current || getAuthSession() !== session) return;
    if (!certificateSubmissionId) {
      healthStore.set(petId, summary);
      navigation.pop(2);
      return;
    }

    const controller = new AbortController();
    saveRequest.current = controller;
    setSaving(true);
    const timeout = setTimeout(() => controller.abort(), 30_000);
    try {
      await updateCertificate(certificateSubmissionId, summary.certificate, controller.signal);
      if (certificateOwnerId !== undefined) {
        await clearPendingCertificate(certificateOwnerId, petId, certificateSubmissionId, session).catch(() => undefined);
      }
      if (controller.signal.aborted || getAuthSession() !== session) return;
      healthStore.set(petId, summary);
      navigation.pop(2);
    } catch (error) {
      if (saveRequest.current !== controller || getAuthSession() !== session) return;
      Alert.alert('오류', error instanceof Error ? error.message : '요청을 처리하지 못했습니다.');
    } finally {
      clearTimeout(timeout);
      if (saveRequest.current === controller) {
        saveRequest.current = null;
        setSaving(false);
      }
    }
  };

  return (
    <View style={styles.screen}>
      {/* NavBar */}
      <View style={[styles.navBar, { height: 56 + insets.top, paddingTop: insets.top }]}>
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
        contentContainerStyle={[styles.content, viewOnly && { paddingBottom: 24 + Math.max(insets.bottom, 24) }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.card}>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>반려동물</Text>
            <Text style={styles.infoValue}>{petName}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>검진일</Text>
            <Text style={styles.infoValue}>{summary.checkupDate}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>병원명</Text>
            <Text style={styles.infoValue}>{summary.hospitalName || '미입력'}</Text>
          </View>
        </View>
        {viewOnly && (
          <View style={[styles.card, { marginTop: 16 }]}>
            {summary.certificateImageUri && (
              <Image source={{ uri: summary.certificateImageUri }} resizeMode="contain" style={{ width: '100%', height: 200, marginBottom: 16 }} />
            )}
            {fields.map(([label, value]) => (
              <View key={label} style={styles.infoRow}>
                <Text style={styles.infoLabel}>{label}</Text>
                <Text style={[styles.infoValue, { flex: 1, textAlign: 'right', marginLeft: 12 }]}>{value || '미입력'}</Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* 하단 버튼 */}
      {!viewOnly && <View style={[styles.bottomBtns, { paddingBottom: 16 + insets.bottom }]}>
        <TouchableOpacity style={styles.editBtn} disabled={saving} onPress={() => navigation.goBack()}>
          <Text style={styles.editBtnText}>수정하기</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.saveBtn} disabled={saving} onPress={handleSave}>
          <Text style={styles.saveBtnText}>저장하기</Text>
        </TouchableOpacity>
      </View>}
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
    paddingTop: 16,
    paddingBottom: 24,
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
