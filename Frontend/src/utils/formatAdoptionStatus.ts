export const formatAdoptionStatus = (status?: string | null): string => {
  switch (status?.trim().toUpperCase()) {
    case 'AVAILABLE': return '입양 가능';
    case 'PENDING': return '입양 진행 중';
    case 'ADOPTED': return '입양 완료';
    default: return '정보 없음';
  }
};
