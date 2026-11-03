import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Alert, Text, TextInput, TouchableOpacity } from 'react-native';
import PetEditScreen from './PetEditScreen';
import { launchImageLibrary } from 'react-native-image-picker';
const mockGoBack = jest.fn();
import { getPetDetail, updatePetFull, updatePetPartial } from '../api/pets';

jest.mock('@react-navigation/native', () => ({ useNavigation: () => ({ goBack: mockGoBack }),
  useRoute: () => ({ params: { petId: 2 } }) }));
jest.mock('@react-native-community/datetimepicker', () => 'DateTimePicker');
jest.mock('react-native-image-picker', () => ({ launchImageLibrary: jest.fn() }));
jest.mock('../api/pets', () => ({ getPetDetail: jest.fn(), updatePetFull: jest.fn(), updatePetPartial: jest.fn(), deletePet: jest.fn() }));

it('saves name and breed edits with PATCH without resending or clearing the existing image', async () => {
  const pet = { id: 2, name: '고양', species: 'CAT', breed: '미상', gender: 'MALE', birthDate: '2019-09-15',
    profilePicture: 'https://images.example.test/pets/cat.jpg' };
  jest.mocked(getPetDetail).mockResolvedValue(pet);
  jest.mocked(updatePetPartial).mockResolvedValue({ ...pet, name: '하나' });
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  let tree!: renderer.ReactTestRenderer;
  try {
    await act(async () => { tree = renderer.create(<PetEditScreen />); });
    act(() => {
      tree.root.findAllByType(TextInput).find(node => node.props.placeholder === '이름')!.props.onChangeText('하나');
      tree.root.findAllByType(TextInput).find(node => node.props.placeholder === '품종')!.props.onChangeText('페르시안 친칠라');
    });
    const save = tree.root.findAllByType(TouchableOpacity).find(node =>
      node.findAllByType(Text).some(text => text.props.children === '저장하기'))!;
    await act(async () => { await save.props.onPress(); });
    expect(updatePetPartial).toHaveBeenCalledWith({ id: 2, request: expect.objectContaining({ name: '하나', breed: '페르시안 친칠라' }), profilePicture: null });
    expect(updatePetFull).not.toHaveBeenCalled();
    expect(alert).toHaveBeenCalledWith('성공', '반려동물 정보가 수정되었습니다.');
  } finally { act(() => tree.unmount()); alert.mockRestore(); }
});

describe('photo update confirmation', () => {
  const pet = { id: 2, name: '하나', species: 'CAT', profilePicture: 'https://images.example.test/old.jpg?token=one' };
  let tree: renderer.ReactTestRenderer | undefined;
  let alert: jest.SpyInstance;
  const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
  const findButton = (label: string) => tree!.root.findAllByType(TouchableOpacity).find(node =>
    node.findAllByType(Text).some(text => text.props.children === label))!;
  const mountWithPhoto = async () => {
    await act(async () => { tree = renderer.create(<PetEditScreen />); await flush(); });
    act(() => {
      findButton('사진 수정하기').props.onPress();
      const callback = jest.mocked(launchImageLibrary).mock.calls[0][1]!;
      callback({ assets: [{ uri: 'file:///cache/new.jpg', type: 'image/jpeg', fileName: 'new.jpg' }] });
    });
  };
  beforeEach(() => {
    jest.clearAllMocks(); jest.useFakeTimers();
    jest.mocked(getPetDetail).mockReset().mockResolvedValue(pet);
    jest.mocked(updatePetPartial).mockReset().mockResolvedValue(pet);
    alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });
  afterEach(() => {
    if (tree) act(() => tree!.unmount());
    tree = undefined; alert.mockRestore(); jest.useRealTimers();
  });
  it('keeps the success message only after the new image path appears', async () => {
    await mountWithPhoto();
    jest.mocked(getPetDetail).mockResolvedValue({ ...pet, profilePicture: 'https://images.example.test/new.jpg' });
    let save!: Promise<void>;
    await act(async () => { save = findButton('저장하기').props.onPress(); await flush(); });
    expect(alert).not.toHaveBeenCalled();
    await act(async () => { await jest.advanceTimersByTimeAsync(600); await save; });
    expect(alert).toHaveBeenCalledWith('성공', '반려동물 정보가 수정되었습니다.');
    expect(mockGoBack).toHaveBeenCalledTimes(1);
  });
  it('does not mistake a renewed signed URL for a newly uploaded image', async () => {
    await mountWithPhoto();
    jest.mocked(getPetDetail).mockResolvedValue({ ...pet, profilePicture: 'https://images.example.test/old.jpg?token=two' });
    let save!: Promise<void>;
    await act(async () => { save = findButton('저장하기').props.onPress(); await flush(); });
    for (let i = 0; i < 5; i++) await act(async () => { await jest.advanceTimersByTimeAsync(600); });
    await act(async () => { await save; });
    expect(alert).toHaveBeenCalledWith('확인 필요', expect.stringContaining('기본 정보는 저장되었지만 사진 반영을 확인하지 못했습니다.'));
    expect(mockGoBack).not.toHaveBeenCalled();
    expect(getPetDetail).toHaveBeenCalledTimes(6);
  });
  it('cancels polling on unmount and does not show a late alert or navigate', async () => {
    await mountWithPhoto();
    let save!: Promise<void>;
    await act(async () => { save = findButton('저장하기').props.onPress(); await flush(); });
    act(() => { tree!.unmount(); tree = undefined; });
    await act(async () => { await save; });
    await act(async () => { await jest.advanceTimersByTimeAsync(3000); });
    expect(getPetDetail).toHaveBeenCalledTimes(1);
    expect(alert).not.toHaveBeenCalled();
    expect(mockGoBack).not.toHaveBeenCalled();
  });
  it('blocks duplicate saves and delete confirmation while a save is pending', async () => {
    await mountWithPhoto();
    let save!: Promise<void>;
    await act(async () => {
      const button = findButton('저장하기');
      save = button.props.onPress(); button.props.onPress(); findButton('삭제하기').props.onPress();
      await flush();
    });
    expect(updatePetPartial).toHaveBeenCalledTimes(1);
    expect(alert).not.toHaveBeenCalled();
    act(() => { tree!.unmount(); tree = undefined; });
    await act(async () => { await save; });
  });
});
