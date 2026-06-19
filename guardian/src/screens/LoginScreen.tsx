import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Alert,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors, spacing, radius, typography } from '../lib/theme';
import { sendEmailOtp, verifyEmailOtp } from '../lib/auth';
import { registerForPush } from '../lib/notifications';
import { useLang } from '../i18n/LangContext';
import type { RootStackParamList } from '../lib/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Login'>;

export default function LoginScreen({ navigation }: Props) {
  const { t } = useLang();
  const [step, setStep] = useState<'email' | 'otp'>('email');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);

  const busy = sending || verifying;

  const handleSend = async () => {
    if (!email.includes('@')) {
      Alert.alert('', t('error.emailRequired'));
      return;
    }
    setSending(true);
    try {
      await sendEmailOtp(email);
      setStep('otp');
    } catch (e: any) {
      Alert.alert(t('error.title'), e?.message || t('error.networkFailed'));
    } finally {
      setSending(false);
    }
  };

  const handleVerify = async () => {
    if (otp.trim().length < 6) {
      Alert.alert('', t('error.otpRequired'));
      return;
    }
    setVerifying(true);
    try {
      await verifyEmailOtp(email, otp);
      registerForPush().catch(() => {});
      navigation.goBack();
    } catch {
      Alert.alert(t('error.title'), t('error.invalidCode'));
    } finally {
      setVerifying(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Pressable onPress={() => navigation.goBack()} style={styles.back}>
            <Text style={styles.backLabel}>‹ {t('common.back')}</Text>
          </Pressable>

          <Text style={styles.logo}>🛡️</Text>
          <Text style={styles.title}>{t('auth.loginTitle')}</Text>
          <Text style={styles.subtitle}>{t('auth.loginSubtitle')}</Text>

          <View style={styles.card}>
            {step === 'email' ? (
              <>
                <Text style={styles.label}>{t('auth.emailLabel')}</Text>
                <TextInput
                  style={styles.input}
                  placeholder={t('auth.emailPlaceholder')}
                  placeholderTextColor={colors.textMuted}
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!busy}
                />
                <Pressable style={[styles.primaryBtn, busy && styles.btnDisabled]} onPress={handleSend} disabled={busy}>
                  {sending ? (
                    <ActivityIndicator color={colors.textOnPrimary} />
                  ) : (
                    <Text style={styles.primaryBtnText}>{t('auth.sendCode')}</Text>
                  )}
                </Pressable>
              </>
            ) : (
              <>
                <Text style={styles.label}>{t('auth.otpLabel')}</Text>
                <Text style={styles.otpHint}>
                  {t('auth.otpSentTo')} {email}
                </Text>
                <TextInput
                  style={[styles.input, styles.otpInput]}
                  placeholder="••••••"
                  placeholderTextColor={colors.textMuted}
                  value={otp}
                  onChangeText={(v) => setOtp(v.replace(/[^0-9]/g, '').slice(0, 6))}
                  keyboardType="number-pad"
                  maxLength={6}
                  autoFocus
                  editable={!busy}
                  textContentType="oneTimeCode"
                  autoComplete="one-time-code"
                />
                <Pressable style={[styles.primaryBtn, busy && styles.btnDisabled]} onPress={handleVerify} disabled={busy}>
                  {verifying ? (
                    <ActivityIndicator color={colors.textOnPrimary} />
                  ) : (
                    <Text style={styles.primaryBtnText}>{t('auth.verify')}</Text>
                  )}
                </Pressable>
                <View style={styles.otpRow}>
                  <Pressable onPress={() => { setStep('email'); setOtp(''); }} disabled={busy}>
                    <Text style={styles.linkMuted}>{t('auth.changeEmail')}</Text>
                  </Pressable>
                  <Pressable onPress={handleSend} disabled={busy}>
                    <Text style={styles.linkPrimary}>{sending ? t('auth.sending') : t('auth.resend')}</Text>
                  </Pressable>
                </View>
              </>
            )}
          </View>

          <Pressable onPress={() => navigation.goBack()} style={styles.skip} disabled={busy}>
            <Text style={styles.skipLabel}>{t('auth.skipLogin')}</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl, flexGrow: 1 },
  back: { marginBottom: spacing.md },
  backLabel: { ...typography.body, color: colors.primary },
  logo: { fontSize: 52, textAlign: 'center', marginTop: spacing.md },
  title: { ...typography.h1, textAlign: 'center', marginTop: spacing.md },
  subtitle: { ...typography.caption, textAlign: 'center', marginTop: spacing.sm, marginBottom: spacing.lg },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  label: { ...typography.bodyBold, marginBottom: spacing.sm },
  input: {
    backgroundColor: colors.inputBg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    fontSize: 16,
    color: colors.text,
  },
  otpInput: { letterSpacing: 8, fontSize: 22, fontWeight: '700', textAlign: 'center' },
  otpHint: { ...typography.caption, marginBottom: spacing.sm },
  primaryBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  primaryBtnText: { fontSize: 16, fontWeight: '700', color: colors.textOnPrimary },
  btnDisabled: { opacity: 0.5 },
  otpRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.md },
  linkMuted: { ...typography.caption, color: colors.textSecondary, fontWeight: '600' },
  linkPrimary: { ...typography.caption, color: colors.primary, fontWeight: '700' },
  skip: { alignItems: 'center', marginTop: spacing.lg },
  skipLabel: { ...typography.caption, color: colors.textMuted },
});
