export const EYE_EPIPHORA_NAME = '유루증';
export const EYE_EPIPHORA_DESCRIPTION = '눈물이 코로 배출되지 못하고 밖으로 흘러넘치는 질환';

export function isLegacyEpiphoraName(name: unknown): boolean {
  const normalized = typeof name === 'string' ? name.trim().toLowerCase() : '';
  return normalized === 'incontinence' || normalized === '요실금';
}
