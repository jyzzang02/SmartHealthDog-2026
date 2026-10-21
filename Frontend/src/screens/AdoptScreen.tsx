import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { 
  View, 
  Text, 
  TouchableOpacity, 
  StyleSheet, 
  Image, 
  Modal, 
  ScrollView,
  Animated,
  PanResponder,
  Dimensions,
  Alert,
  Clipboard,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../App';
import Header from '../components/Header';
import DropdownButton from '../components/DropdownButton';
import CustomButton from '../components/CustomButton';
import { openNaverHospital as openNaverMap } from '../utils/openNaverHospital';
import ShelterNearbyMap from '../components/ShelterNearbyMap';
import { useNearbyShelters } from '../hooks/useNearbyShelters';
import {
  searchAllShelters,
  getShelterDetail,
  getShelterPets,
  PetDetail,
  ShelterListItem,
  ShelterSearchParams,
} from '../api/shelters';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

type TabType = '보호소 소개' | '입양 홍보';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const INITIAL_BOTTOM_SHEET_HEIGHT = SCREEN_HEIGHT - 210;
const MAX_BOTTOM_SHEET_HEIGHT = SCREEN_HEIGHT - 100;

interface ShelterInfo {
  shelterId?: number;
  name: string;
  rating: number | null;
  distanceM?: number;
  address: string;
  phone: string;
  openStatus: string;
  openHours: string;
}

interface AnimalInfo {
  id: number;
  shelterId: number;
  shelterName?: string;
  shelterPhone?: string;
  name: string;
  type: '강아지' | '고양이';
  tags: string[];
  breed: string;
  age: string;
  location: string;
  image: any;
}

// 지역/군구 선택 목록
const REGIONS = [
  '서울특별시',
  '경기도',
  '인천광역시',
  '부산광역시',
  '대구광역시',
];

const DISTRICTS: { [key: string]: string[] } = {
  '서울특별시': ['양천구', '강남구', '서초구', '구로구', '마포구'],
  '경기도': ['성남시', '용인시', '수원시', '파주시', '고양시', '안성시'],
  '인천광역시': ['미추홀구', '연수구', '부평구'],
  '부산광역시': ['해운대구', '부산진구'],
  '대구광역시': ['수성구', '달서구'],
};

// 반려동물 타입 데이터
const PET_TYPES = ['모두', '강아지', '고양이'];


export default function AdoptScreen() {
  const navigation = useNavigation<NavigationProp>();
  const contentScrollRef = useRef<ScrollView>(null);
  const mapLaunching = useRef(false);
  const detailRequest = useRef<AbortController | null>(null);
  useEffect(() => () => detailRequest.current?.abort(), []);
  const [activeTab, setActiveTab] = useState<TabType>('보호소 소개');
  const [selectedRegion, setSelectedRegion] = useState<string>('');
  const [selectedDistrict, setSelectedDistrict] = useState<string>('');
  const [showRegionModal, setShowRegionModal] = useState(false);
  const [showDistrictModal, setShowDistrictModal] = useState(false);
  const [selectedPetType, setSelectedPetType] = useState<string>('모두');
  const [showPetTypeModal, setShowPetTypeModal] = useState(false);
  const [selectedShelter, setSelectedShelter] = useState<ShelterInfo | null>(null);
  const [shelters, setShelters] = useState<ShelterInfo[]>([]);
  const [isShelterLoading, setIsShelterLoading] = useState(false);
  const [shelterError, setShelterError] = useState<string | null>(null);
  const [showAllShelters, setShowAllShelters] = useState(false);
  const [shelterSearchVersion, setShelterSearchVersion] = useState(0);
  const [adoptPets, setAdoptPets] = useState<AnimalInfo[]>([]);
  const [isAdoptLoading, setIsAdoptLoading] = useState(false);
  const [adoptError, setAdoptError] = useState<string | null>(null);
  const [showBottomSheet, setShowBottomSheet] = useState(false);
  const nearby = useNearbyShelters();
  
  const bottomSheetY = useRef(new Animated.Value(SCREEN_HEIGHT)).current;

  // 화면이 포커스될 때마다 선택 내용 초기화
  useFocusEffect(
    useCallback(() => {
      setSelectedRegion('');
      setSelectedDistrict('');
      setSelectedPetType('모두');
    }, [])
  );

  const mapSpeciesToType = useCallback((species?: string): '강아지' | '고양이' => {
    if (!species) return '강아지';
    const normalized = species.toLowerCase();
    if (normalized.includes('cat') || normalized.includes('고양이')) return '고양이';
    return '강아지';
  }, []);

  const mapPetTags = useCallback((pet: PetDetail): string[] => {
    const tags: string[] = [];
    if (pet.adoption_status) tags.push(pet.adoption_status);
    if (pet.gender) tags.push(pet.gender);
    if (pet.is_neutered !== undefined) tags.push(pet.is_neutered ? '중성화 O' : '중성화 X');
    return tags.length > 0 ? tags : ['공고중'];
  }, []);

  const mapPetToAnimalInfo = useCallback(
    (pet: PetDetail, shelterName?: string, shelterPhone?: string): AnimalInfo => {
      const imageSource = pet.images?.[0]
        ? { uri: pet.images[0] }
        : require('../assets/adopt_placeholder.png');

      return {
        id: pet.pet_id,
        shelterId: pet.shelter_id,
        shelterName,
        shelterPhone,
        name: pet.name || '이름 없음',
        type: mapSpeciesToType(pet.species),
        tags: mapPetTags(pet),
        breed: pet.breed || pet.species || '',
        age: pet.age || '',
        location: pet.shelter_contact?.address || '',
        image: imageSource,
      };
    },
    [mapPetTags, mapSpeciesToType]
  );

  const mapToShelterInfo = useCallback(
    (item: ShelterListItem): ShelterInfo => {
      const isOpen = item.open_now === true;
      const isClosed = item.open_now === false;

      return {
        shelterId: item.shelter_id,
        name: item.name,
        rating: typeof item.rating === 'number' && Number.isFinite(item.rating) ? item.rating : null,
        distanceM: typeof item.distance_m === 'number' && Number.isFinite(item.distance_m)
          && item.distance_m >= 0 ? item.distance_m : undefined,
        address: item.address,
        phone: item.phone_number ?? '',
        openStatus: isOpen ? '영업중' : isClosed ? '영업종료' : '정보없음',
        openHours: '운영시간 정보 없음',
      };
    },
    []
  );

  useEffect(() => {
    let isActive = true;
    const controller = new AbortController();
    if (!selectedRegion && !showAllShelters) {
      setShelters([]);
      setShelterError(null);
      setIsShelterLoading(false);
      return;
    }

    const params: ShelterSearchParams = {
      province: selectedRegion || undefined,
      district: selectedRegion ? selectedDistrict || undefined : undefined,
      // Region membership comes from province/district; GPS is only a distance origin.
      ...(nearby.center ? {
        lat: nearby.center.lat,
        lng: nearby.center.lng,
        sort_by: 'distance' as const,
      } : {}),
      limit: 1000, offset: 0,
    };

    const fetchShelters = async () => {
      setIsShelterLoading(true);
      setShelterError(null);
      setShelters([]);
      try {
        const response = await searchAllShelters(params, controller.signal);
        if (isActive) setShelters(response.items.map(mapToShelterInfo));
      } catch (error) {
        if (!isActive) return;
        const fallback = showAllShelters ? '전체 보호소 정보를 불러오지 못했습니다.' : '보호소 정보를 불러오지 못했습니다.';
        setShelterError(error instanceof Error ? error.message : fallback);
        setShelters([]);
      } finally {
        if (isActive) setIsShelterLoading(false);
      }
    };

    fetchShelters();
    // Ignore results after filters change, reset, or unmount.
    return () => { isActive = false; controller.abort(); };
  }, [nearby.center, mapToShelterInfo, selectedDistrict, selectedRegion, showAllShelters, shelterSearchVersion]);

  useEffect(() => {
    if (activeTab !== '입양 홍보') return;
    let active = true;
    const controller = new AbortController();
    const fetchAdoptPets = async () => {

      const shelterSources = shelters.filter((shelter) => shelter.shelterId !== undefined);
      if (shelterSources.length === 0) {
        setAdoptPets([]);
        setAdoptError(null);
        setIsAdoptLoading(false);
        return;
      }

      setIsAdoptLoading(true);
      setAdoptError(null);
      try {
        const petResults = await Promise.all(
          shelterSources.map(async (shelter) => {
            const response = await getShelterPets(shelter.shelterId as number, {
              limit: 20,
              offset: 0,
            }, controller.signal);
            const animals = response.items.map((pet) =>
              mapPetToAnimalInfo(pet, shelter.name, shelter.phone)
            );
            return animals;
          })
        );
        if (active) setAdoptPets(petResults.flat());
      } catch (error) {
        if (!active) return;
        const message =
          error instanceof Error ? error.message : '입양 동물 정보를 불러오지 못했습니다.';

        setAdoptError(message);
        setAdoptPets([]);
      } finally {
        if (active) setIsAdoptLoading(false);
      }
    };
    fetchAdoptPets();
    return () => { active = false; controller.abort(); };
  }, [activeTab, shelters, mapPetToAnimalInfo]);

  // 바텀시트 열기
  const openBottomSheet = async (shelter: ShelterInfo) => {
    detailRequest.current?.abort();
    const controller = new AbortController();
    detailRequest.current = controller;
    setSelectedShelter(shelter);
    setShowBottomSheet(true);
    bottomSheetY.setValue(SCREEN_HEIGHT);
    Animated.spring(bottomSheetY, {
      toValue: SCREEN_HEIGHT - INITIAL_BOTTOM_SHEET_HEIGHT,
      useNativeDriver: false,
      tension: 50,
    }).start();

    if (!shelter.shelterId) return;
    try {
      const detail = await getShelterDetail(shelter.shelterId, controller.signal);
      if (controller.signal.aborted) return;
      setSelectedShelter((prev) => {
        if (!prev || prev.shelterId !== shelter.shelterId) return prev;
        return {
          ...prev,
          name: detail.name || prev.name,
          address: detail.address || prev.address,
          phone: detail.phone_number || prev.phone,
          openHours: detail.operating_hours || prev.openHours,
        };
      });
    } catch {
      return;
    }
  };

  // 바텀시트 닫기
  const closeBottomSheet = () => {
    detailRequest.current?.abort();
    Animated.timing(bottomSheetY, {
      toValue: SCREEN_HEIGHT,
      duration: 300,
      useNativeDriver: false,
    }).start(() => {
      setShowBottomSheet(false);
      setSelectedShelter(null);
    });
  };

  // 바텀시트 드래그 핸들러
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return Math.abs(gestureState.dy) > 5;
      },
      onPanResponderMove: (_, gestureState) => {
        const newY = SCREEN_HEIGHT - INITIAL_BOTTOM_SHEET_HEIGHT + gestureState.dy;
        const minY = SCREEN_HEIGHT - MAX_BOTTOM_SHEET_HEIGHT;
        const maxY = SCREEN_HEIGHT - INITIAL_BOTTOM_SHEET_HEIGHT;
        
        if (newY >= minY && newY <= maxY) {
          bottomSheetY.setValue(newY);
        } else if (newY > maxY) {
          bottomSheetY.setValue(newY);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        // 아래로 드래그 - 닫기
        if (gestureState.dy > 100) {
          closeBottomSheet();
        }
        // 위로 드래그 - 전체 화면
        else if (gestureState.dy < -50) {
          Animated.spring(bottomSheetY, {
            toValue: SCREEN_HEIGHT - MAX_BOTTOM_SHEET_HEIGHT,
            useNativeDriver: false,
            tension: 50,
          }).start();
        }
        // 원래 위치로
        else {
          Animated.spring(bottomSheetY, {
            toValue: SCREEN_HEIGHT - INITIAL_BOTTOM_SHEET_HEIGHT,
            useNativeDriver: false,
            tension: 50,
          }).start();
        }
      },
    })
  ).current;

  // 전화번호 복사
  const copyPhoneNumber = () => {
    if (selectedShelter?.phone) {
      Clipboard.setString(selectedShelter.phone);
      Alert.alert('보호소 전화번호가 복사되었습니다.');
    }
  };

  const openShelterMap = async (shelter: ShelterInfo) => {
    if (mapLaunching.current) return;
    mapLaunching.current = true;
    try { await openNaverMap({ name: shelter.name, address: shelter.address }, { includeRegion: true }); }
    catch { Alert.alert('연결 실패', '연결할 수 없습니다. 다시 시도해 주세요.'); }
    finally { mapLaunching.current = false; }
  };

  const handleResetFilters = useCallback(() => {
    setSelectedRegion('');
    setSelectedDistrict('');
    setShowAllShelters(false);
    setShelters([]);
  }, []);

  const handleTabChange = useCallback((tab: TabType) => {
    setActiveTab(tab);
    contentScrollRef.current?.scrollTo({ y: 0, animated: false });
  }, []);

  const filteredAnimals = useMemo(() => {
    const list =
      selectedPetType === '모두'
        ? adoptPets
        : adoptPets.filter((animal) => animal.type === selectedPetType);
    return list;
  }, [adoptPets, selectedPetType]);

  return (
    <View style={styles.container}>
      {/* 헤더 */}
      <Header />

      {/* 탭 메뉴 */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={styles.tabItem}
          onPress={() => handleTabChange('보호소 소개')}
        >
          <Text
            style={[
              styles.tabText,
              activeTab === '보호소 소개' ? styles.tabTextActive : styles.tabTextInactive,
            ]}
          >
            보호소 소개
          </Text>
          <View
            style={[
              styles.tabIndicator,
              activeTab === '보호소 소개' ? styles.tabIndicatorActive : styles.tabIndicatorInactive,
            ]}
          />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.tabItem}
          onPress={() => handleTabChange('입양 홍보')}
        >
          <Text
            style={[
              styles.tabText,
              activeTab === '입양 홍보' ? styles.tabTextActive : styles.tabTextInactive,
            ]}
          >
            입양 홍보
          </Text>
          <View
            style={[
              styles.tabIndicator,
              activeTab === '입양 홍보' ? styles.tabIndicatorActive : styles.tabIndicatorInactive,
            ]}
          />
        </TouchableOpacity>
      </View>

      {/* 탭 내용 */}
      <ScrollView
        style={styles.contentContainer}
        ref={contentScrollRef}
      >
        {activeTab === '보호소 소개' ? (
          <View style={styles.shelterContent}>
            {/* 하위 메뉴 1: 나와 가까운 보호소 */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>나와 가까운 보호소</Text>
              <ShelterNearbyMap
                center={nearby.center}
                shelters={nearby.shelters}
                loading={nearby.loading}
                error={nearby.error}
                onRetry={nearby.retry}
                onSelect={shelter => openBottomSheet(mapToShelterInfo(shelter))}
              />
            </View>

            {/* 하위 메뉴 2: 지역구별 검색 */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>지역구별 검색</Text>
              <View style={styles.searchButtonsContainer}>
                <View style={styles.dropdownGroup}>
                  {/* 지역 버튼 */}
                  <DropdownButton
                    label={selectedRegion || '지역'}
                    onPress={() => setShowRegionModal(true)}
                    style={StyleSheet.flatten([
                      styles.filterDropdown,
                      selectedRegion && styles.filterDropdownSelected,
                    ])}
                    labelStyle={styles.filterDropdownLabel}
                    numberOfLines={1}
                  />

                  {/* 군/구 버튼 */}
                  <DropdownButton
                    label={selectedDistrict || '군/구'}
                    onPress={() => {
                      if (selectedRegion) {
                        setShowDistrictModal(true);
                      }
                    }}
                    disabled={!selectedRegion}
                    style={StyleSheet.flatten([
                      styles.filterDropdown,
                      selectedDistrict && styles.filterDropdownSelected,
                    ])}
                    labelStyle={styles.filterDropdownLabel}
                    numberOfLines={1}
                  />
                </View>

                <View style={styles.searchActions}>
                  {/* 전체 보호소 버튼 */}
                  <TouchableOpacity
                    style={[styles.allButton, showAllShelters ? styles.allButtonActive : null]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: showAllShelters }}
                    onPress={() => {
                      setSelectedRegion('');
                      setSelectedDistrict('');
                      setShowRegionModal(false);
                      setShowDistrictModal(false);
                      setShowAllShelters(true);
                      setShelterSearchVersion(version => version + 1);
                    }}
                  >
                    <Text style={[styles.allButtonText, showAllShelters ? styles.allButtonTextActive : null]}>전체 보호소</Text>
                  </TouchableOpacity>

                  {/* 재검색 버튼 */}
                  <TouchableOpacity
                    style={styles.refreshButton}
                    onPress={handleResetFilters}
                  >
                    <Text style={styles.refreshButtonText}>초기화</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* 보호소 카드 리스트 */}
              <View style={styles.shelterListContainer}>
                {isShelterLoading ? (
                  <Text style={styles.emptyText}>보호소 정보를 불러오는 중...</Text>
                ) : shelterError ? (
                  <Text style={styles.emptyText}>{shelterError}</Text>
                ) : shelters.length === 0 ? (
                  <Text style={styles.emptyText}>선택한 조건에 맞는 보호소가 없어요.</Text>
                ) : (
                  shelters.map((shelter) => (
                    <TouchableOpacity key={shelter.shelterId ?? shelter.name} style={styles.shelterCard}
                      activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={`${shelter.name} 정보 보기`}
                      onPress={() => openBottomSheet(shelter)}>
                      {/* 기관 정보 */}
                      <View style={styles.shelterInfo}>
                        {/* 이름 */}
                        <Text style={styles.shelterName}>{shelter.name}</Text>

                        {/* 별점 */}
                        {shelter.rating !== null && (
                          <View style={styles.ratingContainer}>
                            <Image
                              source={require('../assets/icon_rating.png')}
                              style={styles.ratingIcon}
                            />
                            <Text style={styles.ratingText}>{shelter.rating.toFixed(1)}</Text>
                          </View>
                        )}

                        {/* 주소 */}
                        <Text style={styles.shelterAddress}>{shelter.address}</Text>

                        {/* 전화번호 */}
                        <View style={styles.phoneContainer}>
                          <Image
                            source={require('../assets/icon_phoneNum.png')}
                            style={styles.phoneIcon}
                          />
                          <Text style={styles.phoneText}>{shelter.phone}</Text>
                        </View>
                      </View>
                    </TouchableOpacity>
                  ))
                )}
              </View>
            </View>
          </View>
        ) : (
          <View style={styles.adoptContent}>
            <View style={styles.adoptFilterContainer}>
              <DropdownButton
                label={selectedPetType}
                onPress={() => setShowPetTypeModal(true)}
              />
            </View>

            {/* 동물 카드 리스트 */}
            <View style={styles.animalListContainer}>
                {isAdoptLoading ? (
                  <Text style={styles.emptyText}>입양 동물 정보를 불러오는 중...</Text>
                ) : adoptError ? (
                  <Text style={styles.emptyText}>{adoptError}</Text>
                ) : filteredAnimals.length === 0 ? (
                  <Text style={styles.emptyText}>입양 홍보 동물이 없어요.</Text>
                ) : (
                  filteredAnimals.map((animal) => (
                    <TouchableOpacity
                      key={animal.id}
                      style={styles.animalCard}
                      onPress={() => navigation.navigate('AnimalDetail', { animalData: animal })}
                      activeOpacity={0.7}
                    >
                      {/* 동물 사진 */}
                      <Image
                        source={animal.image}
                        style={styles.animalImage}
                      />

                      {/* 동물 정보 */}
                      <View style={styles.animalInfo}>
                        {/* 동물 태그 */}
                        <View style={styles.tagsContainer}>
                          {animal.tags.map((tag, tagIndex) => (
                            <View key={tagIndex} style={styles.tag}>
                              <Text style={styles.tagText}>{tag}</Text>
                            </View>
                          ))}
                        </View>

                        {/* 품종, 나이, 구조장소 */}
                        <View style={styles.detailsContainer}>
                          <View style={styles.detailRow}>
                            <Text style={styles.detailLabel}>품종</Text>
                            <Text style={styles.detailValue}>{animal.breed}</Text>
                          </View>
                          <View style={styles.detailRow}>
                            <Text style={styles.detailLabel}>나이</Text>
                            <Text style={styles.detailValue}>{animal.age}</Text>
                          </View>
                          <View style={styles.detailRow}>
                            <Text style={styles.detailLabel}>구조장소</Text>
                            <Text style={styles.detailValue}>{animal.location}</Text>
                          </View>
                        </View>
                      </View>
                    </TouchableOpacity>
                  ))
                )}
            </View>
          </View>
        )}
      </ScrollView>

      {/* 지역 선택 모달 */}
      <Modal
        visible={showRegionModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowRegionModal(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowRegionModal(false)}
        >
          <View style={styles.modalContent}>
            <ScrollView>
              {REGIONS.map((region) => (
                <TouchableOpacity
                  key={region}
                  style={styles.modalItem}
                  onPress={() => {
                    setSelectedRegion(region);
                    setSelectedDistrict(''); // 지역 변경시 군/구 초기화
                    setShowRegionModal(false);
                    setShowAllShelters(false);
                  }}
                >
                  <Text style={styles.modalItemText}>{region}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* 군/구 선택 모달 */}
      <Modal
        visible={showDistrictModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowDistrictModal(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowDistrictModal(false)}
        >
          <View style={styles.modalContent}>
            <ScrollView>
              {selectedRegion &&
                DISTRICTS[selectedRegion]?.map((district) => (
                  <TouchableOpacity
                    key={district}
                    style={styles.modalItem}
                    onPress={() => {
                      setSelectedDistrict(district);
                      setShowDistrictModal(false);
                      setShowAllShelters(false);
                    }}
                  >
                    <Text style={styles.modalItemText}>{district}</Text>
                  </TouchableOpacity>
                ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* 반려동물 타입 선택 모달 */}
      <Modal
        visible={showPetTypeModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowPetTypeModal(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowPetTypeModal(false)}
        >
          <View style={styles.modalContent}>
            <ScrollView>
              {PET_TYPES.map((petType) => (
                <TouchableOpacity
                  key={petType}
                  style={styles.modalItem}
                  onPress={() => {
                    setSelectedPetType(petType);
                    setShowPetTypeModal(false);
                  }}
                >
                  <Text style={styles.modalItemText}>{petType}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* 보호소 정보 바텀시트 */}
      <Modal
        visible={showBottomSheet}
        transparent={true}
        animationType="none"
        onRequestClose={closeBottomSheet}
      >
        <View style={styles.bottomSheetOverlay}>
          <TouchableOpacity
            style={styles.bottomSheetBackground}
            activeOpacity={1}
            onPress={closeBottomSheet}
          />
          <Animated.View
            style={[
              styles.bottomSheetContainer,
              {
                transform: [{ translateY: bottomSheetY }],
              },
            ]}
          >
            {/* 드래그 핸들 영역 */}
            <View {...panResponder.panHandlers} style={styles.dragHandleArea}>
              <View style={styles.dragHandle} />
            </View>

            <ScrollView 
              style={styles.bottomSheetContent}
              showsVerticalScrollIndicator={false}
            >
              {selectedShelter && (
                <>
                  {/* 기관 이름 */}
                  <Text style={styles.bottomSheetName}>{selectedShelter.name}</Text>
                  <View style={styles.detailMapRow}>
                    {selectedShelter.distanceM !== undefined ? (
                      <Text style={styles.nearbyDistance}>직선거리 {selectedShelter.distanceM >= 1000
                        ? `${(selectedShelter.distanceM / 1000).toFixed(1)}km`
                        : `${Math.round(selectedShelter.distanceM)}m`}</Text>
                    ) : <View style={styles.detailMapSpacer} />}
                    <TouchableOpacity style={styles.detailMapButton} activeOpacity={0.8}
                      accessibilityRole="link" accessibilityLabel={`${selectedShelter.name} 네이버 지도에서 보기`}
                      onPress={() => { openShelterMap(selectedShelter); }}>
                      <Image source={require('../assets/naver_map_icon.png')} style={styles.detailMapIcon}
                        resizeMode="contain" accessible={false} />
                      <Text style={styles.detailMapText}>네이버 지도에서 보기</Text>
                    </TouchableOpacity>
                  </View>

                  {/* 별점 */}
                  {selectedShelter.rating !== null && (
                    <View style={styles.bottomSheetRating}>
                      <Image
                        source={require('../assets/icon_rating.png')}
                        style={styles.ratingIcon}
                      />
                      <Text style={styles.ratingText}>{selectedShelter.rating.toFixed(1)}</Text>
                    </View>
                  )}

                  {/* 구분선 */}
                  <View style={styles.divider} />

                  {/* 영업시간 */}
                  <View style={styles.infoRow}>
                    <Image
                      source={require('../assets/icon_openTime.png')}
                      style={styles.infoIcon}
                    />
                  <View style={styles.infoTextContainer}>
                    <Text style={styles.infoTextHighlight}>{selectedShelter.openStatus}</Text>
                    <Text style={styles.infoText}>{selectedShelter.openHours}</Text>
                  </View>
                  </View>

                  {/* 주소 */}
                  <View style={styles.infoRow}>
                    <Image
                      source={require('../assets/icon_addressInfo.png')}
                      style={styles.infoIcon}
                    />
                    <Text style={styles.infoText}>{selectedShelter.address}</Text>
                  </View>

                  {/* 전화번호 */}
                  <View style={styles.infoRow}>
                    <Image
                      source={require('../assets/icon_phoneNum.png')}
                      style={styles.infoIcon}
                    />
                    <Text style={styles.infoText}>{selectedShelter.phone}</Text>
                  </View>

                  {/* 전화하기 버튼 */}
                  <View style={styles.bottomSheetButtonContainer}>
                    <CustomButton
                      text="전화하기"
                      backgroundColor="#FFC94D"
                      textColor="#FFFFFF"
                      onPress={copyPhoneNumber}
                      disabled={!selectedShelter.phone}
                      width={350}
                    />
                  </View>
                </>
              )}
            </ScrollView>
          </Animated.View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    width: 250,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 16,
  },
  tabText: {
    fontSize: 20,
    marginBottom: 12,
  },
  tabTextActive: {
    fontWeight: '700',
    color: '#1F2024',
  },
  tabTextInactive: {
    fontWeight: '600',
    color: '#71727A',
  },
  tabIndicator: {
    width: '100%',
    height: 2,
  },
  tabIndicatorActive: {
    backgroundColor: '#0081D5',
  },
  tabIndicatorInactive: {
    backgroundColor: '#EAECEE',
  },
  contentContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  shelterContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  section: {
    marginBottom: 30,
  },
  sectionTitle: {
    color: '#000',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 10,
  },
  searchButtonsContainer: {
    width: '100%',
    gap: 10,
  },
  dropdownGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  filterDropdown: {
    flex: 1,
    minWidth: 0,
    minHeight: 42,
    paddingHorizontal: 12,
  },
  filterDropdownSelected: {
    borderColor: '#F4B844',
    backgroundColor: '#FFF6D8',
  },
  filterDropdownLabel: {
    flexShrink: 1,
  },
  searchActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  refreshButton: {
    flexDirection: 'row',
    minHeight: 42,
    borderWidth: 1,
    borderColor: '#D7D7D7',
    paddingVertical: 8,
    paddingHorizontal: 16,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 30,
    backgroundColor: '#FFFFFF',
  },
  refreshButtonText: {
    color: '#71727A',
    fontSize: 14,
    fontWeight: '500',
  },
  allButton: {
    flex: 1,
    minWidth: 0,
    minHeight: 42,
    borderWidth: 1,
    borderColor: '#F4B844',
    flexDirection: 'row',
    paddingVertical: 8,
    paddingHorizontal: 14,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 30,
    backgroundColor: '#FFF6D8',
  },
  allButtonActive: {
    backgroundColor: '#FFC94D',
    borderColor: '#FFC94D',
  },
  allButtonText: {
    color: '#1F2024',
    fontSize: 14,
    fontWeight: '500',
  },
  allButtonTextActive: {
    color: '#FFFFFF',
  },
  adoptContent: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  adoptFilterContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    marginBottom: 20,
  },
  placeholderText: {
    fontSize: 16,
    color: '#71727A',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    width: '80%',
    maxHeight: '70%',
    padding: 10,
  },
  modalItem: {
    paddingVertical: 15,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#EAECEE',
  },
  modalItemText: {
    fontSize: 16,
    color: '#1F2024',
  },
  shelterListContainer: {
    marginTop: 20,
    alignItems: 'center',
    paddingBottom: 120,
  },
  emptyText: {
    color: '#7B7C7D',
    fontSize: 14,
    fontWeight: '500',
    marginTop: 8,
    textAlign: 'center',
  },
  shelterCard: {
    width: '100%',
    flexDirection: 'row',
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#EAECEE',
    alignItems: 'center',
  },
  shelterInfo: {
    flex: 1,
    justifyContent: 'space-between',
  },
  shelterName: {
    color: '#000',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 6,
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  ratingIcon: {
    width: 16,
    height: 16,
  },
  ratingText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '700',
    marginLeft: 5,
  },
  shelterAddress: {
    color: '#7B7C7D',
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 6,
  },
  phoneContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    backgroundColor: '#EEF7FD',
    alignSelf: 'flex-start',
  },
  phoneIcon: {
    width: 14,
    height: 14,
  },
  phoneText: {
    color: '#7B7C7D',
    fontSize: 14,
    fontWeight: '500',
    marginLeft: 5,
  },
  bottomSheetOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  bottomSheetBackground: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.30)',
  },
  bottomSheetContainer: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    minHeight: INITIAL_BOTTOM_SHEET_HEIGHT,
    maxHeight: MAX_BOTTOM_SHEET_HEIGHT,
  },
  dragHandleArea: {
    width: '100%',
    height: 44,
    alignItems: 'center',
    paddingTop: 20,
  },
  dragHandle: {
    width: 40,
    height: 4,
    backgroundColor: '#B3B6B8',
    borderRadius: 2,
  },
  bottomSheetContent: {
    paddingHorizontal: 20,
  },
  bottomSheetName: {
    fontSize: 24,
    fontWeight: '700',
    color: '#000',
    marginBottom: 10,
  },
  detailMapRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  detailMapSpacer: { flex: 1 },
  detailMapButton: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8,
    paddingVertical: 6, minHeight: 32, borderRadius: 16, backgroundColor: '#EEF7FD' },
  detailMapIcon: { width: 16, height: 16 },
  detailMapText: { fontSize: 12, fontWeight: '600', color: '#0081D5' },
  nearbyDistance: {
    flex: 1,
    color: '#0081D5',
    fontSize: 14,
  },
  bottomSheetRating: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  divider: {
    width: 350,
    height: 1,
    backgroundColor: '#E4E4E4',
    marginVertical: 20,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  infoIcon: {
    width: 16,
    height: 16,
    marginRight: 8,
  },
  infoTextContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  infoText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '500',
  },
  infoTextHighlight: {
    color: '#0081D5',
    fontSize: 16,
    fontWeight: '700',
    marginRight: 8,
  },
  bottomSheetButtonContainer: {
    marginTop: 20,
    marginBottom: 40,
    alignItems: 'center',
  },
  animalListContainer: {
    alignItems: 'center',
    paddingBottom: 120,
  },
  animalCard: {
    width: 350,
    flexDirection: 'row',
    paddingVertical: 16,
    alignItems: 'center',
  },
  animalImage: {
    width: 100,
    height: 100,
    borderRadius: 20,
  },
  animalInfo: {
    marginLeft: 18,
    flex: 1,
    justifyContent: 'space-between',
  },
  tagsContainer: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 32,
    borderWidth: 1,
    borderColor: '#E7F1FF',
    backgroundColor: '#F2FBFA',
    marginRight: 4,
  },
  tagText: {
    color: '#0081D5',
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 16,
  },
  detailsContainer: {
    gap: 4,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  detailLabel: {
    width: 50,
    color: '#7B7C7D',
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'left',
  },
  detailValue: {
    marginLeft: 16,
    color: '#7B7C7D',
    fontSize: 12,
    fontWeight: '500',
  },
});
