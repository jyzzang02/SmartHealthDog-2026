import {
  getStoredAccessToken,
  getStoredRefreshToken,
  storeAuthTokens,
} from '../storage/tokenStorage';
import { refreshAuthToken } from './auth';

const API_BASE_URL = 'http://api.puppydoc.ovh:8080';

export interface ShelterSearchParams {
  location?: string;
  lat?: number;
  lng?: number;
  radius_km?: number;
  sort_by?: 'distance' | 'rating' | 'review_count';
  limit?: number;
  offset?: number;
}

export interface ShelterListItem {
  shelter_id: number;
  name: string;
  address: string;
  phone_number?: string;
  location?: { lat: number; lng: number };
  distance_m?: number;
  rating?: number;
  review_count?: number;
  website_url?: string;
  place_url?: string;
  open_now?: boolean;
}

export interface ShelterSearchResponse {
  center?: { lat: number; lng: number };
  radius_km?: number;
  sort_by?: string;
  total?: number;
  items: ShelterListItem[];
  page?: { limit: number; offset: number };
}

export interface ShelterDetail {
  shelter_id: number;
  name: string;
  address: string;
  phone_number?: string;
  operating_hours?: string;
  introduction?: string;
  latitude?: number;
  longitude?: number;
  website_url?: string;
  contact_email?: string;
  rating?: number;
  review_count?: number;
}

export interface PetDetail {
  pet_id: number;
  shelter_id: number;
  name: string;
  species: string;
  breed?: string;
  gender?: string;
  age?: string;
  is_neutered?: boolean;
  adoption_status?: string;
  description?: string;
  images?: string[];
  created_at?: string;
  updated_at?: string;
  share_url?: string;
  shelter_contact?: {
    name?: string;
    phone_number?: string;
    address?: string;
    website_url?: string;
  };
}

export interface ShelterPetsParams {
  status?: string;
  limit?: number;
  offset?: number;
}

export interface ShelterPetsResponse {
  items: PetDetail[];
  total?: number;
  page?: { limit: number; offset: number };
}

const parseJsonSafe = async (response: Response) => {
  try {
    return await response.json();
  } catch {
    return null;
  }
};

