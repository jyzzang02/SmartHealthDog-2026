import {
  getStoredAccessToken,
  getAuthSession,
  assertAuthSession,
} from '../storage/tokenStorage';
import { refreshSessionAccessToken } from './refreshSession';
import { getMyPets } from './pets';
import type { DiagnosisCertificate } from '../types/health';

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

interface DiagnosisSubmissionDetail<T> {
  id?: string;
  petInfo?: { id: number; name: string; species: string };
  type?: string;
  photoUrl?: string | null;
  status?: string;
  submittedAt?: string;
  completedAt?: string | null;
  failureReason?: string | null;
  results?: T[];
}

export type EyeDiagnosisResult = DiagnosisSubmissionDetail<{
  probability?: number | string | null;
  condition?: { name?: string | null; description?: string | null } | null;
}>;

export type UrineDiagnosisResult = DiagnosisSubmissionDetail<{
  analyte?: string | null;
  resultValue?: string | null;
}>;

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

  if (init?.signal?.aborted) throw new Error('Request aborted');
  let response = await doFetch(accessToken);
  assertAuthSession(session);

  if (init?.signal?.aborted) throw new Error('Request aborted');
  if (response.status === 403) {
    throw new Error('권한이 없습니다.');
  }

  if (response.status !== 401 && response.status !== 403) {
    return response;
  }

  try {
    accessToken = await refreshSessionAccessToken(session, accessToken);
    assertAuthSession(session);
    if (init?.signal?.aborted) throw new Error('Request aborted');
    response = await doFetch(accessToken);
    assertAuthSession(session);
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


export const logCertificateOcr = (stage: string, status?: number | string) => {
  if (__DEV__) console.info('[certificate-ocr]', stage, status ?? '');
};

const CERTIFICATE_MAX_IMAGE_BYTES = 7 * 1024 * 1024;
const SUBMISSION_UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

const normalizeCertificateDiagnosisDate = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const match = value.trim().match(/^(\d{4})(?:\s*[-./]\s*|\s*년\s*)(\d{1,2})(?:\s*[-./]\s*|\s*월\s*)(\d{1,2})\s*[일.]?$/);
  if (!match) return undefined;
  const date = [match[1], match[2].padStart(2, '0'), match[3].padStart(2, '0')].join('-');
  const parsed = new Date(date + 'T00:00:00Z');
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date ? date : undefined;
};

export const mapCertificateOcrFields = (result: Record<string, unknown>): Partial<DiagnosisCertificate> => {
  const fields = {
    animalName: result.animal_name,
    species: result.species_text,
    breed: result.breed,
    sex: result.gender_text,
    coatColor: result.coat_color,
    age: result.age_text,
    features: result.features,
    diseaseName: result.disease_name,
    onsetDate: result.onset_date,
    diagnosisDate: normalizeCertificateDiagnosisDate(result.diagnosed_date) ??
      normalizeCertificateDiagnosisDate(result.diagnosed_date_text),
    prognosis: result.prognosis,
    remarks: result.remarks,
  };
  return Object.fromEntries(
    Object.entries(fields)
      .filter((entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1].trim() !== '')
      .map(([key, value]) => [key, value.trim()]),
  );
};

export const updateCertificate = async (
  submissionId: string,
  certificate: DiagnosisCertificate,
  signal?: AbortSignal,
): Promise<void> => {
  if (!SUBMISSION_UUID.test(submissionId)) throw new Error('진단서 결과를 읽을 수 없어요.');
  const response = await authorizedFetch(API_BASE_URL + '/api/submissions/' + submissionId + '/certificate', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify({
      animal_name: certificate.animalName,
      species_text: certificate.species,
      breed: certificate.breed,
      gender_text: certificate.sex,
      coat_color: certificate.coatColor,
      age_text: certificate.age,
      features: certificate.features,
      disease_name: certificate.diseaseName,
      onset_date_text: certificate.onsetDate,
      diagnosed_date_text: certificate.diagnosisDate,
      prognosis: certificate.prognosis,
      remarks: certificate.remarks,
    }),
  });
  if (!response.ok) throw new Error(await parseErrorResponse(response));
};

