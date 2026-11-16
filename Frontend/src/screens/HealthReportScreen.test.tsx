import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { NativeModules, Platform, StyleSheet, Text } from 'react-native';
import { STAGES } from '../data/selfCheck';
import { getHealthReport, type HealthReport } from '../api/diagnosis';
import { getMyPets } from '../api/pets';
import HealthReportScreen from './HealthReportScreen';

jest.mock('@react-navigation/native', () => ({ useIsFocused: () => true }));
jest.mock('../api/pets', () => ({ getMyPets: jest.fn() }));
jest.mock('../api/diagnosis', () => ({ getHealthReport: jest.fn() }));
jest.mock('../storage/tokenStorage', () => {
  const session = Symbol();
  return { getAuthSession: () => session };
});

const loadReport = jest.mocked(getHealthReport);
const emptyReport: HealthReport = {
  summary: { walkCount: 0, totalWalkDistanceKm: 0, selfCheckCount: 0, certificateCount: 0, respirationCompletedCount: 0 },
  sections: { selfChecks: [], certificates: [], walks: [], eyes: [], urines: [], respirations: [] },
  assessmentLevel: 'NOT_ASSESSED',
};

type Props = React.ComponentProps<typeof HealthReportScreen>;
let tree: renderer.ReactTestRenderer;
const goBack = jest.fn();
const push = jest.fn();

beforeEach(async () => {
  jest.mocked(getMyPets).mockReset().mockResolvedValue([]);
  loadReport.mockReset().mockResolvedValue(emptyReport);
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-11-15T15:30:00Z'));
  const props = {
    route: { key: 'report', name: 'HealthReport', params: { petId: 1, petName: '하나', petImageUri: 'https://example.test/pet.jpg' } },
    navigation: { goBack, push },
  } as unknown as Props;
  await act(async () => { tree = renderer.create(<HealthReportScreen {...props} />); });
});

afterEach(() => {
  act(() => tree.unmount());
  jest.useRealTimers();
  goBack.mockClear();
  push.mockClear();
});

const texts = () => tree.root.findAllByType(Text).map(node => node.props.children);
const button = (label: string) => {
  const match = tree.root.findAll(node =>
    node.props.accessibilityRole === 'button' && typeof node.props.onPress === 'function' &&
    (node.props.accessibilityLabel === label || node.findAllByType(Text).some(child => child.props.children === label)),
  )[0];
  if (!match) throw new Error('Missing button: ' + label);
  return match;
};

it('shows the Monday-based Seoul week and navigates without going into future periods', async () => {
  expect(texts()).toContain('2026-11-16 ~ 2026-11-22');
  expect(button('다음 기간').props.disabled).toBe(true);
  await act(async () => { button('이전 기간').props.onPress(); });
  expect(texts()).toContain('2026-11-09 ~ 2026-11-15');
  expect(loadReport).toHaveBeenLastCalledWith(1, 'WEEK', '2026-11-09', '2026-11-15', expect.anything());
  await act(async () => { button('다음 기간').props.onPress(); });
  expect(texts()).toContain('2026-11-16 ~ 2026-11-22');
});

it('switches pets without changing the period and waits for the new report', async () => {
  jest.mocked(getMyPets).mockResolvedValue([
    { id: 1, name: '하나' }, { id: 2, name: '멍멍이', profilePicture: 'https://example.test/dog.jpg' },
  ] as Awaited<ReturnType<typeof getMyPets>>);
  const props = {
    route: { key: 'switch', name: 'HealthReport', params: { petId: 1, petName: '하나' } },
    navigation: { goBack, push },
  } as unknown as Props;
  await act(async () => { tree.update(<HealthReportScreen key="switch" {...props} />); });
  await act(async () => { button('월간').props.onPress(); });
  loadReport.mockImplementationOnce(() => new Promise(() => {}));
  act(() => { button('반려동물 선택: 하나').props.onPress(); });
  act(() => { button('멍멍이').props.onPress(); });
  expect(loadReport).toHaveBeenLastCalledWith(2, 'MONTH', '2026-11-01', '2026-11-30', expect.anything());
  expect(button('반려동물 선택: 멍멍이')).toBeDefined();
  expect(texts()).not.toContain('선택한 기간의 건강 기록이 없어요.');
});

