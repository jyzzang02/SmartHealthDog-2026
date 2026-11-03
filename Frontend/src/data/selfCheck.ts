import type { PetSpecies } from './petQna';

/** 문항 가중치: 1~3점, 'urgent'는 긴급/빠른 진료 문항(점수 계산 제외) */
export type CheckWeight = 1 | 2 | 3 | 'urgent';

export interface CheckQuestion {
  q: string;
  weight: CheckWeight;
}

export interface CheckArea {
  id: string;
  title: string;
  questions: CheckQuestion[];
}

export type CheckStage = 1 | 2 | 3 | 4;

export const SCALE = ['없음', '가끔 / 약함', '반복 / 뚜렷함', '심함 / 지속'];

export const STAGES: Record<CheckStage, { label: string; guide: string; color: string; bg: string }> = {
  1: { label: '현재 뚜렷한 이상 없음', guide: '정기적으로 상태를 확인해 주세요.', color: '#0081D5', bg: '#EEF7FD' },
  2: { label: '관찰 필요', guide: '증상이 지속되거나 악화되는지 관찰해 주세요.', color: '#8A6500', bg: '#FFFBEA' },
  3: { label: '진료 상담 권장', guide: '동물병원 상담 또는 진료를 권장해요.', color: '#A35C00', bg: '#FFF2DC' },
  4: { label: '빠른 진료 필요', guide: '긴급 문항이 확인되었어요. 가능한 빨리 동물병원 진료를 받아보세요.', color: '#C2262B', bg: '#FDECEC' },
};

export const STAGE_BAR_COLOR: Record<CheckStage, string> = {
  1: '#0081D5',
  2: '#FFC94D',
  3: '#FFB547',
  4: '#E5484D',
};

