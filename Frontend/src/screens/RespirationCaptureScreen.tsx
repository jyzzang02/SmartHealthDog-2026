import React, { useEffect, useRef, useState } from 'react';
import { Alert, AppState, Modal, NativeModules, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useIsFocused, usePreventRemove } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Camera, useCameraDevice, useCameraFormat, useCameraPermission, useMicrophonePermission } from 'react-native-vision-camera';
import { launchImageLibrary } from 'react-native-image-picker';
import type { RootStackParamList } from '../../App';
import { getMyPets, type PetListItem } from '../api/pets';
import { RespirationPendingView } from '../components/DiagnosisAnalysisProgress';
import { completeRespirationUpload, getRespirationRecord, prepareRespirationUpload, RespirationHttpError, type RespirationRecord } from '../api/respiration';
import { assertAuthSession, getAuthSession } from '../storage/tokenStorage';

const files = NativeModules.RespirationFile as {
  size(path: string): Promise<number>;
  upload(path: string, url: string): Promise<number>;
  discard?(path: string): Promise<void>;
  cancelUpload?(): void;
} | undefined;

async function discardClip(path: string): Promise<void> {
  try {
    await files?.discard?.(path);
  } catch {
    // A cache cleanup failure must not interrupt navigation or registration.
  }
}

export const supportsRespirationCapture = !!files;

type Clip = { path: string; seconds: number; size: number; fromGallery?: boolean };
type Phase = 'idle' | 'picking' | 'recording' | 'checking' | 'ready' | 'uploading' | 'done';

