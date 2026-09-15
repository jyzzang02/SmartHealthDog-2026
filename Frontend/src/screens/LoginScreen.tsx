import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  Image,
  Animated,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Config from 'react-native-config';
import { WebView } from 'react-native-webview';
import LogoAnimation from '../components/LogoAnimation';
import { isApiError, loginWithKakaoCode } from '../api/auth';
import { storeAuthTokens } from '../storage/tokenStorage';

type RootStackParamList = {
  Login: undefined;
  OrdinaryLogin: undefined;
  OrdinarySignup: undefined;
  Main: undefined;
};

type LoginScreenNavigationProp = NativeStackNavigationProp<
  RootStackParamList,
  'Login'
>;

interface Props {
  navigation: LoginScreenNavigationProp;
}

const KAKAO_AUTHORIZE_URL = 'https://kauth.kakao.com/oauth/authorize';
// TODO: Switch to an HTTPS redirect URI and validate OAuth state before production release.
const KAKAO_REDIRECT_URI = 'http://api.puppydoc.ovh:8080/api/auth/kakao/callback';

const getQueryParameter = (url: string, name: string) => {
  const query = url.split('?')[1]?.split('#')[0];
  if (!query) return null;

  const parameter = query.split('&').find((item) => item.split('=')[0] === name);
  if (!parameter) return null;

  const value = parameter.slice(parameter.indexOf('=') + 1).replace(/\+/g, ' ');
  return value ? decodeURIComponent(value) : null;
};

const isKakaoCallbackUrl = (url: string) => url.split('?')[0].split('#')[0] === KAKAO_REDIRECT_URI;

