import React, { useState } from 'react';
import {
  Image, Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable,
  ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import DropdownButton from './DropdownButton';
import BlueButton from './BlueButton';
import type { HospitalSearchFilters } from '../hooks/useHospitalSearch';

interface Props { onSearch: (filters: HospitalSearchFilters) => void; loading?: boolean; }

type Selector = 'region' | 'district' | 'radius' | null;
const RADII = [5, 10, 20, 50, 100] as const;

export default function HospitalSearchControls({ onSearch, loading = false }: Props) {
  const [query, setQuery] = useState('');
  const [region, setRegion] = useState('');
  const [district, setDistrict] = useState('');
  const [radiusKm, setRadiusKm] = useState<number>(10);
  const [selector, setSelector] = useState<Selector>(null);
  const [draftLocation, setDraftLocation] = useState('');
  const [preview, setPreview] = useState<string | null>(null);

  const closeSelector = () => setSelector(null);
  const openLocation = (kind: 'region' | 'district') => {
    setDraftLocation(kind === 'region' ? region : district);
    setSelector(kind);
  };
  const applyLocation = () => {
    const value = draftLocation.trim();
    if (!value) return;
    if (selector === 'region') {
      if (value !== region) setDistrict('');
      setRegion(value);
    } else if (selector === 'district') {
      setDistrict(value);
    }
    setPreview(null);
    closeSelector();
  };
  const submitSearch = () => {
    if (loading) return;
    Keyboard.dismiss();
    const location = [region, district].filter(Boolean).join(' ');
    onSearch({ location: location || undefined, query: query.trim() || undefined, radius_km: radiusKm });
    setPreview(`${location || '현재 위치'} · ${query.trim() || '전체 동물병원'} · 반경 ${radiusKm}km`);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.notice}>검색어와 지역·반경으로 병원을 검색합니다.</Text>
      <View style={styles.searchBar}>
        <TextInput
          testID="hospital-query"
          accessibilityLabel="병원 검색어"
          style={styles.queryInput}
          placeholder="예) 24시, 피부"
          placeholderTextColor="#7B7C7D"
          value={query}
          onChangeText={(value) => { setQuery(value); setPreview(null); }}
          maxLength={100}
          returnKeyType="search"
          onSubmitEditing={submitSearch}
        />
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="병원 검색" disabled={loading} onPress={submitSearch} style={styles.searchButton}>
          <Image source={require('../assets/icon_search.png')} style={styles.searchIcon} />
        </TouchableOpacity>
      </View>
      <View style={styles.filters} testID="hospital-filters">
        <DropdownButton style={styles.regionFilterButton} labelStyle={styles.filterLabel} numberOfLines={1} label={region ? '지역 지정' : '지역'} onPress={() => openLocation('region')} />
        <DropdownButton style={styles.districtFilterButton} labelStyle={styles.filterLabel} numberOfLines={1} label={district ? '군/구 지정' : '군/구'} disabled={!region} onPress={() => openLocation('district')} />
        <DropdownButton style={styles.radiusFilterButton} labelStyle={styles.filterLabel} numberOfLines={1} label={`반경 ${radiusKm}km`} onPress={() => setSelector('radius')} />
      </View>
      <View style={styles.locationRow}>
        <Text style={styles.location}>{[region, district].filter(Boolean).join(' ') || '현재 위치'}</Text>
        {!!region && <TouchableOpacity accessibilityRole="button" onPress={() => {
          setRegion(''); setDistrict(''); setPreview(null);
        }} style={styles.resetButton}>
          <Text style={styles.resetText}>현재 위치</Text>
        </TouchableOpacity>}
      </View>
      <BlueButton text="병원 검색" disabled={loading} onPress={submitSearch} style={styles.previewButton} />
      {preview && <View style={styles.preview} accessibilityLiveRegion="polite">
        <Text style={styles.previewText}>{preview}</Text>
        <Text style={styles.notice}>입력한 조건으로 지도와 검색 결과를 조회합니다.</Text>
      </View>}

      <Modal visible={selector !== null} transparent animationType="fade" onRequestClose={closeSelector}>
        <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable style={StyleSheet.absoluteFill} accessibilityRole="button" accessibilityLabel="검색 조건 창 닫기" onPress={closeSelector} />
          <View style={styles.modal} accessibilityViewIsModal>
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.modalContent}>
              <Text style={styles.modalTitle}>{selector === 'radius' ? '검색 반경' : selector === 'region' ? '지역' : '군/구'}</Text>
              {selector === 'radius' ? RADII.map((radius) => (
                <TouchableOpacity key={radius} accessibilityRole="button" accessibilityState={{ selected: radius === radiusKm }} style={styles.option} onPress={() => {
                  setRadiusKm(radius); setPreview(null); closeSelector();
                }}>
                  <Text style={styles.optionText}>{radius}km</Text>
                </TouchableOpacity>
              )) : <>
                <TextInput
                  testID="hospital-location"
                  accessibilityLabel={selector === 'region' ? '지역명 입력' : '군구명 입력'}
                  style={styles.locationInput}
                  value={draftLocation}
                  onChangeText={setDraftLocation}
                  placeholder={selector === 'region' ? '예) 경기도 고양시' : '예) 덕양구'}
                  placeholderTextColor="#7B7C7D"
                  maxLength={80}
                  returnKeyType="done"
                  onSubmitEditing={applyLocation}
                />
                <BlueButton text="적용" disabled={!draftLocation.trim()} onPress={applyLocation} style={styles.previewButton} />
              </>}
              <TouchableOpacity accessibilityRole="button" onPress={closeSelector} style={styles.closeButton}>
                <Text style={styles.closeText}>닫기</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: 16, gap: 12 },
  notice: { color: '#7B7C7D', fontSize: 12, lineHeight: 18 },
  searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#EEF7FD', borderRadius: 24, paddingLeft: 16, minHeight: 46 },
  queryInput: { flex: 1, minWidth: 0, fontSize: 14, lineHeight: 22, paddingVertical: 12, color: '#3C4144' },
  searchButton: { width: 48, minHeight: 46, alignItems: 'center', justifyContent: 'center' },
  searchIcon: { width: 16, height: 16 },
  filters: { flexDirection: 'row', flexWrap: 'nowrap', gap: 4 },
  regionFilterButton: { flex: 1, minWidth: 0, paddingHorizontal: 4 },
  districtFilterButton: { flex: 1.05, minWidth: 0, paddingHorizontal: 4 },
  radiusFilterButton: { flex: 1.18, minWidth: 0, paddingHorizontal: 4 },
  filterLabel: { flexShrink: 1, marginRight: 2 },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  location: { flex: 1, color: '#7B7C7D', fontSize: 14, lineHeight: 22 },
  resetButton: { paddingVertical: 8 },
  resetText: { color: '#0081D5', fontSize: 14, fontWeight: '600' },
  previewButton: { width: '100%', height: 'auto', minHeight: 55, paddingVertical: 12 },
  preview: { padding: 12, borderRadius: 12, backgroundColor: '#EEF7FD', gap: 8 },
  previewText: { color: '#3C4144', fontSize: 14, lineHeight: 22 },
  overlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.5)' },
  modal: { width: '80%', maxWidth: 420, maxHeight: '70%', backgroundColor: '#FFFFFF', borderRadius: 12 },
  modalContent: { padding: 20, gap: 16 },
  modalTitle: { color: '#1F2024', fontSize: 20, fontWeight: '600', lineHeight: 28 },
  locationInput: { borderWidth: 1, borderColor: '#D7D7D7', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, fontSize: 14, color: '#3C4144' },
  option: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#EAECEE' },
  optionText: { fontSize: 16, color: '#1F2024' },
  closeButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  closeText: { color: '#7B7C7D', fontSize: 14, fontWeight: '600' },
});
