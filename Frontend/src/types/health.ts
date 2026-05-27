export type PhysicalResult = '정상' | '소견 있음' | '미실시';
export type OverallCondition = '양호' | '주의' | '위험';

export interface HealthSummary {
  petId: number;
  checkupDate: string;            // YYYY-MM-DD
  hospitalName?: string;
  examTypes: string[];
  physicalResults: Record<string, PhysicalResult>;
  notes?: string;
  overallCondition: OverallCondition;
  healthTags: string[];           // 소견 있는 항목명 목록
  recommendation: string;         // 권고 문구
}
