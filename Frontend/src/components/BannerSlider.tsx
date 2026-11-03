import React, { useEffect, useRef, useState } from "react";
import {
  View,
  StyleSheet,
  Dimensions,
  FlatList,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Image,
  Text,
  TouchableOpacity,
} from "react-native";
import { useNavigation } from "@react-navigation/native";

const { width } = Dimensions.get("window");
const BANNER_ASPECT = 1010 / 569;

const banners = [
  { id: "1", image: require("../assets/img_banner_adoption.png"), tab: "입양", title: "크리스마스를\n반려동물과 함께\n보내보아요", button: "입양 보러가기" },
  { id: "2", image: require("../assets/img_banner_walk.png"), tab: "산책", title: "햇빛산책을\n시작해 보아요", button: "산책하러 가기" },
  { id: "3", image: require("../assets/img_banner_health.png"), tab: "건강", title: "AI 건강진단을\n시작해 보아요", button: "건강진단 보러 가기" },
];
const bannerData = [...banners, { ...banners[0], id: "loop-0" }]; // 마지막에 첫 배너 복제 (고유 id로 키 충돌 방지)

export default function BannerSlider() {
  const navigation = useNavigation<any>();
  const [currentIndex, setCurrentIndex] = useState(0);
  const flatListRef = useRef<FlatList>(null);
  const AUTO_INTERVAL = 6000;
  const currentRawIndexRef = useRef(0); // 실질 스크롤 위치 (복제 포함)

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.round(event.nativeEvent.contentOffset.x / width);
    currentRawIndexRef.current = index;

    // 복제 배너(마지막)까지 갔다면 애니메이션 없이 0번으로 점프
    if (index === banners.length) {
      flatListRef.current?.scrollToIndex({ index: 0, animated: false });
      setCurrentIndex(0);
      currentRawIndexRef.current = 0;
    } else {
      setCurrentIndex(index);
    }
  };

  const scrollTo = (index: number) => {
    flatListRef.current?.scrollToIndex({ index, animated: true });
  };

  useEffect(() => {
    const timer = setInterval(() => {
      const rawNext = currentRawIndexRef.current + 1;
      // 복제 포함 길이 사용
      const targetIndex = rawNext > bannerData.length - 1 ? 1 : rawNext;
      scrollTo(targetIndex);
    }, AUTO_INTERVAL);

    return () => clearInterval(timer);
  }, []);

  return (
    <View style={styles.container}>
      <FlatList
        ref={flatListRef}
        data={bannerData}
        keyExtractor={(item) => item.id}
        horizontal
        showsHorizontalScrollIndicator={false}
        pagingEnabled
        onScroll={handleScroll}
        onMomentumScrollEnd={handleScroll}
        scrollEventThrottle={16}
        renderItem={({ item }) => (
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={() => navigation.navigate(item.tab)}
            accessibilityRole="button"
            accessibilityLabel={item.title ? item.title.replace("\n", " ") : "입양 보러가기"}
            style={styles.bannerBox}
          >
            <Image source={item.image} style={styles.bannerImage} />
            {item.title && (
              <View style={[styles.bannerCopy, item.tab === "입양" && styles.adoptionBannerCopy]}>
                <Text style={styles.bannerTitle}>{item.title}</Text>
                <View style={styles.bannerButton}><Text style={styles.bannerButtonText}>{item.button}</Text></View>
              </View>
            )}

            {/* 🔹 배너 내부 아래 중앙에 위치하는 Dot */}
            <View style={styles.dotContainer}>
              {banners.map((_, idx) => (
                <View
                  key={idx}
                  style={[styles.dot, currentIndex === idx && styles.activeDot]}
                />
              ))}
            </View>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: width,
    marginTop: 0,
    marginBottom: 12,
  },

  bannerBox: {
    width: width,
    aspectRatio: BANNER_ASPECT, // 원본 비율 유지
    justifyContent: "center",
    alignItems: "center",
    marginTop: 0,
  },

  bannerImage: {
    width: "100%",
    height: "100%",
    resizeMode: "contain",
  },

  bannerCopy: {
    position: "absolute",
    left: "7%",
    width: "46%",
    top: "28%",
    alignItems: "flex-start",
  },
  adoptionBannerCopy: {
    top: '20%',
  },
  bannerTitle: {
    fontSize: 20,
    lineHeight: 27,
    fontWeight: "700",
    color: "#222222",
  },
  bannerButton: {
    width: 120,
    maxWidth: '100%',
    minHeight: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: "#0081D5",
    borderRadius: 20,
    backgroundColor: "#222222",
  },
  bannerButtonText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "600",
  },

  /** 🔹 Dot을 배너 영역 안쪽에 배치 */
  dotContainer: {
    position: "absolute",
    bottom: 16,     // 배너 내부 아래 여백
    flexDirection: "row",
    alignSelf: "center",
    gap: 10,
  },

  dot: {
    width: 8,
    height: 8,
    borderRadius: 8,
    backgroundColor: "#C4C4C4",
  },

  activeDot: {
    backgroundColor: "#2A7BE4",
    width: 8,
    height: 8,
  },
});
