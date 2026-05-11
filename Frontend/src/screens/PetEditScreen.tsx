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
} from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";
import type { RootStackParamList } from "../../App";
import {
  getPetDetail,
  PetListItem,
  updatePetFull,
  updatePetPartial,
  deletePet,
  PetGender,
  PetSpecies,
} from "../api/pets";

const PetEditScreen = () => {
  const navigation = useNavigation();
  const route = useRoute<RouteProp<RootStackParamList, "PetEdit">>();
  const { petId } = route.params;

  const [pet, setPet] = useState<PetListItem | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [breed, setBreed] = useState("");
  const [sex, setSex] = useState<PetGender | null>(null);
  const [birthYear, setBirthYear] = useState("");
  const [birthMonth, setBirthMonth] = useState("");
  const [birthDay, setBirthDay] = useState("");
  const [isNeutered, setIsNeutered] = useState<boolean | null>(null);

  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const normalizeGender = (value?: string | null): PetGender | null => {
    if (!value) return null;

    const normalized = value.toUpperCase();

    if (normalized.includes("FEMALE") || normalized.includes("여")) return "FEMALE";
    if (normalized.includes("MALE") || normalized.includes("남")) return "MALE";
    if (normalized.includes("UNKNOWN") || normalized.includes("미상")) return "UNKNOWN";

    return null;
  };

  const normalizeSpecies = (value?: string | null): PetSpecies | null => {
    if (!value) return null;

    const normalized = value.toUpperCase();

    if (normalized.includes("DOG") || normalized.includes("강아지")) return "DOG";
    if (normalized.includes("CAT") || normalized.includes("고양이")) return "CAT";

    return null;
  };

  const formatBirthDate = (value?: string | null) => {
    if (!value) return "";
    const [datePart] = value.split("T");
    return datePart;
  };

  const getPetBirthday = (data: PetListItem) => {
    return formatBirthDate(data.birthday ?? data.birthDate);
  };

  const getPetGender = (data: PetListItem) => {
    return normalizeGender(data.gender ?? data.sex);
  };

  useEffect(() => {
    let isMounted = true;

    const loadPet = async () => {
      setIsLoading(true);
      setErrorMessage(null);

      try {
        const data = await getPetDetail(petId);

        if (!isMounted) return;

        setPet(data);
        setName(data.name ?? "");
        setBreed(data.breed ?? "");
        setSex(getPetGender(data));
        setIsNeutered(data.neutered ?? false);

        const birthday = getPetBirthday(data);
        if (birthday) {
          const [year, month, day] = birthday.split("-");
          setBirthYear(year ?? "");
          setBirthMonth(month ?? "");
          setBirthDay(day ?? "");
        }
      } catch (error) {
        if (!isMounted) return;

        const message =
          error instanceof Error
            ? error.message
            : "반려동물 정보를 불러오지 못했습니다.";

        setErrorMessage(message);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    loadPet();

    return () => {
      isMounted = false;
    };
  }, [petId]);

  const buildBirthday = () => {
    if (!birthYear || !birthMonth || !birthDay) return "";

    const month = birthMonth.padStart(2, "0");
    const day = birthDay.padStart(2, "0");

    return `${birthYear}-${month}-${day}`;
  };

  const buildPartialRequest = (birthday: string) => {
    if (!pet) return null;

    const request: Record<string, unknown> = {};

    const originalGender = getPetGender(pet);
    const originalBirthday = getPetBirthday(pet);
    const originalNeutered = pet.neutered ?? false;

    if (name.trim() && name.trim() !== pet.name) {
      request.name = name.trim();
    }

    if (breed.trim() !== (pet.breed ?? "")) {
      request.breed = breed.trim();
    }

    if (sex && sex !== originalGender) {
      request.gender = sex;
    }

    if (birthday && birthday !== originalBirthday) {
      request.birthday = birthday;
    }

    if (isNeutered !== null && isNeutered !== originalNeutered) {
      request.neutered = isNeutered;
    }

    return request;
  };

  const handleSave = async () => {
    if (isSaving) return;

    if (!pet) {
      setErrorMessage("반려동물 정보를 불러오지 못했습니다.");
      return;
    }

    const species = normalizeSpecies(pet.species);

    if (!species) {
      setErrorMessage("반려동물 종 정보가 필요합니다.");
      return;
    }

    if (!sex) {
      setErrorMessage("성별을 선택해 주세요.");
      return;
    }

    const birthday = buildBirthday();

    if (!birthday) {
      setErrorMessage("생일을 입력해 주세요.");
      return;
    }

    if (isNeutered === null) {
      setErrorMessage("중성화 여부를 선택해 주세요.");
      return;
    }

    const partialRequest = buildPartialRequest(birthday);

    if (!partialRequest || Object.keys(partialRequest).length === 0) {
      setErrorMessage("변경된 내용이 없습니다.");
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);

    try {
      const shouldUsePatch = Object.keys(partialRequest).length < 6;

      const updated = shouldUsePatch
        ? await updatePetPartial({
            id: petId,
            request: partialRequest,
          })
        : await updatePetFull({
            id: petId,
            request: {
              name: name.trim() || pet.name || "",
              species,
              breed: breed.trim() || undefined,
              gender: sex,
              birthday,
              neutered: isNeutered,
              weightKg: pet.weightKg ?? undefined,
            },
          });

      setPet(updated);
      setName(updated.name ?? "");
      setBreed(updated.breed ?? "");
      setSex(getPetGender(updated) ?? sex);
      setIsNeutered(updated.neutered ?? isNeutered);

      const updatedBirthday = getPetBirthday(updated);
      if (updatedBirthday) {
        const [year, month, day] = updatedBirthday.split("-");
        setBirthYear(year ?? "");
        setBirthMonth(month ?? "");
        setBirthDay(day ?? "");
      }

      Alert.alert("저장 완료", "반려동물 정보가 수정되었습니다.");
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "반려동물 정보를 저장하지 못했습니다.";

      setErrorMessage(message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = () => {
    if (isDeleting) return;

    Alert.alert("반려동물 삭제", "정말 삭제할까요?", [
      { text: "취소", style: "cancel" },
      {
        text: "삭제",
        style: "destructive",
        onPress: async () => {
          setIsDeleting(true);
          setErrorMessage(null);

          try {
            await deletePet(petId);
            navigation.goBack();
          } catch (error) {
            const message =
              error instanceof Error
                ? error.message
                : "반려동물을 삭제하지 못했습니다.";

            setErrorMessage(message);
          } finally {
            setIsDeleting(false);
          }
        },
      },
    ]);
  };

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.headerRow}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Image
            source={require("../assets/icon_back.png")}
            style={styles.backIcon}
          />
        </TouchableOpacity>

        <Text style={styles.title}>반려동물 프로필</Text>
      </View>

      {isLoading && (
        <Text style={styles.helperText}>반려동물 정보를 불러오는 중...</Text>
      )}

      {!!errorMessage && !isLoading && (
        <Text style={styles.errorText}>{errorMessage}</Text>
      )}

      <View style={styles.imageBox}>
        <View style={styles.petImagePlaceholder} />
        <TouchableOpacity style={styles.editTag}>
          <Text style={styles.editTagText}>수정하기</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.label}>이름</Text>
      <TextInput
        style={styles.input}
        placeholder="이름"
        placeholderTextColor="#999"
        value={name}
        onChangeText={setName}
      />

      <Text style={styles.label}>견종</Text>
      <TextInput
        style={styles.input}
        placeholder="견종"
        placeholderTextColor="#999"
        value={breed}
        onChangeText={setBreed}
      />

      <Text style={styles.label}>성별</Text>
      <View style={styles.row}>
        <TouchableOpacity
          style={[styles.radioBtn, sex === "FEMALE" && styles.radioBtnActive]}
          onPress={() => setSex("FEMALE")}
        >
          <Text style={styles.radioText}>여자</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.radioBtn, sex === "MALE" && styles.radioBtnActive]}
          onPress={() => setSex("MALE")}
        >
          <Text style={styles.radioText}>남자</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.radioBtn, sex === "UNKNOWN" && styles.radioBtnActive]}
          onPress={() => setSex("UNKNOWN")}
        >
          <Text style={styles.radioText}>미상</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.label}>생일</Text>
      <View style={styles.row}>
        <TextInput
          style={styles.birthInput}
          placeholder="2020"
          placeholderTextColor="#999"
          value={birthYear}
          onChangeText={setBirthYear}
          keyboardType="number-pad"
        />

        <TextInput
          style={styles.birthInput}
          placeholder="8"
          placeholderTextColor="#999"
          value={birthMonth}
          onChangeText={setBirthMonth}
          keyboardType="number-pad"
        />

        <TextInput
          style={styles.birthInput}
          placeholder="22"
          placeholderTextColor="#999"
          value={birthDay}
          onChangeText={setBirthDay}
          keyboardType="number-pad"
        />
      </View>

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

      <Text style={styles.label}>보건정보</Text>
      <View style={styles.row}>
        <TouchableOpacity style={styles.healthTag}>
          <Text style={{ color: "#fff" }}>치주염</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.addTagBtn}>
          <Text style={styles.addTagText}>＋</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={styles.saveBtn}
        onPress={handleSave}
        disabled={isSaving}
      >
        <Text style={styles.saveText}>
          {isSaving ? "저장 중..." : "저장하기"}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.deleteBtn}
        onPress={handleDelete}
        disabled={isDeleting}
      >
        <Text style={styles.deleteText}>
          {isDeleting ? "삭제 중..." : "삭제하기"}
        </Text>
      </TouchableOpacity>

      <View style={{ height: 60 }} />
    </ScrollView>
  );
};