it('switches to calendar months and moves across month boundaries', async () => {
  await act(async () => { button('월간').props.onPress(); });
  expect(button('월간').props.accessibilityState.selected).toBe(true);
  expect(texts()).toContain('2026-11-01 ~ 2026-11-30');
  await act(async () => { button('이전 기간').props.onPress(); });
  expect(texts()).toContain('2026-10-01 ~ 2026-10-31');
  expect(loadReport).toHaveBeenLastCalledWith(1, 'MONTH', '2026-10-01', '2026-10-31', expect.anything());
});

it('opens and closes record sections without presenting fabricated counts', () => {
  expect(texts()).toContain('선택한 기간의 건강 기록이 없어요.');
  expect(texts()).not.toContain('정상');
  const note = '해당 기간의 기록이 없어요.';
  expect(texts()).not.toContain(note);
  act(() => button('검진 기록').props.onPress());
  expect(texts()).toContain(note);
  expect(button('검진 기록').props.accessibilityState.expanded).toBe(true);
  act(() => button('검진 기록').props.onPress());
  expect(texts()).not.toContain(note);
  act(() => button('뒤로').props.onPress());
  expect(goBack).toHaveBeenCalledTimes(1);
});

it('shows server results and does not render a missing respiration rate as zero', async () => {
  loadReport.mockResolvedValueOnce({
    summary: { ...emptyReport.summary, respirationCompletedCount: 1, walkCount: 2 },
    sections: { ...emptyReport.sections, respirations: [
      { status: 'COMPLETED', uploadedAt: '2026-11-01T16:00:00Z', respiratoryRate: 33 },
      { status: 'PROCESSING', respiratoryRate: null },
    ] },
    assessmentLevel: 'URGENT_FLAG_RECORDED',
  });
  await act(async () => { button('월간').props.onPress(); });
  act(() => button('수면 호흡 분석').props.onPress());
  expect(texts()).toContain('2회');
  expect(texts()).toContain('2026-11-02 · 33회/분');
  expect(texts()).toContain('분석 중');
  expect(texts()).not.toContain('0회/분');
  expect(texts()).toContain('해당 기간의 자가진단에 즉시 확인이 필요한 증상이 기록되었어요.');
});

it('cancels stale periods and keeps the current failure until retry succeeds', async () => {
  let resolvePrevious: (report: HealthReport) => void = () => {};
  loadReport.mockImplementationOnce(() => new Promise(resolve => { resolvePrevious = resolve; }));
  await act(async () => { button('이전 기간').props.onPress(); });
  const signal = loadReport.mock.calls.at(-1)?.[4];
  loadReport.mockRejectedValueOnce(new Error('offline'));
  await act(async () => { button('월간').props.onPress(); });
  expect(signal?.aborted).toBe(true);
  await act(async () => { resolvePrevious({ ...emptyReport, summary: { walkCount: 99 } }); });
  expect(texts()).not.toContain('99회');
  expect(texts()).toContain('조회 실패');
  await act(async () => { button('리포트를 불러오지 못했어요. 다시 시도').props.onPress(); });
  expect(texts()).not.toContain('조회 실패');
  expect(texts()).toContain('선택한 기간의 건강 기록이 없어요.');
});

it('uses the existing self-check labels and colors for all four server stages', async () => {
  const stages = [4, 3, 2, 1] as const;
  loadReport.mockResolvedValueOnce({
    ...emptyReport,
    summary: { ...emptyReport.summary, selfCheckCount: 5 },
    sections: { ...emptyReport.sections, selfChecks: [
      ...stages.map(overallStage => ({ recordId: overallStage, overallStage })),
      { recordId: 5, overallStage: null },
    ] },
  });
  await act(async () => { button('월간').props.onPress(); });
  act(() => button('자가진단').props.onPress());

  for (const stage of stages) {
    const { label, color } = STAGES[stage];
    expect(texts()).toContain(label);
    const badge = tree.root.findAllByType(Text).find(node => node.props.children === stage + '단계');
    expect(badge).toBeDefined();
    expect(StyleSheet.flatten(badge?.props.style)).toMatchObject({ color });
  }
  expect(texts()).toContain('단계 미확인');
  expect(texts()).not.toContain('확인이 필요한 기록');
});

