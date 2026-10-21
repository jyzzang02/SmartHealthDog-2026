import {
  getStoredAccessToken,
  getAuthSession,
  assertAuthSession,
} from '../storage/tokenStorage';
import { refreshSessionAccessToken } from './refreshSession';

const API_BASE_URL = 'http://api.puppydoc.ovh:8080';

export interface ShelterSearchParams {
  province?: string;
  district?: string;
  location?: string;
  lat?: number;
  lng?: number;
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
  distance_m?: number | null;
  rating?: number | null;
  review_count?: number | null;
  website_url?: string;
  place_url?: string;
  open_now?: boolean;
}

export interface ShelterSearchResponse {
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
  rating?: number | null;
  review_count?: number | null;
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
  const session = getAuthSession();
  let accessToken = await getStoredAccessToken();
  assertAuthSession(session);

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

  // 403은 토큰 만료가 아니라 권한/서버 설정 문제일 가능성이 큼.
  // 따라서 refresh token을 시도하지 않고 그대로 반환.
  if (response.status === 403) {
    return response;
  }

  // 401이 아닌 경우는 그대로 반환.
  if (response.status !== 401) {
    return response;
  }

  try {
    accessToken = await refreshSessionAccessToken(session, accessToken);
    assertAuthSession(session);

    response = await doFetch(accessToken);

    return response;
  } catch {
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

    throw new Error(
      `보호소 API 접근이 거부되었습니다. 서버 권한 설정 또는 배포 반영 여부를 확인해 주세요. (HTTP 403)\n서버 응답: ${serverMessage}`
    );
  }

  const message = await readErrorMessage(response, fallbackMessage);
  throw new Error(message);
};

