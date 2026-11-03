import { Image } from 'react-native';
import type { PetDetail, ShelterListItem, ShelterSearchParams, ShelterSearchResponse } from '../api/shelters';

// Temporary preview for debug and test release APKs. Disable before distribution.
export const ADOPTION_MOCK = { enabled: true };

export const getAdoptionMock = () => {
  if (!ADOPTION_MOCK.enabled) return null;

  const shelter: ShelterListItem = {
    shelter_id: 9000001,
    name: '[목업] 테스트 동물보호센터',
    address: '화면 확인용 가상 주소',
  };
  const dogImage = Image.resolveAssetSource(require('../assets/img_adoptDog.png'))?.uri;
  const catImage = Image.resolveAssetSource(require('../assets/img_adoptCat.png'))?.uri;
  const samples: PetDetail[] = [
    { pet_id: 9000101, shelter_id: shelter.shelter_id, name: '[목업] 해피', species: 'dog',
      breed: '믹스견', age: '2살', gender: 'female', is_neutered: true,
      adoption_status: 'AVAILABLE', images: dogImage ? [dogImage] : [] },
    { pet_id: 9000102, shelter_id: shelter.shelter_id, name: '[목업] 나비', species: 'cat',
      breed: '코리안 쇼트헤어', age: '1살', gender: 'male', is_neutered: false,
      adoption_status: 'AVAILABLE', images: catImage ? [catImage] : [] },
    { pet_id: 9000103, shelter_id: shelter.shelter_id, name: '[목업] 이름이 긴 반려동물 밤비', species: 'dog',
      breed: '리트리버', age: '3살', gender: null, is_neutered: null,
      adoption_status: 'AVAILABLE', images: dogImage ? [dogImage] : [] },
  ];
  const clonePet = (pet: PetDetail): PetDetail => ({ ...pet,
    images: pet.images ? [...pet.images] : [],
    description: '화면 확인용 샘플 데이터입니다. 실제 입양 공고가 아닙니다.',
    shelter_contact: { name: shelter.name, address: shelter.address },
  });
  return {
    searchShelters: (params: Pick<ShelterSearchParams, 'province' | 'district'>): ShelterSearchResponse => {
      const matches = (!params.province || params.province === '서울특별시')
        && (!params.district || params.district === '마포구');
      return { items: matches ? [{ ...shelter }] : [], total: matches ? 1 : 0 };
    },
    getPets: (shelterId: number): PetDetail[] => {
      if (shelterId !== shelter.shelter_id) throw new Error('입양 동물 정보를 불러오지 못했습니다.');
      return samples.map(clonePet);
    },
    getPetDetail: (shelterId: number, petId: number): PetDetail => {
      const pet = samples.find(item => item.shelter_id === shelterId && item.pet_id === petId);
      if (!pet) throw new Error('동물 상세 정보를 불러오지 못했습니다.');
      return clonePet(pet);
    },
  };
};