export default function RespirationCaptureScreen({ route, navigation }: NativeStackScreenProps<RootStackParamList, 'RespirationCapture'>) {
  const [{ petId, petName }, setPet] = useState(route.params);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pets, setPets] = useState<PetListItem[] | null>(null);
  const [petsFailed, setPetsFailed] = useState(false);
  const camera = useRef<Camera>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const mounted = useRef(false);
  const busy = useRef(false);
  const recording = useRef(false);
  const recordingStartedAt = useRef(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const filePath = useRef<string | null>(null);
  const uploadedId = useRef<string | null>(null);
  const session = useRef(getAuthSession());
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const [initialized, setInitialized] = useState(false);
  const [cameraError, setCameraError] = useState(false);
  const [cameraKey, setCameraKey] = useState(0);
  const [canCancelUpload, setCanCancelUpload] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [phase, setPhase] = useState<Phase>('idle');
  const [registered, setRegistered] = useState<RespirationRecord | null>(null);
  const [clip, setClip] = useState<Clip | null>(null);
  const [message, setMessage] = useState('');
  const focused = useIsFocused();
  const device = useCameraDevice('back');
  const format = useCameraFormat(device, [{ videoResolution: { width: 854, height: 480 } }]);
  const permission = useCameraPermission();
  const microphone = useMicrophonePermission();
  usePreventRemove(phase === 'uploading' || phase === 'recording' || (phase === 'ready' && !!uploadedId.current), ({ data }) => {
    if (phase !== 'ready') return;
    Alert.alert('등록을 확인하지 못했습니다. 같은 영상으로 완료 확인을 다시 시도해 주세요.', '화면을 나가면 이 영상의 등록 상태를 다시 확인할 수 없습니다.', [
      { text: '취소', style: 'cancel' },
      { text: '뒤로', onPress: () => navigation.dispatch(data.action) },
    ]);
  });

  useEffect(() => {
    if (phase !== 'recording') return;
    const interval = setInterval(() => {
      setElapsedSeconds(Math.max(0, Math.floor((Date.now() - recordingStartedAt.current) / 1000)));
    }, 250);
    return () => clearInterval(interval);
  }, [phase]);

  const stop = async () => {
    if (!recording.current) return;
    recording.current = false;
    if (timer.current !== undefined) clearTimeout(timer.current);
    setPhase('checking');
    try { await camera.current?.stopRecording(); }
    catch { if (mounted.current) { setPhase('idle'); setMessage('녹화를 종료하지 못했습니다. 다시 촬영해 주세요.'); } }
  };
  const stopRef = useRef(stop);
  stopRef.current = stop;

  useEffect(() => {
    mounted.current = true;
    const subscription = AppState.addEventListener('change', state => {
      if (state !== 'active') void stopRef.current();
      setForeground(state === 'active');
    });
    return () => {
      mounted.current = false;
      if (timer.current !== undefined) clearTimeout(timer.current);
      subscription.remove();
      if (filePath.current) void discardClip(filePath.current);
    };
  }, []);

  const reset = (preserveCamera = false) => {
    if (filePath.current) void discardClip(filePath.current);
    filePath.current = null;
    uploadedId.current = null;
    setClip(null);
    if (!preserveCamera) setInitialized(false);
    setMessage('');
    setPhase('idle');
  };

  const openPetPicker = async () => {
    setPickerOpen(true);
    setPets(null);
    setPetsFailed(false);
    try {
      assertAuthSession(session.current);
      const result = await getMyPets();
      assertAuthSession(session.current);
      if (mounted.current) setPets(result);
    } catch {
      if (mounted.current) setPetsFailed(true);
    }
  };

  const toggleAudio = async () => {
    if (phase !== 'idle') return;
    if (microphone.hasPermission) {
      setAudioEnabled(value => !value);
      return;
    }
    try {
      const granted = await microphone.requestPermission();
      if (!mounted.current) return;
      setAudioEnabled(granted);
      if (!granted) {
        Alert.alert('음성 녹음이 허용되지 않았어요', '소리 없이 영상을 촬영할 수 있습니다. 권한은 기기 설정에서 변경할 수 있습니다.');
      }
    } catch {
      if (mounted.current) setMessage('마이크 권한을 확인해 주세요.');
    }
  };

  const pickGalleryVideo = async () => {
    if (!files || busy.current || recording.current || phase !== 'idle') return;
    busy.current = true;
    setPhase('picking');
    setMessage('');
    let pickedPath: string | undefined;
    try {
      const result = await launchImageLibrary({ mediaType: 'video', selectionLimit: 1 });
      const asset = result.assets?.[0];
      pickedPath = asset?.uri;
      if (!mounted.current || result.didCancel) return;
      if (result.errorCode || !asset || !pickedPath) throw new Error('갤러리에서 영상을 불러오지 못했습니다.');
      if (asset.type?.toLowerCase() !== 'video/mp4') throw new Error('MP4 형식의 영상을 선택해 주세요.');
      const seconds = asset.duration;
      if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 30 || seconds > 120) {
        throw new Error('영상 길이는 30~120초여야 합니다. 다른 영상을 선택해 주세요.');
      }
      const size = await files.size(pickedPath).catch(() => 0);
      if (!mounted.current) return;
      if (!Number.isSafeInteger(size) || size < 1) throw new Error('영상 파일을 읽을 수 없습니다.');
      if (size > 31457280) throw new Error('영상이 30MB를 초과했습니다. 더 작은 영상을 선택해 주세요.');
      filePath.current = pickedPath;
      setClip({ path: pickedPath, seconds: Math.floor(seconds), size, fromGallery: true });
      setPhase('ready');
    } catch (error) {
      if (mounted.current) setMessage(error instanceof Error ? error.message : '갤러리에서 영상을 불러오지 못했습니다.');
    } finally {
      if (pickedPath && filePath.current !== pickedPath) await discardClip(pickedPath);
      if (mounted.current && !filePath.current) setPhase('idle');
      busy.current = false;
    }
  };

  const start = () => {
    if (!files || !camera.current || !initialized || busy.current || recording.current || phase !== 'idle') return;
    recording.current = true;
    recordingStartedAt.current = Date.now();
    setElapsedSeconds(0);
    setMessage('');
    setPhase('recording');
    try {
      camera.current.startRecording({
        fileType: 'mp4',
        videoCodec: 'h264',
        onRecordingError: () => {
          recording.current = false;
          if (timer.current !== undefined) clearTimeout(timer.current);
          if (mounted.current) { setPhase('idle'); setMessage('녹화하지 못했습니다. 다시 촬영해 주세요.'); }
        },
        onRecordingFinished: async video => {
          recording.current = false;
          if (timer.current !== undefined) clearTimeout(timer.current);
          if (!mounted.current) { void discardClip(video.path); return; }
          filePath.current = video.path;
          setPhase('checking');
          try {
            if (!Number.isFinite(video.duration) || video.duration < 30 || video.duration > 120) {
              throw new Error('영상 길이는 30~120초여야 합니다. 다시 촬영해 주세요.');
            }
            const size = await files.size(video.path);
            if (!Number.isSafeInteger(size) || size < 1) throw new Error('영상 파일을 읽을 수 없습니다.');
            if (size > 31457280) throw new Error('영상이 30MB를 초과했습니다. 더 짧게 촬영해 주세요.');
            if (!mounted.current) return;
            setClip({ path: video.path, seconds: Math.floor(video.duration), size });
            setPhase('ready');
          } catch (error) {
            if (!mounted.current) return;
            reset(true);
            setMessage(error instanceof Error ? error.message : '영상 파일을 확인하지 못했습니다.');
          }
        },
      });
      timer.current = setTimeout(() => void stopRef.current(), 119500);
    } catch {
      recording.current = false;
      setPhase('idle');
      setMessage('녹화를 시작하지 못했습니다.');
    }
  };

  const upload = async () => {
    if (!files || !clip || busy.current) return;
    busy.current = true;
    setPhase('uploading');
    setMessage('');
    let step = 'upload-url';
    if (__DEV__) console.log('[수면 영상] 등록 시작', { sizeBytes: clip.size, durationSec: clip.seconds });
    try {
      assertAuthSession(session.current);
      if (!uploadedId.current) {
        const size = await files.size(clip.path);
        if (size !== clip.size) throw new Error('FILE_SIZE_CHANGED');
        if (__DEV__) console.log('[수면 영상] 업로드 URL 요청');
        const prepared = await prepareRespirationUpload(petId, size, clip.seconds);
        assertAuthSession(session.current);
        step = 'S3 PUT';
        if (__DEV__) console.log('[수면 영상] S3 업로드 시작');
        setCanCancelUpload(typeof files.cancelUpload === 'function');
        const uploadStatus = await files.upload(clip.path, prepared.uploadUrl);
        setCanCancelUpload(false);
        if (__DEV__) console.log('[수면 영상] S3 업로드 응답', { status: uploadStatus });
        uploadedId.current = prepared.videoId;
      }
      step = 'complete';
      assertAuthSession(session.current);
      const videoId = uploadedId.current;
      if (__DEV__) console.log('[수면 영상] 완료 처리 요청');
      const record = await completeRespirationUpload(petId, videoId).catch(async error => {
        if (__DEV__) console.log('[수면 영상] 완료 응답 실패, 등록 상태 조회');
        const existing = await getRespirationRecord(petId, videoId).catch(() => null);
        if (__DEV__) console.log('[수면 영상] 조회 결과', { status: existing?.status ?? '확인 실패' });
        if (existing?.videoId === videoId && existing.petId === petId && existing.status !== 'UPLOADING') return existing;
        if (existing?.status === 'UPLOADING' && error instanceof RespirationHttpError &&
            (error.status === 400 || error.status === 409)) {
          uploadedId.current = null;
        }
        throw error;
      });
      if (record.videoId !== videoId || record.petId !== petId ||
          !['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'].includes(record.status)) throw new Error('UNCONFIRMED');
      if (__DEV__) console.log('[수면 영상] 등록 완료', { status: record.status });
      reset();
      setRegistered(record);
      setPhase('done');
    } catch (error) {
      const code = (error as { code?: unknown })?.code;
      const status = typeof code === 'string' ? /^UPLOAD_HTTP_(\d{3})$/.exec(code)?.[1] : undefined;
      if (__DEV__) console.log('[수면 영상] 등록 실패', { step, status: status ?? null });
      setMessage(step === 'complete' && uploadedId.current
        ? '등록을 확인하지 못했습니다. 같은 영상으로 완료 확인을 다시 시도해 주세요.'
        : `영상을 등록하지 못했습니다. (${step}${status ? ` · HTTP ${status}` : ''}) 다시 시도해 주세요.`);
      setPhase('ready');
    } finally {
      setCanCancelUpload(false);
      busy.current = false;
    }
  };

  const button = (label: string, action: () => void, disabled = false, variant: 'primary' | 'pet' | 'secondary' = 'primary') => (
    <Pressable accessibilityRole="button" disabled={disabled} onPress={action} style={[styles.button, variant === 'pet' && styles.petButton, variant === 'secondary' && styles.secondaryButton, disabled && styles.disabled]}>
      <Text style={[styles.buttonText, variant === 'pet' && styles.petButtonText, variant === 'secondary' && styles.secondaryButtonText]}>{label}</Text>
    </Pressable>
  );

  if (phase === 'done' && registered) {
    const showResult = () => navigation.navigate('RespirationResult', { petId, petName, videoId: registered.videoId });
    return (
      <SafeAreaView style={styles.screen}>
        {registered.status === 'PENDING'
          ? <RespirationPendingView onConfirm={() => navigation.goBack()} />
          : <Text style={styles.title}>영상 등록 완료</Text>}
        {button('분석 결과 확인', showResult, false, 'secondary')}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <Text style={styles.title}>수면 영상 등록</Text>
      {phase === 'idle' && files ? button('반려동물: ' + petName + ' · 변경', () => { void openPetPicker(); }, false, 'pet') :
        <Text style={styles.text}>{petName}</Text>}
      <Modal visible={pickerOpen} transparent animationType="fade" onRequestClose={() => setPickerOpen(false)}>
        <View style={styles.pickerOverlay}>
          <View style={styles.picker} accessibilityViewIsModal>
            <Text style={styles.title}>반려동물 선택</Text>
            {petsFailed ? button('목록 다시 불러오기', () => { void openPetPicker(); }) :
              pets === null ? <Text style={styles.text}>불러오는 중...</Text> :
                pets.length === 0 ? <Text style={styles.text}>등록된 반려동물이 없습니다.</Text> :
                  <ScrollView>
                    {pets.map(pet => (
                      <Pressable key={pet.id} accessibilityRole="button" accessibilityState={{ selected: pet.id === petId }}
                        style={[styles.petOption, pet.id === petId && styles.petOptionSelected]} onPress={() => {
                          if (phase !== 'idle' || recording.current) return;
                          setPet({ petId: pet.id, petName: pet.name });
                          setPickerOpen(false);
                        }}>
                        <Text style={styles.text}>{pet.name}</Text>
                      </Pressable>
                    ))}
                  </ScrollView>}
            {button('닫기', () => setPickerOpen(false))}
          </View>
        </View>
      </Modal>
      <View style={styles.guide}><Text style={styles.guideText}>편히 쉬는 반려동물의 가슴이나 배 움직임이 보이도록 약 <Text style={styles.guideHighlight}>60초</Text> 동안 촬영해 주세요.</Text></View>
      {files && permission.hasPermission && device && ['idle', 'picking', 'recording', 'checking'].includes(phase) && (
        <View style={styles.preview}>
          <Camera key={cameraKey} ref={camera} style={StyleSheet.absoluteFill} device={device}
            format={format} videoBitRate={format ? 1.5 : undefined} video audio={microphone.hasPermission && audioEnabled}
            isActive={focused && foreground && phase !== 'picking'} onInitialized={() => { setCameraError(false); setInitialized(true); }}
            onError={() => {
              recording.current = false;
              if (timer.current !== undefined) clearTimeout(timer.current);
              setInitialized(false);
              setCameraError(true);
              setPhase('idle');
              setMessage('녹화하지 못했습니다. 다시 촬영해 주세요.');
            }} />
          {phase === 'recording' && (
            <View style={styles.recordingTimer} accessibilityLabel={`촬영 시간 ${elapsedSeconds}초`}>
              <Text style={styles.recordingTimerText}>
                {String(Math.floor(elapsedSeconds / 60)).padStart(2, '0')}:{String(elapsedSeconds % 60).padStart(2, '0')}
              </Text>
            </View>
          )}
          <Pressable accessibilityRole="button"
            accessibilityLabel={microphone.hasPermission && audioEnabled ? '음성 녹음 끄기' : '음성 녹음 켜기'}
            accessibilityState={{ disabled: phase !== 'idle', checked: microphone.hasPermission && audioEnabled }}
            disabled={phase !== 'idle'} onPress={() => { void toggleAudio(); }} style={styles.micButton}>
            <View style={styles.micIcon}>
              <View style={[styles.micHead, !(microphone.hasPermission && audioEnabled) && styles.micMuted]} />
              <View style={[styles.micBase, !(microphone.hasPermission && audioEnabled) && styles.micMuted]} />
              <View style={[styles.micStem, !(microphone.hasPermission && audioEnabled) && styles.micStemMuted]} />
              {!(microphone.hasPermission && audioEnabled) && <View style={styles.micSlash} />}
            </View>
          </Pressable>
        </View>
      )}
      {!files && <Text style={styles.text}>이 기기에서는 영상 등록을 지원하지 않습니다.</Text>}
      {files && !permission.hasPermission && button('카메라 권한 허용', () => { void permission.requestPermission().catch(() => setMessage('카메라 권한을 확인해 주세요.')); })}
      {files && permission.hasPermission && phase === 'idle' && (cameraError
        ? button('다시 촬영', () => { setCameraError(false); setMessage(''); setCameraKey(key => key + 1); })
        : button('촬영 시작', start, !initialized || !device))}
      {files && phase === 'idle' && button('갤러리에서 영상 선택', pickGalleryVideo, false, 'secondary')}
      {phase === 'recording' && button('촬영 종료', () => { void stop(); })}
      {phase === 'checking' && <Text style={styles.text}>영상 확인 중...</Text>}
      {phase === 'uploading' && <Text style={styles.text}>영상 등록 중...</Text>}
      {canCancelUpload && button('업로드 취소', () => { files?.cancelUpload?.(); setCanCancelUpload(false); }, false, 'secondary')}
      {phase === 'ready' && clip && <Text style={styles.text}>{clip.seconds}초 · {(clip.size / 1048576).toFixed(1)}MB</Text>}
      {phase === 'ready' && button(uploadedId.current ? '등록 완료 다시 확인' : '영상 등록', () => { void upload(); })}
      {phase === 'ready' && !uploadedId.current && button(clip?.fromGallery ? '선택 취소' : '다시 촬영', () => reset())}
      {!!message && <Text accessibilityRole="alert" style={styles.text}>{message}</Text>}
      {phase === 'idle' && button('최근 분석 결과', () => navigation.navigate('RespirationResult', { petId, petName }), false, 'secondary')}
      {phase !== 'uploading' && phase !== 'recording' && button('뒤로', () => navigation.goBack(), false, 'secondary')}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: 20, backgroundColor: '#fff', gap: 10 },
  title: { fontSize: 22, fontWeight: '700', color: '#111' },
  text: { fontSize: 15, color: '#333' },
  preview: { flex: 1, minHeight: 100, overflow: 'hidden', borderRadius: 12, backgroundColor: '#111' },
  recordingTimer: { position: 'absolute', left: 12, bottom: 12, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.65)' },
  recordingTimerText: { color: '#fff', fontSize: 14, fontWeight: '700', fontVariant: ['tabular-nums'] },
  micButton: { position: 'absolute', right: 12, bottom: 12, width: 48, height: 48, borderRadius: 24, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  micIcon: { width: 28, height: 30, alignItems: 'center', justifyContent: 'center' },
  micHead: { width: 10, height: 15, borderRadius: 5, backgroundColor: '#0081D5' },
  micBase: { width: 16, height: 10, borderWidth: 2, borderTopWidth: 0, borderColor: '#0081D5', borderBottomLeftRadius: 8, borderBottomRightRadius: 8, marginTop: -3 },
  micStem: { width: 2, height: 4, backgroundColor: '#0081D5' },
  micMuted: { backgroundColor: '#E5484D', borderColor: '#E5484D' },
  micStemMuted: { backgroundColor: '#E5484D' },
  micSlash: { position: 'absolute', width: 27, height: 3, backgroundColor: '#E5484D', transform: [{ rotate: '-45deg' }], borderWidth: 0.5, borderColor: '#fff' },
  button: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: '#0081D5' },
  buttonText: { color: '#fff', fontWeight: '700' },
  petButton: { backgroundColor: '#F3F7FA' },
  petButtonText: { color: '#007BC7' },
  secondaryButton: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#DDE3E8' },
  secondaryButtonText: { color: '#50545A' },
  guide: { paddingVertical: 4 },
  guideText: { color: '#555', fontSize: 14, lineHeight: 21 },
  guideHighlight: { color: '#A66D00', fontWeight: '700' },
  disabled: { opacity: 0.5 },
  pickerOverlay: { flex: 1, padding: 24, justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.4)' },
  picker: { maxHeight: '75%', padding: 20, gap: 12, borderRadius: 12, backgroundColor: '#fff' },
  petOption: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 },
  petOptionSelected: { backgroundColor: '#FFF3D0', borderRadius: 8 },
});