const requestShelterJson = async (
  url: string,
  fallbackMessage: (status: number) => string,
  signal?: AbortSignal
) => {
  const response = await authorizedFetch(url, { method: 'GET', signal });
  if (!response.ok) {
    await handleShelterError(response, fallbackMessage(response.status));
  }
  return parseJsonSafe(response);
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isShelter = (value: unknown): value is ShelterListItem =>
  isRecord(value) && Number.isSafeInteger(value.shelter_id) && (value.shelter_id as number) > 0
    && typeof value.name === 'string' && typeof value.address === 'string';

export const searchShelters = async (
  params: ShelterSearchParams,
  signal?: AbortSignal
): Promise<ShelterSearchResponse> => {
  const query = new URLSearchParams();

  const province = params.province?.trim();
  const district = params.district?.trim();
  if (province) query.append('province', province);
  if (district) query.append('district', district);
  if (params.location) query.append('location', params.location);
  const hasCoordinates = typeof params.lat === 'number' && Number.isFinite(params.lat)
    && Math.abs(params.lat) <= 90 && typeof params.lng === 'number'
    && Number.isFinite(params.lng) && Math.abs(params.lng) <= 180;
  if (hasCoordinates) {
    query.append('lat', String(params.lat));
    query.append('lng', String(params.lng));
  }
  if (params.sort_by) query.append('sort_by', params.sort_by);
  if (params.limit !== undefined) query.append('limit', String(params.limit));
  if (params.offset !== undefined) query.append('offset', String(params.offset));

  const url = `${API_BASE_URL}/api/shelters/search${
    query.toString() ? `?${query.toString()}` : ''
  }`;

  const data = await requestShelterJson(url,
    status => `보호소 목록을 불러오지 못했습니다. (HTTP ${status})`, signal);

  if (!isRecord(data) || !Array.isArray(data.items) || !data.items.every(isShelter)
    || !Number.isSafeInteger(data.total) || (data.total as number) < data.items.length) {
    throw new Error('보호소 정보를 불러오지 못했습니다.');
  }

  return {
    sort_by: data.sort_by as string | undefined,
    total: data.total as number,
    items: data.items,
    page: data.page as ShelterSearchResponse["page"],
  };
};

export const searchAllShelters = async (
  params: ShelterSearchParams,
  signal?: AbortSignal
): Promise<ShelterSearchResponse> => {
  const items: ShelterListItem[] = [];
  const seen = new Set<number>();
  let expectedTotal: number | undefined;
  // Bound requests and reject incomplete results instead of displaying a partial list.
  for (let pageIndex = 0; pageIndex < 100; pageIndex += 1) {
    if (signal?.aborted) throw Object.assign(new Error('Aborted'), { name: 'AbortError' });
    const response = await searchShelters({ ...params, limit: 1000, offset: items.length }, signal);
    const total = response.total;
    if (typeof total !== 'number' || !Number.isSafeInteger(total) || total < 0
      || (expectedTotal !== undefined && expectedTotal !== total)
      || response.items.length > 1000 || items.length + response.items.length > total
      || (response.page && response.page.offset !== items.length)
      || (response.items.length === 0 && items.length < total)) {
      throw new Error('보호소 목록을 모두 확인하지 못했습니다. 다시 시도해 주세요.');
    }
    expectedTotal = total;
    for (const item of response.items) {
      if (seen.has(item.shelter_id)) {
        throw new Error('보호소 목록을 모두 확인하지 못했습니다. 다시 시도해 주세요.');
      }
      seen.add(item.shelter_id);
      items.push(item);
    }
    if (items.length === total) return { sort_by: response.sort_by, total, items };
  }
  throw new Error('보호소 목록을 모두 확인하지 못했습니다. 다시 시도해 주세요.');
};

export const getShelterDetail = async (
  shelterId: number,
  signal?: AbortSignal
): Promise<ShelterDetail> => {
  const data = await requestShelterJson(
    `${API_BASE_URL}/api/shelters/${shelterId}`,
    status => `보호소 정보를 불러오지 못했습니다. (HTTP ${status})`, signal
  );

  const detail = data?.shelter ?? data;
  if (!isShelter(detail) || detail.shelter_id !== shelterId) {
    throw new Error('보호소 정보를 불러오지 못했습니다.');
  }
  return detail as ShelterDetail;
};

export const getShelterPets = async (
  shelterId: number,
  params: ShelterPetsParams = {},
  signal?: AbortSignal
): Promise<ShelterPetsResponse> => {
  const query = new URLSearchParams();

  if (params.status) query.append('status', params.status);
  if (params.limit !== undefined) query.append('limit', String(params.limit));
  if (params.offset !== undefined) query.append('offset', String(params.offset));

  const url = `${API_BASE_URL}/api/shelters/${shelterId}/pets${
    query.toString() ? `?${query.toString()}` : ''
  }`;

  const data = await requestShelterJson(url,
    status => `입양 동물 목록을 불러오지 못했습니다. (HTTP ${status})`, signal);

  const items = Array.isArray(data?.items)
    ? data.items
    : Array.isArray(data?.pets)
      ? data.pets
      : null;
  if (!items || !items.every((pet: unknown) => isRecord(pet)
    && Number.isSafeInteger(pet.pet_id) && (pet.pet_id as number) > 0
    && typeof pet.name === 'string' && typeof pet.species === 'string')) {
    throw new Error('입양 동물 정보를 불러오지 못했습니다.');
  }

  return {
    items: items.map((pet: PetDetail & { image_url?: string | null }) => ({
      ...pet,
      shelter_id: shelterId,
      images: typeof pet.image_url === 'string' && pet.image_url.trim()
        ? [pet.image_url.trim()]
        : pet.images,
    })),
    total: data?.total,
    page: data?.page,
  };
};

export const getShelterPetDetail = async (
  shelterId: number,
  petId: number
): Promise<PetDetail> => {
  const data = await requestShelterJson(
    `${API_BASE_URL}/api/shelters/${shelterId}/pets/${petId}`,
    status => `입양 가능 동물 정보를 불러오지 못했습니다. (HTTP ${status})`
  );

  return (data as { pet?: PetDetail })?.pet ?? (data as PetDetail);
};
