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
