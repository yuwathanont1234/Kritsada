import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as Clipboard from 'expo-clipboard';
import { colors, spacing, radius, typography } from '../lib/theme';
import { isAuthenticated, getCurrentUserId } from '../lib/auth';
import {
  createInvite,
  redeemInvite,
  listFamilyLinks,
  setNotifyOn,
  removeLink,
} from '../lib/family';
import { registerForPush } from '../lib/notifications';
import { useLang } from '../i18n/LangContext';
import type { FamilyLink, RootStackParamList } from '../lib/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Family'>;

export default function FamilyScreen({ navigation }: Props) {
  const { t } = useLang();
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [myUid, setMyUid] = useState<string | null>(null);
  const [links, setLinks] = useState<FamilyLink[]>([]);
  const [createdCode, setCreatedCode] = useState<string | null>(null);
  const [codeInput, setCodeInput] = useState('');
  const [busy, setBusy] = useState(false);

  const refreshLinks = useCallback(async () => {
    try {
      setLinks(await listFamilyLinks());
    } catch {
      /* ignore */
    }
  }, []);

  const load = useCallback(async () => {
    const a = await isAuthenticated();
    setAuthed(a);
    if (!a) return;
    setMyUid(await getCurrentUserId());
    registerForPush().catch(() => {});
    await refreshLinks();
  }, [refreshLinks]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const handleCreate = async () => {
    setBusy(true);
    try {
      const link = await createInvite();
      setCreatedCode(link.invite_code);
      await refreshLinks();
    } catch (e: any) {
      Alert.alert(t('error.title'), e?.message || t('error.networkFailed'));
    } finally {
      setBusy(false);
    }
  };

  const handleCopy = async () => {
    if (!createdCode) return;
    await Clipboard.setStringAsync(createdCode);
    Alert.alert('', t('family.copied'));
  };

  const handleRedeem = async () => {
    if (codeInput.trim().length < 8) {
      Alert.alert('', t('family.codeRequired'));
      return;
    }
    setBusy(true);
    try {
      await redeemInvite(codeInput);
      setCodeInput('');
      Alert.alert('', t('family.redeemSuccess'));
      await refreshLinks();
    } catch (e: any) {
      const msg =
        e?.message === 'cannot_link_self' ? t('error.cannotLinkSelf') : t('error.redeemFailed');
      Alert.alert(t('error.title'), msg);
    } finally {
      setBusy(false);
    }
  };

  const toggleNotify = async (link: FamilyLink) => {
    const has = Array.isArray(link.notify_on) && link.notify_on.includes('RED');
    try {
      await setNotifyOn(link.id, has ? [] : ['RED']);
      await refreshLinks();
    } catch {
      Alert.alert(t('error.title'), t('error.networkFailed'));
    }
  };

  const handleRemove = (link: FamilyLink) => {
    Alert.alert(t('family.removeTitle'), t('family.removeConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('family.remove'),
        style: 'destructive',
        onPress: async () => {
          try {
            await removeLink(link.id);
            await refreshLinks();
          } catch {
            Alert.alert(t('error.title'), t('error.networkFailed'));
          }
        },
      },
    ]);
  };

  // ── Not signed in ──────────────────────────────────────────────
  if (authed === false) {
    return (
      <SafeAreaView style={styles.safe}>
        <Pressable onPress={() => navigation.goBack()} style={styles.back}>
          <Text style={styles.backLabel}>‹ {t('common.back')}</Text>
        </Pressable>
        <View style={styles.center}>
          <Text style={styles.icon}>👨‍👩‍👧‍👦</Text>
          <Text style={styles.title}>{t('family.title')}</Text>
          <Text style={styles.gateText}>{t('family.loginRequired')}</Text>
          <Pressable style={styles.primaryBtn} onPress={() => navigation.navigate('Login')}>
            <Text style={styles.primaryBtnText}>{t('family.loginCta')}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  // ── Loading ────────────────────────────────────────────────────
  if (authed === null) {
    return (
      <SafeAreaView style={styles.safe}>
        <Pressable onPress={() => navigation.goBack()} style={styles.back}>
          <Text style={styles.backLabel}>‹ {t('common.back')}</Text>
        </Pressable>
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  // ── Signed in ──────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Pressable onPress={() => navigation.goBack()} style={styles.back}>
          <Text style={styles.backLabel}>‹ {t('common.back')}</Text>
        </Pressable>

        <Text style={styles.title}>{t('family.title')}</Text>
        <Text style={styles.intro}>{t('family.intro')}</Text>

        {/* Guardian: create invite */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('family.createInviteTitle')}</Text>
          <Text style={styles.cardDesc}>{t('family.createInviteDesc')}</Text>
          {createdCode ? (
            <View style={styles.codeBox}>
              <Text style={styles.codeShareLabel}>{t('family.shareCode')}</Text>
              <Text style={styles.codeValue}>{createdCode}</Text>
              <Pressable style={styles.copyBtn} onPress={handleCopy}>
                <Text style={styles.copyBtnText}>{t('family.copyCode')}</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable style={[styles.primaryBtn, busy && styles.btnDisabled]} onPress={handleCreate} disabled={busy}>
              {busy ? (
                <ActivityIndicator color={colors.textOnPrimary} />
              ) : (
                <Text style={styles.primaryBtnText}>{t('family.createInvite')}</Text>
              )}
            </Pressable>
          )}
        </View>

        {/* Protected: redeem */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('family.redeemTitle')}</Text>
          <Text style={styles.cardDesc}>{t('family.redeemDesc')}</Text>
          <TextInput
            style={styles.codeInput}
            placeholder={t('family.codePlaceholder')}
            placeholderTextColor={colors.textMuted}
            value={codeInput}
            onChangeText={(v) => setCodeInput(v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8))}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={8}
            editable={!busy}
          />
          <Pressable style={[styles.primaryBtn, busy && styles.btnDisabled]} onPress={handleRedeem} disabled={busy}>
            <Text style={styles.primaryBtnText}>{t('family.redeem')}</Text>
          </Pressable>
        </View>

        {/* Links */}
        <Text style={styles.sectionTitle}>{t('family.linksTitle')}</Text>
        {links.length === 0 ? (
          <Text style={styles.emptyText}>{t('family.noLinks')}</Text>
        ) : (
          links.map((link) => {
            const isGuardian = link.guardian_user_id === myUid;
            const role = isGuardian ? t('family.roleGuardian') : t('family.roleProtected');
            const active = link.status === 'active';
            const notifyOn = Array.isArray(link.notify_on) && link.notify_on.includes('RED');
            return (
              <View key={link.id} style={styles.linkRow}>
                <View style={styles.linkInfo}>
                  <Text style={styles.linkRole}>{role}</Text>
                  <Text style={[styles.linkStatus, active ? styles.statusActive : styles.statusPending]}>
                    {active ? t('family.statusActive') : `${t('family.statusPending')} · ${link.invite_code}`}
                  </Text>
                  {active && isGuardian && (
                    <Pressable onPress={() => toggleNotify(link)} style={styles.notifyToggle}>
                      <Text style={styles.notifyText}>
                        {notifyOn ? '🔔' : '🔕'} {t('family.notifyRed')}
                      </Text>
                    </Pressable>
                  )}
                </View>
                <Pressable onPress={() => handleRemove(link)} hitSlop={8}>
                  <Text style={styles.removeText}>{t('family.remove')}</Text>
                </Pressable>
              </View>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl },
  back: { padding: spacing.lg, paddingBottom: 0 },
  backLabel: { ...typography.body, color: colors.primary },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  icon: { fontSize: 64, marginBottom: spacing.lg },
  title: { ...typography.h1, marginBottom: spacing.sm },
  gateText: { ...typography.body, color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.lg },
  intro: { ...typography.body, color: colors.textSecondary, marginBottom: spacing.lg, lineHeight: 24 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  cardTitle: { ...typography.h3, marginBottom: 4 },
  cardDesc: { ...typography.caption, marginBottom: spacing.md, lineHeight: 20 },
  codeBox: { alignItems: 'center', paddingVertical: spacing.sm },
  codeShareLabel: { ...typography.caption, marginBottom: spacing.sm },
  codeValue: {
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: 8,
    color: colors.primary,
    marginBottom: spacing.md,
  },
  copyBtn: {
    backgroundColor: colors.primaryLight,
    borderRadius: radius.sm,
    paddingVertical: 10,
    paddingHorizontal: spacing.lg,
  },
  copyBtnText: { fontSize: 14, fontWeight: '700', color: colors.primary },
  codeInput: {
    backgroundColor: colors.inputBg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: 14,
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: 6,
    textAlign: 'center',
    color: colors.text,
    marginBottom: spacing.md,
  },
  primaryBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryBtnText: { fontSize: 15, fontWeight: '700', color: colors.textOnPrimary },
  btnDisabled: { opacity: 0.5 },
  sectionTitle: { ...typography.h3, marginTop: spacing.md, marginBottom: spacing.md },
  emptyText: { ...typography.body, color: colors.textMuted, textAlign: 'center' },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm,
  },
  linkInfo: { flex: 1 },
  linkRole: { ...typography.bodyBold },
  linkStatus: { ...typography.caption, marginTop: 2 },
  statusActive: { color: colors.green },
  statusPending: { color: colors.yellow },
  notifyToggle: { marginTop: spacing.sm },
  notifyText: { ...typography.caption, color: colors.primary, fontWeight: '600' },
  removeText: { ...typography.caption, color: colors.red, fontWeight: '600' },
});
