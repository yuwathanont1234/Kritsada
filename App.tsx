import { Feather } from '@expo/vector-icons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React, { useEffect, useState } from 'react';
import { Pressable, Text } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { colors } from './src/lib/theme';
import { RootStackParamList } from './src/lib/types';
import { getMembership, getAuthUser } from './src/lib/auth';
import { supabase } from './src/lib/supabase';
import { LanguageProvider, useLanguage } from './src/lib/localization';
import { initIap, syncMembershipFromIap, listenIapChanges } from './src/lib/iap';
import { initSentry, ErrorBoundary } from './src/lib/sentry';

// Initialize crash reporting BEFORE the React tree mounts so the very
// first render is also captured if something explodes. No-op when
// EXPO_PUBLIC_SENTRY_DSN is unset — see src/lib/sentry.ts.
initSentry();

// Initialize PostHog analytics. Async because identify() needs to read
// dataConsent (AsyncStorage). No-op when EXPO_PUBLIC_POSTHOG_KEY is
// unset — see src/lib/posthog.ts.
void initPosthog();

// Configure how foreground push notifications render. Must be called
// once at module scope before any notifications arrive. Permission
// itself is requested later via the Settings toggle (engagement-
// gated). See src/lib/pushNotifications.ts for the full rationale.
configurePushHandler();

