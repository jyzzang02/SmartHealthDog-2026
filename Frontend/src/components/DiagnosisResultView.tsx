import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export type DiagnosisResultItem = { name: string; value?: string; description?: string };

type Props = {
  title: string;
  petName?: string;
  items: DiagnosisResultItem[];
  footerContent?: React.ReactNode;
  onBack: () => void;
  onRetake: () => void;
  onFindHospital: () => void;
};

export default function DiagnosisResultView({ title, petName, items, footerContent, onBack, onRetake, onFindHospital }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <TouchableOpacity style={styles.back} onPress={onBack} accessibilityRole="button" accessibilityLabel="뒤로">
        <Text style={styles.backText}>‹</Text>
      </TouchableOpacity>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <Text style={styles.title}>
          {petName ? <Text style={styles.highlight}>{petName}의 </Text> : null}{title}
        </Text>
        {items.length > 0 ? <Text style={styles.count}>검사 결과 {items.length}개</Text> : null}
        <View style={styles.notice}>
          <Text style={styles.noticeTitle}>검사 결과를 확인해 주세요</Text>
          <Text style={styles.noticeText}>검사 결과는 참고용입니다. 궁금한 점이 있다면 동물병원에 상담해 주세요.</Text>
        </View>
        {items.length ? items.map((item, index) => (
          <View style={styles.card} key={index}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>{item.name}</Text>
              {item.value ? <Text style={styles.badge}>{item.value}</Text> : null}
            </View>
            {item.description ? <Text style={styles.description}>{item.description}</Text> : null}
          </View>
        )) : <Text style={styles.empty}>진단 결과가 없습니다.</Text>}
        {items.length > 0 ? footerContent : null}
      </ScrollView>
      <View style={[styles.actions, { paddingBottom: 12 + insets.bottom }]}>
        <TouchableOpacity style={[styles.button, styles.secondary]} onPress={onRetake}><Text style={styles.secondaryText}>다시 촬영</Text></TouchableOpacity>
        <TouchableOpacity style={[styles.button, styles.primary]} onPress={onFindHospital}><Text style={styles.primaryText}>병원 찾기</Text></TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F3F4F5' },
  back: { width: 48, height: 48, justifyContent: 'center', alignItems: 'center' },
  backText: { fontSize: 34, color: '#1F2024', lineHeight: 40 },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 20, paddingBottom: 24 },
  title: { color: '#1F2024', fontSize: 24, fontWeight: '700', lineHeight: 34, marginTop: 8 },
  highlight: { color: '#0081D5' },
  count: { color: '#0081D5', fontSize: 16, fontWeight: '600', marginTop: 8 },
  notice: { backgroundColor: '#FFC94D', borderRadius: 12, padding: 18, marginTop: 20, marginBottom: 16 },
  noticeTitle: { color: '#006EB5', fontSize: 15, fontWeight: '700', marginBottom: 6 },
  noticeText: { color: '#3C4144', fontSize: 13, lineHeight: 20 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 18, marginBottom: 12 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  cardTitle: { color: '#1F2024', fontSize: 17, fontWeight: '700', flex: 1 },
  badge: { color: '#007BC5', backgroundColor: '#EEF7FD', borderRadius: 16, overflow: 'hidden', paddingHorizontal: 12, paddingVertical: 6, fontSize: 14, fontWeight: '700' },
  description: { color: '#65686D', fontSize: 14, lineHeight: 21, marginTop: 12 },
  empty: { color: '#7B7C7D', fontSize: 15, textAlign: 'center', paddingVertical: 32 },
  actions: { flexDirection: 'row', gap: 12, paddingHorizontal: 20, paddingTop: 12, backgroundColor: '#F3F4F5' },
  button: { flex: 1, minHeight: 54, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  secondary: { backgroundColor: '#E5E8EB' },
  primary: { backgroundColor: '#0081D5' },
  secondaryText: { color: '#555B60', fontSize: 16, fontWeight: '700' },
  primaryText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
});
