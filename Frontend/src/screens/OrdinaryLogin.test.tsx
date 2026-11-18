import React from 'react';
import { TextInput } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import { login, type AuthTokens } from '../api/auth';
import CustomButton from '../components/CustomButton';
import { clearAuthTokens, getStoredAccessToken, storeAuthTokens } from '../storage/tokenStorage';
import OrdinaryLogin from './OrdinaryLogin';

jest.mock('../api/auth', () => ({ login: jest.fn(), isApiError: () => false }));
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
}));

const tokens = (account: string): AuthTokens => ({
  accessToken: `${account}-access`,
  refreshToken: `${account}-refresh`,
  expiration: 'later',
});

let tree: renderer.ReactTestRenderer;
let isFocused: jest.Mock;
let reset: jest.Mock;

async function submitLogin() {
  let resolveLogin!: (value: AuthTokens) => void;
  jest.mocked(login).mockImplementationOnce(() => new Promise(resolve => { resolveLogin = resolve; }));
  let completed!: Promise<void>;
  act(() => { completed = tree.root.findByType(CustomButton).props.onPress(); });
  expect(login).toHaveBeenCalledTimes(1);
  return async () => {
    await act(async () => { resolveLogin(tokens('requested')); await completed; });
  };
}

beforeEach(async () => {
  jest.mocked(login).mockReset();
  await clearAuthTokens();
  isFocused = jest.fn(() => true);
  reset = jest.fn();
  const navigation = { isFocused, reset } as unknown as React.ComponentProps<typeof OrdinaryLogin>['navigation'];
  await act(async () => { tree = renderer.create(<OrdinaryLogin navigation={navigation} />); });
  act(() => {
    const inputs = tree.root.findAllByType(TextInput);
    inputs[0].props.onChangeText('first@example.test');
    inputs[1].props.onChangeText('password');
  });
});

afterEach(() => { act(() => tree.unmount()); });

it('does not persist tokens when the user leaves before login returns', async () => {
  const finishLogin = await submitLogin();
  isFocused.mockReturnValue(false);
  await finishLogin();
  await expect(getStoredAccessToken()).resolves.toBeNull();
  expect(reset).not.toHaveBeenCalled();
});

it('does not replace a newer session even if the old screen reports focus', async () => {
  const finishLogin = await submitLogin();
  await storeAuthTokens(tokens('newer'));
  await finishLogin();
  await expect(getStoredAccessToken()).resolves.toBe('newer-access');
  expect(reset).not.toHaveBeenCalled();
});

it('persists the active login and navigates as before', async () => {
  const finishLogin = await submitLogin();
  await finishLogin();
  await expect(getStoredAccessToken()).resolves.toBe('requested-access');
  expect(reset).toHaveBeenCalledWith({ index: 0, routes: [{ name: 'Main' }] });
});
