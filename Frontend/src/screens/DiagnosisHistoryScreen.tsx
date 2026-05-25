import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Image,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../App';
import { getPetSubmissions, SubmissionSummary } from '../api/diagnosis';
import { getMyPets, PetListItem } from '../api/pets';
import { resolveImageUri } from '../utils/imageUri';

const STATUS_LABELS: Record<string, string> = {
  PENDING: '분석 대기',
  PROCESSING: '분석 중',
  COMPLETED: '완료',
  FAILED: '실패',
  DELETED: '삭제됨',
};

const TYPE_LABELS: Record<string, string> = {
  EYE: '안구 진단',
  URINE: '소변키트 진단',
};

type Props = NativeStackScreenProps<RootStackParamList, 'DiagnosisHistory'>;

type NormalizedSubmission = {
  id: string;
  type: string;
  status: string;
  submittedAt: string;
  submittedAtMs: number;
};

const getSubmissionId = (submission: SubmissionSummary): string => {
  return submission.id ?? submission.submissionId ?? '';
};

const getSubmissionTime = (submission: SubmissionSummary): number => {
  const value =
    submission.submittedAt ??
    submission.submitted_at ??
    submission.createdAt ??
    submission.created_at;

  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
};

const formatDateTime = (isoText: string) => {
  if (!isoText) return '-';
  const parsed = new Date(isoText);
  if (Number.isNaN(parsed.getTime())) return isoText;
  const yyyy = parsed.getFullYear();
  const mm = String(parsed.getMonth() + 1).padStart(2, '0');
  const dd = String(parsed.getDate()).padStart(2, '0');
  const hh = String(parsed.getHours()).padStart(2, '0');
  const min = String(parsed.getMinutes()).padStart(2, '0');
  return `${yyyy}.${mm}.${dd} ${hh}:${min}`;
};

const normalizeSubmission = (submission: SubmissionSummary): NormalizedSubmission | null => {
  const id = getSubmissionId(submission);
  const rawTypeOriginal = submission.type ?? '';
  const rawType = rawTypeOriginal.toUpperCase();
  const type = rawType.includes('URINE') || rawTypeOriginal.includes('소변') || rawTypeOriginal.includes('요')
    ? 'URINE'
    : rawType.includes('EYE') || rawTypeOriginal.includes('안구') || rawTypeOriginal.includes('눈')
    ? 'EYE'
    : rawType;
  if (!id || !type) return null;

  const submittedAt =
    submission.submittedAt ??
    submission.submitted_at ??
    submission.createdAt ??
    submission.created_at ??
    '';

  return {
    id,
    type,
    status: submission.status?.toUpperCase() ?? 'UNKNOWN',
    submittedAt,
    submittedAtMs: getSubmissionTime(submission),
  };
};

