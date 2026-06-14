import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Image, ActivityIndicator, ImageSourcePropType } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { getMyProfile, UserProfile } from '../api/users';
import { resolveImageUri } from '../utils/imageUri';
import { getStoredAccessToken } from '../storage/tokenStorage';

type ProfileCardProps = {
  profile?: UserProfile | null;
  loading?: boolean;
};

const ProfileCard: React.FC<ProfileCardProps> = ({
  profile: profileProp,
  loading: loadingProp,
}) => {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [imageLoadFailed, setImageLoadFailed] = useState(false);
  const shouldFetch = profileProp === undefined;

  useEffect(() => {
    let mounted = true;
    getStoredAccessToken()
      .then((token) => {
        if (mounted) setAccessToken(token);
      })
      .catch(() => {
        if (mounted) setAccessToken(null);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const loadProfile = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getMyProfile();
      setProfile(data);
    } catch {
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (shouldFetch) {
      loadProfile();
    }
  }, [loadProfile, shouldFetch]);

  useFocusEffect(
    useCallback(() => {
      if (shouldFetch) {
        loadProfile();
      }
    }, [loadProfile, shouldFetch])
  );

  const effectiveProfile = shouldFetch ? profile : profileProp ?? null;
  const effectiveLoading = shouldFetch ? loading : Boolean(loadingProp);
  const resolvedProfileImage = resolveImageUri(effectiveProfile?.profilePicture);
  const shouldUseAuthHeaderForImage = Boolean(
    resolvedProfileImage && /^https?:\/\/api\.puppydoc\.ovh:8080\//i.test(resolvedProfileImage)
  );
  useEffect(() => {
    setImageLoadFailed(false);
  }, [resolvedProfileImage]);
  const profileImageSource: ImageSourcePropType | undefined = resolvedProfileImage
    ? !imageLoadFailed
      ? {
        uri: resolvedProfileImage,
        headers:
          shouldUseAuthHeaderForImage && accessToken
            ? { Authorization: `Bearer ${accessToken}` }
            : undefined,
      }
      : undefined
    : undefined;

  if (effectiveLoading) {
    return (
      <View style={[styles.container, { justifyContent: 'center' }]}>
        <ActivityIndicator size="small" color="#0081D5" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* 프로필 이미지 */}
      {profileImageSource ? (
        <Image
          source={profileImageSource}
          style={styles.profileImage}
          onError={() => {
            setImageLoadFailed(true);
          }}
        />
      ) : (
        <View style={styles.profileImagePlaceholder} />
      )}

      {/* 텍스트 영역 */}
      <View style={styles.textContainer}>
        <Text style={styles.subtitle}>다시 만나서 반가워요</Text>
        <Text style={styles.username}>{effectiveProfile?.nickname || '사용자'} 님</Text>
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
  profileImagePlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#E0E0E0',
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
