import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import type { RootStackParamList } from '../../App';
import { PET_QNA, SPECIES_META } from '../data/petQna';

type NavProp = NativeStackNavigationProp<RootStackParamList, 'PetQnaList'>;
type RoutePropType = RouteProp<RootStackParamList, 'PetQnaList'>;

const PetQnaListScreen = () => {
  const navigation = useNavigation<NavProp>();
  const route = useRoute<RoutePropType>();
  const { species } = route.params;

  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const items = PET_QNA[species];
  const { label } = SPECIES_META[species];

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      {/* NavBar */}
      <View style={styles.navBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backRow}>
          <Image source={require('../assets/icon_navBack.png')} style={styles.backIcon} />
          <Text style={styles.navTitle}>{label} 지식 Q&A</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.guide}>궁금한 질문을 눌러 자세한 답변을 확인해 보세요.</Text>

        <View style={styles.qnaList}>
          {items.map((item, index) => {
            const open = openIndex === index;
            return (
              <View key={item.question} style={styles.qnaCard}>
                <TouchableOpacity
                  style={styles.questionRow}
                  activeOpacity={0.8}
                  onPress={() => setOpenIndex(open ? null : index)}
                >
                  <Text style={styles.qMark}>Q</Text>
                  <Text style={styles.questionText}>{item.question}</Text>
                  <Text style={styles.toggleIcon}>{open ? '−' : '+'}</Text>
                </TouchableOpacity>

                {open && (
                  <View style={styles.answerBox}>
                    <Text style={styles.aMark}>A</Text>
                    <Text style={styles.answerText}>{item.answer}</Text>
                  </View>
                )}
              </View>
            );
          })}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

export default PetQnaListScreen;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fff' },

  navBar: {
    height: 56,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#EAECEE',
  },
  backRow: { flexDirection: 'row', alignItems: 'center' },
  backIcon: { width: 20, height: 20, tintColor: '#1F2024', marginRight: 12 },
  navTitle: { fontSize: 20, fontWeight: '600', color: '#1F2024' },

  scroll: { flex: 1, backgroundColor: '#F3F4F5' },
  content: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 40 },

  guide: { fontSize: 14, fontWeight: '500', color: '#7B7C7D', lineHeight: 22, marginBottom: 16 },

  qnaList: { gap: 12 },

  qnaCard: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 1,
  },

  questionRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 18,
  },
  qMark: { fontSize: 16, fontWeight: '700', color: '#0081D5', lineHeight: 24 },
  questionText: { flex: 1, fontSize: 16, fontWeight: '600', color: '#000', lineHeight: 24 },
  toggleIcon: { fontSize: 20, color: '#7B7C7D', lineHeight: 24, width: 24, textAlign: 'center' },

  answerBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 20,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.06)',
  },
  aMark: { fontSize: 16, fontWeight: '700', color: '#FFC94D', lineHeight: 24 },
  answerText: { flex: 1, fontSize: 14, fontWeight: '500', color: '#3C4144', lineHeight: 24 },
});
