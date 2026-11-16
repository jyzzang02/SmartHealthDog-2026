const URINE_ITEMS: Record<string, string> = {
  leukocytes: '백혈구',
  nitrite: '아질산염',
  urobilinogen: '유로빌리노겐',
  protein: '단백질',
  ph: '산도 (pH)',
  blood: '잠혈',
  'specific gravity': '비중',
  ketone: '케톤',
  bilirubin: '빌리루빈',
  glucose: '포도당',
};

export function urineAnalyteLabel(name: string): string {
  const key = name.trim().toLowerCase().replace(/[-_]+/g, ' ').replace(/\s+/g, ' ');
  return Object.prototype.hasOwnProperty.call(URINE_ITEMS, key) ? URINE_ITEMS[key] : name;
}

export const formatUrineValue = (value: string | null | undefined) => {
  if (value == null || !value.trim()) return '-';
  const labels: Record<string, string> = {
    'neg.': '음성', negative: '음성', positive: '양성', normal: '정상',
    trace: '미량', small: '소량', moderate: '중간', large: '다량',
    'non hemolyzed': '비용혈', hemolyzed: '용혈',
  };
  return value.replace(/(^|[^a-z])(non hemolyzed|hemolyzed|neg\.|negative|positive|normal|trace|small|moderate|large)(?![a-z])/gi,
    (_match, prefix: string, label: string) => prefix + (labels[label.toLowerCase()] ?? label));
};
