import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { RootStackParamList } from '../../App';
import { getRespirationRecord, listRespirationRecords, type RespirationRecord } from '../api/respiration';

type Props = NativeStackScreenProps<RootStackParamList, 'RespirationResult'>;
type Result = { state: 'loading' | 'empty' | 'error' }
  | { state: 'record'; record: RespirationRecord }
  | { state: 'history'; records: RespirationRecord[] };

const POLL_INTERVAL_MS = 5_000;
const MAX_POLL_WINDOW_MS = 120_000;

const STATUS_TEXT: Record<RespirationRecord['status'], string> = {
  UPLOADING: '영상 등록을 완료하지 않았어요.',
  PENDING: '영상이 등록되었어요. 아직 분석 대기 중이에요.',
  PROCESSING: '수면 영상을 분석하고 있어요.',
  COMPLETED: '호흡수 결과를 확인할 수 없어요.',
  FAILED: '영상을 분석하지 못했어요.',
};

const measuredRate = (record: RespirationRecord): number | null => {
  const rate = record.respiratoryRate;
  return record.status === 'COMPLETED' && typeof rate === 'number' && Number.isFinite(rate) && rate > 0 ? rate : null;
};

const formatRecordedAt = (record: RespirationRecord) => {
  const timestamp = Date.parse(record.uploadedAt ?? record.createdAt);
  return Number.isFinite(timestamp) ? new Date(timestamp).toLocaleString('ko-KR') : null;
};

const statusMessage = (record: RespirationRecord) =>
  STATUS_TEXT[record.status] ?? '분석 상태를 확인할 수 없어요.';

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
    const deadline = Date.now() + MAX_POLL_WINDOW_MS;
    const deadlineTimer = videoId ? setTimeout(() => {
      controller.abort();
      setResult(current => current.state === 'loading' ? { state: 'error' } : current);
    }, MAX_POLL_WINDOW_MS) : undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = async () => {
      let willPoll = false;
      try {
        if (!videoId) {
          const records = (await listRespirationRecords(petId, signal)).filter(item => item?.petId === petId && item.videoId);
          if (!signal.aborted) setResult(records.length ? { state: 'history', records } : { state: 'empty' });
          return;
        }

        const record = await getRespirationRecord(petId, videoId, signal);
        if (signal.aborted) return;
        if (!record || record.petId !== petId || record.videoId !== videoId) {
          setResult({ state: 'error' });
          return;
        }
        setResult({ state: 'record', record });
        if ((record.status === 'PENDING' || record.status === 'PROCESSING') && Date.now() + POLL_INTERVAL_MS < deadline) {
          willPoll = true;
          timer = setTimeout(() => { if (!signal.aborted && Date.now() < deadline) load(); }, POLL_INTERVAL_MS);
        }
      } catch {
        if (!signal.aborted) setResult({ state: 'error' });
      } finally {
        if (!willPoll && deadlineTimer !== undefined) clearTimeout(deadlineTimer);
      }
    };
    load();
    return () => {
      if (timer !== undefined) clearTimeout(timer);
      if (deadlineTimer !== undefined) clearTimeout(deadlineTimer);
      controller.abort();
    };
  }, [focused, petId, videoId, revision]);

  const record = result.state === 'record' ? result.record : null;
  const rate = record ? measuredRate(record) : null;
  const date = record ? formatRecordedAt(record) : null;
  const message = record ? statusMessage(record)
    : result.state === 'empty' ? '등록된 수면 영상이 없어요.' : '분석 결과를 불러오지 못했어요.';

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="뒤로" style={styles.back} onPress={() => navigation.goBack()}>
          <Image source={require('../assets/icon_navBack.png')} style={styles.backIcon} />
        </Pressable>
        <Text accessibilityRole="header" style={styles.title}>{videoId ? '수면 영상 분석 결과' : '수면 영상 분석 기록'}</Text>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.petName}>{petName}</Text>
        {result.state === 'loading' ? (
          <ActivityIndicator accessibilityLabel="분석 결과 불러오는 중" color="#0081D5" />
        ) : result.state === 'history' ? (
          result.records.map(item => {
            const itemRate = measuredRate(item);
            const itemDate = formatRecordedAt(item);
            return (
              <Pressable key={item.videoId} accessibilityRole="button" style={styles.card}
                onPress={() => navigation.push('RespirationResult', { petId, petName, videoId: item.videoId })}>
                {itemDate && <Text style={styles.label}>{itemDate}</Text>}
                <Text style={styles.label}>{itemRate === null ? statusMessage(item) : itemRate + '회/분'}</Text>
              </Pressable>
            );
          })
        ) : (
          <View style={styles.card}>
            {rate !== null ? (
              <>
                <Text style={styles.label}>수면 중 분당 호흡수</Text>
                <Text style={styles.rate}>{rate} <Text style={styles.unit}>회/분</Text></Text>
              </>
            ) : <Text style={styles.label}>{message}</Text>}
            {date && <Text style={styles.label}>{date}</Text>}
            {record && Number.isFinite(record.durationSec) && <Text style={styles.label}>영상 길이: {record.durationSec}초</Text>}
            {record?.status === 'FAILED' && <Text style={styles.label}>영상을 다시 촬영하거나 선택해 주세요.</Text>}
          </View>
        )}
        {rate !== null && (
          <View style={styles.tip}>
            <Text style={styles.tipTitle}>Tip!</Text>
            <Text style={styles.tipText}>강아지와 고양이가 편히 쉬거나 잘 때, 분당 약 15~30회가 일반적인 참고 범위예요.</Text>
            <Text style={styles.tipText}>이 결과만으로 정상 여부를 판단할 수 없으며, 수의사의 진단이나 상담을 대신하지 않아요.</Text>
          </View>
        )}
        {result.state !== 'loading' && rate === null && (
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
  tip: { padding: 16, gap: 6, backgroundColor: '#FFF9E6', borderRadius: 12 },
  tipTitle: { fontSize: 14, fontWeight: '700', color: '#5C4210' },
  tipText: { fontSize: 14, lineHeight: 21, color: '#5C4210' },
  refresh: { minHeight: 48, justifyContent: 'center', alignItems: 'center', padding: 12, borderRadius: 12, backgroundColor: '#EAF5FF' },
  refreshText: { color: '#006DAF', fontWeight: '700', fontSize: 16 },
});
