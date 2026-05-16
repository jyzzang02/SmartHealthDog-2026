import React, { useEffect, useState } from "react";
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
  ActivityIndicator,
} from "react-native";
import { launchImageLibrary } from "react-native-image-picker";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";
import type { RootStackParamList } from "../../App";
import {
  getPetDetail,
  PetListItem,
  updatePetFull,
  deletePet,
  PetGender,
  PetSpecies,
} from "../api/pets";

const PetEditScreen = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<RootStackParamList, "PetEdit">>();
  const { petId } = route.params;

  // 상태 관리
  const [pet, setPet] = useState<PetListItem | null>(null);
  const [name, setName] = useState("");
  const [breed, setBreed] = useState("");
  const [sex, setSex] = useState<string | null>(null);
  const [birthday, setBirthday] = useState<Date | null>(null);
  const [isNeutered, setIsNeutered] = useState<boolean | null>(null);
  const [petImageUri, setPetImageUri] = useState<string | null>(null);
  const [weightKg, setWeightKg] = useState("");

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // 데이터 로드
  useEffect(() => {
    const loadPet = async () => {
      try {
        const data = await getPetDetail(petId);
        setPet(data);
        setName(data.name || "");
        setBreed(data.breed || "");
        setSex(data.gender || data.sex || "UNKNOWN");
        setIsNeutered(data.neutered ?? false);
        setWeightKg(data.weightKg ? String(data.weightKg) : "");

        const bDay = data.birthday || data.birthDate;
        if (bDay) {
          setBirthday(new Date(bDay));
        }
      } catch (err) {
        setErrorMessage("반려동물 정보를 불러오지 못했습니다.");
      } finally {
        setIsLoading(false);
      }
    };
    loadPet();
  }, [petId]);

  // 날짜 포맷팅
  const formatBirthdayDisplay = () => {
    if (!birthday) return "";
    const year = birthday.getFullYear();
    const month = String(birthday.getMonth() + 1).padStart(2, "0");
    const day = String(birthday.getDate()).padStart(2, "0");
    return `${year}/${month}/${day}`;
  };

  const handleDateChange = (event: any, selectedDate?: Date) => {
    if (Platform.OS === "android") {
      setShowDatePicker(false);
    }
    if (selectedDate) {
      setBirthday(selectedDate);
    }
  };


  const handleSelectPetImage = () => {
    launchImageLibrary({ mediaType: "photo", quality: 0.8 }, (response) => {
      if (response.assets && response.assets[0].uri) {
        setPetImageUri(response.assets[0].uri);
      }
    });
  };

  const handleSave = async () => {
    if (isSaving || !pet) return;
    if (!name.trim()) {
      Alert.alert("입력 확인", "이름을 입력해 주세요.");
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);

    try {
      const formattedBirthday = birthday ? birthday.toISOString().split("T")[0] : undefined;
      const weight = weightKg.trim() ? parseFloat(weightKg) : undefined;

      const request = {
        name: name.trim(),
        species: (pet.species as PetSpecies) || "DOG",
        breed: breed.trim(),
        gender: (sex as PetGender) || "UNKNOWN",
        birthDate: formattedBirthday,
        neutered: !!isNeutered,
        weightKg: weight,
      };

      await updatePetFull({
        id: petId,
        request,
        profilePictureUri: petImageUri,
      });


      Alert.alert("성공", "반려동물 정보가 수정되었습니다.");
      navigation.goBack();
    } catch (err) {
      console.error(err);
      Alert.alert("오류", "정보 저장에 실패했습니다.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = () => {
    Alert.alert("삭제 확인", "정말 삭제하시겠습니까?", [
      { text: "취소", style: "cancel" },
      {
        text: "삭제",
        style: "destructive",
        onPress: async () => {
          setIsDeleting(true);
          try {
            await deletePet(petId);
            navigation.goBack();
          } catch (err) {
            Alert.alert("오류", "삭제에 실패했습니다.");
          } finally {
            setIsDeleting(false);
          }
        },
      },
    ]);
  };

  if (isLoading) {
    return (
      <View style={[styles.container, styles.loadingContainer]}>
        <ActivityIndicator size="large" color="#0081D5" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.headerRow}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Image source={require("../assets/icon_back.png")} style={styles.backIcon} />
        </TouchableOpacity>
        <Text style={styles.title}>반려동물 프로필</Text>
      </View>

      {!!errorMessage && <Text style={styles.errorText}>{errorMessage}</Text>}

      <View style={styles.imageBox}>
        {petImageUri || pet?.profilePicture ? (
          <Image
            source={{ uri: petImageUri || pet?.profilePicture }}
            style={styles.petImagePlaceholder}
          />
        ) : (
          <View style={styles.petImagePlaceholder} />
        )}
        <TouchableOpacity style={styles.editTag} onPress={handleSelectPetImage}>
          <Text style={styles.editTagText}>사진 수정하기</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.label}>이름</Text>
      <TextInput
        style={styles.input}
        placeholder="이름"
        value={name}
        onChangeText={setName}
      />

      <Text style={styles.label}>견종</Text>
      <TextInput
        style={styles.input}
        placeholder="견종"
        value={breed}
        onChangeText={setBreed}
      />

      <Text style={styles.label}>성별</Text>
      <View style={styles.genderRow}>
        {["FEMALE", "MALE", "UNKNOWN"].map((g) => (
          <TouchableOpacity
            key={g}
            style={[styles.genderBtn, sex === g && styles.radioBtnActive]}
            onPress={() => setSex(g)}
          >
            <Text style={styles.radioText}>
              {g === "FEMALE" ? "여자" : g === "MALE" ? "남자" : "미상"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>생일</Text>
      <TouchableOpacity onPress={() => setShowDatePicker(true)}>
        <View pointerEvents="none">
          <TextInput
            style={styles.input}
            placeholder="생일을 선택해 주세요"
            value={formatBirthdayDisplay()}
            editable={false}
          />
        </View>
      </TouchableOpacity>

      {showDatePicker && (
        <DateTimePicker
          value={birthday || new Date()}
          mode="date"
          display={Platform.OS === "ios" ? "spinner" : "default"}
          onChange={handleDateChange}
          maximumDate={new Date()}
        />
      )}

       <Text style={styles.label}>중성화</Text>
       <View style={styles.row}>
         <TouchableOpacity
           style={[styles.radioBtn, isNeutered === true && styles.radioBtnActive]}
           onPress={() => setIsNeutered(true)}
         >
           <Text style={styles.radioText}>했어요</Text>
         </TouchableOpacity>
         <TouchableOpacity
           style={[styles.radioBtn, isNeutered === false && styles.radioBtnActive]}
           onPress={() => setIsNeutered(false)}
         >
           <Text style={styles.radioText}>안했어요</Text>
         </TouchableOpacity>
       </View>

       <Text style={styles.label}>체중 (kg)</Text>
       <TextInput
         style={styles.input}
         placeholder="체중을 입력해 주세요"
         value={weightKg}
         onChangeText={setWeightKg}
         keyboardType="decimal-pad"
       />

       <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={isSaving}>
        <Text style={styles.saveText}>{isSaving ? "저장 중..." : "저장하기"}</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.deleteBtn} onPress={handleDelete} disabled={isDeleting}>
        <Text style={styles.deleteText}>{isDeleting ? "삭제 중..." : "삭제하기"}</Text>
      </TouchableOpacity>

      <View style={styles.bottomSpacer} />
    </ScrollView>
  );
};

export default PetEditScreen;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff", padding: 20 },
  loadingContainer: { justifyContent: "center", alignItems: "center" },
  headerRow: { flexDirection: "row", alignItems: "center", marginTop: 16 },
  backBtn: { marginRight: 12, marginTop: 14 },
  backIcon: { width: 20, height: 20 },
  title: { fontSize: 20, fontWeight: "700", marginTop: 8, color: "#1F2024" },
  petImagePlaceholder: { width: "100%", height: "100%", backgroundColor: "#E0E0E0", borderRadius: 12 },
  imageBox: { width: "100%", height: 180, backgroundColor: "#f1f1f1", borderRadius: 12, justifyContent: "center", alignItems: "center", marginBottom: 20, marginTop: 20 },
  editTag: { position: "absolute", top: 12, right: 12, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: "#fff", borderRadius: 16, borderWidth: 1, borderColor: "#ddd" },
  editTagText: { fontSize: 12, color: "#444" },
  label: { fontSize: 18, fontWeight: "600", marginBottom: 16, marginTop: 20, color: "#2F3036" },
  input: { padding: 16, backgroundColor: "#F3F4F5", borderRadius: 10, fontSize: 16, color: "#7B7C7D", fontWeight: "500" },
  row: { flexDirection: "row", justifyContent: "space-between", marginTop: 6 },
  genderRow: { flexDirection: "row", justifyContent: "space-between", gap: 8, marginTop: 6 },
  genderBtn: { flex: 1, paddingVertical: 14, borderRadius: 10, borderWidth: 1, borderColor: "#ddd", alignItems: "center" },
  radioBtn: { flex: 1, paddingVertical: 14, borderRadius: 10, borderWidth: 1, borderColor: "#ddd", alignItems: "center", marginHorizontal: 4 },
  radioBtnActive: { borderColor: "#0081D5", backgroundColor: "#EEF7FD" },
  radioText: { color: "#1F2024", fontSize: 16 },
  saveBtn: { backgroundColor: "#0081D5", paddingVertical: 16, borderRadius: 12, alignItems: "center", marginTop: 30 },
  deleteBtn: { marginTop: 12, borderWidth: 1, borderColor: "#EF5F5F", borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  deleteText: { color: "#EF5F5F", fontSize: 16, fontWeight: "500" },
  saveText: { color: "#fff", fontSize: 16, fontWeight: "500" },
  errorText: { fontSize: 12, color: "#EF5F5F", marginTop: 8 },
  bottomSpacer: { height: 60 },
});
