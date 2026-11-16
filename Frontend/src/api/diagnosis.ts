import {
  getStoredAccessToken,
  getAuthSession,
  assertAuthSession,
} from '../storage/tokenStorage';
import { refreshSessionAccessToken } from './refreshSession';
import { getMyPets, getPetDetail } from './pets';
import type { DiagnosisCertificate, HealthSummary } from '../types/health';

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

const extractSubmissionList = (data: any): SubmissionSummary[] | undefined => {
  if (Array.isArray(data)) return data as SubmissionSummary[];
  if (!data || typeof data !== 'object') return undefined;

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

  return undefined;
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

const parseErrorResponse = async (response: Response, onCode?: (code: unknown) => void) => {
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
    onCode?.(parsed?.code);
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
  init?: RequestInit,
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
    onsetDate: normalizeCertificateDiagnosisDate(result.onset_date) ??
      normalizeCertificateDiagnosisDate(result.onset_date_text),
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

export const createManualCertificate = async (
  petId: number,
  certificate: DiagnosisCertificate,
  signal?: AbortSignal,
  hospitalName?: string,
): Promise<string> => {
  if (!Number.isSafeInteger(petId) || petId <= 0) throw new Error('반려동물을 먼저 선택해 주세요.');
  const response = await authorizedFetch(API_BASE_URL + '/api/pets/' + petId + '/submissions/certificate/manual', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify({
      hospitalName: hospitalName?.trim() || undefined,
      animalName: certificate.animalName,
      speciesText: certificate.species,
      breed: certificate.breed,
      genderText: certificate.sex,
      coatColor: certificate.coatColor,
      ageText: certificate.age,
      features: certificate.features,
      diseaseName: certificate.diseaseName,
      onsetDateText: certificate.onsetDate,
      diagnosedDateText: certificate.diagnosisDate,
      prognosis: certificate.prognosis,
      remarks: certificate.remarks,
    }),
  });
  if (!response.ok) throw new Error(await parseErrorResponse(response));
  const data = await parseJsonSafe(response);

  if (response.status !== 201 || data?.status !== 'COMPLETED' || data.petId !== petId ||
      typeof data.submissionId !== 'string' || !SUBMISSION_UUID.test(data.submissionId)) {
    throw new Error('진단서 결과를 읽을 수 없어요.');
  }
  return data.submissionId;
};

const CERTIFICATE_FIELD_NAMES = {
  animalName: 'animalName', species: 'speciesText', breed: 'breed', sex: 'genderText',
  coatColor: 'coatColor', age: 'ageText', features: 'features', diseaseName: 'diseaseName',
  onsetDate: 'onsetDateText', diagnosisDate: 'diagnosedDateText', prognosis: 'prognosis', remarks: 'remarks',
} as const satisfies Record<keyof DiagnosisCertificate, string>;

const readCertificateFields = async (submissionId: string, signal?: AbortSignal) => {
  if (!SUBMISSION_UUID.test(submissionId)) throw new Error('진단서 결과를 읽을 수 없어요.');
  const response = await authorizedFetch(API_BASE_URL + '/api/submissions/' + submissionId + '/certificate/fields', { signal });
  if (!response.ok) throw new Error(await parseErrorResponse(response));
  const data = await parseJsonSafe(response);
  if (!data || data.submissionId !== submissionId ||
      (data.hospitalName != null && typeof data.hospitalName !== 'string')) throw new Error('진단서 결과를 읽을 수 없어요.');
  return data;
};

export const getCertificateFields = async (submissionId: string, signal?: AbortSignal): Promise<{ hospitalName?: string }> => {
  const data = await readCertificateFields(submissionId, signal);
  return { hospitalName: typeof data.hospitalName === 'string' ? data.hospitalName.trim() || undefined : undefined };
};

export const getSavedCertificate = async (petId: number, submissionId: string, signal?: AbortSignal): Promise<HealthSummary> => {
  const data = await readCertificateFields(submissionId, signal);
  if (data.petId !== petId || data.status !== 'COMPLETED') throw new Error('진단서 결과를 읽을 수 없어요.');
  const certificate = {} as DiagnosisCertificate;
  for (const key of Object.keys(CERTIFICATE_FIELD_NAMES) as (keyof DiagnosisCertificate)[]) {
    const value = data[CERTIFICATE_FIELD_NAMES[key]];
    if (value != null && typeof value !== 'string') throw new Error('진단서 결과를 읽을 수 없어요.');
    certificate[key] = value ?? '';
  }
  return { petId, certificateSubmissionId: submissionId, certificate,
    checkupDate: normalizeCertificateDiagnosisDate(certificate.diagnosisDate) ?? certificate.diagnosisDate,
    hospitalName: data.hospitalName?.trim() || undefined };
};

export const updateSavedCertificate = async (
  submissionId: string, certificate: Partial<DiagnosisCertificate>, hospitalName?: string, signal?: AbortSignal,
): Promise<void> => {
  if (!SUBMISSION_UUID.test(submissionId)) throw new Error('진단서 결과를 읽을 수 없어요.');
  const body: Record<string, string> = {};
  for (const key of Object.keys(CERTIFICATE_FIELD_NAMES) as (keyof DiagnosisCertificate)[]) {
    const value = certificate[key];
    if (value !== undefined) body[CERTIFICATE_FIELD_NAMES[key]] = value.trim();
  }
  if (hospitalName !== undefined) body.hospitalName = hospitalName.trim();
  if (!Object.keys(body).length) return;
  const response = await authorizedFetch(API_BASE_URL + '/api/submissions/' + submissionId + '/certificate/fields', {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, signal, body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(await parseErrorResponse(response));
};

export const deleteCertificateSubmission = async (submissionId: string, signal?: AbortSignal): Promise<void> => {
  if (!SUBMISSION_UUID.test(submissionId)) throw new Error('진단서 결과를 읽을 수 없어요.');
  const response = await authorizedFetch(API_BASE_URL + '/api/submissions/' + submissionId, { method: 'DELETE', signal });
  if (!response.ok) throw new Error(await parseErrorResponse(response));
};

export const updateCertificateHospital = (submissionId: string, hospitalName: string, signal?: AbortSignal) =>
  updateSavedCertificate(submissionId, {}, hospitalName, signal);

export const updateCertificate = async (
  submissionId: string,
  certificate: Partial<DiagnosisCertificate>,
  signal?: AbortSignal,
): Promise<void> => {
  if (!SUBMISSION_UUID.test(submissionId)) throw new Error('진단서 결과를 읽을 수 없어요.');
  if (Object.keys(certificate).length === 0) return;
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
  const response = await authorizedFetch(`${API_BASE_URL}/api/pets/${petId}/submissions/certificate`, {
    method: 'POST',
    body: formData,
    signal,
  });
  if (!response.ok) {
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
  return data.submission_id;
};

type CertificateOcrResult =
  | { status: 'PENDING' | 'PROCESSING' | 'FAILED' | 'RESULT_UNAVAILABLE' }
  | { status: 'COMPLETED'; fields: Partial<DiagnosisCertificate> };

export const getCertificateOcrResult = async (
  petId: number,
  submissionId: string,
  signal: AbortSignal,
): Promise<CertificateOcrResult> => {
  const detail = await authorizedFetch(`${API_BASE_URL}/api/submissions/${submissionId}/certificate`, { signal });
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
    const submissions = await getPetSubmissions(petId, signal, true, 'HEALTH_CERTIFICATE', submissionId);
    const entry = submissions.find(item => item.id === submissionId);
    const status = entry?.status;
    if (status === 'PENDING' || status === 'PROCESSING' || status === 'FAILED') return { status };
    // Completion may have happened between the requests. Retry without reporting it as processing.
    if (status === 'COMPLETED') return { status: 'RESULT_UNAVAILABLE' };
    throw new Error('접수한 진단서를 찾을 수 없어요.');
  }
  throw new Error('진단서 분석 결과를 확인하지 못했어요.');
};

export const createPetOwnershipCheck = (petId: number, signal?: AbortSignal) => {
  let check: Promise<boolean> | undefined;
  return () => {
    if (signal?.aborted) return Promise.resolve(false);
    check ??= getPetDetail(petId, signal).then(pet => pet.id === petId, () => false);
    return check;
  };
};

export const getPetSubmissions = async (
  petId: number,
  signal?: AbortSignal,
  allPages = false,
  type?: 'HEALTH_CERTIFICATE' | 'EYE' | 'URINE',
  stopAt?: string | ((item: SubmissionSummary) => boolean),
  confirmOwnedOn404?: () => Promise<boolean>,
): Promise<SubmissionSummary[]> => {
  const session = getAuthSession();
  const items = new Map<string, SubmissionSummary>();
  for (let page = 0; ; page += 1) {
    if (signal?.aborted) throw new Error('Request aborted');
    const base = `${API_BASE_URL}/api/submissions/pets/${petId}`;
    const query = [type && 'type=' + type, page > 0 && 'page=' + page].filter(Boolean).join('&');
    const response = await authorizedFetch(query ? base + '?' + query : base, { method: 'GET', signal });
    if (!response.ok) {
      let resourceNotFound = false;
      const message = await parseErrorResponse(response, code => {
        resourceNotFound = Array.isArray(code) && code.includes('RESOURCE_NOT_FOUND');
      });
      // The list can return 404 for a pet with no submissions, even if the pet exists.
      if (page === 0 && response.status === 404 && resourceNotFound && confirmOwnedOn404) {
        const isOwned = await confirmOwnedOn404();
        assertAuthSession(session);
        if (signal?.aborted) throw new Error('Request aborted');
        if (isOwned) return [];
      }
      throw new Error(message);
    }
    const data = await parseJsonSafe(response);
    const raw = type ? (Array.isArray(data?.submissions) ? data.submissions as SubmissionSummary[] : undefined)
      : extractSubmissionList(data);
    if (!raw) throw new Error('진단 이력을 불러오지 못했습니다.');
    for (const entry of raw) {
      const item = normalizeSubmissionItem(entry);
      if (!item?.id || items.has(item.id)) continue;
      items.set(item.id, item);
      if (typeof stopAt === 'function' ? stopAt(item) : item.id === stopAt) return [...items.values()];
    }
    if (!allPages || data?.hasNext !== true) return [...items.values()];
    if (data.pageNumber !== page + 1 || raw.length === 0) throw new Error('진단 이력을 불러오지 못했습니다.');
  }
};

export const getPetDiagnosisHistory = (petId: number, signal?: AbortSignal) =>
  getPetSubmissions(petId, signal, true, undefined, undefined, createPetOwnershipCheck(petId, signal));

export const getLatestCompletedPetSubmission = async (
  petId: number,
  type: 'EYE' | 'URINE' | 'HEALTH_CERTIFICATE',
  signal: AbortSignal,
  confirmOwnedOn404 = createPetOwnershipCheck(petId, signal),
): Promise<SubmissionSummary | undefined> => {
  const completed = (item: SubmissionSummary) => item.type === type && item.status === 'COMPLETED';
  const items = await getPetSubmissions(petId, signal, true, type, completed, confirmOwnedOn404);
  return items.find(completed);
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

export type HealthReportPeriod = 'WEEK' | 'MONTH';
export const HEALTH_REPORT_SECTIONS = ['selfChecks', 'certificates', 'walks', 'eyes', 'urines', 'respirations'] as const;
export type HealthReportSection = typeof HEALTH_REPORT_SECTIONS[number];
export type HealthReportRow = Record<string, unknown>;

export type HealthReport = {
  summary: HealthReportRow;
  sections: Record<HealthReportSection, HealthReportRow[]>;
  assessmentLevel?: string;
};

const isReportObject = (value: unknown): value is HealthReportRow =>
  value != null && typeof value === 'object' && !Array.isArray(value);

export const getHealthReport = async (
  petId: number,
  periodType: HealthReportPeriod,
  startDate: string,
  endDate: string,
  signal: AbortSignal,
): Promise<HealthReport> => {
  if (!Number.isSafeInteger(petId) || petId <= 0) throw new Error('Invalid pet ID');
  const query = new URLSearchParams({ periodType, date: startDate });
  const response = await authorizedFetch(`${API_BASE_URL}/api/pets/${petId}/health-reports?${query}`, { signal });
  if (!response.ok) throw new Error('Health report request failed');
  const data: unknown = await response.json();
  if (!isReportObject(data) || data.petId !== petId || data.periodType !== periodType ||
      data.startDate !== startDate || data.endDate !== endDate || data.timeZone !== 'Asia/Seoul' ||
      !isReportObject(data.summary) || !isReportObject(data.sections)) {
    throw new Error('Unexpected health report');
  }
  const sections = {} as HealthReport['sections'];
  for (const key of HEALTH_REPORT_SECTIONS) {
    const rows = data.sections[key];
    if (!Array.isArray(rows) || !rows.every(isReportObject)) {
      throw new Error('Unexpected health report section');
    }
    sections[key] = rows;
  }
  const level = isReportObject(data.assessment) ? data.assessment.level : undefined;
  return { summary: data.summary, sections, assessmentLevel: typeof level === 'string' ? level : undefined };
};

export const getCertificateImageUrl = async (submissionId: string, signal: AbortSignal): Promise<string | undefined> => {
  if (!SUBMISSION_UUID.test(submissionId)) throw new Error('이미지를 불러올 수 없습니다.');
  const response = await authorizedFetch(API_BASE_URL + '/api/submissions/' + submissionId + '/image', { signal });
  if (response.status === 404) return undefined;
  if (!response.ok) throw new Error('이미지를 불러올 수 없습니다.');
  const data = await parseJsonSafe(response);
  if (typeof data?.image_url !== 'string' || !/^https:\/\//i.test(data.image_url)) {
    throw new Error('이미지를 불러올 수 없습니다.');
  }
  return data.image_url;
};