it('shows server submission counts rather than eye and urine result row counts', async () => {
  loadReport.mockResolvedValueOnce({
    ...emptyReport,
    summary: { ...emptyReport.summary, eyeSubmissionCount: 1, urineSubmissionCount: 1 },
    sections: { ...emptyReport.sections,
      eyes: [{ submissionId: 'eye-1', conditionName: 'A' }, { submissionId: 'eye-1', conditionName: 'B' }],
      urines: [{ submissionId: 'urine-1', analyteName: 'pH' }, { submissionId: 'urine-1', analyteName: 'GLU' }],
    },
  });
  await act(async () => { button('월간').props.onPress(); });
  for (const section of ['안구 진단', '소변키트 진단']) {
    const labels = button(section).findAllByType(Text).map(node => node.props.children);
    expect(labels).toContain('1건');
    expect(labels).not.toContain('2건');
  }
});

it('opens each exact record and leaves rows with invalid IDs non-interactive', async () => {
  const submissionId = '550e8400-e29b-41d4-a716-446655440000';
  const videoId = '550e8400-e29b-41d4-a716-446655440001';
  loadReport.mockResolvedValueOnce({
    ...emptyReport,
    sections: {
      selfChecks: [{ recordId: 7, overallStage: 2 }],
      certificates: [{ submissionId, diseaseName: '검진 결과' }],
      walks: [
        { walkId: 81, startTime: '2026-11-01T16:00:00Z', distanceKm: 0.2, activeDurationSeconds: 74 },
        { walkId: -1, distanceKm: 0.1 },
      ],
      eyes: [{ submissionId, conditionName: '안구 결과' }],
      urines: [{ submissionId, analyteName: 'pH', value: '7' }],
      respirations: [{ videoId, status: 'COMPLETED', respiratoryRate: 33 }],
    },
  });
  await act(async () => { button('월간').props.onPress(); });
  const open = (section: string, row: string) => {
    act(() => button(section).props.onPress());
    act(() => button(row).props.onPress());
  };
  open('산책', '2026-11-02 · 0.2 km · 74초');
  expect(push).toHaveBeenLastCalledWith('WalkLogDetail', { record: {
    id: 81, petId: 1, petName: '하나', petImage: { uri: 'https://example.test/pet.jpg' },
    date: '2026.11.02', distance: '0.2km', duration: '00:01:14',
  } });
  expect(texts()).toContain('0.1 km');
  expect(() => button('0.1 km')).toThrow();

  open('자가진단', STAGES[2].label);
  expect(push).toHaveBeenLastCalledWith('SelfCheck', { petId: 1, recordId: 7 });
  open('검진 기록', '검진 결과');
  expect(push).toHaveBeenLastCalledWith('HealthCheckResult', { petId: 1, petName: '하나', historySubmissionId: submissionId, viewOnly: true });
  open('안구 진단', '안구 결과');
  expect(push).toHaveBeenLastCalledWith('EyeDiagnosisResult', { petId: 1, submissionId });
  open('소변키트 진단', 'pH · 7');
  expect(push).toHaveBeenLastCalledWith('UrineDiagnosisResult', { petId: 1, submissionId });
  open('수면 호흡 분석', '33회/분');
  expect(push).toHaveBeenLastCalledWith('RespirationResult', { petId: 1, petName: '하나', videoId });
  expect(push).toHaveBeenCalledTimes(6);
});

