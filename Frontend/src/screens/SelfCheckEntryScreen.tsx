import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../App';
import { supportsRespirationCapture } from './RespirationCaptureScreen';

export default function SelfCheckEntryScreen({ navigation, route }: NativeStackScreenProps<RootStackParamList, 'SelfCheckEntry'>) {
  const pet = route.params;
  const videoUnavailable = !supportsRespirationCapture || !pet;
  const notice = !supportsRespirationCapture
    ? '이 기기에서는 수면 영상 등록을 지원하지 않습니다.'
    : pet ? '호흡수 분석은 아직 제공하지 않습니다.'
      : '수면 영상을 등록하려면 반려동물을 먼저 등록해 주세요.';

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.navBar}>
        <Pressable accessibilityRole="button" accessibilityLabel="뒤로" onPress={() => navigation.goBack()} style={styles.backButton}>
          <Image source={require('../assets/icon_navBack.png')} style={styles.backIcon} />
        </Pressable>
        <Text style={styles.navTitle}>반려동물 자가진단</Text>
      </View>
      <View style={styles.content}>
        <Text style={styles.description}>확인할 방법을 선택해 주세요.</Text>
        <Pressable accessibilityRole="button" style={styles.option}
          onPress={() => navigation.navigate('SelfCheck', pet ? { petId: pet.petId } : undefined)}>
          <Image source={require('../assets/icon_edit.png')} style={styles.optionIcon} />
          <Text style={styles.label}>질문지 자가진단</Text>
          <Image source={require('../assets/icon_right.png')} style={styles.arrow} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityState={{ disabled: videoUnavailable }} disabled={videoUnavailable}
          style={[styles.option, videoUnavailable && styles.disabled]}
          onPress={() => { if (pet) navigation.navigate('RespirationCapture', pet); }}>
          <Image source={require('../assets/icon_camera.png')} style={styles.optionIcon} />
          <Text style={styles.label}>수면 영상 등록</Text>
          <Image source={require('../assets/icon_right.png')} style={styles.arrow} />
        </Pressable>
        <View style={styles.notice}>
          <Text style={styles.noticeText}>{notice}</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fff' },
  navBar: { height: 56, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#EAECEE' },
  backButton: { minWidth: 44, minHeight: 44, justifyContent: 'center' },
  backIcon: { width: 20, height: 20, tintColor: '#1F2024' },
  navTitle: { fontSize: 20, fontWeight: '600', color: '#1F2024' },
  content: { paddingHorizontal: 20, paddingTop: 28 },
  description: { fontSize: 15, color: '#555', marginBottom: 20 },
  option: { minHeight: 76, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', borderRadius: 14, borderWidth: 1, borderColor: '#DFEAF3', backgroundColor: '#F6FAFE', marginBottom: 12 },
  optionIcon: { width: 24, height: 24, marginRight: 14, tintColor: '#0081D5', resizeMode: 'contain' },
  label: { flex: 1, fontSize: 17, fontWeight: '700', color: '#1F2024' },
  arrow: { width: 18, height: 18, tintColor: '#0081D5' },
  disabled: { opacity: 0.5 },
  notice: { marginTop: 8, paddingHorizontal: 16, paddingVertical: 14, borderRadius: 12, backgroundColor: '#F3F4F5' },
  noticeText: { fontSize: 14, lineHeight: 21, color: '#666' },
});
