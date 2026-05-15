import React from "react";
import { View, Text, StyleSheet, Image, TouchableOpacity, ScrollView } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import CustomButton from "../components/CustomButton";

const urineDog = require("../assets/urineDog.png");

const EXTRA_BOTTOM_PADDING = 40;

const UrineDiagnosisScreen = () => {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      contentContainerStyle={[
        styles.container,
        { paddingBottom: insets.bottom + EXTRA_BOTTOM_PADDING },
      ]}
      scrollEnabled={false}
      showsVerticalScrollIndicator={false}
    >
      {/* Back Button */}
      <TouchableOpacity
        style={styles.backButton}
        onPress={() => navigation.goBack()}
        activeOpacity={0.8}
      >
        <Image
          source={require("../assets/icon_back.png")}
          style={{ width: 20, height: 20 }}
        />
      </TouchableOpacity>

      <View style={styles.content}>
        {/* Title */}
        <Text style={styles.title}>소변키트 진단</Text>

        {/* 설명 문구 */}
        <Text style={styles.subtitle}>
          소변키트 진단 서비스는 앱 내에서{"\n"}
          반려동물의 건강 상태를 분석해주는 서비스입니다.
        </Text>

        {/* 캐릭터 이미지 */}
        <Image source={urineDog} style={styles.image} />
      </View>

      <View style={styles.buttonContainer}>
        {/* 진단 시작 버튼 */}
        <CustomButton
          text="진단시작"
          onPress={() => navigation.navigate('UrineCamera')}
        />
      </View>

    </ScrollView>
  );
};

export default UrineDiagnosisScreen;

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: "#FFF",
    alignItems: "center",
    paddingTop: 80,
    justifyContent: "space-between",
  },
  content: {
    alignItems: "center",
  },
  buttonContainer: {
    width: "100%",
    alignItems: "center",
  },
  backButton: {
    position: "absolute",
    top: 55,
    left: 20,
    padding: 6,
  },
  title: {
    fontSize: 32,
    fontWeight: "700",
    color: "#000",
    marginTop: 70,
  },
  subtitle: {
    fontSize: 18,
    fontWeight: "500",
    color: "#3C4144",
    textAlign: "center",
    marginTop: 24,
    lineHeight: 26,
  },
  image: {
    width: 250,
    height: 250,
    marginTop: 90,
    resizeMode: "contain",
  },
});
