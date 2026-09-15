import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  NativeModules,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Camera,
  useCameraDevice,
  useCameraFormat,
  useCameraPermission,
} from 'react-native-vision-camera';
import { launchImageLibrary } from 'react-native-image-picker';
import {
  GestureHandlerRootView,
  PanGestureHandler,
  PinchGestureHandler,
  State,
  type PanGestureHandlerGestureEvent,
  type PanGestureHandlerStateChangeEvent,
  type PinchGestureHandlerGestureEvent,
  type PinchGestureHandlerStateChangeEvent,
} from 'react-native-gesture-handler';
import { getMyPets, PetListItem } from '../api/pets';
import { getPetSubmissions } from '../api/diagnosis';

type CapturedDiagnosisImage = {
  uri: string;
  type?: string;
  fileName?: string;
  fileSize?: number;
};

type GalleryDiagnosisImage = CapturedDiagnosisImage & {
  fileName: string;
  mimeType: string;
  fileSize?: number;
  width: number;
  height: number;
};

type DiagnosisImageCropperModule = {
  cropImage: (
    uri: string,
    cropX: number,
    cropY: number,
    cropWidth: number,
    cropHeight: number
  ) => Promise<string>;
};

type CreateSubmissionResponse = {
  id?: string;
  submissionId?: string;
} | null;

type DiagnosisCameraCaptureProps = {
  type: 'eye' | 'urine';
  title: string;
  resultRouteName: 'EyeDiagnosisResult' | 'UrineDiagnosisResult';
  requestDiagnosis: (
    petId: number,
    image: CapturedDiagnosisImage
  ) => Promise<CreateSubmissionResponse>;
};

const SNAPSHOT_QUALITY = 75;
const GALLERY_GUIDE_SIZE = 300;
const MIN_GALLERY_SCALE = 1;
const MAX_GALLERY_SCALE = 3;

const diagnosisImageCropper =
  NativeModules.DiagnosisImageCropper as DiagnosisImageCropperModule | undefined;

const isValidPetId = (petId: number | null | undefined) =>
  typeof petId === 'number' && Number.isFinite(petId) && petId > 0;

const getFileNameFromPath = (path: string, fallback: string) => {
  const fileName = path.split('/').pop();
  return fileName && fileName.includes('.') ? fileName : fallback;
};

const getImageDimensions = (uri: string, width?: number, height?: number) => {
  if (width && height && width > 0 && height > 0) {
    return Promise.resolve({ width, height });
  }

  return new Promise<{ width: number; height: number }>((resolve, reject) => {
    Image.getSize(uri, (imageWidth, imageHeight) => {
      resolve({ width: imageWidth, height: imageHeight });
    }, reject);
  });
};

const toFileUri = (path: string) =>
  path.startsWith('file://') || path.startsWith('content://')
    ? path
    : `file://${path}`;

const getSubmissionId = (submission: any) =>
  String(submission?.id ?? submission?.submissionId ?? '');

const getSubmissionTime = (submission: any) => {
  const raw =
    submission?.submittedAt ??
    submission?.createdAt ??
    submission?.completedAt ??
    submission?.date ??
    '';
  const time = Date.parse(raw);
  return Number.isFinite(time) ? time : 0;
};

const matchesDiagnosisType = (submission: any, type: 'eye' | 'urine') => {
  const rawType = String(submission?.type ?? submission?.diagnosisType ?? '').toUpperCase();
  return type === 'eye' ? rawType.includes('EYE') : rawType.includes('URINE');
};