const DiagnosisHistoryScreen: React.FC<Props> = ({ route, navigation }) => {
  const { petId: paramPetId, petName: paramPetName } = route.params ?? {};
  const [isLoading, setIsLoading] = useState(true);
  const [items, setItems] = useState<NormalizedSubmission[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // When no petId provided, show pet chooser first
  const [pets, setPets] = useState<PetListItem[] | null>(null);
  const [selectedPetId, setSelectedPetId] = useState<number | null>(
    paramPetId ?? null
  );
  const [selectedPetName, setSelectedPetName] = useState<string | undefined>(
    paramPetName
  );

  const loadHistory = useCallback(async () => {
    const petToLoad = selectedPetId;
    if (!petToLoad) return;
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const submissions = await getPetSubmissions(petToLoad);
      const normalized = submissions
        .map(normalizeSubmission)
        .filter((item): item is NormalizedSubmission => !!item)
        .sort((a, b) => b.submittedAtMs - a.submittedAtMs);

      setItems(normalized);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : '진단 이력을 불러오지 못했습니다.';
      setErrorMessage(message);
    } finally {
      setIsLoading(false);
    }
  }, [selectedPetId]);

  useEffect(() => {
    // If a pet was already provided, load directly
    if (selectedPetId) {
      loadHistory();
      return;
    }

    // Otherwise fetch pet list for selection
    let mounted = true;
    (async () => {
      setIsLoading(true);
      try {
        const myPets = await getMyPets();
        if (!mounted) return;
        setPets(myPets);
      } catch (err) {
        if (!mounted) return;
        setErrorMessage('반려동물 목록을 불러오지 못했습니다.');
      } finally {
        if (mounted) setIsLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [loadHistory, selectedPetId]);

  const headerTitle = useMemo(() => {
    if (selectedPetName) return `${selectedPetName} 진단 이력`;
    if (paramPetName) return `${paramPetName} 진단 이력`;
    return '진단 이력';
  }, [selectedPetName, paramPetName]);

  const handlePressItem = (item: NormalizedSubmission) => {
    const petToSend = selectedPetId ?? paramPetId;
    const petNameToSend = selectedPetName ?? paramPetName;
    if (!petToSend) return;
    const commonParams = { petId: petToSend, submissionId: item.id, origin: 'history' as const, petName: petNameToSend };
    if (item.type === 'EYE') {
      navigation.navigate('EyeDiagnosisResult', commonParams as any);
      return;
    }
    if (item.type === 'URINE') {
      navigation.navigate('UrineDiagnosisResult', commonParams as any);
      return;
    }
  };

  const handleSelectPet = (pet: PetListItem) => {
    setSelectedPetId(pet.id ?? null);
    setSelectedPetName(pet.name);
    setItems([]);
  };

  useFocusEffect(
    useCallback(() => {
      const shouldHandleLocalBack = !paramPetId && selectedPetId !== null;
      if (!shouldHandleLocalBack) {
        return undefined;
      }

      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        setSelectedPetId(null);
        setSelectedPetName(undefined);
        setItems([]);
        setErrorMessage(null);
        return true;
      });

      return () => sub.remove();
    }, [paramPetId, selectedPetId])
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{headerTitle}</Text>
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#0081D5" />
          <Text style={styles.loadingText}>진단 이력을 불러오는 중입니다.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {!selectedPetId && pets && (
            <View style={styles.petList}>
              <Text style={styles.helperText}>진단할 반려동물을 선택하세요.</Text>
              {pets.map((pet) => (
                <TouchableOpacity
                  key={pet.id}
                  style={styles.petRow}
                  activeOpacity={0.8}
                  onPress={() => handleSelectPet(pet)}
                >
                  <View style={styles.petInfo}>
                    {resolveImageUri(pet.profilePicture) ? (
                      <Image
                        source={{ uri: resolveImageUri(pet.profilePicture) }}
                        style={styles.petThumb}
                      />
                    ) : (
                      <View style={styles.petThumb} />
                    )}
                    <View>
                      <Text style={styles.petName}>{pet.name || '이름 없음'}</Text>
                      <Text style={styles.petMeta}>{pet.breed || pet.species || ''}</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {!!errorMessage && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{errorMessage}</Text>
            </View>
          )}

          {selectedPetId !== null && items.length === 0 && !errorMessage && (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyText}>아직 진단 이력이 없습니다.</Text>
            </View>
          )}

          {items.map((item) => (
            <TouchableOpacity
              key={item.id}
              style={styles.historyCard}
              activeOpacity={0.85}
              onPress={() => handlePressItem(item)}
            >
              <View style={styles.cardRow}>
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{TYPE_LABELS[item.type] ?? item.type}</Text>
                </View>
                <Text style={styles.statusText}>{STATUS_LABELS[item.status] ?? item.status}</Text>
              </View>
              <Text style={styles.dateText}>{formatDateTime(item.submittedAt)}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 52,
    paddingBottom: 12,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1F2024',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 15,
    color: '#3C4144',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  petList: {
    marginTop: 8,
  },
  petRow: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  petInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  petThumb: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#E6E6E6',
  },
  petName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111111',
  },
  petMeta: {
    fontSize: 13,
    color: '#7B7C7D',
  },
  helperText: {
    marginBottom: 8,
    color: '#7B7C7D',
  },
  historyCard: {
    marginTop: 12,
    padding: 16,
    borderRadius: 14,
    backgroundColor: '#F6FAFF',
    borderWidth: 1,
    borderColor: '#E2EFFB',
  },
  cardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: '#0081D5',
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  statusText: {
    color: '#3C4144',
    fontSize: 13,
    fontWeight: '600',
  },
  dateText: {
    color: '#7B7C7D',
    fontSize: 13,
    fontWeight: '500',
  },
  emptyBox: {
    marginTop: 40,
    alignItems: 'center',
  },
  emptyText: {
    color: '#7B7C7D',
    fontSize: 14,
  },
  errorBox: {
    marginTop: 20,
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#FFF3F3',
  },
  errorText: {
    color: '#D64545',
    fontSize: 13,
  },
});

export default DiagnosisHistoryScreen;

