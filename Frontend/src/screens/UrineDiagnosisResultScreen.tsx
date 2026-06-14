import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
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
  getUrineSubmissionResult,
  getPetSubmissions,
  SubmissionSummary,
} from '../api/diagnosis';

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

type Props = NativeStackScreenProps<RootStackParamList, 'UrineDiagnosisResult'>;

const getSubmissionId = (submission: SubmissionSummary): string => {
  return submission.id ?? submission.submissionId ?? '';
};

const getSubmissionTime = (submission: SubmissionSummary): number => {
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

const isUrineType = (type?: string) => {
  const normalized = (type || '').toUpperCase();
  return normalized.includes('URINE');
};

const UrineDiagnosisResultScreen: React.FC<Props> = ({ route, navigation }) => {
  const { petId, submissionId } = route.params;
  const origin = (route.params as any)?.origin;
  const bypassBeforeRemoveRef = useRef(false);
  const isFocused = useIsFocused();

  const petName = (route.params as any)?.petName;

  const handleBack = useCallback(() => {
    if (origin === 'history' || origin === 'upload') {
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
      if ((origin !== 'history' && origin !== 'upload') || bypassBeforeRemoveRef.current) {
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

    try {
      if (submissionId) {
        try {
          const direct = await getUrineSubmissionResult(submissionId);
          if (!canUpdate()) return;
          setSubmission({ id: submissionId, type: 'URINE', status: STATUS_COMPLETED });
          setResult(direct);
          setMessage('');
          return;
        } catch (directError) {
          console.log('[urine] direct submission lookup skipped; using list fallback', {
            submissionId,
            message:
              directError instanceof Error ? directError.message : String(directError),
          });
        }
      }

      const submissions = await getPetSubmissions(petId);
      if (!canUpdate()) return;

      const urineSubmissions = submissions.filter((item) => isUrineType(item.type));

      if (urineSubmissions.length === 0) {
        setSubmission(null);
        setResult(null);
        setMessage('소변키트 진단 요청이 아직 없습니다.');
        return;
      }

      const target =
        submissionId
          ? urineSubmissions.find((item) => getSubmissionId(item) === submissionId)
          : [...urineSubmissions].sort((a, b) => getSubmissionTime(b) - getSubmissionTime(a))[0];

      if (!target) {
        setSubmission(null);
        setResult(null);
        setMessage('해당 진단 기록을 찾을 수 없습니다.');
        return;
      }

      setSubmission(target);

      const normalizedStatus = normalizeStatus(target.status);
      const idToFetch = getSubmissionId(target);

      if (!idToFetch) {
        setResult(null);
        setMessage('진단 기록 ID를 확인할 수 없습니다.');
        return;
      }

      if (isProcessingStatus(normalizedStatus)) {
        setResult(null);
        setMessage('AI가 소변키트를 분석 중입니다.');
        return;
      }

      if (isFailedStatus(normalizedStatus)) {
        setResult(null);
        setMessage(
          getFailureReason(target) ||
            '진단 처리에 실패했습니다. 잠시 후 다시 시도해 주세요.'
        );
        return;
      }

      if (isDeletedStatus(normalizedStatus)) {
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
          const detail = await getUrineSubmissionResult(idToFetch);
          if (!canUpdate()) return;
          setResult(detail);
          setMessage('');
          return;
        } catch (detailError) {
          if (!canUpdate()) return;
          if (!isCompletedStatus(normalizedStatus)) {
            setResult(null);
            setMessage('AI가 소변키트를 분석 중입니다.');
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
    }, 2000);

    return () => clearTimeout(timer);
  }, [isFocused, isLoading, loadResult, result, status, submission, submissionId]);

  const resultText = useMemo(() => {
    if (!result) {
      return '';
    }

    return JSON.stringify(result, null, 2);
  }, [result]);

  // 결과 데이터 파싱 - 소변 검사 결과
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
      analyte: item.analyte || '미확인',
      value: item.value || '-',
      colorRGB: item.colorRGB || [],
    }));
  }, [result]);

  const goHome = () => {
    navigation.navigate('Main');
  };

  const renderAnalyzingScreen = () => {
    return (
      <View style={styles.analyzingContainer}>
        <Text style={styles.analyzingTitle}>결과 분석중..</Text>

        <View style={styles.progressWrapper}>
          <View style={styles.progressBase} />
          <View style={styles.progressArc} />
          <Image source={dogImage} style={styles.dogImage} />
        </View>

        <Text style={styles.waitText}>대기시간이 너무 길까요?</Text>

        <TouchableOpacity style={styles.homeButton} onPress={goHome}>
          <Text style={styles.homeButtonText}>홈으로</Text>
        </TouchableOpacity>
      </View>
    );
  };

  const renderResultScreen = () => {
    return (
      <View style={styles.resultContainer}>
        <Text style={styles.resultTitle}>소변키트 진단 결과</Text>

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
                    <Text style={styles.resultCardTitle}>{item.analyte}</Text>
                  </View>

                  <View style={styles.resultCardRow}>
                    <Text style={styles.resultCardLabel}>검사 결과:</Text>
                    <Text style={styles.resultCardValue}>{item.value}</Text>
                  </View>

                  {item.colorRGB && item.colorRGB.length === 3 && (
                    <View style={styles.resultCardRow}>
                      <View
                        style={[
                          styles.colorBox,
                          {
                            backgroundColor: `rgb(${item.colorRGB[0]}, ${item.colorRGB[1]}, ${item.colorRGB[2]})`
                          }
                        ]}
                      />
                      <Text style={styles.resultCardLabel}>
                        RGB: ({item.colorRGB.join(', ')})
                      </Text>
                    </View>
                  )}
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
        <Text style={styles.resultTitle}>소변키트 진단 결과</Text>

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

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <TouchableOpacity style={styles.backButton} onPress={handleBack}>
          <Image source={require('../assets/icon_back.png')} style={styles.backIcon} />
        </TouchableOpacity>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#0081D5" />
          <Text style={styles.loadingText}>진단 상태를 확인 중입니다.</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (isProcessingStatus(status)) {
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

  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 15,
    color: '#3C4144',
  },

  analyzingContainer: {
    flex: 1,
    alignItems: 'center',
    paddingTop: 110,
    backgroundColor: '#FFFFFF',
  },
  analyzingTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111111',
    marginBottom: 42,
  },
  progressWrapper: {
    width: 210,
    height: 210,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 72,
  },
  progressBase: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    borderWidth: 10,
    borderColor: '#C8E3FF',
  },
  progressArc: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    borderWidth: 10,
    borderTopColor: '#118AF5',
    borderRightColor: '#118AF5',
    borderBottomColor: 'transparent',
    borderLeftColor: 'transparent',
    transform: [{ rotate: '38deg' }],
  },
  dogImage: {
    width: 105,
    height: 105,
    resizeMode: 'contain',
  },
  waitText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111111',
    marginBottom: 28,
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
     backgroundColor: '#FFF9F0',
     borderLeftWidth: 4,
     borderLeftColor: '#FF9500',
   },
   resultCardHeader: {
     marginBottom: 10,
   },
   resultCardTitle: {
     fontSize: 15,
     fontWeight: '700',
     color: '#1F2024',
   },
   resultCardRow: {
     flexDirection: 'row',
     alignItems: 'center',
     marginBottom: 8,
   },
   resultCardLabel: {
     fontSize: 12,
     color: '#666666',
     marginRight: 6,
   },
   resultCardValue: {
     fontSize: 13,
     fontWeight: '600',
     color: '#FF9500',
   },
   colorBox: {
     width: 24,
     height: 24,
     borderRadius: 4,
     marginRight: 8,
     borderWidth: 1,
     borderColor: '#DDDDDD',
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

export default UrineDiagnosisResultScreen;
