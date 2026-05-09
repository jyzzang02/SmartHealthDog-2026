import React, { useMemo, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../App';
import CustomButton from '../components/CustomButton';
import { getShelterPetDetail, PetDetail } from '../api/shelters';

type AnimalDetailRouteProp = RouteProp<RootStackParamList, 'AnimalDetail'>;
type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export default function AnimalDetailScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<AnimalDetailRouteProp>();
  const { animalData } = route.params;
  const [petDetail, setPetDetail] = useState<PetDetail | null>(null);
  const [petError, setPetError] = useState<string | null>(null);
  const [isPetLoading, setIsPetLoading] = useState(false);

  useEffect(() => {
    if (!animalData.shelterId || !animalData.id) return;

    const fetchPetDetail = async () => {
      setIsPetLoading(true);
      setPetError(null);
      try {
        const detail = await getShelterPetDetail(animalData.shelterId, animalData.id);
        setPetDetail(detail);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : '동물 상세 정보를 불러오지 못했습니다.';
        setPetError(message);
      } finally {
        setIsPetLoading(false);
      }
    };

    fetchPetDetail();
  }, [animalData.id, animalData.shelterId]);

  const imageSource = useMemo(() => {
    if (petDetail?.images?.[0]) {
      return { uri: petDetail.images[0] };
    }
    return animalData.image;
  }, [animalData.image, petDetail?.images]);

  const shelterName =
    petDetail?.shelter_contact?.name || animalData.shelterName || '보호소 정보';
  const shelterPhone =
    petDetail?.shelter_contact?.phone_number || animalData.shelterPhone || '';

  const summaryText = useMemo(() => {
    const parts: string[] = [];
    if (petDetail?.gender) parts.push(petDetail.gender);
    if (petDetail?.is_neutered !== undefined) {
      parts.push(petDetail.is_neutered ? '중성화 O' : '중성화 X');
    }
    if (petDetail?.age) parts.push(petDetail.age);
    return parts.length > 0 ? parts.join(' / ') : '정보 없음';
  }, [petDetail?.age, petDetail?.gender, petDetail?.is_neutered]);

  const breedText = petDetail?.breed || animalData.breed || '품종 정보 없음';
  const adoptionStatus = petDetail?.adoption_status || '정보 없음';
  const description = petDetail?.description || '정보 없음';
  const shelterAddress = petDetail?.shelter_contact?.address || animalData.location || '정보 없음';

  return (
    <View style={styles.container}>
      {/* 헤더 */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Image
            source={require('../assets/icon_navBack.png')}
            style={styles.backIcon}
          />
        </TouchableOpacity>
        <View style={styles.logoContainer}>
          <Image
            source={require('../assets/logo_navTop.png')}
            style={styles.logo}
          />
        </View>
      </View>

      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* 보호소 제목 */}
        <Text style={styles.shelterTitle}>{shelterName}</Text>

        {/* 동물 이미지 */}
        <View style={styles.imageContainer}>
          <Image
            source={imageSource}
            style={styles.animalImage}
          />
        </View>

        {/* 품종 */}
        <Text style={styles.breedText}>{breedText}</Text>

        {/* 상세 정보 요약 */}
        <Text style={styles.summaryText}>{summaryText}</Text>

        {/* 구분선 */}
        <View style={styles.divider} />

        {isPetLoading && (
          <Text style={styles.loadingText}>동물 정보를 불러오는 중...</Text>
        )}
        {petError && <Text style={styles.errorText}>{petError}</Text>}

        {/* 상세 정보 */}
        <View style={styles.detailsSection}>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>입양상태</Text>
            <Text style={styles.detailValue}>{adoptionStatus}</Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>소개</Text>
            <Text style={styles.detailValue}>{description}</Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>보호센터</Text>
            <Text style={styles.detailValue}>{shelterName}</Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>주소</Text>
            <Text style={styles.detailValue}>{shelterAddress}</Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>연락처</Text>
            <Text style={styles.detailValue}>{shelterPhone || '정보 없음'}</Text>
          </View>
        </View>

        {/* 전화하기 버튼 */}
        <View style={styles.buttonContainer}>
          <CustomButton
            text="전화하기"
            onPress={() => {}}
            width={350}
            disabled={!shelterPhone}
          />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 16,
    backgroundColor: '#FFFFFF',
  },
  backButton: {
    padding: 8,
    marginRight: 8,
  },
  backIcon: {
    width: 20,
    height: 20,
  },
  logoContainer: {
    flex: 1,
  },
  logo: {
    width: 143,
    height: 28,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  shelterTitle: {
    color: '#000',
    fontSize: 18,
    fontWeight: '600',
    marginLeft: 20,
    marginBottom: 16,
  },
  imageContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  animalImage: {
    width: 380,
    height: 250,
    borderRadius: 12,
  },
  breedText: {
    fontSize: 24,
    fontWeight: '700',
    color: '#000',
    marginLeft: 20,
    marginBottom: 8,
  },
  summaryText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#0081D5',
    marginLeft: 20,
  },
  divider: {
    width: 350,
    height: 1,
    backgroundColor: '#E4E4E4',
    alignSelf: 'center',
    marginVertical: 20,
  },
  loadingText: {
    textAlign: 'center',
    color: '#7B7C7D',
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 10,
  },
  errorText: {
    textAlign: 'center',
    color: '#D14343',
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 10,
  },
  detailsSection: {
    paddingHorizontal: 20,
  },
  detailRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  detailLabel: {
    color: '#7B7C7D',
    fontSize: 16,
    fontWeight: '500',
    width: 80,
  },
  detailValue: {
    color: '#3C4144',
    fontSize: 16,
    fontWeight: '500',
    flex: 1,
    marginLeft: 16,
  },
  buttonContainer: {
    marginTop: 50,
    alignItems: 'center',
  },
});
