import { formatUrineValue, urineAnalyteLabel } from './urineAnalyteDisplay';

it('translates result terms while preserving numbers and unknown values', () => {
  expect(urineAnalyteLabel('Protein')).toBe('단백질');
  expect(formatUrineValue('80 Moderate')).toBe('80 중간');
  expect(formatUrineValue('Small 1.5')).toBe('소량 1.5');
  expect(formatUrineValue('Positive')).toBe('양성');
  expect(formatUrineValue('Neg.')).toBe('음성');
  expect(formatUrineValue('unknown 7')).toBe('unknown 7');
});
