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
  submission_id?: string;
  submissionUuid?: string;
  uuid?: string;

  type?: string;
  submissionType?: string;
  submission_type?: string;
  diagnosisType?: string;
  diagnosis_type?: string;
  category?: string;
  serviceType?: string;
  status?: string;
  submissionStatus?: string;
  submission_status?: string;
  statusCode?: string;
  status_code?: string;

  createdAt?: string;
  created_at?: string;
  createdDate?: string;
  created_date?: string;
  requestedAt?: string;
  requested_at?: string;
  submittedAt?: string;
  submitted_at?: string;

  completedAt?: string | null;
  completed_at?: string | null;

  failureReason?: string | null;
  failure_reason?: string | null;
}

export interface SubmissionCreateResponse {
  id?: string;
  submissionId?: string;
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

const extractSubmissionIdFromLocation = (location?: string | null) => {
  if (!location) return undefined;
  const matched = location.match(/\/api\/submissions\/([^/?#]+)/i);
  return matched?.[1];
};

const extractSubmissionList = (data: any): SubmissionSummary[] => {
  if (Array.isArray(data)) return data as SubmissionSummary[];
  if (!data || typeof data !== 'object') return [];

  const candidates = [
    data.items,
    data.content,
    data.submissions,
    data.data,
    data.result,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate as SubmissionSummary[];
    }
  }

  return [];
};

const normalizeSubmissionItem = (item: any): SubmissionSummary | null => {
  if (!item || typeof item !== 'object') return null;

  const id =
    item.id ??
    item.submissionId ??
    item.submission_id ??
    item.submissionUuid ??
    item.uuid;

  const type =
    item.type ??
    item.submissionType ??
    item.submission_type ??
    item.diagnosisType ??
    item.diagnosis_type ??
    item.category ??
    item.serviceType;

  const status =
    item.status ??
    item.submissionStatus ??
    item.submission_status ??
    item.statusCode ??
    item.status_code;

  const submittedAt =
    item.submittedAt ??
    item.submitted_at ??
    item.createdAt ??
    item.created_at ??
    item.createdDate ??
    item.created_date ??
    item.requestedAt ??
    item.requested_at;

  return {
    ...(item as SubmissionSummary),
    id: id != null ? String(id) : undefined,
    submissionId: item.submissionId ?? (id != null ? String(id) : undefined),
    type: type != null ? String(type) : undefined,
    status: status != null ? String(status) : undefined,
    submittedAt: submittedAt != null ? String(submittedAt) : undefined,
  };
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
  return 'image/jpeg';
};

const isValidPetId = (petId: number) => Number.isFinite(petId) && petId > 0;

export const requestEyeDiagnosis = async (
  petId: number,
  image: EyeDiagnosisImage
): Promise<SubmissionCreateResponse | null> => {
  if (!isValidPetId(petId)) {
    throw new Error('유효한 반려동물을 선택해 주세요.');
  }

  const uploadUrl = `${API_BASE_URL}/api/pets/${petId}/submissions/eye`;
  const formData = new FormData();
  const mimeType = resolveMimeType(image);
  const fileName = image.fileName || normalizeFileName(image.uri, 'eye.jpg');

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
      return data as SubmissionCreateResponse;
    }
    const idFromLocation = extractSubmissionIdFromLocation(
      response.headers.get('Location')
    );
    return idFromLocation ? { submissionId: idFromLocation } : null;
  }

  const message = await parseErrorResponse(response);
  throw new Error(message);
};

export const getPetSubmissions = async (
  petId: number
): Promise<SubmissionSummary[]> => {
  const endpoints = [
    `${API_BASE_URL}/api/submissions/pets/${petId}`,
    `${API_BASE_URL}/api/pets/${petId}/submissions`,
  ];

  let lastError: Error | null = null;

  for (const url of endpoints) {
    try {
      const response = await authorizedFetch(url, { method: 'GET' });
      if (!response.ok) {
        const message = await parseErrorResponse(response);
        throw new Error(message);
      }

      const data = await parseJsonSafe(response);
      const rawList = extractSubmissionList(data);
      const list = rawList
        .map((item) => normalizeSubmissionItem(item))
        .filter((item): item is SubmissionSummary => !!item);
      if (list.length > 0 || url === endpoints[endpoints.length - 1]) {
        return list;
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('unknown error');
    }
  }

  if (lastError) throw lastError;
  return [];
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
