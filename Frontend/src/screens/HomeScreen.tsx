import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import PetHealthCard from '../components/PetHealthCard';
import ProfileCard from '../components/ProfileCard';
import BannerSlider from '../components/BannerSlider';
import Header from '../components/Header';
import { getMyProfile, UserProfile } from '../api/users';
import { getMyPets, PetListItem } from '../api/pets';

export default function HomeScreen() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [pets, setPets] = useState<PetListItem[]>([]);
  const [profileLoading, setProfileLoading] = useState(true);
  const [petsLoading, setPetsLoading] = useState(true);

  const loadHomeData = useCallback(async () => {
    setProfileLoading(true);
    setPetsLoading(true);
    try {
      const [profileData, petsData] = await Promise.all([getMyProfile(), getMyPets()]);
      setProfile(profileData);
      setPets(petsData);
    } catch {
      setProfile(null);
      setPets([]);
    } finally {
      setProfileLoading(false);
      setPetsLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadHomeData();
    }, [loadHomeData])
  );

  return (
    <View style={styles.container}>
      <Header />

      {/* 전체 컨텐츠 영역 */}
      <View style={styles.contentWrap}>
        <ProfileCard profile={profile} loading={profileLoading} />

        <Text style={styles.sectionTitle}>반려동물 보건정보</Text>

        <PetHealthCard pets={pets} loading={petsLoading} />
      </View>

      {/* 🔹 divider는 화면 전체폭 */}
      <View style={styles.divider} />

      {/* divider 밑 공간도 다시 20 좌우 */}

      <BannerSlider />

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  contentWrap: {
    marginHorizontal: 20,
    marginTop: 20,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#000',
    marginTop: 16,
    marginBottom: 12,
  },

  divider: {
    width: '100%',     
    height: 6,
    backgroundColor: '#F3F4F5',
    marginTop: 20,
    marginBottom: 20,
  },
});
