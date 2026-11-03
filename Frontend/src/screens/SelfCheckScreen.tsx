import React, { useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../App';
import { SPECIES_META, PetSpecies } from '../data/petQna';
import { SELF_CHECK, SCALE, STAGES, STAGE_BAR_COLOR, judgeArea, CheckStage } from '../data/selfCheck';

type NavProp = NativeStackNavigationProp<RootStackParamList, 'SelfCheck'>;

const SPECIES_LIST: PetSpecies[] = ['dog', 'cat'];

// 응답 버튼 선택 시 색상 (없음 / 가끔 / 반복 / 심함)
const SCALE_TONE = [
  { bg: '#EEF7FD', border: '#0081D5', text: '#0081D5' },
  { bg: '#FFFBEA', border: '#FFD966', text: '#8A6500' },
  { bg: '#FFF2DC', border: '#FFB547', text: '#A35C00' },
  { bg: '#FDECEC', border: '#E5484D', text: '#C2262B' },
];

const SelfCheckScreen = () => {
  const navigation = useNavigation<NavProp>();
  const scrollRef = useRef<ScrollView>(null);

  const [species, setSpecies] = useState<PetSpecies>('dog');
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number[]>>({});
  const [showResult, setShowResult] = useState(false);

  const areas = SELF_CHECK[species];
  const area = areas[step];
  const current = answers[area.id] ?? [];
  const answeredCount = current.filter((value) => value !== undefined).length;
  const remaining = area.questions.length - answeredCount;
  const isLast = step === areas.length - 1;
  const name = SPECIES_META[species].label;

  const scrollToTop = () => scrollRef.current?.scrollTo({ y: 0, animated: false });

  const changeSpecies = (next: PetSpecies) => {
    if (next === species) return;
    setSpecies(next);
    setAnswers({});
  };

  const setAnswer = (index: number, value: number) =>
    setAnswers((prev) => {
      const next = [...(prev[area.id] ?? [])];
      next[index] = value;
      return { ...prev, [area.id]: next };
    });

  const goNext = () => {
    if (isLast) setShowResult(true);
    else setStep(step + 1);
    scrollToTop();
  };

  const handleBack = () => {
    if (showResult) setShowResult(false);
    else if (step > 0) setStep(step - 1);
    else navigation.goBack();
    scrollToTop();
  };

  const reset = () => {
    setAnswers({});
    setStep(0);
    setShowResult(false);
    scrollToTop();
  };

  const results = areas.map((item) => ({ area: item, ...judgeArea(item, answers[item.id] ?? []) }));
  const overallStage = Math.max(...results.map((result) => result.stage)) as CheckStage;
  const overall = STAGES[overallStage];
  const attentionAreas = results.filter((result) => result.stage >= 2).map((result) => result.area.title);

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      {/* NavBar */}
      <View style={styles.navBar}>
        <TouchableOpacity onPress={handleBack} style={styles.backRow}>
          <Image source={require('../assets/icon_navBack.png')} style={styles.backIcon} />
          <Text style={styles.navTitle}>반려동물 자가진단</Text>
        </TouchableOpacity>
      </View>

      {!showResult ? (
        <>
          {/* 진행 상태 */}
          <View style={styles.progressBox}>
            <View style={styles.progressRow}>
              {areas.map((item, index) => (
                <View
                  key={item.id}
                  style={[styles.progressSeg, index <= step && styles.progressSegActive]}
                />
              ))}
            </View>
            <View style={styles.progressInfoRow}>
              <Text style={styles.progressStep}>
                {step + 1} / {areas.length} · {area.title}
              </Text>
              <Text style={styles.progressCount}>
                {answeredCount} / {area.questions.length} 응답
              </Text>
            </View>
          </View>

          <ScrollView
            ref={scrollRef}
            style={styles.scroll}
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
          >
            {step === 0 && (
              <View style={styles.speciesRow}>
                {SPECIES_LIST.map((item) => {
                  const selected = species === item;
                  return (
                    <TouchableOpacity
                      key={item}
                      style={[styles.speciesChip, selected && styles.speciesChipActive]}
                      activeOpacity={0.8}
                      onPress={() => changeSpecies(item)}
                    >
                      <Image source={SPECIES_META[item].image} style={styles.speciesChipImage} />
                      <Text style={[styles.speciesChipText, selected && styles.speciesChipTextActive]}>
                        {SPECIES_META[item].label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            <Text style={styles.headline}>{area.title}</Text>
            <Text style={styles.headlineDesc}>
              최근 며칠간 {name}의 모습에 가장 가까운 정도를 골라 주세요.
            </Text>

            <View style={styles.cardList}>
              {area.questions.map((question, index) => (
                <View key={question.q} style={styles.card}>
                  <Text style={styles.questionText}>
                    <Text style={styles.questionNum}>{String(index + 1).padStart(2, '0')}  </Text>
                    {question.q}
                  </Text>
                  <View style={styles.scaleGrid}>
                    {SCALE.map((label, value) => {
                      const selected = current[index] === value;
                      const tone = SCALE_TONE[value];
                      return (
                        <TouchableOpacity
                          key={label}
                          style={[
                            styles.scaleBtn,
                            selected && { backgroundColor: tone.bg, borderColor: tone.border },
                          ]}
                          activeOpacity={0.8}
                          onPress={() => setAnswer(index, value)}
                        >
                          <Text style={[styles.scaleBtnText, selected && { color: tone.text }]}>{label}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              ))}
            </View>
          </ScrollView>

          {/* 하단 버튼 */}
          <View style={styles.bottomBar}>
            <TouchableOpacity
              style={[styles.primaryBtn, remaining > 0 && styles.primaryBtnDisabled]}
              activeOpacity={0.8}
              disabled={remaining > 0}
              onPress={goNext}
            >
              <Text style={styles.primaryBtnText}>
                {remaining > 0
                  ? `${remaining}개 문항이 남았어요`
                  : isLast
                    ? '결과 확인하기'
                    : `다음 · ${areas[step + 1].title}`}
              </Text>
            </TouchableOpacity>
          </View>
        </>
      ) : (
        <ScrollView
          ref={scrollRef}
          style={styles.scroll}
          contentContainerStyle={styles.resultContent}
          showsVerticalScrollIndicator={false}
        >
          {/* 종합 결과 */}
          <View style={[styles.heroCard, { backgroundColor: overall.bg }]}>
            <View style={[styles.heroBadge, { backgroundColor: STAGE_BAR_COLOR[overallStage] }]}>
              <Text style={styles.heroBadgeText}>{overallStage === 1 ? '✓' : '!'}</Text>
            </View>
            <Text style={styles.heroCaption}>{name} 자가진단 결과 · {overallStage}단계</Text>
            <Text style={[styles.heroTitle, { color: overall.color }]}>{overall.label}</Text>
            <Text style={styles.heroDesc}>
              {attentionAreas.length > 0
                ? `${attentionAreas.join(', ')} 영역에서 주의가 필요한 소견이 있어요. ${overall.guide}`
                : `영역별로 특별한 이상 징후가 보이지 않아요. ${overall.guide}`}
            </Text>
          </View>

          {/* 영역별 결과 */}
          <View style={styles.cardList}>
            {results.map((result) => {
              const stage = STAGES[result.stage];
              return (
                <View key={result.area.id} style={styles.card}>
                  <View style={styles.resultHeaderRow}>
                    <Text style={styles.resultAreaTitle}>{result.area.title}</Text>
                    <View style={[styles.stagePill, { backgroundColor: stage.bg }]}>
                      <Text style={[styles.stagePillText, { color: stage.color }]}>{stage.label}</Text>
                    </View>
                  </View>

                  <View style={styles.scoreRow}>
                    <Text style={styles.scoreLabel}>{result.area.title} 건강 이상 징후 점수</Text>
                    <Text style={styles.scoreValue}>
                      <Text style={{ color: STAGE_BAR_COLOR[result.stage] }}>{result.score}</Text>/100
                    </Text>
                  </View>
                  <View style={styles.barTrack}>
                    <View
                      style={[
                        styles.barFill,
                        { width: `${result.score}%`, backgroundColor: STAGE_BAR_COLOR[result.stage] },
                      ]}
                    />
                  </View>

                  {result.urgentHit && (
                    <Text style={styles.urgentText}>긴급 문항이 확인되어 빠른 진료가 필요해요.</Text>
                  )}

                  {result.flagged.length > 0 ? (
                    <View style={styles.flagList}>
                      {result.flagged.map((item) => (
                        <View key={item.q} style={styles.flagRow}>
                          <View style={[styles.flagDot, item.weight === 'urgent' && styles.flagDotUrgent]} />
                          <Text style={styles.flagText}>
                            {item.q} <Text style={styles.flagScale}>· {SCALE[item.value]}</Text>
                          </Text>
                        </View>
                      ))}
                    </View>
                  ) : (
                    <Text style={styles.noFlagText}>해당되는 증상이 없어요.</Text>
                  )}
                </View>
              );
            })}
          </View>

          <Text style={styles.disclaimer}>
            본 결과는 보호자 응답에 기반한 참고용 점수이며 질병 확률이나 수의사의 진단을 대신하지 않습니다.
          </Text>

          <View style={styles.resultBtnRow}>
            <TouchableOpacity style={styles.secondaryBtn} activeOpacity={0.8} onPress={reset}>
              <Text style={styles.secondaryBtnText}>↻ 다시하기</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.primaryBtn, styles.resultPrimaryBtn]}
              activeOpacity={0.8}
              onPress={() => navigation.goBack()}
            >
              <Text style={styles.primaryBtnText}>
                {overallStage >= 3 ? '주변 동물병원 찾기' : '건강탭으로'}
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
};

export default SelfCheckScreen;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fff' },

  navBar: {
    height: 56,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#EAECEE',
  },
  backRow: { flexDirection: 'row', alignItems: 'center' },
  backIcon: { width: 20, height: 20, tintColor: '#1F2024', marginRight: 12 },
  navTitle: { fontSize: 20, fontWeight: '600', color: '#1F2024' },

  progressBox: { backgroundColor: '#fff', paddingHorizontal: 20, paddingTop: 12, paddingBottom: 14 },
  progressRow: { flexDirection: 'row', gap: 4, marginBottom: 10 },
  progressSeg: { flex: 1, height: 4, borderRadius: 2, backgroundColor: '#EEF1F4' },
  progressSegActive: { backgroundColor: '#0081D5' },
  progressInfoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  progressStep: { fontSize: 13, fontWeight: '600', color: '#0081D5' },
  progressCount: { fontSize: 13, fontWeight: '500', color: '#7B7C7D' },

  scroll: { flex: 1, backgroundColor: '#F3F4F5' },
  content: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 24 },
  resultContent: { paddingHorizontal: 20, paddingTop: 28, paddingBottom: 40 },

  speciesRow: { flexDirection: 'row', gap: 8, marginBottom: 20 },
  speciesChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 40,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
    backgroundColor: '#fff',
  },
  speciesChipActive: { backgroundColor: '#0081D5', borderColor: '#0081D5' },
  speciesChipImage: { width: 22, height: 22, borderRadius: 11 },
  speciesChipText: { fontSize: 14, fontWeight: '600', color: '#3C4144' },
  speciesChipTextActive: { color: '#fff' },

  headline: { fontSize: 24, fontWeight: '700', color: '#000', lineHeight: 34, marginBottom: 6 },
  headlineDesc: { fontSize: 14, fontWeight: '500', color: '#7B7C7D', lineHeight: 22, marginBottom: 20 },

  cardList: { gap: 12 },

  card: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 1,
  },

  questionText: { fontSize: 16, fontWeight: '600', color: '#000', lineHeight: 24, marginBottom: 14 },
  questionNum: { color: '#0081D5' },

  scaleGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 8 },
  scaleBtn: {
    width: '48.5%',
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'transparent',
    backgroundColor: '#F7F8F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scaleBtnText: { fontSize: 14, fontWeight: '600', color: '#7B7C7D' },

  bottomBar: {
    backgroundColor: '#fff',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.05)',
  },
  primaryBtn: {
    height: 52,
    borderRadius: 14,
    backgroundColor: '#0081D5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnDisabled: { backgroundColor: '#C9CED2' },
  primaryBtnText: { fontSize: 16, fontWeight: '600', color: '#fff' },

  heroCard: { borderRadius: 20, paddingHorizontal: 24, paddingVertical: 28, marginBottom: 16 },
  heroBadge: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  heroBadgeText: { fontSize: 20, fontWeight: '700', color: '#fff' },
  heroCaption: { fontSize: 13, fontWeight: '500', color: '#7B7C7D', marginTop: 16, marginBottom: 4 },
  heroTitle: { fontSize: 28, fontWeight: '700', lineHeight: 36 },
  heroDesc: { fontSize: 14, fontWeight: '500', color: '#3C4144', lineHeight: 22, marginTop: 10 },

  resultHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  resultAreaTitle: { fontSize: 16, fontWeight: '600', color: '#000' },
  stagePill: { borderRadius: 12, paddingHorizontal: 10, paddingVertical: 3 },
  stagePillText: { fontSize: 12, fontWeight: '600' },

  scoreRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 },
  scoreLabel: { fontSize: 13, fontWeight: '500', color: '#7B7C7D' },
  scoreValue: { fontSize: 14, fontWeight: '700', color: '#3C4144' },

  barTrack: { height: 6, borderRadius: 3, backgroundColor: '#EEF1F4', overflow: 'hidden', marginBottom: 12 },
  barFill: { height: '100%', borderRadius: 3 },

  urgentText: { fontSize: 13, fontWeight: '600', color: '#C2262B', marginBottom: 10 },

  flagList: { gap: 8 },
  flagRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  flagDot: { width: 6, height: 6, borderRadius: 3, marginTop: 7, backgroundColor: '#FFC94D' },
  flagDotUrgent: { backgroundColor: '#E5484D' },
  flagText: { flex: 1, fontSize: 13, fontWeight: '500', color: '#3C4144', lineHeight: 20 },
  flagScale: { color: '#7B7C7D' },
  noFlagText: { fontSize: 13, fontWeight: '500', color: '#7B7C7D' },

  disclaimer: { fontSize: 12, fontWeight: '500', color: '#9A9C9E', lineHeight: 18, marginTop: 16, marginBottom: 20 },

  resultBtnRow: { flexDirection: 'row', gap: 8 },
  secondaryBtn: {
    height: 52,
    paddingHorizontal: 18,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnText: { fontSize: 15, fontWeight: '600', color: '#3C4144' },
  resultPrimaryBtn: { flex: 1 },
});
