import { useCallback, useRef, useState } from 'react';
import { PermissionsAndroid, Platform } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Geolocation from 'react-native-geolocation-service';
import { searchAllShelters, ShelterListItem } from '../api/shelters';

export interface ShelterCoordinates { lat: number; lng: number; }
export interface NearbyShelter extends ShelterListItem {
  location: ShelterCoordinates;
  distance_m: number;
}
export const NEARBY_SHELTER_RADIUS_KM = 10;

export const isShelterCoordinates = (value: unknown): value is ShelterCoordinates => {
  const point = value as Partial<ShelterCoordinates> | null;
  return !!point && typeof point.lat === 'number' && Number.isFinite(point.lat) && Math.abs(point.lat) <= 90
    && typeof point.lng === 'number' && Number.isFinite(point.lng) && Math.abs(point.lng) <= 180;
};

export const selectNearbyShelters = (items: readonly ShelterListItem[]): NearbyShelter[] => {
  const nearby: NearbyShelter[] = [];
  const seen = new Set<number>();
  for (const item of items) {
    if (!isShelterCoordinates(item?.location) || !Number.isSafeInteger(item.shelter_id)
      || item.shelter_id <= 0 || seen.has(item.shelter_id)
      || typeof item.distance_m !== 'number' || !Number.isFinite(item.distance_m)
      || item.distance_m < 0 || item.distance_m > NEARBY_SHELTER_RADIUS_KM * 1000) continue;
    seen.add(item.shelter_id);
    nearby.push({ ...item, location: item.location, distance_m: item.distance_m });
  }
  return nearby.sort((left, right) => left.distance_m - right.distance_m || left.shelter_id - right.shelter_id);
};

const cancelled = () => Object.assign(new Error('위치 조회가 취소되었습니다.'), { name: 'AbortError' });
const getNearbyLocation = async (signal: AbortSignal): Promise<ShelterCoordinates> => {
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
    if (!precise && !approximate) throw new Error('주변 보호소를 보려면 위치 권한을 허용해 주세요.');
  } else if (Platform.OS === 'ios') {
    if (await Geolocation.requestAuthorization('whenInUse') !== 'granted') {
      throw new Error('주변 보호소를 보려면 위치 권한을 허용해 주세요.');
    }
  }
  if (signal.aborted) throw cancelled();
  return new Promise((resolve, reject) => {
    const onAbort = () => { cleanup(); reject(cancelled()); };
    const cleanup = () => signal.removeEventListener('abort', onAbort);
    signal.addEventListener('abort', onAbort);
    try {
      Geolocation.getCurrentPosition(position => {
        cleanup();
        if (signal.aborted) return;
        const point = { lat: position.coords.latitude, lng: position.coords.longitude };
        if (!isShelterCoordinates(point)) { reject(new Error('현재 위치 좌표가 올바르지 않습니다.')); return; }
        resolve(point);
      }, failure => {
        cleanup();
        if (!signal.aborted) reject(new Error(failure.code === 1
          ? '주변 보호소를 보려면 위치 권한을 허용해 주세요.'
          : '현재 위치를 확인할 수 없습니다. GPS 설정을 확인해 주세요.'));
      }, { enableHighAccuracy: precise, timeout: 15000, maximumAge: 60000, showLocationDialog: true });
    } catch {
      cleanup();
      reject(new Error('현재 위치를 확인할 수 없습니다. GPS 설정을 확인해 주세요.'));
    }
  });
};

export const useNearbyShelters = () => {
  const [center, setCenter] = useState<ShelterCoordinates | null>(null);
  const [shelters, setShelters] = useState<NearbyShelter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const controllerRef = useRef<AbortController | null>(null);
  const retry = useCallback(() => {
    controllerRef.current?.abort();
    setAttempt(value => value + 1);
  }, []);

  useFocusEffect(useCallback(() => {
    const controller = new AbortController();
    controllerRef.current = controller;
    let active = true;
    let timedOut = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    setLoading(true); setError(null); setCenter(null); setShelters([]);
    const load = async () => {
      try {
        const origin = await getNearbyLocation(controller.signal);
        if (!active || controller.signal.aborted) return;
        setCenter(origin);
        timeout = setTimeout(() => { timedOut = true; controller.abort(); }, 20000);
        const response = await searchAllShelters({
          lat: origin.lat, lng: origin.lng,
          sort_by: 'distance', limit: 1000, offset: 0,
        }, controller.signal);
        if (!active || controller.signal.aborted) return;
        const total = response.total;
        if (typeof total !== 'number' || !Number.isSafeInteger(total) || total < 0
          || total !== response.items.length) {
          throw new Error('보호소 목록을 모두 확인하지 못했습니다. 다시 시도해 주세요.');
        }
        // The API only sorts by distance; the nearby map applies its own 10km limit.
        const nearby = selectNearbyShelters(response.items);
        setShelters(nearby);
      } catch (failure) {
        if (active) setError(timedOut ? '보호소 조회가 지연되고 있습니다. 다시 시도해 주세요.'
          : failure instanceof Error ? failure.message : '주변 보호소를 불러오지 못했습니다.');
      } finally {
        if (timeout) clearTimeout(timeout);
        if (active) setLoading(false);
      }
    };
    load();
    return () => {
      active = false; controller.abort();
      if (timeout) clearTimeout(timeout);
      if (controllerRef.current === controller) controllerRef.current = null;
    };
  // Retry changes the callback identity so the focused screen reloads.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]));
  return { center, shelters, loading, error, retry };
};
