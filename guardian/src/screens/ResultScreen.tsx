import React, { useCallback } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, Share } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors, spacing, radius, typography } from '../lib/theme';
import { RiskBadge } from '../components/RiskBadge';
import { RedFlagCard } from '../components/RedFlagCard';
import { WhatToDoSection } from '../components/WhatToDoSection';
import { useLang } from '../i18n/LangContext';
import type { RiskLevel, Layer1Status, RootStackParamList } from '../lib/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Result'>;

const RISK_COLOR: Record<RiskLevel, { border: string; bg: string }> = {
  RED: { border: colors.red, bg: colors.redLight },
  YELLOW: { border: colors.yellow, bg: colors.yellowLight },
  GREEN: { border: colors.green, bg: colors.greenLight },
};

export default function ResultScreen({ route, navigation }: Props) {
  const { t } = useLang();
  const { response } = route.params;
  const {
    risk_level,
    layer1_status,
    ai_score,
    red_flags,
    what_to_do,
    summary,
    from_cache,
    disclaimer,
  } = response;

  const riskLabel: Record<RiskLevel, string> = {
    RED: t('result.red'),
    YELLOW: t('result.yellow'),
    GREEN: t('result.green'),
  };

  const riskDesc: Record<RiskLevel, string> = {
    RED: t('result.redDesc'),
    YELLOW: t('result.yellowDesc'),
    GREEN: t('result.greenDesc'),
  };

  const layer1Label: Record<Layer1Status, string> = {
    BAD: t('result.layer1Bad'),
    LICENSED: t('result.layer1Licensed'),
    UNKNOWN: t('result.layer1Unknown'),
  };

  const handleShare = useCallback(async () => {
    const flagLines = red_flags.map((f) => `• ${f.headline}`).join('\n');
    const lines = [
      `🛡️ ${t('app.name')} — ${t('result.shareText')}`,
      `${riskLabel[risk_level]} (${ai_score}/100)`,
      flagLines ? `\n${t('result.flagsTitle')}:\n${flagLines}` : '',
      `\n${what_to_do}`,
    ].filter(Boolean);
    await Share.share({ message: lines.join('\n') }).catch(() => {});
  }, [risk_level, ai_score, red_flags, what_to_do, riskLabel, t]);

  const rc = RISK_COLOR[risk_level];

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.topRow}>
          <Pressable onPress={() => navigation.goBack()} style={styles.back}>
            <Text style={styles.backLabel}>‹ {t('common.back')}</Text>
          </Pressable>
          <Pressable onPress={handleShare} style={styles.shareBtn}>
            <Text style={styles.shareIcon}>⬆️</Text>
            <Text style={styles.shareText}>{t('result.share')}</Text>
          </Pressable>
        </View>

        {/* Risk card */}
        <View style={[styles.riskCard, { borderColor: rc.border, backgroundColor: rc.bg }]}>
          <RiskBadge level={risk_level} size="lg" />
          <Text style={styles.riskDesc}>{riskDesc[risk_level]}</Text>
          {!!summary && <Text style={styles.summary}>{summary}</Text>}
        </View>

        {/* Meta */}
        <View style={styles.metaRow}>
          <View style={styles.metaBox}>
            <Text style={styles.metaLabel}>{t('result.score')}</Text>
            <Text style={styles.metaValue}>{ai_score}/100</Text>
          </View>
          <View style={styles.metaBox}>
            <Text style={styles.metaLabel}>{t('result.layer1Status')}</Text>
            <Text style={styles.metaValue}>{layer1Label[layer1_status]}</Text>
          </View>
        </View>

        {from_cache && <Text style={styles.cacheNote}>{t('result.cacheNote')}</Text>}

        {/* Rescue entry — only when high risk */}
        {risk_level === 'RED' && (
          <Pressable style={styles.rescueBtn} onPress={() => navigation.navigate('Rescue')}>
            <Text style={styles.rescueIcon}>🆘</Text>
            <Text style={styles.rescueLabel}>{t('result.rescueButton')}</Text>
            <Text style={styles.rescueArrow}>›</Text>
          </Pressable>
        )}

        {/* Red flags */}
        <Text style={styles.sectionTitle}>{t('result.flagsTitle')}</Text>
        {red_flags.length === 0 ? (
          <Text style={styles.noFlags}>{t('result.noFlags')}</Text>
        ) : (
          red_flags.map((flag, i) => <RedFlagCard key={i} flag={flag} />)
        )}

        {/* What to do */}
        <View style={{ marginTop: spacing.md }}>
          <WhatToDoSection text={what_to_do} riskLevel={risk_level} />
        </View>

        {/* Disclaimer */}
        {!!disclaimer && <Text style={styles.disclaimer}>{disclaimer}</Text>}

        {/* Check again */}
        <Pressable style={styles.againBtn} onPress={() => navigation.navigate('MainTabs', { screen: 'Home' })}>
          <Text style={styles.againLabel}>{t('result.checkAgain')}</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  back: {},
  backLabel: { ...typography.body, color: colors.primary },
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primaryLight,
    borderRadius: radius.sm,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  shareIcon: { fontSize: 14, marginRight: 4 },
  shareText: { fontSize: 13, fontWeight: '700', color: colors.primary },
  riskCard: {
    borderRadius: radius.lg,
    borderWidth: 2,
    padding: spacing.lg,
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  riskDesc: { ...typography.bodyBold, textAlign: 'center', marginTop: spacing.md },
  summary: { ...typography.body, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.sm },
  metaRow: { flexDirection: 'row', marginBottom: spacing.md },
  metaBox: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    marginHorizontal: 4,
  },
  metaLabel: { ...typography.small, marginBottom: 4, textAlign: 'center' },
  metaValue: { ...typography.bodyBold, textAlign: 'center' },
  cacheNote: { ...typography.small, textAlign: 'center', color: colors.textMuted, marginBottom: spacing.sm },
  rescueBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.red,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  rescueIcon: { fontSize: 22, marginRight: spacing.sm },
  rescueLabel: { flex: 1, fontSize: 15, fontWeight: '700', color: colors.textOnPrimary },
  rescueArrow: { fontSize: 24, color: colors.textOnPrimary },
  sectionTitle: { ...typography.h3, marginTop: spacing.md, marginBottom: spacing.sm },
  noFlags: { ...typography.body, color: colors.textMuted, marginBottom: spacing.sm },
  disclaimer: {
    ...typography.small,
    color: colors.textMuted,
    textAlign: 'center',
    marginVertical: spacing.lg,
    lineHeight: 18,
  },
  againBtn: {
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 15,
    alignItems: 'center',
  },
  againLabel: { fontSize: 15, fontWeight: '700', color: colors.primary },
});
