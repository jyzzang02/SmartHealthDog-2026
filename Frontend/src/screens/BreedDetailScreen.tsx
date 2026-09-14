import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import type { RouteProp } from '@react-navigation/native';
import type { RootStackParamList } from '../../App';
import { getBreedSections, RISK_LEVEL_COLOR, LEVEL_DESC } from '../data/breedDiseases';

type NavProp = StackNavigationProp<RootStackParamList, 'BreedDetail'>;
type RoutePropType = RouteProp<RootStackParamList, 'BreedDetail'>;

const BreedDetailScreen = () => {
  const navigation = useNavigation<NavProp>();
  const route = useRoute<RoutePropType>();
  const { breedName } = route.params;

  const sections = getBreedSections(breedName);

  return (
    <View style={styles.screen}>
      {/* NavBar */}
      <View style={styles.navBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backRow}>
          <Image source={require('../assets/icon_navBack.png')} style={styles.backIcon} />
          <Text style={styles.navTitle}>{breedName} 혈통 위험도</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* 견종 개요 카드 */}
        <View style={styles.overviewCard}>
          <Text style={styles.overviewTitle}>견종 개요</Text>
          <Text style={styles.overviewDesc}>
            {breedName}의 유전적 질환 위험을 위험도별로 분류했어요. 정기 검진과 예방 관리에 참고하세요.
          </Text>
        </View>

        {/* 위험도 섹션 */}
        <View style={styles.sectionList}>
          {sections.map((section) => {
            const color = RISK_LEVEL_COLOR[section.level];
            return (
              <View key={section.title}>
                <View style={styles.sectionHeaderRow}>
                  <View style={[styles.sectionDot, { backgroundColor: color }]} />
                  <Text style={styles.sectionTitle}>{section.title}</Text>
                  <Text style={styles.sectionCount}>({section.items.length})</Text>
                </View>
                <Text style={styles.sectionDesc}>{LEVEL_DESC[section.level]}</Text>

                {section.items.length === 0 ? (
                  <View style={styles.emptyCard}>
                    <Text style={styles.emptyCardText}>해당 항목 없음</Text>
                  </View>
                ) : (
                  <View style={styles.diseaseList}>
                    {section.items.map((name) => (
                      <View key={name} style={[styles.diseaseCard, { borderLeftColor: color }]}>
                        <Text style={styles.diseaseName}>{name}</Text>
                        <View style={[styles.diseaseBadge, { backgroundColor: color }]}>
                          <Text style={styles.diseaseBadgeText}>{section.level}</Text>
                        </View>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
};

export default BreedDetailScreen;

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
  content: { padding: 20 },

  overviewCard: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#EAECEE',
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 1,
  },
  overviewTitle: { fontSize: 16, color: '#2F3036', marginBottom: 6 },
  overviewDesc: { fontSize: 14, color: '#7B7C7D', lineHeight: 21 },

  sectionList: { gap: 20 },

  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  sectionDot: { width: 8, height: 8, borderRadius: 999 },
  sectionTitle: { fontSize: 15, color: '#2F3036' },
  sectionCount: { fontSize: 13, color: '#7B7C7D' },
  sectionDesc: {
    fontSize: 12,
    color: '#7B7C7D',
    lineHeight: 18,
    marginBottom: 8,
    paddingLeft: 4,
  },

  emptyCard: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#EAECEE',
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  emptyCardText: { fontSize: 13, color: '#B3B6B8' },

  diseaseList: { gap: 8 },
  diseaseCard: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#EAECEE',
    borderLeftWidth: 3,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 18,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 1,
  },
  diseaseName: { fontSize: 14, color: '#2F3036', flex: 1, marginRight: 8 },
  diseaseBadge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  diseaseBadgeText: { fontSize: 11, color: '#fff' },
});
