import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';

const SymptomResultScreen: React.FC = () => {
  const navigation = useNavigation();
  const [query, setQuery] = useState('강아지 식욕 부진');

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.topRow}>
        <TouchableOpacity onPress={() => navigation.goBack()} activeOpacity={0.7}>
          <Image
            source={require('../assets/icon_back.png')}
            style={styles.backIcon}
          />
        </TouchableOpacity>

        <View style={styles.searchBox}>
          <TextInput
            style={styles.input}
            value={query}
            onChangeText={setQuery}
            placeholder="검색어를 입력하세요"
          />
          <Image
            source={require('../assets/icon_search.png')}
            style={styles.icon}
          />
        </View>
      </View>

      <Text style={styles.countText}>
        <Text style={styles.countNumber}>0</Text>건 검색
      </Text>

      <Text style={styles.emptyText}>검색 결과가 없습니다.</Text>

      <View style={{ height: 80 }} />
    </ScrollView>
  );
};

export default SymptomResultScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F4F5',
    paddingTop: 48,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  backIcon: {
    width: 22,
    height: 22,
    tintColor: '#7B7C7D',
    marginRight: 12,
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    paddingHorizontal: 16,
    height: 48,
  },
  input: {
    flex: 1,
    fontSize: 16,
  },
  icon: {
    width: 20,
    height: 20,
    tintColor: '#7B7C7D',
  },
  countText: {
    fontSize: 14,
    color: '#3C4144',
    marginBottom: 12,
    paddingHorizontal: 20,
  },
  countNumber: {
    color: '#0081D5',
    fontWeight: '700',
  },
  emptyText: {
    color: '#7B7C7D',
    fontSize: 14,
    fontWeight: '500',
    marginTop: 24,
    textAlign: 'center',
  },
});
