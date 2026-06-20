import React from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors, spacing, radius, typography } from '../lib/theme';
import { useLang } from '../i18n/LangContext';
import type { RootStackParamList } from '../lib/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Rescue'>;

export default function RescueScreen({ navigation }: Props) {
  const { t } = useLang();

  const call1441 = () => Linking.openURL('tel:1441').catch(() => {});
  const openReport = () => Linking.openURL('https://www.thaipoliceonline.go.th').catch(() => {});

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Pressable onPress={() => navigation.goBack()} style={styles.back}>
          <Text style={styles.backLabel}>‹ {t('common.back')}</Text>
        </Pressable>

        <Text style={styles.title}>{t('rescue.title')}</Text>
        <Text style={styles.intro}>{t('rescue.intro')}</Text>

        {/* 1. Hotline — the single most important action, big and red */}
        <Pressable style={styles.hotlineBtn} onPress={call1441}>
          <Text style={styles.hotlineIcon}>📞</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.hotlineLabel}>{t('rescue.call1441')}</Text>
            <Text style={styles.hotlineDesc}>{t('rescue.call1441Desc')}</Text>
          </View>
        </Pressable>

        {/* 2. Freeze accounts */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>🏦 {t('rescue.freezeTitle')}</Text>
          <Text style={styles.step}>{t('rescue.freezeStep1')}</Text>
          <Text style={styles.step}>{t('rescue.freezeStep2')}</Text>
          <Text style={styles.step}>{t('rescue.freezeStep3')}</Text>
        </View>

        {/* 3. Report online */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>📝 {t('rescue.reportTitle')}</Text>
          <Text style={styles.cardBody}>{t('rescue.reportDesc')}</Text>
          <Pressable style={styles.linkBtn} onPress={openReport}>
            <Text style={styles.linkBtnText}>{t('rescue.reportLink')}</Text>
          </Pressable>
        </View>

        {/* 4. Talking to an elder */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>💬 {t('rescue.scriptTitle')}</Text>
          <Text style={styles.cardBody}>{t('rescue.scriptBody')}</Text>
        </View>

        {/* 5. Keep a timeline */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>🗂️ {t('rescue.timelineTitle')}</Text>
          <Text style={styles.cardBody}>{t('rescue.timelineDesc')}</Text>
        </View>

        <Pressable style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.backBtnLabel}>{t('rescue.backToResult')}</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl },
  back: { marginBottom: spacing.md },
  backLabel: { ...typography.body, color: colors.primary },
  title: { ...typography.h1, marginBottom: spacing.sm },
  intro: { ...typography.body, color: colors.textSecondary, marginBottom: spacing.lg, lineHeight: 24 },
  hotlineBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.red,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  hotlineIcon: { fontSize: 32, marginRight: spacing.md },
  hotlineLabel: { fontSize: 18, fontWeight: '800', color: colors.textOnPrimary, marginBottom: 4 },
  hotlineDesc: { fontSize: 13, color: 'rgba(255,255,255,0.9)', lineHeight: 19 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  cardTitle: { ...typography.h3, marginBottom: spacing.sm },
  cardBody: { ...typography.body, color: colors.textSecondary, lineHeight: 24 },
  step: { ...typography.body, color: colors.textSecondary, lineHeight: 24, marginBottom: 6 },
  linkBtn: {
    marginTop: spacing.md,
    backgroundColor: colors.primaryLight,
    borderRadius: radius.sm,
    paddingVertical: 12,
    alignItems: 'center',
  },
  linkBtnText: { fontSize: 14, fontWeight: '700', color: colors.primary },
  backBtn: {
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  backBtnLabel: { fontSize: 15, fontWeight: '700', color: colors.primary },
});
