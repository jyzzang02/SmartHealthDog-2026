import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  Dimensions,
} from "react-native";

import PetProfileCard from "../components/PetProfileCard";
import Header from "../components/Header";
import { getMyPets, PetListItem } from "../api/pets";
import { useNavigation } from "@react-navigation/native";
import type { StackNavigationProp } from "@react-navigation/stack";
import type { RootStackParamList } from "../../App";

const SCREEN_WIDTH = Dimensions.get("window").width;
const CARD_WIDTH = SCREEN_WIDTH * 0.85;
const SPACING = 16;

const MyPageScreen = () => {
  type MyPageNavProp = StackNavigationProp<RootStackParamList, "MyPage">;
  const navigation = useNavigation<MyPageNavProp>();

  const user = {
    name: "한국항공대",
    imageUrl: require("../assets/img_emblem.png"),
  };
  const hasUserImage = !!user.imageUrl;

  const [currentIndex, setCurrentIndex] = useState(0);
  const [petList, setPetList] = useState<PetListItem[]>([]);
  const [isPetsLoading, setIsPetsLoading] = useState(false);
  const [petsError, setPetsError] = useState<string | null>(null);

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

  useEffect(() => {
    let isMounted = true;

    const loadPets = async () => {
      setIsPetsLoading(true);
      setPetsError(null);
      try {
        const data = await getMyPets();
        if (!isMounted) return;
        setPetList(data);
      } catch (error) {
        if (!isMounted) return;
        const message =
          error instanceof Error
            ? error.message
            : "반려동물 정보를 불러오지 못했습니다.";
        setPetsError(message);
        setPetList([]);
      } finally {
        if (isMounted) {
          setIsPetsLoading(false);
        }
      }
    };

    loadPets();

    return () => {
      isMounted = false;
    };
  }, []);

  const petCards = useMemo(
    () =>
      petList.map((pet) => ({
        id: pet.id,
        name: pet.name || "이름 없음",
        type: pet.breed || mapSpeciesLabel(pet.species) || "",
        gender: mapGenderLabel(pet.sex) || "",
        birth: formatBirthDate(pet.birthDate) || "",
        imageUrl: require("../assets/img_adoptDog.png"),
        healthInfo: [],
        condition: "정보없음",
      })),
    [petList]
  );

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <Header />

      {/* 🔹 누르면 ProfileEditScreen으로 이동 */}
      <TouchableOpacity
        style={styles.userBox}
        onPress={() => navigation.navigate("ProfileEdit")}
        activeOpacity={0.8}
      >
        {hasUserImage ? (
          <Image
            source={
              typeof user.imageUrl === "string"
                ? { uri: user.imageUrl }
                : user.imageUrl
            }
            style={styles.userImage}
          />
        ) : (
          <View style={styles.userCircle} />
        )}

        <View style={styles.userRightBox}>
          <Text style={styles.userName}>{user.name}</Text>

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
        <Text style={styles.helperText}>반려동물 정보를 불러오는 중...</Text>
      )}
      {!!petsError && !isPetsLoading && (
        <Text style={styles.errorText}>{petsError}</Text>
      )}

      {petCards.length === 1 && <PetProfileCard {...petCards[0]} />}

      {petCards.length > 1 && (
        <>
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
                />
              </View>
            ))}
          </ScrollView>

          {/* Dots */}
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
      >
        <Text style={styles.btiTitle}>멍냥 성향테스트</Text>
        <Text style={styles.btiDesc}>
          나와 가장 성격이 비슷한 강아지, 고양이는?!{"\n"}
          간단한 테스트로 알아보아요
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
};

export default MyPageScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#ffffff",
  },

  /* -------------------------- 유저 영역 -------------------------- */
  userBox: {
    marginTop: 16,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 8,
  },

  userCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#E0E0E0",
  },

  userImage: {
    width: 80,
    height: 80,
    borderRadius: 40,
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

  /* -------------------------- 공통 스타일 -------------------------- */
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
    paddingVertical: 20,
    paddingHorizontal: 20,
  },

  btiTitle: {
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 4,
  },

  btiDesc: {
    fontSize: 13,
    color: "#555",
    lineHeight: 18,
  },

  helperText: {
    fontSize: 12,
    color: "#7B7C7D",
    paddingHorizontal: 20,
    marginTop: 8,
  },
  errorText: {
    fontSize: 12,
    color: "#EF5F5F",
    paddingHorizontal: 20,
    marginTop: 8,
  },
});
