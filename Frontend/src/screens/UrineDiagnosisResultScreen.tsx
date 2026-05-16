import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
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

const UrineDiagnosisResultScreen: React.FC<Props> = ({ route, navigation }) => {
  const { petId } = route.params;

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

  const status = submission?.status?.toUpperCase() ?? '';

  const loadResult = useCallback(async () => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    const canUpdate = () => isMountedRef.current && requestIdRef.current === requestId;

    setIsLoading(true);

    try {
      const submissions = await getPetSubmissions(petId);
      if (!canUpdate()) return;

      const urineSubmissions = submissions.filter(
        (item) => item.type?.toUpperCase() === 'URINE'
      );

      if (urineSubmissions.length === 0) {
        setSubmission(null);
        setResult(null);
        setMessage('소변키트 진단 요청이 아직 없습니다.');
        return;
      }

      const latest = [...urineSubmissions].sort(
        (a, b) => getSubmissionTime(b) - getSubmissionTime(a)
      )[0];

      setSubmission(latest);

      const submissionId = getSubmissionId(latest);
      const normalizedStatus = latest.status?.toUpperCase() ?? '';

      if (!submissionId) {
        setResult(null);
        setMessage('진단 기록 ID를 확인할 수 없습니다.');
        return;
      }

      if (
        normalizedStatus === STATUS_PENDING ||
        normalizedStatus === STATUS_PROCESSING
      ) {
        setResult(null);
        setMessage('AI가 소변키트를 분석 중입니다.');
        return;
      }

      if (normalizedStatus === STATUS_FAILED) {
        setResult(null);
        setMessage(
          getFailureReason(latest) ||
            '진단 처리에 실패했습니다. 잠시 후 다시 시도해 주세요.'
        );
        return;
      }

      if (normalizedStatus === STATUS_DELETED) {
        setResult(null);
        setMessage(
          getFailureReason(latest) === 'TIMEOUT'
            ? 'AI 분석 시간이 초과되었습니다. 다시 촬영해 주세요.'
            : '삭제되었거나 조회할 수 없는 진단 기록입니다.'
        );
        return;
      }

      if (normalizedStatus === STATUS_COMPLETED) {
        const detail = await getUrineSubmissionResult(submissionId);
        if (!canUpdate()) return;
        setResult(detail);
        setMessage('');
        return;
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
  }, [petId]);

  useEffect(() => {
    loadResult();
  }, [loadResult]);

  const resultText = useMemo(() => {
    if (!result) {
      return '';
    }

    return JSON.stringify(result, null, 2);
  }, [result]);

  const goHome = () => {
    navigation.navigate('Main');
  };

  const renderAnalyzingScreen = () => {
    return (
      <View style={styles.analyzingContainer}>
        <Text style={styles.analyzingTitle}>결과 분석중...</Text>

        <View style={styles.progressWrapper}>
          <View style={styles.progressBase} />
          <View style={styles.progressArc} />
          <Image source={dogImage} style={styles.dogImage} />
        </View>

        <Text style={styles.waitText}>대기시간이 너무 긴가요?</Text>

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

        <View style={styles.resultBox}>
          <Text style={styles.resultBoxTitle}>결과 요약</Text>
          <Text style={styles.resultText}>{resultText}</Text>
        </View>
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
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#0081D5" />
          <Text style={styles.loadingText}>진단 상태를 확인 중입니다.</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (status === STATUS_PENDING || status === STATUS_PROCESSING) {
    return <SafeAreaView style={styles.safeArea}>{renderAnalyzingScreen()}</SafeAreaView>;
  }

  if (result) {
    return <SafeAreaView style={styles.safeArea}>{renderResultScreen()}</SafeAreaView>;
  }

  return <SafeAreaView style={styles.safeArea}>{renderMessageScreen()}</SafeAreaView>;
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
  resultTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1F2024',
    marginBottom: 16,
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
});

export default UrineDiagnosisResultScreen;

