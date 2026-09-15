import {
  getStoredAccessToken,
  getStoredRefreshToken,
  storeAuthTokens,
} from '../storage/tokenStorage';
import { refreshAuthToken } from './auth';

const API_BASE_URL = 'http://api.puppydoc.ovh:8080';

export type WalkCoordinate = [number, number];

export interface WalkRecordDto {
  id?: number;
  walk_id?: number;
  walkId?: number;
  pet_id?: number;
  petId?: number;
  pet?: {
    id?: number;
    name?: string;
    species?: string;
    profilePicture?: string;
  };
  start_time?: string;
  startTime?: string;
  end_time?: string | null;
  endTime?: string | null;
  duration?: number | null;
  distance?: number;
  path_coordinates?: WalkCoordinate[];
  pathCoordinates?: WalkCoordinate[];
  photos?: string[];
}

export interface PetWalkListResponse {
  pet_id?: number;
  petId?: number;
  total?: number;
  items?: WalkRecordDto[];
  page?: {
    limit?: number;
    offset?: number;
    sort_by?: string;
    start_date?: string;
    end_date?: string;
  };
}

export const isCompletedWalkRecord = (walk: WalkRecordDto): boolean => {
  const endTime = walk.end_time ?? walk.endTime;
  return typeof endTime === 'string' && endTime.trim().length > 0;
};

export interface StartWalkRequest {
  startTime: string;
}

export interface EndWalkRequest {
  end_time: string;
  distance: number;
  path_coordinates: WalkCoordinate[];
}

export interface WeeklyComparisonResponse {
  userId: number;
  timezone: string;
  period?: {
    current?: { startDate?: string; endDate?: string };
    previous?: { startDate?: string; endDate?: string };
  };
  pets?: Array<{
    petId: number;
    name: string;
    currentWeekSummary?: {
      totalWalks?: number;
      totalDistanceKm?: number;
      totalDurationSec?: number;
    };
    previousWeekSummary?: {
      totalWalks?: number;
      totalDistanceKm?: number;
      totalDurationSec?: number;
    };
    delta?: {
      walksPct?: number | null;
      distancePct?: number | null;
      durationPct?: number | null;
    };
  }>;
}

const parseJsonSafe = async (response: Response) => {
  try {
    return await response.json();
  } catch {
    return null;
  }
};

const readErrorBody = async (response: Response) => {
  try {
    return await response.text();
  } catch {
    return '';
  }
};

const buildAuthHeaders = (accessToken: string) => ({
  Authorization: `Bearer ${accessToken}`,
  Accept: 'application/json',
});

const authorizedFetch = async (
  input: string,
  init?: RequestInit
): Promise<Response> => {
  let accessToken = await getStoredAccessToken();

  if (!accessToken) {
    throw new Error('로그인이 필요합니다. 다시 로그인해 주세요.');
  }

  const doFetch = (token: string) =>
    fetch(input, {
      ...(init || {}),
      headers: {
        ...(init?.headers || {}),
        ...buildAuthHeaders(token),
      },
    });

  let response = await doFetch(accessToken);
  if (response.status !== 401 && response.status !== 403) {
    return response;
  }

  const refreshToken = await getStoredRefreshToken();
  if (!refreshToken) {
    throw new Error('세션이 만료되었습니다. 다시 로그인해 주세요.');
  }

  try {
    const newTokens = await refreshAuthToken(refreshToken);
    await storeAuthTokens(newTokens);
    accessToken = newTokens.accessToken;
    response = await doFetch(accessToken);
  } catch {
    throw new Error('세션이 만료되었습니다. 다시 로그인해 주세요.');
  }

  if (response.status === 401 || response.status === 403) {
    throw new Error('세션이 만료되었습니다. 다시 로그인해 주세요.');
  }

  return response;
};

const buildQueryString = (params: Record<string, string | number | undefined>) => {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    search.append(key, String(value));
  });
  const raw = search.toString();
  return raw ? `?${raw}` : '';
};

const throwHttpError = async (response: Response, fallback: string) => {
  const data = await parseJsonSafe(response);
  const text = await readErrorBody(response);
  const message = data?.error || data?.message || text || `${fallback} (HTTP ${response.status})`;
  throw new Error(message);
};

const extractWalkId = (data: any, location: string | null): number | null => {
  const rawId =
    data?.walkId ??
    data?.walk_id ??
    data?.id ??
    data?.walk?.walkId ??
    data?.walk?.walk_id ??
    data?.walk?.id;
  const numericId = Number(rawId);

  if (Number.isFinite(numericId) && numericId > 0) {
    return numericId;
  }

  const matched = location?.match(/\/walks\/(\d+)(?:\/|$)/i);
  const locationId = Number(matched?.[1]);
  return Number.isFinite(locationId) && locationId > 0 ? locationId : null;
};

