import {
  getStoredAccessToken,
  getStoredRefreshToken,
  storeAuthTokens,
} from '../storage/tokenStorage';
import { refreshAuthToken } from './auth';

const API_BASE_URL = 'http://api.puppydoc.ovh:8080';

export type PetSpecies = 'DOG' | 'CAT';
export type PetGender = 'MALE' | 'FEMALE' | 'UNKNOWN';

export interface PetListItem {
  id: number;
  name: string;
  species: PetSpecies | string;
  breed?: string;
  sex?: string;
  gender?: PetGender | string;
  birthDate?: string;
  birthday?: string;
  neutered?: boolean;
  weightKg?: number;
  ownerId?: number;
}

export interface UpdatePetRequestFull {
  name: string;
  species: PetSpecies;
  breed?: string;
  gender: PetGender;
  birthday?: string;
  neutered: boolean;
  weightKg?: number;
}

export type UpdatePetRequestPartial = Partial<UpdatePetRequestFull>;

export interface UpdatePetPayloadFull {
  id: number;
  request: UpdatePetRequestFull;
  profilePictureUri?: string | null;
}

export interface UpdatePetPayloadPartial {
  id: number;
  request: UpdatePetRequestPartial;
  profilePictureUri?: string | null;
}

export interface CreatePetRequest {
  name: string;
  species: PetSpecies;
  breed?: string;
  gender: PetGender;
  birthday?: string;
  neutered: boolean;
  weightKg?: number;
}

export interface CreatePetPayload {
  request: CreatePetRequest;
  profilePictureUri?: string | null;
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
  console.log('[pets] fetch status', response.status);

  if (response.status === 403) {
    throw new Error('권한이 없습니다.');
  }

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
    console.log('[pets] token refreshed');
  } catch (error) {
    console.warn('[pets] token refresh 실패', error);
    throw new Error('세션이 만료되었습니다. 다시 로그인해 주세요.');
  }

  console.log('[pets] fetch status', response.status);

  if (response.status === 403) {
    throw new Error('권한이 없습니다.');
  }

  if (response.status === 401 || response.status === 403) {
    throw new Error('세션이 만료되었습니다. 다시 로그인해 주세요.');
  }

  return response;
};

const buildPetFormData = (
  payload: UpdatePetPayloadFull | UpdatePetPayloadPartial | CreatePetPayload
) => {
  const formData = new FormData();

  formData.append(
    'request',
    {
      string: JSON.stringify(payload.request),
      type: 'application/json',
    } as any
  );

  if (payload.profilePictureUri) {
    formData.append('profilePicture', {
      uri: payload.profilePictureUri,
      type: 'image/jpeg',
      name: 'pet.jpg',
    } as any);
  }

  return formData;
};

export const getMyPets = async (): Promise<PetListItem[]> => {
  const response = await authorizedFetch(`${API_BASE_URL}/api/pets`, {
    method: 'GET',
  });

  if (!response.ok) {
    const errorText = await readErrorBody(response);
    const data = await parseJsonSafe(response);
    const message =
      data?.error ||
      data?.message ||
      errorText ||
      `반려동물 정보를 불러오지 못했습니다. (HTTP ${response.status})`;

    throw new Error(message);
  }

  const data = await parseJsonSafe(response);

  return (Array.isArray(data) ? data : []) as PetListItem[];
};

export const getPetDetail = async (id: number): Promise<PetListItem> => {
  const response = await authorizedFetch(`${API_BASE_URL}/api/pets/${id}`, {
    method: 'GET',
  });

  if (!response.ok) {
    const errorText = await readErrorBody(response);
    const data = await parseJsonSafe(response);
    const message =
      data?.error ||
      data?.message ||
      errorText ||
      `반려동물 정보를 불러오지 못했습니다. (HTTP ${response.status})`;

    throw new Error(message);
  }

  const data = await parseJsonSafe(response);

  return data as PetListItem;
};

export const createPet = async (
  payload: CreatePetPayload
): Promise<PetListItem> => {
  const response = await authorizedFetch(`${API_BASE_URL}/api/pets`, {
    method: 'POST',
    body: buildPetFormData(payload),
  });

  if (!response.ok) {
    const errorText = await readErrorBody(response);
    const data = await parseJsonSafe(response);
    const message =
      data?.error ||
      data?.message ||
      errorText ||
      `반려동물 등록에 실패했습니다. (HTTP ${response.status})`;

    throw new Error(message);
  }

  const data = await parseJsonSafe(response);

  return data as PetListItem;
};

export const updatePetFull = async (
  payload: UpdatePetPayloadFull
): Promise<PetListItem> => {
  const response = await authorizedFetch(
    `${API_BASE_URL}/api/pets/${payload.id}`,
    {
      method: 'PUT',
      body: buildPetFormData(payload),
    }
  );

  if (!response.ok) {
    const errorText = await readErrorBody(response);
    const data = await parseJsonSafe(response);
    const message =
      data?.error ||
      data?.message ||
      errorText ||
      `반려동물 정보를 저장하지 못했습니다. (HTTP ${response.status})`;

    throw new Error(message);
  }

  const data = await parseJsonSafe(response);

  return data as PetListItem;
};

export const updatePetPartial = async (
  payload: UpdatePetPayloadPartial
): Promise<PetListItem> => {
  const response = await authorizedFetch(
    `${API_BASE_URL}/api/pets/${payload.id}`,
    {
      method: 'PATCH',
      body: buildPetFormData(payload),
    }
  );

  if (!response.ok) {
    const errorText = await readErrorBody(response);
    const data = await parseJsonSafe(response);
    const message =
      data?.error ||
      data?.message ||
      errorText ||
      `반려동물 정보를 저장하지 못했습니다. (HTTP ${response.status})`;

    throw new Error(message);
  }

  const data = await parseJsonSafe(response);

  return data as PetListItem;
};

export const deletePet = async (id: number): Promise<void> => {
  const response = await authorizedFetch(`${API_BASE_URL}/api/pets/${id}`, {
    method: 'DELETE',
  });

  if (response.status === 204) {
    return;
  }

  if (!response.ok) {
    const errorText = await readErrorBody(response);
    const data = await parseJsonSafe(response);
    const message =
      data?.error ||
      data?.message ||
      errorText ||
      `반려동물 정보를 삭제하지 못했습니다. (HTTP ${response.status})`;

    throw new Error(message);
  }
};