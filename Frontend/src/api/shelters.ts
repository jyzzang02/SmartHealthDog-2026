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
  breed?: string | null;
  gender?: string | null;
  age?: string | null;
  is_neutered?: boolean | null;
  adoption_status?: string | null;
  description?: string | null;
  images?: string[] | null;
  created_at?: string | null;
  updated_at?: string | null;
  share_url?: string | null;
  shelter_contact?: {
    name?: string | null;
    phone_number?: string | null;
    address?: string | null;
    website_url?: string | null;
  } | null;
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

const adoptionDataError = () => new Error('입양 동물 정보를 불러오지 못했습니다.');

const isPositiveId = (value: unknown): value is number =>
  Number.isSafeInteger(value) && (value as number) > 0;

const normalizeAdoptionPet = (value: unknown, shelterId: number): PetDetail => {
  if (!isRecord(value) || !isPositiveId(value.pet_id)
    || typeof value.name !== 'string' || typeof value.species !== 'string'
    || (value.shelter_id !== undefined && value.shelter_id !== shelterId)) {
    throw adoptionDataError();
  }
  const textFields = ['breed', 'gender', 'age', 'adoption_status', 'description',
    'created_at', 'updated_at', 'share_url', 'image_url'];
  if (textFields.some(field => value[field] != null && typeof value[field] !== 'string')
    || (value.is_neutered != null && typeof value.is_neutered !== 'boolean')
    || (value.images != null && (!Array.isArray(value.images)
      || !value.images.every(image => typeof image === 'string')))) {
    throw adoptionDataError();
  }
  if (value.shelter_contact != null) {
    if (!isRecord(value.shelter_contact)) throw adoptionDataError();
    const contact = value.shelter_contact;
    if (['name', 'phone_number', 'address', 'website_url']
      .some(field => contact[field] != null && typeof contact[field] !== 'string')) {
      throw adoptionDataError();
    }
  }
  const images = (Array.isArray(value.images) ? value.images as string[] : [])
    .map(image => image.trim()).filter(Boolean);
  const imageUrl = typeof value.image_url === 'string' ? value.image_url.trim() : '';
  return {
    ...value,
    shelter_id: shelterId,
    images: images.length ? images : imageUrl ? [imageUrl] : undefined,
  } as PetDetail;
};

export const getShelterPets = async (
  shelterId: number,
  params: ShelterPetsParams = {},
  signal?: AbortSignal
): Promise<ShelterPetsResponse> => {
  const limit = params.limit ?? 20;
  const offset = params.offset ?? 0;
  if (!isPositiveId(shelterId) || !Number.isSafeInteger(limit) || limit < 1 || limit > 1000
    || !Number.isSafeInteger(offset) || offset < 0 || offset > 2147483647) {
    throw adoptionDataError();
  }
  const query = new URLSearchParams();
  if (params.status) query.append('status', params.status);
  query.append('limit', String(limit));
  query.append('offset', String(offset));
  const data = await requestShelterJson(
    `${API_BASE_URL}/api/shelters/${shelterId}/pets?${query.toString()}`,
    status => `입양 동물 목록을 불러오지 못했습니다. (HTTP ${status})`, signal
  );
  if (!isRecord(data) || (data.shelter_id !== undefined && data.shelter_id !== shelterId)) {
    throw adoptionDataError();
  }
  const items = Array.isArray(data.items) ? data.items : Array.isArray(data.pets) ? data.pets : null;
  const page = isRecord(data.page) ? data.page : undefined;
  // The current backend puts limit/offset at the response root.
  const responseLimit = data.limit ?? page?.limit ?? limit;
  const responseOffset = data.offset ?? page?.offset ?? offset;
  if (!items || !Number.isSafeInteger(responseLimit) || (responseLimit as number) < 1
    || (responseLimit as number) > limit || responseOffset !== offset
    || items.length > (responseLimit as number)
    || (data.total !== undefined && (!Number.isSafeInteger(data.total)
      || (data.total as number) < items.length))) {
    throw adoptionDataError();
  }
  return {
    items: items.map(pet => normalizeAdoptionPet(pet, shelterId)),
    total: data.total as number | undefined,
    page: { limit: responseLimit as number, offset },
  };
};

export const getAllShelterPets = async (
  shelterId: number,
  signal?: AbortSignal
): Promise<PetDetail[]> => {
  const items: PetDetail[] = [];
  const seen = new Set<number>();
  let expectedTotal: number | undefined;
  for (let pageIndex = 0; pageIndex < 100; pageIndex += 1) {
    if (signal?.aborted) throw Object.assign(new Error('Aborted'), { name: 'AbortError' });
    const response = await getShelterPets(shelterId,
      { status: 'AVAILABLE', limit: 20, offset: items.length }, signal);
    const total = response.total;
    // Legacy responses count this page only; a full page needs one more request.
    if (expectedTotal === undefined && total !== undefined && total > response.items.length) {
      expectedTotal = total;
    }
    if (expectedTotal !== undefined && total !== expectedTotal) throw adoptionDataError();
    for (const pet of response.items) {
      if (seen.has(pet.pet_id)) throw adoptionDataError();
      seen.add(pet.pet_id);
      items.push(pet);
    }
    if (expectedTotal !== undefined) {
      if (items.length > expectedTotal) throw adoptionDataError();
      if (items.length === expectedTotal) return items;
      if (response.items.length === 0) throw adoptionDataError();
    } else if (response.items.length < response.page!.limit) {
      return items;
    }
  }
  throw adoptionDataError();
};

export const getShelterPetDetail = async (
  shelterId: number,
  petId: number,
  signal?: AbortSignal
): Promise<PetDetail> => {
  if (!isPositiveId(shelterId) || !isPositiveId(petId)) throw adoptionDataError();
  const data = await requestShelterJson(
    `${API_BASE_URL}/api/shelters/${shelterId}/pets/${petId}`,
    status => `입양 가능 동물 정보를 불러오지 못했습니다. (HTTP ${status})`, signal
  );
  const value = isRecord(data) ? data.pet ?? data : data;
  if (!isRecord(value) || value.pet_id !== petId || value.shelter_id !== shelterId) {
    throw adoptionDataError();
  }
  return normalizeAdoptionPet(value, shelterId);
};
