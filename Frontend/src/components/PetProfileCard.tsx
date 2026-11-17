import React from "react";
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  ImageSourcePropType,
} from "react-native";
import { STAGES, type CheckStage } from "../data/selfCheck";
import { resolveImageUri } from "../utils/imageUri";
import { getSeoulDateKey } from "../utils/walkWeek";

type ConditionRecord = { label: string; date?: string; stage?: CheckStage };

interface PetProfileCardProps {
  name: string;
  type: string;
  gender: string;
  birth: string;
  imageUrl?: string | ImageSourcePropType | null;
  weightKg?: number;
  checkupDate?: string;
  condition?: string;
  conditionRecords?: ConditionRecord[];
  onPressHistory?: () => void;
  onPressHealthInput?: () => void;
  onPressEdit?: () => void;
}

const getAgeLabel = (birth: string) => {
  const date = birth.split("T")[0];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return undefined;
  const parsed = new Date(date + "T00:00:00Z");
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) return undefined;
  const today = getSeoulDateKey();
  if (date > today) return undefined;
  const years = Number(today.slice(0, 4)) - Number(date.slice(0, 4))
    - (today.slice(5) < date.slice(5) ? 1 : 0);
  if (years > 0) return years + "살";

  const months = (Number(today.slice(0, 4)) - Number(date.slice(0, 4))) * 12
    + Number(today.slice(5, 7)) - Number(date.slice(5, 7))
    - (today.slice(8) < date.slice(8) ? 1 : 0);
  return months === 0 ? "1개월 미만" : months + "개월";
};

const PetProfileCard: React.FC<PetProfileCardProps> = ({
  name, type, gender, birth, imageUrl, weightKg, checkupDate = "기록 없음",
  condition, conditionRecords, onPressHistory, onPressHealthInput, onPressEdit,
}) => {
  const uri = typeof imageUrl === "string" ? resolveImageUri(imageUrl) : undefined;
  const imageSource = typeof imageUrl === "string" ? (uri ? { uri } : undefined) : imageUrl ?? undefined;
  const hasConditions = Boolean(conditionRecords?.length);
  const details = [gender, getAgeLabel(birth)].filter(Boolean).join(" · ");

  return (
    <View style={styles.card}>
      <View style={styles.identity}>
        {imageSource ? <Image source={imageSource} style={styles.petImage} /> : <View style={styles.petImage} />}
        <View style={styles.identityText}>
          <Text style={styles.petName}>{name}</Text>
          {!!(type || details) && (
            <View style={styles.petInfoRow}>
              {!!type && <Text numberOfLines={1} style={[styles.petInfo, styles.petBreed]}>{type}</Text>}
              {!!details && <Text style={styles.petInfo}>{(type ? "· " : "") + details}</Text>}
            </View>
          )}
          {weightKg !== undefined && <Text style={styles.weight}>{"체중 " + weightKg + "kg"}</Text>}
        </View>
        {!!onPressEdit && (
          <TouchableOpacity style={styles.editBtn} accessibilityRole="button" accessibilityLabel="반려동물 프로필 수정"
            onPress={onPressEdit}>
            <Image source={require("../assets/icon_edit.png")} style={styles.editIcon} />
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.checkupRow}>
        <Text style={styles.label}>최근 검진일</Text>
        <Text style={[styles.checkupDate, checkupDate === "기록 없음" && styles.muted]}>{checkupDate}</Text>
      </View>

      {(conditionRecords !== undefined || !!condition) && (
        <View style={styles.conditions}>
          <Text style={[styles.label, styles.conditionHeading]}>건강상태</Text>
          {hasConditions ? conditionRecords?.map(({ label, date, stage }) => (
            <View key={label} style={styles.conditionItem}>
              <View style={styles.conditionLine}>
                <Text style={styles.conditionLabel}>{label}</Text>
                <Text style={styles.conditionDate}>{date ?? "기록 없음"}</Text>
              </View>
              {!!stage && <Text style={[styles.conditionStage, { color: STAGES[stage].color, backgroundColor: STAGES[stage].bg }]}>
                {stage + "단계 · " + STAGES[stage].label}
              </Text>}
            </View>
          )) : <Text style={styles.conditionDate}>{condition ?? "기록 없음"}</Text>}
        </View>
      )}

      <View style={styles.actions}>
        <TouchableOpacity style={[styles.actionButton, styles.historyBtn]} accessibilityRole="button" onPress={onPressHistory}>
          <Text style={styles.historyBtnText}>최근 진단이력 보러가기</Text>
        </TouchableOpacity>
        {!!onPressHealthInput && (
          <TouchableOpacity style={[styles.actionButton, styles.healthInputBtn]} accessibilityRole="button"
            onPress={onPressHealthInput} activeOpacity={0.8}>
            <Text style={[styles.historyBtnText, styles.healthInputBtnText]}>검진 정보 입력</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

export default PetProfileCard;

const styles = StyleSheet.create({
  card: { width: "100%", marginTop: 20, padding: 18, borderRadius: 16,
    borderWidth: 1, borderColor: "#D6E8F4", backgroundColor: "#F8FBFE", gap: 12 },
  identity: { flexDirection: "row", alignItems: "center", gap: 10 },
  petImage: { width: 64, height: 64, borderRadius: 32, backgroundColor: "#E5EDF3" },
  identityText: { flex: 1, gap: 3 },
  petName: { fontSize: 18, fontWeight: "800", color: "#142C42" },
  petInfoRow: { flexDirection: "row", alignItems: "baseline", gap: 4 },
  petBreed: { flexShrink: 1 },
  petInfo: { fontSize: 12, lineHeight: 16, color: "#526679" },
  weight: { alignSelf: "flex-start", marginTop: 5, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 7,
    backgroundColor: "#E7F2FD", color: "#075B9D", fontSize: 12, fontWeight: "700" },
  editBtn: { alignSelf: "flex-start", width: 36, height: 36, borderRadius: 12, backgroundColor: "#EDF3F8", alignItems: "center", justifyContent: "center" },
  editIcon: { width: 13, height: 13, tintColor: "#48647B" },
  checkupRow: { minHeight: 34, paddingHorizontal: 9, paddingVertical: 6, backgroundColor: "#EAF4FD",
    flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 5, borderRadius: 9 },
  label: { color: "#142C42", fontSize: 13, fontWeight: "700" },
  checkupDate: { color: "#075B9D", fontSize: 13, fontWeight: "700", flexShrink: 1 },
  muted: { color: "#526679" },
  conditions: { paddingHorizontal: 10, paddingVertical: 8, gap: 5, backgroundColor: "#FFFFFF", borderRadius: 9 },
  conditionHeading: { marginBottom: 4 },
  conditionItem: { gap: 3 },
  conditionLine: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 3 },
  conditionLabel: { fontSize: 12, color: "#385470", fontWeight: "600" },
  conditionDate: { fontSize: 12, color: "#385470" },
  conditionStage: { alignSelf: "flex-start", fontSize: 12, fontWeight: "700", paddingHorizontal: 7, paddingVertical: 3, borderRadius: 7 },
  actions: { flexDirection: "row", gap: 6 },
  actionButton: { minHeight: 44, justifyContent: "center", alignItems: "center", borderRadius: 9, padding: 5 },
  historyBtn: { flex: 1.35, backgroundColor: "#E8F3FD" },
  healthInputBtn: { flex: 1, backgroundColor: "#FFF3D5" },
  historyBtnText: { color: "#075B9D", fontWeight: "700", fontSize: 12, textAlign: "center", flexShrink: 1 },
  healthInputBtnText: { color: "#80540B" },
});
