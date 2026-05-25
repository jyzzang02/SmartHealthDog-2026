import React, { useEffect } from 'react';
import {
  View,
  ActivityIndicator,
  StyleSheet,
  Text,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { getStoredAccessToken, clearAuthTokens } from '../storage/tokenStorage';
import { getMyProfile } from '../api/users';

type AuthLoadingNavigationProp = NativeStackNavigationProp<any>;

const AuthLoadingScreen: React.FC = () => {
  const navigation = useNavigation<AuthLoadingNavigationProp>();

  useEffect(() => {
    const bootstrapAsync = async () => {
      try {
        console.log('[AuthLoading] 🔵 App started, checking for saved tokens...');

        // Step 1: Check if access token exists
        const accessToken = await getStoredAccessToken();

        if (!accessToken) {
          console.log('[AuthLoading] ℹ️  No saved access token found. → Redirecting to Login');
          navigation.reset({
            index: 0,
            routes: [{ name: 'Login' }],
          });
          return;
        }

        console.log('[AuthLoading] 🔑 Access token found. Validating...');

        // Step 2: Validate token by calling getMyProfile
        try {
          const profile = await getMyProfile();
          console.log('[AuthLoading] ✅ Token validation success. User:', profile.nickname);
          console.log('[AuthLoading] 🟢 Redirecting to Main (Home)');
          navigation.reset({
            index: 0,
            routes: [{ name: 'Main' }],
          });
        } catch (validateError) {
          console.warn('[AuthLoading] ❌ Token validation failed:', validateError);
          // Token is invalid, clear it and redirect to login
          await clearAuthTokens();
          console.log('[AuthLoading] Cleared invalid token. → Redirecting to Login');
          navigation.reset({
            index: 0,
            routes: [{ name: 'Login' }],
          });
        }
      } catch (error) {
        console.error('[AuthLoading] 💥 Unexpected error:', error);
        // On error, redirect to login to be safe
        navigation.reset({
          index: 0,
          routes: [{ name: 'Login' }],
        });
      }
    };

    bootstrapAsync();
  }, [navigation]);

  return (
    <View style={styles.container}>
      <View style={styles.inner}>
        <Text style={styles.loadingText}>앱을 시작하는 중입니다...</Text>
        <ActivityIndicator size="large" color="#0081D5" style={styles.spinner} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  inner: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: '#7B7C7D',
    marginBottom: 20,
    fontWeight: '600',
  },
  spinner: {
    marginTop: 10,
  },
});

export default AuthLoadingScreen;

