import React, { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { RootStackParamList } from '../../App';
import { getHealthReport, type HealthReport, type HealthReportPeriod, type HealthReportRow, type HealthReportSection } from '../api/diagnosis';
import { STAGES, STAGE_BAR_COLOR } from '../data/selfCheck';
import { getAuthSession } from '../storage/tokenStorage';
import { getSeoulDateKey } from '../utils/walkWeek';

type Props = NativeStackScreenProps<RootStackParamList, 'HealthReport'>;
type Period = HealthReportPeriod;
type LoadResult = { key: string; session: symbol; report?: HealthReport };

const PERIODS: { value: Period; label: string }[] = [
  { value: 'WEEK', label: '주간' },
  { value: 'MONTH', label: '월간' },
];
const METRICS = ['산책 횟수', '총 산책 거리', '자가진단·검진 기록', '수면 호흡 분석 완료'];
const SECTIONS: { key: HealthReportSection; label: string }[] = [
  { key: 'selfChecks', label: '자가진단' },
  { key: 'certificates', label: '검진 기록' },
  { key: 'walks', label: '산책' },
  { key: 'eyes', label: '안구 진단' },
  { key: 'urines', label: '소변키트 진단' },
  { key: 'respirations', label: '수면 호흡 분석' },
];
const EMPTY = '\u2014';
const SECTION_COUNT_FIELDS: Record<Exclude<HealthReportSection, 'respirations'>, string> = {
  selfChecks: 'selfCheckCount',
  certificates: 'certificateCount',
  walks: 'walkCount',
  eyes: 'eyeSubmissionCount',
  urines: 'urineSubmissionCount',
};
const numberValue = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : undefined;
const recordId = (value: unknown) =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : undefined;
const uuid = (value: unknown) =>
  typeof value === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value) ? value : undefined;

const walkDuration = (seconds?: number) => {
  if (seconds === undefined) return '';
  const total = Math.floor(seconds);
  return [Math.floor(total / 3600), Math.floor(total / 60) % 60, total % 60]
    .map(part => String(part).padStart(2, '0')).join(':');
};

const withUnit = (value: unknown, unit: string) => {
  const number = numberValue(value);
  return number === undefined ? undefined : number + unit;
};
const asText = (value: unknown) => typeof value === 'string' && value.trim() ? value : undefined;

const recordedDate = (value: unknown) => {
  const text = asText(value);
  if (!text) return undefined;
  // The submissions DTO marks these timestamps as UTC without a zone suffix.
  const iso = text.replace(' ', 'T');
  const date = new Date(/(?:Z|[+-]\d{2}:?\d{2})$/i.test(iso) ? iso : iso + 'Z');
  return Number.isFinite(date.getTime()) ? getSeoulDateKey(date) : undefined;
};

const sectionCount = (section: HealthReportSection, summary?: HealthReportRow) => {
  if (!summary) return undefined;
  if (section !== 'respirations') return numberValue(summary[SECTION_COUNT_FIELDS[section]]);
  const completed = numberValue(summary.respirationCompletedCount);
  const other = numberValue(summary.respirationOtherCount);
  return completed !== undefined && other !== undefined ? completed + other : undefined;
};

const SelfCheckReportRow = ({ record }: { record: HealthReportRow }) => {
  const stage = record.overallStage;
  const validStage = stage === 1 || stage === 2 || stage === 3 || stage === 4 ? stage : null;
  const appearance = validStage ? STAGES[validStage] : undefined;
  const date = recordedDate(record.recordedAt);
  return (
    <View style={[styles.selfCheckRow, appearance && { backgroundColor: appearance.bg }]}>
      <View style={[styles.stageRail, validStage && { backgroundColor: STAGE_BAR_COLOR[validStage] }]} />
      <View style={styles.selfCheckInfo}>
        {date && <Text style={styles.selfCheckDate}>{date}</Text>}
        <Text style={[styles.selfCheckLabel, appearance && { color: appearance.color }]}>
          {appearance?.label ?? '단계 미확인'}
        </Text>
      </View>
      {validStage && <Text style={[styles.stageBadge, appearance && { color: appearance.color }]}>{validStage + '단계'}</Text>}
    </View>
  );
};

