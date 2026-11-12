import {
  getStoredAccessToken, getAuthSession,
  assertAuthSession,
} from '../storage/tokenStorage';
import { refreshSessionAccessToken } from './refreshSession';
import { getResponseErrorMessage } from './responseError';

const API_BASE_URL = 'http://api.puppydoc.ovh:8080';

export interface HospitalCoordinates { lat: number; lng: number; }
export interface HospitalItem {
  // NAVER-derived hash ID, not a database primary key. Keep Java Long precision.
  hospital_id: string | null;
  name: string;
  address: string | null;
  location: HospitalCoordinates;
  distance_m: number | null;
  phone_number: string | null;
  rating: number | null;
  review_count: number | null;
  website_url: string | null;
  place_url: string | null;
  open_now: boolean | null;
}
export interface HospitalSearchParams {
  lat?: number;
  lng?: number;
  location?: string;
  query?: string;
  radius_km?: number;
  sort_by?: 'distance';
  limit?: number;
  offset?: number;
}
export interface HospitalSearchResponse {
  center: HospitalCoordinates;
  radius_km: number;
  sort_by: 'distance';
  total: number;
  items: HospitalItem[];
  page: { limit: number; offset: number };
}

export const logHospitalSearch = (event: string, data: Record<string, unknown>) => {
  if (__DEV__) console.info(`[hospital-search] ${event}`, data);
};

export const isHospitalCoordinates = (value: unknown): value is HospitalCoordinates => {
  const point = value as HospitalCoordinates | null;
  return !!point && Number.isFinite(point.lat) && Math.abs(point.lat) <= 90 &&
    Number.isFinite(point.lng) && Math.abs(point.lng) <= 180;
};

const abortError = () => Object.assign(new Error('병원검색 요청이 취소되었습니다.'), { name: 'AbortError' });
const checkAborted = (signal: AbortSignal) => { if (signal.aborted) throw abortError(); };
const nullableString = (value: unknown) => typeof value === 'string' && value.trim() ? value : null;
const nullableNumber = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : null;

const refreshSessionForSearch = (accessToken: string, session: symbol, signal: AbortSignal): Promise<string> =>
  new Promise((resolve, reject) => {
    const cleanup = () => signal.removeEventListener('abort', onAbort);
    const onAbort = () => { cleanup(); reject(abortError()); };
    signal.addEventListener('abort', onAbort);
    if (signal.aborted) { onAbort(); return; }

    // Cancel the search's wait, but persist rotated session tokens if refresh completes.
    Promise.resolve().then(() => refreshSessionAccessToken(session, accessToken))
      .then((token) => { cleanup(); resolve(token); }, (error) => { cleanup(); reject(error); });
  });

