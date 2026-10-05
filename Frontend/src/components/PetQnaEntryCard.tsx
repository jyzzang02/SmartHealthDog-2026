import React from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../App';

const rightIcon = require('../assets/icon_right.png');

const PetQnaEntryCard: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  return (
    <TouchableOpacity
      style={styles.container}
      activeOpacity={0.8}
      onPress={() => navigation.navigate('PetQnaSelect')}
    >
      <Text style={styles.title}>반려동물 지식 Q&A</Text>
      <Text style={styles.description}>고양이·강아지 궁금증을 Q&A로 확인해 보세요.</Text>

      <View style={styles.linkBox}>
        <Text style={styles.linkText}>고양이 · 강아지 지식 보러가기</Text>
        <Image source={rightIcon} style={styles.linkIcon} />
      </View>
    </TouchableOpacity>
  );
};

export default PetQnaEntryCard;

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20,
    paddingVertical: 24,
    marginHorizontal: 20,
    marginTop: 32,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },

  title: { fontSize: 20, fontWeight: '600', color: '#000', lineHeight: 24, marginBottom: 4 },

  description: { fontSize: 14, fontWeight: '500', color: '#7B7C7D', lineHeight: 22, marginBottom: 16 },

  linkBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#EEF7FD',
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },

  linkText: { fontSize: 14, fontWeight: '600', color: '#0081D5', lineHeight: 22 },

  linkIcon: { width: 18, height: 18, tintColor: '#0081D5' },
});
