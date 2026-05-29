import React, { useEffect, useState, useRef } from 'react';
import {
  Animated,
  Easing,
  View,
  ScrollView,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  Alert,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather, AntDesign } from '@expo/vector-icons';
import { colors, shadow } from '../lib/theme';
import { loginMock, sendEmailOtp, verifyEmailOtp, signInWithGoogle } from '../lib/auth';
import { useLanguage } from '../lib/localization';
import { getUserProfile } from '../lib/userProfile';
import { styles, screenW, screenH } from './AppStyles';

type Step = 'email' | 'otp';

export default function LoginScreen({ navigation }: any) {
  const { lang } = useLanguage();
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [sending, setSending] = useState(false); // sending the OTP email
  const [loading, setLoading] = useState(false); // verifying the code
  const [googleLoading, setGoogleLoading] = useState(false);
  const tickAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.timing(tickAnim, {
        toValue: 1,
        duration: 80000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    ).start();
  }, []);

  const spin = tickAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });
  const spinOpposite = tickAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['360deg', '0deg'],
  });

  // After any successful auth, first-time users (no completed quiz) go to the
  // Onboarding segmentation screen; returning users go straight to Main.
  const routeAfterAuth = async () => {
    const profile = await getUserProfile();
    if (!profile.onboardingDone) {
      navigation.replace('Onboarding');
    } else {
      navigation.replace('Main');
    }
  };

  const alertErr = (titleEn: string, titleTh: string, msgEn: string, msgTh: string) =>
    Alert.alert(lang === 'th' ? titleTh : titleEn, lang === 'th' ? msgTh : msgEn);

  // Step 1 — send the 6-digit code to the entered email.
  const handleSendOtp = async () => {
    if (!email || !email.includes('@')) {
      alertErr(
        'Email Required',
        'จำเป็นต้องระบุอีเมล',
        'Please enter a valid email address to receive your sign-in code.',
        'กรุณากรอกอีเมลที่ถูกต้องเพื่อรับรหัสเข้าใช้งาน'
      );
      return;
    }
    setSending(true);
    try {
      await sendEmailOtp(email);
      setStep('otp');
    } catch (e: any) {
      alertErr(
        'Could Not Send Code',
        'ส่งรหัสไม่สำเร็จ',
        e?.message || 'Please check your connection and try again.',
        e?.message || 'กรุณาตรวจสอบการเชื่อมต่อแล้วลองใหม่อีกครั้ง'
      );
    } finally {
      setSending(false);
    }
  };

  // Step 2 — verify the code; on success a Supabase session is persisted.
  const handleVerify = async () => {
    if (otp.trim().length < 6) {
      alertErr(
        'Invalid Code',
        'รหัสไม่ถูกต้อง',
        'Enter the 6-digit code sent to your email.',
        'กรุณากรอกรหัส 6 หลักที่ส่งไปยังอีเมลของคุณ'
      );
      return;
    }
    setLoading(true);
    try {
      await verifyEmailOtp(email, otp);
      await routeAfterAuth();
    } catch (e: any) {
      alertErr(
        'Verification Failed',
        'ยืนยันรหัสไม่สำเร็จ',
        'The code is incorrect or expired. Request a new one.',
        'รหัสไม่ถูกต้องหรือหมดอายุ กรุณาขอรหัสใหม่'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setGoogleLoading(true);
    try {
      await signInWithGoogle();
      await routeAfterAuth();
    } catch (e: any) {
      if (e?.message !== 'cancelled') {
        alertErr(
          'Google Sign-In Failed',
          'เข้าสู่ระบบด้วย Google ไม่สำเร็จ',
          e?.message || 'Please try again.',
          e?.message || 'กรุณาลองใหม่อีกครั้ง'
        );
      }
    } finally {
      setGoogleLoading(false);
    }
  };

  // DEV-only sandbox bypass — local mock user, no Supabase session.
  const handleMockLogin = async (presetEmail: string) => {
    setLoading(true);
    try {
      await loginMock(presetEmail);
      await routeAfterAuth();
    } catch {
      /* dev preset failures are non-critical */
    } finally {
      setLoading(false);
    }
  };

  const busy = loading || sending || googleLoading;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <LinearGradient colors={['#1F130E', '#0A0805']} style={StyleSheet.absoluteFillObject} />
      {/* Animated gear background */}
      <Animated.View style={[styles.tourbillonBackground, { top: screenH * 0.15, transform: [{ rotate: spin }] }]}>
        <Feather name="loader" size={300} color="rgba(236, 200, 122, 0.04)" />
      </Animated.View>
      <Animated.View style={[styles.tourbillonBackground, { right: screenW * 0.05, top: screenH * 0.45, transform: [{ rotate: spinOpposite }] }]}>
        <Feather name="settings" size={180} color="rgba(236, 200, 122, 0.02)" />
      </Animated.View>

      <ScrollView contentContainerStyle={styles.scrollGrow} style={[styles.loginContainer, { backgroundColor: 'transparent' }]}>
        <StatusBar style="light" />
        <SafeAreaView style={styles.loginContent}>
          <View style={styles.loginHeader}>
            <View style={styles.loginLogoOuterBorder}>
              <View style={styles.loginLogoInnerBorder}>
                <Feather name="shield" size={44} color={colors.amber} />
                <View style={styles.monogramWrap}>
                  <Text style={styles.monogramText}>LA</Text>
                </View>
                <View style={styles.crownDot} />
              </View>
            </View>
            <Text style={styles.loginTitle}>
              {lang === 'th' ? 'ยินดีต้อนรับ นักสะสม' : 'Welcome, Collector'}
            </Text>
            <Text style={styles.loginSubtitle}>
              {lang === 'th' ? 'พอร์ทัลนักสะสมหรู' : 'COLLECTOR PORTAL'}
            </Text>
            <Text style={styles.loginSubDesc}>
              {lang === 'th' ? 'เข้าสู่ตู้นิรภัยสะสมส่วนตัวและระบบสแกนด้วย AI' : 'Access your private collector vault and AI diagnostics'}
            </Text>
          </View>

          {/* Translucent Glassmorphic Panel */}
          <View style={[styles.loginCard, { overflow: 'hidden', borderColor: 'rgba(236, 200, 122, 0.25)', borderWidth: 1, ...shadow.amber }]}>
            <LinearGradient
              colors={['rgba(28, 22, 17, 0.88)', 'rgba(18, 14, 10, 0.94)']}
              style={StyleSheet.absoluteFillObject}
            />

            {step === 'email' ? (
              <>
                <Text style={styles.inputLabel}>
                  {lang === 'th' ? 'ที่อยู่อีเมลของคุณ' : 'EMAIL ADDRESS'}
                </Text>
                <View style={[styles.inputContainer, { borderColor: 'rgba(236, 200, 122, 0.25)' }]}>
                  <Feather name="mail" size={18} color={colors.amber} style={styles.inputIcon} />
                  <TextInput
                    style={styles.textInput}
                    placeholder="example@luxury.com"
                    placeholderTextColor={colors.textMuted}
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    editable={!busy}
                  />
                </View>

                <Pressable style={styles.loginPremiumBtn} onPress={handleSendOtp} disabled={busy}>
                  <LinearGradient
                    colors={['#ECC87A', '#C59A45', '#9A7326']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={StyleSheet.absoluteFillObject}
                  />
                  {sending ? (
                    <ActivityIndicator size="small" color="#000" />
                  ) : (
                    <Text style={styles.loginPremiumBtnText}>
                      {lang === 'th' ? 'ส่งรหัสเข้าสู่ระบบ' : 'SEND SIGN-IN CODE'}
                    </Text>
                  )}
                </Pressable>
              </>
            ) : (
              <>
                <Text style={styles.inputLabel}>
                  {lang === 'th' ? 'รหัส 6 หลัก' : '6-DIGIT CODE'}
                </Text>
                <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: 12 }}>
                  {lang === 'th' ? `ส่งรหัสไปที่ ${email} แล้ว` : `Code sent to ${email}`}
                </Text>
                <View style={[styles.inputContainer, { borderColor: 'rgba(236, 200, 122, 0.25)' }]}>
                  <Feather name="key" size={18} color={colors.amber} style={styles.inputIcon} />
                  <TextInput
                    style={[styles.textInput, { letterSpacing: 8, fontSize: 20, fontWeight: '700' }]}
                    placeholder="••••••"
                    placeholderTextColor={colors.textMuted}
                    value={otp}
                    onChangeText={(v) => setOtp(v.replace(/[^0-9]/g, '').slice(0, 6))}
                    keyboardType="number-pad"
                    maxLength={6}
                    editable={!busy}
                    autoFocus
                  />
                </View>

                <Pressable style={styles.loginPremiumBtn} onPress={handleVerify} disabled={busy}>
                  <LinearGradient
                    colors={['#ECC87A', '#C59A45', '#9A7326']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={StyleSheet.absoluteFillObject}
                  />
                  {loading ? (
                    <ActivityIndicator size="small" color="#000" />
                  ) : (
                    <Text style={styles.loginPremiumBtnText}>
                      {lang === 'th' ? 'เข้าสู่ตู้สะสมนิรภัย' : 'ENTER VAULT'}
                    </Text>
                  )}
                </Pressable>

                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 14 }}>
                  <Pressable onPress={() => { setStep('email'); setOtp(''); }} disabled={busy}>
                    <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: '600' }}>
                      {lang === 'th' ? '‹ เปลี่ยนอีเมล' : '‹ Change email'}
                    </Text>
                  </Pressable>
                  <Pressable onPress={handleSendOtp} disabled={busy}>
                    <Text style={{ color: colors.amber, fontSize: 12, fontWeight: '700' }}>
                      {sending
                        ? lang === 'th' ? 'กำลังส่ง…' : 'Sending…'
                        : lang === 'th' ? 'ส่งรหัสใหม่' : 'Resend code'}
                    </Text>
                  </Pressable>
                </View>
              </>
            )}

            {/* Divider */}
            <View style={{ flexDirection: 'row', alignItems: 'center', marginVertical: 18 }}>
              <View style={{ flex: 1, height: 1, backgroundColor: 'rgba(236, 200, 122, 0.18)' }} />
              <Text style={{ color: colors.textMuted, fontSize: 11, marginHorizontal: 10, letterSpacing: 1 }}>
                {lang === 'th' ? 'หรือ' : 'OR'}
              </Text>
              <View style={{ flex: 1, height: 1, backgroundColor: 'rgba(236, 200, 122, 0.18)' }} />
            </View>

            {/* Google OAuth */}
            <Pressable
              onPress={handleGoogle}
              disabled={busy}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                paddingVertical: 14,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: 'rgba(255, 255, 255, 0.85)',
                backgroundColor: 'rgba(255, 255, 255, 0.95)',
                gap: 10,
              }}
            >
              {googleLoading ? (
                <ActivityIndicator size="small" color="#3c4043" />
              ) : (
                <>
                  <AntDesign name="google" size={18} color="#4285F4" />
                  <Text style={{ color: '#3c4043', fontSize: 14, fontWeight: '700' }}>
                    {lang === 'th' ? 'ดำเนินการต่อด้วย Google' : 'Continue with Google'}
                  </Text>
                </>
              )}
            </Pressable>
          </View>

          {/* Sandbox testing profiles — DEV builds only. */}
          {__DEV__ && (
            <>
              <Text style={styles.orText}>
                {lang === 'th' ? '— หรือเลือกโปรไฟล์ทดสอบระบบ Sandbox —' : '— Or choose a sandbox testing profile —'}
              </Text>
              <View style={styles.presetGrid}>
                <Pressable style={[styles.presetCard, { overflow: 'hidden', borderColor: 'rgba(236, 200, 122, 0.2)' }]} onPress={() => handleMockLogin('vip@patek.com')}>
                  <LinearGradient colors={['rgba(30, 24, 20, 0.75)', 'rgba(18, 14, 12, 0.9)']} style={StyleSheet.absoluteFillObject} />
                  <Text style={styles.presetEmoji}>👑</Text>
                  <Text style={styles.presetName}>Patek VIP</Text>
                  <Text style={styles.presetEmail}>vip@patek.com</Text>
                </Pressable>
                <Pressable style={[styles.presetCard, { overflow: 'hidden', borderColor: 'rgba(236, 200, 122, 0.2)' }]} onPress={() => handleMockLogin('collector@rolex.com')}>
                  <LinearGradient colors={['rgba(30, 24, 20, 0.75)', 'rgba(18, 14, 12, 0.9)']} style={StyleSheet.absoluteFillObject} />
                  <Text style={styles.presetEmoji}>⌚</Text>
                  <Text style={styles.presetName}>Rolex Collector</Text>
                  <Text style={styles.presetEmail}>collector@rolex.com</Text>
                </Pressable>
              </View>
            </>
          )}
        </SafeAreaView>
      </ScrollView>
    </View>
  );
}
