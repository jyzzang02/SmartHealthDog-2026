import AsyncStorage from '@react-native-async-storage/async-storage';
import { assertAuthSession } from './tokenStorage';

const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const key = (ownerId: number, petId: number) => {
  if (![ownerId, petId].every(id => Number.isSafeInteger(id) && id > 0)) throw new Error('Invalid certificate owner');
  return 'certificate.pending.v1.' + ownerId + '.' + petId;
};
let writes: Promise<unknown> = Promise.resolve();
const enqueue = <T,>(operation: () => Promise<T>) => {
  const result = writes.then(operation);
  writes = result.catch(() => undefined);
  return result;
};

export const readPendingCertificate = async (ownerId: number, petId: number, session: symbol) => {
  await writes;
  assertAuthSession(session);
  const id = await AsyncStorage.getItem(key(ownerId, petId));
  assertAuthSession(session);
  return id && uuid.test(id) ? id : null;
};

export const storePendingCertificate = (ownerId: number, petId: number, id: string, session: symbol) =>
  enqueue(async () => {
    assertAuthSession(session);
    if (!uuid.test(id)) throw new Error('Invalid certificate ID');
    await AsyncStorage.setItem(key(ownerId, petId), id);
  });

export const clearPendingCertificate = (ownerId: number, petId: number, id: string, session: symbol) =>
  enqueue(async () => {
    assertAuthSession(session);
    const storageKey = key(ownerId, petId);
    const current = await AsyncStorage.getItem(storageKey);
    assertAuthSession(session);
    if (current === id) await AsyncStorage.removeItem(storageKey);
  });
