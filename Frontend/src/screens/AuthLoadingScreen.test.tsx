import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Text, TouchableOpacity } from 'react-native';
import AuthLoadingScreen from './AuthLoadingScreen';
import { getMyProfile } from '../api/users';
import { clearAuthTokens, getStoredAccessToken } from '../storage/tokenStorage';

const mockReset = jest.fn();
const mockNavigation = { reset: mockReset };
jest.mock('@react-navigation/native', () => ({ useNavigation: () => mockNavigation }));
jest.mock('../api/users', () => ({ getMyProfile: jest.fn() }));
jest.mock('../storage/tokenStorage', () => ({
  getStoredAccessToken: jest.fn(), clearAuthTokens: jest.fn(),
  getAuthSession: () => 'session', assertAuthSession: jest.fn(),
}));
jest.mock('../api/auth', () => ({ isApiError: (error: any) => error?.name === 'ApiError' }));
jest.mock('../api/refreshSession', () => ({ MissingRefreshTokenError: class extends Error {} }));

const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
let tree: renderer.ReactTestRenderer;
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(getStoredAccessToken).mockResolvedValue('stored');
});
afterEach(() => { if (tree) act(() => tree.unmount()); });

it('preserves credentials after network failure and retries', async () => {
  jest.mocked(getMyProfile).mockRejectedValueOnce(new Error('Network error')).mockResolvedValueOnce({ id: 1, nickname: 'pet', email: '' });
  await act(async () => { tree = renderer.create(<AuthLoadingScreen />); await flush(); });
  expect(clearAuthTokens).not.toHaveBeenCalled();
  expect(tree.root.findAllByType(Text).some(node => node.props.children === '연결을 확인한 후 다시 시도해 주세요.')).toBe(true);
  await act(async () => { tree.root.findByType(TouchableOpacity).props.onPress(); await flush(); });
  expect(mockReset).toHaveBeenCalledWith({ index: 0, routes: [{ name: 'Main' }] });
});

it('clears credentials only when the refresh token is confirmed invalid', async () => {
  jest.mocked(getMyProfile).mockRejectedValue({ name: 'ApiError', status: 401, codes: ['INVALID_JWT'] });
  await act(async () => { tree = renderer.create(<AuthLoadingScreen />); await flush(); });
  expect(clearAuthTokens).toHaveBeenCalledTimes(1);
  expect(mockReset).toHaveBeenCalledWith({ index: 0, routes: [{ name: 'Login' }] });
});

it('preserves credentials on server errors', async () => {
  jest.mocked(getMyProfile).mockRejectedValue({ name: 'ApiError', status: 500, codes: [] });
  await act(async () => { tree = renderer.create(<AuthLoadingScreen />); await flush(); });
  expect(clearAuthTokens).not.toHaveBeenCalled();
  expect(mockReset).not.toHaveBeenCalled();
});

it('preserves credentials when local storage cannot be read', async () => {
  jest.mocked(getStoredAccessToken).mockRejectedValue(new Error('storage unavailable'));
  await act(async () => { tree = renderer.create(<AuthLoadingScreen />); await flush(); });
  expect(clearAuthTokens).not.toHaveBeenCalled();
  expect(mockReset).not.toHaveBeenCalled();
  expect(tree.root.findByType(TouchableOpacity)).toBeTruthy();
});
