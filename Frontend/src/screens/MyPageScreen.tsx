import React, { useCallback, useMemo, useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  Dimensions,
  ActivityIndicator,
  ImageSourcePropType,
} from "react-native";

import PetProfileCard from "../components/PetProfileCard";
import Header from "../components/Header";
import { getMyPets, PetListItem } from "../api/pets";
import { formatLatestProfileCheckupDate, formatProfileRecordDate, getPetProfileHealth, type PetProfileHealth } from "../api/petProfileHealth";
import { healthStore } from "../store/healthStore";
import { getMyProfile, UserProfile } from "../api/users";
import { resolveImageUri } from "../utils/imageUri";
import { getAuthSession, getStoredAccessToken } from "../storage/tokenStorage";
import { useFocusEffect, useIsFocused, useNavigation } from "@react-navigation/native";
import type { StackNavigationProp } from "@react-navigation/stack";
import type { RootStackParamList } from "../../App";
import { useTabScrollToTop } from "../hooks/useTabScrollToTop";

const SCREEN_WIDTH = Dimensions.get("window").width;
const CARD_WIDTH = SCREEN_WIDTH * 0.85;
const SPACING = 16;
const UNAVAILABLE_HEALTH: PetProfileHealth = {
  eye: { failed: true }, urine: { failed: true }, selfCheck: { failed: true }, respiration: { failed: true },
};
const conditionDate = (entry: PetProfileHealth["eye"]) =>
  entry.failed ? "조회 실패" : formatProfileRecordDate(entry.date);

