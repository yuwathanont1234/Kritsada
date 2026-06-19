import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors, spacing, radius, typography } from '../lib/theme';
import { getCurrentEmail, isAuthenticated, logout } from '../lib/auth';
import { useLang } from '../i18n/LangContext';
import type { Language } from '../i18n/strings';
import type { RootStackParamList } from '../lib/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Settings'>;

export default function SettingsScreen({ navigation }: Props) {
  const { t, lang, setLang } = useLang();
  const [email, setEmail] = useState<string | null>(null);
  const [authed, setAuthed] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        const a = await isAuthenticated();
        if (!active) return;
        setAuthed(a);
        setEmail(a ? await getCurrentEmail() : null);
      })();
      return () => {
        active = false;
      };
    }, [])
  );

  const handleLogout = async () => {
    await logout();
    setAuthed(false);
    setEmail(null);
  };

  const LangOption = ({ value, label }: { value: Language; label: string }) => (
    <Pressable
      style={[styles.langOption, lang === value && styles.langOptionActive]}
      onPress={() => setLang(value)}
    >
      <Text style={[styles.langLabel, lang === value && styles.langLabelActive]}>{label}</Text>
      {lang === value && <Text style={styles.check}>✓</Text>}
    </Pressable>
  );

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Pressable onPress={() => navigation.goBack()} style={styles.back}>
          <Text style={styles.backLabel}>‹ {t('common.back')}</Text>
        </Pressable>

        <Text style={styles.title}>{t('settings.title')}</Text>

        {/* Language */}
        <Text style={styles.sectionTitle}>{t('settings.language')}</Text>
        <View style={styles.card}>
          <LangOption value="th" label={t('settings.thai')} />
          <View style={styles.divider} />
          <LangOption value="en" label={t('settings.english')} />
        </View>

        {/* Account */}
        <Text style={styles.sectionTitle}>{t('settings.account')}</Text>
        <View style={styles.card}>
          <Text style={styles.accountLabel}>
            {authed ? t('settings.loggedInAs') : t('settings.notLoggedIn')}
          </Text>
          {!!email && <Text style={styles.accountEmail}>{email}</Text>}
          {authed ? (
            <Pressable style={styles.logoutBtn} onPress={handleLogout}>
              <Text style={styles.logoutText}>{t('settings.logout')}</Text>
            </Pressable>
          ) : (
            <Pressable style={styles.loginBtn} onPress={() => navigation.navigate('Login')}>
              <Text style={styles.loginText}>{t('settings.login')}</Text>
            </Pressable>
          )}
        </View>

        <Text style={styles.version}>
          {t('app.name')} · {t('settings.version')} 1.0.0
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl },
  back: { marginBottom: spacing.md },
  backLabel: { ...typography.body, color: colors.primary },
  title: { ...typography.h1, marginBottom: spacing.lg },
  sectionTitle: { ...typography.small, color: colors.textMuted, marginBottom: spacing.sm, marginTop: spacing.md },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  langOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
  },
  langOptionActive: { backgroundColor: colors.primaryLight },
  langLabel: { ...typography.body },
  langLabelActive: { color: colors.primary, fontWeight: '700' },
  check: { color: colors.primary, fontWeight: '800', fontSize: 16 },
  divider: { height: 1, backgroundColor: colors.divider },
  accountLabel: { ...typography.caption, padding: spacing.md, paddingBottom: 0 },
  accountEmail: { ...typography.bodyBold, paddingHorizontal: spacing.md, paddingTop: 4 },
  logoutBtn: { margin: spacing.md, paddingVertical: 12, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.red, alignItems: 'center' },
  logoutText: { fontSize: 14, fontWeight: '700', color: colors.red },
  loginBtn: { margin: spacing.md, paddingVertical: 12, borderRadius: radius.sm, backgroundColor: colors.primary, alignItems: 'center' },
  loginText: { fontSize: 14, fontWeight: '700', color: colors.textOnPrimary },
  version: { ...typography.small, color: colors.textMuted, textAlign: 'center', marginTop: spacing.xl },
});
