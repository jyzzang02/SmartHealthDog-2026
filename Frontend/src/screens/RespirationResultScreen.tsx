import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { RootStackParamList } from '../../App';
import { getRespirationRecord, listRespirationRecords, type RespirationRecord } from '../api/respiration';

type Props = NativeStackScreenProps<RootStackParamList, 'RespirationResult'>;
type Result = { state: 'loading' | 'empty' | 'error' } | { state: 'record'; record: RespirationRecord };

const STATUS_TEXT: Record<RespirationRecord['status'], string> = {
  UPLOADING: '영상 등록을 완료하지 않았어요.',
  PENDING: '영상이 등록되었어요. 아직 분석 대기 중이에요.',
  PROCESSING: '수면 영상을 분석하고 있어요.',
  COMPLETED: '호흡수 결과를 확인할 수 없어요.',
  FAILED: '영상을 분석하지 못했어요.',
};

export default function RespirationResultScreen({ route, navigation }: Props) {
  const { petId, petName, videoId } = route.params;
  const focused = useIsFocused();
  const [result, setResult] = useState<Result>({ state: 'loading' });
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (!focused) return;
    const controller = new AbortController();
    const { signal } = controller;
    setResult({ state: 'loading' });
    const load = async () => {
      try {
        const record = videoId
          ? await getRespirationRecord(petId, videoId, signal)
          : (await listRespirationRecords(petId, signal)).find(item => item.petId === petId);
        if (signal.aborted) return;
        if (record && (record.petId !== petId || (videoId && record.videoId !== videoId))) {
          setResult({ state: 'error' });
        } else {
          setResult(record ? { state: 'record', record } : { state: 'empty' });
        }
      } catch {
        if (!signal.aborted) setResult({ state: 'error' });
      }
    };
    load();
    return () => controller.abort();
  }, [focused, petId, videoId, revision]);

  const record = result.state === 'record' ? result.record : null;
  const rate = record?.status === 'COMPLETED' ? record.respiratoryRate : null;
  const hasRate = typeof rate === 'number' && Number.isFinite(rate) && rate > 0;
  const message = record ? (STATUS_TEXT[record.status] ?? '분석 상태를 확인할 수 없어요.')
    : result.state === 'empty' ? '등록된 수면 영상이 없어요.' : '분석 결과를 불러오지 못했어요.';

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="뒤로" style={styles.back} onPress={() => navigation.goBack()}>
          <Image source={require('../assets/icon_navBack.png')} style={styles.backIcon} />
        </Pressable>
        <Text accessibilityRole="header" style={styles.title}>수면 영상 분석 결과</Text>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.petName}>{petName}</Text>
        {result.state === 'loading' ? (
          <ActivityIndicator accessibilityLabel="분석 결과 불러오는 중" color="#0081D5" />
        ) : (
          <View style={styles.card}>
            {hasRate ? (
              <>
                <Text style={styles.label}>수면 중 분당 호흡수</Text>
                <Text style={styles.rate}>{rate} <Text style={styles.unit}>회/분</Text></Text>
              </>
            ) : <Text style={styles.label}>{message}</Text>}
          </View>
        )}
        {result.state !== 'loading' && !hasRate && (
          <Pressable accessibilityRole="button" style={styles.refresh}
            onPress={() => { setResult({ state: 'loading' }); setRevision(value => value + 1); }}>
            <Text style={styles.refreshText}>다시 확인</Text>
          </Pressable>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F3F4F5' },
  header: { minHeight: 56, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff' },
  back: { width: 44, minHeight: 44, justifyContent: 'center' },
  backIcon: { width: 20, height: 20, tintColor: '#1F2024' },
  title: { flex: 1, fontSize: 20, fontWeight: '700', color: '#1F2024' },
  content: { padding: 20, gap: 14 },
  petName: { fontSize: 18, fontWeight: '700', color: '#1F2024' },
  card: { padding: 24, gap: 8, backgroundColor: '#fff', borderRadius: 16 },
  label: { fontSize: 16, color: '#343A40' },
  rate: { fontSize: 36, fontWeight: '700', color: '#006DAF' },
  unit: { fontSize: 16, fontWeight: '600' },
  refresh: { minHeight: 48, justifyContent: 'center', alignItems: 'center', padding: 12, borderRadius: 12, backgroundColor: '#EAF5FF' },
  refreshText: { color: '#006DAF', fontWeight: '700', fontSize: 16 },
});