const DiagnosisCameraCapture: React.FC<DiagnosisCameraCaptureProps> = ({
  type,
  title: _title,
  resultRouteName,
  requestDiagnosis,
}) => {
  const navigation = useNavigation<any>();
  const isFocused = useIsFocused();
  const insets = useSafeAreaInsets();
  const cameraRef = useRef<Camera>(null);
  const hasPromptedPetRef = useRef(false);
  const isMountedRef = useRef(true);
  const { hasPermission, requestPermission } = useCameraPermission();
  const [cameraPosition, setCameraPosition] = useState<'back' | 'front'>('back');
  const [isFlashOn, setFlashOn] = useState(false);
  const [pets, setPets] = useState<PetListItem[]>([]);
  const [selectedPetId, setSelectedPetId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [isGuideVisible, setGuideVisible] = useState(true);
  const [galleryImage, setGalleryImage] = useState<GalleryDiagnosisImage | null>(null);
  const [galleryAlignment, setGalleryAlignment] = useState({ x: 0, y: 0, scale: 1 });
  const [hasGuideStarted, setGuideStarted] = useState(false);
  const [isPetPickerVisible, setPetPickerVisible] = useState(false);
  const device = useCameraDevice(cameraPosition);
  const galleryAlignmentRef = useRef(galleryAlignment);
  const galleryPanStartRef = useRef({ x: 0, y: 0 });
  const galleryPinchStartScaleRef = useRef(1);
  const galleryPanHandlerRef = useRef(null);
  const galleryPinchHandlerRef = useRef(null);
  const format = useCameraFormat(device, [
    { videoResolution: { width: 1280, height: 720 } },
    { photoResolution: { width: 1280, height: 720 } },
    { photoResolution: { width: 1920, height: 1080 } },
  ]);

  const selectedPet = useMemo(
    () => pets.find((pet) => pet.id === selectedPetId) || null,
    [pets, selectedPetId]
  );

  const galleryImageLayout = useMemo(() => {
    if (!galleryImage) return null;

    const baseScale = Math.max(
      GALLERY_GUIDE_SIZE / galleryImage.width,
      GALLERY_GUIDE_SIZE / galleryImage.height
    );
    const renderedScale = baseScale * galleryAlignment.scale;
    const width = galleryImage.width * renderedScale;
    const height = galleryImage.height * renderedScale;

    return {
      width,
      height,
      left: (GALLERY_GUIDE_SIZE - width) / 2 + galleryAlignment.x,
      top: (GALLERY_GUIDE_SIZE - height) / 2 + galleryAlignment.y,
      renderedScale,
    };
  }, [galleryAlignment, galleryImage]);

  const resolveLatestSubmissionId = useCallback(
    async (petId: number, created: CreateSubmissionResponse | null) => {
      const directId = created?.submissionId || created?.id;
      if (directId) {
        return directId;
      }

      try {
        const submissions = await getPetSubmissions(petId);
        const latest = submissions
          .filter((submission) => matchesDiagnosisType(submission, type))
          .sort((a, b) => getSubmissionTime(b) - getSubmissionTime(a))[0];
        const resolvedId = getSubmissionId(latest);

        console.log('[diagnosis] upload:resolved-submission', {
          type,
          petId,
          submissionId: resolvedId || undefined,
        });

        return resolvedId || undefined;
      } catch (error) {
        console.log('[diagnosis] upload:resolve-submission-failed', error);
        return undefined;
      }
    },
    [type]
  );

  const guideCopy = useMemo(() => {
    if (type === 'eye') {
      return {
        modalTitle: '안구 촬영 가이드',
        modalBody:
          '양쪽 또는 한쪽 눈만 골라 촬영이 가능해요. 눈이 가이드 안에 들어오도록 가까이 맞춰주세요.',
        overlayText:
          '눈을 가이드 안에 맞춘 뒤\n하단 촬영 버튼을 눌러주세요.',
        stepTargetText: '화면의 가이드라인에 눈을 맞춰주세요.',
        emptyText:
          '카메라 권한을 허용하면 안구 촬영 가이드가 표시됩니다.',
      };
    }

    return {
      modalTitle: '소변키트 촬영 가이드',
      modalBody:
        '소변키트 전체가 가이드 박스 안에 들어오도록 밝은 곳에서 흔들림 없이 촬영해 주세요.',
      overlayText:
        '소변키트를 가이드 박스 안에 맞춘 뒤\n하단 촬영 버튼을 눌러주세요.',
      stepTargetText: '화면의 가이드 박스 안에 소변키트 전체를 맞춰주세요.',
      emptyText:
        '카메라 권한을 허용하면 소변키트 촬영 가이드가 표시됩니다.',
    };
  }, [type]);

  const updateGalleryAlignment = useCallback((nextAlignment: {
    x: number;
    y: number;
    scale: number;
  }) => {
    galleryAlignmentRef.current = nextAlignment;
    setGalleryAlignment(nextAlignment);
  }, []);

  const handleGalleryPanStateChange = useCallback(
    (event: PanGestureHandlerStateChangeEvent) => {
      if (event.nativeEvent.state !== State.BEGAN) return;

      const current = galleryAlignmentRef.current;
      galleryPanStartRef.current = { x: current.x, y: current.y };
    },
    []
  );

  const handleGalleryPanGesture = useCallback(
    (event: PanGestureHandlerGestureEvent) => {
      if (event.nativeEvent.numberOfPointers > 1) return;

      const start = galleryPanStartRef.current;
      updateGalleryAlignment({
        ...galleryAlignmentRef.current,
        x: start.x + event.nativeEvent.translationX,
        y: start.y + event.nativeEvent.translationY,
      });
    },
    [updateGalleryAlignment]
  );

  const handleGalleryPinchStateChange = useCallback(
    (event: PinchGestureHandlerStateChangeEvent) => {
      if (event.nativeEvent.state === State.BEGAN) {
        galleryPinchStartScaleRef.current = galleryAlignmentRef.current.scale;
      }
    },
    []
  );

  const handleGalleryPinchGesture = useCallback(
    (event: PinchGestureHandlerGestureEvent) => {
      updateGalleryAlignment({
        ...galleryAlignmentRef.current,
        scale: Math.max(
          MIN_GALLERY_SCALE,
          Math.min(
            MAX_GALLERY_SCALE,
            galleryPinchStartScaleRef.current * event.nativeEvent.scale
          )
        ),
      });
    },
    [updateGalleryAlignment]
  );

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const loadPets = async () => {
      setIsLoading(true);

      try {
        const data = await getMyPets();
        if (!isMountedRef.current) return;

        setPets(data);

        if (data.length === 1) {
          setSelectedPetId(data[0].id);
          return;
        }
      } catch (error) {
        if (!isMountedRef.current) return;

        const message =
          error instanceof Error
            ? error.message
            : '반려동물 정보를 불러오지 못했습니다.';
        Alert.alert('오류', message);
      } finally {
        if (isMountedRef.current) {
          setIsLoading(false);
        }
      }
    };

    loadPets();
  }, []);


  useEffect(() => {
    if (!hasGuideStarted || isLoading || selectedPetId || hasPromptedPetRef.current) {
      return;
    }

    if (pets.length === 0) {
      hasPromptedPetRef.current = true;
      Alert.alert('안내', '진단할 반려동물을 먼저 등록해 주세요.');
      return;
    }

    if (pets.length > 1) {
      hasPromptedPetRef.current = true;
      setPetPickerVisible(true);
    }
  }, [hasGuideStarted, isLoading, pets.length, selectedPetId]);

  const handleGuideStart = useCallback(() => {
    setGuideVisible(false);
    setGuideStarted(true);
  }, []);
  const promptPetSelection = useCallback(() => {
    if (pets.length === 0) {
      Alert.alert('안내', '진단할 반려동물을 먼저 등록해 주세요.');
      return;
    }

    if (pets.length === 1) {
      setSelectedPetId(pets[0].id);
      return;
    }

    setPetPickerVisible(true);
  }, [pets]);

  const ensureReadyToCapture = useCallback(async () => {
    if (pets.length === 0) {
      Alert.alert('안내', '진단할 반려동물을 먼저 등록해 주세요.');
      return false;
    }

    if (!selectedPetId) {
      promptPetSelection();
      return false;
    }

    if (!hasPermission) {
      const granted = await requestPermission();
      if (!granted) {
        Alert.alert('안내', '카메라 권한이 필요합니다.');
        return false;
      }
    }

    if (!device || !cameraRef.current) {
      Alert.alert('오류', '사용 가능한 카메라를 찾지 못했습니다.');
      return false;
    }

    return true;
  }, [
    device,
    hasPermission,
    pets.length,
    promptPetSelection,
    requestPermission,
    selectedPetId,
  ]);

  const handleCapture = useCallback(async () => {
    if (isUploading) return;

    console.log('[diagnosis] capture:start', {
      type,
      hasPermission,
      hasDevice: Boolean(device),
      selectedPetId,
      isFocused,
      format: format
        ? {
            photoHeight: format.photoHeight,
            photoWidth: format.photoWidth,
            videoHeight: format.videoHeight,
            videoWidth: format.videoWidth,
          }
        : null,
    });

    const canCapture = await ensureReadyToCapture();
    if (!canCapture || !isValidPetId(selectedPetId) || !cameraRef.current) {
      console.log('[diagnosis] capture:blocked', {
        canCapture,
        isValidPetId: isValidPetId(selectedPetId),
        hasCameraRef: Boolean(cameraRef.current),
      });
      return;
    }

    const petId = selectedPetId as number;
    setIsUploading(true);

    try {
      console.log('[diagnosis] capture:snapshot', {
        quality: SNAPSHOT_QUALITY,
      });
      let photo = await cameraRef.current.takeSnapshot({
        quality: SNAPSHOT_QUALITY,
      });

      if (!photo?.path) {
        console.log('[diagnosis] capture:takePhoto', {
          flash: isFlashOn && device?.hasFlash ? 'on' : 'off',
        });
        photo = await cameraRef.current.takePhoto({
          flash: isFlashOn && device?.hasFlash ? 'on' : 'off',
          enableShutterSound: true,
        });
      }

      console.log('[diagnosis] capture:photo', {
        path: photo?.path,
        width: photo?.width,
        height: photo?.height,
      });

      const fileUri = toFileUri(photo.path);
      Image.getSize(
        fileUri,
        (width, height) =>
          console.log('[diagnosis] capture:file:size', {
            uri: fileUri,
            width,
            height,
          }),
        (error) =>
          console.log('[diagnosis] capture:file:read-failed', {
            uri: fileUri,
            error: String(error),
          })
      );

      const fileName = getFileNameFromPath(photo.path, `${type}.jpg`);
      const upload = (uri: string) =>
        requestDiagnosis(petId, {
          uri,
          type: 'image/jpeg',
          fileName,
        });

      let created: CreateSubmissionResponse | null = null;
      try {
        created = await upload(fileUri);
      } catch (uploadError) {
        const errorMessage =
          uploadError instanceof Error ? uploadError.message : String(uploadError);
        if (!errorMessage.includes('Network request failed')) {
          throw uploadError;
        }

        console.log('[diagnosis] capture:retry', {
          reason: 'network failed',
          uri: photo.path,
        });
        created = await upload(photo.path);
      }

      const submissionId = await resolveLatestSubmissionId(petId, created);
      console.log('[diagnosis] capture:uploaded', { submissionId });

      if (!isMountedRef.current) return;

      navigation.navigate('DiagnosisHistory');
      navigation.navigate(resultRouteName, {
        petId,
        ...(submissionId ? { submissionId } : {}),
        origin: 'upload',
      });
    } catch (error) {
      if (!isMountedRef.current) return;

      console.log('[diagnosis] capture:error', error);
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
  }, [
    device,
    ensureReadyToCapture,
    format,
    hasPermission,
    isFlashOn,
    isFocused,
    isUploading,
    navigation,
    requestDiagnosis,
    resultRouteName,
    resolveLatestSubmissionId,
    selectedPetId,
    type,
  ]);

  const handleRequestPermission = useCallback(async () => {
    const granted = await requestPermission();
    if (!granted) {
      Alert.alert('안내', '카메라 권한이 필요합니다.');
    }
  }, [requestPermission]);

  const handleUploadFromGallery = useCallback(async (image: GalleryDiagnosisImage) => {
    if (isUploading) return;

    if (pets.length === 0) {
      Alert.alert('안내', '진단할 반려동물을 먼저 등록해 주세요.');
      return;
    }

    if (!selectedPetId) {
      promptPetSelection();
      return;
    }

    setIsUploading(true);

    try {
      const petId = selectedPetId as number;
      const fileName = image.fileName;
      const mimeType = image.mimeType;

      console.log('[diagnosis] gallery:upload:start', {
        type,
        petId,
        uri: image.uri,
        fileName,
        mimeType,
        fileSize: image.fileSize,
      });

      const created = await requestDiagnosis(petId, {
        uri: image.uri,
        type: mimeType,
        fileName,
        fileSize: image.fileSize,
      });
      const submissionId = await resolveLatestSubmissionId(petId, created);

      console.log('[diagnosis] gallery:upload:uploaded', { submissionId });

      if (!isMountedRef.current) return;

      navigation.navigate('DiagnosisHistory');
      navigation.navigate(resultRouteName, {
        petId,
        ...(submissionId ? { submissionId } : {}),
        origin: 'upload',
      });
    } catch (error) {
      if (!isMountedRef.current) return;

      console.log('[diagnosis] gallery:upload:error', error);
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
  }, [
    isUploading,
    navigation,
    pets.length,
    promptPetSelection,
    requestDiagnosis,
    resultRouteName,
    resolveLatestSubmissionId,
    selectedPetId,
    type,
  ]);

  const handlePickFromGallery = useCallback(() => {
    if (isUploading) return;

    if (pets.length === 0) {
      Alert.alert('안내', '진단할 반려동물을 먼저 등록해 주세요.');
      return;
    }

    if (!selectedPetId) {
      promptPetSelection();
      return;
    }

    const selectImage = async () => {
      try {
        const response = await launchImageLibrary({
          mediaType: 'photo',
          quality: 1,
          selectionLimit: 1,
        });
        const asset = response.assets?.[0];

        if (response.didCancel || !asset?.uri) return;

        const dimensions = await getImageDimensions(asset.uri, asset.width, asset.height);
        if (!isMountedRef.current) return;

        setGalleryAlignment({ x: 0, y: 0, scale: 1 });
        galleryAlignmentRef.current = { x: 0, y: 0, scale: 1 };
        setGalleryImage({
          uri: asset.uri,
          fileName: asset.fileName || getFileNameFromPath(asset.uri, `${type}.jpg`),
          mimeType: asset.type || 'image/jpeg',
          fileSize: asset.fileSize,
          width: dimensions.width,
          height: dimensions.height,
        });
      } catch (error) {
        console.log('[diagnosis] gallery:select:error', error);
        Alert.alert('오류', '사진을 불러오지 못했습니다. 다시 선택해 주세요.');
      }
    };

    selectImage();
  }, [isUploading, pets.length, promptPetSelection, selectedPetId, type]);

  const handleConfirmGalleryAlignment = useCallback(async () => {
    if (!galleryImage || isUploading) return;

    if (!diagnosisImageCropper) {
      Alert.alert('오류', '사진 정렬 기능을 준비하지 못했습니다. 앱을 다시 설치해 주세요.');
      return;
    }

    if (!galleryImageLayout) return;

    const cropWidth = GALLERY_GUIDE_SIZE / galleryImageLayout.renderedScale;
    const cropHeight = GALLERY_GUIDE_SIZE / galleryImageLayout.renderedScale;
    const cropX = Math.max(
      0,
      Math.min(galleryImage.width - cropWidth, -galleryImageLayout.left / galleryImageLayout.renderedScale)
    );
    const cropY = Math.max(
      0,
      Math.min(galleryImage.height - cropHeight, -galleryImageLayout.top / galleryImageLayout.renderedScale)
    );

    try {
      setIsUploading(true);
      const croppedUri = await diagnosisImageCropper.cropImage(
        galleryImage.uri,
        cropX,
        cropY,
        cropWidth,
        cropHeight
      );
      if (!isMountedRef.current) return;

      setGalleryImage(null);
      await handleUploadFromGallery({
        ...galleryImage,
        uri: croppedUri,
        fileName: `diagnosis-${type}.jpg`,
        mimeType: 'image/jpeg',
      });
    } catch (error) {
      console.log('[diagnosis] gallery:crop:error', error);
      Alert.alert('오류', '사진을 정렬하지 못했습니다. 다시 시도해 주세요.');
    } finally {
      if (isMountedRef.current) {
        setIsUploading(false);
      }
    }
  }, [galleryImage, galleryImageLayout, handleUploadFromGallery, isUploading, type]);

  const canInteract = !isLoading && !isUploading;
  const canUseFlash = Boolean(device?.hasFlash);
  const isCameraActive =
    isFocused &&
    hasPermission &&
    !isPetPickerVisible &&
    !isGuideVisible &&
    !galleryImage;

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      <View style={styles.container}>
        <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
            disabled={isUploading}
          >
            <Image
              source={require('../assets/icon_navBack.png')}
              style={styles.backIcon}
            />
          </TouchableOpacity>
          <View style={styles.logoRow}>
            <Text style={styles.logoPrimary}>똑똑하게 </Text>
            <Text style={styles.logoBlue}>건강하</Text>
            <Text style={styles.logoYellow}>개</Text>
          </View>
          <View style={styles.headerSpacer} />
        </View>

        <View style={styles.cameraArea}>
          {hasPermission && device ? (
            <Camera
              ref={cameraRef}
              style={StyleSheet.absoluteFill}
              device={device}
              format={format}
              isActive={isCameraActive}
              photo
              video
              resizeMode="cover"
              torch={isFlashOn && device.hasTorch ? 'on' : 'off'}
            />
          ) : (
            <View style={styles.permissionBox}>
              <Text style={styles.permissionText}>{guideCopy.emptyText}</Text>
              <TouchableOpacity
                style={styles.permissionButton}
                onPress={handleRequestPermission}
              >
                <Text style={styles.permissionButtonText}>권한 허용하기</Text>
              </TouchableOpacity>
            </View>
          )}

          {hasPermission && device && (
            <View style={styles.guideOverlay} pointerEvents="none">
              {type === 'eye' ? (
                <View style={styles.eyeGuideOuter}>
                  <View style={styles.eyeGuideInner} />
                </View>
              ) : (
                <View style={styles.urineGuideBox} />
              )}
              <Text style={styles.guideText}>{guideCopy.overlayText}</Text>
            </View>
          )}
        </View>

        <View style={[styles.bottomPanel, { paddingBottom: insets.bottom + 14 }]}>
          <View style={styles.petRow}>
            <Text style={styles.petLabel}>진단 대상</Text>
            <Text style={styles.petName}>
              {selectedPet ? selectedPet.name : '선택 필요'}
            </Text>
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
              style={[styles.sideButton, !canUseFlash && styles.sideButtonDisabled]}
              onPress={() => setFlashOn((prev) => !prev)}
              disabled={!canInteract || !canUseFlash}
            >
              <Text style={[styles.sideIcon, isFlashOn && styles.sideIconActive]}>
                FLASH
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.sideButton}
              onPress={handlePickFromGallery}
              disabled={!canInteract}
            >
              <Text style={styles.sideIcon}>갤러리</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.shutterButton}
              onPress={handleCapture}
              disabled={!canInteract}
              activeOpacity={0.85}
            >
              <View style={styles.shutterInner} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.sideButton}
              onPress={() =>
                setCameraPosition((prev) => (prev === 'back' ? 'front' : 'back'))
              }
              disabled={!canInteract}
            >
              <Text style={styles.sideIcon}>전환</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={styles.guideButton}
            onPress={() => setGuideVisible(true)}
            disabled={!canInteract}
          >
            <Text style={styles.guideButtonText}>촬영가이드</Text>
          </TouchableOpacity>
        </View>

        {(isLoading || isUploading) && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color="#0081D5" />
            <Text style={styles.loadingText}>
              {isUploading ? '진단 요청 중입니다...' : '준비 중입니다...'}
            </Text>
          </View>
        )}
      </View>

      <Modal
        visible={isGuideVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setGuideVisible(false)}
      >
        <View style={styles.guideModalOverlay}>
          <View style={styles.guideModal}>
            <Text style={styles.guideModalTitle}>{guideCopy.modalTitle}</Text>
            <Text style={styles.guideModalBody}>{guideCopy.modalBody}</Text>
            <View style={styles.guideSteps}>
              <Text style={styles.guideStep}>
                1. 진단할 반려동물을 선택해 주세요.
              </Text>
              <Text style={styles.guideStep}>
                2. {guideCopy.stepTargetText}
              </Text>
              <Text style={styles.guideStep}>
                3. 하단 촬영 버튼을 누르면 자동으로 진단을 요청합니다.
              </Text>
            </View>
            <TouchableOpacity
              style={styles.guideStartButton}
              onPress={handleGuideStart}
            >
              <Text style={styles.guideStartText}>촬영 시작하기</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={Boolean(galleryImage)}
        animationType="slide"
        onRequestClose={() => !isUploading && setGalleryImage(null)}
      >
        <GestureHandlerRootView style={styles.galleryGestureRoot}>
          <SafeAreaView style={styles.galleryAlignerSafeArea}>
          <View style={styles.galleryAlignerHeader}>
            <TouchableOpacity
              style={styles.galleryAlignerCloseButton}
              onPress={() => setGalleryImage(null)}
              disabled={isUploading}
            >
              <Text style={styles.galleryAlignerCloseText}>취소</Text>
            </TouchableOpacity>
            <Text style={styles.galleryAlignerTitle}>사진 위치 맞추기</Text>
            <View style={styles.galleryAlignerHeaderSpacer} />
          </View>

          <Text style={styles.galleryAlignerDescription}>
            한 손가락으로 움직이고, 두 손가락으로 확대·축소해 가이드에 맞춰주세요.
          </Text>

          <PinchGestureHandler
            ref={galleryPinchHandlerRef}
            simultaneousHandlers={galleryPanHandlerRef}
            onGestureEvent={handleGalleryPinchGesture}
            onHandlerStateChange={handleGalleryPinchStateChange}
          >
            <PanGestureHandler
              ref={galleryPanHandlerRef}
              simultaneousHandlers={galleryPinchHandlerRef}
              onGestureEvent={handleGalleryPanGesture}
              onHandlerStateChange={handleGalleryPanStateChange}
            >
              <View style={styles.galleryGuideFrame}>
                {galleryImage && galleryImageLayout && (
                  <Image
                    source={{ uri: galleryImage.uri }}
                    style={[
                      styles.galleryGuideImage,
                      {
                        width: galleryImageLayout.width,
                        height: galleryImageLayout.height,
                        left: galleryImageLayout.left,
                        top: galleryImageLayout.top,
                      },
                    ]}
                  />
                )}
                <View pointerEvents="none" style={styles.galleryGuideOverlay}>
                  {type === 'eye' ? (
                    <View style={styles.eyeGuideOuter}>
                      <View style={styles.eyeGuideInner} />
                    </View>
                  ) : (
                    <View style={styles.urineGuideBox} />
                  )}
                </View>
              </View>
            </PanGestureHandler>
          </PinchGestureHandler>

          <TouchableOpacity
            style={styles.galleryConfirmButton}
            onPress={handleConfirmGalleryAlignment}
            disabled={isUploading}
          >
            <Text style={styles.galleryConfirmButtonText}>이 위치로 분석하기</Text>
          </TouchableOpacity>
          </SafeAreaView>
        </GestureHandlerRootView>
      </Modal>

      <Modal
        visible={isPetPickerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setPetPickerVisible(false)}
      >
        <View style={styles.petPickerOverlay}>
          <View style={styles.petPickerModal}>
            <Text style={styles.petPickerTitle}>반려동물 선택</Text>
            <Text style={styles.petPickerSubtitle}>
              진단할 반려동물을 선택해 주세요.
            </Text>
            <ScrollView
              style={styles.petPickerList}
              contentContainerStyle={styles.petPickerListContent}
            >
              {pets.map((pet) => (
                <TouchableOpacity
                  key={pet.id}
                  style={styles.petPickerItem}
                  onPress={() => {
                    setSelectedPetId(pet.id);
                    setPetPickerVisible(false);
                  }}
                >
                  <Text style={styles.petPickerItemText}>
                    {pet.name || '이름 없음'}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity
              style={styles.petPickerCancel}
              onPress={() => setPetPickerVisible(false)}
            >
              <Text style={styles.petPickerCancelText}>취소</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    height: 96,
    paddingHorizontal: 20,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  backButton: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backIcon: {
    width: 22,
    height: 22,
    tintColor: '#1F2024',
  },
  logoRow: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoPrimary: {
    color: '#0081D5',
    fontSize: 18,
    fontWeight: '800',
  },
  logoBlue: {
    color: '#0081D5',
    fontSize: 18,
    fontWeight: '800',
  },
  logoYellow: {
    color: '#FFC94D',
    fontSize: 18,
    fontWeight: '800',
  },
  headerSpacer: {
    width: 42,
  },
  cameraArea: {
    flex: 1,
    backgroundColor: '#000000',
    overflow: 'hidden',
  },
  permissionBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 36,
  },
  permissionText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 22,
  },
  permissionButton: {
    marginTop: 18,
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 24,
    backgroundColor: '#0081D5',
  },
  permissionButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  guideOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
  eyeGuideOuter: {
    width: 250,
    height: 250,
    borderRadius: 125,
    borderWidth: 2,
    borderColor: '#0081D5',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  eyeGuideInner: {
    width: 170,
    height: 170,
    borderRadius: 85,
    borderWidth: 2,
    borderColor: '#0081D5',
    borderStyle: 'dashed',
  },
  urineGuideBox: {
    width: 260,
    height: 180,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: '#0081D5',
    borderStyle: 'dashed',
  },
  guideText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 23,
    marginTop: 26,
    paddingHorizontal: 26,
    textShadowColor: 'rgba(0,0,0,0.55)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  bottomPanel: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 28,
    paddingTop: 14,
  },
  petRow: {
    minHeight: 28,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  petLabel: {
    color: '#62666A',
    fontSize: 13,
    fontWeight: '600',
  },
  petName: {
    color: '#0081D5',
    fontSize: 15,
    fontWeight: '800',
    marginLeft: 7,
    marginRight: 8,
  },
  petSelectButton: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 14,
    backgroundColor: '#EEF7FD',
  },
  petSelectText: {
    color: '#0081D5',
    fontSize: 12,
    fontWeight: '700',
  },
  controlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sideButton: {
    width: 62,
    height: 72,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sideButtonDisabled: {
    opacity: 0.35,
  },
  sideIcon: {
    color: '#9EA2A7',
    fontSize: 13,
    fontWeight: '800',
  },
  sideIconActive: {
    color: '#FFC400',
  },
  shutterButton: {
    width: 82,
    height: 82,
    borderRadius: 41,
    borderWidth: 6,
    borderColor: '#2F99F3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#FFFFFF',
  },
  guideButton: {
    alignSelf: 'center',
    marginTop: 6,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 18,
    backgroundColor: '#EEF7FD',
  },
  guideButtonText: {
    color: '#0081D5',
    fontSize: 13,
    fontWeight: '800',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    color: '#1F2024',
    fontSize: 14,
    fontWeight: '700',
    marginTop: 12,
  },
  guideModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.62)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  guideModal: {
    width: '100%',
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 20,
  },
  guideModalTitle: {
    color: '#1F2024',
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
  },
  guideModalBody: {
    color: '#60646A',
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 21,
    textAlign: 'center',
    marginTop: 14,
  },
  guideSteps: {
    marginTop: 18,
  },
  guideStep: {
    color: '#3C4144',
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 19,
    marginTop: 8,
  },
  guideStartButton: {
    height: 46,
    borderRadius: 23,
    backgroundColor: '#0081D5',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 22,
  },
  guideStartText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  galleryGestureRoot: {
    flex: 1,
  },
  galleryAlignerSafeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  galleryAlignerHeader: {
    height: 58,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E8EAED',
  },
  galleryAlignerCloseButton: {
    minWidth: 48,
    paddingVertical: 10,
  },
  galleryAlignerCloseText: {
    color: '#60646A',
    fontSize: 15,
    fontWeight: '700',
  },
  galleryAlignerTitle: {
    color: '#1F2024',
    fontSize: 18,
    fontWeight: '800',
  },
  galleryAlignerHeaderSpacer: {
    width: 48,
  },
  galleryAlignerDescription: {
    color: '#60646A',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 30,
  },
  galleryGuideFrame: {
    width: GALLERY_GUIDE_SIZE,
    height: GALLERY_GUIDE_SIZE,
    alignSelf: 'center',
    marginTop: 28,
    overflow: 'hidden',
    backgroundColor: '#111111',
  },
  galleryGuideImage: {
    position: 'absolute',
  },
  galleryGuideOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.16)',
  },
  galleryConfirmButton: {
    height: 54,
    marginHorizontal: 28,
    marginTop: 28,
    borderRadius: 12,
    backgroundColor: '#0081D5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  galleryConfirmButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  petPickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  petPickerModal: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: '#2E2F31',
    borderRadius: 14,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 14,
  },
  petPickerTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  petPickerSubtitle: {
    color: '#C8C9CC',
    fontSize: 13,
    marginTop: 6,
  },
  petPickerList: {
    marginTop: 12,
    maxHeight: 220,
  },
  petPickerListContent: {
    paddingBottom: 8,
  },
  petPickerItem: {
    paddingVertical: 10,
  },
  petPickerItemText: {
    color: '#7FD3C8',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'right',
  },
  petPickerCancel: {
    marginTop: 6,
    paddingVertical: 10,
  },
  petPickerCancelText: {
    color: '#C8C9CC',
    fontSize: 13,
    textAlign: 'right',
  },
});

export default DiagnosisCameraCapture;

