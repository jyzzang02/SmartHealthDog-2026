import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
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
  Keyboard,
  KeyboardAvoidingView,
} from 'react-native';
import { launchCamera, launchImageLibrary, ImagePickerResponse } from 'react-native-image-picker';
import { useFocusEffect, useNavigation, usePreventRemove, useRoute } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import type { RouteProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { RootStackParamList } from '../../App';
import type { DiagnosisCertificate, HealthSummary } from '../types/health';
import { getMyPets, PetListItem } from '../api/pets';
import { getCertificateOcrResult, logCertificateOcr, requestCertificateOcr } from '../api/diagnosis';
import { getAuthSession } from '../storage/tokenStorage';

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
  assetRepresentationMode: 'compatible',
  maxWidth: 2048,
  maxHeight: 2048,
} as const;

const OCR_POLL_INTERVAL_MS = 5000;
const OCR_TIMEOUT_MS = 90_000;

type OcrSubmission = { id: string; petId: number; session: symbol };
let pendingCertificate: OcrSubmission | null = null;

const todayString = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const isCalendarDate = (value: string) => {
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};

const getCertificateAge = (birthDate: string | undefined, checkupDate: string) => {
  const birth = birthDate?.split('T')[0].trim() ?? '';
  const checkup = checkupDate.trim();
  if (!isCalendarDate(birth) || !isCalendarDate(checkup) || birth > checkup) return '';

  const years = Number(checkup.slice(0, 4)) - Number(birth.slice(0, 4));
  const age = checkup.slice(5) < birth.slice(5) ? years - 1 : years;
  return `${age}세`;
};

const emptyCertificate: DiagnosisCertificate = {
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
};

const CERTIFICATE_SPECIES: Record<string, string> = { DOG: '강아지', CAT: '고양이' };
const CERTIFICATE_SEX: Record<string, string> = { MALE: '수컷', FEMALE: '암컷', UNKNOWN: '미상' };

/* ─── 컴포넌트 ─── */
type NavProp = StackNavigationProp<RootStackParamList, 'HealthCheckInput'>;
type RoutePropType = RouteProp<RootStackParamList, 'HealthCheckInput'>;

