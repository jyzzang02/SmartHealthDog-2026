import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  BackHandler,
  Image,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../App';
import {
  UrineDiagnosisResult,
  getUrineSubmissionResult,
  getPetSubmissions,
  SubmissionSummary,
} from '../api/diagnosis';
import DiagnosisAnalysisProgress from '../components/DiagnosisAnalysisProgress';
import DiagnosisResultView from '../components/DiagnosisResultView';

const URINE_ITEMS: Record<string, string> = {
  leukocytes: '백혈구',
  nitrite: '아질산염',
  urobilinogen: '유로빌리노겐',
  protein: '단백질',
  ph: '산도 (pH)',
  blood: '잠혈',
  'specific gravity': '비중',
  ketone: '케톤',
  bilirubin: '빌리루빈',
  glucose: '포도당',
};

const URINE_EXPLANATIONS = [
  { name: '케톤', detail: '몸이 지방을 에너지로 사용할 때 생기는 물질이에요. 검출되면 공복이나 당뇨병 등 여러 원인을 확인할 수 있어요.' },
  { name: '포도당', detail: '소변 속 당을 확인해요. 검출되면 혈당이나 신장 상태 등을 함께 살펴볼 수 있어요.' },
  { name: '백혈구', detail: '염증과 관련해 살펴보는 세포예요. 동물의 시험지 검사는 신뢰도에 한계가 있어 추가 확인이 필요해요.' },
  { name: '아질산염', detail: '일부 세균과 관련된 물질이에요. 동물의 시험지 결과만으로 감염을 판단할 수 없어요.' },
  { name: '빌리루빈', detail: '혈액 성분이 분해될 때 생기는 물질이에요. 검출되면 간과 담도 상태 등을 함께 확인할 수 있어요.' },
  { name: '유로빌리노겐', detail: '빌리루빈에서 만들어지는 물질이에요. 이 항목만으로 특정 질환을 판단하기는 어려워요.' },
  { name: '잠혈', detail: '소변 속 혈액 성분을 확인해요. 양성일 때는 여러 원인을 구분하기 위한 추가 검사가 필요할 수 있어요.' },
  { name: '단백질', detail: '소변 속 단백질을 확인해요. 검출되면 소변의 농도와 다른 검사 결과를 함께 살펴봐야 해요.' },
  { name: '산도 (pH)', detail: '소변이 산성인지 알칼리성인지 나타내요. 식사나 약물 등 여러 요인에 따라 달라질 수 있어요.' },
  { name: '비중', detail: '소변이 얼마나 농축됐는지 나타내요. 시험지 결과는 다른 방법으로 확인이 필요할 수 있어요.' },
];

const formatUrineValue = (value: string | null | undefined) => {
  if (value == null || !value.trim()) return '-';
  const labels: Record<string, string> = {
    'neg.': '음성', negative: '음성', positive: '양성', normal: '정상',
    trace: '미량', small: '소량', moderate: '중간', large: '다량',
    'non hemolyzed': '비용혈', hemolyzed: '용혈',
  };
  return value.replace(/(^|[^a-z])(non hemolyzed|hemolyzed|neg\.|negative|positive|normal|trace|small|moderate|large)(?![a-z])/gi,
    (match, prefix: string, label: string) => prefix + (labels[label.toLowerCase()] ?? label));
};

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
  const [result, setResult] = useState<UrineDiagnosisResult | null>(null);
  const [message, setMessage] = useState('');
  const [showExplanations, setShowExplanations] = useState(false);
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

  // 결과 데이터 파싱 - 소변 검사 결과
  const parsedResults = useMemo(() => {
    if (!result || typeof result !== 'object') {
      return [];
    }

    // results 배열 추출
    const resultsArray = result.results;
    if (!Array.isArray(resultsArray)) {
      return [];
    }

    return resultsArray.map(item => {
      const analyte = item.analyte?.trim() || '미확인';
      const info = URINE_ITEMS[analyte.toLowerCase()];
      return {
        name: info ?? analyte,
        value: formatUrineValue(item.resultValue),
      };
    });
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

  const renderResultScreen = () => (
    <DiagnosisResultView
      title="소변키트 검사 결과"
      petName={petName}
      items={parsedResults}
      footerContent={(
        <View style={styles.explanationSection}>
          <TouchableOpacity
            style={styles.explanationToggle}
            onPress={() => setShowExplanations(previous => !previous)}
            accessibilityRole="button"
            accessibilityState={{ expanded: showExplanations }}
          >
            <Text style={styles.explanationTitle}>검사 항목 알아보기</Text>
            <Text style={styles.explanationToggleText}>{showExplanations ? '접기' : '자세히 보기'}</Text>
          </TouchableOpacity>
          {showExplanations && (
            <View style={styles.explanationBody}>
              {URINE_EXPLANATIONS.map(item => (
                <View key={item.name} style={styles.explanationItem}>
                  <Text style={styles.explanationName}>{item.name}</Text>
                  <Text style={styles.explanationText}>{item.detail}</Text>
                </View>
              ))}
              <Text style={styles.explanationDisclaimer}>검사 결과만으로 질병을 판단할 수 없으며, 정확한 해석은 수의사와 상담해 주세요.</Text>
            </View>
          )}
        </View>
      )}
      onBack={handleBack}
      onRetake={() => navigation.navigate('UrineCamera')}
      onFindHospital={() => {
        bypassBeforeRemoveRef.current = true;
        navigation.reset({ index: 0, routes: [{ name: 'Main', params: { screen: '건강', params: { openHospitalSearch: true } } }] });
      }}
    />
  );

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
    return renderResultScreen();
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
  explanationSection: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 18, marginTop: 4 },
  explanationToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 32 },
  explanationTitle: { fontSize: 17, fontWeight: '700', color: '#1F2024' },
  explanationToggleText: { fontSize: 14, fontWeight: '600', color: '#0081D5' },
  explanationBody: { marginTop: 16 },
  explanationItem: { marginBottom: 14 },
  explanationName: { fontSize: 14, fontWeight: '700', color: '#1F2024', marginBottom: 4 },
  explanationText: { fontSize: 13, color: '#65686D', lineHeight: 20 },
  explanationDisclaimer: { fontSize: 12, color: '#7B7C7D', lineHeight: 18 },
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
