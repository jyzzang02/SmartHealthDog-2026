import React from 'react';
import renderer, { act } from 'react-test-renderer';
import EyeDiagnosisResultScreen from './EyeDiagnosisResultScreen';
import UrineDiagnosisResultScreen from './UrineDiagnosisResultScreen';
import { getEyeSubmissionResult, getUrineSubmissionResult } from '../api/diagnosis';

jest.mock('@react-navigation/native', () => ({
  useIsFocused: () => true,
  useFocusEffect: (callback: () => void) => {
    const { useEffect } = jest.requireActual('react');
    useEffect(callback, [callback]);
  },
}));
jest.mock('../api/diagnosis', () => ({
  getEyeSubmissionResult: jest.fn(),
  getUrineSubmissionResult: jest.fn(),
  getPetSubmissions: jest.fn(),
}));
jest.mock('../components/DiagnosisResultView', () => 'DiagnosisResultView');
jest.mock('../components/DiagnosisAnalysisProgress', () => 'DiagnosisAnalysisProgress');

it('shows every returned eye and urine result using the backend fields', async () => {
  jest.mocked(getEyeSubmissionResult).mockResolvedValue({ results: [
    { probability: 0.72, condition: { name: '각막 손상', description: '상세 설명' } },
    { probability: 0, condition: { name: '백내장', description: '' } },
  ] });
  jest.mocked(getUrineSubmissionResult).mockResolvedValue({ results: [
    { analyte: 'Protein', resultValue: 'Negative' },
    { analyte: 'pH', resultValue: '0' },
    { analyte: 'Ketone', resultValue: 'Small 1.5' },
    { analyte: 'NewAnalyte', resultValue: 'Abnormal' },
  ] });
  const navigation = { addListener: jest.fn(() => jest.fn()), navigate: jest.fn(), goBack: jest.fn() };
  const route = { key: 'result', name: 'result', params: { petId: 1, submissionId: 'sample' } };
  const trees: renderer.ReactTestRenderer[] = [];
  try {
    await act(async () => {
      trees.push(renderer.create(<EyeDiagnosisResultScreen navigation={navigation as never} route={route as never} />));
      trees.push(renderer.create(<UrineDiagnosisResultScreen navigation={navigation as never} route={route as never} />));
      for (let i = 0; i < 10; i += 1) await Promise.resolve();
    });
    expect(trees[0].root.findByType('DiagnosisResultView' as never).props.items).toEqual([
      { name: '각막 손상', value: '72.0%', description: '상세 설명' },
      { name: '백내장', value: '0.0%', description: '' },
    ]);
    expect(trees[1].root.findByType('DiagnosisResultView' as never).props.items).toEqual([
      { name: '단백질', value: '음성' },
      { name: '산도 (pH)', value: '0' },
      { name: '케톤', value: '소량 1.5' },
      { name: 'NewAnalyte', value: 'Abnormal' },
    ]);
  } finally {
    act(() => { trees.forEach(tree => tree.unmount()); });
  }
});
