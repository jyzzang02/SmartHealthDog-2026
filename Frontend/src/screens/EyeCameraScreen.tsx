import React from 'react';
import DiagnosisCameraCapture from '../components/DiagnosisCameraCapture';
import { requestEyeDiagnosis } from '../api/diagnosis';

const EyeCameraScreen = () => (
  <DiagnosisCameraCapture
    type="eye"
    title="안구질환 진단"
    resultRouteName="EyeDiagnosisResult"
    requestDiagnosis={requestEyeDiagnosis}
  />
);

export default EyeCameraScreen;
