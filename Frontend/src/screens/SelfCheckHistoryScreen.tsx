import React, { useEffect, useRef, useState } from 'react';
import { Alert, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useIsFocused } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../App';
import { deleteSelfCheck, listSelfChecks, SelfCheckPage } from '../api/selfCheck';
import { STAGES } from '../data/selfCheck';

type Props = NativeStackScreenProps<RootStackParamList, 'SelfCheckHistory'>;
export default function SelfCheckHistoryScreen({ route, navigation }: Props) {
  const { petId, petName } = route.params;
  const focused = useIsFocused();
  const deletionPending = useRef(false);
  const [page, setPage] = useState(0);
  const [result, setResult] = useState<SelfCheckPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [revision, setRevision] = useState(0);
  const [deleting, setDeleting] = useState(false);
  useEffect(() => {
    if (!focused) return;
    let active = true;
    setLoading(true); setError(false);
    listSelfChecks(petId, page).then(value => { if (active) setResult(value); })
      .catch(() => { if (active) setError(true); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [petId, page, revision, focused]);
  const remove = (id: number) => Alert.alert('진단 기록 삭제', '이 기록을 삭제하시겠어요?', [
    { text: '취소', style: 'cancel' },
    { text: '삭제', style: 'destructive', onPress: async () => {
      if (deletionPending.current) return;
      deletionPending.current = true;
      setDeleting(true);
      try { await deleteSelfCheck(petId, id); setPage(0); setRevision(value => value + 1); }
      catch { Alert.alert('오류', '삭제하지 못했습니다. 다시 시도해 주세요.'); }
      finally { deletionPending.current = false; setDeleting(false); }
    } },
  ]);
  return <SafeAreaView style={styles.screen}>
    <TouchableOpacity style={styles.header} onPress={() => navigation.goBack()}><Image source={require('../assets/icon_navBack.png')} style={styles.backIcon} /><Text style={styles.title}>{petName} 자가진단 기록</Text></TouchableOpacity>
    <ScrollView contentContainerStyle={styles.content}>
      {loading ? <Text>불러오는 중입니다.</Text> : error ? <TouchableOpacity onPress={() => setRevision(value => value + 1)}><Text>기록을 불러오지 못했습니다. 다시 시도</Text></TouchableOpacity> : <>
        {result?.content.length === 0 && <Text style={styles.emptyText}>등록된 자가진단 기록이 없습니다.</Text>}
        {result?.content.map(item => <View key={item.id} style={styles.card}>
          <TouchableOpacity disabled={deleting} onPress={() => navigation.navigate('SelfCheck', { petId, recordId: item.id })}>
            <Text style={styles.date}>{new Date(item.createdAt).toLocaleString('ko-KR')}</Text>
            <Text style={styles.stage}>{item.overallStage}단계 · {STAGES[item.overallStage].label}</Text>
            <Text style={styles.link}>상세 보기</Text>
          </TouchableOpacity>
          <TouchableOpacity disabled={deleting} onPress={() => remove(item.id)}><Text style={styles.delete}>삭제</Text></TouchableOpacity>
        </View>)}
        <View style={styles.pages}>
          <TouchableOpacity disabled={page === 0 || deleting} onPress={() => setPage(value => value - 1)}><Text style={styles.pageText}>이전</Text></TouchableOpacity>
          <Text style={styles.pageText}>{page + 1}</Text>
          <TouchableOpacity disabled={!result || result.last || deleting} onPress={() => setPage(value => value + 1)}><Text style={styles.pageText}>다음</Text></TouchableOpacity>
        </View>
      </>}
    </ScrollView>
  </SafeAreaView>;
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F3F4F5' }, header: { backgroundColor: '#fff', padding: 20, flexDirection: 'row', alignItems: 'center' },
  backIcon: { width: 20, height: 20, tintColor: '#1F2024', marginRight: 12 },
  emptyText: { color: '#000' },
  pageText: { color: '#000' },
  title: { fontSize: 18, color: '#040505', fontWeight: '600' }, content: { padding: 20, paddingBottom: 40 },
  card: { padding: 20, borderRadius: 16, backgroundColor: '#fff', marginBottom: 12 }, date: { color: '#777' },
  stage: { fontSize: 16, color: '#040505', marginVertical: 12, fontWeight: '600' }, link: { color: '#0081D5' },
  delete: { color: '#777', paddingTop: 16 }, pages: { flexDirection: 'row', justifyContent: 'space-between', padding: 12 },
});
