import React from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import CustomButton from '../components/CustomButton';

const urineDog = require('../assets/urineDog.png');
const DIAGNOSIS_IMAGE_SIZE = 240;

const UrineDiagnosisScreen = () => {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <View style={styles.container}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          activeOpacity={0.8}
        >
          <Image
            source={require('../assets/icon_back.png')}
            style={styles.backIcon}
          />
        </TouchableOpacity>

        <View style={styles.content}>
          <Text style={styles.title}>소변키트 진단</Text>
          <Text style={styles.subtitle}>
            소변키트 진단 서비스는 앱 내에서{'\n'}
            반려동물의 건강 상태를 분석해주는 서비스입니다.
          </Text>
          <Image source={urineDog} style={styles.image} />
        </View>

        <View
          style={[
            styles.buttonContainer,
            { paddingBottom: insets.bottom + 28 },
          ]}
        >
          <CustomButton
            text="진단시작"
            onPress={() => navigation.navigate('UrineCamera')}
          />
          <TouchableOpacity
            style={styles.historyButton}
            onPress={() => navigation.navigate('DiagnosisHistory')}
            activeOpacity={0.7}
          >
            <Text style={styles.historyButtonText}>진단 이력 보기</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
};

export default UrineDiagnosisScreen;

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    paddingTop: 60,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  backButton: {
    position: 'absolute',
    top: 55,
    left: 20,
    padding: 6,
    zIndex: 1,
  },
  backIcon: {
    width: 20,
    height: 20,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: '#000000',
  },
  subtitle: {
    fontSize: 18,
    fontWeight: '500',
    color: '#3C4144',
    textAlign: 'center',
    marginTop: 16,
    lineHeight: 26,
  },
  image: {
    width: DIAGNOSIS_IMAGE_SIZE,
    height: DIAGNOSIS_IMAGE_SIZE,
    marginTop: 32,
    resizeMode: 'contain',
  },
  buttonContainer: {
    width: '100%',
    alignItems: 'center',
    paddingTop: 12,
  },
  historyButton: {
    width: 310,
    marginTop: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: '#0081D5',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0081D5',
  },
});
