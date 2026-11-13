import AsyncStorage from '@react-native-async-storage/async-storage';
import { clearPendingCertificate, readPendingCertificate, storePendingCertificate } from './certificateRecovery';
import { clearAuthTokens, getAuthSession } from './tokenStorage';

const first = '550e8400-e29b-41d4-a716-446655440000';
const second = '550e8400-e29b-41d4-a716-446655440001';

beforeEach(async () => { await AsyncStorage.clear(); });

it('reads a persisted submission only for the matching owner and pet', async () => {
  const session = getAuthSession();
  await storePendingCertificate(1, 10, first, session);
  await storePendingCertificate(1, 11, second, session);
  await expect(readPendingCertificate(1, 10, session)).resolves.toBe(first);
  await expect(readPendingCertificate(1, 11, session)).resolves.toBe(second);
  await expect(readPendingCertificate(2, 10, session)).resolves.toBeNull();
  await clearAuthTokens();
  await expect(readPendingCertificate(1, 10, session)).rejects.toThrow();
  await expect(readPendingCertificate(1, 10, getAuthSession())).resolves.toBe(first);
});

it('cannot clear a newer submission when an older save completes', async () => {
  const session = getAuthSession();
  await storePendingCertificate(1, 10, first, session);
  await storePendingCertificate(1, 10, second, session);
  await clearPendingCertificate(1, 10, first, session);
  await expect(readPendingCertificate(1, 10, session)).resolves.toBe(second);
  await clearPendingCertificate(1, 10, second, session);
  await expect(readPendingCertificate(1, 10, session)).resolves.toBeNull();
});
