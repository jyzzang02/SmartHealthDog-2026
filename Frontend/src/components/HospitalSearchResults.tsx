import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { HospitalItem } from '../api/hospitals';
import HospitalCard from './HospitalCard';
import BlueButton from './BlueButton';

interface Props { hospitals: readonly HospitalItem[]; }
const PAGE_SIZE = 5;

export default function HospitalSearchResults({ hospitals }: Props) {
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<HospitalItem | null>(null);
  const pageCount = Math.max(1, Math.ceil(hospitals.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const visible = hospitals.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);
  const hospital = selected && hospitals.includes(selected) ? selected : null;
  const closeDetails = () => setSelected(null);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>현재 위치 검색 결과</Text>
      <Text style={styles.description}>기존 지도에서 불러온 병원 목록입니다.</Text>
      {visible.map((item, index) => (
        <HospitalCard
          key={`${item.hospital_id ?? item.name}:${currentPage * PAGE_SIZE + index}`}
          name={item.name}
          rating={item.rating}
          address={item.address}
          phone={item.phone_number}
          distanceMeters={item.distance_m}
          onPress={() => setSelected(item)}
        />
      ))}
      {hospitals.length === 0 && <Text style={styles.empty}>표시할 병원이 없습니다.</Text>}
      <View style={styles.pagination}>
        <TouchableOpacity accessibilityRole="button" disabled={currentPage === 0} style={[styles.pageButton, currentPage === 0 && styles.disabled]} onPress={() => setPage(currentPage - 1)}>
          <Text style={styles.pageText}>이전</Text>
        </TouchableOpacity>
        <Text style={styles.description}>{currentPage + 1} / {pageCount}</Text>
        <TouchableOpacity accessibilityRole="button" disabled={currentPage + 1 === pageCount} style={[styles.pageButton, currentPage + 1 === pageCount && styles.disabled]} onPress={() => setPage(currentPage + 1)}>
          <Text style={styles.pageText}>다음</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.description}>페이지 이동은 현재 불러온 목록 안에서만 동작합니다.</Text>

      <Modal visible={hospital !== null} transparent animationType="fade" onRequestClose={closeDetails}>
        <View style={styles.overlay}>
          <Pressable style={StyleSheet.absoluteFill} accessibilityRole="button" accessibilityLabel="병원 정보 창 닫기" onPress={closeDetails} />
          <View style={styles.modal} accessibilityViewIsModal>
            <ScrollView contentContainerStyle={styles.modalContent}>
              <Text style={styles.title}>{hospital?.name}</Text>
              <Text style={styles.description}>{hospital?.address || '주소 정보 없음'}</Text>
              {typeof hospital?.distance_m === 'number' && Number.isFinite(hospital.distance_m) && hospital.distance_m >= 0 && (
                <Text style={styles.distance}>현재 위치에서 {hospital.distance_m.toLocaleString()}m</Text>
              )}
              <Text selectable style={styles.description}>{hospital?.phone_number || '전화번호 정보 없음'}</Text>
              {!!hospital?.website_url && <Text selectable style={styles.description}>{hospital.website_url}</Text>}
              <BlueButton text="전화 걸기" disabled style={styles.actionButton} />
              <BlueButton text="홈페이지" disabled style={styles.actionButton} />
              <Text style={styles.description}>전화·홈페이지 연결은 추후 적용됩니다.</Text>
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
