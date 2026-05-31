import React, { useEffect, useState } from 'react';
import {
  View,
  ScrollView,
  Text,
  Pressable,
  Image,
  Alert,
  Modal,
  TextInput,
  ActivityIndicator,
  StyleSheet,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { colors, radius, spacing } from '../lib/theme';
import { AuthUser, getAuthUser, getMembership, startTrialAgain, clearTrial, MembershipTier, setMembership, updateUser, logout } from '../lib/auth';
import { requestPhoneOtp, verifyPhoneOtp } from '../lib/simRegistry';
import { useLanguage } from '../lib/localization';
import { styles } from './AppStyles';
import {
  getPushPermissionStatus,
  registerForPushNotifications,
  disablePushNotifications,
} from '../lib/pushNotifications';
import { Linking } from 'react-native';

// Developer Event Listener for tier remounting
let globalUpdateAppTier: ((tier: MembershipTier) => void) | null = null;

// Bind listener globally to update App's navigation state
export function registerUpdateTierCallback(callback: (tier: MembershipTier) => void) {
  globalUpdateAppTier = callback;
  return () => {
    globalUpdateAppTier = null;
  };
}

export function triggerTierUpdate(tier: MembershipTier) {
  if (globalUpdateAppTier) {
    globalUpdateAppTier(tier);
  }
}

/**
 * BrandTier — single tier card in the Supported Brands list.
 *
 * Each tier represents a horology-trade convention level (Apex / Established
 * / Independent / Accessible) and lists its constituent brand names as a
 * single dot-separated paragraph. The compact paragraph format communicates
 * "curated set" rather than the old checklist style that read as a parts
 * catalog. Accent color descends from cream (top) to bronze (accessible),
 * reinforcing hierarchy without numeric rankings.
 *
 * Moved out of HomeScreen so the daily-use feed isn't dominated by reference
 * material — this block now lives in Settings beside FAQ/Terms/Privacy.
 */
function BrandTier({
  accent,
  accentBorder,
  tag,
  title,
  subtitle,
  brands,
}: {
  accent: string;
  accentBorder: string;
  tag: string;
  title: string;
  subtitle: string;
  brands: string[];
}) {
  return (
    <View
      style={{
        borderRadius: 12,
        borderWidth: 1,
        borderColor: accentBorder,
        marginBottom: 12,
        overflow: 'hidden',
      }}
    >
      <LinearGradient
        colors={['rgba(30, 24, 20, 0.85)', 'rgba(12, 10, 8, 0.96)']}
        style={StyleSheet.absoluteFillObject}
      />
      <View style={{ padding: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
          <View
            style={{
              paddingHorizontal: 8,
              paddingVertical: 3,
              borderRadius: 6,
              borderWidth: 1,
              borderColor: accentBorder,
              marginRight: 10,
            }}
          >
            <Text style={{ color: accent, fontSize: 9, fontWeight: '800', letterSpacing: 1.2 }}>
              {tag}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: accent, fontSize: 14, fontWeight: '700', letterSpacing: 0.3 }}>
              {title}
            </Text>
            <Text style={{ color: '#8A8278', fontSize: 11, marginTop: 1 }} numberOfLines={1}>
              {subtitle}
            </Text>
          </View>
          <Text style={{ color: '#666', fontSize: 11, fontWeight: '600' }}>
            {brands.length}
          </Text>
        </View>
        <Text
          style={{
            color: '#D0C8B5',
            fontSize: 12.5,
            lineHeight: 19,
            letterSpacing: 0.2,
          }}
        >
          {brands.join('  ·  ')}
        </Text>
      </View>
    </View>
  );
}

export default function SettingsScreen({ navigation }: any) {
  const { t, lang, setLang } = useLanguage();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [membership, setMembershipState] = useState<any>(null);

  // --- OTP Verification Modal State ---
  const [otpModalVisible, setOtpModalVisible] = useState(false);
  const [otpPhone, setOtpPhone] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpStep, setOtpStep] = useState<1 | 2>(1); // 1 = input phone, 2 = input OTP
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpError, setOtpError] = useState('');
  const [otpMessage, setOtpMessage] = useState('');
  const [simulatedOtpCode, setSimulatedOtpCode] = useState('');

  // --- Push Notification toggle state ---
  // Reads the system permission status on mount; ToggleEnabled is
  // computed from it. Tapping the row either requests permission
  // (if undetermined) or opens system Settings (if previously denied,
  // because iOS/Android only allow a single in-app request per
  // install — after denial we can't re-prompt).
  const [pushStatus, setPushStatus] = useState<'granted' | 'denied' | 'undetermined'>('undetermined');
  const [pushBusy, setPushBusy] = useState(false);

  useEffect(() => {
    getPushPermissionStatus().then(setPushStatus).catch(() => {});
  }, []);

  const handleTogglePush = async () => {
    if (pushBusy) return;
    setPushBusy(true);
    try {
      if (pushStatus === 'granted') {
        // Currently on → user wants to opt out
        await disablePushNotifications();
        // Note: this only clears OUR token. System permission stays
        // granted (user has to go to system Settings to fully revoke).
        // For our purposes — no token = no re-engagement — that's
        // enough.
        setPushStatus('undetermined'); // visual hint that we'll re-ask
      } else if (pushStatus === 'undetermined') {
        // Never asked → trigger the OS prompt
        const token = await registerForPushNotifications();
        if (token) {
          setPushStatus('granted');
        }
      } else {
        // Previously denied — can't re-prompt; deep link to Settings
        await Linking.openSettings();
      }
    } finally {
      setPushBusy(false);
    }
  };

  const load = async () => {
    const u = await getAuthUser();
    const m = await getMembership();
    setUser(u);
    setMembershipState(m);
  };

  const handleRequestOtp = async () => {
    if (!otpPhone || otpPhone.trim().length < 9) {
      setOtpError(lang === 'th' ? 'กรุณากรอกเบอร์โทรศัพท์ที่ถูกต้อง' : 'Please enter a valid phone number');
      return;
    }
    setOtpLoading(true);
    setOtpError('');
    try {
      const res = await requestPhoneOtp(otpPhone);
      if (res.success) {
        setOtpStep(2);
        setOtpMessage(res.message);
        if ('code' in res && res.code) {
          setSimulatedOtpCode(res.code);
        }
      } else {
        setOtpError(res.message);
      }
    } catch (err: any) {
      setOtpError(err.message || 'Error requesting OTP');
    } finally {
      setOtpLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (!otpCode || otpCode.trim().length !== 6) {
      setOtpError(lang === 'th' ? 'กรุณากรอกรหัส OTP 6 หลัก' : 'Please enter a 6-digit OTP code');
      return;
    }
    setOtpLoading(true);
    setOtpError('');
    try {
      const res = await verifyPhoneOtp(otpPhone, otpCode);
      if (res.success) {
        // Success! Set trial started
        await startTrialAgain();
        await load();
        if (globalUpdateAppTier) {
          globalUpdateAppTier('free');
        }
        setOtpModalVisible(false);
        Alert.alert(
          lang === 'th' ? 'สำเร็จ!' : 'SUCCESS!',
          lang === 'th' 
            ? 'ยืนยันเบอร์โทรศัพท์สำเร็จ เริ่มสิทธิ์ทดลองใช้งานฟรี Premium 7 วันแล้ว! (จำกัด 3 สแกนต่อวัน)' 
            : 'Phone verified successfully! Your 7-day premium trial has started. (Max 3 scans per day)'
        );
      } else {
        setOtpError(res.message);
      }
    } catch (err: any) {
      setOtpError(err.message || 'Error verifying OTP');
    } finally {
      setOtpLoading(false);
    }
  };

  useEffect(() => {
    load();
    const timer = setInterval(load, 2000);
    return () => clearInterval(timer);
  }, []);

  const handleSelectAvatar = async () => {
    // Request permission first
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Permission Required',
        'We need access to your photo library to set a profile picture.'
      );
      return;
    }

    // Launch image picker
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      const selectedUri = result.assets[0].uri;
      // Update local storage and state
      const updated = await updateUser({ avatarUri: selectedUri });
      if (updated) {
        setUser(updated);
      }
    }
  };

  const handleLogout = async () => {
    await logout();
    navigation.replace('Login');
  };

  const handleClearData = async () => {
    Alert.alert(t('settings.wipeConfirmTitle'), t('settings.wipeConfirmDesc'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('settings.wipeConfirmTitle'),
        style: 'destructive',
        onPress: async () => {
          try {
            const { eraseMyData } = await import('../lib/dataConsent');
            await eraseMyData();
          } catch (err) {
            console.warn('[SettingsScreen] eraseMyData failed during account deletion:', err);
          }
          await AsyncStorage.clear();
          await load();
          if (globalUpdateAppTier) globalUpdateAppTier('free');
          Alert.alert(t('common.success'), t('settings.wipeSuccess'));
        },
      },
    ]);
  };

  // Switch tier dynamically from the developer control bar
  const changeTierDev = async (tier: MembershipTier) => {
    await setMembership(tier);
    await load();
    if (globalUpdateAppTier) {
      globalUpdateAppTier(tier);
    }
    HapticsLogMock('notificationSuccess');
  };

  // Mock haptic logs for UI response
  const HapticsLogMock = (type: string) => {
    console.log(`[Haptics Mock] fired: ${type}`);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <LinearGradient
        colors={['#1B130E', '#0A0805']}
        style={StyleSheet.absoluteFillObject}
      />
      <ScrollView style={styles.settingsContainer} contentContainerStyle={styles.settingsContent}>
        <StatusBar style="light" />
        <SafeAreaView style={styles.safeAreaZero} edges={['top']}>
          <Text style={styles.settingsTitle}>{t('settings.title')}</Text>

          {/* Profile Card */}
          <View style={[styles.profileCard, { overflow: 'hidden', borderColor: '#ECC87A', borderWidth: 1.5, marginBottom: spacing.sm }]}>
            <LinearGradient
              colors={['rgba(30, 24, 20, 0.85)', 'rgba(18, 14, 12, 0.95)']}
              style={StyleSheet.absoluteFillObject}
            />
            <Pressable
              onPress={handleSelectAvatar}
              style={[styles.profileAvatar, { borderWidth: 2, borderColor: '#ECC87A', overflow: 'hidden', justifyContent: 'center', alignItems: 'center' }]}
            >
              {user?.avatarUri ? (
                <Image source={{ uri: user.avatarUri }} style={StyleSheet.absoluteFillObject} />
              ) : (
                <>
                  <LinearGradient
                    colors={['rgba(28, 22, 17, 0.95)', 'rgba(10, 8, 5, 0.98)']}
                    style={StyleSheet.absoluteFillObject}
                  />
                  <Text style={[styles.avatarText, { color: '#ECC87A', fontWeight: '900' }]}>
                    {user?.displayName?.slice(0, 2).toUpperCase() || 'LU'}
                  </Text>
                </>
              )}
              <View style={styles.avatarEditOverlay}>
                <Feather name="camera" size={10} color="#fff" />
              </View>
            </Pressable>
            <View>
              <Text style={styles.profileName}>{user?.displayName || (lang === 'th' ? 'นักสะสมนาฬิกาหรู' : 'Horological Collector')}</Text>
              <Text style={styles.profileEmail}>{user?.email || 'collector@luxury.com'}</Text>
              {user?.provider ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 3 }}>
                  <Feather
                    name={user.provider === 'google' ? 'chrome' : 'mail'}
                    size={11}
                    color="#8A8278"
                    style={{ marginRight: 5 }}
                  />
                  <Text style={{ color: '#8A8278', fontSize: 11, fontWeight: '600' }}>
                    {user.provider === 'google'
                      ? lang === 'th' ? 'เข้าสู่ระบบด้วย Google' : 'Signed in with Google'
                      : lang === 'th' ? 'เข้าสู่ระบบด้วยอีเมล' : 'Signed in with email'}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>

          {/* Premium Glassmorphic Language Switcher */}
          <View style={[styles.planCard, { overflow: 'hidden', borderColor: 'rgba(236, 200, 122, 0.35)', borderWidth: 1.5, padding: 14, marginBottom: spacing.sm }]}>
            <LinearGradient
              colors={['rgba(28, 22, 15, 0.9)', 'rgba(18, 14, 10, 0.95)']}
              style={StyleSheet.absoluteFillObject}
            />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={[styles.planTitle, { fontSize: 13, letterSpacing: 0.5, color: '#ECC87A' }]}>
                {t('settings.language')}
              </Text>
              <View style={{ flexDirection: 'row', borderRadius: radius.sm, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(236, 200, 122, 0.3)' }}>
                <Pressable
                  style={{
                    paddingHorizontal: 16,
                    paddingVertical: 8,
                    backgroundColor: lang === 'en' ? colors.amber : 'transparent',
                  }}
                  onPress={() => setLang('en')}
                >
                  <Text style={{ color: lang === 'en' ? '#000' : '#fff', fontSize: 11, fontWeight: '900' }}>
                    🇺🇸 EN
                  </Text>
                </Pressable>
                <Pressable
                  style={{
                    paddingHorizontal: 16,
                    paddingVertical: 8,
                    backgroundColor: lang === 'th' ? colors.amber : 'transparent',
                  }}
                  onPress={() => setLang('th')}
                >
                  <Text style={{ color: lang === 'th' ? '#000' : '#fff', fontSize: 11, fontWeight: '900' }}>
                    🇹🇭 TH
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>

          {/* Active Plan Info */}
          <View style={[styles.planCard, { overflow: 'hidden', borderColor: 'rgba(212, 175, 55, 0.35)', borderWidth: 1.5 }]}>
            <LinearGradient
              colors={['rgba(28, 22, 15, 0.9)', 'rgba(18, 14, 10, 0.95)']}
              style={StyleSheet.absoluteFillObject}
            />
            <View style={styles.planHeader}>
              <Text style={styles.planTitle}>{t('settings.activePlan')}</Text>
              <Text style={[styles.planTier, { color: colors.amber }]}>
                {membership?.tier?.toUpperCase() || 'FREE'}
              </Text>
            </View>
             <Text style={styles.planDetails}>
              {membership?.isTrialing
                ? (lang === 'th' ? `กำลังอยู่ในช่วงทดลองใช้พรีเมียมฟรี (${membership?.trialDaysLeft} วันที่เหลือ, จำกัด 5 สแกน) ระบบผูกบัตรเครดิตเรียบร้อย` : `Active in Free Premium Trial (${membership?.trialDaysLeft} days remaining, max 5 scans). Credit card bound.`)
                : membership?.tier === 'free'
                  ? (lang === 'th' ? 'ยังไม่ได้เปิดสิทธิ์ทดลองใช้ — กรุณาผูกบัตรเครดิตเพื่อเริ่มสิทธิ์ทดลองใช้ Premium ฟรี 7 วัน (สูงสุด 5 สแกน)' : 'Trial not active — Bind credit card to start 7-Day Premium Trial (max 5 scans)')
                  : membership?.tier === 'standard'
                    ? (lang === 'th' ? 'ระดับสแตนดาร์ด (Standard) (สูงสุด 20 สแกน/เดือน, ช่องถ่าย 2 มุม)' : 'Standard tier (up to 20 scans/month, 2 photo slots)')
                    : membership?.tier === 'pro'
                      ? (lang === 'th' ? 'ระดับโปร (Pro) (สูงสุด 50 สแกน/เดือน, รายงาน A5 PDF, ช่องถ่าย 3 มุม)' : 'Pro tier (up to 50 scans/month, A5 PDF reports, 3 photo slots)')
                      : (lang === 'th' ? 'ระดับพรีเมียม (Premium) (สูงสุด 100 สแกน/เดือน, พอร์ตโฟลิโอสะสมสูงสุด 100 เรือน, PDF ไม่มีลายน้ำ)' : 'Premium tier (up to 100 scans/month, up to 100-watch portfolio, watermark-free PDF)')}
            </Text>
            <Pressable style={styles.planUpgradeBtn} onPress={() => navigation.navigate('Membership', { trigger: 'manual_settings' })}>
              <Text style={styles.planUpgradeText}>{t('settings.manageSub')}</Text>
            </Pressable>

            {membership?.tier === 'free' && !membership?.isTrialing && (
              <Pressable
                style={[
                  styles.planUpgradeBtn,
                  {
                    backgroundColor: colors.amber,
                    borderColor: colors.amber,
                    marginTop: 12,
                    shadowColor: colors.amber,
                    shadowOpacity: 0.3,
                    shadowRadius: 8,
                    shadowOffset: { width: 0, height: 4 },
                  }
                ]}
                onPress={() => {
                  setOtpPhone('');
                  setOtpCode('');
                  setOtpStep(1);
                  setOtpError('');
                  setOtpMessage('');
                  setSimulatedOtpCode('');
                  setOtpModalVisible(true);
                }}
              >
                <Text style={[styles.planUpgradeText, { color: '#000', fontWeight: 'bold' }]}>
                  {lang === 'th' ? '💳 ยืนยันสิทธิ์เริ่มทดลองใช้ฟรี 7 วัน' : '💳 Verify & Start 7-Day Free Trial'}
                </Text>
              </Pressable>
            )}
          </View>
 
           {/* Standard Action Links */}
          <View style={[styles.settingsMenu, { overflow: 'hidden', borderColor: 'rgba(236, 200, 122, 0.15)' }]}>
            <LinearGradient
              colors={['rgba(30, 24, 20, 0.6)', 'rgba(18, 14, 12, 0.75)']}
              style={StyleSheet.absoluteFillObject}
            />
            <Pressable style={styles.menuItem} onPress={() => navigation.navigate('Info', { kind: 'faq' })}>
              <Feather name="help-circle" size={18} color={colors.amber} style={{ opacity: 0.85 }} />
              <Text style={styles.menuItemText}>{t('settings.faqs')}</Text>
              <Feather name="chevron-right" size={16} color={colors.textMuted} />
            </Pressable>
 
            <Pressable style={styles.menuItem} onPress={() => navigation.navigate('Info', { kind: 'terms' })}>
              <Feather name="file-text" size={18} color={colors.amber} style={{ opacity: 0.85 }} />
              <Text style={styles.menuItemText}>{t('settings.terms')}</Text>
              <Feather name="chevron-right" size={16} color={colors.textMuted} />
            </Pressable>
 
            <Pressable style={styles.menuItem} onPress={() => navigation.navigate('Info', { kind: 'privacy' })}>
              <Feather name="lock" size={18} color={colors.amber} style={{ opacity: 0.85 }} />
              <Text style={styles.menuItemText}>{t('settings.privacy')}</Text>
              <Feather name="chevron-right" size={16} color={colors.textMuted} />
            </Pressable>

            {/* Push notification opt-in toggle. Three visual states:
                  granted     → 🔔 bell + "ON" amber pill
                  denied      → 🔕 bell-off + "OFF" muted pill (tap → system Settings)
                  undetermined→ 🔔 bell + "OFF" muted pill (tap → request prompt)
                Re-engagement campaigns only fire when push_token is set,
                so opting out here disables all server-sent nudges. */}
            <Pressable style={styles.menuItem} onPress={handleTogglePush} disabled={pushBusy}>
              <Feather
                name={pushStatus === 'granted' ? 'bell' : 'bell-off'}
                size={18}
                color={colors.amber}
                style={{ opacity: 0.85 }}
              />
              <Text style={styles.menuItemText}>
                {lang === 'th' ? 'การแจ้งเตือน' : 'Notifications'}
              </Text>
              <View
                style={{
                  paddingHorizontal: 10,
                  paddingVertical: 3,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: pushStatus === 'granted' ? '#D4B98C' : 'rgba(160, 151, 138, 0.4)',
                  backgroundColor: pushStatus === 'granted' ? 'rgba(212, 185, 140, 0.15)' : 'transparent',
                  marginRight: 4,
                }}
              >
                <Text
                  style={{
                    fontSize: 10,
                    fontWeight: '700',
                    letterSpacing: 1,
                    color: pushStatus === 'granted' ? '#D4B98C' : '#A0978A',
                  }}
                >
                  {pushStatus === 'granted'
                    ? (lang === 'th' ? 'เปิด' : 'ON')
                    : (lang === 'th' ? 'ปิด' : 'OFF')}
                </Text>
              </View>
              <Feather name="chevron-right" size={16} color={colors.textMuted} />
            </Pressable>

            <Pressable style={styles.menuItem} onPress={handleClearData}>
              <Feather name="trash-2" size={18} color={colors.danger} />
              <Text style={[styles.menuItemText, { color: colors.danger }]}>{t('settings.wipeData')}</Text>
              <Feather name="chevron-right" size={16} color={colors.textMuted} />
            </Pressable>
          </View>

          {/* ─────────────────────────────────────────────────────────
              Authentication Coverage — Tiered Brand Catalog
              ─────────────────────────────────────────────────────────
              Moved here from HomeScreen so daily-use surfaces stay focused
              on Scan → Recent → Portfolio. This block is reference material
              that users read once (when deciding whether the app supports
              their watch) and rarely revisit, which is exactly the role
              Settings is meant for.

                • Coverage banner: ~94% of Thai luxury watch sales volume.
                • 4 horology tiers (apex/established/independent/accessible)
                  ordered by craft level, not alphabetically.
                • Q3/Q4 2026 roadmap to 100% — signals active expansion. */}
          <View style={{ marginTop: spacing.md, marginBottom: spacing.md }}>
            {/* Coverage banner */}
            <View style={{
              borderRadius: 14,
              borderWidth: 1,
              borderColor: 'rgba(236, 200, 122, 0.4)',
              padding: spacing.md,
              marginBottom: spacing.md,
              overflow: 'hidden',
            }}>
              <LinearGradient
                colors={['rgba(236, 200, 122, 0.14)', 'rgba(236, 200, 122, 0.03)']}
                style={StyleSheet.absoluteFillObject}
              />
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ flex: 1, paddingRight: spacing.sm }}>
                  <Text style={{ color: colors.textMuted, fontSize: 10, letterSpacing: 1.5, fontWeight: '700' }}>
                    {lang === 'th' ? 'มาตรฐานการตรวจสอบ' : 'AUTHENTICATION COVERAGE'}
                  </Text>
                  <Text style={{ color: '#F5E9CC', fontSize: 14, fontWeight: '600', marginTop: 4 }}>
                    {lang === 'th'
                      ? 'ครอบคลุมตลาดนาฬิกาหรูในประเทศไทย'
                      : 'Of luxury watch sales volume in Thailand'}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{
                    color: colors.amber,
                    fontSize: 32,
                    fontWeight: '900',
                    letterSpacing: -1,
                    lineHeight: 36,
                  }}>
                    94%
                  </Text>
                  <Text style={{ color: colors.textMuted, fontSize: 9, letterSpacing: 1 }}>
                    31 BRANDS
                  </Text>
                </View>
              </View>
            </View>

            {/* Section heading */}
            <Text style={[styles.subSectionHeader, { marginBottom: spacing.sm }]}>
              {lang === 'th' ? 'แบรนด์ที่รองรับ — แบ่งตามระดับชั้น' : 'SUPPORTED BRANDS — BY TIER'}
            </Text>

            {/* TIER 1 — Apex Manufactures */}
            <BrandTier
              accent="#F5E9CC"
              accentBorder="rgba(245, 233, 204, 0.55)"
              tag={lang === 'th' ? 'ขั้นสูงสุด' : 'TIER I'}
              title={lang === 'th' ? 'Apex Manufactures' : 'Apex Manufactures'}
              subtitle={lang === 'th' ? 'งานหัตถศิลป์ระดับ Haute Horlogerie' : 'Haute Horlogerie · top-tier ateliers'}
              brands={[
                'Patek Philippe',
                'Audemars Piguet',
                'Vacheron Constantin',
                'A. Lange & Söhne',
                'Richard Mille',
                'F.P. Journe',
              ]}
            />

            {/* TIER 2 — Established Luxury */}
            <BrandTier
              accent="#ECC87A"
              accentBorder="rgba(236, 200, 122, 0.45)"
              tag={lang === 'th' ? 'ระดับหรู' : 'TIER II'}
              title={lang === 'th' ? 'Established Luxury' : 'Established Luxury'}
              subtitle={lang === 'th' ? 'แบรนด์สวิสและฝรั่งเศสกระแสหลัก' : 'Mainstream Swiss & French maisons'}
              brands={[
                'Rolex',
                'Tudor',
                'Omega',
                'IWC',
                'Jaeger-LeCoultre',
                'Cartier',
                'Hublot',
                'Panerai',
                'Breitling',
                'TAG Heuer',
                'Zenith',
                'Chopard',
                'Bvlgari',
                'Franck Muller',
                'Girard-Perregaux',
              ]}
            />

            {/* TIER 3 — Independent & Niche */}
            <BrandTier
              accent="#C59A45"
              accentBorder="rgba(197, 154, 69, 0.45)"
              tag={lang === 'th' ? 'อิสระ' : 'TIER III'}
              title={lang === 'th' ? 'Independent & Niche' : 'Independent & Niche'}
              subtitle={lang === 'th' ? 'ผู้ผลิตอิสระและงานสะสมหายาก' : 'Independent ateliers · low-volume collectors'}
              brands={[
                'MB&F',
                'URWERK',
                'Bovet',
                'Grand Seiko',
                'Ulysse Nardin',
                'Parmigiani Fleurier',
              ]}
            />

            {/* TIER 4 — Accessible Luxury */}
            <BrandTier
              accent="#9A7326"
              accentBorder="rgba(154, 115, 38, 0.5)"
              tag={lang === 'th' ? 'เข้าถึงได้' : 'TIER IV'}
              title={lang === 'th' ? 'Accessible Luxury' : 'Accessible Luxury'}
              subtitle={lang === 'th' ? 'แบรนด์สวิสและญี่ปุ่นราคาเป็นมิตร' : 'Approachable Swiss & Japanese'}
              brands={['Tissot', 'Longines', 'Frédérique Constant', 'Seiko']}
            />

            {/* Roadmap card */}
            <View style={{
              marginTop: spacing.sm,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: 'rgba(120, 120, 130, 0.25)',
              padding: spacing.md,
              overflow: 'hidden',
              backgroundColor: 'rgba(20, 18, 16, 0.55)',
            }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm }}>
                <Feather name="compass" size={14} color={colors.amber} style={{ marginRight: 6 }} />
                <Text style={{ color: colors.amber, fontSize: 11, fontWeight: '700', letterSpacing: 1.2 }}>
                  {lang === 'th' ? 'แผนพัฒนา 2026' : 'COVERAGE ROADMAP 2026'}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', marginBottom: spacing.xs }}>
                <Text style={{ color: colors.textSecondary, fontSize: 11, fontWeight: '700', width: 64 }}>Q3 →</Text>
                <Text style={{ color: '#D0D0D0', fontSize: 11, flex: 1, lineHeight: 16 }}>
                  Hermès · Piaget · Glashütte Original · Oris · Hamilton
                  <Text style={{ color: colors.amber, fontWeight: '700' }}> → 98%</Text>
                </Text>
              </View>
              <View style={{ flexDirection: 'row' }}>
                <Text style={{ color: colors.textSecondary, fontSize: 11, fontWeight: '700', width: 64 }}>Q4 →</Text>
                <Text style={{ color: '#D0D0D0', fontSize: 11, flex: 1, lineHeight: 16 }}>
                  Citizen · Mido · Maurice Lacroix · boutique independents
                  <Text style={{ color: colors.amber, fontWeight: '700' }}> → 100%</Text>
                </Text>
              </View>
              <Text style={{ color: colors.textMuted, fontSize: 10, marginTop: spacing.sm, fontStyle: 'italic' }}>
                {lang === 'th'
                  ? 'ฐานข้อมูลอ้างอิงเติบโตขึ้นทุกเดือนจากการสะสมของผู้ใช้และพันธมิตรอย่างเป็นทางการ'
                  : 'Reference vault grows monthly via user submissions & authorized partners'}
              </Text>
            </View>
          </View>

        {/* Logout Button */}
        <Pressable style={styles.logoutBtn} onPress={handleLogout}>
          <Feather name="log-out" size={18} color="#fff" />
          <Text style={styles.logoutText}>{t('settings.logout')}</Text>
        </Pressable>
 
        {/* ==========================================
            DEVELOPER CONTROL PANEL OVERLAY (FOR SANDBOX GATES TESTING)
            ========================================== */}
        {/* Dev-only — __DEV__-gated so it's stripped from production builds.
            These buttons call setMembership()/clearTrial() locally and open the
            (fake, Math.random) phone-OTP trial — shipping them = a free-Premium
            + free-trial hole (audit M2 / C2). Real trial/upgrade flows for
            production go through IAP + the server entitlement (Stage 3). */}
        {__DEV__ && (
        <View style={styles.devCard}>
          <Text style={styles.devCardTitle}>{t('settings.devControls')}</Text>
          <Text style={styles.devCardSub}>{t('settings.devSub')}</Text>
          
          <View style={styles.devBtnRow}>
            {(['free', 'standard', 'pro', 'premium'] as MembershipTier[]).map((tier) => {
              const active = membership?.tier === tier;
              return (
                <Pressable
                  key={tier}
                  style={[styles.devTierBtn, active && styles.devTierBtnActive]}
                  onPress={() => changeTierDev(tier)}
                >
                  <Text style={[styles.devTierText, active && styles.devTierTextActive]}>
                    {tier.toUpperCase()}
                  </Text>
                </Pressable>
              );
            })}
          </View>
 
          <View style={styles.devActionRow}>
            <Pressable
              style={styles.devActionBtn}
              onPress={() => {
                setOtpPhone('');
                setOtpCode('');
                setOtpStep(1);
                setOtpError('');
                setOtpMessage('');
                setSimulatedOtpCode('');
                setOtpModalVisible(true);
              }}
            >
              <Text style={styles.devActionText}>{t('settings.startTrial')}</Text>
            </Pressable>
 
            <Pressable
              style={styles.devActionBtn}
              onPress={async () => {
                await clearTrial();
                await load();
                if (globalUpdateAppTier) globalUpdateAppTier('free');
                Alert.alert(t('common.success'), t('settings.trialCleared'));
              }}
            >
              <Text style={styles.devActionText}>{t('settings.clearTrial')}</Text>
            </Pressable>
          </View>
        </View>
        )}
      </SafeAreaView>
    </ScrollView>
 
    {/* Premium Obsidian-and-Gold OTP Verification Modal */}
    <Modal
      animationType="fade"
      transparent={true}
      visible={otpModalVisible}
      onRequestClose={() => setOtpModalVisible(false)}
    >
      <View style={{ flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.85)', justifyContent: 'center', alignItems: 'center', padding: spacing.md }}>
        <View style={{
          width: '100%',
          maxWidth: 380,
          backgroundColor: '#0F0B06',
          borderColor: colors.amber,
          borderWidth: 2,
          borderRadius: radius.lg,
          overflow: 'hidden',
          padding: spacing.lg,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 10 },
          shadowOpacity: 0.8,
          shadowRadius: 20,
          elevation: 10
        }}>
          <LinearGradient
            colors={['#1F160E', '#0A0805']}
            style={StyleSheet.absoluteFillObject}
          />
 
          <View style={{ alignItems: 'center', marginBottom: spacing.md }}>
            <View style={{
              width: 50,
              height: 50,
              borderRadius: 25,
              backgroundColor: 'rgba(236, 200, 122, 0.1)',
              justifyContent: 'center',
              alignItems: 'center',
              marginBottom: spacing.xs,
              borderColor: 'rgba(236, 200, 122, 0.25)',
              borderWidth: 1
            }}>
              <Feather name="shield" size={24} color={colors.amber} />
            </View>
            <Text style={{
              fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
              fontSize: 22,
              fontWeight: 'bold',
              color: '#fff',
              textAlign: 'center'
            }}>
              {otpStep === 1 
                ? (lang === 'th' ? 'ยืนยันเบอร์โทรศัพท์' : 'Phone Verification')
                : (lang === 'th' ? 'กรอกรหัส OTP 6 หลัก' : 'Enter 6-Digit OTP')}
            </Text>
            <Text style={{
              fontSize: 12,
              color: colors.textSecondary,
              textAlign: 'center',
              marginTop: 4
            }}>
              SECURE AUTHENTICATION LAYER
            </Text>
          </View>
 
          {otpError ? (
            <View style={{
              backgroundColor: 'rgba(239, 68, 68, 0.12)',
              borderColor: colors.danger,
              borderWidth: 1,
              borderRadius: radius.sm,
              padding: spacing.sm,
              marginBottom: spacing.md,
              flexDirection: 'row',
              alignItems: 'center'
            }}>
              <Feather name="alert-triangle" size={16} color={colors.danger} style={{ marginRight: 8 }} />
              <Text style={{ fontSize: 13, color: '#FF7F7F', flex: 1 }}>{otpError}</Text>
            </View>
          ) : null}
 
          {otpStep === 1 ? (
            <View>
              <Text style={{ fontSize: 13, color: colors.textSecondary, marginBottom: spacing.xs }}>
                {lang === 'th' 
                  ? 'กรุณากรอกเบอร์โทรศัพท์เพื่อเริ่มสิทธิ์ทดลองใช้ Premium ฟรี 7 วัน (ข้อกำหนดสิทธิ์: 1 SIM = 1 สิทธิ์การทดลองใช้เท่านั้น)'
                  : 'Please enter your phone number to start the premium 7-day trial (Requirement: 1 SIM = 1 Trial lifetime max).'}
              </Text>
              
              <TextInput
                style={{
                  backgroundColor: 'rgba(0,0,0,0.5)',
                  borderColor: 'rgba(236, 200, 122, 0.4)',
                  borderWidth: 1.5,
                  borderRadius: radius.sm,
                  color: '#fff',
                  padding: spacing.md,
                  fontSize: 16,
                  marginBottom: spacing.md,
                  letterSpacing: 1.5,
                  textAlign: 'center'
                }}
                placeholder="e.g. +66812345678"
                placeholderTextColor="rgba(255,255,255,0.3)"
                keyboardType="phone-pad"
                value={otpPhone}
                onChangeText={(val) => {
                  setOtpPhone(val);
                  setOtpError('');
                }}
                editable={!otpLoading}
              />
 
              <Pressable
                style={({ pressed }) => [{
                  backgroundColor: colors.amber,
                  borderRadius: radius.sm,
                  padding: spacing.md,
                  alignItems: 'center',
                  marginBottom: spacing.sm,
                  opacity: pressed || otpLoading ? 0.8 : 1
                }]}
                onPress={handleRequestOtp}
                disabled={otpLoading}
              >
                {otpLoading ? (
                  <ActivityIndicator size="small" color="#000" />
                ) : (
                  <Text style={{ color: '#000', fontWeight: 'bold', fontSize: 14 }}>
                    {lang === 'th' ? 'ส่งรหัส OTP 6 หลัก' : 'REQUEST OTP CODE'}
                  </Text>
                )}
              </Pressable>
 
              <Pressable
                style={({ pressed }) => [{
                  borderColor: 'rgba(255,255,255,0.2)',
                  borderWidth: 1,
                  borderRadius: radius.sm,
                  padding: spacing.md,
                  alignItems: 'center',
                  opacity: pressed ? 0.7 : 1
                }]}
                onPress={() => setOtpModalVisible(false)}
                disabled={otpLoading}
              >
                <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
                  {lang === 'th' ? 'ยกเลิก' : 'CANCEL'}
                </Text>
              </Pressable>
            </View>
          ) : (
            <View>
              <Text style={{ fontSize: 13, color: colors.textSecondary, marginBottom: spacing.sm }}>
                {otpMessage || (lang === 'th' ? 'ส่งรหัสผ่านเรียบร้อยแล้ว' : 'Verification code sent.')}
              </Text>
 
              {simulatedOtpCode ? (
                <View style={{
                  backgroundColor: 'rgba(236, 200, 122, 0.08)',
                  borderColor: colors.amber,
                  borderWidth: 1,
                  borderStyle: 'dashed',
                  borderRadius: radius.sm,
                  padding: spacing.sm,
                  marginBottom: spacing.md,
                  alignItems: 'center'
                }}>
                  <Text style={{ fontSize: 11, color: colors.amber, fontWeight: 'bold', letterSpacing: 0.5, marginBottom: 2 }}>
                    {lang === 'th' ? 'จำลองบริการ SMS (Supabase + LINE Notify)' : 'SMS GATEWAY SIMULATION'}
                  </Text>
                  <Text style={{ fontSize: 18, color: '#fff', fontWeight: '900', letterSpacing: 3 }}>
                    {simulatedOtpCode}
                  </Text>
                </View>
              ) : null}
 
              <TextInput
                style={{
                  backgroundColor: 'rgba(0,0,0,0.5)',
                  borderColor: colors.amber,
                  borderWidth: 1.5,
                  borderRadius: radius.sm,
                  color: '#fff',
                  padding: spacing.md,
                  fontSize: 22,
                  fontWeight: 'bold',
                  letterSpacing: 8,
                  textAlign: 'center',
                  marginBottom: spacing.md
                }}
                placeholder="------"
                placeholderTextColor="rgba(255,255,255,0.2)"
                keyboardType="number-pad"
                maxLength={6}
                value={otpCode}
                onChangeText={(val) => {
                  setOtpCode(val);
                  setOtpError('');
                }}
                editable={!otpLoading}
              />
 
              <Pressable
                style={({ pressed }) => [{
                  backgroundColor: colors.amber,
                  borderRadius: radius.sm,
                  padding: spacing.md,
                  alignItems: 'center',
                  marginBottom: spacing.sm,
                  opacity: pressed || otpLoading ? 0.8 : 1
                }]}
                onPress={handleVerifyOtp}
                disabled={otpLoading}
              >
                {otpLoading ? (
                  <ActivityIndicator size="small" color="#000" />
                ) : (
                  <Text style={{ color: '#000', fontWeight: 'bold', fontSize: 14 }}>
                    {lang === 'th' ? 'ยืนยันและเริ่มทดลองใช้' : 'VERIFY & START TRIAL'}
                  </Text>
                )}
              </Pressable>
 
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.xs }}>
                <Pressable
                  style={{ padding: spacing.xs }}
                  onPress={() => {
                    setOtpStep(1);
                    setOtpCode('');
                    setOtpError('');
                  }}
                  disabled={otpLoading}
                >
                  <Text style={{ color: colors.amber, fontSize: 12 }}>
                    {lang === 'th' ? '← ย้อนกลับ' : '← Go Back'}
                  </Text>
                </Pressable>
 
                <Pressable
                  style={{ padding: spacing.xs }}
                  onPress={handleRequestOtp}
                  disabled={otpLoading}
                >
                  <Text style={{ color: colors.amber, fontSize: 12 }}>
                    {lang === 'th' ? 'ส่งรหัสอีกครั้ง' : 'Resend Code'}
                  </Text>
                </Pressable>
              </View>
            </View>
          )}
        </View>
      </View>
    </Modal>
  </View>
  );
}
