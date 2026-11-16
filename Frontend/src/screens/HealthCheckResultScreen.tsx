import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet, ScrollView, TouchableOpacity, Image, Alert, TextInput } from 'react-native';
import { useFocusEffect, useIsFocused, useNavigation, useRoute } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import type { RouteProp } from '@react-navigation/native';
import type { RootStackParamList } from '../../App';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createManualCertificate, deleteCertificateSubmission, getCertificateImageUrl, getSavedCertificate, updateSavedCertificate } from '../api/diagnosis';
import { clearPendingCertificate } from '../storage/certificateRecovery';
import { getAuthSession } from '../storage/tokenStorage';
import { healthStore } from '../store/healthStore';
import type { DiagnosisCertificate, HealthSummary } from '../types/health';

type NavProp = StackNavigationProp<RootStackParamList, 'HealthCheckResult'>;
type RoutePropType = RouteProp<RootStackParamList, 'HealthCheckResult'>;
const CERTIFICATE_LABELS = {
  animalName: '동물명', species: '종류', breed: '품종', sex: '성별', coatColor: '모색',
  age: '연령', features: '특징', diseaseName: '병명', onsetDate: '발병 연월일',
  diagnosisDate: '진단 연월일', prognosis: '예후 소견', remarks: '그 외의 사항(비고)',
} satisfies Record<keyof DiagnosisCertificate, string>;
const certificateKeys = Object.keys(CERTIFICATE_LABELS) as (keyof DiagnosisCertificate)[];

