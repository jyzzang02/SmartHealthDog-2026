import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  PermissionsAndroid,
  Platform,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import {
  ImagePickerResponse,
  launchCamera,
  launchImageLibrary,
} from 'react-native-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  EyeDiagnosisImage,
  getMyPets,
  requestEyeDiagnosis,
} from '../api/diagnosis';
import { PetListItem } from '../api/pets';

const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

const EyeCameraScreen = () => {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const [pets, setPets] = useState<PetListItem[]>([]);
  const [selectedPetId, setSelectedPetId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const hasPromptedPetRef = useRef(false);
  const isMountedRef = useRef(true);

  const selectedPet = useMemo(
    () => pets.find((pet) => pet.id === selectedPetId) || null,
    [pets, selectedPetId]
  );

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const loadPets = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await getMyPets();
      if (!isMountedRef.current) return;
      setPets(data);
      if (data.length === 1) {
        setSelectedPetId(data[0].id);
        return;
      }
      if (data.length === 0) {
        Alert.alert('안내', '진단할 반려동물을 먼저 등록해 주세요.');
        return;
      }
      if (!hasPromptedPetRef.current) {
        hasPromptedPetRef.current = true;
        Alert.alert(
          '반려동물 선택',
          '진단할 반려동물을 선택해 주세요.',
          [
            ...data.map((pet) => ({
              text: pet.name,
              onPress: () => setSelectedPetId(pet.id),
            })),
            { text: '취소', style: 'cancel' },
          ],
          { cancelable: true }
        );
      }
    } catch (error) {
      if (!isMountedRef.current) return;
      const message = error instanceof Error ? error.message : '반려동물 정보를 불러오지 못했습니다.';
      Alert.alert('오류', message);
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    loadPets();
  }, [loadPets]);

  const promptPetSelection = useCallback(() => {
    if (pets.length === 0) {
      Alert.alert('안내', '진단할 반려동물을 먼저 등록해 주세요.');
      return;
    }

    if (pets.length === 1) {
      setSelectedPetId(pets[0].id);
      return;
    }

    Alert.alert(
      '반려동물 선택',
      '진단할 반려동물을 선택해 주세요.',
      [
        ...pets.map((pet) => ({
          text: pet.name,
          onPress: () => setSelectedPetId(pet.id),
        })),
        { text: '취소', style: 'cancel' },
      ],
      { cancelable: true }
    );
  }, [pets]);

  const ensurePetSelected = useCallback(() => {
    if (pets.length === 0) {
      Alert.alert('안내', '진단할 반려동물을 먼저 등록해 주세요.');
      return false;
    }

    if (!selectedPetId) {
      promptPetSelection();
      return false;
    }

    return true;
  }, [pets.length, promptPetSelection, selectedPetId]);

  const requestCameraPermission = async () => {
    if (Platform.OS !== 'android') {
      return true;
    }

    const granted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.CAMERA,
      {
        title: '카메라 권한 필요',
        message: '진단을 위해 카메라 접근 권한이 필요합니다.',
        buttonNeutral: '나중에',
        buttonNegative: '취소',
        buttonPositive: '확인',
      }
    );

    return granted === PermissionsAndroid.RESULTS.GRANTED;
  };

  const requestGalleryPermission = async () => {
    if (Platform.OS !== 'android') {
      return true;
    }

    const permission =
      Platform.Version >= 33
        ? PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES
        : PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE;

    const granted = await PermissionsAndroid.request(permission, {
      title: '사진 권한 필요',
      message: '진단을 위해 사진 접근 권한이 필요합니다.',
      buttonNeutral: '나중에',
      buttonNegative: '취소',
      buttonPositive: '확인',
    });

    return granted === PermissionsAndroid.RESULTS.GRANTED;
  };

  const resolveMimeType = useCallback((image: EyeDiagnosisImage) => {
    if (image.type) {
      return image.type;
    }
    const lower = image.uri.toLowerCase();
    if (lower.endsWith('.png')) {
      return 'image/png';
    }
    if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) {
      return 'image/jpeg';
    }
    return 'image/*';
  }, []);

  const isSupportedImage = useCallback((image: EyeDiagnosisImage) => {
    const type = resolveMimeType(image);
    return type === 'image/png' || type === 'image/jpeg';
  }, [resolveMimeType]);

  const handleUpload = useCallback(
    async (image: EyeDiagnosisImage) => {
      console.log('[eye] upload payload', {
        uri: image.uri,
        type: image.type,
        fileName: image.fileName,
        fileSize: image.fileSize,
      });

      if (!selectedPetId) {
        Alert.alert('안내', '진단할 반려동물을 선택해 주세요.');
        return;
      }

      const resolvedType = resolveMimeType(image);
      if (resolvedType !== 'image/jpeg' && resolvedType !== 'image/png') {
        Alert.alert('안내', 'jpg, jpeg, png 이미지만 업로드할 수 있습니다.');
        return;
      }

      if (image.fileSize && image.fileSize > MAX_IMAGE_SIZE) {
        Alert.alert('안내', '이미지 용량은 5MB 이하만 가능합니다.');
        return;
      }

      if (!isSupportedImage(image)) {
        Alert.alert('안내', 'jpg, jpeg, png 이미지만 업로드할 수 있습니다.');
        return;
      }

      setIsUploading(true);
      try {
        await requestEyeDiagnosis(selectedPetId, image);
        if (!isMountedRef.current) return;
        Alert.alert(
          '접수 완료',
          '진단 요청이 접수되었습니다. AI 분석 완료 후 결과를 확인할 수 있습니다.',
          [
            {
              text: '확인',
              onPress: () => navigation.navigate('EyeDiagnosisResult', { petId: selectedPetId }),
            },
          ]
        );
      } catch (error) {
        if (!isMountedRef.current) return;
        const message =
          error instanceof Error
            ? error.message
            : '진단 요청에 실패했습니다. 다시 시도해 주세요.';
        Alert.alert('오류', message);
      } finally {
        if (isMountedRef.current) {
          setIsUploading(false);
        }
      }
    },
    [isSupportedImage, navigation, resolveMimeType, selectedPetId]
  );

  const handleCameraPick = useCallback(async () => {
    if (!ensurePetSelected()) {
      return;
    }

    const hasPermission = await requestCameraPermission();
    if (!hasPermission) {
      Alert.alert('안내', '카메라 권한이 필요합니다.');
      return;
    }

    launchCamera(
      {
        mediaType: 'photo',
        quality: 1,
        maxWidth: 1600,
        maxHeight: 1600,
      },
      (response: ImagePickerResponse) => {
        if (response.didCancel) {
          return;
        }
        if (response.errorCode) {
          Alert.alert('오류', response.errorMessage || '카메라를 열 수 없습니다.');
          return;
        }
        const asset = response.assets?.[0];
        if (!asset?.uri) {
          Alert.alert('오류', '이미지를 가져오지 못했습니다.');
          return;
        }
        handleUpload({
          uri: asset.uri,
          type: asset.type,
          fileName: asset.fileName,
          fileSize: asset.fileSize,
        });
      }
    );
  }, [ensurePetSelected, handleUpload]);

  const handleGalleryPick = useCallback(async () => {
    if (!ensurePetSelected()) {
      return;
    }

    const hasPermission = await requestGalleryPermission();
    if (!hasPermission) {
      Alert.alert('안내', '사진 접근 권한이 필요합니다.');
      return;
    }

    launchImageLibrary(
      {
        mediaType: 'photo',
        quality: 1,
        maxWidth: 1600,
        maxHeight: 1600,
      },
      (response: ImagePickerResponse) => {
        if (response.didCancel) {
          return;
        }
        if (response.errorCode) {
          Alert.alert('오류', response.errorMessage || '사진을 불러올 수 없습니다.');
          return;
        }
        const asset = response.assets?.[0];
        if (!asset?.uri) {
          Alert.alert('오류', '이미지를 가져오지 못했습니다.');
          return;
        }
        handleUpload({
          uri: asset.uri,
          type: asset.type,
          fileName: asset.fileName,
          fileSize: asset.fileSize,
        });
      }
    );
  }, [ensurePetSelected, handleUpload]);

  const canInteract = !isLoading && !isUploading;

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={[styles.cameraArea, { paddingTop: insets.top + 16 }]}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
            disabled={isUploading}
          >
            <Image
              source={require('../assets/icon_back.png')}
              style={styles.backIcon}
            />
          </TouchableOpacity>

          <View style={styles.guideContainer}>
            <View style={styles.dashedCircle} />
            <Text style={styles.guideText}>
              하단 촬영 버튼을 누르면 자동으로 촬영돼요.
            </Text>
          </View>
        </View>

        <View style={[styles.bottomPanel, { paddingBottom: insets.bottom + 12 }]}>
          <View style={styles.petRow}>
            <Text style={styles.petLabel}>진단 대상:</Text>
            <Text style={styles.petName}>
              {selectedPet ? selectedPet.name : '선택 필요'}
            </Text>
            {selectedPet && (
              <View style={styles.selectedBadge}>
                <Text style={styles.selectedBadgeText}>선택됨</Text>
              </View>
            )}
            <TouchableOpacity
              style={styles.petSelectButton}
              onPress={promptPetSelection}
              disabled={!canInteract}
            >
              <Text style={styles.petSelectText}>변경</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.controlRow}>
            <TouchableOpacity
              style={styles.sideButton}
              onPress={() => Alert.alert('안내', '플래시 기능은 준비 중입니다.')}
              disabled={!canInteract}
            >
              <Text style={styles.sideButtonText}>FLASH</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.shutterButton}
              onPress={handleCameraPick}
              disabled={!canInteract}
            >
              <View style={styles.shutterInner} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.sideButton}
              onPress={handleGalleryPick}
              disabled={!canInteract}
            >
              <Text style={styles.sideButtonText}>GALLERY</Text>
            </TouchableOpacity>
          </View>
        </View>

        {(isLoading || isUploading) && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color="#0081D5" />
          </View>
        )}
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#000000',
  },
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  cameraArea: {
    flex: 1,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButton: {
    position: 'absolute',
    top: 12,
    left: 16,
    padding: 8,
    zIndex: 10,
  },
  backIcon: {
    width: 24,
    height: 24,
    tintColor: '#FFFFFF',
  },
  guideContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  dashedCircle: {
    width: 220,
    height: 220,
    borderRadius: 110,
    borderWidth: 2,
    borderColor: '#2F99F3',
    borderStyle: 'dashed',
  },
  guideText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
    paddingHorizontal: 24,
    marginTop: 24,
  },
  bottomPanel: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 24,
    paddingTop: 16,
  },
  petRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  petLabel: {
    fontSize: 14,
    color: '#1F2024',
  },
  petName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0081D5',
    marginLeft: 6,
    marginRight: 8,
  },
  petSelectButton: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#0081D5',
  },
  petSelectText: {
    color: '#0081D5',
    fontSize: 12,
    fontWeight: '600',
  },
  selectedBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    backgroundColor: '#0081D5',
    marginRight: 8,
  },
  selectedBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '600',
  },
  controlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sideButton: {
    width: 72,
    alignItems: 'center',
  },
  sideButtonText: {
    color: '#2E3135',
    fontSize: 12,
    fontWeight: '600',
  },
  shutterButton: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 4,
    borderColor: '#0081D5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#0081D5',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default EyeCameraScreen;

