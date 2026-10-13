import React, { useRef, useState } from 'react';
import { Alert, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { HospitalItem } from '../api/hospitals';
import HospitalCard from './HospitalCard';
import BlueButton from './BlueButton';
import { openNaverHospital } from '../utils/openNaverHospital';

interface Props {
  hospitals: readonly HospitalItem[];
  total: number;
  page: { limit: number; offset: number };
  onPageChange: (page: number) => void;
  searchLocation?: string;
}

const websiteLink = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const link = value.trim();
  // Only explicit web URLs are allowed; never open arbitrary server-provided schemes.
  if (!/^https?:\/\//i.test(link) || /[\s\\]/.test(link)) return null;
  try {
    const url = new URL(link);
    return url.hostname && !url.username && !url.password ? link : null;
  } catch { return null; }
};

export default function HospitalSearchResults({ hospitals, total, page, onPageChange, searchLocation }: Props) {
  const [selected, setSelected] = useState<HospitalItem | null>(null);
  const pageCount = Math.max(1, Math.ceil(total / page.limit));
  const currentPage = Math.floor(page.offset / page.limit);
  const distanceOrigin = searchLocation ? '검색 기준 위치' : '현재 위치';
  const hospital = selected && hospitals.includes(selected) ? selected : null;
  const launching = useRef(false);
  const website = websiteLink(hospital?.website_url);
  const closeDetails = () => setSelected(null);
  const launch = async (action: () => Promise<unknown>) => {
    if (launching.current) return;
    launching.current = true;
    try { await action(); }
    catch { Alert.alert('연결 실패', '연결할 수 없습니다. 다시 시도해 주세요.'); }
    finally { launching.current = false; }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>병원 검색 결과</Text>
      <Text style={styles.description}>선택한 검색 조건으로 불러온 병원 목록입니다.</Text>
      {hospitals.map((item, index) => (
        <HospitalCard
          key={`${item.hospital_id ?? item.name}:${page.offset + index}`}
          name={item.name}
          rating={item.rating}
          address={item.address}
          distanceMeters={item.distance_m}
          distanceOrigin={distanceOrigin}
          onPress={() => setSelected(item)}
          onMapPress={() => { launch(() => openNaverHospital(item)); }}
        />
      ))}
      {hospitals.length === 0 && <Text style={styles.empty}>표시할 병원이 없습니다.</Text>}
      <View style={styles.pagination}>
        <TouchableOpacity accessibilityRole="button" disabled={currentPage === 0} style={[styles.pageButton, currentPage === 0 && styles.disabled]} onPress={() => onPageChange(currentPage - 1)}>
          <Text style={styles.pageText}>이전</Text>
        </TouchableOpacity>
        <Text style={styles.description}>{currentPage + 1} / {pageCount}</Text>
        <TouchableOpacity accessibilityRole="button" disabled={currentPage + 1 >= pageCount} style={[styles.pageButton, currentPage + 1 >= pageCount && styles.disabled]} onPress={() => onPageChange(currentPage + 1)}>
          <Text style={styles.pageText}>다음</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.description}>페이지 이동 시 서버에서 병원 목록을 조회합니다.</Text>

      <Modal visible={hospital !== null} transparent animationType="fade" onRequestClose={closeDetails}>
        <View style={styles.overlay}>
          <Pressable style={StyleSheet.absoluteFill} accessibilityRole="button" accessibilityLabel="병원 정보 창 닫기" onPress={closeDetails} />
          <View style={styles.modal} accessibilityViewIsModal>
            <ScrollView contentContainerStyle={styles.modalContent}>
              <Text style={styles.title}>{hospital?.name}</Text>
              <Text style={styles.description}>{hospital?.address || '주소 정보 없음'}</Text>
              {typeof hospital?.distance_m === 'number' && Number.isFinite(hospital.distance_m) && hospital.distance_m >= 0 && (
                <Text style={styles.distance}>{distanceOrigin}에서 {hospital.distance_m.toLocaleString()}m</Text>
              )}
              {!!hospital?.website_url && <Text selectable style={styles.description}>{hospital.website_url}</Text>}
              <BlueButton text="홈페이지" backgroundColor="#FFC94D" disabled={!website} onPress={() => { if (website) launch(() => Linking.openURL(website)); }} style={styles.actionButton} />
              <Text style={styles.description}>홈페이지 정보가 있는 경우 연결할 수 있습니다.</Text>
              <TouchableOpacity accessibilityRole="button" onPress={closeDetails} style={styles.closeButton}>
                <Text style={styles.closeText}>닫기</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginTop: 12 },
  title: { fontSize: 20, fontWeight: '600', color: '#000', lineHeight: 28, marginBottom: 8 },
  description: { fontSize: 14, color: '#7B7C7D', lineHeight: 22 },
  distance: { fontSize: 14, color: '#0081D5', lineHeight: 22 },
  empty: { paddingVertical: 24, color: '#7B7C7D', fontSize: 14 },
  pagination: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 20, marginVertical: 12 },
  pageButton: { paddingHorizontal: 16, minHeight: 44, borderWidth: 1, borderColor: '#D7D7D7', borderRadius: 30, justifyContent: 'center' },
  pageText: { color: '#555', fontSize: 14 },
  disabled: { opacity: 0.4 },
  overlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.5)' },
  modal: { width: '80%', maxWidth: 420, maxHeight: '70%', borderRadius: 12, backgroundColor: '#FFF' },
  modalContent: { padding: 20, gap: 12 },
  actionButton: { width: '100%', height: 'auto', minHeight: 55, paddingVertical: 12 },
  closeButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  closeText: { color: '#7B7C7D', fontSize: 14, fontWeight: '600' },
});