const formatRecord = (key: Exclude<HealthReportSection, 'selfChecks'>, row: HealthReportRow) => {
  const date = recordedDate(row.recordedAt ?? row.submittedAtUtcNaive ?? row.startTime ?? row.uploadedAt ?? row.completedAt);
  const rate = numberValue(row.respiratoryRate);
  const respirationLabel = row.status === 'COMPLETED' ? (rate !== undefined && rate > 0 ? rate + '회/분' : '호흡수 미확인')
    : row.status === 'PROCESSING' ? '분석 중'
    : row.status === 'PENDING' ? '분석 대기 중'
    : row.status === 'FAILED' ? '분석 실패'
    : row.status === 'UPLOADING' ? '영상 등록 미완료' : '분석 상태 미확인';
  const values = {
    certificates: [asText(row.diagnosedDateText), asText(row.diseaseName)],
    walks: [withUnit(row.distanceKm, ' km'), withUnit(row.activeDurationSeconds, '초')],
    eyes: [asText(row.conditionName)],
    urines: [asText(row.analyteName), asText(row.value) ?? withUnit(row.value, '')],
    respirations: [respirationLabel],
  }[key].filter(Boolean);
  return [date, ...(values.length ? values : ['상세 정보 없음'])].filter(Boolean).join(' · ');
};

const getMetrics = (summary?: HealthReportRow) => {
  const selfChecks = numberValue(summary?.selfCheckCount);
  const certificates = numberValue(summary?.certificateCount);
  return [
    withUnit(summary?.walkCount, '회'),
    withUnit(summary?.totalWalkDistanceKm, ' km'),
    selfChecks !== undefined && certificates !== undefined ? (selfChecks + certificates) + '건' : undefined,
    withUnit(summary?.respirationCompletedCount, '건'),
  ];
};

const CHEVRON = require('../assets/icon_right.png');
const BACK = require('../assets/icon_navBack.png');
const DAY_MS = 86_400_000;
const dateKey = (date: Date) => date.toISOString().slice(0, 10);
const calendarDate = (key: string) => new Date(key + 'T00:00:00Z');

const getPeriodDates = (anchor: string, period: Period) => {
  const date = calendarDate(anchor);
  if (period === 'MONTH') {
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth();
    return {
      start: dateKey(new Date(Date.UTC(year, month, 1))),
      end: dateKey(new Date(Date.UTC(year, month + 1, 0))),
    };
  }
  const monday = date.getTime() - ((date.getUTCDay() + 6) % 7) * DAY_MS;
  return { start: dateKey(new Date(monday)), end: dateKey(new Date(monday + 6 * DAY_MS)) };
};

const movePeriod = (start: string, period: Period, direction: -1 | 1) => {
  const date = calendarDate(start);
  if (period === 'MONTH') date.setUTCMonth(date.getUTCMonth() + direction);
  else date.setUTCDate(date.getUTCDate() + 7 * direction);
  return dateKey(date);
};

