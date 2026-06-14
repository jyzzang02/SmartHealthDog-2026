import {
  getStoredAccessToken,
  getStoredRefreshToken,
  storeAuthTokens,
} from '../storage/tokenStorage';
import { refreshAuthToken } from './auth';
import { resolveImageUri } from '../utils/imageUri';

const API_BASE_URL = 'http://api.puppydoc.ovh:8080';

export interface UserProfile {
  id: number;
  nickname: string;
  email: string;
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
}

export interface UpdateProfilePayload {
  nickname: string;
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

const pickFirstResolvableImage = (candidates: unknown[]): string | undefined => {
  for (const candidate of candidates) {
    if (typeof candidate !== 'string') continue;
    const imageUri = resolveImageUri(candidate);
    if (!imageUri) continue;
    return imageUri;
  }
  return undefined;
};

const extractProfileImage = (data?: Partial<UserProfile> | null) =>
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
  ]);

const normalizeProfile = (data?: Partial<UserProfile> | null): UserProfile => {
  if (!data) {
    throw new Error('사용자 프로필 데이터를 확인할 수 없습니다.');
  }
  return {
    ...(data as UserProfile),
    profilePicture: extractProfileImage(data),
  } as UserProfile;
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

export const getMyProfile = async (): Promise<UserProfile> => {
  const response = await authorizedFetch(`${API_BASE_URL}/api/users/me/profile`, {
    method: 'GET',
  });

  if (!response.ok) {
    const errorText = await readErrorBody(response);
    const data = await parseJsonSafe(response);
    const message =
      data?.error ||
      data?.message ||
      errorText ||
      `프로필 정보를 불러오지 못했습니다. (HTTP ${response.status})`;
    throw new Error(message);
  }

  const data = await parseJsonSafe(response);
  return normalizeProfile(data as Partial<UserProfile> | null);
};

export const updateMyProfile = async (
  payload: UpdateProfilePayload
): Promise<UserProfile> => {
  const formData = new FormData();
  formData.append(
    'request',
    {
      string: JSON.stringify({ nickname: payload.nickname }),
      type: 'application/json',
    } as any
  );

  if (payload.profilePictureUri) {
    formData.append('profilePicture', {
      uri: payload.profilePictureUri,
      type: 'image/jpeg',
      name: 'profile.jpg',
    } as any);
  }

  const response = await authorizedFetch(`${API_BASE_URL}/api/users/me`, {
    method: 'PATCH',
    body: formData,
  });

  if (!response.ok) {
    const errorText = await readErrorBody(response);
    const data = await parseJsonSafe(response);
    const message =
      data?.error ||
      data?.message ||
      errorText ||
      `프로필 정보를 저장하지 못했습니다. (HTTP ${response.status})`;
    throw new Error(message);
  }

  const data = await parseJsonSafe(response);
  if (!data || typeof data !== 'object') {
    return getMyProfile();
  }
  return normalizeProfile(data as Partial<UserProfile> | null);
};