// Navigation ref so the push-notification response listener (which
// fires outside the React tree) can imperatively navigate when a user
// taps a re-engagement push from the lock screen / notification tray.
const navigationRef = createNavigationContainerRef<RootStackParamList>();

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
import { OnboardingScreen } from './src/screens/OnboardingScreen';
import { initPosthog } from './src/lib/posthog';
import { logFunnelEvent } from './src/lib/funnelEvents';
import { getUserProfile } from './src/lib/userProfile';
import { configurePushHandler } from './src/lib/pushNotifications';
import * as Notifications from 'expo-notifications';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator();

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

    // Fire app_opened acquisition event — once per launch. The is_returning_user
    // flag distinguishes first-launch (post-install) from re-opens for
    // funnel attribution. install_source is currently 'organic' as a
    // placeholder; Phase 2 will hook expo-linking for UTM parsing.
    (async () => {
      try {
        const profile = await getUserProfile();
        const isReturning = !!profile.firstSeenAt;
        await logFunnelEvent('app_opened', {
          install_source: profile.installSource ?? 'organic',
          is_returning_user: isReturning,
          language: profile.language ?? 'th',
        });
      } catch {
        /* fire-and-forget */
      }
    })();

    // Initialize IAP (RevenueCat). Use the Supabase auth UUID as appUserId —
    // it is immutable and matches the key the server-side scan ledger uses
    // (JWT sub), so entitlements and quotas describe the same identity.
    // Email is only a fallback for the __DEV__ sandbox mock login, which has
    // no Supabase session. Safe to call even when RevenueCat key is not
    // configured (degrades to mock mode).
    (async () => {
      try {
        let rcUserId: string | null = null;
        try {
          const { data } = await supabase.auth.getSession();
          rcUserId = data.session?.user?.id ?? null;
        } catch {
          /* offline cold start — fall through to local mirror */
        }
        const user = await getAuthUser();
        await initIap(rcUserId ?? user?.email ?? null);
        // Pull the latest subscription state from the store of record —
        // covers cases where a subscription expired or was refunded while
        // the app was closed.
        const syncedTier = await syncMembershipFromIap();
        if (syncedTier) setAppTierKey(syncedTier);
      } catch (e: any) {
        console.warn('[App] IAP init failed (non-fatal):', e?.message);
      }
    })();

    // Listen for real-time entitlement changes (e.g. user finishes purchase
    // in a different tab, subscription expires server-side, refund issued).
    let unsubscribeIap: (() => void) | null = null;
    listenIapChanges((tier) => {
      console.log('[App] IAP entitlement changed:', tier);
      setAppTierKey(tier);
    }).then((unsub) => {
      unsubscribeIap = unsub;
    });

    // Register global settings tier change callback
    const unsubscribe = registerUpdateTierCallback((tier) => {
      setAppTierKey(tier);
    });

    // ── Push notification tap handler ───────────────────────
    // Fires when user taps a notification from the lock screen / tray.
    // Re-engagement pushes carry a `data.trigger` field that we use to
    // deep-link into MembershipScreen with attribution intact, so the
    // resulting paywall_viewed event ties back to the campaign.
    const notifResponseSub = Notifications.addNotificationResponseReceivedListener((response) => {
      try {
        const data = (response.notification.request.content.data ?? {}) as Record<string, any>;
        const triggerFromPush: string = typeof data.trigger === 'string' ? data.trigger : 're_engagement';

        // Telemetry — wire to PostHog so we can measure CTR on
        // re-engagement campaigns. Two events fired:
        //   • push_opened — generic tap signal
        //   • re_engagement_clicked — campaign-attributed click
        logFunnelEvent('push_opened', { trigger: triggerFromPush }).catch(() => {});
        if (data.campaign === 'cart_abandonment' || data.campaign === 'free_limit') {
          logFunnelEvent('re_engagement_clicked', {
            campaign: data.campaign,
            trigger: triggerFromPush,
          }).catch(() => {});
        }

        // Imperatively navigate. Wrapped in try/catch — if the ref
        // isn't ready (cold start race condition) we silently drop
        // the navigation; the user lands on the Home screen and can
        // tap upgrade from there.
        if (navigationRef.isReady()) {
          navigationRef.navigate('Membership', { trigger: triggerFromPush });
        }
      } catch (e: any) {
        console.warn('[App] push response handler failed:', e?.message);
      }
    });

    return () => {
      unsubscribe();
      unsubscribeIap?.();
      notifResponseSub.remove();
    };
  }, []);

  return (
    <ErrorBoundary
      fallback={({ resetError }) => (
        <SafeAreaView style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: '#0A0805' }}>
          <Text style={{ color: '#D4B98C', fontSize: 18, fontWeight: '700', marginBottom: 12, textAlign: 'center' }}>
            เกิดข้อผิดพลาดที่ไม่คาดคิด
          </Text>
          <Text style={{ color: '#A0978A', fontSize: 14, marginBottom: 24, textAlign: 'center' }}>
            An unexpected error occurred. The issue has been reported automatically.
          </Text>
          <Pressable
            onPress={resetError}
            style={{ paddingVertical: 12, paddingHorizontal: 28, borderWidth: 1, borderColor: '#D4B98C', borderRadius: 6 }}
          >
            <Text style={{ color: '#D4B98C', fontWeight: '700', letterSpacing: 2 }}>RESTART</Text>
          </Pressable>
        </SafeAreaView>
      )}
    >
    <LanguageProvider>
      <SafeAreaProvider>
        <NavigationContainer ref={navigationRef} key={appTierKey}>
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
            <Stack.Screen name="Onboarding" component={OnboardingScreen} />
            <Stack.Screen name="Main" component={MainTabNavigator} />

            <Stack.Screen name="Scan" component={ScanScreen} />
            <Stack.Screen name="Loading" component={LoadingScreen} />
            <Stack.Screen name="Result" component={ResultScreen} />

            {/* Core App Upgrade Screens */}
            <Stack.Screen name="Membership" component={MembershipScreen} />

            {/* Utilities */}
            <Stack.Screen name="Info" component={InfoScreen} />
            <Stack.Screen name="Game" component={GameScreen} />
            {/* 19 "Phase 2" DummyScreen stub routes removed 2026-06-10 —
                18 were unreachable; the one reachable entry (Profile, from
                the Result header) was a dead end and its button is gone.
                Re-register a route when its real screen ships. */}
          </Stack.Navigator>
        </NavigationContainer>
      </SafeAreaProvider>
    </LanguageProvider>
    </ErrorBoundary>
  );
}
