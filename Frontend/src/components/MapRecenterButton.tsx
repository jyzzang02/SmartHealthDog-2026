import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, PermissionsAndroid, Platform, StyleSheet, TouchableOpacity, View } from 'react-native';
import Geolocation from 'react-native-geolocation-service';

export interface MapUserLocation { lat: number; lng: number; }
interface Props {
  disabled: boolean;
  onLocation?: (point: MapUserLocation) => void;
  onPress?: () => void;
  accessibilityLabel?: string;
}

const MapRecenterButton: React.FC<Props> = ({ disabled, onLocation, onPress, accessibilityLabel = '내 위치로 이동' }) => {
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);
  const pending = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const locate = async () => {
    if (disabled || pending.current) return;
    if (onPress) { onPress(); return; }
    if (!onLocation) return;
    pending.current = true;
    setBusy(true);
    try {
      let precise = true;
      if (Platform.OS === 'android') {
        const fine = PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION;
        const coarse = PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION;
        precise = await PermissionsAndroid.check(fine);
        let approximate = !precise && await PermissionsAndroid.check(coarse);
        if (!mounted.current) return;
        if (!precise && !approximate) {
          const grants = await PermissionsAndroid.requestMultiple([fine, coarse]);
          precise = grants[fine] === PermissionsAndroid.RESULTS.GRANTED;
          approximate = grants[coarse] === PermissionsAndroid.RESULTS.GRANTED;
        }
        if (!precise && !approximate) throw new Error('현재 위치로 이동하려면 위치 권한을 허용해 주세요.');
      } else if (Platform.OS === 'ios') {
        if (await Geolocation.requestAuthorization('whenInUse') !== 'granted') {
          throw new Error('현재 위치로 이동하려면 위치 권한을 허용해 주세요.');
        }
      }
      if (!mounted.current) return;
      // A fresh single fix must not stop or replace the walk tracking subscription.
      const point = await new Promise<MapUserLocation>((resolve, reject) => {
        Geolocation.getCurrentPosition(position => {
          const { latitude: lat, longitude: lng } = position.coords;
          if (!Number.isFinite(lat) || Math.abs(lat) > 90 || !Number.isFinite(lng) || Math.abs(lng) > 180) {
            reject(new Error('현재 위치 좌표가 올바르지 않습니다.'));
          } else resolve({ lat, lng });
        }, failure => reject(new Error(failure.code === 1
          ? '현재 위치로 이동하려면 위치 권한을 허용해 주세요.'
          : '현재 위치를 확인할 수 없습니다. GPS 설정을 확인한 뒤 다시 시도해 주세요.')),
        { enableHighAccuracy: precise, timeout: 15000, maximumAge: 0, showLocationDialog: true });
      });
      if (mounted.current) onLocation(point);
    } catch (failure) {
      if (mounted.current) Alert.alert('현재 위치', failure instanceof Error ? failure.message : '현재 위치를 확인할 수 없습니다.');
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  };

  return <TouchableOpacity accessibilityRole="button" accessibilityLabel={accessibilityLabel}
    accessibilityState={{ disabled: disabled || busy, busy }} disabled={disabled || busy}
    activeOpacity={0.8} onPress={locate} style={[styles.button, disabled && styles.disabled]}>
    {busy ? <ActivityIndicator color="#0081D5" /> : <View style={styles.target}><View style={styles.dot} /></View>}
  </TouchableOpacity>;
};

export default MapRecenterButton;
const styles = StyleSheet.create({
  button: { position: 'absolute', right: 12, bottom: 12, width: 44, height: 44, borderRadius: 22,
    backgroundColor: '#FFF', alignItems: 'center', justifyContent: 'center', elevation: 4,
    shadowColor: '#000', shadowOpacity: 0.16, shadowRadius: 5, shadowOffset: { width: 0, height: 2 } },
  target: { width: 22, height: 22, borderWidth: 2, borderColor: '#0081D5', borderRadius: 11,
    alignItems: 'center', justifyContent: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#0081D5' },
  disabled: { opacity: 0.45 },
});
