import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  ActivityIndicator,
  ScrollView,
  Dimensions,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { getMyPets, PetListItem } from '../api/pets';

const SCREEN_WIDTH = Dimensions.get('window').width;
const CARD_WIDTH = SCREEN_WIDTH - 40;
const CARD_SPACING = 12;

const PetHealthCard = () => {
  const [pets, setPets] = useState<PetListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);

  const loadPets = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getMyPets();
      setPets(data);
    } catch (error) {
      console.error('Failed to load pets:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPets();
  }, [loadPets]);

  useFocusEffect(
    useCallback(() => {
      loadPets();
    }, [loadPets])
  );

  if (loading) {
    return (
      <View style={[styles.card, { justifyContent: 'center' }]}>
        <ActivityIndicator size="small" color="#0081D5" />
      </View>
    );
  }

  if (pets.length === 0) {
    return (
      <View style={styles.card}>
        <Text style={styles.emptyText}>등록된 반려동물이 없습니다.</Text>
      </View>
    );
  }

  const petCards = pets.map((pet) => ({
    id: pet.id,
    name: pet.name,
    subtitle: `${pet.breed || pet.species}, ${pet.weightKg || 0}kg`,
    weight: pet.weightKg || 0,
    profilePicture: pet.profilePicture || null,
  }));

  return (
    <View style={styles.carouselWrap}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        snapToInterval={CARD_WIDTH + CARD_SPACING}
        snapToAlignment="start"
        contentContainerStyle={styles.scrollContent}
        onScroll={(e) => {
          const index = Math.round(
            e.nativeEvent.contentOffset.x / (CARD_WIDTH + CARD_SPACING)
          );
          setCurrentIndex(index);
        }}
        scrollEventThrottle={16}
      >
        {petCards.map((pet) => (
          <View key={pet.id} style={[styles.card, { width: CARD_WIDTH }]}>
            <Image
              source={
                pet.profilePicture
                  ? { uri: pet.profilePicture }
                  : require('../assets/img_emblem.png')
              }
              style={styles.profileImage}
            />

            <View style={styles.contentBox}>
              <View style={styles.nameRow}>
                <Text style={styles.name}>{pet.name}</Text>
              </View>

              <Text style={styles.subInfo}>{pet.subtitle}</Text>

              <View style={styles.tagRow}>
                <View style={styles.tagBlue}>
                  <Text style={styles.tagTextBlue}>체중 {pet.weight}kg</Text>
                </View>
              </View>
            </View>
          </View>
        ))}
      </ScrollView>

      {petCards.length > 1 && (
        <View style={styles.dotContainer}>
          {petCards.map((pet, index) => (
            <View
              key={pet.id}
              style={[styles.dot, currentIndex === index && styles.activeDot]}
            />
          ))}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  carouselWrap: {
    width: '100%',
  },
  scrollContent: {
    paddingRight: 0,
  },
  card: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
    marginRight: CARD_SPACING,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#DCDEE0',
    backgroundColor: '#FFFFFF',
    minHeight: 92,
  },
  profileImage: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#ECECEC',
  },
  contentBox: {
    flexDirection: 'column',
    justifyContent: 'center',
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  name: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111',
  },
  subInfo: {
    fontSize: 14,
    fontWeight: '500',
    color: '#777',
    marginTop: 4,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 2,
  },
  tagBlue: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: '#0081D5',
    borderRadius: 32,
  },
  tagTextBlue: {
    fontSize: 14,
    color: '#FFF',
    marginBottom: 2,
  },
  dotContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 12,
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 8,
    backgroundColor: '#D0D5DD',
  },
  activeDot: {
    backgroundColor: '#0081D5',
  },
  emptyText: {
    fontSize: 14,
    color: '#777',
    textAlign: 'center',
    width: '100%',
  },
});

export default PetHealthCard;
