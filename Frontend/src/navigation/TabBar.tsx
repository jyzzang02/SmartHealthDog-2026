import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Image, ImageSourcePropType, Platform, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import HomeScreen from '../screens/HomeScreen';
import WalkScreen from '../screens/WalkScreen';
import HealthScreen from '../screens/HealthScreen';
import MyScreen from '../screens/MyPageScreen';
import AdoptScreen from '../screens/AdoptScreen';

const Tab = createBottomTabNavigator();

const TAB_BAR_HEIGHT = 56;
const EXTRA_BOTTOM_PADDING = Platform.OS === 'android' ? 4 : 0;

const tabIcons = {
  home: require('../assets/image/icons/Home.png'),
  walk: require('../assets/image/icons/Walk.png'),
  adopt: require('../assets/image/icons/Adopt.png'),
  health: require('../assets/image/icons/Health.png'),
  my: require('../assets/image/icons/My.png'),
};

const TabBarLabel = ({ focused, children }: any) => (
  <Text style={[styles.tabLabel, focused ? styles.tabLabelFocused : styles.tabLabelBlurred]}>
    {children}
  </Text>
);

const createTabIcon = (icon: ImageSourcePropType) => {
  const TabIcon = ({ focused }: any) => (
    <Image
      source={icon}
      style={[styles.tabIcon, focused ? styles.tabIconFocused : styles.tabIconBlurred]}
      resizeMode="contain"
    />
  );

  return TabIcon;
};

const HomeTabIcon = createTabIcon(tabIcons.home);
const WalkTabIcon = createTabIcon(tabIcons.walk);
const AdoptTabIcon = createTabIcon(tabIcons.adopt);
const HealthTabIcon = createTabIcon(tabIcons.health);
const MyTabIcon = createTabIcon(tabIcons.my);

export default function TabNavigator() {
  const insets = useSafeAreaInsets();

  const tabBarTotalHeight =
    TAB_BAR_HEIGHT + insets.bottom + EXTRA_BOTTOM_PADDING;

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: true,
        tabBarLabel: TabBarLabel,
        tabBarStyle: {
          height: tabBarTotalHeight,
          display: 'flex',
          backgroundColor: '#FFFFFF',
          borderTopWidth: 0,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: 0.04,
          shadowRadius: 10,
          elevation: 6,
          paddingTop: 8,
          paddingBottom: insets.bottom + EXTRA_BOTTOM_PADDING,
        },
      }}
    >
      <Tab.Screen name="홈" component={HomeScreen} options={{ tabBarIcon: HomeTabIcon }} />
      <Tab.Screen name="산책" component={WalkScreen} options={{ tabBarIcon: WalkTabIcon }} />
      <Tab.Screen name="입양" component={AdoptScreen} options={{ tabBarIcon: AdoptTabIcon }} />
      <Tab.Screen name="건강" component={HealthScreen} options={{ tabBarIcon: HealthTabIcon }} />
      <Tab.Screen name="마이" component={MyScreen} options={{ tabBarIcon: MyTabIcon }} />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  tabLabel: {
    fontSize: 11,
    marginBottom: 3,
  },
  tabLabelFocused: {
    color: '#0081D5',
    fontWeight: '600',
  },
  tabLabelBlurred: {
    color: '#C4C4C4',
    fontWeight: '400',
  },
  tabIcon: {
    width: 24,
    height: 24,
  },
  tabIconFocused: {
    tintColor: '#0081D5',
  },
  tabIconBlurred: {
    tintColor: '#C4C4C4',
  },
});
