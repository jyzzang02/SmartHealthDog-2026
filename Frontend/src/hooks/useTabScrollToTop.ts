import { useEffect } from 'react';
import type { RefObject } from 'react';
import type { ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { ParamListBase } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';

export const useTabScrollToTop = (ref: RefObject<ScrollView | null>) => {
  const navigation = useNavigation<BottomTabNavigationProp<ParamListBase>>();
  useEffect(() => {
    let frame: number | null = null;
    const unsubscribe = navigation.addListener('tabPress', event => {
      if (frame !== null) cancelAnimationFrame(frame);
      // Wait for tab navigation and every listener's preventDefault decision.
      frame = requestAnimationFrame(() => {
        frame = null;
        if (!event.defaultPrevented) ref.current?.scrollTo({ y: 0, animated: false });
      });
    });
    return () => {
      unsubscribe();
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [navigation, ref]);
};
