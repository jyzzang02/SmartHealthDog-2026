import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { getStoredAccessToken, clearAuthTokens, getAuthSession, assertAuthSession } from '../storage/tokenStorage';
import { isApiError } from '../api/auth';
import { MissingRefreshTokenError } from '../api/refreshSession';
import { getMyProfile } from '../api/users';
import { markSelfCheckPreviewSeen, shouldShowSelfCheckPreview } from '../storage/selfCheckPreviewStorage';

type AuthLoadingNavigationProp = NativeStackNavigationProp<any>;

const AuthLoadingScreen: React.FC = () => {
  const navigation = useNavigation<AuthLoadingNavigationProp>();

  const [failed, setFailed] = useState(false);
  const mounted = useRef(true);
  const inFlight = useRef(false);

  const bootstrapAsync = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setFailed(false);
    const session = getAuthSession();

    try {
      const accessToken = await getStoredAccessToken(true);
      assertAuthSession(session);
      if (!mounted.current) return;
      if (!accessToken) {
        const showPreview = await shouldShowSelfCheckPreview();
        assertAuthSession(session);
        if (!mounted.current) return;
        navigation.reset({ index: 0, routes: [showPreview
          ? { name: 'SelfCheck', params: { preview: true } }
          : { name: 'Login' }] });
        return;
      }

      void markSelfCheckPreviewSeen();
      await getMyProfile({ preserveRefreshError: true });
      assertAuthSession(session);
      if (mounted.current) navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
    } catch (error) {
      if (!mounted.current) return;
      try { assertAuthSession(session); } catch { return; }
      const expired = error instanceof MissingRefreshTokenError ||
        (isApiError(error) && error.status === 401 && error.codes.includes('INVALID_JWT'));
      if (expired) {
        try {
          await clearAuthTokens();
        } catch {
          if (mounted.current) setFailed(true);
          return;
        }
        if (mounted.current) navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
      } else {
        setFailed(true);
      }
    } finally {
      inFlight.current = false;
    }
  }, [navigation]);

  useEffect(() => {
    mounted.current = true;
    bootstrapAsync();
    return () => { mounted.current = false; };
  }, [bootstrapAsync]);
  return (
    <View style={styles.container}>
      <View style={styles.inner}>
        {failed ? (
          <>
            <Text style={styles.loadingText}>연결을 확인한 후 다시 시도해 주세요.</Text>
            <TouchableOpacity style={styles.retryButton} onPress={bootstrapAsync} accessibilityRole="button">
              <Text style={styles.retryText}>다시 시도</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={styles.loadingText}>앱을 시작하는 중입니다...</Text>
            <ActivityIndicator size="large" color="#0081D5" style={styles.spinner} />
          </>
        )}
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
  retryButton: { backgroundColor: '#0081D5', borderRadius: 10, paddingHorizontal: 24, paddingVertical: 12, marginTop: 10 },
  retryText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  spinner: {
    marginTop: 10,
  },
});

export default AuthLoadingScreen;

