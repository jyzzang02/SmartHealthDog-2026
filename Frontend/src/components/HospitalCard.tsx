import React from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity } from 'react-native';

interface Props {
  name: string;
  rating?: number | null;
  address: string | null;
  distanceMeters?: number | null;
  distanceOrigin?: string;
  onPress?: () => void;
  onMapPress: () => void;
}

const HospitalCard: React.FC<Props> = ({ name, rating, address, distanceMeters, distanceOrigin = '현재 위치', onPress, onMapPress }) => {
  return (
    <View style={styles.card}>
      <TouchableOpacity style={styles.mapButton} onPress={onMapPress} activeOpacity={0.8}
        accessibilityRole="link" accessibilityLabel={`${name} 네이버 지도에서 보기`}>
        <Image source={require('../assets/naver_map_icon.png')} style={styles.mapIcon}
          resizeMode="contain" accessible={false} testID="hospital-naver-icon" />
        <Text style={styles.mapButtonText}>{'네이버 지도\n에서 보기'}</Text>
      </TouchableOpacity>
      
      {/* 병원 정보 */}
      <TouchableOpacity style={styles.infoContainer} onPress={onPress} activeOpacity={0.8}
        accessibilityRole="button" accessibilityLabel={`${name} 정보 보기`}>

        <Text style={styles.name}>{name}</Text>

        {/* 별점 */}
        {typeof rating === 'number' && Number.isFinite(rating) && rating >= 0 && <View style={styles.row}>
          <Image
            source={require('../assets/icon_rating.png')}
            style={styles.star}
          />
          <Text style={styles.rating}>{rating.toFixed(1)}</Text>
        </View>}

        {/* 주소 */}
        <Text style={styles.address}>{address || '주소 정보 없음'}</Text>
        {typeof distanceMeters === 'number' && Number.isFinite(distanceMeters) && distanceMeters >= 0 && (
          <Text style={styles.distance}>{distanceOrigin}에서 {distanceMeters.toLocaleString()}m</Text>
        )}



      </TouchableOpacity>
    </View>
  );
};

export default HospitalCard;

const styles = StyleSheet.create({
    card: {
        flexDirection: 'row',
        paddingVertical: 12,
        alignItems: 'center',
        width: '100%',        // ★ 고정 폭(350) 제거 → 전체화면 꽉 채움
      },
      
  mapButton: { width: 88, minHeight: 116, paddingHorizontal: 4, paddingVertical: 8, gap: 6, borderRadius: 20, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#EAECEE', alignItems: 'center', justifyContent: 'center' },
  mapIcon: { width: 48, height: 48 },
  mapButtonText: { fontSize: 12, fontWeight: '600', color: '#0081D5', lineHeight: 22, textAlign: 'center' },
  distance: { color: '#0081D5', fontSize: 14, lineHeight: 22, marginBottom: 6 },
  infoContainer: {
    marginLeft: 18,
    minWidth: 0,
    flex: 1,
  },
  name: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
    marginBottom: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  star: {
    width: 16,
    height: 16,
  },
  rating: {
    marginLeft: 5,
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
  },
  address: {
    fontSize: 14,
    color: '#7B7C7D',
    marginBottom: 6,
  },
});
