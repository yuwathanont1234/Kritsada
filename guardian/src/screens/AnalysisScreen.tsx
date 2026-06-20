import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, Easing, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as Crypto from 'expo-crypto';
import { colors, spacing, radius, typography } from '../lib/theme';
import { analyzeContent, saveRecentCheck } from '../lib/analysis';
import { useLang } from '../i18n/LangContext';
import type { RootStackParamList } from '../lib/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Analysis'>;

const STEP_KEYS = ['analysis.step1', 'analysis.step2', 'analysis.step3'] as const;

export default function AnalysisScreen({ route, navigation }: Props) {
  const { t } = useLang();
  const { content, content_type, identifiers = [] } = route.params;
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const spin = useRef(new Animated.Value(0)).current;

  // Spinner — runs once and loops forever.
  useEffect(() => {
    const anim = Animated.loop(
      Animated.timing(spin, { toValue: 1, duration: 1400, easing: Easing.linear, useNativeDriver: true })
    );
    anim.start();
    return () => anim.stop();
  }, [spin]);

  // Visual step progression resets on each retry.
  useEffect(() => {
    setStep(0);
    const a = setTimeout(() => setStep(1), 1100);
    const b = setTimeout(() => setStep(2), 2600);
    return () => {
      clearTimeout(a);
      clearTimeout(b);
    };
  }, [retryCount]);

  // Fire the analysis on mount and on each retry.
  useEffect(() => {
    let cancelled = false;
    analyzeContent({ content, content_type, identifiers })
      .then(async (response) => {
        if (cancelled) return;
        if (!response?.risk_level || !Array.isArray(response?.red_flags)) {
          throw new Error('invalid_response');
        }
        const preview = content_type === 'text' ? content.slice(0, 80).trim() : '[ภาพ / Image]';
        await saveRecentCheck({
          id: Crypto.randomUUID(),
          created_at: new Date().toISOString(),
          content_preview: preview,
          risk_level: response.risk_level,
          red_flag_count: response.red_flags.length,
        });
        navigation.replace('Result', { response, content_preview: preview });
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err?.message || 'error');
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retryCount]);

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  if (error) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <Text style={styles.errorIcon}>⚠️</Text>
          <Text style={styles.errorTitle}>{t('error.title')}</Text>
          <Text style={styles.errorMsg}>{t('error.analysisFailed')}</Text>
          <Pressable
            style={styles.retryBtn}
            onPress={() => { setError(null); setRetryCount((c) => c + 1); }}
          >
            <Text style={styles.retryLabel}>{t('error.retry')}</Text>
          </Pressable>
          <Pressable style={styles.backLink} onPress={() => navigation.goBack()}>
            <Text style={styles.backLinkLabel}>‹ {t('common.back')}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.center}>
        <Animated.Text style={[styles.spinner, { transform: [{ rotate }] }]}>🛡️</Animated.Text>
        <Text style={styles.title}>{t('analysis.title')}</Text>
        <View style={styles.steps}>
          {STEP_KEYS.map((key, idx) => (
            <View key={key} style={[styles.stepRow, step >= idx && styles.stepActive]}>
              <Text style={styles.stepDot}>{step > idx ? '✓' : step === idx ? '▶' : '○'}</Text>
              <Text style={styles.stepLabel}>{t(key)}</Text>
            </View>
          ))}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  spinner: { fontSize: 60, marginBottom: spacing.xl },
  title: { ...typography.h2, marginBottom: spacing.xl, textAlign: 'center' },
  steps: { alignSelf: 'stretch', paddingHorizontal: spacing.lg },
  stepRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md, opacity: 0.35 },
  stepActive: { opacity: 1 },
  stepDot: { fontSize: 15, marginRight: spacing.md, color: colors.primary, width: 18 },
  stepLabel: { ...typography.body, color: colors.textSecondary },
  errorIcon: { fontSize: 52, marginBottom: spacing.md },
  errorTitle: { ...typography.h2, color: colors.red, marginBottom: spacing.sm },
  errorMsg: { ...typography.body, color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.xl },
  retryBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 14,
    paddingHorizontal: spacing.xl,
  },
  retryLabel: { fontSize: 15, fontWeight: '700', color: colors.textOnPrimary },
  backLink: { marginTop: spacing.md },
  backLinkLabel: { ...typography.body, color: colors.textMuted },
});
