import { Feather } from '@expo/vector-icons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import { Pressable, Text } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { colors } from './src/lib/theme';
import { RootStackParamList } from './src/lib/types';
import { getMembership } from './src/lib/auth';
import { LanguageProvider, useLanguage } from './src/lib/localization';

// Core Screens
import SplashScreen from './src/screens/SplashScreen';
import LoginScreen from './src/screens/OtpScreen';
import HomeScreen from './src/screens/HomeScreen';
import CollectionScreen from './src/screens/ProfileScreen';
import PortfolioScreen from './src/screens/PortfolioScreen';
import SettingsScreen, { registerUpdateTierCallback } from './src/screens/SettingsScreen';
import MembershipScreen from './src/screens/MembershipScreen';
import InfoScreen from './src/screens/InfoScreen';
import GameScreen from './src/screens/GameScreen';
import { ScanScreen } from './src/screens/ScanScreen';
import { LoadingScreen } from './src/screens/LoadingScreen';
import { ResultScreen } from './src/screens/ResultScreen';
import { MagazineScreen } from './src/screens/MagazineScreen';

import { styles } from './src/screens/AppStyles';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator();

// Additional stubs for other unused routes
const DummyScreen = (title: string) => ({ navigation }: any) => (
  <SafeAreaView style={styles.stubContainer}>
    <Text style={styles.stubTitle}>{title}</Text>
    <Text style={styles.stubDetails}>This feature is scheduled for release in the upcoming Phase 2 updates.</Text>
    <Pressable style={styles.stubCloseBtn} onPress={() => navigation.goBack()}>
      <Text style={styles.stubCloseBtnText}>RETURN</Text>
    </Pressable>
  </SafeAreaView>
);

// Tab Navigator Setup
function MainTabNavigator() {
  const { t } = useLanguage();
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#0F0C09',
          borderTopWidth: 1,
          borderTopColor: colors.border,
          height: 64,
          paddingBottom: 8,
          paddingTop: 8,
        },
        tabBarActiveTintColor: colors.amber,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarIcon: ({ color, size }) => {
          let iconName: any = 'home';
          if (route.name === 'Home') iconName = 'home';
          else if (route.name === 'Collection') iconName = 'briefcase';
          else if (route.name === 'Portfolio') iconName = 'pie-chart';
          else if (route.name === 'Learn') iconName = 'book-open';
          else if (route.name === 'Settings') iconName = 'settings';
          return <Feather name={iconName} size={size} color={color} />;
        },
        tabBarAccessibilityLabel: (() => {
          if (route.name === 'Home') return t('a11y.tabHome');
          if (route.name === 'Collection') return t('a11y.tabVault');
          if (route.name === 'Portfolio') return t('a11y.tabPortfolio');
          if (route.name === 'Learn') return t('a11y.tabLearn');
          if (route.name === 'Settings') return t('a11y.tabSettings');
          return undefined;
        })(),
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} options={{ tabBarLabel: t('tabs.home') }} />
      <Tab.Screen name="Collection" component={CollectionScreen} options={{ tabBarLabel: t('tabs.collection') }} />
      <Tab.Screen name="Portfolio" component={PortfolioScreen} options={{ tabBarLabel: t('tabs.portfolio') }} />
      <Tab.Screen name="Learn" component={MagazineScreen} options={{ tabBarLabel: t('tabs.learn') }} />
      <Tab.Screen name="Settings" component={SettingsScreen} options={{ tabBarLabel: t('tabs.settings') }} />
    </Tab.Navigator>
  );
}

export default function App() {
  const [appTierKey, setAppTierKey] = useState<string>('free');

  useEffect(() => {
    // Sync active tier for navigation container rebuilding on dev bar switches
    getMembership().then((m) => {
      setAppTierKey(m.tier);
    });

    // Register global settings tier change callback
    const unsubscribe = registerUpdateTierCallback((tier) => {
      setAppTierKey(tier);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  return (
    <LanguageProvider>
      <SafeAreaProvider>
        <NavigationContainer key={appTierKey}>
          <Stack.Navigator
            screenOptions={{
              headerShown: false,
              animation: 'slide_from_right',
            }}
            initialRouteName="Splash"
          >
            {/* Main Core Scanning Flow */}
            <Stack.Screen name="Splash" component={SplashScreen} />
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="Main" component={MainTabNavigator} />
            
            <Stack.Screen name="Scan" component={ScanScreen} />
            <Stack.Screen name="Loading" component={LoadingScreen} />
            <Stack.Screen name="Result" component={ResultScreen} />

            {/* Core App Upgrade Screens */}
            <Stack.Screen name="Membership" component={MembershipScreen} />
            <Stack.Screen name="Subscription" component={MembershipScreen} />

            {/* Sub-Stubs and Utilities */}
            <Stack.Screen name="Info" component={InfoScreen} />
            <Stack.Screen name="Game" component={GameScreen} />
            <Stack.Screen name="RefCompare" component={DummyScreen('Horological Comparison')} />
            <Stack.Screen name="ResultDetail" component={DummyScreen('In-Depth Authentication Analytics')} />
            <Stack.Screen name="CollectionGoals" component={DummyScreen('Collector Portfolio Milestones')} />
            <Stack.Screen name="Transactions" component={DummyScreen('Asset Transactions Log')} />
            <Stack.Screen name="TrayDetail" component={DummyScreen('Brand Vault Trays')} />
            <Stack.Screen name="Articles" component={DummyScreen('Horology Academy')} />
            <Stack.Screen name="ArticleDetail" component={DummyScreen('Academy Article')} />
            <Stack.Screen name="News" component={DummyScreen('Industry News')} />
            <Stack.Screen name="DeviceInfo" component={DummyScreen('System Diagnostics')} />
            <Stack.Screen name="PrivacySettings" component={DummyScreen('Privacy Preferences')} />
            <Stack.Screen name="ManageAccount" component={DummyScreen('Collector Profile Credentials')} />
            <Stack.Screen name="Profile" component={DummyScreen('User Portfolio Profile')} />
            <Stack.Screen name="ImageCredits" component={DummyScreen('Scan Credits & Entitlements')} />
            <Stack.Screen name="AIQA" component={DummyScreen('AI Horology Inquiries')} />
            <Stack.Screen name="AuthGuide" component={DummyScreen('Authenticity Reference Library')} />
            <Stack.Screen name="AuthGuideList" component={DummyScreen('Reference Library Index')} />
            <Stack.Screen name="AdminDashboard" component={DummyScreen('System Administrator Console')} />
            <Stack.Screen name="ErrorReport" component={DummyScreen('Diagnostic Error Report')} />
            <Stack.Screen name="Capture" component={DummyScreen('Timepiece Image Capture')} />
          </Stack.Navigator>
        </NavigationContainer>
      </SafeAreaProvider>
    </LanguageProvider>
  );
}
