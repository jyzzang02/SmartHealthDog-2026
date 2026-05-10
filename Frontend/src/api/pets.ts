import {
  getStoredAccessToken,
  getStoredRefreshToken,
  storeAuthTokens,
} from '../storage/tokenStorage';
import { refreshAuthToken } from './auth';

const API_BASE_URL = 'http://10.0.2.2:8088';

export interface PetListItem {
  id: number;
  name: string;
  species: string;
  breed?: string;
  sex?: string;
  birthDate?: string;
  neutered?: boolean;
  weightKg?: number;
  ownerId?: number;
}

export interface UpdatePetRequestFull {
  name: string;
  species: string;
  breed?: string;
  gender?: string;
  birthday?: string;
  isNeutered?: boolean;
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
  } catch (error) {
    console.warn('[pets] token refresh 실패', error);
    throw new Error('세션이 만료되었습니다. 다시 로그인해 주세요.');
  }

  if (response.status === 401 || response.status === 403) {
    throw new Error('세션이 만료되었습니다. 다시 로그인해 주세요.');
  }

  return response;
};

const buildPetFormData = (payload: UpdatePetPayloadFull | UpdatePetPayloadPartial) => {
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
