import { useCallback, useRef, useState } from 'react';
import { PermissionsAndroid, Platform } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Geolocation from 'react-native-geolocation-service';
import { isHospitalCoordinates, logHospitalSearch, searchHospitals } from '../api/hospitals';
import type { HospitalCoordinates, HospitalSearchParams, HospitalSearchResponse } from '../api/hospitals';

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

export type HospitalSearchFilters = Pick<HospitalSearchParams, 'location' | 'query' | 'radius_km'>;
const PAGE_SIZE = 5;

interface SearchRequest {
  filters: HospitalSearchFilters;
  offset: number;
  searchId: number;
  attempt: number;
}

export const useHospitalSearch = () => {
  const [result, setResult] = useState<HospitalSearchResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [request, setRequest] = useState<SearchRequest>({
    filters: { radius_km: 10 }, offset: 0, searchId: 0, attempt: 0,
  });
  const requestRef = useRef(request);
  const loadingRef = useRef(true);
  const controllerRef = useRef<AbortController | null>(null);
  const centerRef = useRef<{ searchId: number; center: HospitalCoordinates } | null>(null);

  const schedule = useCallback((next: SearchRequest) => {
    // Invalidate the old request immediately, before React runs effect cleanup.
    controllerRef.current?.abort();
    requestRef.current = next;
    loadingRef.current = true;
    setLoading(true); setError(null); setResult(null);
    setRequest(next);
  }, []);

  const search = useCallback((filters: HospitalSearchFilters) => {
    const normalized: HospitalSearchFilters = { radius_km: filters.radius_km ?? 10 };
    if (filters.location?.trim()) normalized.location = filters.location.trim();
    if (filters.query?.trim()) normalized.query = filters.query.trim();
    const current = requestRef.current;
    if (loadingRef.current && current.offset === 0 &&
        current.filters.location === normalized.location && current.filters.query === normalized.query &&
        current.filters.radius_km === normalized.radius_km) return;
    schedule({ filters: normalized, offset: 0, searchId: current.searchId + 1, attempt: 0 });
  }, [schedule]);

  const retry = useCallback(() => {
    if (!loadingRef.current) {
      const current = requestRef.current;
      schedule({ ...current, attempt: current.attempt + 1 });
    }
  }, [schedule]);

  const goToPage = useCallback((page: number) => {
    if (loadingRef.current || !result || !Number.isSafeInteger(page) || page < 0) return;
    const offset = page * result.page.limit;
    if (!Number.isSafeInteger(offset) || offset >= result.total || offset === requestRef.current.offset) return;
    schedule({ ...requestRef.current, offset, attempt: 0 });
  }, [result, schedule]);

  useFocusEffect(useCallback(() => {
    const controller = new AbortController();
    controllerRef.current = controller;
    let active = true;
    const valid = () => active && !controller.signal.aborted;
    loadingRef.current = true;
    logHospitalSearch('search:start', { attempt: request.attempt, offset: request.offset, hasLocation: !!request.filters.location });
    setLoading(true); setError(null); setResult(null);
    const load = async () => {
      try {
        let coordinates: HospitalCoordinates | undefined;
        if (!request.filters.location) {
          // Keep the same GPS origin across pages; a new submitted search gets a fresh fix.
          const cached = centerRef.current;
          coordinates = cached?.searchId === request.searchId && (request.offset > 0 || request.attempt > 0)
            ? cached.center : await getHospitalSearchLocation(controller.signal);
          if (!valid()) return;
          centerRef.current = { searchId: request.searchId, center: coordinates };
        }
        const response = await searchHospitals({
          ...coordinates, ...request.filters, sort_by: 'distance', limit: PAGE_SIZE, offset: request.offset,
        }, controller.signal);
        if (!valid()) return;
        if (response.page.limit !== PAGE_SIZE || response.page.offset !== request.offset) {
          throw new Error('병원검색 응답 형식이 명세서와 다릅니다.');
        }
        setResult(response);
      } catch (failure) {
        if (valid()) {
          setError(failure instanceof Error ? failure.message : '주변 병원을 불러오지 못했습니다.');
        }
      } finally {
        if (valid()) { loadingRef.current = false; setLoading(false); }
      }
    };
    load();
    return () => {
      active = false; controller.abort();
      if (controllerRef.current === controller) controllerRef.current = null;
    };
  }, [request]));
  return { result, loading, error, retry, search, goToPage, filters: request.filters };
};