export default function HealthReportScreen({ navigation, route }: Props) {
  const { petId, petName, petImageUri } = route.params;
  const focused = useIsFocused();
  const session = getAuthSession();
  const today = getSeoulDateKey();
  const [period, setPeriod] = useState<Period>('WEEK');
  const [anchor, setAnchor] = useState(today);
  const [expanded, setExpanded] = useState<HealthReportSection | null>(null);
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<LoadResult>();

  const { start, end } = getPeriodDates(anchor, period);
  const next = movePeriod(start, period, 1);
  const canGoNext = next <= today;
  const key = [petId, period, start, revision].join(':');
  const current = result?.key === key && result.session === session ? result : undefined;
  const report = current?.report;
  const metrics = getMetrics(report?.summary);
  const hasRecords = report && SECTIONS.some(section => report.sections[section.key].length > 0);

  useEffect(() => {
    if (!focused) return;
    const controller = new AbortController();
    let active = true;
    const commit = (data?: HealthReport) => {
      if (active && getAuthSession() === session) setResult({ key, session, report: data });
    };
    setResult(undefined);
    const timeout = setTimeout(() => {
      controller.abort();
      commit();
    }, 30_000);
    getHealthReport(petId, period, start, end, controller.signal)
      .then(data => { if (!controller.signal.aborted) commit(data); })
      .catch(() => { if (!controller.signal.aborted) commit(); })
      .finally(() => clearTimeout(timeout));
    return () => {
      active = false;
      clearTimeout(timeout);
      controller.abort();
    };
  }, [focused, key, session, petId, period, start, end]);

  const recordAction = (section: HealthReportSection, row: HealthReportRow) => {
    switch (section) {
      case 'selfChecks': {
        const id = recordId(row.recordId);
        return id ? () => navigation.push('SelfCheck', { petId, recordId: id }) : undefined;
      }
      case 'walks': {
        const id = recordId(row.walkId);
        const durationSec = numberValue(row.activeDurationSeconds);
        return id ? () => navigation.push('WalkLogDetail', { record: {
          id, petId, petName,
          petImage: petImageUri ? { uri: petImageUri } : null,
          date: recordedDate(row.startTime)?.replace(/-/g, '.') ?? '',
          distance: withUnit(row.distanceKm, 'km') ?? '',
          duration: walkDuration(durationSec),
        } }) : undefined;
      }
      case 'respirations': {
        const videoId = uuid(row.videoId);
        return videoId ? () => navigation.push('RespirationResult', { petId, petName, videoId }) : undefined;
      }
      case 'certificates':
      case 'eyes':
      case 'urines': {
        const submissionId = uuid(row.submissionId);
        if (!submissionId) return undefined;
        if (section === 'certificates') return () => navigation.push('HealthCheckResult', {
          petId, petName, historySubmissionId: submissionId, viewOnly: true,
        });
        if (section === 'eyes') return () => navigation.push('EyeDiagnosisResult', { petId, submissionId });
        return () => navigation.push('UrineDiagnosisResult', { petId, submissionId });
      }
    }
  };

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="뒤로" style={styles.backButton}
          onPress={() => navigation.goBack()}>
          <Image source={BACK} style={styles.backIcon} accessible={false} />
        </Pressable>
        <Text accessibilityRole="header" style={styles.heading}>통합 건강 리포트</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.periodCard}>
          <View style={styles.periodIndicator} />
          <Text style={styles.petName}>{petName}</Text>
          <Text style={styles.periodCaption}>기간별 건강 기록 모아보기</Text>
          <View style={styles.segment}>
            {PERIODS.map(({ value, label }) => (
              <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: period === value }}
                style={[styles.segmentButton, period === value && styles.segmentSelected]}
                onPress={() => setPeriod(value)}>
                <Text style={[styles.segmentText, period === value && styles.segmentSelectedText]}>{label}</Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.dateRow}>
            <Pressable accessibilityRole="button" accessibilityLabel="이전 기간" style={styles.dateButton}
              onPress={() => setAnchor(movePeriod(start, period, -1))}>
              <Image source={CHEVRON} style={[styles.chevron, styles.chevronLeft]} accessible={false} />
            </Pressable>
            <Text style={styles.dateText}>{start + ' ~ ' + end}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="다음 기간" accessibilityState={{ disabled: !canGoNext }}
              style={[styles.dateButton, !canGoNext && styles.dateButtonDisabled]}
              disabled={!canGoNext} onPress={() => setAnchor(getPeriodDates(today, period).start === next ? today : next)}>
              <Image source={CHEVRON} style={styles.chevron} accessible={false} />
            </Pressable>
          </View>
        </View>

        {report?.assessmentLevel === 'URGENT_FLAG_RECORDED' && (
          <View style={styles.alertCard}>
            <View style={styles.alertMarker} accessible={false}>
              <Text style={styles.alertMarkerText}>!</Text>
            </View>
            <View style={styles.alertContent}>
              <Text accessibilityRole="header" style={styles.alertTitle}>확인이 필요한 기록</Text>
              <Text style={styles.alertBody}>해당 기간의 자가진단에 즉시 확인이 필요한 증상이 기록되었어요.</Text>
            </View>
          </View>
        )}

        <View style={styles.card}>
          <View style={styles.summaryHeader}>
            <Text accessibilityRole="header" style={styles.sectionTitle}>한눈에 보기</Text>
            {!report && <Text style={styles.badge}>{current ? '조회 실패' : '불러오는 중'}</Text>}
          </View>
          <View style={styles.metrics}>
            {METRICS.map((label, index) => (
              <View key={label} style={[styles.metric, index >= 2 && styles.recordMetric]}>
                <Text style={styles.metricLabel}>{label}</Text>
                <Text style={[styles.metricValue, index >= 2 && styles.recordMetricValue]}>{metrics[index] ?? EMPTY}</Text>
              </View>
            ))}
          </View>
          {current && !report && (
            <Pressable accessibilityRole="button" style={styles.retryButton} onPress={() => setRevision(value => value + 1)}>
              <Text style={styles.metricLabel}>리포트를 불러오지 못했어요. 다시 시도</Text>
            </Pressable>
          )}
          {report && !hasRecords && <Text style={styles.note}>선택한 기간의 건강 기록이 없어요.</Text>}
        </View>

        <View style={styles.card}>
          <Text accessibilityRole="header" style={styles.sectionTitle}>상세 기록</Text>
          {SECTIONS.map(({ key: section, label }) => {
            const isExpanded = expanded === section;
            const rows = report?.sections[section];
            const count = sectionCount(section, report?.summary);
            return (
              <View key={section} style={styles.record}>
                <Pressable accessibilityRole="button" accessibilityState={{ expanded: isExpanded }}
                  style={styles.recordButton} onPress={() => setExpanded(isExpanded ? null : section)}>
                  <Text style={styles.recordLabel}>{label}</Text>
                  {count !== undefined && <Text style={styles.sectionCount}>{count + '건'}</Text>}
                  <Image source={CHEVRON} style={[styles.chevron, isExpanded && styles.chevronDown]} accessible={false} />
                </Pressable>
                {isExpanded && (rows?.length
                  ? <View style={styles.recordList}>
                    {rows.map((row, index) => {
                      const openRecord = recordAction(section, row);
                      const content = section === 'selfChecks'
                        ? <SelfCheckReportRow record={row} />
                        : <Text style={styles.recordDetail}>{formatRecord(section, row)}</Text>;
                      if (!openRecord) return <View key={index}>{content}</View>;
                      return (
                        <Pressable key={index} accessibilityRole="button" style={styles.recordLink}
                          onPress={() => { if (getAuthSession() === session) openRecord(); }}>
                          <View style={styles.linkContent}>{content}</View>
                          <Image source={CHEVRON} style={styles.chevron} accessible={false} />
                        </Pressable>
                      );
                    })}
                  </View>
                  : <Text style={styles.recordNote}>{report ? '해당 기간의 기록이 없어요.'
                    : current ? '기록을 불러오지 못했어요.' : '기록을 불러오는 중이에요.'}</Text>)}
              </View>
            );
          })}
        </View>

        <Text style={styles.disclaimer}>이 리포트는 기존 기록의 요약이며, 수의사의 진단을 대신하지 않아요.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F3F6F9' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, backgroundColor: '#FFFFFF', minHeight: 52 },
  backButton: { width: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  backIcon: { width: 18, height: 18, resizeMode: 'contain' },
  heading: { flex: 1, color: '#1F2024', fontSize: 20, fontWeight: '700' },
  content: { padding: 16, paddingBottom: 28, gap: 12 },
  periodCard: { backgroundColor: '#E8F4FF', borderRadius: 20, padding: 14, gap: 5 },
  periodIndicator: { backgroundColor: '#FFC94D', width: 28, height: 4, borderRadius: 2 },
  petName: { fontSize: 24, fontWeight: '800', color: '#152F48' },
  periodCaption: { fontSize: 14, color: '#47617A' },
  segment: { flexDirection: 'row', backgroundColor: '#D7E8F8', padding: 3, borderRadius: 12, marginTop: 5 },
  segmentButton: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 9 },
  segmentSelected: { backgroundColor: '#FFFFFF' },
  segmentText: { fontSize: 15, color: '#47617A', fontWeight: '600' },
  segmentSelectedText: { color: '#0068A8', fontWeight: '700' },
  dateRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dateButton: { width: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  dateButtonDisabled: { opacity: 0.3 },
  chevron: { width: 14, height: 14, tintColor: '#0068A8', resizeMode: 'contain' },
  chevronLeft: { transform: [{ rotate: '180deg' }] },
  chevronDown: { transform: [{ rotate: '90deg' }] },
  dateText: { flex: 1, textAlign: 'center', color: '#152F48', fontSize: 14, fontWeight: '700' },
  card: { backgroundColor: '#FFFFFF', borderRadius: 18, padding: 14 },
  alertCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 12, borderRadius: 14,
    backgroundColor: '#FDECEC', borderWidth: 1, borderColor: '#F6CED1' },
  alertMarker: { borderRadius: 12, width: 24, height: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: '#C2262B' },
  alertMarkerText: { color: '#FFFFFF', fontWeight: '800', fontSize: 14 },
  alertContent: { flex: 1, gap: 3 },
  alertTitle: { color: '#9D2530', fontSize: 14, fontWeight: '800' },
  alertBody: { color: '#782833', fontSize: 13, lineHeight: 19 },
  summaryHeader: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  sectionTitle: { color: '#152F48', fontSize: 18, fontWeight: '700' },
  badge: { backgroundColor: '#FFF3D2', color: '#674713', fontSize: 12, fontWeight: '700', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 10, gap: 8 },
  metric: { flexBasis: '47%', flexGrow: 1, padding: 10, borderRadius: 12, gap: 4, backgroundColor: '#EEF6FD' },
  recordMetric: { backgroundColor: '#EEF7F4' },
  recordMetricValue: { color: '#176453' },
  metricLabel: { color: '#47617A', fontSize: 13 },
  metricValue: { color: '#0068A8', fontSize: 22, fontWeight: '700' },
  note: { color: '#47617A', fontSize: 13, lineHeight: 20, marginTop: 6 },
  retryButton: { minHeight: 44, justifyContent: 'center' },
  record: { borderBottomColor: '#EDF2F6', borderBottomWidth: StyleSheet.hairlineWidth },
  recordButton: { minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  recordLabel: { flex: 1, color: '#152F48', fontSize: 15, fontWeight: '600' },
  sectionCount: { color: '#47617A', backgroundColor: '#F0F4F8', paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 8, fontSize: 12, fontWeight: '600' },
  recordList: { gap: 6, paddingBottom: 10 },
  recordLink: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6 },
  linkContent: { flex: 1 },
  recordDetail: { color: '#29435C', fontSize: 13, lineHeight: 19, padding: 9, backgroundColor: '#F5F8FB', borderRadius: 10 },
  recordNote: { color: '#47617A', fontSize: 13, paddingBottom: 12 },
  selfCheckRow: { flexDirection: 'row', alignItems: 'center', padding: 9, borderRadius: 10, gap: 9, backgroundColor: '#F3F6F9' },
  stageRail: { width: 4, alignSelf: 'stretch', borderRadius: 3, backgroundColor: '#A3B1BF' },
  selfCheckInfo: { flex: 1, gap: 3 },
  selfCheckDate: { fontSize: 12, color: '#47617A' },
  selfCheckLabel: { fontSize: 14, fontWeight: '700', color: '#47617A' },
  stageBadge: { backgroundColor: '#FFFFFF', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 5, fontSize: 12, fontWeight: '700' },
  disclaimer: { color: '#47617A', fontSize: 12, lineHeight: 18, paddingHorizontal: 4 },
});
