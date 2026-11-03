import {
  getStoredAccessToken,
  getAuthSession,
  assertAuthSession,
} from '../storage/tokenStorage';
import { refreshSessionAccessToken } from './refreshSession';
import { parseWalkPathCoordinates } from '../utils/walkPath';

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
  sunlight?: SunlightTodayResponse | null;
}

const normalizeWalkRecord = (walk: WalkRecordDto): WalkRecordDto => {
  const coordinates = parseWalkPathCoordinates(walk.path_coordinates ?? walk.pathCoordinates);
  return {
    ...walk,
    path_coordinates: coordinates,
    ...(walk.pathCoordinates !== undefined ? { pathCoordinates: coordinates } : {}),
  };
};

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
  active_duration_seconds?: number;
  distance: number;
  path_coordinates: WalkCoordinate[];
}

export interface LightSample {
  client_sample_id: string;
  measured_at: string;
  lux: number;
}

export interface LightSamplesResponse {
  result: {
    received_count: number;
    saved_count: number;
    duplicate_count: number;
  };
}

export interface SunlightTodayResponse {
  date: string;
  target_lux_minutes: number;
  achieved_lux_minutes: number;
  qualifying_minutes: number;
  qualified_windows: number;
  sample_count: number;
  progress_percent: number;
  completed: boolean;
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

let walkListRequestSequence = 0;

const logWalkListDiagnostic = (event: string, data: Record<string, unknown>) => {
  if (__DEV__) console.info('[walk-debug] walk-list:' + event + ' ' + JSON.stringify(data));
};

const sanitizeWalkErrorBody = (body: string) => body
  .replace(/Bearer\s+[^\s"'<>,]+/gi, 'Bearer [redacted]')
  .replace(/[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+/g, '[redacted-jwt]')
  .replace(/("[^"\n]*(?:token|password|secret|authorization|cookie)[^"\n]*"\s*:\s*")[^"\n]*"/gi, '$1[redacted]"')
  .slice(0, 3000);

const authorizedFetch = async (
  input: string,
  init?: RequestInit,
  diagnosticId?: string,
): Promise<Response> => {
  const session = getAuthSession();
  let accessToken = await getStoredAccessToken();
  assertAuthSession(session);

  if (!accessToken) {
    throw new Error('로그인이 필요합니다. 다시 로그인해 주세요.');
  }

  const doFetch = async (token: string, attempt = 1) => {
    const response = await fetch(input, {
      ...(init || {}),
      headers: {
        ...(init?.headers || {}),
        ...buildAuthHeaders(token),
      },
    });
    if (diagnosticId) logWalkListDiagnostic('http', { requestId: diagnosticId, attempt, status: response.status });
    return response;
  };

  let response = await doFetch(accessToken);
  if (response.status !== 401 && response.status !== 403) {
    return response;
  }

  try {
    accessToken = await refreshSessionAccessToken(session, accessToken);
    assertAuthSession(session);
    response = await doFetch(accessToken, 2);
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
  return normalizeWalkRecord((data?.walk || data || {}) as WalkRecordDto);
};

export const uploadPetLightSamples = async (
  petId: number,
  walkId: number,
  samples: LightSample[],
  signal?: AbortSignal,
): Promise<LightSamplesResponse> => {
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const isoInstantPattern = /^[0-9]{4}-[0-9]{2}-[0-9]{2}T.+(?:Z|[+-][0-9]{2}:[0-9]{2})$/;
  if (samples.length === 0) {
    throw new Error('전송할 조도 기록이 없습니다.');
  }
  if (samples.some((sample) =>
    !uuidPattern.test(sample.client_sample_id) ||
    !isoInstantPattern.test(sample.measured_at) ||
    !Number.isFinite(Date.parse(sample.measured_at)) ||
    !Number.isFinite(sample.lux) ||
    sample.lux < 0
  )) {
    throw new Error('조도 기록의 UUID, 측정 시각 또는 lux 값이 올바르지 않습니다.');
  }

  const response = await authorizedFetch(
    API_BASE_URL + '/api/pets/' + petId + '/walks/' + walkId + '/light-samples',
    {
      signal,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ samples }),
    }
  );

  if (!response.ok) {
    await throwHttpError(response, '조도 기록 전송에 실패했습니다.');
  }

  const data = await parseJsonSafe(response);
  return (data || {}) as LightSamplesResponse;
};

export const getPetTodaySunlight = async (
  petId: number,
  date?: string,
): Promise<SunlightTodayResponse> => {
  if (date !== undefined) {
    const parsed = new Date(date + 'T00:00:00Z');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(parsed.getTime()) ||
        parsed.toISOString().slice(0, 10) !== date) {
      throw new Error('조회 날짜 형식이 올바르지 않습니다.');
    }
  }
  const response = await authorizedFetch(
    API_BASE_URL + '/api/pets/' + petId + '/sunlight/today' + buildQueryString({ date }),
    { method: 'GET' }
  );

  if (!response.ok) {
    console.warn('[walk-debug] sunlight:today-error', { petId, status: response.status });
    await throwHttpError(response, '오늘의 일광 노출 정보를 불러오지 못했습니다.');
  }

  const data = await parseJsonSafe(response);
  const sunlight = (data?.sunlight ?? data?.data?.sunlight ?? data?.data ?? data ?? {}) as SunlightTodayResponse;
  if (date !== undefined && sunlight.date !== date) {
    throw new Error('요청한 날짜의 조도 결과를 확인하지 못했습니다.');
  }
  console.log('[walk-debug] sunlight:today-response', {
    petId,
    date: sunlight.date,
    targetLuxMinutes: sunlight.target_lux_minutes,
    achievedLuxMinutes: sunlight.achieved_lux_minutes,
    qualifyingMinutes: sunlight.qualifying_minutes,
    qualifiedWindows: sunlight.qualified_windows,
    sampleCount: sunlight.sample_count,
    progressPercent: sunlight.progress_percent,
    completed: sunlight.completed,
    responseKeys: data && typeof data === 'object' ? Object.keys(data) : [],
  });
  return sunlight;
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

  const requestId = Date.now().toString(36) + '-' + (++walkListRequestSequence);
  const url = API_BASE_URL + '/api/pets/' + petId + '/walks' + query;
  const startedAt = Date.now();
  logWalkListDiagnostic('request', {
    requestId, method: 'GET', url, petId,
    timezone: params?.timezone ?? null, startDate: params?.startDate ?? null,
    endDate: params?.endDate ?? null, sortBy: params?.sortBy ?? null,
    limit: params?.limit ?? null, offset: params?.offset ?? null,
  });
  let response: Response;
  try {
    response = await authorizedFetch(url, { method: 'GET' }, requestId);
  } catch (error) {
    logWalkListDiagnostic('request-failed', {
      requestId, elapsedMs: Date.now() - startedAt,
      errorName: error instanceof Error ? error.name : 'UnknownError',
    });
    throw error;
  }

  if (!response.ok) {
    if (__DEV__) {
      let responseBody = '[unreadable]';
      try { responseBody = sanitizeWalkErrorBody(await response.clone().text()); } catch { /* Logging must not consume or replace the error response. */ }
      logWalkListDiagnostic('http-error', {
        requestId, status: response.status, elapsedMs: Date.now() - startedAt,
        contentType: response.headers?.get('content-type') ?? null,
        serverRequestId: response.headers?.get('x-request-id') ?? response.headers?.get('x-correlation-id') ?? null,
        responseBody,
      });
    }
    await throwHttpError(response, '산책 목록을 불러오지 못했습니다.');
  }
  logWalkListDiagnostic('http-success', { requestId, status: response.status, elapsedMs: Date.now() - startedAt });

  const data = await parseJsonSafe(response);
  const result = (data || {}) as PetWalkListResponse;
  if (Array.isArray(result.items)) result.items = result.items.map(normalizeWalkRecord);
  console.log('[walk-debug] walk-list:response', {
    petId,
    count: result.items?.length ?? 0,
    walks: (result.items ?? []).map((walk) => ({
      walkId: walk.walk_id ?? walk.walkId ?? walk.id,
      petId: walk.pet_id ?? walk.petId,
      startTime: walk.start_time ?? walk.startTime,
      endTime: walk.end_time ?? walk.endTime,
      sunlight: walk.sunlight ?? null,
    })),
    responseKeys: Object.keys(result),
  });
  return result;
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
  return (Array.isArray(data) ? data : []).map(normalizeWalkRecord);
};

export const getWalkDetail = async (walkId: number): Promise<WalkRecordDto> => {
  const response = await authorizedFetch(`${API_BASE_URL}/api/walks/${walkId}`, {
    method: 'GET',
  });

  if (!response.ok) {
    console.warn('[walk-debug] walk-detail:error', { walkId, status: response.status });
    await throwHttpError(response, '산책 상세를 불러오지 못했습니다.');
  }

  const data = await parseJsonSafe(response);
  const walk = normalizeWalkRecord((data?.walk || data) as WalkRecordDto);
  console.log('[walk-debug] walk-detail:response', {
    requestedWalkId: walkId,
    responseWalkId: walk.walk_id ?? walk.walkId ?? walk.id,
    petId: walk.pet_id ?? walk.petId,
    startTime: walk.start_time ?? walk.startTime,
    endTime: walk.end_time ?? walk.endTime,
    sunlight: walk.sunlight ?? null,
    responseKeys: walk && typeof walk === 'object' ? Object.keys(walk) : [],
  });
  return walk;
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

