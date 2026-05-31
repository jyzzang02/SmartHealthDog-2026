import { Platform } from 'react-native';
import {
  getStoredAccessToken,
  getStoredRefreshToken,
  storeAuthTokens,
} from '../storage/tokenStorage';
import { refreshAuthToken } from './auth';
import { resolveImageUri } from '../utils/imageUri';

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
  profilePicture?: string;
  profilePictureUrl?: string;
  profileImage?: string;
  profileImageUrl?: string;
  profile_image?: string;
  profilePic?: string;
  profile_pic?: string;
  image_url?: string;
  photo_url?: string;
  imageUrl?: string;
  photoUrl?: string;
  profile_picture?: string;
  image?: string;
  thumbnailUrl?: string;
  healthInfo?: string[];
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

const getMimeTypeFromUri = (uri: string) => {
  const lower = uri.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  return 'image/jpeg';
};

const normalizeFileName = (uri: string) => {
  const segments = uri.split('/');
  const lastSegment = segments[segments.length - 1];
  if (lastSegment && lastSegment.includes('.')) return lastSegment;
  const extension = Platform.OS === 'ios' ? 'jpg' : 'jpeg';
  return `pet.${extension}`;
};

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
  } catch {
    throw new Error('세션이 만료되었습니다. 다시 로그인해 주세요.');
  }

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
      type: getMimeTypeFromUri(payload.profilePictureUri) || 'image/jpeg',
      name: normalizeFileName(payload.profilePictureUri) || 'pet.jpg',
    } as any);
  }

  return formData;
};

const pickFirstResolvableImage = (candidates: unknown[]): string | undefined => {
  for (const candidate of candidates) {
    if (typeof candidate !== 'string') continue;
    const imageUri = resolveImageUri(candidate);
    if (!imageUri) continue;
    return imageUri;
  }
  return undefined;
};

const extractPetImage = (data?: Partial<PetListItem> | null) =>
  pickFirstResolvableImage([
    (data as any)?.photoUrl,
    (data as any)?.photo_url,
    (data as any)?.imageUrl,
    (data as any)?.image_url,
    (data as any)?.profilePictureUrl,
    (data as any)?.profileImageUrl,
    data?.profilePicture,
    data?.profileImage,
    (data as any)?.profile_image,
    (data as any)?.profilePic,
    (data as any)?.profile_pic,
    (data as any)?.profile_picture,
    (data as any)?.thumbnailUrl,
    (data as any)?.image,
  ]);

const extractSubmissionIdFromLocation = (location?: string | null) => {
  if (!location) return undefined;
  const matched = location.match(/\/api\/submissions\/([^/?#]+)/i);
  return matched?.[1];
};

const normalizePet = (data?: Partial<PetListItem> | null): PetListItem => {
  if (!data) {
    throw new Error('반려동물 데이터를 확인할 수 없습니다.');
  }
  return {
    ...(data as PetListItem),
    profilePicture: extractPetImage(data),
  } as PetListItem;
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
  const items = (Array.isArray(data) ? data : []) as PetListItem[];
  const normalizedPets = items.map((item) => normalizePet(item));
  const needsImageEnrichment = normalizedPets.some(
    (pet) => !extractPetImage(pet) && Number.isFinite(pet.id)
  );

  if (!needsImageEnrichment) {
    return normalizedPets;
  }

  const enriched = await Promise.all(
    normalizedPets.map(async (pet) => {
      if (extractPetImage(pet) || !Number.isFinite(pet.id)) {
        return pet;
      }

      try {
        const detailResponse = await authorizedFetch(`${API_BASE_URL}/api/pets/${pet.id}`, {
          method: 'GET',
        });

        if (!detailResponse.ok) {
          return pet;
        }

        const detailData = await parseJsonSafe(detailResponse);
        const detail = normalizePet(detailData as PetListItem);
        return {
          ...pet,
          ...detail,
          profilePicture: detail.profilePicture || pet.profilePicture,
        };
      } catch {
        return pet;
      }
    })
  );

  return enriched;
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

  return normalizePet(data as PetListItem);
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

  return normalizePet(data as PetListItem);
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

  return normalizePet(data as PetListItem);
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

/**
 * 소변키트 진단 이미지 업로드
 * @param petId 반려동물 ID
 * @param image { uri, type, fileName, fileSize }
 */
export const requestUrineDiagnosis = async (
  petId: number,
  image: { uri: string; type?: string; fileName?: string; fileSize?: number }
): Promise<{ id?: string; submissionId?: string } | null> => {
  if (!Number.isFinite(petId) || petId <= 0) {
    throw new Error('유효한 반려동물을 선택해 주세요.');
  }

  const uploadUrl = `${API_BASE_URL}/api/pets/${petId}/submissions/urine`;
  const formData = new FormData();
  const mimeType = image.type || getMimeTypeFromUri(image.uri) || 'image/jpeg';
  const fileName = image.fileName || normalizeFileName(image.uri) || 'urine.jpg';

  console.log('[diagnosis] upload:urine:start', {
    petId,
    uploadUrl,
    uri: image.uri,
    fileName,
    mimeType,
    fileSize: image.fileSize,
  });

  formData.append('image', {
    uri: image.uri,
    type: mimeType,
    name: fileName,
  } as any);

  const response = await authorizedFetch(uploadUrl, {
    method: 'POST',
    body: formData,
  });

  if (response.status === 201) {
    const data = await parseJsonSafe(response);
    if (data && typeof data === 'object') {
      return data as { id?: string; submissionId?: string };
    }
    const idFromLocation = extractSubmissionIdFromLocation(
      response.headers.get('Location')
    );
    return idFromLocation ? { submissionId: idFromLocation } : null;
  }

  const errorText = await readErrorBody(response);
  console.log('[diagnosis] upload:urine:error', {
    status: response.status,
    statusText: response.statusText,
    message: errorText,
  });
  throw new Error(
    errorText || `소변키트 진단 요청에 실패했습니다. (HTTP ${response.status})`
  );
};
