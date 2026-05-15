import {
  getStoredAccessToken,
  getStoredRefreshToken,
  storeAuthTokens,
} from '../storage/tokenStorage';
import { refreshAuthToken } from './auth';
import { getMyPets } from './pets';

const API_BASE_URL = 'http://api.puppydoc.ovh:8080';

export interface EyeDiagnosisImage {
  uri: string;
  type?: string;
  fileName?: string;
  fileSize?: number;
}

export interface SubmissionSummary {
  id?: string;
  submissionId?: string;

  type?: string;
  status?: string;

  createdAt?: string;
  created_at?: string;
  submittedAt?: string;
  submitted_at?: string;

  completedAt?: string | null;
  completed_at?: string | null;

  failureReason?: string | null;
  failure_reason?: string | null;
}

export interface SubmissionStatusPayload {
  status: string;
}

export type EyeDiagnosisResult = Record<string, unknown>;

export { getMyPets };

const buildAuthHeaders = (accessToken: string) => ({
  Authorization: `Bearer ${accessToken}`,
  Accept: 'application/json',
});

const parseJsonSafe = async (response: Response) => {
  try {
    return await response.json();
  } catch {
    return null;
  }
};

const parseErrorResponse = async (response: Response) => {
  const fallbackMessage = `요청을 처리하지 못했습니다. (HTTP ${response.status})`;
  let bodyText = '';

  try {
    bodyText = await response.text();
  } catch {
    return fallbackMessage;
  }

  if (!bodyText) {
    return fallbackMessage;
  }

  try {
    const parsed = JSON.parse(bodyText);
    if (Array.isArray(parsed.descriptions) && parsed.descriptions.length > 0) {
      return parsed.descriptions.join('\n');
    }
    if (typeof parsed.message === 'string') {
      return parsed.message;
    }
    if (Array.isArray(parsed.code) && parsed.code.length > 0) {
      return parsed.code.join(', ');
    }
    return fallbackMessage;
  } catch {
    return bodyText || fallbackMessage;
  }
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
  } catch (error) {
    console.warn('[diagnosis] token refresh 실패', error);
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

const normalizeFileName = (uri: string, fallback: string) => {
  const segments = uri.split('/');
  const lastSegment = segments[segments.length - 1];
  if (lastSegment && lastSegment.includes('.')) {
    return lastSegment;
  }
  return fallback;
};

const resolveMimeType = (image: EyeDiagnosisImage) => {
  if (image.type) {
    return image.type;
  }
  const lower = image.uri.toLowerCase();
  if (lower.endsWith('.png')) {
    return 'image/png';
  }
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) {
    return 'image/jpeg';
  }
  return 'image/*';
};

export const requestEyeDiagnosis = async (
  petId: number,
  image: EyeDiagnosisImage
): Promise<void> => {
  const formData = new FormData();
  const mimeType = resolveMimeType(image);
  const fileName = image.fileName || normalizeFileName(image.uri, 'eye.jpg');

  formData.append('image', {
    uri: image.uri,
    type: mimeType,
    name: fileName,
  } as any);

  const response = await authorizedFetch(
    `${API_BASE_URL}/api/pets/${petId}/submissions/eye`,
    {
      method: 'POST',
      body: formData,
    }
  );

  if (response.status === 201) {
    return;
  }

  const errorText = await response.clone().text().catch(() => '');
  console.log('[eye] upload 실패 상태', response.status, errorText);

  const message = await parseErrorResponse(response);
  throw new Error(message);
};

export const getPetSubmissions = async (
  petId: number
): Promise<SubmissionSummary[]> => {
  const response = await authorizedFetch(
    `${API_BASE_URL}/api/submissions/pets/${petId}`,
    { method: 'GET' }
  );

  if (!response.ok) {
    const message = await parseErrorResponse(response);
    throw new Error(message);
  }

  const data = await parseJsonSafe(response);
  return (Array.isArray(data) ? data : []) as SubmissionSummary[];
};

export const getMySubmissions = async (): Promise<SubmissionSummary[]> => {
  const response = await authorizedFetch(`${API_BASE_URL}/api/submissions`, {
    method: 'GET',
  });

  if (!response.ok) {
    const message = await parseErrorResponse(response);
    throw new Error(message);
  }

  const data = await parseJsonSafe(response);
  return (Array.isArray(data) ? data : []) as SubmissionSummary[];
};

export const getEyeSubmissionResult = async (
  submissionId: string
): Promise<EyeDiagnosisResult> => {
  const response = await authorizedFetch(
    `${API_BASE_URL}/api/submissions/${submissionId}/eye?languageCode=ko`,
    { method: 'GET' }
  );

  if (!response.ok) {
    const message = await parseErrorResponse(response);
    throw new Error(message);
  }

  const data = await parseJsonSafe(response);
  return data as EyeDiagnosisResult;
};

export const getUrineSubmissionResult = async (
  submissionId: string
): Promise<EyeDiagnosisResult> => {
  const response = await authorizedFetch(
    `${API_BASE_URL}/api/submissions/${submissionId}/urine?languageCode=ko`,
    { method: 'GET' }
  );

  if (!response.ok) {
    const message = await parseErrorResponse(response);
    throw new Error(message);
  }

  const data = await parseJsonSafe(response);
  return data as EyeDiagnosisResult;
};

export const updateEyeSubmissionResult = async (
  submissionId: number,
  payload: Record<string, unknown>
): Promise<void> => {
  const response = await authorizedFetch(
    `${API_BASE_URL}/api/submissions/${submissionId}/eye`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    }
  );

  if (!response.ok) {
    const message = await parseErrorResponse(response);
    throw new Error(message);
  }
};

export const updateSubmissionStatus = async (
  submissionId: number,
  payload: SubmissionStatusPayload
): Promise<void> => {
  const response = await authorizedFetch(
    `${API_BASE_URL}/api/submissions/${submissionId}/status`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    }
  );

  if (!response.ok) {
    const message = await parseErrorResponse(response);
    throw new Error(message);
  }
};

export const deleteSubmission = async (submissionId: number): Promise<void> => {
  const response = await authorizedFetch(
    `${API_BASE_URL}/api/submissions/${submissionId}`,
    { method: 'DELETE' }
  );

  if (!response.ok && response.status !== 204) {
    const message = await parseErrorResponse(response);
    throw new Error(message);
  }
};