it.each(['android', 'ios'] as const)('exports the loaded period and collapsed records on %s', async os => {
  const save = jest.fn().mockResolvedValue(false);
  const platform = jest.replaceProperty(Platform, 'OS', os);
  NativeModules.HealthReportPdf = { save };
  try {
    loadReport.mockResolvedValueOnce({
      ...emptyReport,
      sections: {
        ...emptyReport.sections,
        walks: [{ walkId: 42, distanceKm: 2, activeDurationSeconds: 300 }],
        eyes: [
          { submittedAtUtcNaive: '2026-11-12T12:00:00', conditionName: 'Cataract', probability: 0.82 },
          { submittedAtUtcNaive: '2026-11-12T13:00:00', conditionName: 'Conjunctivitis', probability: 0.04 },
          { submittedAtUtcNaive: '2026-11-12T13:00:00', conditionName: 'Entropion', probability: '0.91' },
          { submittedAtUtcNaive: '2026-11-14T13:00:00', conditionName: 'Cataract' },
        ],
        urines: [
          { submittedAtUtcNaive: '2026-11-13T12:00:00', analyteName: 'Protein', value: 'Small' },
          { submittedAtUtcNaive: '2026-11-13T12:00:00', analyteName: 'Glucose', value: 'Positive', isAbnormal: false },
        ],
      },
    });
    await act(async () => { button('월간').props.onPress(); });
    expect(texts()).not.toContain('2 km · 300초');
    await act(async () => { await button('PDF 저장').props.onPress(); });
    expect(save).toHaveBeenCalledWith('하나 통합 건강 리포트 2026-11-16.pdf', expect.arrayContaining([
      { text: '조회 기간: 2026-11-01 ~ 2026-11-30 (한국 시간)', heading: false, role: 'period' },
      { text: '2 km · 300초', heading: false, role: 'record',
        content: { kind: 'walk', label: '산책 기록', value: '2 km', detail: '300초' } },
      { text: '2026-11-12 · AI 상위 점수', heading: false, role: 'record',
        content: { kind: 'eyes', tags: ['안검내반 91.0%', '백내장 82.0%'] } },
      { text: '2026-11-14 · AI 점수 없음', heading: false, role: 'record' },
      expect.objectContaining({ content: { kind: 'urines', results: [{ label: '단백질', value: 'Small', isAbnormal: true }] } }),
      expect.objectContaining({ content: { kind: 'urines', results: [{ label: '포도당', value: 'Positive', isAbnormal: false }] } }),
      { text: '통합 건강 리포트', heading: true, role: 'title' },
      { text: '상세 기록', heading: true, role: 'section' },
    ]));
    const exported = save.mock.calls[0][1] as { text: string }[];
    expect(exported.filter(row => row.text === '2026-11-12 · AI 상위 점수')).toHaveLength(1);
    expect(exported.map(row => row.text).join(' ')).not.toMatch(/결막염|Cataract|Conjunctivitis/);
  } finally {
    delete NativeModules.HealthReportPdf;
    platform.restore();
  }
});

it('groups eye results by submission ID without merging separate same-day tests', async () => {
  const first = '550e8400-e29b-41d4-a716-446655440000';
  const second = '550e8400-e29b-41d4-a716-446655440001';
  const submittedAtUtcNaive = '2026-11-15T10:00:00';
  loadReport.mockResolvedValueOnce({
    ...emptyReport,
    summary: { ...emptyReport.summary, eyeSubmissionCount: 2 },
    sections: { ...emptyReport.sections, eyes: [
      ...['Cataract', 'Non-ulcerative Keratitis', 'Entropion', 'cataract'].map(conditionName => ({ submissionId: first, submittedAtUtcNaive, conditionName })),
      { submissionId: second, submittedAtUtcNaive, conditionName: 'Incontinence' },
    ] },
  });
  await act(async () => { button('월간').props.onPress(); });
  act(() => button('안구 진단').props.onPress());
  expect(texts().filter(value => value === '2026-11-15')).toHaveLength(2);
  expect(texts()).toContain('3개 항목');
  expect(texts()).not.toContain('Entropion');
  act(() => button('백내장, 비궤양성 각막염').props.onPress());
  expect(push).toHaveBeenLastCalledWith('EyeDiagnosisResult', { petId: 1, submissionId: first });
  act(() => button('유루증').props.onPress());
  expect(push).toHaveBeenLastCalledWith('EyeDiagnosisResult', { petId: 1, submissionId: second });
});
