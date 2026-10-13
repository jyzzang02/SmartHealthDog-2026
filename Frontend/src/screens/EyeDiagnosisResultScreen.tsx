import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  BackHandler,
  Image,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../App';
import {
  EyeDiagnosisResult,
  getEyeSubmissionResult,
  getPetSubmissions,
  SubmissionSummary,
} from '../api/diagnosis';
import DiagnosisAnalysisProgress from '../components/DiagnosisAnalysisProgress';

const STATUS_PENDING = 'PENDING';
const STATUS_PROCESSING = 'PROCESSING';
const STATUS_COMPLETED = 'COMPLETED';
const STATUS_FAILED = 'FAILED';
const STATUS_DELETED = 'DELETED';

const normalizeStatus = (status?: string) => (status || '').trim().toUpperCase();

const PROCESSING_STATUSES = new Set([
  STATUS_PENDING,
  STATUS_PROCESSING,
  'QUEUED',
  'IN_PROGRESS',
  'RUNNING',
  'ANALYZING',
]);

const COMPLETED_STATUSES = new Set([
  STATUS_COMPLETED,
  'SUCCESS',
  'SUCCEEDED',
  'DONE',
  'FINISHED',
]);

const FAILED_STATUSES = new Set([
  STATUS_FAILED,
  'ERROR',
  'REJECTED',
  'CANCELED',
  'CANCELLED',
]);

const DELETED_STATUSES = new Set([
  STATUS_DELETED,
  'EXPIRED',
  'TIMEOUT',
]);

const isProcessingStatus = (status?: string) =>
  PROCESSING_STATUSES.has(normalizeStatus(status));

const isCompletedStatus = (status?: string) =>
  COMPLETED_STATUSES.has(normalizeStatus(status));

const isFailedStatus = (status?: string) =>
  FAILED_STATUSES.has(normalizeStatus(status));

const isDeletedStatus = (status?: string) =>
  DELETED_STATUSES.has(normalizeStatus(status));

const dogImage = require('../assets/eyeDog.png');

type Props = NativeStackScreenProps<RootStackParamList, 'EyeDiagnosisResult'>;

const getSubmissionId = (submission: SubmissionSummary): string => {
  return submission.id ?? submission.submissionId ?? '';
};

const getSubmissionTime = (submission?: SubmissionSummary | null): number => {
  if (!submission) {
    return 0;
  }

  const value =
    submission.submittedAt ??
    submission.submitted_at ??
    submission.createdAt ??
    submission.created_at;

  if (!value) {
    return 0;
  }

  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
};

const getFailureReason = (submission: SubmissionSummary): string | null => {
  return submission.failureReason ?? submission.failure_reason ?? null;
};

const isEyeType = (type?: string) => {
  const normalized = (type || '').toUpperCase();
  return normalized.includes('EYE');
};

const logEyeDiagnosis = (event: string, details: Record<string, unknown>) => {
  console.log(`[eye-diagnosis] ${event}`, details);
};