const LoginScreen: React.FC<Props> = ({ navigation }) => {
  const [showLoginForm, setShowLoginForm] = useState(false);
  const [isKakaoLoginVisible, setIsKakaoLoginVisible] = useState(false);
  const [isKakaoSubmitting, setIsKakaoSubmitting] = useState(false);
  
  const animationLayerOpacity = useRef(new Animated.Value(1)).current;
  const buttonsOpacity = useRef(new Animated.Value(0)).current;
  const hasHandledKakaoCallback = useRef(false);

  const kakaoRestApiKey = Config.KAKAO_REST_API_KEY?.trim();
  const kakaoAuthorizeUrl = kakaoRestApiKey
    ? `${KAKAO_AUTHORIZE_URL}?client_id=${encodeURIComponent(kakaoRestApiKey)}&redirect_uri=${encodeURIComponent(KAKAO_REDIRECT_URI)}&response_type=code`
    : null;

  const closeKakaoLogin = useCallback(() => {
    if (isKakaoSubmitting) return;
    setIsKakaoLoginVisible(false);
  }, [isKakaoSubmitting]);

  const handleKakaoLogin = () => {
    if (!kakaoAuthorizeUrl) {
      Alert.alert('카카오 로그인 설정 필요', 'REST API Key를 설정한 뒤 다시 시도해 주세요.');
      return;
    }

    hasHandledKakaoCallback.current = false;
    setIsKakaoLoginVisible(true);
  };

  const handleKakaoNavigation = useCallback(
    async (url: string) => {
      if (!isKakaoCallbackUrl(url) || hasHandledKakaoCallback.current) return;

      hasHandledKakaoCallback.current = true;
      const kakaoError = getQueryParameter(url, 'error');
      const code = getQueryParameter(url, 'code');

      if (kakaoError) {
        setIsKakaoLoginVisible(false);
        Alert.alert('카카오 로그인 취소', '카카오 로그인을 완료하지 않았습니다.');
        return;
      }

      if (!code) {
        setIsKakaoLoginVisible(false);
        Alert.alert('카카오 로그인 실패', '카카오 인가 코드를 받지 못했습니다. 다시 시도해 주세요.');
        return;
      }

      setIsKakaoSubmitting(true);
      try {
        const tokens = await loginWithKakaoCode(code);
        await storeAuthTokens(tokens);
        setIsKakaoLoginVisible(false);
        navigation.reset({
          index: 0,
          routes: [{ name: 'Main' }],
        });
      } catch (error) {
        setIsKakaoLoginVisible(false);
        const message = isApiError(error)
          ? error.message
          : '네트워크 오류가 발생했습니다. 다시 시도해 주세요.';
        Alert.alert('카카오 로그인 실패', message);
      } finally {
        setIsKakaoSubmitting(false);
      }
    },
    [navigation]
  );

  const handleNormalLogin = () => {
    navigation.navigate('OrdinaryLogin');
  };

  const handleSignUp = () => {
    navigation.navigate('OrdinarySignup');
  };

  const handleGoToHome = () => {
    navigation.navigate('Main');
  };

  const handleAnimationComplete = () => {
    Animated.parallel([
      Animated.timing(animationLayerOpacity, {
        toValue: 0,
        duration: 400,
        useNativeDriver: true,
      }),
      Animated.timing(buttonsOpacity, {
        toValue: 1,
        duration: 600,
        delay: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setShowLoginForm(true);
    });
  };

  return (
    <SafeAreaView style={styles.container}>
      <Animated.View 
        style={[
          styles.animationLayer,
          {
            opacity: animationLayerOpacity,
          },
        ]}
        pointerEvents={showLoginForm ? 'none' : 'auto'}
      >
        <LogoAnimation onAnimationComplete={handleAnimationComplete} />
      </Animated.View>

      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardAvoidingView}
      >
        <View style={styles.content}>
          <View style={styles.logoContainer}>
            <Image
              source={require('../assets/logo_full.png')}
              style={styles.logoFull}
              resizeMode="contain"
            />
          </View>

          <Animated.View 
            style={[
              styles.buttonContainer,
              {
                opacity: buttonsOpacity,
              },
            ]}
          >
            <TouchableOpacity 
              style={styles.kakaoButton} 
              onPress={handleKakaoLogin}
              disabled={!showLoginForm}
            >
              <View style={styles.kakaoButtonContent}>
                <Image
                  source={require('../assets/logo_kakao.png')}
                  style={styles.kakaoIcon}
                  resizeMode="contain"
                />
                <Text style={styles.kakaoButtonText}>카카오로 시작하기</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.normalButton} 
              onPress={handleNormalLogin}
              disabled={!showLoginForm}
            >
              <Text style={styles.normalButtonText}>로그인</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.signUpContainer} 
              onPress={handleSignUp}
              disabled={!showLoginForm}
            >
              <View style={styles.signUpTextContainer}>
                <Text style={styles.signUpText}>회원이 아니신가요?</Text>
                <Text style={styles.signUpLink}>회원가입</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleGoToHome}
              disabled={!showLoginForm}
              activeOpacity={0.7}
              style={styles.devLinkWrapper}
            >
              <Text style={styles.devLinkText}>로그인 없이 홈으로 가기</Text>
            </TouchableOpacity>
          </Animated.View>
        </View>
      </KeyboardAvoidingView>

      <Modal
        visible={isKakaoLoginVisible}
        animationType="slide"
        onRequestClose={closeKakaoLogin}
      >
        <SafeAreaView style={styles.kakaoModal}>
          <View style={styles.kakaoModalHeader}>
            <TouchableOpacity
              style={styles.kakaoCloseButton}
              onPress={closeKakaoLogin}
              disabled={isKakaoSubmitting}
            >
              <Text style={styles.kakaoCloseButtonText}>닫기</Text>
            </TouchableOpacity>
          </View>
          {kakaoAuthorizeUrl && (
            <WebView
              source={{ uri: kakaoAuthorizeUrl }}
              onShouldStartLoadWithRequest={({ url }) => {
                if (!isKakaoCallbackUrl(url)) return true;

                handleKakaoNavigation(url).catch(() => {
                  setIsKakaoLoginVisible(false);
                  Alert.alert('카카오 로그인 실패', '로그인 처리 중 오류가 발생했습니다. 다시 시도해 주세요.');
                });
                return false;
              }}
              onError={() => {
                if (!hasHandledKakaoCallback.current) {
                  setIsKakaoLoginVisible(false);
                  Alert.alert('카카오 로그인 실패', '로그인 화면을 불러오지 못했습니다. 네트워크 상태를 확인해 주세요.');
                }
              }}
            />
          )}
          {isKakaoSubmitting && (
            <View style={styles.kakaoLoadingOverlay}>
              <ActivityIndicator size="large" color="#0081D5" />
            </View>
          )}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  animationLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 10,
    backgroundColor: '#FFFFFF',
  },
  keyboardAvoidingView: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 100,
  },
  logoFull: {
    width: 139,
    height: 180,
  },
  formContainer: {
    marginBottom: 40,
  },
  input: {
    height: 50,
    borderWidth: 1,
    borderColor: '#EAECEE',
    borderRadius: 8,
    paddingHorizontal: 16,
    marginBottom: 16,
    fontSize: 16,
    backgroundColor: '#FFFFFF',
    fontFamily: 'Pretendard-Regular',
  },
  buttonContainer: {
    alignItems: 'center',
  },
  kakaoButton: {
    width: 300,
    height: 45,
    backgroundColor: '#FEE500',
    borderRadius: 100,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    // Shadow for iOS
    shadowColor: '#000000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.02,
    shadowRadius: 4,
    // Shadow for Android
    elevation: 2,
  },
  kakaoButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  kakaoIcon: {
    width: 18,
    height: 18,
    marginRight: 8,
  },
  kakaoButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000000',
    fontFamily: 'Pretendard-SemiBold',
  },
  normalButton: {
    width: 300,
    height: 45,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#EAECEE',
    borderRadius: 100,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    // Shadow for iOS
    shadowColor: '#000000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.02,
    shadowRadius: 3,
    // Shadow for Android
    elevation: 2,
  },
  normalButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000000',
    fontFamily: 'Pretendard-SemiBold',
  },
  signUpContainer: {
    alignItems: 'center',
  },
  signUpTextContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  signUpText: {
    fontSize: 14,
    color: '#7B7C7D',
    fontFamily: 'Pretendard-Regular',
  },
  signUpLink: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#000000',
    marginLeft: 11,
    fontFamily: 'Pretendard-Bold',
  },
  devLinkWrapper: {
    marginTop: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  devLinkText: {
    fontSize: 14,
    color: '#0081D5',
    fontWeight: '600',
  },
  kakaoModal: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  kakaoModalHeader: {
    height: 52,
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#EAECEE',
  },
  kakaoCloseButton: {
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  kakaoCloseButtonText: {
    color: '#000000',
    fontSize: 16,
    fontFamily: 'Pretendard-SemiBold',
  },
  kakaoLoadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
  },
});

export default LoginScreen;