export const SELF_CHECK: Record<PetSpecies, CheckArea[]> = {
  dog: [
    {
      id: 'ear',
      title: '귀',
      questions: [
        { q: '귀를 평소보다 자주 긁나요?', weight: 1 },
        { q: '머리를 평소보다 자주 흔드나요?', weight: 1 },
        { q: '평소와 다른 귀지·분비물 또는 심한 냄새가 있나요?', weight: 2 },
        { q: '귀 안쪽이 평소보다 붉나요?', weight: 2 },
        { q: '귀를 만질 때 통증을 보이거나 귀가 부어 있나요?', weight: 3 },
        { q: '걷거나 서 있을 때 균형을 잡지 못하나요?', weight: 'urgent' },
        { q: '머리가 한쪽으로 심하게 기울어져 있나요?', weight: 'urgent' },
      ],
    },
    {
      id: 'oral',
      title: '구강·잇몸',
      questions: [
        { q: '입 냄새가 평소보다 심해졌나요?', weight: 1 },
        { q: '눈에 띄는 치석이 있나요?', weight: 1 },
        { q: '잇몸이 붉거나 부어 있나요?', weight: 2 },
        { q: '잇몸에서 피가 나나요?', weight: 2 },
        { q: '음식을 먹다가 떨어뜨리거나 씹는 방식이 달라졌나요?', weight: 3 },
        { q: '평소보다 침을 많이 흘리나요?', weight: 3 },
        { q: '입 통증 때문에 음식을 거의 먹지 못하나요?', weight: 'urgent' },
      ],
    },
    {
      id: 'anal',
      title: '항문·배변',
      questions: [
        { q: '엉덩이를 바닥에 끌고 다니나요?', weight: 1 },
        { q: '항문 주변을 평소보다 자주 핥나요?', weight: 1 },
        { q: '변이 평소보다 무르거나 형태가 크게 달라졌나요?', weight: 2 },
        { q: '변에 점액이 보이나요?', weight: 2 },
        { q: '항문 주변이 붉거나 부어 있나요?', weight: 2 },
        { q: '배변할 때 힘들어하거나 통증을 보이나요?', weight: 3 },
        { q: '항문 주변에 고름·진물 등이 있나요?', weight: 3 },
        { q: '많은 양의 출혈 또는 검은 변이 나타나나요?', weight: 'urgent' },
        { q: '항문이나 직장 조직이 밖으로 튀어나왔나요?', weight: 'urgent' },
      ],
    },
    {
      id: 'intake',
      title: '섭취량',
      questions: [
        { q: '식사량이 평소보다 감소했나요?', weight: 2 },
        { q: '식사량이 늘었는데 체중이 감소하고 있나요?', weight: 2 },
        { q: '물을 평소보다 많이 마시나요?', weight: 2 },
        { q: '물을 평소보다 적게 마시나요?', weight: 2 },
        { q: '하루 가까이 거의 먹지 못했나요?', weight: 3 },
        { q: '음식을 먹으려고 해도 씹거나 삼키기 어려워하나요?', weight: 3 },
        { q: '24시간 이상 음식 또는 물을 거의 섭취하지 못했나요?', weight: 'urgent' },
      ],
    },
    {
      id: 'activity',
      title: '활동·수면',
      questions: [
        { q: '평소와 비교해 수면 시간이 크게 달라졌나요?', weight: 1 },
        { q: '밤에 자주 깨거나 안절부절못하나요?', weight: 2 },
        { q: '산책·놀이 등 활동량이 감소했나요?', weight: 2 },
        { q: '평소 좋아하던 활동에 관심이 줄었나요?', weight: 2 },
        { q: '갑자기 매우 무기력하거나 거의 움직이지 않으려고 하나요?', weight: 3 },
        { q: '쉬는 중에도 호흡이 매우 힘들어 보이나요?', weight: 'urgent' },
      ],
    },
  ],
  cat: [
    {
      id: 'ear',
      title: '귀',
      questions: [
        { q: '귀를 평소보다 자주 긁나요?', weight: 1 },
        { q: '머리를 평소보다 자주 흔드나요?', weight: 1 },
        { q: '평소와 다른 귀지·분비물 또는 심한 냄새가 있나요?', weight: 2 },
        { q: '귀 안쪽이 평소보다 붉나요?', weight: 2 },
        { q: '귀를 만질 때 통증을 보이거나 귀가 부어 있나요?', weight: 3 },
        { q: '걷거나 점프할 때 균형을 잡지 못하나요?', weight: 'urgent' },
        { q: '머리가 한쪽으로 심하게 기울어져 있나요?', weight: 'urgent' },
      ],
    },
    {
      id: 'oral',
      title: '구강·잇몸',
      questions: [
        { q: '입 냄새가 평소보다 심해졌나요?', weight: 1 },
        { q: '눈에 띄는 치석이 있나요?', weight: 1 },
        { q: '잇몸이 붉거나 부어 있나요?', weight: 2 },
        { q: '잇몸에서 피가 나나요?', weight: 2 },
        { q: '음식을 먹다가 떨어뜨리나요?', weight: 3 },
        { q: '평소보다 침을 많이 흘리나요?', weight: 3 },
        { q: '입이나 얼굴 주변을 앞발로 반복해서 만지나요?', weight: 2 },
        { q: '입 통증 때문에 음식을 거의 먹지 못하나요?', weight: 'urgent' },
      ],
    },
    {
      id: 'anal',
      title: '항문·배변',
      questions: [
        { q: '엉덩이를 바닥에 끌고 다니나요?', weight: 1 },
        { q: '항문 주변을 평소보다 자주 핥나요?', weight: 1 },
        { q: '변 상태가 평소와 크게 달라졌나요?', weight: 2 },
        { q: '변에 점액이 보이나요?', weight: 2 },
        { q: '항문 주변이 붉거나 부어 있나요?', weight: 2 },
        { q: '배변할 때 힘들어하거나 통증을 보이나요?', weight: 3 },
        { q: '화장실에 반복해서 들어가지만 배변하지 못하나요?', weight: 3 },
        { q: '항문 주변에 고름·진물이 있나요?', weight: 3 },
        { q: '많은 양의 출혈 또는 검은 변이 나타나나요?', weight: 'urgent' },
        { q: '화장실에 반복해서 가지만 소변이 거의 또는 전혀 나오지 않나요?', weight: 'urgent' },
      ],
    },
    {
      id: 'intake',
      title: '섭취량',
      questions: [
        { q: '식사량이 평소보다 감소했나요?', weight: 3 },
        { q: '좋아하던 음식에도 관심을 보이지 않나요?', weight: 2 },
        { q: '식사량이 늘었는데 체중이 감소하나요?', weight: 2 },
        { q: '물을 평소보다 많이 마시나요?', weight: 2 },
        { q: '물을 평소보다 적게 마시나요?', weight: 2 },
        { q: '음식을 먹으려고 하지만 씹거나 삼키기 어려워하나요?', weight: 3 },
        { q: '하루 가까이 거의 먹지 못했나요?', weight: 3 },
        { q: '24시간 이상 거의 음식을 먹지 못했나요?', weight: 'urgent' },
      ],
    },
    {
      id: 'activity',
      title: '활동·수면',
      questions: [
        { q: '평소와 비교해 수면 시간이 크게 달라졌나요?', weight: 1 },
        { q: '안절부절못하거나 자주 깨나요?', weight: 2 },
        { q: '놀이·점프 등 활동량이 감소했나요?', weight: 2 },
        { q: '평소보다 숨어 있는 시간이 늘었나요?', weight: 2 },
        { q: '그루밍 횟수가 감소했나요?', weight: 2 },
        { q: '특정 부위를 지나치게 그루밍하여 털이 빠졌나요?', weight: 2 },
        { q: '사람이나 다른 동물과의 접촉을 평소보다 피하나요?', weight: 2 },
        { q: '갑자기 매우 무기력하거나 거의 움직이지 않나요?', weight: 3 },
        { q: '쉬고 있는데도 호흡이 매우 힘들어 보이나요?', weight: 'urgent' },
      ],
    },
  ],
};

/**
 * 영역 판정 (score.txt 기준)
 * - 영역 점수 = Σ(가중치 × 응답) ÷ Σ(가중치 × 3) × 100 (긴급 문항 제외)
 * - 긴급 문항이 '없음' 외로 응답되면 점수와 관계없이 4단계(빠른 진료 필요)
 * - 0~19: 1단계, 20~39: 2단계, 40 이상: 3단계
 */
export function judgeArea(area: CheckArea, answers: number[]) {
  let sum = 0;
  let max = 0;
  let urgentHit = false;

  area.questions.forEach((question, index) => {
    const value = answers[index] ?? 0;
    if (question.weight === 'urgent') {
      if (value > 0) urgentHit = true;
      return;
    }
    sum += question.weight * value;
    max += question.weight * 3;
  });

  const score = max > 0 ? Math.round((sum / max) * 100) : 0;
  const stage: CheckStage = urgentHit ? 4 : score >= 40 ? 3 : score >= 20 ? 2 : 1;
  const flagged = area.questions
    .map((question, index) => ({ ...question, value: answers[index] ?? 0 }))
    .filter((item) => item.value > 0);

  return { score, stage, urgentHit, flagged };
}