const HealthCheckInputScreen = () => {
  const navigation = useNavigation<NavProp>();
  const route = useRoute<RoutePropType>();
  const insets = useSafeAreaInsets();
  const { petId, petName } = route.params;
  const screenRef = useRef<View>(null);
  const scrollRef = useRef<ScrollView>(null);
  const scrollOffset = useRef(0);
  const revealFrame = useRef<number | null>(null);
  const [keyboardVisible, setKeyboardVisible] = useState(() => Keyboard.isVisible());
  const [androidKeyboardOverlap, setAndroidKeyboardOverlap] = useState(0);

  const [pets, setPets] = useState<PetListItem[]>([]);
  const [selectedPetId, setSelectedPetId] = useState(petId);
  const [selectedPetName, setSelectedPetName] = useState(petName);
  const [isPetSelectorVisible, setPetSelectorVisible] = useState(false);
  const [defaultCheckupDate] = useState(todayString);
  const [hospitalName, setHospitalName] = useState('');
  const [certificateImageUri, setCertificateImageUri] = useState<string | null>(null);
  const [certificateOverrides, setCertificateOverrides] = useState<Partial<DiagnosisCertificate>>({});
  const [ocrFields, setOcrFields] = useState<Partial<DiagnosisCertificate>>({});
  const [ocrMessage, setOcrMessage] = useState<string | null>(null);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [canCheckOcr, setCanCheckOcr] = useState(false);
  const ocrSubmission = useRef<OcrSubmission | null>(null);
  const ocrRequest = useRef<AbortController | null>(null);
  const ocrPollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ocrDeadlineTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pickerOpen = useRef(false);
  const checkupDate = certificateOverrides.diagnosisDate ?? ocrFields.diagnosisDate ?? defaultCheckupDate;
  const selectedPet = pets.find(pet => pet.id === selectedPetId);
  const species = selectedPet?.species?.trim() ?? '';
  const sex = selectedPet?.gender?.trim() || selectedPet?.sex?.trim() || '';
  // Keep profile defaults separate so a late response cannot overwrite edits.
  const certificate: DiagnosisCertificate = {
    ...emptyCertificate,
    animalName: selectedPet?.name || (selectedPetId === petId ? petName : ''),
    species: CERTIFICATE_SPECIES[species.toUpperCase()] ?? species,
    breed: selectedPet?.breed ?? '',
    sex: CERTIFICATE_SEX[sex.toUpperCase()] ?? sex,
    age: getCertificateAge(selectedPet?.birthDate || selectedPet?.birthday, checkupDate),
    ...ocrFields,
    ...certificateOverrides,
    diagnosisDate: checkupDate,
  };

  const revealFocusedInput = useCallback(() => {
    if (!Keyboard.isVisible() || revealFrame.current !== null) return;

    revealFrame.current = requestAnimationFrame(() => {
      revealFrame.current = null;
      const scroll = scrollRef.current;
      const input = TextInput.State.currentlyFocusedInput();
      if (!scroll || !input) return;

      scroll.getNativeScrollRef()?.measureInWindow((_x, viewportTop, _width, viewportHeight) => {
        input.measureInWindow((_inputX, inputTop, _inputWidth, inputHeight) => {
          const keyboard = Keyboard.metrics();
          if (!keyboard || scrollRef.current !== scroll || TextInput.State.currentlyFocusedInput() !== input) return;

          // The fixed footer can make the scroll viewport end above the keyboard.
          const visibleBottom = Math.min(viewportTop + viewportHeight, keyboard.screenY);
          if (visibleBottom <= viewportTop || inputHeight <= 0) return;
          const gap = 12;
          const delta = inputTop < viewportTop || inputHeight + gap > visibleBottom - viewportTop
            ? inputTop - viewportTop - gap
            : Math.max(0, inputTop + inputHeight + gap - visibleBottom);
          if (delta !== 0) scroll.scrollTo({ y: Math.max(0, scrollOffset.current + delta), animated: true });
        });
      });
    });
  }, []);

  const updateAndroidKeyboardOverlap = useCallback(() => {
    const screen = screenRef.current;
    if (!screen || !Keyboard.isVisible()) return;

    screen.measureInWindow((_x, top, _width, height) => {
      const keyboard = Keyboard.metrics();
      if (!keyboard || screenRef.current !== screen || height <= 0) return;

      // Only reserve the space that Android's window resize did not remove.
      setAndroidKeyboardOverlap(Math.max(0, Math.ceil(top + height - keyboard.screenY)));
    });
  }, []);

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => {
      setKeyboardVisible(true);
      updateAndroidKeyboardOverlap();
      revealFocusedInput();
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => {
      setKeyboardVisible(false);
      setAndroidKeyboardOverlap(0);
    });
    return () => {
      show.remove();
      hide.remove();
      if (revealFrame.current !== null) {
        cancelAnimationFrame(revealFrame.current);
        revealFrame.current = null;
      }
    };
  }, [revealFocusedInput, updateAndroidKeyboardOverlap]);

  useEffect(() => {
    let isMounted = true;

    getMyPets()
      .then((petList) => {
        if (!isMounted) return;
        setPets(petList);

        const initialPet = petList.find((pet) => pet.id === petId);
        if (initialPet?.name) {
          setSelectedPetName(initialPet.name);
        }
      })
      .catch(() => {
        if (isMounted) setPets([]);
      });

    return () => {
      isMounted = false;
    };
  }, [petId]);

  const cancelOcrRequest = useCallback(() => {
    ocrRequest.current?.abort();
    ocrRequest.current = null;
    if (ocrPollTimer.current !== null) clearTimeout(ocrPollTimer.current);
    if (ocrDeadlineTimer.current !== null) clearTimeout(ocrDeadlineTimer.current);
  }, []);

  useFocusEffect(useCallback(() => {
    return cancelOcrRequest;
  }, [cancelOcrRequest]));

  usePreventRemove(ocrBusy, () => {
    Alert.alert(
      '진단서 처리 중',
      ocrSubmission.current
        ? '진단서 분석이 진행 중입니다. 결과를 확인할 때까지 잠시 기다려 주세요.'
        : '진단서 사진을 등록 중입니다. 잠시 기다려 주세요.',
    );
  });

  const clearCertificateImage = () => {
    cancelOcrRequest();
    if (pendingCertificate === ocrSubmission.current) pendingCertificate = null;
    ocrSubmission.current = null;
    setCertificateImageUri(null);
    setOcrFields({});
    setOcrMessage(null);
    setOcrBusy(false);
    setCanCheckOcr(false);
  };

  const runCertificateOcr = useCallback(async (image?: NonNullable<ImagePickerResponse['assets']>[number] & { uri: string }) => {
    if (ocrRequest.current) return;
    const session = getAuthSession();
    if (!image && ocrSubmission.current?.session !== session) return;

    const controller = new AbortController();
    ocrRequest.current = controller;
    const isCurrent = () => ocrRequest.current === controller && getAuthSession() === session;
    const finish = (message: string, checkAgain = false) => {
      cancelOcrRequest();
      setOcrBusy(false);
      setCanCheckOcr(checkAgain);
      setOcrMessage(message);
    };

    setOcrBusy(true);
    setCanCheckOcr(false);
    setOcrMessage(image ? '진단서 사진을 등록하는 중이에요.' : '진단서를 분석 중이에요.');
    ocrDeadlineTimer.current = setTimeout(() => {
      if (!isCurrent()) return;
      const registered = ocrSubmission.current !== null;
      logCertificateOcr('timeout', registered ? 'after-acceptance' : 'acceptance-unknown');
      finish(registered
        ? '아직 분석 결과가 준비되지 않았어요. 잠시 후 다시 확인하거나 직접 입력해 주세요.'
        : '진단서 접수를 확인하지 못했어요. 직접 입력할 수 있어요.', registered);
    }, OCR_TIMEOUT_MS);

    try {
      if (image) {
        const id = await requestCertificateOcr(selectedPetId, image, controller.signal);
        if (!isCurrent()) return;
        ocrSubmission.current = { id, petId: selectedPetId, session };
        pendingCertificate = ocrSubmission.current;
        setOcrMessage('진단서를 분석 중이에요.');
      }
      const submission = ocrSubmission.current;
      if (!submission) return;

      const checkResult = async () => {
        try {
          const result = await getCertificateOcrResult(submission.petId, submission.id, controller.signal);
          if (!isCurrent()) return;
          logCertificateOcr('analysis:status', result.status);
          if (result.status === 'COMPLETED' || result.status === 'FAILED') {
            if (pendingCertificate === submission) pendingCertificate = null;
          }
          if (result.status === 'COMPLETED') {
            setOcrFields(result.fields);
            finish(Object.keys(result.fields).length > 0
              ? '인식한 내용을 채웠어요. 확인하고 필요한 내용을 수정해 주세요.'
              : '자동으로 채울 수 있는 내용이 없어요. 직접 입력해 주세요.');
          } else if (result.status === 'FAILED') {
            finish('진단서를 인식하지 못했어요. 다른 사진을 선택하거나 직접 입력해 주세요.');
          } else {
            ocrPollTimer.current = setTimeout(() => { checkResult(); }, OCR_POLL_INTERVAL_MS);
          }
        } catch {
          if (!isCurrent()) return;
          logCertificateOcr('analysis:lookup-error');
          finish('분석 결과를 확인하지 못했어요. 잠시 후 다시 확인해 주세요.', true);
        }
      };

      if (image) {
        ocrPollTimer.current = setTimeout(() => { checkResult(); }, OCR_POLL_INTERVAL_MS);
      } else {
        await checkResult();
      }
    } catch (error) {
      if (!isCurrent()) return;
      logCertificateOcr('upload:error');
      const message = error instanceof Error && !(error instanceof TypeError)
        ? error.message
        : '진단서 접수를 확인하지 못했어요. 직접 입력할 수 있어요.';
      finish(message);
    }
  }, [cancelOcrRequest, selectedPetId]);

  useEffect(() => {
    const session = getAuthSession();
    if (pendingCertificate && pendingCertificate.session !== session) pendingCertificate = null;
    if (pendingCertificate?.petId !== selectedPetId) return;
    ocrSubmission.current = pendingCertificate;
    logCertificateOcr('analysis:resume');
    runCertificateOcr();
  }, [selectedPetId, runCertificateOcr]);

  /* ─── 핸들러 ─── */
  const setCertificateField = (key: keyof DiagnosisCertificate, value: string) => {
    setCertificateOverrides(prev => ({ ...prev, [key]: value }));
  };

  const handleImageResponse = (response: ImagePickerResponse) => {
    if (response.didCancel) return;
    const asset = response.assets?.[0];
    if (response.errorCode || !asset?.uri) {
      Alert.alert('오류', '이미지를 불러올 수 없습니다.');
      return;
    }
    clearCertificateImage();
    setCertificateImageUri(asset.uri);
    runCertificateOcr({ ...asset, uri: asset.uri });
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

  const openCertificatePicker = async (source: 'camera' | 'album') => {
    if (pickerOpen.current || ocrRequest.current) return;
    pickerOpen.current = true;
    try {
      if (source === 'camera' && !(await requestCameraPermission())) {
        Alert.alert('권한 필요', '진단서를 촬영하려면 카메라 권한을 허용해 주세요.');
        return;
      }
      const response = source === 'camera'
        ? await launchCamera(IMAGE_PICKER_OPTIONS)
        : await launchImageLibrary({ ...IMAGE_PICKER_OPTIONS, selectionLimit: 1 });
      if (navigation.isFocused()) handleImageResponse(response);
    } catch {
      if (navigation.isFocused()) Alert.alert('오류', '이미지를 불러올 수 없습니다.');
    } finally {
      pickerOpen.current = false;
    }
  };

  const handleSubmit = () => {
    if (ocrRequest.current || pickerOpen.current) return;
    const trimmedCertificate = { ...certificate };
    CERTIFICATE_FIELDS.forEach(({ key }) => {
      trimmedCertificate[key] = certificate[key].trim();
    });

    const summary: HealthSummary = {
      petId: selectedPetId,
      checkupDate: trimmedCertificate.diagnosisDate,
      hospitalName: hospitalName.trim() || undefined,
      certificate: trimmedCertificate,
      certificateImageUri: certificateImageUri || undefined,
    };

    const submission = ocrSubmission.current;
    if (submission && (submission.session !== getAuthSession() || submission.petId !== selectedPetId)) return;

    navigation.navigate('HealthCheckResult', {
      petId: selectedPetId,
      petName: selectedPetName,
      summary,
      certificateSubmissionId: submission?.id,
    });
  };

  const handleSelectPet = (pet: PetListItem) => {
    if (pet.id !== selectedPetId) {
      clearCertificateImage();
      setCertificateOverrides(prev => {
        const next = { ...prev };
        delete next.animalName;
        delete next.species;
        delete next.breed;
        delete next.sex;
        delete next.age;
        return next;
      });
    }
    setSelectedPetId(pet.id);
    setSelectedPetName(pet.name || '이름 없음');
    setPetSelectorVisible(false);
  };

  /* ─── 렌더 ─── */
  const content = (
    <>
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
          <Text style={styles.navTitle}>검진 정보 입력</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.content}
        onLayout={revealFocusedInput}
        onScroll={({ nativeEvent }) => { scrollOffset.current = nativeEvent.contentOffset.y; }}
        scrollEventThrottle={16}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.description}>
          병원 진단서를 촬영하거나 앨범에서 불러와 검진 정보를 입력할 수 있습니다.
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
            onFocus={revealFocusedInput}
            value={checkupDate}
            onChangeText={value => setCertificateField('diagnosisDate', value)}
            placeholder="YYYY-MM-DD"
            placeholderTextColor="#aaa"
            keyboardType="numeric"
          />
        </View>

        {/* 병원명 */}
        <View style={styles.inputBox}>
          <TextInput
            style={styles.inputValue}
            onFocus={revealFocusedInput}
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
                onPress={clearCertificateImage}
              >
                <Text style={styles.certRemoveBtnText}>삭제</Text>
              </TouchableOpacity>
            </View>
          )}
          <View style={styles.certBtnRow}>
            <TouchableOpacity style={styles.certBtn} disabled={ocrBusy} accessibilityState={{ disabled: ocrBusy }} onPress={() => openCertificatePicker('camera')}>
              <Text style={styles.certBtnText}>촬영하기</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.certBtn} disabled={ocrBusy} accessibilityState={{ disabled: ocrBusy }} onPress={() => openCertificatePicker('album')}>
              <Text style={styles.certBtnText}>앨범에서 선택</Text>
            </TouchableOpacity>
          </View>
        </View>

        {ocrMessage && (
          <View style={styles.ocrStatus} accessibilityLiveRegion="polite">
            {ocrBusy && <ActivityIndicator color="#0081D5" />}
            <Text style={styles.ocrStatusText}>{ocrMessage}</Text>
            {canCheckOcr && (
              <TouchableOpacity accessibilityRole="button" onPress={() => runCertificateOcr()}>
                <Text style={styles.ocrRetry}>결과 다시 확인</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* ── 진단서 정보 ── */}
        <Text style={[styles.sectionTitle, { marginTop: 28 }]}>진단서 정보</Text>
        {CERTIFICATE_FIELDS.map(({ key, label, placeholder, multiline }) => (
          <View key={key}>
            <Text style={styles.fieldLabel}>{label}</Text>
            {multiline ? (
              <TextInput
                style={styles.multilineInput}
                onFocus={revealFocusedInput}
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
                  onFocus={revealFocusedInput}
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
          { paddingBottom: (keyboardVisible ? 0 : insets.bottom) + 8 },
        ]}
      >
        <TouchableOpacity
          style={styles.cancelBtn}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.cancelBtnText}>취소</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.submitBtn, ocrBusy && styles.ocrDisabled]} disabled={ocrBusy} onPress={handleSubmit}>
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
    </>
  );

  if (Platform.OS === 'android') {
    return (
      <View ref={screenRef} collapsable={false} onLayout={updateAndroidKeyboardOverlap}
        style={[styles.screen, { paddingBottom: androidKeyboardOverlap }]}>
        {content}
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior="padding" enabled={Platform.OS === 'ios'}>
      {content}
    </KeyboardAvoidingView>
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
  ocrStatus: {
    alignItems: 'flex-start',
    gap: 6,
    marginTop: 12,
  },
  ocrStatusText: {
    fontSize: 13,
    color: '#555',
    lineHeight: 20,
  },
  ocrRetry: {
    fontSize: 14,
    color: '#0081D5',
    fontWeight: '600',
    paddingVertical: 8,
  },
  ocrDisabled: { opacity: 0.5 },
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
    paddingTop: 12,
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
