/** 병원 진단서 항목 (추후 OCR 결과로 자동 입력 예정) */
export interface DiagnosisCertificate {
  animalName: string;             // 동물명
  species: string;                // 종류
  breed: string;                  // 품종
  sex: string;                    // 성별
  coatColor: string;              // 모색
  age: string;                    // 연령
  features: string;               // 특징
  diseaseName: string;            // 병명
  onsetDate: string;              // 발병 연월일
  diagnosisDate: string;          // 진단 연월일
  prognosis: string;              // 예후 소견
  remarks: string;                // 그 외의 사항(비고)
}

export interface HealthSummary {
  petId: number;
  checkupDate: string;            // YYYY-MM-DD
  hospitalName?: string;
  certificate: DiagnosisCertificate;
  certificateImageUri?: string;   // 진단서 이미지 (로컬 URI)
}