const readErrorMessage = async (
  response: Response,
  fallbackMessage: string
): Promise<string> => {
  try {
    const errorText = await response.text();

    if (!errorText) {
      return fallbackMessage;
    }

    try {
      const parsed = JSON.parse(errorText);
      return parsed?.message || parsed?.error || errorText || fallbackMessage;
    } catch {
      return errorText || fallbackMessage;
    }
  } catch {
    return fallbackMessage;
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

  // 요청이 실제로 어디로 나가는지 확인하는 로그
  console.log('[shelters] request url', input);
  console.log('[shelters] accessToken len', accessToken.length);

  let response = await doFetch(accessToken);
  console.log('[shelters] fetch status', response.status);

  // 403은 토큰 만료가 아니라 권한/서버 설정 문제일 가능성이 큼.
  // 따라서 refresh token을 시도하지 않고 그대로 반환.
  if (response.status === 403) {
    return response;
  }

  // 401이 아닌 경우는 그대로 반환.
  if (response.status !== 401) {
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

    console.log('[shelters] token refreshed');
    console.log('[shelters] refreshed accessToken len', accessToken.length);

    response = await doFetch(accessToken);
    console.log('[shelters] fetch status after refresh', response.status);

    return response;
  } catch (err) {
    console.warn('[shelters] token refresh 실패', err);
    throw new Error('세션이 만료되었습니다. 다시 로그인해 주세요.');
  }
};

const handleShelterError = async (
  response: Response,
  fallbackMessage: string
): Promise<never> => {
  if (response.status === 401) {
    throw new Error('로그인이 필요합니다. 다시 로그인해 주세요.');
  }

  if (response.status === 403) {
    const serverMessage = await readErrorMessage(
      response,
      '보호소 API 접근이 거부되었습니다.'
    );

    console.log('[shelters] 403 error body', serverMessage);

    throw new Error(
      `보호소 API 접근이 거부되었습니다. 서버 권한 설정 또는 배포 반영 여부를 확인해 주세요. (HTTP 403)\n서버 응답: ${serverMessage}`
    );
  }

  const message = await readErrorMessage(response, fallbackMessage);
  throw new Error(message);
};

export const searchShelters = async (
  params: ShelterSearchParams
): Promise<ShelterSearchResponse> => {
  const query = new URLSearchParams();

  if (params.location) query.append('location', params.location);
  if (params.lat !== undefined) query.append('lat', String(params.lat));
  if (params.lng !== undefined) query.append('lng', String(params.lng));
  if (params.radius_km !== undefined) {
    query.append('radius_km', String(params.radius_km));
  }
  if (params.sort_by) query.append('sort_by', params.sort_by);
  if (params.limit !== undefined) query.append('limit', String(params.limit));
  if (params.offset !== undefined) query.append('offset', String(params.offset));

  const url = `${API_BASE_URL}/api/shelters/search${
    query.toString() ? `?${query.toString()}` : ''
  }`;

  const response = await authorizedFetch(url, {
    method: 'GET',
  });

  if (!response.ok) {
    await handleShelterError(
      response,
      `보호소 목록을 불러오지 못했습니다. (HTTP ${response.status})`
    );
  }

  const data = await parseJsonSafe(response);

  return {
    center: data?.center,
    radius_km: data?.radius_km,
    sort_by: data?.sort_by,
    total: data?.total,
    items: Array.isArray(data?.items) ? data.items : [],
    page: data?.page,
  };
};

export const getShelterDetail = async (
  shelterId: number
): Promise<ShelterDetail> => {
  const response = await authorizedFetch(
    `${API_BASE_URL}/api/shelters/${shelterId}`,
    {
      method: 'GET',
    }
  );

  if (!response.ok) {
    await handleShelterError(
      response,
      `보호소 정보를 불러오지 못했습니다. (HTTP ${response.status})`
    );
  }

  const data = await parseJsonSafe(response);

  return (data as { shelter?: ShelterDetail })?.shelter ?? (data as ShelterDetail);
};

export const getShelterPets = async (
  shelterId: number,
  params: ShelterPetsParams = {}
): Promise<ShelterPetsResponse> => {
  const query = new URLSearchParams();

  if (params.status) query.append('status', params.status);
  if (params.limit !== undefined) query.append('limit', String(params.limit));
  if (params.offset !== undefined) query.append('offset', String(params.offset));

  const url = `${API_BASE_URL}/api/shelters/${shelterId}/pets${
    query.toString() ? `?${query.toString()}` : ''
  }`;

  const response = await authorizedFetch(url, {
    method: 'GET',
  });

  if (!response.ok) {
    await handleShelterError(
      response,
      `입양 동물 목록을 불러오지 못했습니다. (HTTP ${response.status})`
    );
  }

  const data = await parseJsonSafe(response);

  const items = Array.isArray(data?.items)
    ? data.items
    : Array.isArray(data?.pets)
      ? data.pets
      : [];

  return {
    items,
    total: data?.total,
    page: data?.page,
  };
};

export const getShelterPetDetail = async (
  shelterId: number,
  petId: number
): Promise<PetDetail> => {
  const response = await authorizedFetch(
    `${API_BASE_URL}/api/shelters/${shelterId}/pets/${petId}`,
    {
      method: 'GET',
    }
  );

  if (!response.ok) {
    await handleShelterError(
      response,
      `입양 가능 동물 정보를 불러오지 못했습니다. (HTTP ${response.status})`
    );
  }

  const data = await parseJsonSafe(response);

  return (data as { pet?: PetDetail })?.pet ?? (data as PetDetail);
};