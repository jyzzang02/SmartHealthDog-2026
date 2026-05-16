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
  PermissionsAndroid,
  Platform,
  Easing,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../App';
import Header from '../components/Header';
import DropdownButton from '../components/DropdownButton';
import CustomButton from '../components/CustomButton';
import WebView from 'react-native-webview';
import Geolocation from 'react-native-geolocation-service';
import {
  searchShelters,
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
const KAKAO_APP_KEY = 'e65e93f752b1590bf9b8be83566dd5b6';

interface ShelterInfo {
  shelterId?: number;
  name: string;
  rating: number;
  address: string;
  phone: string;
  image: any;
  region: string;
  district: string;
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

// 지역/군구 더미데이터 (HealthScreen과 동일하게 유지)
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

// 지역별 좌표 매핑 (지역명 location 검색이 작동하지 않을 경우 lat/lng 기반 검색 사용)
const LOCATION_COORDS: { [key: string]: { [key: string]: { lat: number; lng: number } } } = {
  '서울특별시': {
    '양천구': { lat: 37.5173, lng: 126.8553 },
    '강남구': { lat: 37.4979, lng: 127.0276 },
    '서초구': { lat: 37.4830, lng: 127.0326 },
    '구로구': { lat: 37.4954, lng: 126.8874 },
    '마포구': { lat: 37.5630, lng: 126.9018 },
  },
  '경기도': {
    '성남시': { lat: 37.4392, lng: 127.1068 },
    '용인시': { lat: 37.2397, lng: 127.1705 },
    '수원시': { lat: 37.2636, lng: 127.0086 },
    '파주시': { lat: 37.7561, lng: 126.7676 },
    '고양시': { lat: 37.6582, lng: 126.8224 },
    '안성시': { lat: 37.0086, lng: 127.2705 },
  },
  '인천광역시': {
    '미추홀구': { lat: 37.3881, lng: 126.6623 },
    '연수구': { lat: 37.4038, lng: 126.7200 },
    '부평구': { lat: 37.4891, lng: 126.7236 },
  },
  '부산광역시': {
    '해운대구': { lat: 35.1595, lng: 129.1607 },
    '부산진구': { lat: 35.1596, lng: 129.0544 },
  },
  '대구광역시': {
    '수성구': { lat: 35.8544, lng: 128.6151 },
    '달서구': { lat: 35.8242, lng: 128.5362 },
  },
};

export default function AdoptScreen() {
  const navigation = useNavigation<NavigationProp>();
  const contentScrollRef = useRef<ScrollView>(null);
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
  const [adoptPets, setAdoptPets] = useState<AnimalInfo[]>([]);
  const [isAdoptLoading, setIsAdoptLoading] = useState(false);
  const [adoptError, setAdoptError] = useState<string | null>(null);
  const [showBottomSheet, setShowBottomSheet] = useState(false);
  const [currentLocation, setCurrentLocation] = useState<{ lat: number; lng: number }>({
    lat: 37.5665,
    lng: 126.9780,
  });
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const webViewRef = useRef<WebView>(null);
  const pulseAnim = useRef(new Animated.Value(0.6)).current;
  const isMountedRef = useRef(true);
  
  const bottomSheetY = useRef(new Animated.Value(SCREEN_HEIGHT)).current;

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // 화면이 포커스될 때마다 선택 내용 초기화
  useFocusEffect(
    useCallback(() => {
      setSelectedRegion('');
      setSelectedDistrict('');
      setSelectedPetType('모두');
      setShowAllShelters(false);
      setShelters([]);
    }, [])
  );

  // 안드로이드 위치 권한 요청 + 현재 위치 가져오기
  useEffect(() => {
    const requestLocationPermission = async () => {
      if (Platform.OS !== 'android') return;
      try {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          {
            title: '위치 권한 요청',
            message: '현재 위치를 표시하려면 위치 권한이 필요합니다.',
            buttonPositive: '확인',
          }
        );

        if (granted === PermissionsAndroid.RESULTS.GRANTED) {
          Geolocation.getCurrentPosition(
            (position: { coords: { latitude: number; longitude: number } }) => {
              if (!isMountedRef.current) return;

              setCurrentLocation({
                lat: position.coords.latitude,
                lng: position.coords.longitude,
              });
            },
            (error: unknown) => {
              console.log('위치 조회 실패', error);
            },
            {
              enableHighAccuracy: true,
              timeout: 10000,
              maximumAge: 30000,
              forceRequestLocation: true,
            }
          );
        }
      } catch (error) {
        console.log('위치 권한 요청 실패', error);
      }
    };

    requestLocationPermission();
  }, []);

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
      const [region, district] = (item.address || '').split(' ');
      const isOpen = item.open_now === true;
      const isClosed = item.open_now === false;

      return {
        shelterId: item.shelter_id,
        name: item.name,
        rating: item.rating ?? 0,
        address: item.address,
        phone: item.phone_number ?? '',
        image: require('../assets/adopt_placeholder.png'),
        region: region || selectedRegion || '',
        district: district || selectedDistrict || '',
        openStatus: isOpen ? '영업중' : isClosed ? '영업종료' : '정보없음',
        openHours: '운영시간 정보 없음',
      };
    },
    [selectedDistrict, selectedRegion]
  );

  const fetchShelters = useCallback(async () => {
    let params: ShelterSearchParams = {
      lat: currentLocation.lat,
      lng: currentLocation.lng,
      radius_km: 100,
      sort_by: 'distance' as const,
    };

    if (selectedDistrict && selectedRegion) {
      const districtCoords = LOCATION_COORDS[selectedRegion]?.[selectedDistrict];
      if (districtCoords) {
        params = {
          lat: districtCoords.lat,
          lng: districtCoords.lng,
          radius_km: 100,
          sort_by: 'distance',
        };
        console.log('[AdoptScreen] using district coords:', selectedDistrict, districtCoords);
      }
    } else if (selectedRegion) {
      const firstDistrict = DISTRICTS[selectedRegion]?.[0];
      const regionCoords = firstDistrict ? LOCATION_COORDS[selectedRegion]?.[firstDistrict] : null;
      if (regionCoords) {
        params = {
          lat: regionCoords.lat,
          lng: regionCoords.lng,
          radius_km: 100,
          sort_by: 'distance',
        };
        console.log('[AdoptScreen] using region coords:', selectedRegion, regionCoords);
      }
    }

    setIsShelterLoading(true);
    setShelterError(null);
    try {
      const response = await searchShelters(params);
      if (!isMountedRef.current) return;

      console.log('[AdoptScreen] fetchShelters response:', response);
      const mapped = (response.items || []).map(mapToShelterInfo);

      console.log('[AdoptScreen] mapped shelters count:', mapped.length);
      setShelters(mapped);
    } catch (error) {
      if (!isMountedRef.current) return;

      const message = error instanceof Error ? error.message : '보호소 정보를 불러오지 못했습니다.';
      console.log('[AdoptScreen] fetchShelters error:', message);

      setShelterError(message);
      setShelters([]);
    } finally {
      if (isMountedRef.current) {
        setIsShelterLoading(false);
      }
    }
  }, [currentLocation.lat, currentLocation.lng, mapToShelterInfo, selectedDistrict, selectedRegion]);

  const fetchAdoptPets = useCallback(async () => {
    if (activeTab !== '입양 홍보') return;

    const shelterSources = shelters.filter((shelter) => shelter.shelterId !== undefined);
    console.log('[AdoptScreen] fetchAdoptPets shelterSources:', shelterSources.length);
    if (shelterSources.length === 0) {
      setAdoptPets([]);
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
          });
          console.log(`[AdoptScreen] shelter ${shelter.shelterId} pets count:`, response.items.length);
          const animals = response.items.map((pet) =>
            mapPetToAnimalInfo(pet, shelter.name, shelter.phone)
          );
          return animals;
        })
      );
      const merged = petResults.flat();
      if (!isMountedRef.current) return;

      console.log('[AdoptScreen] total merged pets:', merged.length);
      setAdoptPets(merged);
    } catch (error) {
      if (!isMountedRef.current) return;

      const message =
        error instanceof Error ? error.message : '입양 동물 정보를 불러오지 못했습니다.';
      console.log('[AdoptScreen] fetchAdoptPets error:', message);

      setAdoptError(message);
      setAdoptPets([]);
    } finally {
      if (isMountedRef.current) {
        setIsAdoptLoading(false);
      }
    }
  }, [activeTab, shelters, mapPetToAnimalInfo]);

  useEffect(() => {
    if (showAllShelters) return;

    if (!selectedRegion && !selectedDistrict) {
      setShelters([]);
      return;
    }
    fetchShelters();
  }, [fetchShelters, selectedRegion, selectedDistrict, showAllShelters]);

  // 전체 보호소 버튼 동작: 서버에 전체 조회 API가 없을 수 있으니 큰 limit으로 시도
  const fetchAllShelters = useCallback(async () => {
    setIsShelterLoading(true);
    setShelterError(null);
    try {
      // Many shelter APIs require either a location name or lat/lng.
      // Calling with only limit may trigger server-side validation (INVALID_INPUT).
      // Use current location with a large radius to attempt a global fetch.
      const res = await searchShelters({
        lat: currentLocation.lat,
        lng: currentLocation.lng,
        radius_km: 1000,
        limit: 1000,
        offset: 0,
      });
      if (!isMountedRef.current) return;

      console.log('[AdoptScreen] fetchAllShelters response (lat/lng):', res);
      const mapped = (res.items || []).map(mapToShelterInfo);

      setShelters(mapped);
      setShowAllShelters(true);
    } catch (error) {
      if (!isMountedRef.current) return;

      const message = error instanceof Error ? error.message : '전체 보호소 정보를 불러오지 못했습니다.';
      console.log('[AdoptScreen] fetchAllShelters error:', message);
      setShelterError(message);
      setShelters([]);
    } finally {
      if (isMountedRef.current) {
        setIsShelterLoading(false);
      }
    }
  }, [currentLocation.lat, currentLocation.lng, mapToShelterInfo]);

  useEffect(() => {
    fetchAdoptPets();
  }, [fetchAdoptPets]);

  // 바텀시트 열기
  const openBottomSheet = async (shelter: ShelterInfo) => {
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
      const detail = await getShelterDetail(shelter.shelterId);
      if (!isMountedRef.current) return;

      setSelectedShelter((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          name: detail.name || prev.name,
          address: detail.address || prev.address,
          phone: detail.phone_number || prev.phone,
          openHours: detail.operating_hours || prev.openHours,
        };
      });
    } catch (error) {
      console.log('[shelters] detail load failed', error);
    }
  };

  // 바텀시트 닫기
  const closeBottomSheet = () => {
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

  useEffect(() => {
    setMapLoaded(false);
  }, [currentLocation.lat, currentLocation.lng]);

  const filteredShelters = useMemo(() => shelters, [shelters]);

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

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0.6,
          duration: 800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulseAnim]);

  const mapHtml = useMemo(
    () => `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="initial-scale=1, maximum-scale=1" />
          <style>
            html, body { margin: 0; padding: 0; width: 100%; height: 100%; background: #E9ECEF; }
            #map { width: 100%; height: 100%; }
          </style>
          <script src="https://dapi.kakao.com/v2/maps/sdk.js?appkey=${KAKAO_APP_KEY}&autoload=false"></script>
        </head>
        <body>
          <div id="map"></div>
          <script>
            (function() {
              kakao.maps.load(function() {
                var center = new kakao.maps.LatLng(${currentLocation.lat}, ${currentLocation.lng});
                var map = new kakao.maps.Map(document.getElementById('map'), {
                  center: center,
                  level: 3
                });
                new kakao.maps.Marker({
                  position: center,
                  map: map
                });
              });
            })();
          </script>
        </body>
      </html>
    `,
    [currentLocation.lat, currentLocation.lng]
  );

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
              <View style={styles.miniMapContainer}>
                <View style={styles.miniMapWrapper}>
                  <WebView
                    ref={webViewRef}
                    originWhitelist={['*']}
                    source={{ html: mapHtml, baseUrl: 'http://localhost' }}
                    style={styles.miniMap}
                    javaScriptEnabled
                    domStorageEnabled
                    scrollEnabled={false}
                    mixedContentMode="always"
                    cacheEnabled={false}
                    setSupportMultipleWindows={false}
                    thirdPartyCookiesEnabled
                    onLoadStart={() => {
                      setMapReady(false);
                      setMapLoaded(false);
                    }}
                    onLoadEnd={() => {
                      setMapReady(true);
                      setMapLoaded(true);
                    }}
                    onError={() => {
                      if (!mapReady) setMapLoaded(false);
                    }}
                    onHttpError={() => {
                      if (!mapReady) setMapLoaded(false);
                    }}
                    renderError={() => {
                      setMapLoaded(false);
                      return <View style={styles.miniMapFallback} />;
                    }}
                  />
                  {!mapLoaded && (
                    <Animated.View
                      pointerEvents="none"
                      style={[styles.mapSkeleton, { opacity: pulseAnim }]}
                    />
                  )}
                </View>
              </View>
            </View>

            {/* 하위 메뉴 2: 지역구별 검색 */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>지역구별 검색</Text>
              <ScrollView
                style={styles.searchButtonsScroll}
                contentContainerStyle={styles.searchButtonsContent}
                horizontal
                showsHorizontalScrollIndicator={false}
                scrollEventThrottle={16}
              >
                <View style={styles.dropdownGroup}>
                  {/* 지역 버튼 */}
                  <DropdownButton
                    label={selectedRegion || '지역'}
                    onPress={() => setShowRegionModal(true)}
                    style={styles.filterDropdownButton}
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
                    style={styles.filterDropdownButton}
                  />
                </View>

                {/* 전체 보호소 버튼 */}
                <TouchableOpacity
                  style={[styles.allButton, showAllShelters ? styles.allButtonActive : null]}
                  onPress={() => {
                    setSelectedRegion('');
                    setSelectedDistrict('');
                    setShowRegionModal(false);
                    setShowDistrictModal(false);
                    fetchAllShelters();
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
              </ScrollView>

              {/* 보호소 카드 리스트 */}
              <View style={styles.shelterListContainer}>
                {isShelterLoading ? (
                  <Text style={styles.emptyText}>보호소 정보를 불러오는 중...</Text>
                ) : shelterError ? (
                  <Text style={styles.emptyText}>{shelterError}</Text>
                ) : filteredShelters.length === 0 ? (
                  <Text style={styles.emptyText}>선택한 조건에 맞는 보호소가 없어요.</Text>
                ) : (
                  filteredShelters.map((shelter) => (
                    <TouchableOpacity 
                      key={shelter.shelterId ?? shelter.name}
                      style={styles.shelterCard}
                      onPress={() => openBottomSheet(shelter)}
                      activeOpacity={0.7}
                    >
                      {/* 기관 사진 */}
                      <Image
                        source={shelter.image}
                        style={styles.shelterImage}
                      />

                      {/* 기관 정보 */}
                      <View style={styles.shelterInfo}>
                        {/* 이름 */}
                        <Text style={styles.shelterName}>{shelter.name}</Text>

                        {/* 별점 */}
                        <View style={styles.ratingContainer}>
                          <Image
                            source={require('../assets/icon_rating.png')}
                            style={styles.ratingIcon}
                          />
                          <Text style={styles.ratingText}>{shelter.rating.toFixed(1)}</Text>
                        </View>

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
                  {/* 보호소 이미지 */}
                  <View style={styles.bottomSheetImageContainer}>
                    <Image
                      source={selectedShelter.image}
                      style={styles.bottomSheetImage}
                    />
                  </View>

                  {/* 기관 이름 */}
                  <Text style={styles.bottomSheetName}>{selectedShelter.name}</Text>

                  {/* 별점 */}
                  <View style={styles.bottomSheetRating}>
                    <Image
                      source={require('../assets/icon_rating.png')}
                      style={styles.ratingIcon}
                    />
                    <Text style={styles.ratingText}>{selectedShelter.rating.toFixed(1)}</Text>
                  </View>

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
  miniMapContainer: {
    width: 350,
    height: 180,
    borderWidth: 1,
    borderColor: '#D0D0D0',
    borderRadius: 4,
    alignSelf: 'center',
    overflow: 'hidden',
  },
  miniMapWrapper: {
    flex: 1,
    position: 'relative',
  },
  miniMap: {
    flex: 1,
  },
  miniMapFallback: {
    flex: 1,
    backgroundColor: '#E9ECEF',
  },
  mapSkeleton: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#E9ECEF',
  },
  searchButtonsScroll: {
    width: '100%',
  },
  searchButtonsContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 20,
  },
  dropdownGroup: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  filterDropdownButton: {
    marginRight: 12,
  },
  refreshButton: {
    flexDirection: 'row',
    paddingVertical: 8,
    paddingHorizontal: 16,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 30,
    backgroundColor: '#0081D5',
  },
  refreshButtonText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '500',
  },
  allButton: {
    flexDirection: 'row',
    paddingVertical: 8,
    paddingHorizontal: 14,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 30,
    backgroundColor: '#F2F3F5',
    marginRight: 8,
  },
  allButtonActive: {
    backgroundColor: '#0081D5',
  },
  allButtonText: {
    color: '#1F2024',
    fontSize: 14,
    fontWeight: '500',
  },
  allButtonTextActive: {
    color: '#FFF',
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
    width: 350,
    flexDirection: 'row',
    paddingVertical: 16,
    alignItems: 'center',
  },
  shelterImage: {
    width: 100,
    height: 100,
    borderRadius: 20,
  },
  shelterInfo: {
    marginLeft: 18,
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
  bottomSheetImageContainer: {
    width: '100%',
    alignItems: 'center',
    marginBottom: 20,
  },
  bottomSheetImage: {
    width: 350,
    height: 200,
    borderRadius: 12,
  },
  bottomSheetName: {
    fontSize: 24,
    fontWeight: '700',
    color: '#000',
    marginBottom: 10,
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
