import React, { useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors, spacing } from '../lib/theme';
import { isAuthenticated } from '../lib/auth';
import { registerForPush } from '../lib/notifications';
import { useLang } from '../i18n/LangContext';
import type { RootStackParamList } from '../lib/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Splash'>;

export default function SplashScreen({ navigation }: Props) {
  const { t } = useLang();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Checking scams never requires login; we only refresh the push token if
      // a session already exists, then land on Home.
      const authed = await isAuthenticated();
      if (authed) registerForPush().catch(() => {});
      setTimeout(() => {
        if (!cancelled) navigation.replace('Home');
      }, 600);
    })();
    return () => {
      cancelled = true;
    };
  }, [navigation]);

  return (
    <View style={styles.container}>
      <Text style={styles.logo}>🛡️</Text>
      <Text style={styles.name}>{t('app.name')}</Text>
      <Text style={styles.tagline}>{t('app.tagline')}</Text>
      <ActivityIndicator color={colors.textOnPrimary} style={{ marginTop: spacing.xl }} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  logo: { fontSize: 72, marginBottom: spacing.lg },
  name: { fontSize: 32, fontWeight: '800', color: colors.textOnPrimary, marginBottom: spacing.sm },
  tagline: { fontSize: 14, color: 'rgba(255,255,255,0.85)', textAlign: 'center', lineHeight: 22 },
});
