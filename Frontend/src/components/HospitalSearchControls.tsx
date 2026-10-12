import React, { useState } from 'react';
import {
  Image, Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable,
  ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import DropdownButton from './DropdownButton';
import BlueButton from './BlueButton';

type Selector = 'region' | 'district' | 'radius' | null;
const RADII = [5, 10, 20, 50, 100] as const;

export default function HospitalSearchControls() {
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
  const previewSearch = () => {
    Keyboard.dismiss();
    const location = [region, district].filter(Boolean).join(' ') || '현재 위치';
    setPreview(`${location} · ${query.trim() || '전체 동물병원'} · 반경 ${radiusKm}km · 거리순`);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.notice}>추가 검색 기능은 API 미연동 상태입니다.</Text>
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
          onSubmitEditing={previewSearch}
        />
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="검색 조건 미리보기" onPress={previewSearch} style={styles.searchButton}>
          <Image source={require('../assets/icon_search.png')} style={styles.searchIcon} />
        </TouchableOpacity>
      </View>
      <View style={styles.filters}>
        <DropdownButton label={region ? '지역 지정' : '지역'} onPress={() => openLocation('region')} />
        <DropdownButton label={district ? '군/구 지정' : '군/구'} disabled={!region} onPress={() => openLocation('district')} />
        <DropdownButton label={`반경 ${radiusKm}km`} onPress={() => setSelector('radius')} />
        <DropdownButton label="거리순" disabled onPress={() => {}} />
      </View>
      <View style={styles.locationRow}>
        <Text style={styles.location}>{[region, district].filter(Boolean).join(' ') || '현재 위치'}</Text>
        {!!region && <TouchableOpacity accessibilityRole="button" onPress={() => {
          setRegion(''); setDistrict(''); setPreview(null);
        }} style={styles.resetButton}>
          <Text style={styles.resetText}>현재 위치</Text>
        </TouchableOpacity>}
      </View>
      <BlueButton text="검색 조건 미리보기" onPress={previewSearch} style={styles.previewButton} />
      {preview && <View style={styles.preview} accessibilityLiveRegion="polite">
        <Text style={styles.previewText}>{preview}</Text>
        <Text style={styles.notice}>입력한 조건은 아직 지도와 검색 결과에 적용되지 않습니다.</Text>
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
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
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
