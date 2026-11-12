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
  weight?: number;                // 체중 (kg)
  heartRate?: number;             // 심박수 (bpm)
  temperature?: number;           // 체온 (°C)
}

export const CONDITION_COLORS: Record<OverallCondition, { bg: string; text: string }> = {
  양호: { bg: '#E8F4FD', text: '#2A7BE4' },
  주의: { bg: '#FFF3E0', text: '#F5A623' },
  위험: { bg: '#FFEBEE', text: '#EF5F5F' },
};