const MyPageScreen = () => {
  type MyPageNavProp = StackNavigationProp<RootStackParamList, "MyPage">;
  const navigation = useNavigation<MyPageNavProp>();
  const focused = useIsFocused();
  const session = getAuthSession();

  const scrollRef = useRef<ScrollView>(null);
  useTabScrollToTop(scrollRef);

  const [user, setUser] = useState<UserProfile | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [petList, setPetList] = useState<PetListItem[]>([]);
  const [profileHealth, setProfileHealth] = useState<{ session: symbol; byPet: Record<number, PetProfileHealth> }>();
  const [isPetsLoading, setIsPetsLoading] = useState(false);
  const [petsError, setPetsError] = useState<string | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [userImageLoadFailed, setUserImageLoadFailed] = useState(false);
  const isMountedRef = useRef(true);
  const petLoadGeneration = useRef(0);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    getStoredAccessToken()
      .then((token) => {
        if (mounted) setAccessToken(token);
      })
      .catch(() => {
        if (mounted) setAccessToken(null);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const mapSpeciesLabel = (species?: string) => {
    if (!species) return "";
    const normalized = species.toLowerCase();
    if (normalized.includes("dog") || normalized.includes("강아지")) return "강아지";
    if (normalized.includes("cat") || normalized.includes("고양이")) return "고양이";
    return species;
  };

  const mapGenderLabel = (sex?: string) => {
    if (!sex) return "";
    const normalized = sex.toLowerCase();
    if (normalized.includes("female") || normalized.includes("여")) return "여";
    if (normalized.includes("male") || normalized.includes("남")) return "남";
    return sex;
  };

  const loadData = useCallback(async () => {
    const generation = ++petLoadGeneration.current;
    const loadSession = getAuthSession();
    const isCurrent = () => isMountedRef.current && generation === petLoadGeneration.current && getAuthSession() === loadSession;
    setIsPetsLoading(true);
    setPetsError(null);

    try {
      const [profileData, petsData] = await Promise.all([
        getMyProfile(),
        getMyPets(),
      ]);
      if (!isCurrent()) return;
      setUser(profileData);
      setPetList(petsData);
      setProfileHealth({ session: loadSession, byPet: {} });

    } catch (error) {
      if (!isCurrent()) return;
      const message =
        error instanceof Error ? error.message : "정보를 불러오지 못했습니다.";
      setPetsError(message);
    } finally {
      if (!isCurrent()) return;
      setIsPetsLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
      return () => { petLoadGeneration.current += 1; };
    }, [loadData])
  );

  const activePetId = petList[Math.min(Math.max(currentIndex, 0), petList.length - 1)]?.id;
  const selectedHealth = profileHealth?.session === session && activePetId !== undefined
    ? profileHealth.byPet[activePetId] : undefined;
  useEffect(() => {
    if (!focused || isPetsLoading || petsError || profileHealth?.session !== session ||
        activePetId === undefined || selectedHealth) return;
    const controller = new AbortController();
    let active = true;
    const commit = (data: PetProfileHealth) => {
      if (!active || getAuthSession() !== session) return;
      setProfileHealth(current => current?.session === session
        ? { session, byPet: { ...current.byPet, [activePetId]: data } } : current);
    };
    const timeout = setTimeout(() => controller.abort(), 20_000);
    getPetProfileHealth(activePetId, controller.signal)
      .then(commit)
      .catch(() => commit(UNAVAILABLE_HEALTH))
      .finally(() => clearTimeout(timeout));
    return () => {
      active = false;
      clearTimeout(timeout);
      controller.abort();
    };
  }, [focused, isPetsLoading, petsError, profileHealth?.session, session, activePetId, selectedHealth]);

  const petCards = useMemo(
    () =>
      petList.map((pet) => {
        const health = profileHealth?.session === session ? profileHealth.byPet[pet.id] : undefined;
        const weightKg = typeof pet.weightKg === "number" && Number.isFinite(pet.weightKg) && pet.weightKg > 0
          ? pet.weightKg : undefined;
        const isHealthLoading = !health && focused && !petsError && pet.id === activePetId;
        const checkupDate = formatLatestProfileCheckupDate(
          healthStore.getHistory(pet.id).map(record => record.checkupDate),
        );
        const conditionRecords = health ? [
          { label: "안구질환", date: conditionDate(health.eye) },
          { label: "소변키트", date: conditionDate(health.urine) },
          { label: "수면호흡", date: conditionDate(health.respiration) },
          { label: "자가진단", date: conditionDate(health.selfCheck), stage: health.selfCheck.stage },
        ] : undefined;
        return {
          id: pet.id,
          name: pet.name || "이름 없음",
          type: pet.breed || mapSpeciesLabel(pet.species) || "",
          gender: mapGenderLabel(pet.sex) || "",
          birth: pet.birthDate || pet.birthday || "",
          imageUrl: resolveImageUri(pet.profilePicture) || null,
          weightKg,
          checkupDate,
          condition: isHealthLoading ? "불러오는 중" : undefined,
          conditionRecords,
        };
      }),
    [petList, profileHealth, session, activePetId, focused, petsError]
  );

  const resolvedUserImage = resolveImageUri(user?.profilePicture);
  const shouldUseAuthHeaderForUserImage = Boolean(
    resolvedUserImage && /^https?:\/\/api\.puppydoc\.ovh:8080\//i.test(resolvedUserImage)
  );
  useEffect(() => {
    setUserImageLoadFailed(false);
  }, [resolvedUserImage]);
  const userImageSource: ImageSourcePropType | undefined = resolvedUserImage
    ? !userImageLoadFailed
      ? {
        uri: resolvedUserImage,
        headers:
          shouldUseAuthHeaderForUserImage && accessToken
            ? { Authorization: `Bearer ${accessToken}` }
            : undefined,
      }
      : undefined
    : undefined;

  return (
    <View style={styles.container}>
      <Header />
      <ScrollView
        ref={scrollRef}
        style={styles.pageScroll}
        contentContainerStyle={styles.pageScrollContent}
        showsVerticalScrollIndicator={false}
      >

      {/* 유저 프로필 영역 */}
      <TouchableOpacity
        style={styles.userBox}
        onPress={() => navigation.navigate("ProfileEdit")}
        activeOpacity={0.8}
      >
        {userImageSource ? (
          <Image
            source={userImageSource}
            style={styles.userImage}
            onError={() => {
              setUserImageLoadFailed(true);
            }}
          />
        ) : (
          <View style={styles.userImage} />
        )}

        <View style={styles.userRightBox}>
          <Text style={styles.userName}>{user?.nickname || "사용자"} 님</Text>
          <Image
            source={require("../assets/icon_right.png")}
            style={styles.rightIcon}
          />
        </View>
      </TouchableOpacity>

      {/* 반려동물 프로필 */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>반려동물 프로필</Text>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => navigation.navigate("PetSignup", { mode: "add" })}
        >
          <Text style={styles.addButtonText}>+ 추가</Text>
        </TouchableOpacity>
      </View>

      {isPetsLoading && (
        <View style={{ marginTop: 20 }}>
          <ActivityIndicator size="small" color="#2A7BE4" />
        </View>
      )}

      {!!petsError && !isPetsLoading && (
        <Text style={styles.errorText}>{petsError}</Text>
      )}

      {!isPetsLoading && petCards.length === 0 && (
        <Text style={styles.helperText}>등록된 반려동물이 없습니다.</Text>
      )}

      {petCards.length === 1 && (
        <>
          <View style={styles.singlePetCardWrap}>
            <PetProfileCard
              {...petCards[0]}
              onPressEdit={() => navigation.navigate("PetEdit", { petId: petCards[0].id })}
              onPressHealthInput={() => navigation.navigate("HealthCheckInput", { petId: petCards[0].id, petName: petCards[0].name })}
              onPressHistory={() =>
                navigation.navigate("DiagnosisHistory", {
                  petId: petCards[0].id,
                  petName: petCards[0].name,
                })
              }
            />
          </View>
        </>
      )}

      {petCards.length > 1 && (
        <>
          <View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              snapToInterval={CARD_WIDTH + SPACING}
              decelerationRate="fast"
              contentContainerStyle={{
                paddingHorizontal: (SCREEN_WIDTH - CARD_WIDTH) / 2,
              }}
              onScroll={(e) => {
                const x = e.nativeEvent.contentOffset.x;
                const index = Math.round(x / (CARD_WIDTH + SPACING));
                setCurrentIndex(index);
              }}
              scrollEventThrottle={16}
            >
              {petCards.map((pet) => (
                <View key={pet.id} style={{ width: CARD_WIDTH, marginRight: SPACING }}>
                  <PetProfileCard
                    {...pet}
                    onPressEdit={() => navigation.navigate("PetEdit", { petId: pet.id })}
                    onPressHealthInput={() => navigation.navigate("HealthCheckInput", { petId: pet.id, petName: pet.name })}
                    onPressHistory={() =>
                      navigation.navigate("DiagnosisHistory", {
                        petId: pet.id,
                        petName: pet.name,
                      })
                    }
                  />
                </View>
              ))}
            </ScrollView>
          </View>

          <View style={styles.dotContainer}>
            {petCards.map((_, i) => (
              <View
                key={i}
                style={[styles.dot, currentIndex === i && styles.activeDot]}
              />
            ))}
          </View>

        </>
      )}

      <View style={[styles.divider, petCards.length > 1 && styles.carouselDivider]} />

      <TouchableOpacity
        style={styles.btiSection}
        onPress={() => navigation.navigate("GameScreen")}
        activeOpacity={0.8}
      >
        <View style={styles.btiCard}>
          <View style={styles.btiIconRow}>
            <Image
              source={require('../assets/img_adoptDog.png')}
              style={styles.btiPetIcon}
              resizeMode="contain"
            />
            <View style={styles.btiDots}>
              <View style={styles.btiDot} />
              <View style={styles.btiDot} />
              <View style={styles.btiDot} />
            </View>
            <Image
              source={require('../assets/img_adoptCat.png')}
              style={styles.btiPetIcon}
              resizeMode="contain"
            />
          </View>

          <View style={styles.btiContent}>
            <Text style={styles.btiTitle}>멍냥 성향테스트</Text>
            <Text style={styles.btiDesc}>
              나와 가장 성격이 비슷한 강아지, 고양이는?!{"\n"}
              간단한 테스트로 알아보아요
            </Text>
          </View>

          <View style={styles.btiFooter}>
            <Text style={styles.btiCta}>테스트하기</Text>
            <Image
              source={require('../assets/icon_right.png')}
              style={styles.btiArrow}
              tintColor="#0081D5"
            />
          </View>
        </View>
      </TouchableOpacity>
      </ScrollView>
    </View>
  );
};

export default MyPageScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  pageScroll: {
    flex: 1,
  },
  pageScrollContent: {
    paddingBottom: 28,
  },
  userBox: {
    marginTop: 4,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  userImage: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#E0E0E0",
  },
  userRightBox: {
    flexDirection: "row",
    alignItems: "center",
    marginLeft: 12,
    flex: 1,
    justifyContent: "space-between",
  },
  userName: {
    fontSize: 18,
    fontWeight: "600",
    color: "#040505",
  },
  rightIcon: {
    width: 16,
    height: 16,
    tintColor: "#7B7C7D",
  },

  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#000",
  },
  sectionHeader: {
    marginTop: 6,
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  addButton: {
    borderWidth: 1,
    borderColor: "#2A7BE4",
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  addButtonText: {
    color: "#2A7BE4",
    fontSize: 12,
    fontWeight: "600",
  },
  dotContainer: {
    flexDirection: "row",
    alignSelf: "center",
    marginTop: 10,
    gap: 8,
  },
  singlePetCardWrap: {
    width: CARD_WIDTH,
    alignSelf: "center",
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 8,
    backgroundColor: "#C4C4C4",
  },
  activeDot: {
    backgroundColor: "#2A7BE4",
  },
  divider: {
    width: "100%",
    height: 6,
    backgroundColor: "#F3F4F5",
    marginTop: 32,
  },
  carouselDivider: { marginTop: 16 },
   btiSection: {
     width: CARD_WIDTH,
     alignSelf: "center",
     marginTop: 10,
     marginBottom: 2,
   },
   btiCard: {
     backgroundColor: '#F0F7FF',
     borderRadius: 16,
     borderWidth: 1.5,
     borderColor: '#E0F0FF',
     paddingTop: 14,
     paddingBottom: 24,
     paddingHorizontal: 20,
     shadowColor: '#0081D5',
     shadowOffset: { width: 0, height: 2 },
     shadowOpacity: 0.08,
     shadowRadius: 8,
     elevation: 3,
   },
   btiIconRow: {
     flexDirection: 'row',
     alignItems: 'center',
     justifyContent: 'space-between',
     paddingVertical: 6,
     marginBottom: 10,
   },
    btiPetIcon: {
      width: 100,
      height: 100,
    },
   btiDots: {
     flexDirection: 'row',
     gap: 6,
   },
   btiDot: {
     width: 6,
     height: 6,
     borderRadius: 3,
     backgroundColor: '#0081D5',
   },
   btiContent: {
     marginBottom: 16,
   },
   btiTitle: {
     fontSize: 18,
     fontWeight: '700',
     color: '#000000',
     marginBottom: 8,
   },
   btiDesc: {
     fontSize: 14,
     color: '#555',
     lineHeight: 20,
     fontWeight: '500',
   },
   btiFooter: {
     flexDirection: 'row',
     alignItems: 'center',
     justifyContent: 'space-between',
     paddingTop: 12,
     borderTopWidth: 1,
     borderTopColor: '#D0E8FF',
   },
   btiCta: {
     fontSize: 14,
     fontWeight: '600',
     color: '#0081D5',
   },
   btiArrow: {
     width: 16,
     height: 16,
   },
  helperText: {
    fontSize: 14,
    color: "#7B7C7D",
    paddingHorizontal: 20,
    marginTop: 16,
    textAlign: "center",
  },
  errorText: {
    fontSize: 12,
    color: "#EF5F5F",
    paddingHorizontal: 20,
    marginTop: 8,
  },
});


