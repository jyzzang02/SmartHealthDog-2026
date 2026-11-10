import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  Image,
  Modal,
  PermissionsAndroid,
  Platform,
} from 'react-native';
import { launchCamera, launchImageLibrary, ImagePickerResponse } from 'react-native-image-picker';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import type { RouteProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { RootStackParamList } from '../../App';
import type { DiagnosisCertificate, HealthSummary } from '../types/health';
import { getMyPets, PetListItem } from '../api/pets';

/* ─── 상수 ─── */
const CERTIFICATE_FIELDS: {
  key: keyof DiagnosisCertificate;
  label: string;
  placeholder?: string;
  multiline?: boolean;
}[] = [
  { key: 'animalName', label: '동물명' },
  { key: 'species', label: '종류' },
  { key: 'breed', label: '품종' },
  { key: 'sex', label: '성별' },
  { key: 'coatColor', label: '모색' },
  { key: 'age', label: '연령' },
  { key: 'features', label: '특징', multiline: true },
  { key: 'diseaseName', label: '병명' },
  { key: 'onsetDate', label: '발병 연월일', placeholder: 'YYYY-MM-DD' },
  { key: 'diagnosisDate', label: '진단 연월일', placeholder: 'YYYY-MM-DD' },
  { key: 'prognosis', label: '예후 소견', multiline: true },
  { key: 'remarks', label: '그 외의 사항(비고)', multiline: true },
];

const IMAGE_PICKER_OPTIONS = {
  mediaType: 'photo',
  quality: 0.8,
  maxWidth: 2048,
  maxHeight: 2048,
} as const;

const todayString = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const initCertificate = (): DiagnosisCertificate => ({
  animalName: '',
  species: '',
  breed: '',
  sex: '',
  coatColor: '',
  age: '',
  features: '',
  diseaseName: '',
  onsetDate: '',
  diagnosisDate: '',
  prognosis: '',
  remarks: '',
});

/* ─── 컴포넌트 ─── */
type NavProp = StackNavigationProp<RootStackParamList, 'HealthCheckInput'>;
type RoutePropType = RouteProp<RootStackParamList, 'HealthCheckInput'>;

const HealthCheckInputScreen = () => {
  const navigation = useNavigation<NavProp>();
  const route = useRoute<RoutePropType>();
  const insets = useSafeAreaInsets();
  const { petId, petName } = route.params;

  const [pets, setPets] = useState<PetListItem[]>([]);
  const [selectedPetId, setSelectedPetId] = useState(petId);
  const [selectedPetName, setSelectedPetName] = useState(petName);
  const [isPetSelectorVisible, setPetSelectorVisible] = useState(false);
  const [checkupDate, setCheckupDate] = useState(todayString());
  const [hospitalName, setHospitalName] = useState('');
  const [certificateImageUri, setCertificateImageUri] = useState<string | null>(null);
  // 추후 OCR 결과도 이 state에 채워 넣으며, 입력 칸은 항상 수동 수정 가능
  const [certificate, setCertificate] = useState<DiagnosisCertificate>(initCertificate);

  useEffect(() => {
    let isMounted = true;

    getMyPets()
      .then((petList) => {
        if (!isMounted) return;
        setPets(petList);

        const selectedPet = petList.find((pet) => pet.id === petId);
        if (selectedPet?.name) {
          setSelectedPetName(selectedPet.name);
        }
      })
      .catch(() => {
        if (isMounted) setPets([]);
      });

    return () => {
      isMounted = false;
    };
  }, [petId]);

  /* ─── 핸들러 ─── */
  const setCertificateField = (key: keyof DiagnosisCertificate, value: string) => {
    setCertificate(prev => ({ ...prev, [key]: value }));
  };

  const handleImageResponse = (response: ImagePickerResponse) => {
    if (response.didCancel) return;
    const uri = response.assets?.[0]?.uri;
    if (response.errorCode || !uri) {
      Alert.alert('오류', '이미지를 불러올 수 없습니다.');
      return;
    }
    setCertificateImageUri(uri);
  };

  const requestCameraPermission = async () => {
    if (Platform.OS !== 'android') return true;
    try {
      const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA, {
        title: '카메라 접근 권한',
        message: '진단서를 촬영하기 위해 카메라 접근 권한이 필요합니다.',
        buttonNegative: '취소',
        buttonPositive: '확인',
      });
      return granted === PermissionsAndroid.RESULTS.GRANTED;
    } catch {
      return false;
    }
  };

  const handleTakePhoto = async () => {
    const hasPermission = await requestCameraPermission();
    if (!hasPermission) {
      Alert.alert('권한 필요', '진단서를 촬영하려면 카메라 권한을 허용해 주세요.');
      return;
    }
    launchCamera(IMAGE_PICKER_OPTIONS, handleImageResponse);
  };

  const handlePickFromAlbum = () => {
    launchImageLibrary({ ...IMAGE_PICKER_OPTIONS, selectionLimit: 1 }, handleImageResponse);
  };

  const handleSubmit = () => {
    const trimmedCertificate = { ...certificate };
    CERTIFICATE_FIELDS.forEach(({ key }) => {
      trimmedCertificate[key] = certificate[key].trim();
    });

    const summary: HealthSummary = {
      petId: selectedPetId,
      checkupDate,
      hospitalName: hospitalName.trim() || undefined,
      certificate: trimmedCertificate,
      certificateImageUri: certificateImageUri || undefined,
    };

    navigation.navigate('HealthCheckResult', {
      petId: selectedPetId,
      petName: selectedPetName,
      summary,
    });
  };

  const handleSelectPet = (pet: PetListItem) => {
    setSelectedPetId(pet.id);
    setSelectedPetName(pet.name || '이름 없음');
    setPetSelectorVisible(false);
  };

  /* ─── 렌더 ─── */
  return (
    <View style={styles.screen}>
      {/* NavBar */}
      <View
        style={[
          styles.navBar,
          {
            height: 56 + insets.top,
            paddingTop: insets.top,
          },
        ]}
      >
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backRow}>
          <Image
            source={require('../assets/icon_navBack.png')}
            style={styles.backIcon}
          />
          <Text style={styles.navTitle}>건강검진 정보 입력</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.description}>
          병원 진단서를 촬영하거나 앨범에서 불러와 건강검진 정보를 입력할 수 있습니다.
        </Text>

        {/* ── 기본 정보 ── */}
        <Text style={styles.sectionTitle}>기본 정보</Text>

        {/* 반려동물 이름 */}
        <TouchableOpacity
          style={styles.inputBox}
          activeOpacity={pets.length > 1 ? 0.75 : 1}
          disabled={pets.length <= 1}
          onPress={() => setPetSelectorVisible(true)}
        >
          <Text style={styles.inputValue}>{selectedPetName}</Text>
          <Image
            source={require('../assets/icon_arrowDown.png')}
            style={styles.dropdownIcon}
          />
        </TouchableOpacity>

        {/* 날짜 */}
        <View style={styles.inputBox}>
          <TextInput
            style={styles.inputValue}
            value={checkupDate}
            onChangeText={setCheckupDate}
            placeholder="YYYY-MM-DD"
            placeholderTextColor="#aaa"
            keyboardType="numeric"
          />
        </View>

        {/* 병원명 */}
        <View style={styles.inputBox}>
          <TextInput
            style={styles.inputValue}
            value={hospitalName}
            onChangeText={setHospitalName}
            placeholder="병원명 (선택)"
            placeholderTextColor="#aaa"
          />
        </View>

        {/* ── 진단서 이미지 ── */}
        <View style={styles.certBox}>
          <Text style={styles.certTitle}>진단서 이미지</Text>
          <Text style={styles.certDesc}>
            병원 진단서를 촬영하거나 앨범에서 선택해 주세요.
          </Text>
          {certificateImageUri && (
            <View style={styles.certPreviewWrap}>
              <Image
                source={{ uri: certificateImageUri }}
                style={styles.certPreview}
                resizeMode="contain"
              />
              <TouchableOpacity
                style={styles.certRemoveBtn}
                onPress={() => setCertificateImageUri(null)}
              >
                <Text style={styles.certRemoveBtnText}>삭제</Text>
              </TouchableOpacity>
            </View>
          )}
          <View style={styles.certBtnRow}>
            <TouchableOpacity style={styles.certBtn} onPress={handleTakePhoto}>
              <Text style={styles.certBtnText}>촬영하기</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.certBtn} onPress={handlePickFromAlbum}>
              <Text style={styles.certBtnText}>앨범에서 선택</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── 진단서 정보 ── */}
        <Text style={[styles.sectionTitle, { marginTop: 28 }]}>진단서 정보</Text>
        {CERTIFICATE_FIELDS.map(({ key, label, placeholder, multiline }) => (
          <View key={key}>
            <Text style={styles.fieldLabel}>{label}</Text>
            {multiline ? (
              <TextInput
                style={styles.multilineInput}
                value={certificate[key]}
                onChangeText={value => setCertificateField(key, value)}
                placeholder={placeholder}
                placeholderTextColor="#aaa"
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />
            ) : (
              <View style={styles.inputBox}>
                <TextInput
                  style={styles.inputValue}
                  value={certificate[key]}
                  onChangeText={value => setCertificateField(key, value)}
                  placeholder={placeholder}
                  placeholderTextColor="#aaa"
                />
              </View>
            )}
          </View>
        ))}
      </ScrollView>

      {/* 하단 버튼 */}
      <View
        style={[
          styles.bottomBtns,
          { paddingBottom: Math.max(insets.bottom, 16) + 12 },
        ]}
      >
        <TouchableOpacity
          style={styles.cancelBtn}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.cancelBtnText}>취소</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.submitBtn} onPress={handleSubmit}>
          <Text style={styles.submitBtnText}>다음</Text>
        </TouchableOpacity>
      </View>

      <Modal
        transparent
        visible={isPetSelectorVisible}
        animationType="fade"
        onRequestClose={() => setPetSelectorVisible(false)}
      >
        <View style={styles.petModalOverlay}>
          <TouchableOpacity
            style={styles.petModalDismissArea}
            activeOpacity={1}
            onPress={() => setPetSelectorVisible(false)}
          />
          <View style={styles.petModalContent}>
            <Text style={styles.petModalTitle}>반려동물 선택</Text>
            <ScrollView showsVerticalScrollIndicator={pets.length > 4}>
              {pets.map((pet) => {
                const isSelected = pet.id === selectedPetId;
                return (
                  <TouchableOpacity
                    key={pet.id}
                    style={[styles.petOption, isSelected && styles.petOptionSelected]}
                    activeOpacity={0.8}
                    onPress={() => handleSelectPet(pet)}
                  >
                    <Text style={[styles.petOptionText, isSelected && styles.petOptionTextSelected]}>
                      {pet.name || '이름 없음'}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
};

export default HealthCheckInputScreen;

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
    paddingTop: 24,
    paddingBottom: 24,
  },
  description: {
    fontSize: 14,
    color: '#555',
    lineHeight: 22,
    marginBottom: 24,
  },

  /* 섹션 */
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#040505',
    marginBottom: 12,
  },

  /* 입력 박스 */
  inputBox: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  inputValue: {
    flex: 1,
    fontSize: 15,
    color: '#040505',
  },
  dropdownIcon: {
    width: 14,
    height: 14,
    tintColor: '#aaa',
  },
  petModalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    paddingHorizontal: 32,
  },
  petModalDismissArea: {
    ...StyleSheet.absoluteFillObject,
  },
  petModalContent: {
    width: '100%',
    maxHeight: 320,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    padding: 20,
  },
  petModalTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#040505',
    marginBottom: 12,
  },
  petOption: {
    minHeight: 52,
    justifyContent: 'center',
    paddingHorizontal: 16,
    borderRadius: 10,
  },
  petOptionSelected: {
    backgroundColor: '#EEF7FD',
  },
  petOptionText: {
    fontSize: 16,
    color: '#333333',
  },
  petOptionTextSelected: {
    color: '#0081D5',
    fontWeight: '700',
  },

  /* 진단서 이미지 */
  certBox: {
    marginTop: 16,
    backgroundColor: '#EEF7FD',
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: '#0081D5',
  },
  certTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#040505',
    marginBottom: 6,
  },
  certDesc: {
    fontSize: 13,
    color: '#555',
    lineHeight: 20,
    marginBottom: 16,
  },
  certPreviewWrap: {
    marginBottom: 16,
  },
  certPreview: {
    width: '100%',
    height: 240,
    borderRadius: 8,
    backgroundColor: '#fff',
  },
  certRemoveBtn: {
    position: 'absolute',
    top: 8,
    right: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
  },
  certRemoveBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  certBtnRow: {
    flexDirection: 'row',
    gap: 8,
  },
  certBtn: {
    flex: 1,
    backgroundColor: '#0081D5',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  certBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },

  /* 진단서 정보 */
  fieldLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#040505',
    marginTop: 8,
    marginBottom: 6,
  },
  multilineInput: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 15,
    color: '#040505',
    minHeight: 84,
    marginBottom: 8,
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
  cancelBtn: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 12,
    backgroundColor: '#F3F4F5',
    alignItems: 'center',
  },
  cancelBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  submitBtn: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 12,
    backgroundColor: '#0081D5',
    alignItems: 'center',
  },
  submitBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});