const HealthCheckResultScreen = () => {
  const insets = useSafeAreaInsets();
  const focused = useIsFocused();
  const navigation = useNavigation<NavProp>();
  const route = useRoute<RoutePropType>();
  const { petId, petName, certificateSubmissionId, certificateOwnerId, certificateChanges, historySubmissionId, viewOnly } = route.params;
  const [remoteSummary, setRemoteSummary] = useState<HealthSummary>();
  const [historyFailed, setHistoryFailed] = useState(false);
  const [revision, setRevision] = useState(0);
  const [imageFailed, setImageFailed] = useState(false);
  const summary = historySubmissionId ? remoteSummary : route.params.summary;
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<HealthSummary>();
  const saveRequest = useRef<AbortController | null>(null);
  const session = useRef(getAuthSession()).current;
  useFocusEffect(useCallback(() => () => {
    saveRequest.current?.abort();
    saveRequest.current = null;
  }, []));
  useEffect(() => {
    if (!focused || !historySubmissionId) return;
    const controller = new AbortController();
    const { signal } = controller;
    const timeout = setTimeout(() => controller.abort(), 30_000);
    let active = true;
    setRemoteSummary(undefined);
    setDraft(undefined);
    setHistoryFailed(false);
    setImageFailed(false);
    const load = async () => {
      try {
        const result = await getSavedCertificate(petId, historySubmissionId, signal);
        if (signal.aborted) throw new Error();
        if (!active || getAuthSession() !== session) return;
        setRemoteSummary(result);
        try {
          const uri = await getCertificateImageUrl(historySubmissionId, signal);
          if (uri && active && !signal.aborted && getAuthSession() === session) {
            setRemoteSummary(current => current && { ...current, certificateImageUri: uri });
          }
        } catch {
          if (active && getAuthSession() === session) setImageFailed(true);
        }
      } catch {
        if (active && getAuthSession() === session) {
          setHistoryFailed(true);
        }
      } finally {
        clearTimeout(timeout);
      }
    };
    load();
    return () => { active = false; clearTimeout(timeout); controller.abort(); };
  }, [focused, historySubmissionId, petId, revision, session]);
  const canManage = Boolean(viewOnly && historySubmissionId && remoteSummary);
  const runMutation = async (action: (signal: AbortSignal) => Promise<void>) => {
    if (saveRequest.current || getAuthSession() !== session) return;
    const controller = new AbortController();
    saveRequest.current = controller;
    setSaving(true);
    const timeout = setTimeout(() => controller.abort(), 30_000);
    try {
      await action(controller.signal);
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

  const ownsMutation = (signal: AbortSignal) =>
    saveRequest.current?.signal === signal && getAuthSession() === session;
  const isCurrent = (signal: AbortSignal) => !signal.aborted && ownsMutation(signal);

  const handleSave = () => {
    if (!summary || viewOnly) return;
    return runMutation(async signal => {
      let submissionId: string;
      if (certificateSubmissionId) {
        await updateSavedCertificate(certificateSubmissionId, certificateChanges ?? {}, summary.hospitalName?.trim() || undefined, signal);
        submissionId = certificateSubmissionId;
        if (isCurrent(signal) && certificateOwnerId !== undefined) {
          await clearPendingCertificate(certificateOwnerId, petId, certificateSubmissionId, session).catch(() => undefined);
        }
      } else {
        submissionId = await createManualCertificate(petId, summary.certificate, signal, summary.hospitalName);
      }
      if (!isCurrent(signal)) return;
      healthStore.set(petId, { ...summary, certificateSubmissionId: submissionId,
        certificateImageUri: certificateSubmissionId ? summary.certificateImageUri : undefined });
      navigation.pop(2);
    });
  };

  const saveEdits = () => {
    if (!draft || !remoteSummary || !historySubmissionId) return;
    const changes: Partial<DiagnosisCertificate> = {};
    for (const key of certificateKeys) {
      const value = draft.certificate[key].trim();
      if (value !== remoteSummary.certificate[key].trim()) changes[key] = value;
    }
    const hospitalName = draft.hospitalName?.trim() ?? '';
    const changedHospital = hospitalName !== (remoteSummary.hospitalName ?? '') ? hospitalName : undefined;
    return runMutation(async signal => {
      await updateSavedCertificate(historySubmissionId, changes, changedHospital, signal);
      if (!isCurrent(signal)) return;
      setDraft(undefined);
      healthStore.remove(petId, historySubmissionId);
      try {
        const fresh = await getSavedCertificate(petId, historySubmissionId, signal);
        if (signal.aborted) throw new Error();
        if (!isCurrent(signal)) return;
        healthStore.set(petId, fresh);
        setRemoteSummary(current => ({ ...fresh, certificateImageUri: current?.certificateImageUri }));
      } catch {
        if (!ownsMutation(signal)) return;
        // The PATCH succeeded. Retry only the read, not the update.
        setRemoteSummary(undefined);
        setHistoryFailed(true);
      }
    });
  };

  const confirmDelete = () => {
    if (!canManage || !historySubmissionId || saveRequest.current) return;
    Alert.alert('진단서 삭제', '이 진단서를 삭제할까요?', [
      { text: '취소', style: 'cancel' },
      { text: '삭제', style: 'destructive', onPress: () => runMutation(async signal => {
        await deleteCertificateSubmission(historySubmissionId, signal);
        if (!isCurrent(signal)) return;
        healthStore.remove(petId, historySubmissionId);
        navigation.goBack();
      }) },
    ]);
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
        keyboardShouldPersistTaps="handled"
      >
        {!summary ? (historyFailed ? (
          <TouchableOpacity accessibilityRole="button" onPress={() => setRevision(value => value + 1)}>
            <Text style={styles.infoValue}>검진 기록을 불러오지 못했어요. 다시 시도</Text>
          </TouchableOpacity>
        ) : <ActivityIndicator />) : <View style={styles.card}>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>반려동물</Text>
            <Text style={styles.infoValue}>{petName}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>검진일</Text>
            <Text style={styles.infoValue}>{(draft ? draft.certificate.diagnosisDate : summary.checkupDate) || '미입력'}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>병원명</Text>
            {draft ? <TextInput accessibilityLabel="병원명" style={styles.editInput} editable={!saving}
              value={draft.hospitalName ?? ''} onChangeText={hospitalName => setDraft(current => current && { ...current, hospitalName })} />
              : <Text style={styles.infoValue}>{summary.hospitalName || '미입력'}</Text>}
          </View>
        </View>}
        {viewOnly && summary && (
          <View style={[styles.card, { marginTop: 16 }]}>
            {imageFailed && <TouchableOpacity accessibilityRole="button" onPress={() => setRevision(value => value + 1)}>
              <Text style={styles.infoLabel}>이미지 다시 불러오기</Text>
            </TouchableOpacity>}
            {!imageFailed && summary.certificateImageUri && (
              <Image source={{ uri: summary.certificateImageUri }} resizeMode="contain" onError={historySubmissionId ? () => setImageFailed(true) : undefined} style={{ width: '100%', height: 200, marginBottom: 16 }} />
            )}
            {certificateKeys.map(key => (
              <View key={key} style={styles.infoRow}>
                <Text style={styles.infoLabel}>{CERTIFICATE_LABELS[key]}</Text>
                {draft ? <TextInput accessibilityLabel={CERTIFICATE_LABELS[key]} style={styles.editInput} editable={!saving}
                  multiline value={draft.certificate[key]} onChangeText={value =>
                    setDraft(current => current && { ...current, certificate: { ...current.certificate, [key]: value } })} />
                  : <Text style={[styles.infoValue, styles.fieldValue]}>{summary.certificate[key] || '미입력'}</Text>}
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
      {canManage && <View style={[styles.bottomBtns, { paddingBottom: 16 + insets.bottom }]}>
        {draft ? <>
          <TouchableOpacity accessibilityRole="button" style={styles.editBtn} disabled={saving} onPress={() => setDraft(undefined)}>
            <Text style={styles.editBtnText}>취소</Text>
          </TouchableOpacity>
          <TouchableOpacity accessibilityRole="button" style={styles.saveBtn} disabled={saving} onPress={saveEdits}>
            <Text style={styles.saveBtnText}>저장하기</Text>
          </TouchableOpacity>
        </> : <>
          <TouchableOpacity accessibilityRole="button" style={styles.editBtn} disabled={saving} onPress={confirmDelete}>
            <Text style={[styles.editBtnText, styles.deleteText]}>삭제</Text>
          </TouchableOpacity>
          <TouchableOpacity accessibilityRole="button" style={styles.saveBtn} disabled={saving} onPress={() => setDraft(remoteSummary)}>
            <Text style={styles.saveBtnText}>수정하기</Text>
          </TouchableOpacity>
        </>}
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

  fieldValue: { flex: 1, textAlign: 'right', marginLeft: 12 },
  editInput: { flex: 1, marginLeft: 12, borderWidth: 1, borderColor: '#EAECEE', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 8, color: '#040505', fontSize: 16 },
  deleteText: { color: '#B3261E' },

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