export const requestCertificateOcr = async (
  petId: number,
  image: EyeDiagnosisImage,
  signal: AbortSignal,
): Promise<string> => {
  if (!Number.isSafeInteger(petId) || petId <= 0) {
    throw new Error('반려동물을 먼저 선택해 주세요.');
  }
  if (image.fileSize !== undefined && (image.fileSize <= 0 || image.fileSize > CERTIFICATE_MAX_IMAGE_BYTES)) {
    throw new Error('비어 있거나 7MB를 초과하는 사진은 등록할 수 없어요.');
  }

  const name = image.fileName || image.uri.split(/[?#]/)[0];
  const type = image.type?.toLowerCase() || (/\.png$/i.test(name) ? 'image/png' : /\.jpe?g$/i.test(name) ? 'image/jpeg' : '');
  if (type !== 'image/png' && type !== 'image/jpeg') {
    throw new Error('JPG 또는 PNG 사진을 선택해 주세요.');
  }

  const formData = new FormData();
  formData.append('image', {
    uri: image.uri,
    type,
    name: type === 'image/png' ? 'certificate.png' : 'certificate.jpg',
  } as unknown as Blob);
  logCertificateOcr('upload:start');
  const response = await authorizedFetch(`${API_BASE_URL}/api/pets/${petId}/submissions/certificate`, {
    method: 'POST',
    body: formData,
    signal,
  });
  if (!response.ok) {
    logCertificateOcr('upload:http', response.status);
    const error = await parseJsonSafe(response);
    if (response.status === 429 || error?.code?.includes?.('REQUEST_TOO_FREQUENT')) {
      throw new Error('진단서 등록 요청이 너무 잦아요. 잠시 후 다시 시도해 주세요.');
    }
    if (response.status === 404) throw new Error('선택한 반려동물의 정보를 확인할 수 없어요.');
    throw new Error('진단서 등록에 실패했어요. 이미지 형식과 용량을 확인해 주세요.');
  }

  const data = await parseJsonSafe(response);
  if (typeof data?.submission_id !== 'string' || !SUBMISSION_UUID.test(data.submission_id)) {
    throw new Error('진단서 접수를 확인하지 못했어요. 사진은 다시 올리지 않고 직접 입력할 수 있어요.');
  }
  logCertificateOcr('upload:accepted', response.status);
  return data.submission_id;
};

type CertificateOcrResult =
  | { status: 'PENDING' | 'PROCESSING' | 'FAILED' }
  | { status: 'COMPLETED'; fields: Partial<DiagnosisCertificate> };

export const getCertificateOcrResult = async (
  petId: number,
  submissionId: string,
  signal: AbortSignal,
): Promise<CertificateOcrResult> => {
  const detail = await authorizedFetch(`${API_BASE_URL}/api/submissions/${submissionId}/certificate`, { signal });
  logCertificateOcr('detail:http', detail.status);
  if (detail.ok) {
    const data = await parseJsonSafe(detail);
    const result = data?.results?.[0];
    if (data?.status === 'COMPLETED' && result && typeof result === 'object') {
      return { status: 'COMPLETED', fields: mapCertificateOcrFields(result) };
    }
    if (data?.status === 'PENDING' || data?.status === 'PROCESSING' || data?.status === 'FAILED') {
      return { status: data.status };
    }
    throw new Error('진단서 결과를 읽을 수 없어요.');
  }
  if (detail.status === 404) {
    // The detail endpoint needs an OCR result row. Check the same submission's status before treating a 404 as terminal.
    const list = await authorizedFetch(
      `${API_BASE_URL}/api/submissions/pets/${petId}?type=HEALTH_CERTIFICATE`,
      { signal },
    );
    logCertificateOcr('status-list:http', list.status);
    if (list.ok) {
      const page = await parseJsonSafe(list);
      const item = Array.isArray(page?.submissions)
        ? page.submissions.find((entry: SubmissionSummary) => entry?.submissionId === submissionId)
        : undefined;
      const status = item?.status;
      if (status === 'PENDING' || status === 'PROCESSING' || status === 'FAILED') return { status };
      // The worker may have finished between the two requests.
      if (status === 'COMPLETED') return { status: 'PROCESSING' };
      throw new Error('접수한 진단서를 찾을 수 없어요.');
    }
  }
  throw new Error('진단서 분석 결과를 확인하지 못했어요.');
};

export const getPetSubmissions = async (
  petId: number,
  signal?: AbortSignal,
  allPages = false,
): Promise<SubmissionSummary[]> => {
  const items = new Map<string, SubmissionSummary>();
  for (let page = 0; ; page += 1) {
    if (signal?.aborted) throw new Error('Request aborted');
    const base = `${API_BASE_URL}/api/submissions/pets/${petId}`;
    const response = await authorizedFetch(page === 0 ? base : base + '?page=' + page, { method: 'GET', signal });
    if (!response.ok) throw new Error(await parseErrorResponse(response));
    const data = await parseJsonSafe(response);
    const raw = extractSubmissionList(data);
    for (const entry of raw) {
      const item = normalizeSubmissionItem(entry);
      if (item?.id && !items.has(item.id)) items.set(item.id, item);
    }
    if (!allPages || data?.hasNext !== true) return [...items.values()];
    if (data.pageNumber !== page + 1 || raw.length === 0) throw new Error('진단 이력을 불러오지 못했습니다.');
  }
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
  submissionId: string,
  signal?: AbortSignal
): Promise<EyeDiagnosisResult> => {
  const response = await authorizedFetch(
    `${API_BASE_URL}/api/submissions/${submissionId}/eye?languageCode=ko`,
    { method: 'GET', signal }
  );

  if (!response.ok) {
    const message = await parseErrorResponse(response);
    throw new Error(message);
  }

  const data = await parseJsonSafe(response);
  return data as EyeDiagnosisResult;
};

export const getUrineSubmissionResult = async (
  submissionId: string,
  signal?: AbortSignal
): Promise<UrineDiagnosisResult> => {
  const response = await authorizedFetch(
    `${API_BASE_URL}/api/submissions/${submissionId}/urine?languageCode=ko`,
    { method: 'GET', signal }
  );

  if (!response.ok) {
    const message = await parseErrorResponse(response);
    throw new Error(message);
  }

  const data = await parseJsonSafe(response);
  return data as UrineDiagnosisResult;
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