export const findActivePetWalkId = async (
  petId: number,
  startedAt?: string
): Promise<number | null> => {
  const response = await getPetWalks(petId, {
    sortBy: 'date_desc',
    limit: 20,
    offset: 0,
  });
  const activeWalks = (response.items || []).filter((walk) => {
    const endTime = walk.end_time ?? walk.endTime;
    return endTime == null;
  });

  if (activeWalks.length === 0) {
    return null;
  }

  const targetStartedAt = startedAt ? Date.parse(startedAt) : Number.NaN;
  const sorted = [...activeWalks].sort((a, b) => {
    if (Number.isNaN(targetStartedAt)) return 0;
    const aStartedAt = Date.parse(a.start_time ?? a.startTime ?? '');
    const bStartedAt = Date.parse(b.start_time ?? b.startTime ?? '');
    const aDifference = Number.isNaN(aStartedAt)
      ? Number.POSITIVE_INFINITY
      : Math.abs(aStartedAt - targetStartedAt);
    const bDifference = Number.isNaN(bStartedAt)
      ? Number.POSITIVE_INFINITY
      : Math.abs(bStartedAt - targetStartedAt);
    return aDifference - bDifference;
  });
  const walkId = sorted[0]?.id ?? sorted[0]?.walk_id ?? sorted[0]?.walkId;
  const numericId = Number(walkId);
  return Number.isFinite(numericId) && numericId > 0 ? numericId : null;
};

export const startPetWalk = async (
  petId: number,
  payload: StartWalkRequest
): Promise<number> => {
  const response = await authorizedFetch(`${API_BASE_URL}/api/pets/${petId}/walks`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    await throwHttpError(response, '산책 시작에 실패했습니다.');
  }

  const data = await parseJsonSafe(response);
  const walkId = extractWalkId(data, response.headers.get('Location'));
  if (walkId) {
    return walkId;
  }

  const fallbackWalkId = await findActivePetWalkId(petId, payload.startTime);
  if (!fallbackWalkId) {
    throw new Error('시작된 산책 기록 ID를 확인하지 못했습니다.');
  }

  return fallbackWalkId;
};

export const endPetWalk = async (
  petId: number,
  walkId: number,
  payload: EndWalkRequest
): Promise<WalkRecordDto> => {
  const response = await authorizedFetch(
    `${API_BASE_URL}/api/pets/${petId}/walks/${walkId}/end`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    }
  );

  if (!response.ok) {
    await throwHttpError(response, '산책 종료에 실패했습니다.');
  }

  const data = await parseJsonSafe(response);
  return (data?.walk || data || {}) as WalkRecordDto;
};

export const getPetWalks = async (
  petId: number,
  params?: {
    timezone?: string;
    startDate?: string;
    endDate?: string;
    sortBy?: 'date_asc' | 'date_desc';
    limit?: number;
    offset?: number;
  }
): Promise<PetWalkListResponse> => {
  const query = buildQueryString({
    timezone: params?.timezone,
    start_date: params?.startDate,
    end_date: params?.endDate,
    sort_by: params?.sortBy,
    limit: params?.limit,
    offset: params?.offset,
  });

  const response = await authorizedFetch(`${API_BASE_URL}/api/pets/${petId}/walks${query}`, {
    method: 'GET',
  });

  if (!response.ok) {
    await throwHttpError(response, '산책 목록을 불러오지 못했습니다.');
  }

  const data = await parseJsonSafe(response);
  return (data || {}) as PetWalkListResponse;
};

export const getMyThisWeekWalks = async (timezone?: string): Promise<WalkRecordDto[]> => {
  const query = buildQueryString({ timezone });
  const response = await authorizedFetch(`${API_BASE_URL}/api/users/me/walks/this-week${query}`, {
    method: 'GET',
  });

  if (!response.ok) {
    await throwHttpError(response, '이번 주 산책 기록을 불러오지 못했습니다.');
  }

  const data = await parseJsonSafe(response);
  return (Array.isArray(data) ? data : []) as WalkRecordDto[];
};

export const getWalkDetail = async (walkId: number): Promise<WalkRecordDto> => {
  const response = await authorizedFetch(`${API_BASE_URL}/api/walks/${walkId}`, {
    method: 'GET',
  });

  if (!response.ok) {
    await throwHttpError(response, '산책 상세를 불러오지 못했습니다.');
  }

  const data = await parseJsonSafe(response);
  return (data?.walk || data) as WalkRecordDto;
};

export const deleteWalk = async (walkId: number): Promise<void> => {
  const response = await authorizedFetch(`${API_BASE_URL}/api/walks/${walkId}`, {
    method: 'DELETE',
  });

  if (response.status === 204) {
    return;
  }

  if (!response.ok) {
    await throwHttpError(response, '산책 기록을 삭제하지 못했습니다.');
  }
};

export const getWeeklyWalkComparison = async (
  timezone?: string
): Promise<WeeklyComparisonResponse> => {
  const query = buildQueryString({ timezone });
  const response = await authorizedFetch(
    `${API_BASE_URL}/api/users/me/walks/summary/weekly-comparison${query}`,
    {
      method: 'GET',
    }
  );

  if (!response.ok) {
    await throwHttpError(response, '주간 산책 요약을 불러오지 못했습니다.');
  }

  const data = await parseJsonSafe(response);
  return (data || {}) as WeeklyComparisonResponse;
};

