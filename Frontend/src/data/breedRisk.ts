export type RiskLevel = '양호' | '주의' | '위험';

export interface BreedRisk {
  name: string;
  riskCount: number;
  riskLevel: RiskLevel;
  image: number; // require(...) 결과
}

export const RISK_COLORS: Record<RiskLevel, string> = {
  양호: '#22A06B',
  주의: '#E5A23B',
  위험: '#E14B4B',
};

// 견종별 유전 질환 위험도 목록 (Figma node 1021:5705 순서/값 그대로)
export const BREED_RISK_LIST: BreedRisk[] = [
  { name: '말티즈', riskCount: 6, riskLevel: '양호', image: require('../assets/breeds/maltese.jpg') },
  { name: '푸들(미니어처)', riskCount: 9, riskLevel: '위험', image: require('../assets/breeds/poodle.jpg') },
  { name: '푸들(표준)', riskCount: 12, riskLevel: '위험', image: require('../assets/breeds/poodle.jpg') },
  { name: '푸들(토이)', riskCount: 15, riskLevel: '주의', image: require('../assets/breeds/poodle_toy.jpg') },
  { name: '포메라니안', riskCount: 14, riskLevel: '주의', image: require('../assets/breeds/pomeranian.jpg') },
  { name: '비숑 프리제', riskCount: 9, riskLevel: '주의', image: require('../assets/breeds/bichon.jpg') },
  { name: '치와와', riskCount: 14, riskLevel: '주의', image: require('../assets/breeds/chihuahua.jpg') },
  { name: '시츄', riskCount: 16, riskLevel: '주의', image: require('../assets/breeds/shihtzu.jpg') },
  { name: '요크셔테리어', riskCount: 17, riskLevel: '위험', image: require('../assets/breeds/yorkshire.jpg') },
  { name: '보스턴 테리어', riskCount: 11, riskLevel: '주의', image: require('../assets/breeds/boston_terrier.jpg') },
  { name: '사모예드', riskCount: 16, riskLevel: '주의', image: require('../assets/breeds/samoyed.jpg') },
  { name: '프렌치 불독', riskCount: 10, riskLevel: '위험', image: require('../assets/breeds/french_bulldog.jpg') },
  { name: '시바 이누', riskCount: 6, riskLevel: '주의', image: require('../assets/breeds/shiba.jpg') },
  { name: '퍼그', riskCount: 8, riskLevel: '위험', image: require('../assets/breeds/pug.jpg') },
  { name: '비글', riskCount: 7, riskLevel: '주의', image: require('../assets/breeds/beagle.jpg') },
  { name: '미니어처 슈나우저', riskCount: 8, riskLevel: '위험', image: require('../assets/breeds/schnauzer.jpg') },
  { name: '아메리칸 코커 스패니얼', riskCount: 8, riskLevel: '위험', image: require('../assets/breeds/cocker_spaniel.jpg') },
  { name: '닥스훈트', riskCount: 7, riskLevel: '주의', image: require('../assets/breeds/dachshund.jpg') },
  { name: '골든 리트리버', riskCount: 8, riskLevel: '위험', image: require('../assets/breeds/golden_retriever.jpg') },
  { name: '래브라도 리트리버', riskCount: 8, riskLevel: '위험', image: require('../assets/breeds/labrador.jpg') },
  { name: '펨브로크 웰시 코기', riskCount: 7, riskLevel: '위험', image: require('../assets/breeds/corgi.jpg') },
];

export const PEDIGREE_INTRO_TEXT = '견종별 유전 질환 위험도를 확인해보세요';

export const PEDIGREE_INFO_TITLE = '목록 안내';

export const PEDIGREE_INFO_DESC =
  '인기 있는 견종일수록 유전 질환 목록이 많은데, 이는 해당 질환에 걸린 개체 수가 많아 특정 질환에 대한 품종의 유전적 소인을 파악할 기회가 더 많기 때문입니다. 또한, 인기 있는 견종은 무분별한 교배가 발생할 가능성이 높아 유전 질환 발생률이 더 높습니다. 흔하지 않거나 역사가 짧은 견종의 경우, 유전 질환을 인지할 만큼 충분한 개체가 발생하기까지 시간이 걸리기 때문에 질환 목록이 없거나 매우 짧을 수 있습니다. 이 목록은 각 견종에서 보고된 모든 유전 질환을 망라하는 것이 아니라, 수의사와 전문가들이 해당 견종에서 중요하다고 합의한 유전 질환 목록을 제공하기 위한 것입니다.';
