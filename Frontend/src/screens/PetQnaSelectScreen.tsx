import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../App';
import { SPECIES_META, PetSpecies } from '../data/petQna';

type NavProp = NativeStackNavigationProp<RootStackParamList, 'PetQnaSelect'>;

const SPECIES_LIST: PetSpecies[] = ['dog', 'cat'];

const PetQnaSelectScreen = () => {
  const navigation = useNavigation<NavProp>();

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      {/* NavBar */}
      <View style={styles.navBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backRow}>
          <Image source={require('../assets/icon_navBack.png')} style={styles.backIcon} />
          <Text style={styles.navTitle}>반려동물 지식 Q&A</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.headline}>어떤 아이가 궁금하세요?</Text>
        <Text style={styles.headlineDesc}>동물을 선택하면 관련 지식을 Q&A로 볼 수 있어요.</Text>

        <View style={styles.cardList}>
          {SPECIES_LIST.map((species) => {
            const { label, desc, image } = SPECIES_META[species];
            return (
              <TouchableOpacity
                key={species}
                style={styles.speciesCard}
                activeOpacity={0.8}
                onPress={() => navigation.navigate('PetQnaList', { species })}
              >
                <Image source={image} style={styles.speciesImage} />
                <View style={styles.speciesTextBox}>
                  <Text style={styles.speciesLabel}>{label}</Text>
                  <Text style={styles.speciesDesc}>{desc}</Text>
                </View>
                <Image source={require('../assets/icon_right.png')} style={styles.chevron} />
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

export default PetQnaSelectScreen;

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

  headline: { fontSize: 24, fontWeight: '700', color: '#000', lineHeight: 34, marginBottom: 6 },
  headlineDesc: { fontSize: 14, fontWeight: '500', color: '#7B7C7D', lineHeight: 22, marginBottom: 24 },

  cardList: { gap: 16 },

  speciesCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 22,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 1,
  },
  speciesImage: { width: 56, height: 56, borderRadius: 16 },
  speciesTextBox: { flex: 1, gap: 2 },
  speciesLabel: { fontSize: 18, fontWeight: '600', color: '#000' },
  speciesDesc: { fontSize: 14, fontWeight: '500', color: '#7B7C7D' },
  chevron: { width: 20, height: 20, tintColor: '#B3B6B8' },
});
