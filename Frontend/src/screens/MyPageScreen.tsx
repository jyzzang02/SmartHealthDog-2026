import React, { useCallback, useMemo, useState, useEffect } from "react";
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
import { getMyPets, getPetDetail, PetListItem } from "../api/pets";
import { getMyProfile, UserProfile } from "../api/users";
import { resolveImageUri } from "../utils/imageUri";
import { getStoredAccessToken } from "../storage/tokenStorage";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { StackNavigationProp } from "@react-navigation/stack";
import type { RootStackParamList } from "../../App";

const SCREEN_WIDTH = Dimensions.get("window").width;
const CARD_WIDTH = SCREEN_WIDTH * 0.85;
const SPACING = 16;

const MyPageScreen = () => {
  type MyPageNavProp = StackNavigationProp<RootStackParamList, "MyPage">;
  const navigation = useNavigation<MyPageNavProp>();

  const [user, setUser] = useState<UserProfile | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [petList, setPetList] = useState<PetListItem[]>([]);
  const [isPetsLoading, setIsPetsLoading] = useState(false);
  const [petsError, setPetsError] = useState<string | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);

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

  const formatBirthDate = (birthDate?: string) => {
    if (!birthDate) return "";
    const [datePart] = birthDate.split("T");
    return datePart;
  };

  const loadData = useCallback(async () => {
    setIsPetsLoading(true);
    setPetsError(null);

    try {
      const [profileData, petsData] = await Promise.all([
        getMyProfile(),
        getMyPets(),
      ]);
      setUser(profileData);
      setPetList(petsData);

      const petsNeedingImage = petsData.filter(
        (pet) => !resolveImageUri(pet.profilePicture) && Boolean(pet.id)
      );

      if (petsNeedingImage.length > 0) {
        Promise.all(
          petsData.map(async (pet) => {
            const hasImage = Boolean(resolveImageUri(pet.profilePicture));
            if (hasImage || !pet.id) return pet;
            try {
              const detail = await getPetDetail(pet.id);
              return {
                ...pet,
                ...detail,
                profilePicture: detail.profilePicture || pet.profilePicture,
              };
            } catch {
              return pet;
            }
          })
        ).then((enriched) => {
          setPetList(enriched);
        });
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "정보를 불러오지 못했습니다.";
      setPetsError(message);
    } finally {
      setIsPetsLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const petCards = useMemo(
    () =>
      petList.map((pet) => ({
        id: pet.id,
        name: pet.name || "이름 없음",
        type: pet.breed || mapSpeciesLabel(pet.species) || "",
        gender: mapGenderLabel(pet.sex) || "",
        birth: formatBirthDate(pet.birthDate) || "",
        imageUrl: resolveImageUri(pet.profilePicture) || null,
        healthInfo: Array.isArray(pet.healthInfo) ? pet.healthInfo : [],
        condition: "정보없음",
      })),
    [petList]
  );

  const resolvedUserImage = resolveImageUri(user?.profilePicture);
  const userImageSource: ImageSourcePropType | undefined = resolvedUserImage
    ? {
        uri: resolvedUserImage,
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
      }
    : undefined;

  return (
    <View style={styles.container}>
      <Header />
      <ScrollView
        style={styles.pageScroll}
        contentContainerStyle={styles.pageScrollContent}
        showsVerticalScrollIndicator={false}
      >

      {/* 🔹 유저 프로필 영역 */}
      <TouchableOpacity
        style={styles.userBox}
        onPress={() => navigation.navigate("ProfileEdit")}
        activeOpacity={0.8}
      >
        <Image
          source={userImageSource}
          style={styles.userImage}
          onError={(event) => {
            console.log('[profile] mypage image load failed', event.nativeEvent?.error);
          }}
        />

        <View style={styles.userRightBox}>
          <Text style={styles.userName}>{user?.nickname || "사용자"} 님</Text>
          <Image
            source={require("../assets/icon_right.png")}
            style={styles.rightIcon}
          />
        </View>
      </TouchableOpacity>

      {/* 🔹 반려동물 프로필 */}
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
        <PetProfileCard
          {...petCards[0]}
          onPressEdit={() => navigation.navigate("PetEdit", { petId: petCards[0].id })}
          onPressHistory={() =>
            navigation.navigate("DiagnosisHistory", {
              petId: petCards[0].id,
              petName: petCards[0].name,
            })
          }
        />
      )}

      {petCards.length > 1 && (
        <>
          <View style={styles.petCarouselWrap}>
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
              {petCards.map((pet, idx) => (
                <View key={idx} style={{ width: CARD_WIDTH, marginRight: SPACING }}>
                  <PetProfileCard
                    {...pet}
                    onPressEdit={() => navigation.navigate("PetEdit", { petId: pet.id })}
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

      <View style={styles.divider} />

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
    marginTop: 16,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  userImage: {
    width: 80,
    height: 80,
    borderRadius: 40,
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
    marginTop: 40,
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
    marginTop: 32,
    gap: 8,
  },
  petCarouselWrap: {
    minHeight: 360,
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
   btiSection: {
     marginTop: 10,
     paddingVertical: 0,
     paddingHorizontal: 20,
     marginBottom: 2,
   },
   btiCard: {
     backgroundColor: '#F0F7FF',
     borderRadius: 16,
     borderWidth: 1.5,
     borderColor: '#E0F0FF',
     paddingVertical: 24,
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
     paddingVertical: 12,
     marginBottom: 16,
   },
    btiPetIcon: {
      width: 80,
      height: 80,
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
