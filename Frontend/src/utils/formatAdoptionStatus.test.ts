import { formatAdoptionStatus } from './formatAdoptionStatus';

it.each([
  ['AVAILABLE', '입양 가능'], ['PENDING', '입양 진행 중'], ['ADOPTED', '입양 완료'],
  [' available ', '입양 가능'], [null, '정보 없음'], [undefined, '정보 없음'],
  ['', '정보 없음'], ['UNKNOWN_STATUS', '정보 없음'], ['constructor', '정보 없음'],
])('formats %s as %s without inventing a known state', (value, expected) => {
  expect(formatAdoptionStatus(value)).toBe(expected);
});
