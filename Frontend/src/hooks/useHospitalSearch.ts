import { useCallback, useState } from 'react';
import { PermissionsAndroid, Platform } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Geolocation from 'react-native-geolocation-service';
import { isHospitalCoordinates, logHospitalSearch, searchHospitals } from '../api/hospitals';
import type { HospitalCoordinates, HospitalSearchResponse } from '../api/hospitals';

const cancelled = () => Object.assign(new Error('위치 조회가 취소되었습니다.'), { name: 'AbortError' });

export const getHospitalSearchLocation = async (signal: AbortSignal): Promise<HospitalCoordinates> => {
  if (signal.aborted) throw cancelled();
  let precise = true;
  if (Platform.OS === 'android') {
    const fine = PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION;
    const coarse = PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION;
    precise = await PermissionsAndroid.check(fine);
    let approximate = !precise && await PermissionsAndroid.check(coarse);
    if (signal.aborted) throw cancelled();
    if (!precise && !approximate) {
      const grants = await PermissionsAndroid.requestMultiple([fine, coarse]);
      precise = grants[fine] === PermissionsAndroid.RESULTS.GRANTED;
      approximate = grants[coarse] === PermissionsAndroid.RESULTS.GRANTED;
    }
    if (!precise && !approximate) throw new Error('주변 병원 검색을 위해 위치 권한을 허용해 주세요.');
  } else if (Platform.OS === 'ios') {
    if (await Geolocation.requestAuthorization('whenInUse') !== 'granted') {
      throw new Error('주변 병원 검색을 위해 위치 권한을 허용해 주세요.');
    }
  }
  if (signal.aborted) throw cancelled();
  logHospitalSearch('location:permission', { granted: true, precise });
  return new Promise((resolve, reject) => {
    const onAbort = () => { signal.removeEventListener('abort', onAbort); reject(cancelled()); };
    signal.addEventListener('abort', onAbort);
    const finish = () => signal.removeEventListener('abort', onAbort);
    // Single bounded lookup only. Do not stopObserving(), which would affect walk tracking.
    const onPosition: Parameters<typeof Geolocation.getCurrentPosition>[0] = (position) => {
      finish();
      if (signal.aborted) return;
      const point = { lat: position.coords.latitude, lng: position.coords.longitude };
      if (!isHospitalCoordinates(point)) { reject(new Error('현재 위치 좌표가 올바르지 않습니다.')); return; }
      logHospitalSearch('location:ready', { accuracyM: Math.round(position.coords.accuracy), precise });
      resolve(point);
    };
    const onError: NonNullable<Parameters<typeof Geolocation.getCurrentPosition>[1]> = (error) => {
      finish();
      if (signal.aborted) return;
      logHospitalSearch('location:error', { code: error.code });
      reject(new Error(error.code === 1 ? '위치 권한이 없습니다. 설정에서 허용해 주세요.' :
        error.code === 3 ? '현재 위치 확인이 지연되고 있습니다. 다시 시도해 주세요.' :
          '현재 위치를 확인할 수 없습니다. GPS 설정을 확인해 주세요.'));
    };
    try {
      Geolocation.getCurrentPosition(onPosition, onError,
        { enableHighAccuracy: precise, timeout: 15000, maximumAge: 60000, showLocationDialog: true });
    } catch {
      finish();
      reject(new Error('현재 위치를 확인할 수 없습니다. GPS 설정을 확인해 주세요.'));
    }
  });
};

export const useHospitalSearch = () => {
  const [result, setResult] = useState<HospitalSearchResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const retry = useCallback(() => setReloadKey((value) => value + 1), []);

  useFocusEffect(useCallback(() => {
    const controller = new AbortController();
    let active = true;
    logHospitalSearch('search:start', { attempt: reloadKey });
    setLoading(true); setError(null); setResult(null);
    const load = async () => {
      try {
        const center = await getHospitalSearchLocation(controller.signal);
        if (!active) return;
        const response = await searchHospitals({ ...center, radius_km: 10, sort_by: 'distance', limit: 20, offset: 0 }, controller.signal);
        if (active) setResult(response);
      } catch (failure) {
        if (active && !controller.signal.aborted) {
          setError(failure instanceof Error ? failure.message : '주변 병원을 불러오지 못했습니다.');
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => { active = false; controller.abort(); };
  }, [reloadKey]));
  return { result, loading, error, retry };
};
