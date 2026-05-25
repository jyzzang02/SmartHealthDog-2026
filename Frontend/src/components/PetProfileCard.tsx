import React from "react";
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  ImageSourcePropType,
} from "react-native";
import BlueButton from "./BlueButton";

interface PetProfileCardProps {
  name: string;
  type: string;
  gender: string;
  birth: string;
  imageUrl?: string | ImageSourcePropType | null;
  healthInfo?: string[];
  condition: string;
  onPressHistory?: () => void;
  onPressEdit?: () => void;
}

const PetProfileCard: React.FC<PetProfileCardProps> = ({
  name,
  type,
  gender,
  birth,
  imageUrl,
  healthInfo = [],
  condition,
  onPressHistory,
  onPressEdit,
}) => {
  const hasImage = Boolean(imageUrl);
  const imageSource: ImageSourcePropType | undefined =
    typeof imageUrl === "string"
      ? { uri: imageUrl }
      : imageUrl ?? undefined;

  return (
    <View style={styles.cardWrapper}>
      <View style={styles.card}>
        <TouchableOpacity style={styles.editBtn} onPress={onPressEdit}>
          <Image
            source={require("../assets/icon_edit.png")}
            style={styles.editIcon}
          />
        </TouchableOpacity>

        {hasImage ? (
          <Image
            source={imageSource}
            style={styles.petImage}
          />
        ) : (
          <View style={styles.petCircle} />
        )}

        <Text style={styles.petName}>{name}</Text>
        <Text style={styles.petInfo}>{`${type} / ${gender} / ${birth}`}</Text>

        <View style={styles.healthRow}>
          <Text style={styles.label}>보건정보 :</Text>
          <View style={styles.tagRow}>
            {healthInfo.map((item, idx) => (
              <BlueButton
                type="tag"
                key={idx}
                text={item}
                textColor="#FFFFFF"
                fontSize={14}
                style={styles.healthTag}
                paddingVertical={4}
                paddingHorizontal={12}
              />
            ))}
          </View>
        </View>

        <View style={styles.row}>
          <Text style={styles.label}>건강상태 :</Text>
          <Text style={styles.conditionText}>{condition}</Text>
        </View>

        <TouchableOpacity style={styles.historyBtn} onPress={onPressHistory}>
          <Text style={styles.historyBtnText}>최근 진단이력 보러가기</Text>
          <Image
            source={require("../assets/icon_right.png")}
            style={styles.smallRightIcon}
          />
        </TouchableOpacity>
      </View>
    </View>
  );
};

export default PetProfileCard;

const styles = StyleSheet.create({
  cardWrapper: {
    width: "100%",
    alignSelf: "stretch",
  },

  card: {
    marginTop: 16,
    padding: 20,
    backgroundColor: "#FAFDFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#7DBFEA",
  },

  editBtn: {
    position: "absolute",
    top: 20,
    right: 20,
    width: 24,
    height: 24,
    borderRadius: 16,
    backgroundColor: "#F1F1F1",
    alignItems: "center",
    justifyContent: "center",
  },

  editIcon: {
    width: 12,
    height: 12,
    tintColor: "#666",
  },

  petImage: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignSelf: "center",
  },

  petCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#E0E0E0",
    alignSelf: "center",
  },

  petName: {
    fontSize: 18,
    fontWeight: "600",
    textAlign: "center",
    color: "#040505",
    marginTop: 20,
  },

  petInfo: {
    textAlign: "center",
    color: "#777",
    marginTop: 4,
    fontSize: 16,
  },

  row: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 12,
  },

  label: {
    fontWeight: "600",
    fontSize: 16,
    marginRight: 6,
    color: "#333",
  },

  healthRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 20,
  },

  tagRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 4,
  },

  conditionText: {
    color: "#4A90E2",
    fontWeight: "600",
    fontSize: 16,
  },

  historyBtn: {
    marginTop: 20,
    backgroundColor: "#EEF7FD",
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
  },

  historyBtnText: {
    color: "#0081D5",
    fontWeight: "600",
    lineHeight: 18,
    fontSize: 14,
  },

  smallRightIcon: {
    width: 12,
    height: 12,
    tintColor: "#0081D5",
    marginLeft: 8,
  },

  healthTag: {
    marginRight: 8,
    marginBottom: 6,
  },
});