const EyeDiagnosisResultScreen: React.FC<Props> = ({ route, navigation }) => {
  const { petId, submissionId } = route.params;

  const origin = (route.params as any)?.origin;
  const bypassBeforeRemoveRef = useRef(false);
  const directLookupTriedRef = useRef(false);
  const isFocused = useIsFocused();

  const petName = (route.params as any)?.petName;

  const handleBack = useCallback(() => {
    if (origin === 'history') {
      // Try to pop back to an existing DiagnosisHistory in the stack to avoid duplicates
      const state = navigation.getState();
      const routes = state.routes || [];
      const lastIndex = routes.map((r) => r.name).lastIndexOf('DiagnosisHistory');
      if (lastIndex !== -1) {
        const delta = routes.length - 1 - lastIndex;
        if (delta > 0) {
          navigation.pop(delta);
          return;
        }
      }

      navigation.navigate('DiagnosisHistory', { petId, petName });
      return;
    }

    navigation.goBack();
  }, [navigation, origin, petId, petName]);

  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        handleBack();
        return true;
      });
      return () => sub.remove();
    }, [handleBack])
  );

  useEffect(() => {
    const unsub = navigation.addListener('beforeRemove', (event) => {
      if (origin !== 'history' || bypassBeforeRemoveRef.current) {
        return;
      }

      event.preventDefault();
      bypassBeforeRemoveRef.current = true;
      handleBack();
    });

    return unsub;
  }, [navigation, origin, handleBack]);

  const [isLoading, setIsLoading] = useState(true);
  const [submission, setSubmission] = useState<SubmissionSummary | null>(null);
  const [result, setResult] = useState<EyeDiagnosisResult | null>(null);
  const [message, setMessage] = useState('');
  const isMountedRef = useRef(true);
  const requestIdRef = useRef(0);
  const lastLoggedStatusRef = useRef('');

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      requestIdRef.current += 1;
    };
  }, []);

  const status = normalizeStatus(submission?.status);

  const loadResult = useCallback(async () => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    const canUpdate = () => isMountedRef.current && requestIdRef.current === requestId;

    setIsLoading(true);
    logEyeDiagnosis('status-check:start', {
      requestId,
      petId,
      submissionId: submissionId ?? null,
      directLookupTried: directLookupTriedRef.current,
    });

    try {
      if (submissionId && !directLookupTriedRef.current) {
        directLookupTriedRef.current = true;
        try {
          const direct = await getEyeSubmissionResult(submissionId);
          if (!canUpdate()) return;
          setSubmission({ id: submissionId, type: 'EYE', status: STATUS_COMPLETED });
          setResult(direct);
          setMessage('');
          logEyeDiagnosis('direct-result:success', { submissionId });
          return;
        } catch (directError) {
          console.warn('[eye-diagnosis] direct-result:failed', {
            submissionId,
            message:
              directError instanceof Error ? directError.message : String(directError),
          });
        }
      }

      const submissions = await getPetSubmissions(petId);
      if (!canUpdate()) return;

      const eyeSubmissions = submissions.filter((item) => isEyeType(item.type));

      if (eyeSubmissions.length === 0) {
        logEyeDiagnosis('submission:not-found', {
          petId,
          submissionId: submissionId ?? null,
          totalSubmissions: submissions.length,
        });
        setSubmission(null);
        setResult(null);
        setMessage('안구 진단 요청이 아직 없습니다.');
        return;
      }

      const target =
        submissionId
          ? eyeSubmissions.find((item) => getSubmissionId(item) === submissionId)
          : [...eyeSubmissions].sort(
              (a, b) => getSubmissionTime(b) - getSubmissionTime(a)
            )[0];

      if (!target) {
        logEyeDiagnosis('submission:id-not-found', {
          petId,
          submissionId,
          availableSubmissionIds: eyeSubmissions.map(getSubmissionId),
        });
        setSubmission(null);
        setResult(null);
        setMessage('해당 진단 기록을 찾을 수 없습니다.');
        return;
      }

      setSubmission(target);

      const normalizedStatus = normalizeStatus(target.status);
      const idToFetch = getSubmissionId(target);
      const failureReason = getFailureReason(target);
      const statusKey = `${idToFetch}:${normalizedStatus}:${failureReason ?? ''}`;
      const isNewStatus = lastLoggedStatusRef.current !== statusKey;

      if (isNewStatus) {
        lastLoggedStatusRef.current = statusKey;
        logEyeDiagnosis('submission:status', {
          submissionId: idToFetch || null,
          status: normalizedStatus || null,
          submittedAt: target.submittedAt ?? target.submitted_at ?? null,
          completedAt: target.completedAt ?? target.completed_at ?? null,
          failureReason,
          submission: target,
        });
      }

      if (!idToFetch) {
        console.warn('[eye-diagnosis] submission:missing-id', { target });
        setResult(null);
        setMessage('진단 기록 ID를 확인할 수 없습니다.');
        return;
      }

      if (isProcessingStatus(normalizedStatus)) {
        setResult(null);
        setMessage('AI가 안구질환을 분석 중입니다.');
        return;
      }

      if (isFailedStatus(normalizedStatus)) {
        if (isNewStatus) {
          console.warn('[eye-diagnosis] submission:failed', {
            submissionId: idToFetch,
            status: normalizedStatus,
            failureReason,
          });
        }
        setResult(null);
        setMessage(
          getFailureReason(target) ||
            '진단 처리에 실패했습니다. 잠시 후 다시 시도해 주세요.'
        );
        return;
      }

      if (isDeletedStatus(normalizedStatus)) {
        if (isNewStatus) {
          console.warn('[eye-diagnosis] submission:deleted', {
            submissionId: idToFetch,
            status: normalizedStatus,
            failureReason,
          });
        }
        setResult(null);
        setMessage(
          getFailureReason(target) === 'TIMEOUT'
            ? 'AI 분석 시간이 초과되었습니다. 다시 촬영해 주세요.'
            : '삭제되었거나 조회할 수 없는 진단 기록입니다.'
        );
        return;
      }

      if (isCompletedStatus(normalizedStatus) || normalizedStatus.length > 0) {
        try {
          const detail = await getEyeSubmissionResult(idToFetch);
          if (!canUpdate()) return;
          setResult(detail);
          setMessage('');
          logEyeDiagnosis('detail-result:success', {
            submissionId: idToFetch,
            status: normalizedStatus,
          });
          return;
        } catch (detailError) {
          console.warn('[eye-diagnosis] detail-result:failed', {
            status: normalizedStatus,
            submissionId: idToFetch,
            error: String(detailError),
          });
          if (!canUpdate()) return;
          if (!isCompletedStatus(normalizedStatus)) {
            setResult(null);
            setMessage('AI가 안구질환을 분석 중입니다.');
            return;
          }
          throw detailError;
        }
      }

      setResult(null);
      setMessage('진단 상태를 확인할 수 없습니다.');
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : '결과를 불러오지 못했습니다.';

      if (!canUpdate()) return;
      console.error('[eye-diagnosis] status-check:failed', {
        requestId,
        petId,
        submissionId: submissionId ?? null,
        error: errorMessage,
      });
      setResult(null);
      setMessage(errorMessage);
      Alert.alert('오류', errorMessage);
    } finally {
      if (canUpdate()) {
        setIsLoading(false);
      }
    }
  }, [petId, submissionId]);

  useEffect(() => {
    loadResult();
  }, [loadResult]);

  useEffect(() => {
    if (!isFocused || isLoading) {
      return;
    }

    if (result) {
      return;
    }

    if (isFailedStatus(status) || isDeletedStatus(status)) {
      return;
    }

    if (!submission && !submissionId) {
      return;
    }

    const timer = setTimeout(() => {
      loadResult();
    }, 5000);

    return () => clearTimeout(timer);
  }, [isFocused, isLoading, loadResult, result, status, submission, submissionId]);

  // 결과 데이터 파싱
  const parsedResults = useMemo(() => {
    if (!result || typeof result !== 'object') {
      return [];
    }

    // results 배열 추출
    const resultsArray = (result as any).results;
    if (!Array.isArray(resultsArray)) {
      return [];
    }

    return resultsArray.map((item: any) => ({
      disease: item.disease || '미확인',
      probability: typeof item.probability === 'number'
        ? (item.probability * 100).toFixed(1)
        : (parseFloat(item.probability) * 100).toFixed(1),
      condition: item.condition || {},
      name: item.condition?.name || item.disease || '미확인',
      description: item.condition?.description || '',
    }));
  }, [result]);

  const goHome = () => {
    navigation.navigate('Main');
  };

  const renderAnalyzingScreen = () => {
    return (
      <DiagnosisAnalysisProgress
        imageSource={dogImage}
        startedAtMs={getSubmissionTime(submission) || undefined}
        status={status}
        onRefresh={loadResult}
        onGoHome={goHome}
      />
    );
  };

  const renderResultScreen = () => {
    return (
      <View style={styles.resultContainer}>
        <Text style={styles.resultTitle}>안구 진단 결과</Text>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.resultScrollContent}
          showsVerticalScrollIndicator={false}
        >
          {parsedResults.length > 0 ? (
            <>
              {parsedResults.map((item, index) => (
                <View key={index} style={styles.resultCard}>
                  <View style={styles.resultCardHeader}>
                    <Text style={styles.resultCardTitle}>{item.name}</Text>
                    <View style={styles.probabilityBadge}>
                      <Text style={styles.probabilityText}>{item.probability}%</Text>
                    </View>
                  </View>

                  {item.description ? (
                    <Text style={styles.resultCardDescription}>
                      {item.description}
                    </Text>
                  ) : null}
                </View>
              ))}
            </>
          ) : (
            <View style={styles.noResultBox}>
              <Text style={styles.noResultText}>진단 결과가 없습니다.</Text>
            </View>
          )}

          <TouchableOpacity
            style={styles.homeButton}
            onPress={goHome}
          >
            <Text style={styles.homeButtonText}>홈으로</Text>
          </TouchableOpacity>

          <View style={{ height: 80 }} />
        </ScrollView>
      </View>
    );
  };

  const renderMessageScreen = () => {
    return (
      <View style={styles.messageContainer}>
        <Text style={styles.resultTitle}>안구 진단 결과</Text>

        <View style={styles.messageBox}>
          <Text style={styles.message}>{message}</Text>

          <TouchableOpacity style={styles.refreshButton} onPress={loadResult}>
            <Text style={styles.refreshButtonText}>다시 확인</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.homeOutlineButton} onPress={goHome}>
            <Text style={styles.homeOutlineButtonText}>홈으로</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  if (isProcessingStatus(status) || (isLoading && !submission && !result && !message)) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <TouchableOpacity style={styles.backButton} onPress={handleBack}>
          <Image source={require('../assets/icon_back.png')} style={styles.backIcon} />
        </TouchableOpacity>
        {renderAnalyzingScreen()}
      </SafeAreaView>
    );
  }

  if (result) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <TouchableOpacity style={styles.backButton} onPress={handleBack}>
          <Image source={require('../assets/icon_back.png')} style={styles.backIcon} />
        </TouchableOpacity>
        {renderResultScreen()}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <TouchableOpacity style={styles.backButton} onPress={handleBack}>
        <Image source={require('../assets/icon_back.png')} style={styles.backIcon} />
      </TouchableOpacity>
      {renderMessageScreen()}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },

  homeButton: {
    width: 150,
    height: 48,
    borderRadius: 9,
    backgroundColor: '#008DE0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  homeButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },

   resultContainer: {
     flex: 1,
     paddingHorizontal: 20,
     paddingTop: 48,
     backgroundColor: '#FFFFFF',
   },
   resultScrollContent: {
     paddingHorizontal: 8,
     paddingTop: 12,
   },
   resultTitle: {
     fontSize: 22,
     fontWeight: '700',
     color: '#1F2024',
     marginLeft: 28,
     marginBottom: 16,
   },
   resultCard: {
     marginBottom: 12,
     padding: 14,
     borderRadius: 12,
     backgroundColor: '#F8FBFF',
     borderLeftWidth: 4,
     borderLeftColor: '#0081D5',
   },
   resultCardHeader: {
     flexDirection: 'row',
     justifyContent: 'space-between',
     alignItems: 'center',
     marginBottom: 8,
   },
   resultCardTitle: {
     fontSize: 16,
     fontWeight: '700',
     color: '#1F2024',
     flex: 1,
   },
   probabilityBadge: {
     paddingHorizontal: 10,
     paddingVertical: 4,
     borderRadius: 16,
     backgroundColor: '#0081D5',
   },
   probabilityText: {
     fontSize: 12,
     fontWeight: '700',
     color: '#FFFFFF',
   },
   resultCardDescription: {
     fontSize: 13,
     color: '#555555',
     lineHeight: 19,
   },
   noResultBox: {
     marginTop: 40,
     alignItems: 'center',
   },
   noResultText: {
     fontSize: 16,
     color: '#999999',
   },
   resultBox: {
     marginTop: 12,
     padding: 16,
     borderRadius: 12,
     backgroundColor: '#F5F7FA',
   },
   resultBoxTitle: {
     fontSize: 16,
     fontWeight: '600',
     color: '#1F2024',
     marginBottom: 8,
   },
   resultText: {
     fontSize: 14,
     color: '#1F2024',
     lineHeight: 20,
   },

  messageContainer: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 48,
    backgroundColor: '#FFFFFF',
  },
  messageBox: {
    marginTop: 12,
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#F5F7FA',
  },
  message: {
    fontSize: 16,
    color: '#3C4144',
    lineHeight: 24,
  },
  refreshButton: {
    alignSelf: 'flex-start',
    marginTop: 16,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: '#0081D5',
  },
  refreshButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  homeOutlineButton: {
    alignSelf: 'flex-start',
    marginTop: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#0081D5',
    backgroundColor: '#FFFFFF',
  },
  homeOutlineButtonText: {
    color: '#0081D5',
    fontSize: 14,
    fontWeight: '700',
  },
  backButton: {
    position: 'absolute',
    top: 54,
    left: 18,
    zIndex: 30,
    padding: 6,
  },
  backIcon: {
    width: 20,
    height: 20,
  },
});

export default EyeDiagnosisResultScreen;
