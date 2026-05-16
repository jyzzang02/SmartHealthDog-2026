import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TextInput,
  TouchableOpacity,
  Alert,
  Platform,
  PermissionsAndroid,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { launchImageLibrary, ImagePickerResponse } from 'react-native-image-picker';
import { useNavigation } from "@react-navigation/native";
import { logout } from "../api/auth";
import { getMyProfile, updateMyProfile, UserProfile } from "../api/users";
import { clearAuthTokens, getStoredRefreshToken } from "../storage/tokenStorage";

const ProfileEditScreen = () => {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [nickname, setNickname] = useState("");
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileImageUri, setProfileImageUri] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const loadProfile = async () => {
      setIsLoadingProfile(true);
      setProfileError(null);
      try {
        const data = await getMyProfile();
        if (!isMounted) return;
        setProfile(data);
        setNickname(data.nickname ?? "");
      } catch (error) {
        if (!isMounted) return;
        const message =
          error instanceof Error
            ? error.message
            : "프로필 정보를 불러오지 못했습니다.";
        setProfileError(message);
      } finally {
        if (isMounted) {
          setIsLoadingProfile(false);
        }
      }
    };

    loadProfile();

    return () => {
      isMounted = false;
    };
  }, []);

  const performLogout = useCallback(async () => {
    setIsLoggingOut(true);
    try {
      const refreshToken = await getStoredRefreshToken();
      if (refreshToken) {
        await logout(refreshToken);
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "로그아웃에 실패했습니다.";
      Alert.alert("로그아웃 실패", message);
    } finally {
      await clearAuthTokens();
      setIsLoggingOut(false);
      navigation.reset({
        index: 0,
        routes: [{ name: "Login" as never }],
      });
    }
  }, [navigation]);

  const handleLogout = useCallback(() => {
    if (isLoggingOut) return;
    Alert.alert("로그아웃", "정말 로그아웃할까요?", [
      { text: "취소", style: "cancel" },
      { text: "로그아웃", style: "destructive", onPress: performLogout },
    ]);
  }, [isLoggingOut, performLogout]);

  const requestImagePermission = useCallback(async () => {
    if (Platform.OS !== 'android') return true;

    const androidVersion = Platform.Version;
    const permission =
      androidVersion >= 33
        ? PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES
        : PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE;

    try {
      const granted = await PermissionsAndroid.request(permission, {
        title: '사진 라이브러리 접근 권한',
        message: '프로필 사진을 선택하기 위해 사진 라이브러리 접근 권한이 필요합니다.',
        buttonNeutral: '나중에',
        buttonNegative: '취소',
        buttonPositive: '확인',
      });
      return granted === PermissionsAndroid.RESULTS.GRANTED;
    } catch (error) {
      console.warn('권한 요청 에러:', error);
      return false;
    }
  }, []);

   const handleSelectProfileImage = useCallback(async () => {
     const hasPermission = await requestImagePermission();
     if (!hasPermission) {
       Alert.alert('권한 필요', '사진을 선택하려면 권한을 허용해 주세요.');
       return;
     }

     launchImageLibrary(
       {
         mediaType: 'photo',
         quality: 1,
         maxWidth: 500,
         maxHeight: 500,
       },
       async (response: ImagePickerResponse) => {
         if (response.didCancel) return;
         if (response.errorCode) {
           Alert.alert('오류', '이미지를 불러올 수 없습니다.');
           return;
         }
         const uri = response.assets?.[0]?.uri;
         if (!uri) {
           Alert.alert('오류', '이미지를 불러올 수 없습니다.');
           return;
         }

         const fallbackNickname = nickname.trim() || profile?.nickname?.trim();
         if (!fallbackNickname) {
           Alert.alert('오류', '닉네임 정보를 먼저 불러오거나 입력해 주세요.');
           return;
         }

         setProfileImageUri(uri);
         try {
           const updated = await updateMyProfile({
             nickname: fallbackNickname,
             profilePictureUri: uri,
           });
           setProfile(updated);
           setNickname(updated.nickname ?? fallbackNickname);
           setProfileImageUri(updated.profilePicture ?? uri);
           Alert.alert('저장 완료', '프로필 사진이 변경되었습니다.', [
             {
               text: '확인',
               onPress: () => navigation.goBack(),
             },
           ]);
         } catch (error) {
           const message =
             error instanceof Error ? error.message : '프로필 사진 변경에 실패했습니다.';
           Alert.alert('오류', message);
         }
       }
     );
   }, [nickname, profile?.nickname, requestImagePermission, navigation]);

  const handleSaveProfile = useCallback(async () => {
    if (isSavingProfile) return;
    const trimmedNickname = nickname.trim();
    if (!trimmedNickname) {
      Alert.alert("오류", "닉네임을 입력해 주세요.");
      return;
    }

    setIsSavingProfile(true);
    try {
      const updated = await updateMyProfile({
        nickname: trimmedNickname,
        profilePictureUri: profileImageUri,
      });
      setProfile(updated);
      setNickname(updated.nickname ?? trimmedNickname);
      setProfileImageUri(null);
      Alert.alert("저장 완료", "프로필이 저장되었습니다.", [
        {
          text: "확인",
          onPress: () => navigation.goBack(),
        },
      ]);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "프로필 저장에 실패했습니다.";
      Alert.alert("오류", message);
    } finally {
      setIsSavingProfile(false);
    }
  }, [isSavingProfile, nickname, profileImageUri, navigation]);

  const handleChangeAddress = useCallback(() => {
    Alert.alert('주소 변경', '주소 검색 기능은 준비 중입니다.');
  }, []);

  // 비회원(로그인 에러) 상태일 때 저장 버튼 숨김 여부 결정
  const isGuestMode = !!profileError;

  return (
    <View style={styles.wrapper}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + (isGuestMode ? 40 : 120) } // 여유로운 하단 여백
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* 🔙 헤더 */}
        <View style={styles.headerRow}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => navigation.goBack()}
          >
            <Image
              source={require("../assets/icon_back.png")}
              style={styles.backIcon}
            />
          </TouchableOpacity>

          <Text style={styles.headerTitle}>내 프로필</Text>
        </View>

        {isLoadingProfile && (
          <Text style={styles.loadingText}>프로필 불러오는 중...</Text>
        )}
        {!!profileError && !isLoadingProfile && (
          <Text style={styles.errorText}>{profileError}</Text>
        )}

        {/* 이미지 */}
        <View style={styles.imageBox}>
          {profileImageUri ? (
            <Image source={{ uri: profileImageUri }} style={styles.profileImage} />
          ) : profile?.profilePicture ? (
            <Image
              source={{ uri: profile.profilePicture }}
              style={styles.profileImage}
            />
          ) : (
            <View style={styles.imagePlaceholder} />
          )}

          <TouchableOpacity
            style={styles.editTag}
            onPress={handleSelectProfileImage}
            activeOpacity={0.8}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Image
              source={require("../assets/icon_edit.png")}
              style={styles.editSmallIcon}
            />
            <Text style={styles.editTagText}>수정하기</Text>
          </TouchableOpacity>
        </View>

        {/* 닉네임 */}
        <Text style={styles.label}>닉네임</Text>
        <TextInput
          style={styles.input}
          placeholder="닉네임"
          placeholderTextColor="#999"
          value={nickname}
          onChangeText={setNickname}
        />

        {/* 이메일 */}
        <Text style={styles.label}>이메일 아이디</Text>
        <View style={styles.emailBox}>
          <Text style={styles.emailText}>{profile?.email ?? "-"}</Text>
        </View>

        {/* 주소 */}
        <Text style={styles.label}>내 주소</Text>
        <View style={styles.addressRow}>
          <TextInput
            style={styles.addressInput}
            placeholder="서울시 마포구 양xxxxx"
            placeholderTextColor="#999"
          />

          <TouchableOpacity style={styles.changeAddressBtn} onPress={handleChangeAddress}>
            <Text style={styles.changeAddressText}>주소 변경</Text>
          </TouchableOpacity>
        </View>

        {/* 로그아웃 */}
        <TouchableOpacity
          style={styles.logoutBtn}
          onPress={handleLogout}
          disabled={isLoggingOut}
        >
          <Text style={styles.logoutText}>
            {isLoggingOut ? "로그아웃 중..." : "로그아웃"}
          </Text>
        </TouchableOpacity>
      </ScrollView>

      {/* 저장 버튼: 비회원(에러) 상태가 아닐 때만 표시 */}
      {!isGuestMode && (
        <TouchableOpacity
          style={[styles.saveBtn, { bottom: insets.bottom + 16 }]}
          onPress={handleSaveProfile}
          disabled={isSavingProfile}
        >
          <Text style={styles.saveBtnText}>
            {isSavingProfile ? "저장 중..." : "저장하기"}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

export default ProfileEditScreen;

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },

  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },

  scrollContent: {
    padding: 20,
  },

  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 20,
  },

  backBtn: {
    marginRight: 12,
    padding: 4,
    marginTop: 6,
  },

  backIcon: {
    width: 20,
    height: 20,
  },

  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1F2024",
  },

  imageBox: {
    width: "100%",
    height: 140,
    backgroundColor: "#F1F1F1",
    borderRadius: 12,
    marginTop: 24,
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },

  imagePlaceholder: {
    width: "100%",
    height: "100%",
    backgroundColor: "#ddd",
    opacity: 0.3,
    borderRadius: 12,
  },

  editTag: {
    position: "absolute",
    top: 14,
    right: 14,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#ddd",
    zIndex: 10,
    elevation: 10,
  },

  editTagText: {
    fontSize: 12,
    color: "#444",
    marginLeft: 4,
  },

  editSmallIcon: {
    width: 11,
    height: 11,
    tintColor: "#555",
  },

  label: {
    fontSize: 16,
    fontWeight: "700",
    marginTop: 28,
    marginBottom: 12,
    color: "#1F2024",
  },

  input: {
    padding: 16,
    backgroundColor: "#F3F4F5",
    borderRadius: 10,
    fontSize: 16,
    color: "#7B7C7D",
    fontWeight: "500",
  },

  emailBox: {
    backgroundColor: "#F3F4F5",
    padding: 16,
    borderRadius: 10,
  },

  emailText: {
    fontSize: 16,
    color: "#7B7C7D",
  },

  addressRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  addressInput: {
    flex: 1,
    backgroundColor: "#F3F4F5",
    padding: 16,
    borderRadius: 10,
    fontSize: 16,
    marginRight: 10,
    color: "#7B7C7D",
    fontWeight: "500",
  },

  changeAddressBtn: {
    borderWidth: 1,
    borderColor: "#C4C4C4",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
  },

  changeAddressText: {
    fontSize: 14,
    color: "#1F2024",
  },

  logoutBtn: {
    marginTop: 40,
    paddingVertical: 10,
    alignSelf: 'flex-start',
  },

  logoutText: {
    fontSize: 15,
    color: "#5A5A5A",
    textDecorationLine: "underline",
  },

  saveBtn: {
    position: "absolute",
    left: 20,
    right: 20,
    backgroundColor: "#2A7BE4",
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
  },

  saveBtnText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },

  errorText: {
    fontSize: 13,
    color: "#EF5F5F",
    marginTop: 12,
    fontWeight: "600",
  },

  loadingText: {
    fontSize: 12,
    color: "#7B7C7D",
    marginTop: 8,
  },

  profileImage: {
    width: "100%",
    height: "100%",
  },
});
