import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';

import { LangProvider, useLang } from './src/i18n/LangContext';
import { colors } from './src/lib/theme';
import type { RootStackParamList, TabParamList } from './src/lib/types';
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
const Tab = createBottomTabNavigator<TabParamList>();

type TabIconProps = { label: string; emoji: string; focused: boolean };

function TabIcon({ label, emoji, focused }: TabIconProps) {
  return (
    <View style={[tabStyles.wrap, focused && tabStyles.wrapFocused]}>
      <Text style={tabStyles.emoji}>{emoji}</Text>
      <Text style={[tabStyles.label, focused && tabStyles.labelFocused]}>{label}</Text>
    </View>
  );
}

function MainTabs() {
  const { t } = useLang();
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarStyle: tabStyles.bar,
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon label={t('tab.home')} emoji="🛡️" focused={focused} />
          ),
        }}
      />
      <Tab.Screen
        name="Family"
        component={FamilyScreen}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon label={t('tab.family')} emoji="👨‍👩‍👧‍👦" focused={focused} />
          ),
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon label={t('tab.settings')} emoji="⚙️" focused={focused} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}

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
            <Stack.Screen
              name="MainTabs"
              component={MainTabs}
              options={{ animation: 'fade' }}
            />
            <Stack.Screen name="Analysis" component={AnalysisScreen} />
            <Stack.Screen name="Result" component={ResultScreen} />
            <Stack.Screen name="Rescue" component={RescueScreen} />
          </Stack.Navigator>
        </NavigationContainer>
      </SafeAreaProvider>
    </LangProvider>
  );
}

const tabStyles = StyleSheet.create({
  bar: {
    height: 64,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
    paddingTop: 0,
    paddingBottom: 0,
  },
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: 12,
    minWidth: 64,
    minHeight: 48,
  },
  wrapFocused: {
    backgroundColor: colors.primaryLight,
  },
  emoji: { fontSize: 22, marginBottom: 2 },
  label: { fontSize: 10, color: colors.textMuted, fontWeight: '500' },
  labelFocused: { color: colors.primary, fontWeight: '700' },
});
