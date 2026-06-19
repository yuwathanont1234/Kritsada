import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';

import { LangProvider } from './src/i18n/LangContext';
import type { RootStackParamList } from './src/lib/types';
import SplashScreen from './src/screens/SplashScreen';
import LoginScreen from './src/screens/LoginScreen';
import HomeScreen from './src/screens/HomeScreen';
import AnalysisScreen from './src/screens/AnalysisScreen';
import ResultScreen from './src/screens/ResultScreen';
import RescueScreen from './src/screens/RescueScreen';
import FamilyScreen from './src/screens/FamilyScreen';
import SettingsScreen from './src/screens/SettingsScreen';

// Foreground notifications show as a banner. Both the legacy (shouldShowAlert)
// and SDK 54 (shouldShowBanner/List) fields are set for cross-version safety.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  return (
    <LangProvider>
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <NavigationContainer>
          <Stack.Navigator
            screenOptions={{ headerShown: false, animation: 'slide_from_right' }}
            initialRouteName="Splash"
          >
            <Stack.Screen name="Splash" component={SplashScreen} />
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="Home" component={HomeScreen} />
            <Stack.Screen name="Analysis" component={AnalysisScreen} />
            <Stack.Screen name="Result" component={ResultScreen} />
            <Stack.Screen name="Rescue" component={RescueScreen} />
            <Stack.Screen name="Family" component={FamilyScreen} />
            <Stack.Screen name="Settings" component={SettingsScreen} />
          </Stack.Navigator>
        </NavigationContainer>
      </SafeAreaProvider>
    </LangProvider>
  );
}
