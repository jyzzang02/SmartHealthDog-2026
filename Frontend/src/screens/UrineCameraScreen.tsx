import React from 'react';
import DiagnosisCameraCapture from '../components/DiagnosisCameraCapture';
import { requestUrineDiagnosis } from '../api/pets';

const UrineCameraScreen = () => (
  <DiagnosisCameraCapture
    type="urine"
    title="소변키트 진단"
    resultRouteName="UrineDiagnosisResult"
    requestDiagnosis={requestUrineDiagnosis}
  />
);

export default UrineCameraScreen;
