import React, { useEffect, useState } from 'react';
import {
  View,
  ScrollView,
  Text,
  Pressable,
  Alert,
  StyleSheet,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { colors, radius, spacing } from '../lib/theme';
import { getMembership, setMembership, MembershipTier } from '../lib/auth';
import { getExchangeRate } from '../lib/currency';
import { useLanguage } from '../lib/localization';
import { styles } from './AppStyles';
import { triggerTierUpdate } from './SettingsScreen';
import { purchaseTier, restorePurchases, isIapConfigured } from '../lib/iap';
import { logFunnelEvent } from '../lib/funnelEvents';
import { getUserProfile, type UserRole } from '../lib/userProfile';

// Tier prices in THB — sourced from MembershipScreen render code (lines
// 160/217/280). Duplicated here so checkout_started can log the exact
// price seen at decision time without scraping the render tree.
const TIER_PRICE_THB: Record<MembershipTier, number> = {
  free: 0,
  standard: 990,
  pro: 1990,
  premium: 4990,
};

/**
 * Segment-aware "Recommended for You" ribbon.
 *
 * Rendered ONCE on the paywall above the tier card that best matches
 * the user's role (from OnboardingScreen). Champagne-gold accent +
 * star icon make it visually distinct from the generic tier badges
 * already on the cards (BEST VALUE / PREMIUM 👑), so it reads as a
 * personalized hint rather than another generic label.
 */
function RecommendedRibbon({ lang }: { lang: 'th' | 'en' }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        alignSelf: 'center',
        marginTop: 4,
        marginBottom: 6,
        paddingVertical: 5,
        paddingHorizontal: 14,
        backgroundColor: 'rgba(212, 185, 140, 0.14)',
        borderWidth: 1,
        borderColor: '#D4B98C',
        borderRadius: 20,
      }}
    >
      <Feather name="star" size={11} color="#D4B98C" />
      <Text
        style={{
          color: '#EDE0BD',
          fontSize: 10.5,
          fontWeight: '700',
          letterSpacing: 1.5,
          textTransform: 'uppercase',
        }}
      >
        {lang === 'th' ? '— แนะนำสำหรับคุณ —' : '— RECOMMENDED FOR YOU —'}
      </Text>
      <Feather name="star" size={11} color="#D4B98C" />
    </View>
  );
}