export default PetEditScreen;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff", padding: 20 },

  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 16,
  },

  backBtn: {
    marginRight: 12,
    marginTop: 14,
  },

  backIcon: { width: 20, height: 20 },

  title: {
    fontSize: 20,
    fontWeight: "700",
    marginTop: 8,
    color: "#1F2024",
  },

  petImagePlaceholder: {
    width: "100%",
    height: "100%",
    backgroundColor: "#E0E0E0",
    borderRadius: 12,
  },

  imageBox: {
    width: "100%",
    height: 180,
    backgroundColor: "#f1f1f1",
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
    marginTop: 20,
  },

  editTag: {
    position: "absolute",
    top: 12,
    right: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#ddd",
  },

  editTagText: { fontSize: 12, color: "#444" },

  label: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 16,
    marginTop: 20,
    color: "#2F3036",
  },

  input: {
    padding: 16,
    backgroundColor: "#F3F4F5",
    borderRadius: 10,
    fontSize: 16,
    color: "#7B7C7D",
    fontWeight: "500",
  },

  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 6,
  },

  radioBtn: {
    width: "48%",
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#ddd",
    alignItems: "center",
  },

  radioBtnActive: {
    borderColor: "#0081D5",
    backgroundColor: "#EEF7FD",
  },

  radioText: {
    color: "#1F2024",
    fontSize: 16,
  },

  birthInput: {
    width: "30%",
    backgroundColor: "#F3F4F5",
    padding: 14,
    borderRadius: 10,
    textAlign: "center",
    fontSize: 16,
    color: "#7B7C7D",
    fontWeight: "500",
  },

  healthTag: {
    backgroundColor: "#0081D5",
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: 20,
  },

  addTagBtn: {
    width: 32,
    height: 32,
    borderRadius: 20,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#0081D5",
    justifyContent: "center",
    alignItems: "center",
  },

  addTagText: {
    fontSize: 18,
    color: "#0081D5",
    marginTop: -4,
  },

  saveBtn: {
    backgroundColor: "#0081D5",
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 30,
  },

  deleteBtn: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: "#EF5F5F",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },

  deleteText: {
    color: "#EF5F5F",
    fontSize: 16,
    fontWeight: "500",
  },

  saveText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "500",
  },

  helperText: {
    fontSize: 12,
    color: "#7B7C7D",
    marginTop: 8,
  },

  errorText: {
    fontSize: 12,
    color: "#EF5F5F",
    marginTop: 8,
  },
});