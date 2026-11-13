import { getAuthSession, assertAuthSession, getStoredAccessToken } from '../storage/tokenStorage';
import { refreshSessionAccessToken } from './refreshSession';
import { getResponseErrorMessage } from './responseError';
import type { PetSpecies } from '../data/petQna';
import type { CheckStage } from '../data/selfCheck';
const BASE_URL = 'http://api.puppydoc.ovh:8080';
export type SelfCheckAreaResult = { areaKey: string; areaTitle: string; score: number; stage: CheckStage; urgentHit: boolean; answers: { questionIndex: number; questionText: string; questionWeight: string; answerValue: number }[] };
export type SelfCheckRecord = { id: number; petId: number; species: PetSpecies; overallStage: CheckStage; scoringVersion: string; createdAt: string; areas: SelfCheckAreaResult[] };
export type SelfCheckPage = { content: Omit<SelfCheckRecord, 'areas'>[]; number: number; last: boolean };
const request = async <T,>(path: string, init: RequestInit = {}): Promise<T> => {
  const session = getAuthSession();
  let token = await getStoredAccessToken();
  assertAuthSession(session);
  if (!token) throw new Error('로그인이 필요합니다. 다시 로그인해 주세요.');
  const controller = new AbortController();
  const abort = () => controller.abort();
  const signal = init.signal;
  if (signal?.aborted) abort();
  else signal?.addEventListener('abort', abort);
  const timeout = setTimeout(abort, 30000);
  try {
    const send = (value: string) => {
      if (controller.signal.aborted) throw new Error('Request aborted');
      return fetch(`${BASE_URL}${path}`, { ...init, signal: controller.signal, headers: { Accept: 'application/json', ...init.headers, Authorization: `Bearer ${value}` } });
    };
    let response = await send(token);
    if (response.status === 401 && !controller.signal.aborted) {
      token = await refreshSessionAccessToken(session, token);
      assertAuthSession(session);
      response = await send(token);
    }
    assertAuthSession(session);
    if (!response.ok) throw new Error(await getResponseErrorMessage(response, `요청을 처리하지 못했습니다. (HTTP ${response.status})`));
    const result = response.status === 204 ? undefined : await response.json();
    assertAuthSession(session);
    return result as T;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abort);
  }
};
const path = (petId: number) => `/api/pets/${petId}/health-checks`;
export async function createSelfCheck(petId: number, species: PetSpecies, answers: Record<string, number[]>): Promise<SelfCheckRecord> {
  return request<SelfCheckRecord>(path(petId), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ species, answers }) });
}
export async function listSelfChecks(petId: number, page = 0, signal?: AbortSignal): Promise<SelfCheckPage> {
  return request<SelfCheckPage>(`${path(petId)}?page=${page}&size=20`, { signal });
}
export async function getSelfCheck(petId: number, id: number, signal?: AbortSignal): Promise<SelfCheckRecord> {
  return request<SelfCheckRecord>(`${path(petId)}/${id}`, { signal });
}
export async function deleteSelfCheck(petId: number, id: number): Promise<void> {
  await request<void>(`${path(petId)}/${id}`, { method: 'DELETE' });
}