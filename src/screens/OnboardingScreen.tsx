/**
 * OnboardingScreen — 2-question segmentation quiz.
 *
 * Placement: after OtpScreen login, before Main tab navigator.
 *   - Asks user role (collector / dealer / first-time buyer)
 *   - Asks preferred watch brand (rolex / patek / ap / omega / other)
 *
 * Skippable but every choice + skip is logged as a funnel_event so we
 * can later A/B test ordering, required vs optional, etc. The collected
 * data drives segment-aware paywall copy in Phase 2 (MembershipScreen
 * reads userProfile.role to highlight the most relevant tier).
 *
 * Privacy: role/brand are category data (not PII) so we can write to
 * user_profile even before dataConsent.granted=true. funnelEvents call
 * is still gated by consent — silently drops if the user opted out.
 *
 * UI follows the Champagne Gold palette established for PDF reports
 * (Cinzel headings, #ECC87A accent). Keeps the luxury feel consistent.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useLanguage } from '../lib/localization';
import { RootStackParamList } from '../lib/types';
import {
  upsertUserProfile,
  type UserRole,
  type PreferredBrand,
} from '../lib/userProfile';
import { logFunnelEvent } from '../lib/funnelEvents';

type Props = NativeStackScreenProps<RootStackParamList, 'Onboarding'>;

type Step = 1 | 2;

// Champagne Gold palette — matches the PDF + UI accent direction.
const COLORS = {
  bgTop: '#1F130E',
  bgBot: '#0A0805',
  card: 'rgba(26, 22, 18, 0.6)',
  border: 'rgba(212, 185, 140, 0.30)',
  borderActive: '#ECC87A',
  cream: '#EDE0BD',
  gold: '#ECC87A',
  muted: '#A0978A',
  text: '#FFFFFF',
};

export function OnboardingScreen({ navigation }: Props) {
  const { lang } = useLanguage();
  const [step, setStep] = useState<Step>(1);
  const [role, setRole] = useState<UserRole | null>(null);
  const [brand, setBrand] = useState<PreferredBrand | null>(null);
  const startedAtRef = useRef<number>(Date.now());

  useEffect(() => {
    // Fire onboarding_started exactly once when the user lands here.
    logFunnelEvent('onboarding_started', { step: 1 }).catch(() => {});
  }, []);

  const goToMain = () => navigation.replace('Main');

  const handleSkip = () => {
    logFunnelEvent('onboarding_skipped', { step_skipped_at: step }).catch(() => {});
    // Mark onboarding as done locally even on skip — we won't re-prompt.
    // Users who skip can still go through Settings to set role later (Phase 2).
    void upsertUserProfile({ onboardingDone: true }).catch(() => {});
    goToMain();
  };

  const handleRoleChoice = (chosen: UserRole) => {
    setRole(chosen);
    // Tiny delay so the user sees the selection animation before transitioning
    setTimeout(() => setStep(2), 220);
  };

  const handleBrandChoice = async (chosen: PreferredBrand) => {
    setBrand(chosen);
    const elapsed = Date.now() - startedAtRef.current;
    // Persist + log + advance
    await upsertUserProfile({
      role: role ?? undefined,
      preferredBrand: chosen,
      onboardingDone: true,
      language: lang,
    }).catch(() => {});
    logFunnelEvent('onboarding_completed', {
      role: role ?? null,
      preferred_brand: chosen,
      time_spent_ms: elapsed,
    }).catch(() => {});
    setTimeout(goToMain, 280);
  };

  // ── Role options ────────────────────────────────────────────
  const roleOptions: { id: UserRole; emoji: string; titleTh: string; titleEn: string; subTh: string; subEn: string }[] = [
    {
      id: 'collector',
      emoji: '👑',
      titleTh: 'นักสะสมนาฬิกา',
      titleEn: 'Collector',
      subTh: 'ตรวจสอบของแท้ในคอลเลกชั่นส่วนตัว',
      subEn: 'Verify pieces in my personal collection',
    },
    {
      id: 'dealer',
      emoji: '💼',
      titleTh: 'ดีลเลอร์ / พ่อค้านาฬิกา',
      titleEn: 'Dealer',
      subTh: 'ตรวจสอบเชิงพาณิชย์ + ใบรับรอง PDF',
      subEn: 'Commercial verification + PDF certs',
    },
    {
      id: 'first_time',
      emoji: '🆕',
      titleTh: 'มือใหม่ / ตรวจสอบเรือนแรก',
      titleEn: 'First-time Buyer',
      subTh: 'อยากตรวจของก่อนซื้อ',
      subEn: 'Want to verify before purchasing',
    },
  ];

  // ── Brand options ───────────────────────────────────────────
  const brandOptions: { id: PreferredBrand; label: string; emoji: string }[] = [
    { id: 'rolex', label: 'Rolex', emoji: '👑' },
    { id: 'patek', label: 'Patek Philippe', emoji: '✨' },
    { id: 'ap', label: 'Audemars Piguet', emoji: '🔷' },
    { id: 'omega', label: 'Omega', emoji: '🌑' },
    { id: 'other', label: lang === 'th' ? 'แบรนด์อื่น' : 'Other brand', emoji: '⌚' },
  ];

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />
      <LinearGradient
        colors={[COLORS.bgTop, COLORS.bgBot]}
        style={StyleSheet.absoluteFillObject}
      />

      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        {/* Skip button — top-right, low-emphasis */}
        <View style={styles.topBar}>
          <View style={styles.progressDots}>
            <View style={[styles.dot, step >= 1 && styles.dotActive]} />
            <View style={[styles.dot, step >= 2 && styles.dotActive]} />
          </View>
          <Pressable onPress={handleSkip} hitSlop={12}>
            <Text style={styles.skipText}>
              {lang === 'th' ? 'ข้าม' : 'Skip'}
            </Text>
          </Pressable>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {step === 1 && (
            <View style={styles.stepWrap}>
              <Text style={styles.eyebrow}>
                {lang === 'th' ? '— เริ่มต้นใช้งาน —' : '— GETTING STARTED —'}
              </Text>
              <Text style={styles.title}>
                {lang === 'th' ? 'คุณใช้แอปในฐานะใด?' : 'What brings you here?'}
              </Text>
              <Text style={styles.subtitle}>
                {lang === 'th'
                  ? 'เราจะปรับฟีเจอร์และข้อเสนอให้ตรงกับการใช้งานของคุณ'
                  : 'We’ll tailor features and offers to match your usage.'}
              </Text>

              <View style={styles.optionsList}>
                {roleOptions.map((opt) => (
                  <Pressable
                    key={opt.id}
                    style={({ pressed }) => [
                      styles.optionCard,
                      role === opt.id && styles.optionCardActive,
                      pressed && { opacity: 0.85 },
                    ]}
                    onPress={() => handleRoleChoice(opt.id)}
                  >
                    <Text style={styles.optionEmoji}>{opt.emoji}</Text>
                    <View style={styles.optionTextWrap}>
                      <Text style={styles.optionTitle}>
                        {lang === 'th' ? opt.titleTh : opt.titleEn}
                      </Text>
                      <Text style={styles.optionSub}>
                        {lang === 'th' ? opt.subTh : opt.subEn}
                      </Text>
                    </View>
                    <Feather
                      name={role === opt.id ? 'check-circle' : 'chevron-right'}
                      size={20}
                      color={role === opt.id ? COLORS.gold : COLORS.muted}
                    />
                  </Pressable>
                ))}
              </View>
            </View>
          )}

          {step === 2 && (
            <View style={styles.stepWrap}>
              <Text style={styles.eyebrow}>
                {lang === 'th' ? '— เกือบเสร็จแล้ว —' : '— ALMOST DONE —'}
              </Text>
              <Text style={styles.title}>
                {lang === 'th'
                  ? 'แบรนด์ใดที่คุณสนใจมากที่สุด?'
                  : 'Which brand interests you most?'}
              </Text>
              <Text style={styles.subtitle}>
                {lang === 'th'
                  ? 'เราจะใช้ข้อมูลนี้แสดงแบรนด์ที่เกี่ยวข้องในหน้าหลักก่อน'
                  : 'We’ll surface your favourite brand first on the home screen.'}
              </Text>

              <View style={styles.optionsList}>
                {brandOptions.map((opt) => (
                  <Pressable
                    key={opt.id}
                    style={({ pressed }) => [
                      styles.optionCard,
                      brand === opt.id && styles.optionCardActive,
                      pressed && { opacity: 0.85 },
                    ]}
                    onPress={() => handleBrandChoice(opt.id)}
                  >
                    <Text style={styles.optionEmoji}>{opt.emoji}</Text>
                    <View style={styles.optionTextWrap}>
                      <Text style={styles.optionTitle}>{opt.label}</Text>
                    </View>
                    <Feather
                      name={brand === opt.id ? 'check-circle' : 'chevron-right'}
                      size={20}
                      color={brand === opt.id ? COLORS.gold : COLORS.muted}
                    />
                  </Pressable>
                ))}
              </View>

              <Pressable
                onPress={() => setStep(1)}
                style={styles.backButton}
                hitSlop={10}
              >
                <Feather name="arrow-left" size={14} color={COLORS.muted} />
                <Text style={styles.backText}>
                  {lang === 'th' ? 'ย้อนกลับ' : 'Back'}
                </Text>
              </Pressable>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bgBot },
  safe: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: 12,
  },
  progressDots: { flexDirection: 'row', gap: 6 },
  dot: {
    width: 22,
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(212, 185, 140, 0.20)',
  },
  dotActive: { backgroundColor: COLORS.gold },
  skipText: {
    color: COLORS.muted,
    fontSize: 14,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 24, paddingTop: 24, paddingBottom: 40 },
  stepWrap: { gap: 8 },
  eyebrow: {
    color: COLORS.gold,
    fontSize: 11,
    letterSpacing: 3,
    textTransform: 'uppercase',
    textAlign: 'center',
    marginBottom: 8,
  },
  title: {
    color: COLORS.cream,
    fontSize: 26,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: 0.5,
    lineHeight: 34,
  },
  subtitle: {
    color: COLORS.muted,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginTop: 4,
    marginBottom: 28,
  },
  optionsList: { gap: 12 },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 18,
    gap: 14,
  },
  optionCardActive: {
    borderColor: COLORS.borderActive,
    backgroundColor: 'rgba(212, 185, 140, 0.08)',
  },
  optionEmoji: { fontSize: 26 },
  optionTextWrap: { flex: 1, gap: 2 },
  optionTitle: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  optionSub: {
    color: COLORS.muted,
    fontSize: 12.5,
    lineHeight: 17,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 18,
    paddingVertical: 10,
  },
  backText: {
    color: COLORS.muted,
    fontSize: 13,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
});
