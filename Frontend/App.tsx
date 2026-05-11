/**
 * Sample React Native App
 * https://github.com/facebook/react-native
 *
 * @format
 */

import React from 'react';
import { StatusBar, useColorScheme } from 'react-native';
import {
  NavigationContainer,
  DefaultTheme,
} from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import LoginScreen from './src/screens/LoginScreen';
import OrdinaryLogin from './src/screens/OrdinaryLogin';
import OrdinarySignup from './src/screens/OrdinarySignup';
import UserSignup from './src/screens/UserSignup';
import PetSignup from './src/screens/PetSignup';
import TabNavigator from './src/navigation/TabBar';
import AnimalDetailScreen from './src/screens/AnimalDetailScreen';
import SymptomResultScreen from './src/screens/SymptomResultScreen';
import EyeDiagnosisScreen from './src/screens/EyeDiagnosisScreen';
import UrineDiagnosisScreen from './src/screens/UrineDiagnosisScreen';
import MyPageScreen from './src/screens/MyPageScreen';
import GameScreen from './src/screens/GameScreen';
import PetEditScreen from './src/screens/PetEditScreen';
import ProfileEditScreen from './src/screens/ProfileEditScreen';
import WalkLogDetailScreen from './src/screens/WalkLogDetailScreen';
import WalkWeeklyReportScreen from './src/screens/WalkWeeklyReportScreen';
import WalkActiveScreen from './src/screens/WalkActiveScreen';

export type RootStackParamList = {
  Login: undefined;
  Home: undefined;
  OrdinaryLogin: undefined;
  OrdinarySignup: undefined;
  SymptomResult: undefined;
  EyeDiagnosis: undefined;
  UrineDiagnosis: undefined;
  MyPage: undefined;
  GameScreen: undefined;
  ProfileEdit: undefined;

  PetEdit: {
    petId: number;
  };

  UserSignup: {
    email: string;
    password: string;
    verificationCode: string;
  };

  PetSignup: {
    mode?: 'add';
    email?: string;
    password?: string;
    verificationCode?: string;
    nickname?: string;
    profileImage?: string | null;
  };

  Main: undefined;

  AnimalDetail: {
    animalData: {
      id?: number;
      shelterId?: number;
      shelterName?: string;
      shelterPhone?: string;
      type: '강아지' | '고양이';
      tags: string[];
      breed: string;
      age: string;
      location: string;
      image: any;
    };
  };

  WalkLogDetail: {
    record: {
      id: number;
      petName: string;
      petImage: any;
      date: string;
      distance: string;
      duration: string;
      startTime?: string;
      endTime?: string;
    };
  };

  WalkWeeklyReport: undefined;

  WalkActive: {
    petName: string;
    petImage: any;
  };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

const AppTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: '#FFFFFF',
    card: '#FFFFFF',
  },
};

function AppNavigator() {
  const colorScheme = useColorScheme();

  return (
    <NavigationContainer theme={AppTheme}>
      <StatusBar
        backgroundColor="#FFFFFF"
        barStyle={colorScheme === 'dark' ? 'light-content' : 'dark-content'}
      />

      <Stack.Navigator
        initialRouteName="Login"
        screenOptions={{
          headerShown: false,
          contentStyle: {
            backgroundColor: '#FFFFFF',
          },
        }}
      >
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="OrdinaryLogin" component={OrdinaryLogin} />
        <Stack.Screen name="OrdinarySignup" component={OrdinarySignup} />
        <Stack.Screen name="UserSignup" component={UserSignup} />
        <Stack.Screen name="PetSignup" component={PetSignup} />
        <Stack.Screen name="Main" component={TabNavigator} />
        <Stack.Screen name="AnimalDetail" component={AnimalDetailScreen} />
        <Stack.Screen name="SymptomResult" component={SymptomResultScreen} />
        <Stack.Screen name="EyeDiagnosis" component={EyeDiagnosisScreen} />
        <Stack.Screen name="UrineDiagnosis" component={UrineDiagnosisScreen} />
        <Stack.Screen name="MyPage" component={MyPageScreen} />
        <Stack.Screen name="GameScreen" component={GameScreen} />
        <Stack.Screen name="PetEdit" component={PetEditScreen} />
        <Stack.Screen name="ProfileEdit" component={ProfileEditScreen} />
        <Stack.Screen name="WalkLogDetail" component={WalkLogDetailScreen} />
        <Stack.Screen name="WalkWeeklyReport" component={WalkWeeklyReportScreen} />
        <Stack.Screen name="WalkActive" component={WalkActiveScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

function App() {
  return (
    <SafeAreaProvider style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
      <AppNavigator />
    </SafeAreaProvider>
  );
}

export default App;