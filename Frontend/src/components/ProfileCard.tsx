import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Image, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { getMyProfile, UserProfile } from '../api/users';

const ProfileCard = () => {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getMyProfile();
      setProfile(data);
    } catch (error) {
      console.error('Failed to load profile:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  useFocusEffect(
    useCallback(() => {
      loadProfile();
    }, [loadProfile])
  );

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center' }]}>
        <ActivityIndicator size="small" color="#0081D5" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* 프로필 이미지 */}
      <Image
        source={
          profile?.profilePicture
            ? { uri: profile.profilePicture }
            : require('../assets/img_emblem.png')
        }
        style={styles.profileImage}
      />

      {/* 텍스트 영역 */}
      <View style={styles.textContainer}>
        <Text style={styles.subtitle}>다시 만나서 반가워요</Text>
        <Text style={styles.username}>{profile?.nickname || '사용자'} 님</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    minHeight: 80,
  },

  profileImage: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#E8E8E8',
  },

  textContainer: {
    marginLeft: 12,
  },

  subtitle: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },

  username: {
    marginTop: 4,
    fontSize: 18,
    fontWeight: '700',
    color: '#000',
  },
});

export default ProfileCard;
