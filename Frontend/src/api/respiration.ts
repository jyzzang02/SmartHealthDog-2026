import { getAuthSession, assertAuthSession, getStoredAccessToken } from '../storage/tokenStorage';
import { refreshSessionAccessToken } from './refreshSession';
import { getResponseErrorMessage } from './responseError';

const BASE_URL = 'http://api.puppydoc.ovh:8080';
export type RespirationStatus = 'UPLOADING' | 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
export type RespirationRecord = {
  videoId: string; petId: number; status: RespirationStatus; durationSec: number;
  fileSizeBytes: number | null; respiratoryRate: number | null; failureReason: string | null;
  createdAt: string; uploadedAt: string | null; completedAt: string | null;
};
export type RespirationUpload = { videoId: string; uploadUrl: string; objectKey: string; expiresInSeconds: number };

export class RespirationHttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const session = getAuthSession();
  let token = await getStoredAccessToken();
  assertAuthSession(session);
  if (!token) throw new Error('로그인이 필요합니다. 다시 로그인해 주세요.');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const send = (value: string) => fetch(`${BASE_URL}${path}`, {
      ...init, signal: controller.signal,
      headers: { Accept: 'application/json', ...init.headers, Authorization: `Bearer ${value}` },
    });
    let response = await send(token);
    if (response.status === 401) {
      token = await refreshSessionAccessToken(session, token);
      assertAuthSession(session);
      response = await send(token);
    }
    assertAuthSession(session);
    if (__DEV__) {
      const endpoint = path.endsWith('/upload-url') ? 'upload-url' : path.endsWith('/complete') ? 'complete' : '조회';
      console.log('[수면 영상] 백엔드 응답', { endpoint, status: response.status });
    }
    if (!response.ok) throw new RespirationHttpError(response.status, await getResponseErrorMessage(response, `요청을 처리하지 못했습니다. (HTTP ${response.status})`));
    const result = await response.json();
    assertAuthSession(session);
    return result as T;
  } finally { clearTimeout(timeout); }
}

const path = (petId: number) => `/api/pets/${petId}/respiration`;
export function prepareRespirationUpload(petId: number, fileSizeBytes: number, durationSec: number): Promise<RespirationUpload> {
  if (!Number.isSafeInteger(petId) || petId <= 0 || !Number.isSafeInteger(fileSizeBytes) || fileSizeBytes < 1 || fileSizeBytes > 31457280 || !Number.isInteger(durationSec) || durationSec < 30 || durationSec > 120) {
    throw new Error('영상 길이 또는 파일 크기를 확인해 주세요.');
  }
  return request(`${path(petId)}/upload-url`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fileSizeBytes, durationSec }) });
}
export function completeRespirationUpload(petId: number, videoId: string): Promise<RespirationRecord> {
  return request(`${path(petId)}/${encodeURIComponent(videoId)}/complete`, { method: 'POST' });
}
export function getRespirationRecord(petId: number, videoId: string): Promise<RespirationRecord> {
  return request(`${path(petId)}/${encodeURIComponent(videoId)}`);
}
export function listRespirationRecords(petId: number): Promise<RespirationRecord[]> {
  return request(path(petId));
}