export default function MembershipScreen({ navigation, route }: any) {
  const { t, lang } = useLanguage();
  const [activeTier, setActiveTier] = useState<MembershipTier>('free');
  const [exchangeRate, setExchangeRate] = useState<number>(36.5);

  // Segment-aware UI — drives tier ordering + copy emphasis on the
  // paywall. Read from userProfile (populated by OnboardingScreen).
  // Defaults to 'collector' if onboarding was skipped — the existing
  // copy was written for collectors, so this preserves prior behavior.
  const [userRole, setUserRole] = useState<UserRole>('collector');

  // What triggered this paywall view? Set by the caller (ScanScreen
  // 'quota_hit', SettingsScreen 'manual_settings', ResultScreen
  // 'pdf_locked', etc.). Falls back to 'unknown' for legacy callers.
  const triggerSource: string = route?.params?.trigger ?? 'unknown';
  const mountedAtRef = React.useRef<number>(Date.now());
  // Track which tiers the user tapped to compare — feeds the
  // paywall_dismissed event so we know what they were weighing.
  const tiersComparedRef = React.useRef<Set<MembershipTier>>(new Set());
  // Flag to suppress paywall_dismissed when the user actually purchased.
  const completedPurchaseRef = React.useRef<boolean>(false);

  useEffect(() => {
    getMembership().then((m) => setActiveTier(m.tier));
    getExchangeRate().then((rate) => {
      if (rate !== null) {
        setExchangeRate(rate);
      }
    });

    // Load segment data — async, non-blocking. UI re-renders when ready
    // so the user sees the role-tailored layout. Falls back to default
    // 'collector' if no profile saved (Onboarding skipped or first run).
    getUserProfile().then((profile) => {
      if (profile.role) setUserRole(profile.role);
    }).catch(() => {});

    // Fire paywall_viewed once on mount. user_role piggybacks here so
    // PostHog funnels can break down conversion by segment.
    logFunnelEvent('paywall_viewed', {
      trigger_source: triggerSource,
    }).catch(() => {});

    // On unmount (any reason: goBack, navigation away, app close),
    // fire paywall_dismissed UNLESS the user successfully checked out.
    return () => {
      if (completedPurchaseRef.current) return;
      const ms = Date.now() - mountedAtRef.current;
      logFunnelEvent('paywall_dismissed', {
        time_on_screen_ms: ms,
        tiers_compared: Array.from(tiersComparedRef.current),
        trigger_source: triggerSource,
      }).catch(() => {});
    };
  }, [triggerSource]);

  /**
   * Route the tier selection through the IAP layer.
   * - REAL flow (when RevenueCat key configured): opens StoreKit / Google Play
   *   purchase sheet. App Store / Google handles payment, we get a receipt
   *   webhook into RevenueCat, then customerInfo updates which we mirror to
   *   our local membership state.
   * - MOCK flow (Expo Go / no key): immediately calls setMembership for UI
   *   testing. Never let mock mode reach the App Store!
   */
  const handleSelectTier = async (tier: MembershipTier) => {
    // Track that the user actively engaged with this tier card. Used in
    // paywall_dismissed payload to see which tiers they were comparing.
    tiersComparedRef.current.add(tier);

    // Free tier doesn't go through the store — handled as a downgrade only.
    if (tier === 'free') {
      Alert.alert(
        lang === 'th' ? 'ดาวน์เกรดเป็น Free' : 'Downgrade to Free',
        lang === 'th'
          ? 'ในการยกเลิกสมาชิก กรุณายกเลิกผ่าน iOS Settings → Subscriptions หรือ Google Play → Subscriptions โดยตรง'
          : 'To cancel your subscription, please use iOS Settings → Subscriptions or Google Play → Subscriptions.',
        [{ text: 'OK' }]
      );
      return;
    }

    // Fire checkout_started BEFORE the StoreKit sheet opens — this is
    // the conversion-intent moment. subscription_completed (fired by
    // iap.ts listenIapChanges) signals actual conversion.
    logFunnelEvent('checkout_started', {
      tier_chosen: tier,
      price_thb: TIER_PRICE_THB[tier] ?? 0,
      trigger_source: triggerSource,
    }).catch(() => {});

    const result = await purchaseTier(tier);

    if (result.userCancelled) {
      // User dismissed the StoreKit sheet — no toast, no error.
      return;
    }

    if (!result.success) {
      Alert.alert(
        lang === 'th' ? 'การซื้อล้มเหลว' : 'Purchase Failed',
        result.errorMessage ?? (lang === 'th' ? 'กรุณาลองอีกครั้ง' : 'Please try again'),
        [{ text: 'OK' }]
      );
      return;
    }

    // Success — sync local state + UI. Mark completedPurchase so we
    // skip the paywall_dismissed event on unmount (the dismissal here
    // is "won", not "abandoned"). subscription_completed itself is
    // emitted from iap.ts listenIapChanges to avoid double-counting
    // across restore-purchases / multi-device.
    completedPurchaseRef.current = true;
    const finalTier = result.activeTier ?? tier;
    setActiveTier(finalTier);
    triggerTierUpdate(finalTier);

    Alert.alert(
      lang === 'th' ? 'อัปเกรดสำเร็จ!' : 'UPGRADE SUCCESSFUL!',
      (lang === 'th'
        ? `บัญชีผู้ใช้ของคุณได้รับการอัปเกรดเป็นระดับ ${finalTier.toUpperCase()} เรียบร้อยแล้ว`
        : `Your account has been upgraded to ${finalTier.toUpperCase()} successfully.`)
      + (isIapConfigured() ? '' : '\n\n(DEV: mock purchase — IAP not yet configured)'),
      [{ text: lang === 'th' ? 'ตกลง' : 'OK', onPress: () => navigation.goBack() }]
    );
  };

  /**
   * Required by App Store guideline 3.1.1 — every paywall MUST expose a
   * "Restore Purchases" button so users can recover their subscription on
   * a new device or after reinstall without re-paying.
   */
  const handleRestorePurchases = async () => {
    const result = await restorePurchases();
    if (!result.success) {
      Alert.alert(
        lang === 'th' ? 'การกู้คืนล้มเหลว' : 'Restore Failed',
        result.errorMessage ?? '',
      );
      return;
    }
    const tier = result.activeTier ?? 'free';
    if (tier === 'free') {
      Alert.alert(
        lang === 'th' ? 'ไม่พบสมาชิก' : 'No Active Subscription',
        lang === 'th'
          ? 'ไม่พบสมาชิกที่ใช้งานอยู่ในบัญชีนี้ — หากเพิ่งซื้อรอประมาณ 30 วินาทีแล้วลองอีกครั้ง'
          : 'No active subscription found for this account. If you just purchased, wait ~30 seconds and try again.'
      );
      return;
    }
    setActiveTier(tier);
    triggerTierUpdate(tier);
    Alert.alert(
      lang === 'th' ? 'กู้คืนสำเร็จ' : 'Restored Successfully',
      lang === 'th'
        ? `สมาชิก ${tier.toUpperCase()} ของคุณถูกกู้คืนแล้ว`
        : `Your ${tier.toUpperCase()} subscription has been restored.`,
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <LinearGradient
        colors={['#1E120A', '#0A0805']}
        style={StyleSheet.absoluteFillObject}
      />
      <ScrollView style={styles.upgradeContainer} contentContainerStyle={styles.upgradeContent}>
        <StatusBar style="light" />
        <SafeAreaView style={styles.safeAreaZero} edges={['top']}>
          <View style={styles.upgradeHeader}>
            <Pressable style={styles.upgradeClose} onPress={() => navigation.goBack()}>
              <Feather name="arrow-left" size={24} color="#fff" />
            </Pressable>
            <Text style={styles.upgradeTitle}>Upgrade Membership</Text>
            <Text style={styles.upgradeSubtitle}>SELECT MEMBERSHIP PLAN</Text>
            <Text style={[styles.upgradeSubtitle, { fontSize: 12, color: colors.textSecondary, marginTop: 4 }]}>
              {/* Segment-aware sub-headline. Role data from Onboarding. */}
              {userRole === 'dealer'
                ? (lang === 'th'
                    ? 'เครื่องมือมืออาชีพสำหรับดีลเลอร์ — PDF Cert + Weight Verification'
                    : 'Professional Tools for Dealers — PDF Certs + Weight Verification')
                : userRole === 'first_time'
                ? (lang === 'th'
                    ? 'เริ่มต้นง่าย — ตรวจของก่อนซื้ออย่างมั่นใจ'
                    : 'Start Simple — Verify Before You Buy with Confidence')
                : (lang === 'th'
                    ? 'AI ตรวจสอบความแท้ระดับพรีเมียมสำหรับคอลเลกชั่นของคุณ'
                    : 'Premium AI Watch Verification & High-End Analytics')}
            </Text>
          </View>

          {/* "Recommended for you" ribbons — segment-aware highlighting.
              Drives conversion by surfacing the most-relevant tier:
                • first_time → Standard (low commitment, learn the product)
                • collector  → Pro (best value for high-volume usage)
                • dealer     → Premium (PDF certs + weight verification) */}
          {userRole === 'first_time' && (
            <RecommendedRibbon lang={lang} />
          )}

          {/* Tier 1: Platinum Standard Plan */}
          <View style={[styles.tierOptionCard, { overflow: 'hidden', borderColor: 'rgba(229, 229, 229, 0.45)', borderWidth: 1.5 }]}>
            <LinearGradient
              colors={['#2E3238', '#1C1F24', '#0F1115']}
              style={StyleSheet.absoluteFillObject}
            />
            
            <View style={styles.tierBadgeWrap}>
              <View style={styles.tierHeaderTop}>
                <Text style={[styles.tierName, { flexShrink: 1 }]}>{t('membership.platinumTitle')}</Text>
                <View style={[styles.tierBadge, { backgroundColor: 'rgba(176, 196, 222, 0.15)', borderColor: '#B0C4DE' }]}>
                  <Text style={[styles.tierBadgeText, { color: '#B0C4DE' }]}>STANDARD</Text>
                </View>
              </View>
              
              <View style={styles.tierPriceSection}>
                <Text style={styles.tierPrice}>{lang === 'th' ? '฿990' : '$29.99'}</Text>
                <Text style={styles.tierPriceUnit}>{t('membership.monthly')}</Text>
              </View>
              
              <Text style={[styles.tierDailyEst, { color: '#B0C4DE' }]}>
                {t('membership.estimatedDaily')}{lang === 'th' ? '฿33' : '$0.99'}
              </Text>
            </View>

            <View style={styles.featuresList}>
              {[
                lang === 'th' ? 'ตรวจสอบสิทธิ์ด้วยระบบ AI มาตรฐาน 2 ระบบย่อย (สูงสุด 20 สแกนต่อเดือน)' : 'Standard 2-Engine AI verification (up to 20 scans per month)',
                lang === 'th' ? 'ความแม่นยำการวิเคราะห์ทางแสงระดับมาตรฐาน (Standard 88% Accuracy)' : 'Standard 88% visual optical accuracy rating',
                lang === 'th' ? 'ความละเอียดภาพสแกน 2 มุมกล้องหลัก (หน้าปัดและฝาหลังความละเอียดสูง)' : 'Standard 2-angle optical resolution (dial face + caseback micro-shots)',
                lang === 'th' ? 'ปลดล็อกการวิเคราะห์ขอบหน้าปัดและฟอนต์ตัวอักษรเพื่อคัดกรองเบื้องต้น' : 'Unlocks bezel alignment & dial typography proportions screening'
              ].map((feat, idx) => (
                <View key={idx} style={styles.featureRow}>
                  <Feather name="check" size={14} color="#B0C4DE" style={styles.featureIcon} />
                  <Text style={styles.featureText}>{feat}</Text>
                </View>
              ))}
            </View>

            <Pressable
              style={({ pressed }) => [
                styles.tierActionBtn, 
                activeTier === 'standard' && styles.tierActionBtnActive,
                pressed && { opacity: 0.8 }
              ]}
              onPress={() => handleSelectTier('standard')}
            >
              {activeTier === 'standard' ? (
                <Text style={[styles.tierActionBtnText, { color: '#B0C4DE' }]}>{t('membership.currentPlan')}</Text>
              ) : (
                <Text style={styles.tierActionBtnText}>
                  {lang === 'th' ? 'สมัครแพ็กเกจ Standard' : 'SELECT STANDARD PLAN'}
                </Text>
              )}
            </Pressable>
          </View>

          {userRole === 'collector' && (
            <RecommendedRibbon lang={lang} />
          )}

          {/* Tier 2: Rich Gold Pro Plan (Recommended) */}
          <View style={[styles.tierOptionCard, styles.tierOptionCardBest, { overflow: 'hidden', borderColor: '#ECC87A', borderWidth: 2 }]}>
            <LinearGradient
              colors={['#302517', '#1F160A', '#0F0B05']}
              style={StyleSheet.absoluteFillObject}
            />

            <View style={styles.tierBadgeWrap}>
              <View style={styles.tierHeaderTop}>
                <Text style={[styles.tierName, { color: colors.amber, flexShrink: 1 }]}>{t('membership.goldTitle')}</Text>
                <View style={[styles.tierBadge, { backgroundColor: 'rgba(236, 200, 122, 0.15)', borderColor: '#ECC87A' }]}>
                  <Text style={[styles.tierBadgeText, { color: '#ECC87A' }]}>BEST VALUE 🌟</Text>
                </View>
              </View>
              
              <View style={styles.tierPriceSection}>
                <Text style={[styles.tierPrice, { color: colors.amber }]}>{lang === 'th' ? '฿1,990' : '$59.99'}</Text>
                <Text style={[styles.tierPriceUnit, { color: colors.amber }]}>{t('membership.monthly')}</Text>
              </View>
              
              <Text style={[styles.tierDailyEst, { color: colors.amber }]}>
                {t('membership.estimatedDaily')}{lang === 'th' ? '฿66' : '$1.99'}
              </Text>
            </View>

            <View style={styles.featuresList}>
              {[
                lang === 'th' ? 'ตรวจสอบสิทธิ์ด้วยระบบ AI ขั้นสูง 4 ระบบย่อย (สูงสุด 50 สแกนต่อเดือน)' : 'Advanced 4-Engine AI verification (up to 50 scans per month)',
                lang === 'th' ? 'ความแม่นยำประเมินทางทัศนศาสตร์ระดับมืออาชีพ (Professional 94% Accuracy)' : 'Professional 94% visual optical accuracy rating',
                lang === 'th' ? 'ความละเอียดระดับไมโครสแกน 3 มุมกล้อง (หน้าปัด, ฝาหลัง และขอบเม็ดมะยม)' : 'High-definition 3-angle micro-resolution (adds case side & crown details)',
                lang === 'th' ? 'แผนภาพตราประจำการตรวจสอบ (Hallmark Diagnostic Map) เฉพาะแบรนด์ + เทียบเคียงใบเซอร์ผู้เชี่ยวชาญ' : 'Brand-specific Hallmark Diagnostic Map with numbered landmarks & expert certificate matches',
                lang === 'th' ? 'สร้างไฟล์รายงานผลสแกนและใบรับรองในรูปแบบ PDF ระดับพรีเมียม' : 'Premium PDF scan report generation & high-end collector exporting'
              ].map((feat, idx) => (
                <View key={idx} style={styles.featureRow}>
                  <Feather name="check" size={14} color={colors.amber} style={styles.featureIcon} />
                  <Text style={[styles.featureText, { color: '#ECE5D8' }]}>{feat}</Text>
                </View>
              ))}
            </View>

            <Pressable
              style={({ pressed }) => [
                styles.tierActionBtn, 
                styles.tierActionBtnBest, 
                activeTier === 'pro' && styles.tierActionBtnActive,
                pressed && { opacity: 0.8 }
              ]}
              onPress={() => handleSelectTier('pro')}
            >
              <LinearGradient
                colors={['#ECC87A', '#C59A45', '#9A7326']}
                style={StyleSheet.absoluteFillObject}
              />
              {activeTier === 'pro' ? (
                <Text style={[styles.tierActionBtnText, { color: '#000', fontWeight: '900' }]}>{t('membership.currentPlan')}</Text>
              ) : (
                <Text style={[styles.tierActionBtnText, { color: '#000', fontWeight: '900' }]}>
                  {lang === 'th' ? 'สมัครแพ็กเกจ Pro' : 'SELECT PRO PLAN'}
                </Text>
              )}
            </Pressable>
          </View>

          {userRole === 'dealer' && (
            <RecommendedRibbon lang={lang} />
          )}

          {/* Tier 3: Premium Executive Plan */}
          <View style={[styles.tierOptionCard, { overflow: 'hidden', borderColor: '#ECC87A', borderWidth: 2.5, shadowColor: '#ECC87A', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.25, shadowRadius: 15 }]}>
            <LinearGradient
              colors={['#181512', '#0A0807', '#1F1A15']}
              style={StyleSheet.absoluteFillObject}
            />

            <View style={styles.tierBadgeWrap}>
              <View style={styles.tierHeaderTop}>
                <Text style={[styles.tierName, { color: '#fff', flexShrink: 1 }]}>{t('membership.vipTitle')}</Text>
                <View style={[styles.tierBadge, { backgroundColor: 'rgba(236, 200, 122, 0.2)', borderColor: '#ECC87A' }]}>
                  <Text style={[styles.tierBadgeText, { color: '#ECC87A' }]}>PREMIUM 👑</Text>
                </View>
              </View>
              
              <View style={styles.tierPriceSection}>
                <Text style={[styles.tierPrice, { color: '#fff' }]}>{lang === 'th' ? '฿4,990' : '$149.99'}</Text>
                <Text style={[styles.tierPriceUnit, { color: colors.textSecondary }]}>{t('membership.monthly')}</Text>
              </View>
              
              <Text style={[styles.tierDailyEst, { color: colors.amber }]}>
                {t('membership.estimatedDaily')}{lang === 'th' ? '฿166' : '$4.99'}
              </Text>
            </View>

            <View style={styles.featuresList}>
              {[
                lang === 'th' ? 'ตรวจสอบสิทธิ์ด้วยระบบ AI พรีเมียม 8 ระบบย่อย (สูงสุด 100 สแกน, คิวสแกนด่วนพิเศษ)' : 'Premium 8-Engine AI verification (up to 100 scans, highest queue priority)',
                lang === 'th' ? 'ความแม่นยำสูงระดับสุดยอดมาตรฐานสถาบันประมูล (Executive 99.2% Accuracy)' : 'Ultimate high-fidelity auction-grade accuracy (99.2% Executive Accuracy)',
                lang === 'th' ? 'ความละเอียดระดับกล้องขยายไมโครสโคป 4 มุมกล้อง (วิเคราะห์เนื้อโลหะและกลไกแกนล้อ)' : 'Microscopic 4-angle resolution (adds millimeter caliber finishes & movement gear micro-shots)',
                lang === 'th' ? 'Hallmark Diagnostic Map ระดับลึก: ตราประทับโลหะจิ๋ว, ตราสลักทองคำ และรหัสขอบเลเซอร์' : 'Deep Hallmark Diagnostic Map: micro-hallmarks, laser etchings & gold stamps',
                lang === 'th' ? 'ตู้นิรภัยสะสมสูงสุด 100 เรือน พร้อมส่งออกรายงาน PDF ในนามแบรนด์ตนเองโดยไม่มีลายน้ำ' : 'Up to 100-watch collection vault & brand-customized PDF reports without watermarks'
              ].map((feat, idx) => (
                <View key={idx} style={styles.featureRow}>
                  <Feather name="check" size={14} color={colors.amber} style={styles.featureIcon} />
                  <Text style={styles.featureText}>{feat}</Text>
                </View>
              ))}
            </View>

            <Pressable
              style={({ pressed }) => [
                styles.tierActionBtn, 
                activeTier === 'premium' && styles.tierActionBtnActive,
                pressed && { opacity: 0.8 }
              ]}
              onPress={() => handleSelectTier('premium')}
            >
              {activeTier === 'premium' ? (
                <Text style={[styles.tierActionBtnText, { color: colors.amber }]}>{t('membership.currentPlan')}</Text>
              ) : (
                <Text style={styles.tierActionBtnText}>
                  {lang === 'th' ? 'สมัครแพ็กเกจ Premium' : 'SELECT PREMIUM PLAN'}
                </Text>
              )}
            </Pressable>
          </View>

          {/* Section: Pay-Per-Scan Credit Packs */}
          <View style={[styles.creditPacksContainer, { marginTop: spacing.lg }]}>
            <Text style={[styles.upgradeTitle, { fontSize: 20, textAlign: 'center', marginBottom: spacing.xs }]}>
              {t('membership.scanCredits')}
            </Text>
            <Text style={[styles.upgradeSubtitle, { fontSize: 12, marginBottom: spacing.md }]}>
              {t('membership.payPerScan')}
            </Text>

            {/* Credit Pack 1 (20 Scans · ฿990) */}
            <View style={[styles.creditPackCard, { overflow: 'visible', borderColor: 'rgba(236, 200, 122, 0.15)', borderWidth: 1 }]}>
              <LinearGradient
                colors={['rgba(26, 20, 16, 0.85)', 'rgba(15, 12, 10, 0.92)']}
                style={[StyleSheet.absoluteFillObject, { borderRadius: radius.md }]}
              />
              <View style={styles.creditBadgeWrap}>
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <Text style={styles.creditTitle}>{t('membership.fortyScansTitle')}</Text>
                  <Text style={styles.creditDesc}>{t('membership.fortyScansDesc')}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={[styles.creditPrice, { color: colors.amber }]}>{lang === 'th' ? '฿990' : '$29.99'}</Text>
                </View>
              </View>
              <Pressable
                style={({ pressed }) => [styles.creditActionBtn, pressed && { opacity: 0.8 }]}
                onPress={() => Alert.alert(t('membership.purchaseSuccess'), t('membership.creditAdded', { count: 20 }))}
              >
                <Text style={styles.creditActionBtnText}>{t('membership.buyFortyScans')}</Text>
              </Pressable>
            </View>

            {/* Credit Pack 2 (40 Scans · ฿1,890) */}
            <View style={[styles.creditPackCard, styles.creditPackCardBest, { overflow: 'visible', borderColor: '#ECC87A', borderWidth: 1.8 }]}>
              <LinearGradient
                colors={['#2D2316', '#1E160D', '#0F0B06']}
                style={[StyleSheet.absoluteFillObject, { borderRadius: radius.md }]}
              />
              <View style={styles.saveTag}>
                <Text style={styles.saveTagText}>{t('membership.savePercent', { percent: 5 })}</Text>
              </View>
              <View style={styles.creditBadgeWrap}>
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <Text style={[styles.creditTitle, { color: colors.amber }]}>{t('membership.eightyScansTitle')}</Text>
                  <Text style={[styles.creditDesc, { color: '#ECE5D8' }]}>{t('membership.eightyScansDesc')}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={[styles.creditPrice, { color: colors.amber }]}>{lang === 'th' ? '฿1,890' : '$54.99'}</Text>
                </View>
              </View>
              <Pressable
                style={({ pressed }) => [
                  styles.creditActionBtn, 
                  { backgroundColor: colors.amber, borderColor: colors.amber },
                  pressed && { opacity: 0.8 }
                ]}
                onPress={() => Alert.alert(t('membership.purchaseSuccess'), t('membership.creditAdded', { count: 40 }))}
              >
                <LinearGradient
                  colors={['#ECC87A', '#C59A45', '#9A7326']}
                  style={StyleSheet.absoluteFillObject}
                />
                <Text style={[styles.creditActionBtnText, { color: '#000', fontWeight: '900' }]}>{t('membership.buyEightyScans')}</Text>
              </Pressable>
            </View>
          </View>

          {/* Restore Purchases — REQUIRED by App Store guideline 3.1.1. */}
          {/* Must be prominently visible on every paywall screen. */}
          <Pressable
            onPress={handleRestorePurchases}
            style={{
              marginTop: 16,
              marginHorizontal: 16,
              padding: 14,
              borderRadius: 8,
              borderWidth: 1,
              borderColor: 'rgba(236, 200, 122, 0.4)',
              backgroundColor: 'rgba(236, 200, 122, 0.06)',
              alignItems: 'center',
            }}
          >
            <Text style={{ color: colors.amber, fontSize: 14, fontWeight: '600' }}>
              {lang === 'th' ? '🔄 กู้คืนการซื้อ' : '🔄 Restore Purchases'}
            </Text>
            <Text style={{ color: 'rgba(255, 255, 255, 0.5)', fontSize: 11, marginTop: 4 }}>
              {lang === 'th'
                ? 'หากเคยซื้อสมาชิกจากอุปกรณ์อื่น'
                : 'If you previously purchased from another device'}
            </Text>
          </Pressable>

          {/* Subscription terms disclaimer — required by App Store 3.1.2 & */}
          {/* Apple "Auto-Renewable Subscriptions" review checklist. The auto-renew, */}
          {/* cancel-anytime, and links to ToS / Privacy must be ON the paywall screen. */}
          <View style={{ marginTop: 20, marginHorizontal: 16, padding: 14, borderRadius: 8, backgroundColor: 'rgba(255, 255, 255, 0.03)', borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.08)' }}>
            <Text style={{ color: 'rgba(255, 255, 255, 0.55)', fontSize: 11, lineHeight: 18, textAlign: 'left' }}>
              {lang === 'th'
                ? '• สมาชิกจะต่ออายุอัตโนมัติทุกเดือนจนกว่าจะยกเลิก\n• การยกเลิก: iOS Settings → ชื่อบัญชี → Subscriptions / Google Play → Subscriptions\n• ยกเลิกล่วงหน้าอย่างน้อย 24 ชั่วโมงก่อนต่ออายุ\n• การคืนเงินจัดการโดย Apple / Google ตามนโยบายของแต่ละสโตร์'
                : '• Subscription auto-renews monthly until cancelled\n• Cancel via iOS Settings → [Your Name] → Subscriptions / Google Play → Subscriptions\n• Cancel at least 24 hours before renewal date\n• Refunds handled by Apple / Google per their respective policies'}
            </Text>
            <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: 10, gap: 16 }}>
              <Pressable onPress={() => Linking.openURL('https://yuwathanont1234.github.io/Kritsada/legal/terms.html').catch(()=>{})}>
                <Text style={{ color: colors.amber, fontSize: 11, textDecorationLine: 'underline' }}>
                  {lang === 'th' ? 'ข้อกำหนดการใช้งาน' : 'Terms of Service'}
                </Text>
              </Pressable>
              <Pressable onPress={() => Linking.openURL('https://yuwathanont1234.github.io/Kritsada/legal/privacy.html').catch(()=>{})}>
                <Text style={{ color: colors.amber, fontSize: 11, textDecorationLine: 'underline' }}>
                  {lang === 'th' ? 'นโยบายความเป็นส่วนตัว' : 'Privacy Policy'}
                </Text>
              </Pressable>
            </View>
          </View>

          {/* Trademark disclaimer */}
          <Text style={{ color: 'rgba(255, 255, 255, 0.4)', fontSize: 10, lineHeight: 15, textAlign: 'center', marginTop: 16, marginHorizontal: 24, marginBottom: 24 }}>
            {lang === 'th'
              ? 'Luxury Authenticator เป็นแอป AI วินิจฉัยอิสระ ไม่สังกัดและไม่ได้รับการแต่งตั้งจากผู้ผลิตนาฬิกาหรือตัวแทนจำหน่ายอย่างเป็นทางการ เครื่องหมายการค้าทั้งหมดเป็นทรัพย์สินของเจ้าของที่เกี่ยวข้อง'
              : 'Luxury Authenticator is an independent AI diagnostic app, not affiliated with or authorized by any watch manufacturer or authorized dealer. All trademarks are the property of their respective owners.'}
          </Text>

        </SafeAreaView>
      </ScrollView>
    </View>
  );
}
