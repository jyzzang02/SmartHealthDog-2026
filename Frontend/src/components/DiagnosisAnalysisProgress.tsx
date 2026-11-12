import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  ImageSourcePropType,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

interface DiagnosisAnalysisProgressProps {
  imageSource: ImageSourcePropType;
  startedAtMs?: number;
  status?: string;
  onRefresh: () => void;
  onGoHome: () => void;
}

const formatElapsedTime = (seconds: number) => {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, '0');
  const remainingSeconds = (seconds % 60).toString().padStart(2, '0');
  return `${minutes}:${remainingSeconds}`;
};

export default function DiagnosisAnalysisProgress({
  imageSource,
  startedAtMs,
  status,
  onRefresh,
  onGoHome,
}: DiagnosisAnalysisProgressProps) {
  const mountedAtMs = useRef(Date.now()).current;
  const [nowMs, setNowMs] = useState(Date.now());
  const normalizedStatus = (status || '').trim().toUpperCase();
  const isQueued = normalizedStatus === 'PENDING' || normalizedStatus === 'QUEUED';
  const startedAt = startedAtMs && startedAtMs <= nowMs ? startedAtMs : mountedAtMs;
  const elapsedSeconds = Math.max(0, Math.floor((nowMs - startedAt) / 1000));
  const isDelayed = elapsedSeconds >= 30;

  useEffect(() => {
    setNowMs(Date.now());
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [startedAt]);

  const currentStageText = useMemo(
    () => (isQueued ? 'AI 분석 대기 중' : 'AI 분석 중'),
    [isQueued]
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>결과 분석중..</Text>

      <View style={styles.progressWrapper}>
        <View style={styles.progressBase} />
        <View style={styles.progressArc} />
        <Image source={imageSource} style={styles.dogImage} />
      </View>

      <Text style={styles.expectedTime}>보통 10~30초 정도 소요됩니다.</Text>
      <View style={styles.elapsedRow}>
        <Text style={styles.elapsedLabel}>분석 경과 시간</Text>
        <Text style={styles.elapsedValue}>{formatElapsedTime(elapsedSeconds)}</Text>
      </View>

      <View style={styles.stageList}>
        <Text style={styles.completedStage}>1. 이미지 업로드 완료</Text>
        <View style={styles.activeStageRow}>
          <ActivityIndicator size="small" color="#008DE0" />
          <Text style={styles.activeStage}>2. {currentStageText}</Text>
        </View>
        <Text style={styles.pendingStage}>3. 결과 정리 중</Text>
      </View>

      {isDelayed ? (
        <View style={styles.delayedBox}>
          <Text style={styles.delayedText}>분석이 지연되고 있어요. 잠시만 기다려 주세요.</Text>
          <TouchableOpacity style={styles.refreshButton} onPress={onRefresh}>
            <Text style={styles.refreshButtonText}>다시 확인</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <TouchableOpacity style={styles.homeButton} onPress={onGoHome}>
        <Text style={styles.homeButtonText}>홈으로</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 28,
    paddingTop: 96,
    backgroundColor: '#FFFFFF',
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111111',
    marginBottom: 30,
  },
  progressWrapper: {
    width: 190,
    height: 190,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 22,
  },
  progressBase: {
    position: 'absolute',
    width: 170,
    height: 170,
    borderRadius: 85,
    borderWidth: 10,
    borderColor: '#C8E3FF',
  },
  progressArc: {
    position: 'absolute',
    width: 170,
    height: 170,
    borderRadius: 85,
    borderWidth: 10,
    borderTopColor: '#118AF5',
    borderRightColor: '#118AF5',
    borderBottomColor: 'transparent',
    borderLeftColor: 'transparent',
    transform: [{ rotate: '38deg' }],
  },
  dogImage: {
    width: 98,
    height: 98,
    resizeMode: 'contain',
  },
  expectedTime: {
    fontSize: 15,
    color: '#555B61',
  },
  elapsedRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: 10,
  },
  elapsedLabel: {
    fontSize: 14,
    color: '#6A7178',
    marginRight: 8,
  },
  elapsedValue: {
    fontSize: 19,
    fontWeight: '700',
    color: '#0081D5',
  },
  stageList: {
    alignSelf: 'stretch',
    marginTop: 28,
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderRadius: 14,
    backgroundColor: '#F5FAFF',
  },
  completedStage: {
    fontSize: 14,
    color: '#477895',
  },
  activeStageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
  },
  activeStage: {
    marginLeft: 8,
    fontSize: 14,
    fontWeight: '700',
    color: '#0081D5',
  },
  pendingStage: {
    marginTop: 12,
    fontSize: 14,
    color: '#9AA3AA',
  },
  delayedBox: {
    alignSelf: 'stretch',
    alignItems: 'center',
    marginTop: 14,
  },
  delayedText: {
    fontSize: 13,
    color: '#6A7178',
    textAlign: 'center',
  },
  refreshButton: {
    marginTop: 10,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 14,
    backgroundColor: '#EAF5FF',
  },
  refreshButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0081D5',
  },
  homeButton: {
    width: 150,
    height: 48,
    marginTop: 24,
    borderRadius: 9,
    backgroundColor: '#008DE0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  homeButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