const authorizedFetch = async (url: string, signal: AbortSignal) => {
  const session = getAuthSession();
  const accessToken = await getStoredAccessToken();
  assertAuthSession(session);
  checkAborted(signal);
  if (!accessToken) throw new Error('로그인이 필요합니다. 다시 로그인해 주세요.');
  const request = (token: string) => fetch(url, {
    method: 'GET', signal,
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  let response = await request(accessToken);
  logHospitalSearch('http', { status: response.status });
  // Follow the existing shelter API: refresh on 401, not on permission-related 403.
  if (response.status === 401) {
    checkAborted(signal);
    const token = await refreshSessionForSearch(accessToken, session, signal);
    assertAuthSession(session);
    checkAborted(signal);
    response = await request(token);
    logHospitalSearch('http:retry', { status: response.status });
  }
  return response;
};

export const searchHospitals = async (
  params: HospitalSearchParams,
  signal?: AbortSignal,
): Promise<HospitalSearchResponse> => {
  if (!params.location?.trim() && !isHospitalCoordinates({ lat: params.lat, lng: params.lng })) {
    throw new Error('현재 위치 좌표 또는 검색 지역이 필요합니다.');
  }
  if ((params.lat !== undefined || params.lng !== undefined) &&
      !isHospitalCoordinates({ lat: params.lat, lng: params.lng })) {
    throw new Error('위도와 경도는 올바른 값으로 함께 전달해야 합니다.');
  }
  const radius = params.radius_km ?? 10;
  const limit = params.limit ?? 20;
  const offset = params.offset ?? 0;
  if (!Number.isFinite(radius) || radius <= 0 || radius > 100 ||
      !Number.isInteger(limit) || limit < 1 || limit > 50 ||
      !Number.isSafeInteger(offset) || offset < 0 ||
      (params.sort_by !== undefined && params.sort_by !== 'distance')) {
    throw new Error('병원검색 반경 또는 페이지 설정이 올바르지 않습니다.');
  }
  const query = new URLSearchParams();
  if (params.lat !== undefined && params.lng !== undefined) {
    query.set('lat', String(params.lat)); query.set('lng', String(params.lng));
  }
  if (params.location?.trim()) query.set('location', params.location.trim());
  if (params.query?.trim()) query.set('query', params.query.trim());
  query.set('radius_km', String(radius)); query.set('sort_by', 'distance');
  query.set('limit', String(limit)); query.set('offset', String(offset));

  const controller = new AbortController();
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort);
  if (signal?.aborted) controller.abort();
  let timedOut = false;
  const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, 25000);
  logHospitalSearch('request', {
    endpoint: '/api/hospitals/search', hasCoordinates: params.lat !== undefined,
    hasLocation: !!params.location, hasQuery: !!params.query, radiusKm: radius, limit, offset,
  });
  try {
    checkAborted(controller.signal);
    const response = await authorizedFetch(`${API_BASE_URL}/api/hospitals/search?${query}`, controller.signal);
    if (!response.ok) {
      const message = await getResponseErrorMessage(response,
        response.status === 403 ? '병원검색 API 접근이 거부되었습니다. (HTTP 403)' :
          `병원을 불러오지 못했습니다. (HTTP ${response.status})`);
      logHospitalSearch('http:error', { status: response.status, message });
      throw new Error(message);
    }
    // Java Long IDs exceed JS number precision; quote only this numeric field before parsing.
    const text = (await response.text()).replace(/("hospital_id"\s*:\s*)(-?\d+)(?=\s*[,}])/g, '$1"$2"');
    let data;
    try { data = JSON.parse(text); } catch { throw new Error('병원검색 응답을 해석하지 못했습니다.'); }
    checkAborted(controller.signal);
    if (!isHospitalCoordinates(data?.center) || !Array.isArray(data?.items)) {
      throw new Error('병원검색 응답 형식이 명세서와 다릅니다.');
    }
    const total = data.total;
    const pageLimit = data.page?.limit;
    const pageOffset = data.page?.offset;
    if (!Number.isSafeInteger(total) || total < 0 || !Number.isInteger(pageLimit) || pageLimit < 1 || pageLimit > 50 ||
        !Number.isSafeInteger(pageOffset) || pageOffset < 0 || data.items.length > pageLimit ||
        data.items.length > total) {
      throw new Error('병원검색 응답 형식이 명세서와 다릅니다.');
    }
    const items: HospitalItem[] = data.items.flatMap((item: Record<string, unknown> | null) => {
      if (!item || typeof item.name !== 'string' || !item.name.trim() ||
          !isHospitalCoordinates(item.location) ||
          (item.distance_m !== null && (typeof item.distance_m !== 'number' ||
            !Number.isFinite(item.distance_m) || item.distance_m < 0))) return [];
      return [{
        hospital_id: nullableString(item.hospital_id), name: item.name,
        address: nullableString(item.address), location: { lat: item.location.lat, lng: item.location.lng },
        distance_m: item.distance_m, phone_number: nullableString(item.phone_number),
        rating: nullableNumber(item.rating), review_count: nullableNumber(item.review_count),
        website_url: nullableString(item.website_url), place_url: nullableString(item.place_url),
        open_now: typeof item.open_now === 'boolean' ? item.open_now : null,
      }];
    });
    if (data.items.length > 0 && items.length === 0) {
      throw new Error('서버에서 올바른 병원 좌표와 거리를 받지 못했습니다.');
    }
    logHospitalSearch('response', {
      status: response.status, responseKeys: Object.keys(data), total: data.total,
      count: items.length, skippedCount: data.items.length - items.length,
      sample: items.slice(0, 5).map((item) => ({
        name: item.name, distanceM: item.distance_m, hasAddress: !!item.address,
        hasCoordinates: true, hasPhone: !!item.phone_number, hasWebsite: !!item.website_url,
      })),
    });
    return {
      center: { lat: data.center.lat, lng: data.center.lng }, items,
      radius_km: nullableNumber(data.radius_km) ?? radius, sort_by: 'distance',
      total, page: { limit: pageLimit, offset: pageOffset },
    };
  } catch (error) {
    if (timedOut && !signal?.aborted) throw new Error('병원검색 응답이 지연되고 있습니다. 다시 시도해 주세요.');
    if (signal?.aborted) throw abortError();
    logHospitalSearch('error', { name: error instanceof Error ? error.name : 'UnknownError' });
    if (error instanceof TypeError) throw new Error('서버에 연결할 수 없습니다. 네트워크를 확인한 뒤 다시 시도해 주세요.');
    throw error;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', onAbort);
  }
};
