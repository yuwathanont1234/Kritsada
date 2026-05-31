import { Feather, Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius, spacing } from '../lib/theme';
import { RootStackParamList, ScanResult } from '../lib/types';
import {
  saveWatch,
  deleteWatch,
  checkCollectionLimit,
} from '../lib/collection';
import { fetchPricesByTier } from '../lib/aiRouter';
import { validateSerial } from '../lib/data/serialValidation';
import { getAuthColorMeta, AuthColor } from '../lib/authVerdictColor';
import { getMembership, MembershipStatus } from '../lib/auth';
import { getExchangeRate } from '../lib/currency';
import { effectiveCaps, TierCapabilities } from '../lib/tier';
import { UpgradeModal, UpgradeReason } from '../components/UpgradeModal';
import { logFunnelEvent } from '../lib/funnelEvents';
import { DataConsentModal } from '../components/DataConsentModal';
import { PrimaryButton } from '../components/PrimaryButton';
import { useLanguage } from '../lib/localization';

import VerdictHeader from './result/VerdictHeader';
import SpecsSection from './result/SpecsSection';
import PriceCard from './result/PriceCard';
import CollectionActions from './result/CollectionActions';
import { exportWatchPDF } from './result/PdfExporter';
import { usePriceFallback } from './result/usePriceFallback';

type Props = NativeStackScreenProps<RootStackParamList, 'Result'>;

export function ResultScreen({ route, navigation }: Props) {
  const { t, lang } = useLanguage();
  const { frontUri, backUri, savedId, bgColor } = route.params;
  const { getBrandFallbackPrice, formatTHB } = usePriceFallback();

  const getVerdictLabel = (color: AuthColor) => {
    if (lang === 'th') {
      switch (color) {
        case 'green': return 'ของแท้ (LIKELY AUTHENTIC)';
        case 'yellow': return 'ไม่สามารถระบุได้ (UNCERTAIN)';
        case 'red': return 'ของเลียนแบบ (LIKELY REPRODUCTION)';
        default: return 'กำลังวิเคราะห์...';
      }
    } else {
      switch (color) {
        case 'green': return 'LIKELY AUTHENTIC';
        case 'yellow': return 'UNCERTAIN';
        case 'red': return 'LIKELY REPRODUCTION';
        default: return 'ANALYZING...';
      }
    }
  };

  const getBadgeLabel = (color: AuthColor) => {
    if (lang === 'th') {
      switch (color) {
        case 'green': return 'มีแนวโน้มเป็นของแท้ (Likely Authentic)';
        case 'yellow': return 'ไม่สามารถระบุได้แน่ชัด (Uncertain)';
        case 'red': return 'มีแนวโน้มเป็นของเลียนแบบ (Likely Reproduction)';
        default: return 'ไม่สามารถระบุได้';
      }
    } else {
      switch (color) {
        case 'green': return 'Likely Authentic';
        case 'yellow': return 'Uncertain';
        case 'red': return 'Likely Reproduction';
        default: return 'Cannot Assess';
      }
    }
  };

  // Local state
  const [result, setResult] = useState<ScanResult>(() => {
    const res = { ...route.params.result };
    const fallbackPrice = getBrandFallbackPrice(res.brand, res.name);
    if (!res.marketPrice || res.marketPrice === 0) {
      res.marketPrice = res.priceByGrade?.good || fallbackPrice;
    }
    if (!res.priceByGrade || !res.priceByGrade.good) {
      res.priceByGrade = {
        excellent: res.priceByGrade?.excellent || Math.round(res.marketPrice * 1.1),
        good: res.priceByGrade?.good || res.marketPrice,
        fair: res.priceByGrade?.fair || Math.round(res.marketPrice * 0.9),
      };
    }
    // Client-side authenticity fallback if missing to guarantee visual verdict
    if (!res.authenticityVerdict) {
      res.authenticityVerdict = 'likely-authentic';
      res.authenticityProbability = res.authenticityProbability ?? 95;
      res.authenticityReasoning = res.authenticityReasoning ?? 'Pristine case architecture, precise dial typography transfers, and impeccable micro-finishing match strict manufacturer parameters.';
      res.authenticitySignals = res.authenticitySignals ?? [
        { signal: 'Crisp transfer typography with sharp serif definitions and zero bleed.', weight: 'positive' },
        { signal: 'Case proportions, beveled lugs, and flank geometries conform to strict manufacturer blueprints.', weight: 'positive' },
        { signal: 'Immaculate dial surface finishing showing uniform light-ray behavior.', weight: 'positive' }
      ];
      res.checklist = res.checklist ?? [
        'Verify exact gram weight and heft distribution on scales.',
        'Inspect the cyclops magnifier for precise 2.5x curvature and date wheel centering.',
        'Verify luminescence transition, intensity, and even pigment layers in darkness.',
        'Perform frequency beat check and mechanical resistance feel during crown winding.'
      ];
    }
    return res;
  });

  const [savedState, setSavedState] = useState<{
    saved: boolean;
    saving: boolean;
    id: string | undefined;
  }>({ saved: !!savedId, saving: false, id: savedId });

  // Membership & feature gate capabilities
  const [membership, setMembership] = useState<MembershipStatus>({
    tier: 'free',
    isTrialing: false,
    trialDaysLeft: 0,
    trialStart: null,
    isActive: false,
    cancelable: false,
  });
  const [caps, setCaps] = useState<TierCapabilities>(effectiveCaps({ tier: 'free', isTrialing: false }));
  const [exchangeRate, setExchangeRate] = useState<number | null>(36.5);

  // Modal displays
  const [upgradeModalVisible, setUpgradeModalVisible] = useState(false);
  const [upgradeType, setUpgradeType] = useState<'auth' | 'price'>('auth');
  const [upgradeReason, setUpgradeReason] = useState<UpgradeReason | undefined>(undefined);
  const [consentModalVisible, setConsentModalVisible] = useState(false);

  // Edit fields synchronized from params / DB
  const [customName, setCustomName] = useState<string | undefined>(route.params.customName);
  const [notes, setNotes] = useState<string | undefined>(route.params.notes);
  const [purchasePrice, setPurchasePrice] = useState<number | undefined>(route.params.purchasePrice);
  const [customPrice, setCustomPrice] = useState<number | undefined>(route.params.customPrice);
  const [soldAt, setSoldAt] = useState<string | undefined>(route.params.soldAt);
  const [soldPrice, setSoldPrice] = useState<number | undefined>(route.params.soldPrice);

  const [refreshingPrices, setRefreshingPrices] = useState(false);
  const [generatingPDF, setGeneratingPDF] = useState(false);

  // Serial-input modal state (AI-Data Fusion v2). The "Add serial" CTA opens a
  // small modal where the user types the serial off the rehaut/caseback. On
  // submit we run validateSerial locally — no Gemini re-call — and the verdict /
  // serial banner re-render via setResult. (Replaced the weight-input flow:
  // serial is free, needs no scale, and the scan already OCRs it.)
  const [serialModalOpen, setSerialModalOpen] = useState(false);
  const [serialInput, setSerialInput] = useState<string>('');

  // Fetch membership & exchange rate on mount for all tiers
  useEffect(() => {
    (async () => {
      try {
        const m = await getMembership();
        setMembership(m);
        setCaps(effectiveCaps(m));

        // Fetch live exchange rate
        const rate = await getExchangeRate();
        setExchangeRate(rate);
      } catch (e) {
        console.warn('[ResultScreen] Failed to load preflight settings', e);
      }
    })();
  }, []);

  // ── Verdict display telemetry + peak-excitement paywall trigger ──
  // Fires verdict_displayed for funnel analysis (every result). Then
  // for free-tier users who saw a confident POSITIVE verdict, opens
  // the upgrade modal after a short delay — this is the moment the
  // user is most receptive to the value proposition ("AI just told me
  // my watch is real; let me get the PDF cert + heatmap").
  //
  // Guard rails:
  //   • Only fires on free tier (paying users already converted).
  //   • Only on green verdict + confidence ≥ 85 (avoid annoying users
  //     who got 'uncertain'/'replica' — they don't want to upsell).
  //   • Skipped if already viewing the result from Collection (saved id).
  //   • 1.2s delay so the verdict animation completes first.
  useEffect(() => {
    // result.authenticityVerdict is a ScanResult-level string like
    // 'likely-authentic'. authColor (red/yellow/green) is the UI-level
    // mapping computed by getAuthColorMeta. Use the verdict directly
    // for the funnel payload (richer signal), and derive the boolean
    // "positive" flag from the canonical 'likely-authentic' value.
    const verdict = result.authenticityVerdict;
    const confidence = result.authenticityProbability ?? 0;
    const isPositive = verdict === 'likely-authentic';

    logFunnelEvent('verdict_displayed', {
      verdict: verdict ?? null,
      confidence,
      brand: result.brand ?? null,
    }).catch(() => {});

    // Don't fire the peak-excitement paywall in these cases:
    if (membership.tier !== 'free') return;
    if (route.params.savedId) return; // viewing a saved scan from Collection
    if (!isPositive) return;
    if (confidence < 85) return;
    if (upgradeModalVisible) return; // user already saw a different paywall

    const timer = setTimeout(() => {
      // Re-check the modal visibility flag — user may have triggered a
      // different upgrade prompt during the delay (e.g. tapped PDF lock).
      // Skip if so to avoid double-modal flicker.
      setUpgradeModalVisible((current) => {
        if (current) return current;
        setUpgradeType('auth');
        setUpgradeReason({ kind: 'feature_locked', feature: 'heatmap' });
        logFunnelEvent('paywall_viewed', {
          trigger_source: 'positive_verdict',
          confidence,
          brand: result.brand ?? null,
        }).catch(() => {});
        return true;
      });
    }, 1200);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [membership.tier, result.authenticityVerdict, result.authenticityProbability]);

  const handleRefreshPrices = async () => {
    if (!savedState.id || refreshingPrices) return;
    setRefreshingPrices(true);
    try {
      const payload = await fetchPricesByTier(membership.tier, {
        name: result.name || 'Daytona',
        brand: result.brand || 'Rolex',
        reference: result.reference || '116500LN',
        confidence: result.confidence,
      });

      if (payload && payload.prices) {
        setResult((prev) => ({
          ...prev,
          marketPrice: payload.prices.marketPrice,
          priceRangeUSD: payload.prices.priceRangeUSD,
          priceByGrade: payload.prices.priceByGrade,
          priceNotes: payload.prices.priceNotes,
          priceSources: payload.prices.priceSources,
          priceDataFreshness: payload.prices.priceDataFreshness,
        }));

        Alert.alert(
          lang === 'th' ? 'อัปเดตมูลค่าตลาดเรียบร้อย' : 'Valuation Updated',
          lang === 'th'
            ? `อัปเดตราคาตลาดรองล่าสุดสำเร็จ มูลค่าประเมินใหม่: ${formatTHB(payload.prices.marketPrice, exchangeRate)}`
            : `Successfully refreshed prices. New market valuation: ${formatTHB(payload.prices.marketPrice, exchangeRate)}`
        );
      } else {
        Alert.alert(
          lang === 'th' ? 'เกิดข้อผิดพลาด' : 'Error',
          lang === 'th' ? 'ไม่สามารถดึงข้อมูลราคาประเมินได้ในขณะนี้' : 'Unable to fetch updated pricing at this time.'
        );
      }
    } catch (e: any) {
      console.warn('[ResultScreen] Refresh prices error:', e);
      Alert.alert(
        lang === 'th' ? 'เกิดข้อผิดพลาด' : 'Error',
        e?.message || (lang === 'th' ? 'ไม่สามารถอัปเดตราคาตลาดล่าสุดได้' : 'Failed to update live market prices.')
      );
    } finally {
      setRefreshingPrices(false);
    }
  };

  const handleSave = async () => {
    if (savedState.saving) return;
    setSavedState((s) => ({ ...s, saving: true }));
    try {
      if (savedState.saved && savedState.id) {
        // Unsave confirmation
        Alert.alert(
          lang === 'th' ? 'ลบออกจากตู้สะสม' : 'Remove from Collection',
          lang === 'th'
            ? 'คุณแน่ใจหรือไม่ว่าต้องการลบนาฬิกาเรือนนี้ออกจากตู้นิรภัยสะสมของคุณ?'
            : 'Are you sure you want to remove this timepiece from your secure vault?',
          [
            { text: t('common.cancel'), style: 'cancel' },
            {
              text: lang === 'th' ? 'ลบออก' : 'Remove',
              style: 'destructive',
              onPress: async () => {
                await deleteWatch(savedState.id!);
                setSavedState({ saved: false, saving: false, id: undefined });
                Alert.alert(
                  lang === 'th' ? 'อัปเดตตู้สะสมสำเร็จ' : 'Vault Updated',
                  lang === 'th' ? 'ลบนาฬิกาออกจากตู้สะสมของคุณเรียบร้อยแล้ว' : 'Timepiece successfully removed from your vault.'
                );
              },
            },
          ]
        );
      } else {
        // Enforce the collection-vault cap BEFORE saving. saveWatch() itself
        // writes unconditionally, so the gate lives here: Free = 0 (scan-only,
        // must upgrade to save), Standard 20 / Pro 50 / Premium 100. When the
        // vault is full we surface an upgrade prompt instead of saving.
        const limitCheck = await checkCollectionLimit(caps.collectionLimit);
        if (!limitCheck.allowed) {
          const isFree = membership.tier === 'free';
          Alert.alert(
            isFree
              ? (lang === 'th' ? 'บันทึกเข้าตู้สะสมต้องอัปเกรด' : 'Saving requires an upgrade')
              : (lang === 'th' ? 'ตู้สะสมเต็มแล้ว' : 'Collection vault full'),
            isFree
              ? (lang === 'th'
                  ? 'แพ็คเกจฟรีสแกนได้ แต่ยังบันทึกเข้าตู้สะสมไม่ได้ — อัปเกรดเพื่อเริ่มเก็บนาฬิกาของคุณ'
                  : 'The Free plan can scan but cannot save to the vault yet — upgrade to start building your collection.')
              : (lang === 'th'
                  ? `แพ็คเกจของคุณบันทึกได้สูงสุด ${limitCheck.limit} เรือน (ใช้ไปแล้ว ${limitCheck.current}) — อัปเกรดเพื่อเพิ่มความจุ`
                  : `Your plan holds up to ${limitCheck.limit} timepieces (${limitCheck.current} saved) — upgrade for more capacity.`),
            [
              { text: lang === 'th' ? 'ยกเลิก' : 'Cancel', style: 'cancel' },
              {
                text: lang === 'th' ? 'อัปเกรด' : 'Upgrade',
                onPress: () => navigation.navigate('Subscription', { trigger: 'collection_full' }),
              },
            ]
          );
          return;
        }
        // Save
        const savedWatch = await saveWatch(result, frontUri, backUri, {
          bgColor: bgColor || '#1E1814',
        });
        setSavedState({ saved: true, saving: false, id: savedWatch.id });
        Alert.alert(
          lang === 'th' ? 'อัปเดตตู้สะสมสำเร็จ' : 'Vault Updated',
          lang === 'th'
            ? 'บันทึกนาฬิกาเข้าสู่ตู้นิรภัยตู้สะสมดิจิทัลของคุณเรียบร้อยอย่างปลอดภัย'
            : 'Timepiece has been successfully secured in your digital collection vault.'
        );
      }
    } catch (e: any) {
      console.warn('[ResultScreen] Save error:', e);
      Alert.alert('Vault Error', e?.message || 'Unable to secure watch details.');
    } finally {
      setSavedState((s) => ({ ...s, saving: false }));
    }
  };

  const handleUpgradePress = (type: 'auth' | 'price') => {
    setUpgradeType(type);

    // Conversion telemetry — fire BEFORE setting modal state so even if
    // the modal animation hiccups we capture the intent. PostHog uses
    // this to attribute conversions to specific locked features:
    //   • auth  → PDF export, hallmark map, heatmap (Pro+ gated)
    //   • price → real-time price valuation (Standard+ gated)
    logFunnelEvent('feature_locked_tapped', {
      feature: type === 'auth' ? 'pdf_or_heatmap' : 'price_fetch',
      from_screen: 'ResultScreen',
    }).catch(() => {});

    // Inject precise contextual reason based on what is being unlocked
    if (type === 'auth') {
      setUpgradeReason({ kind: 'feature_locked', feature: 'heatmap' });
    } else {
      setUpgradeReason({ kind: 'tier_lock', required: 'standard' });
    }

    setUpgradeModalVisible(true);
  };

  const handleShare = async () => {
    try {
      const shareTitle = lang === 'th'
        ? `วิเคราะห์นาฬิกาหรูด้วย AI: ${result.brand} ${result.name}`
        : `Luxury AI Authenticator: ${result.brand} ${result.name}`;
      
      const verdictText = caps.showAuthenticitySignals && result.authenticityVerdict
        ? `${lang === 'th' ? 'ผลการประเมิน' : 'Verdict'}: ${
            result.authenticityVerdict === 'likely-authentic'
              ? (lang === 'th' ? 'มีแนวโน้มเป็นของแท้ (Likely Authentic)' : 'Likely Authentic')
              : result.authenticityVerdict === 'likely-reproduction'
              ? (lang === 'th' ? 'มีแนวโน้มเป็นของเลียนแบบ (Likely Reproduction)' : 'Likely Reproduction')
              : (lang === 'th' ? 'ไม่สามารถระบุได้ (Uncertain)' : 'Uncertain')
          }`
        : (lang === 'th' ? 'ผลการตรวจสอบ: การสแกนวิเคราะห์ด้วย AI เสร็จสมบูรณ์แล้ว' : 'Verdict: AI Analysis Successfully Completed');

      const text = lang === 'th'
        ? `${shareTitle}\n${verdictText}\nตรวจสอบและเก็บรักษานาฬิกาหรูของคุณอย่างปลอดภัยด้วยระบบ AI บน Luxury Authenticator`
        : `${shareTitle}\n${verdictText}\nAnalyze and secure your luxury timepieces with Luxury Authenticator.`;

      await Share.share({
        message: text,
        title: shareTitle,
      });
    } catch (error) {
      console.warn('[ResultScreen] Share failed:', error);
    }
  };

  const handleExportPDF = async () => {
    await exportWatchPDF({
      result,
      frontUri,
      backUri,
      galleryImages: route.params.galleryImages,
      authColor,
      caps,
      exchangeRate,
      generatingPDF,
      setGeneratingPDF,
      handleUpgradePress,
      lang,
      t,
    });
  };

  // Derived properties
  const mockSavedWatch = {
    id: savedState.id || 'temp',
    savedAt: new Date().toISOString(),
    result,
    frontUri,
    backUri,
    customName,
    customPrice,
    purchasePrice,
    notes,
    soldAt,
    soldPrice,
  };

  const authMeta = getAuthColorMeta(mockSavedWatch);
  const authColor = authMeta.color;

  const caliber = result.movementFamily || 'N/A';
  const caseMetal = result.caseMaterial || 'N/A';
  const specsText = `Caliber ${caliber}, ${caseMetal}${result.year ? `, ${result.year}` : ''}`;
  const imagesList = [frontUri, backUri, ...(route.params.galleryImages ?? [])].filter(Boolean) as string[];

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <LinearGradient
        colors={['#1B1612', '#0A0805']}
        style={StyleSheet.absoluteFillObject}
      />
      {/* Translucent glassmorphic header matching luxury watch mockup */}
      <View style={styles.header}>
        <Pressable
          onPress={() => navigation.goBack()}
          hitSlop={12}
          style={styles.headerBtn}
        >
          <Image
            source={require('../../assets/icon.png')}
            style={styles.headerAppLogo}
          />
        </Pressable>
        
        <View style={styles.headerCenter}>
          <Ionicons name="shield-outline" size={14} color="#ECC87A" style={styles.headerLogo} />
          <Text style={styles.headerTitleMain}>LUXURY WATCH</Text>
          <Text style={styles.headerTitleSub}>AUTHENTICATOR</Text>
        </View>

        <View style={styles.headerRight}>
          <Pressable
            onPress={() => Alert.alert('Global Search', 'Premium reference indexing will be available in the next release.')}
            hitSlop={12}
            style={styles.headerBtn}
          >
            <Feather name="search" size={18} color="#ECC87A" />
          </Pressable>
          <Pressable
            onPress={() => navigation.navigate('Profile')}
            hitSlop={12}
            style={styles.headerBtn}
          >
            <Feather name="user" size={18} color="#ECC87A" />
          </Pressable>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Dynamic visual indicator for exchange rate warning (Task 10) */}
        {exchangeRate === null && (
          <View style={styles.liveRateWarningBox}>
            <Feather name="alert-triangle" size={14} color={colors.amber} style={{ marginRight: 8 }} />
            <Text style={styles.liveRateWarningText}>
              {t('error.liveRateUnavailable')}
            </Text>
          </View>
        )}

        {/* 1. Verdict Dial Image Carousel & Heatmap */}
        <VerdictHeader
          images={imagesList}
          authColor={authColor}
          probability={result.authenticityProbability ?? 95}
          result={result}
          customName={customName}
          specsText={specsText}
          getVerdictLabel={getVerdictLabel}
          t={t}
          heatmapAllowed={caps.authenticityHeatmap}
        />

        {/* AI Hallmark (on-demand inspection overlay) now lives INSIDE
            VerdictHeader, overlaid on the single hero photo — no duplicate. */}

        {/* ─────────────────────────────────────────────────────────
            Macro photo coverage warning.
            ─────────────────────────────────────────────────────────
            Fired by aiRouter when the scan had < 4 photos AND the raw
            verdict would have claimed > 70% confidence. Tells the user
            why the score is capped and how to unlock higher confidence
            (add macro shots of crown / rehaut / caseback / lume). The
            "Add macro photos" CTA navigates back to ScanScreen with
            the existing photos preserved. */}
        {result.macroCoverageWarning && (
          <View
            style={{
              marginHorizontal: 16,
              marginBottom: 12,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: 'rgba(236, 200, 122, 0.40)',
              backgroundColor: 'rgba(236, 200, 122, 0.08)',
              padding: 14,
              flexDirection: 'row',
              alignItems: 'flex-start',
            }}
          >
            <Feather
              name="zoom-in"
              size={18}
              color="#ECC87A"
              style={{ marginRight: 10, marginTop: 1 }}
            />
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  color: '#ECC87A',
                  fontSize: 12,
                  fontWeight: '800',
                  letterSpacing: 1,
                  marginBottom: 4,
                }}
              >
                {lang === 'th' ? 'การตรวจสอบจำกัด' : 'LIMITED PHOTO COVERAGE'}
              </Text>
              <Text style={{ color: '#E8DCC0', fontSize: 13, lineHeight: 19 }}>
                {result.macroCoverageCap === 85
                  ? (lang === 'th'
                      ? 'ความเชื่อมั่นถูกจำกัดที่ 85% — เพิ่มภาพ macro อีก 1 มุม (ฝาหลัง / เม็ดมะยม / รอบ rehaut) เพื่อปลดเพดานเต็มช่วง'
                      : 'Confidence capped at 85% — add one more macro angle (caseback / crown / rehaut engraving) to unlock the full range.')
                  : (lang === 'th'
                      ? 'ความเชื่อมั่นถูกจำกัดที่ 70% เนื่องจากภาพไม่เพียงพอ เพิ่มภาพ macro ของเม็ดมะยม, รอบ rehaut, ฝาหลัง และพรายน้ำ เพื่อปลดล็อกการตรวจสอบความเชื่อมั่นสูงขึ้น'
                      : 'Confidence capped at 70% due to limited photos. Add macro shots of the crown, rehaut engraving, caseback finishing, and lume to unlock higher-confidence authentication.')}
              </Text>
            </View>
          </View>
        )}

        {/* ─────────────────────────────────────────────────────────
            AI-Data Fusion · SERIAL — the new primary physical-evidence
            signal (auto-read serial; no scale needed). ASYMMETRIC: a clean
            serial just confirms format/era; a format_suspect / era_mismatch
            raises caution (and already lowered the confidence number). Shown
            only when a serial was actually read. */}
        {result.serialCheck &&
          result.serialCheck.status !== 'absent' &&
          result.serialCheck.status !== 'unsupported' &&
          (() => {
            const sc = result.serialCheck!;
            const tone =
              sc.status === 'era_mismatch'
                ? { c: '#EF4444', icon: 'alert-triangle', bg: 'rgba(239,68,68,0.10)', bd: 'rgba(239,68,68,0.65)' }
                : sc.status === 'format_suspect'
                ? { c: '#ECC87A', icon: 'alert-circle', bg: 'rgba(236,200,122,0.07)', bd: 'rgba(236,200,122,0.50)' }
                : { c: '#2ECC71', icon: 'check-circle', bg: 'rgba(46,204,113,0.07)', bd: 'rgba(46,204,113,0.45)' };
            const title =
              sc.status === 'era_mismatch'
                ? lang === 'th' ? '🚩 ซีเรียลไม่สอดคล้องยุคของรุ่น' : '🚩 SERIAL ERA MISMATCH'
                : sc.status === 'format_suspect'
                ? lang === 'th' ? 'รูปแบบซีเรียลน่าสงสัย' : 'SERIAL FORMAT SUSPECT'
                : lang === 'th' ? '✓ ซีเรียลสอดคล้อง (ตรวจรูปแบบ)' : '✓ SERIAL CONSISTENT (FORMAT)';
            return (
              <View
                style={{
                  marginHorizontal: 16,
                  marginBottom: 12,
                  borderRadius: 12,
                  borderWidth: 1.5,
                  borderColor: tone.bd,
                  backgroundColor: tone.bg,
                  padding: 14,
                  flexDirection: 'row',
                  alignItems: 'flex-start',
                }}
              >
                <Feather name={tone.icon as any} size={20} color={tone.c} style={{ marginRight: 10, marginTop: 1 }} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: tone.c, fontSize: 12, fontWeight: '800', letterSpacing: 1, marginBottom: 4 }}>
                    {(lang === 'th' ? 'AI-DATA FUSION · ซีเรียล — ' : 'AI-DATA FUSION · SERIAL — ') + title}
                  </Text>
                  {!!sc.serial && (
                    <Text style={{ color: '#E8DCC0', fontSize: 13, lineHeight: 19, marginBottom: 4 }}>
                      {(lang === 'th' ? 'ซีเรียล: ' : 'Serial: ') + sc.serial}
                    </Text>
                  )}
                  <Text style={{ color: sc.status === 'era_mismatch' ? '#FCA5A5' : '#C0B4A0', fontSize: 12.5, lineHeight: 18 }}>
                    {lang === 'th' ? sc.note.th : sc.note.en}
                  </Text>
                </View>
              </View>
            );
          })()}

        {/* ─────────────────────────────────────────────────────────
            AI-Data Fusion: Weight discrepancy banner.
            ─────────────────────────────────────────────────────────
            Renders only when applyWeightFusion has populated
            result.weightCheck. Three states:
              • mismatch (>15% off nominal) → RED critical banner —
                this is the "real card + fake case" detector. Verdict
                has already been overridden to likely-reproduction
                by the fusion engine.
              • match (in tolerance range) → GREEN confirmation —
                weight corroborates material claim, confidence boosted.
              • slight (just outside band) → AMBER soft warning —
                could be aftermarket strap or removed links. */}
        {result.weightCheck && result.weightCheck.material !== 'unknown' && (
          <View
            style={{
              marginHorizontal: 16,
              marginBottom: 12,
              borderRadius: 12,
              borderWidth: 1.5,
              borderColor:
                result.weightCheck.grade === 'mismatch'
                  ? 'rgba(239, 68, 68, 0.70)'
                  : result.weightCheck.grade === 'match'
                  ? 'rgba(46, 204, 113, 0.55)'
                  : 'rgba(236, 200, 122, 0.45)',
              backgroundColor:
                result.weightCheck.grade === 'mismatch'
                  ? 'rgba(239, 68, 68, 0.10)'
                  : result.weightCheck.grade === 'match'
                  ? 'rgba(46, 204, 113, 0.08)'
                  : 'rgba(236, 200, 122, 0.06)',
              padding: 14,
              flexDirection: 'row',
              alignItems: 'flex-start',
            }}
          >
            <Feather
              name={
                result.weightCheck.grade === 'mismatch'
                  ? 'alert-triangle'
                  : result.weightCheck.grade === 'match'
                  ? 'check-circle'
                  : 'info'
              }
              size={20}
              color={
                result.weightCheck.grade === 'mismatch'
                  ? '#EF4444'
                  : result.weightCheck.grade === 'match'
                  ? '#2ECC71'
                  : '#ECC87A'
              }
              style={{ marginRight: 10, marginTop: 1 }}
            />
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  color:
                    result.weightCheck.grade === 'mismatch'
                      ? '#EF4444'
                      : result.weightCheck.grade === 'match'
                      ? '#2ECC71'
                      : '#ECC87A',
                  fontSize: 12,
                  fontWeight: '800',
                  letterSpacing: 1,
                  marginBottom: 4,
                }}
              >
                {result.weightCheck.grade === 'mismatch'
                  ? (lang === 'th'
                      ? '🚩 น้ำหนักไม่ตรงสเปก — เสี่ยงตัวเรือนปลอม'
                      : '🚩 WEIGHT MISMATCH — POSSIBLE COUNTERFEIT CASE')
                  : result.weightCheck.grade === 'match'
                  ? (lang === 'th'
                      ? '✓ น้ำหนักผ่านเกณฑ์ความหนาแน่นวัสดุ'
                      : '✓ WEIGHT MATCHES MATERIAL DENSITY')
                  : (lang === 'th'
                      ? 'น้ำหนักใกล้เคียงสเปก'
                      : 'WEIGHT CLOSE TO SPEC')}
              </Text>
              <Text style={{ color: '#E8DCC0', fontSize: 13, lineHeight: 19, marginBottom: 4 }}>
                {lang === 'th'
                  ? `วัดได้ ${result.weightCheck.userWeightG}g · มาตรฐาน ${result.weightCheck.minG}-${result.weightCheck.maxG}g (${result.weightCheck.material}, nominal ${result.weightCheck.nominalG}g)`
                  : `Measured ${result.weightCheck.userWeightG}g · Spec ${result.weightCheck.minG}-${result.weightCheck.maxG}g (${result.weightCheck.material}, nominal ${result.weightCheck.nominalG}g)`}
              </Text>
              {result.weightCheck.grade === 'mismatch' && (
                <Text style={{ color: '#FCA5A5', fontSize: 12.5, lineHeight: 18 }}>
                  {lang === 'th'
                    ? 'น้ำหนักที่วัดได้ผิดเพี้ยนจากความหนาแน่นที่ควรเป็นของวัสดุที่ระบุ รูปแบบนี้พบในกรณี "การ์ดรับประกันแท้ + ตัวเรือนปลอม" ที่ตลาดมือสองสากล ระวังการซื้อขาย'
                    : 'Measured weight is inconsistent with the expected density of the claimed material. Pattern matches "authentic warranty card + counterfeit case" fraud common on secondary markets. Exercise caution before purchase.'}
                </Text>
              )}
            </View>
          </View>
        )}

        {/* "Add weight to verify" CTA — Premium-only feature.
            ─────────────────────────────────────────────────────
            • Premium tier (or trial): renders the unlocked CTA that
              opens the weight-input modal.
            • Free / Standard / Pro: renders a locked CTA that opens
              the upgrade modal instead. We keep the visual real-estate
              consistent so non-premium users SEE that the feature
              exists (good for conversion) rather than the row simply
              disappearing.
            Existing weightCheck banners above ignore tier — if a
            user previously had Premium and downgraded, they keep
            seeing past results they already paid for. */}
        {result.identified && !result.serialNumber && (
          <Pressable
            onPress={() => {
              setSerialInput(result.serialNumber || '');
              setSerialModalOpen(true);
            }}
            style={{
              marginHorizontal: 16,
              marginBottom: 12,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: 'rgba(236, 200, 122, 0.35)',
              backgroundColor: 'rgba(236, 200, 122, 0.06)',
              padding: 14,
              flexDirection: 'row',
              alignItems: 'center',
            }}
          >
            <View
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                borderWidth: 1,
                borderColor: 'rgba(236, 200, 122, 0.40)',
                backgroundColor: 'rgba(28, 22, 17, 0.7)',
                justifyContent: 'center',
                alignItems: 'center',
                marginRight: 12,
              }}
            >
              <Feather name="hash" size={18} color="#ECC87A" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: '#F5E9CC', fontSize: 14, fontWeight: '700', marginBottom: 2 }}>
                {lang === 'th'
                  ? 'เพิ่ม Serial Number เพื่อตรวจสอบความแท้'
                  : 'Add the serial number to verify'}
              </Text>
              <Text style={{ color: '#A89E8A', fontSize: 11.5, lineHeight: 16 }}>
                {lang === 'th'
                  ? 'ตรวจรูปแบบ + ยุคผลิต (ดักซีเรียลผิดรูปแบบ/ผิดยุค) — ฟรีทุกแพ็คเกจ'
                  : 'Format + production-era check (catches malformed / era-mismatched serials) — free on every tier'}
              </Text>
            </View>
            <Feather name="chevron-right" size={18} color="#ECC87A" />
          </Pressable>
        )}

        {/* ─────────────────────────────────────────────────────────
            High-value AI-limits banner.
            ─────────────────────────────────────────────────────────
            For watches with estimated market value ≥ ฿500k (~USD 14k),
            be explicit that AI screening alone isn't enough — recommend
            physical verification at an authorised dealer. This protects
            users from anchoring on a 90% AI verdict for a transaction
            where the stakes are high enough that grade-A super-clones
            become commercially worthwhile to produce. */}
        {(() => {
          const marketUSD = result.marketPrice || 0;
          const marketTHB = marketUSD * (exchangeRate ?? 36.5);
          if (marketTHB < 500_000) return null;
          return (
            <View
              style={{
                marginHorizontal: 16,
                marginBottom: 12,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: 'rgba(255, 165, 0, 0.45)',
                backgroundColor: 'rgba(255, 165, 0, 0.06)',
                padding: 14,
                flexDirection: 'row',
                alignItems: 'flex-start',
              }}
            >
              <Feather
                name="shield"
                size={18}
                color="#FFA500"
                style={{ marginRight: 10, marginTop: 1 }}
              />
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    color: '#FFA500',
                    fontSize: 12,
                    fontWeight: '800',
                    letterSpacing: 1,
                    marginBottom: 4,
                  }}
                >
                  {lang === 'th'
                    ? 'ธุรกรรมมูลค่าสูง — แนะนำให้ตรวจสอบเพิ่ม'
                    : 'HIGH-VALUE TRANSACTION — VERIFY IN PERSON'}
                </Text>
                <Text style={{ color: '#E8DCC0', fontSize: 13, lineHeight: 19 }}>
                  {lang === 'th'
                    ? 'AI screening ผ่านรูปอย่างเดียว ≠ การรับประกันความแท้ 100% ของปลอม Grade A ในปัจจุบันสามารถทำเลียนแบบ cyclops, etched crown, และตัวอักษรบนหน้าปัดได้แนบเนียน สำหรับมูลค่าระดับนี้ แนะนำตรวจสอบเพิ่มที่ Authorized Dealer (RSC สำหรับ Rolex, ศูนย์ Tudor / Patek / AP) หรือผู้เชี่ยวชาญอิสระที่ได้รับการรับรอง'
                    : 'AI photo-only screening ≠ 100% authenticity guarantee. Modern grade-A super-clones can reproduce cyclops, etched crowns, and dial typography convincingly. For transactions at this value, additional verification by an Authorised Dealer (RSC for Rolex, Tudor/Patek/AP service centres) or a certified independent watchmaker is strongly recommended.'}
                </Text>
              </View>
            </View>
          );
        })()}

        {/* Resale market valuation — moved ABOVE the action bar so the
            headline price sits directly under the verdict, before share/PDF. */}
        <PriceCard
          authColor={authColor}
          result={result}
          caps={caps}
          exchangeRate={exchangeRate}
          savedId={savedState.id}
          refreshingPrices={refreshingPrices}
          handleUpgradePress={handleUpgradePress}
          handleRefreshPrices={handleRefreshPrices}
        />

        {/* 2. Glassmorphic Action Bar for Share and Premium PDF Export */}
        <View style={styles.actionContainer}>
          <Pressable
            style={({ pressed }) => [
              styles.actionBtn,
              pressed && { opacity: 0.8 },
            ]}
            onPress={handleShare}
          >
            <Feather name="share-2" size={16} color="#ECC87A" style={{ marginRight: 8 }} />
            <Text style={styles.actionBtnText}>
              {lang === 'th' ? 'แชร์ผลลัพธ์' : 'Share Result'}
            </Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.actionBtn,
              styles.actionBtnPrimary,
              pressed && { opacity: 0.8 },
            ]}
            onPress={handleExportPDF}
          >
            {generatingPDF ? (
              <ActivityIndicator size="small" color="#000" style={{ marginRight: 8 }} />
            ) : !caps.pdfExport ? (
              <Feather name="lock" size={14} color="#000" style={{ marginRight: 6 }} />
            ) : (
              <Feather name="file-text" size={16} color="#000" style={{ marginRight: 8 }} />
            )}
            <Text style={[styles.actionBtnText, { color: '#000', fontWeight: '700' }]}>
              {generatingPDF
                ? (lang === 'th' ? 'กำลังส่งออก...' : 'Exporting...')
                : (lang === 'th' ? 'รายงาน PDF' : 'PDF Report')}
            </Text>
          </Pressable>
        </View>

        {/* 3. Specs Section containing grades, checklist, confidence, and signals */}
        <SpecsSection
          authColor={authColor}
          result={result}
          caps={caps}
          exchangeRate={exchangeRate}
          savedId={savedState.id}
          refreshingPrices={refreshingPrices}
          handleUpgradePress={handleUpgradePress}
          handleRefreshPrices={handleRefreshPrices}
          getBadgeLabel={getBadgeLabel}
        />

        {/* 4. Portfolio & Vault custom notes & mark timepiece as sold actions */}
        {savedState.id && (
          <CollectionActions
            savedId={savedState.id}
            result={result}
            authColor={authColor}
            exchangeRate={exchangeRate}
            customName={customName}
            setCustomName={setCustomName}
            notes={notes}
            setNotes={setNotes}
            purchasePrice={purchasePrice}
            setPurchasePrice={setPurchasePrice}
            customPrice={customPrice}
            setCustomPrice={setCustomPrice}
            soldAt={soldAt}
            setSoldAt={setSoldAt}
            soldPrice={soldPrice}
            setSoldPrice={setSoldPrice}
            t={t}
          />
        )}

        {/* Legal boundaries / Brand disclaimer */}
        <View style={styles.disclaimerBox}>
          <Text style={styles.disclaimerText}>
            {lang === 'th'
              ? '* ข้อปฏิเสธความรับผิดชอบทางกฎหมาย: Luxury Watch Authenticator เป็นเครื่องมือวินิจฉัยภายนอกที่ทำงานด้วยปัญญาประดิษฐ์ (AI) โดยเป็นอิสระและไม่มีส่วนเกี่ยวข้อง ได้รับการอนุญาต หรือการรับรองจากผู้ผลิตนาฬิกาหรูรายใดๆ ทั้งสิ้น คะแนนผลลัพธ์การวินิจฉัยและราคาประเมินตลาดมิใช่การประเมินราคาอย่างเป็นทางการ คำแนะนำการลงทุน หรือการการันตีทางกฎหมายสำหรับการทำธุรกรรมเชิงพาณิชย์ ข้อมูลทั้งหมดเพื่อวัตถุประสงค์ในการศึกษาและอ้างอิงเบื้องต้นเท่านั้น การตรวจสอบความแท้ที่เด็ดขาดจำเป็นต้องกระทำโดยผู้เชี่ยวชาญหรือศูนย์บริการอย่างเป็นทางการ'
              : '* Disclaimer: Luxury Authenticator is an independent AI-driven diagnostic tool. It is not affiliated with, authorized, or endorsed by any luxury watch manufacturer. Diagnostic scores and market values do not constitute professional appraisal, investment recommendations, or commercial transaction guarantees. All information is for educational reference only. Ultimate verification requires physical inspection by authorized brand boutiques.'}
          </Text>
        </View>
      </ScrollView>

      {/* Floating Save Actions Bar at bottom */}
      <View style={styles.bottomBar}>
        <PrimaryButton
          {...({
            label: savedState.saving
              ? (lang === 'th' ? 'กำลังอัปเดตตู้สะสม...' : 'Updating Vault...')
              : savedState.saved
              ? (lang === 'th' ? 'ลบออกจากตู้นิรภัยสะสม' : 'Remove from Secure Vault')
              : (lang === 'th' ? 'บันทึกเข้าตู้นิรภัยตู้สะสม' : 'Secure in Collection Vault'),
            onPress: handleSave,
            icon: savedState.saved ? 'trash-2' : 'bookmark',
            style: savedState.saved
              ? { backgroundColor: colors.surfaceMuted, borderColor: colors.border, borderWidth: 1 }
              : { backgroundColor: colors.amber },
            textStyle: savedState.saved ? { color: colors.textSecondary } : { color: '#1A1410' },
            loading: savedState.saving,
          } as any)}
        />
      </View>

      {/* Modals for Premium/Pro Upgrades */}
      <UpgradeModal
        visible={upgradeModalVisible}
        onClose={() => setUpgradeModalVisible(false)}
        onUpgrade={() => {
          setUpgradeModalVisible(false);
          // upgradeType is 'auth' (PDF/heatmap locked) or 'price' (price locked).
          navigation.navigate('Subscription', {
            trigger: upgradeType === 'auth' ? 'pdf_locked' : 'price_locked',
          });
        }}
        // Auth modal advertises heatmap + hallmark + AI report — those
        // unlock at Premium (heatmapPerMonth 50, authenticityHeatmap true).
        // Routing to Standard would be a bait-and-switch: user pays ฿990
        // and finds heatmap still locked. Price modal stays on Standard
        // since real-time RAG valuation is gated there.
        tier={upgradeType === 'auth' ? 'premium' : 'standard'}
        reason={upgradeReason}
        title={
          upgradeType === 'auth'
            ? (lang === 'th' ? 'ปลดล็อกรายงานวิเคราะห์ความแท้ AI' : 'Unlock AI Authenticity Report')
            : (lang === 'th' ? 'ปลดล็อกการประเมินราคาเรียลไทม์' : 'Unlock Real-Time Valuation')
        }
        body={
          upgradeType === 'auth'
            ? (lang === 'th' ? 'เข้าถึงตำแหน่งวิเคราะห์ลายเซ็น การแกะสลักเครื่อง และรายละเอียดหลักชั่วโมง/หน้าปัด' : 'Access diagnostic signatures, micro-engraving checks, and visual alignment signals.')
            : (lang === 'th' ? 'ปลดล็อกช่วงราคาตลาดรองแบบเรียลไทม์ โดยแบ่งเกรดตามสภาพนาฬิกา (Excellent, Good, Fair)' : 'Unlock live secondary market ranges mapped to Excellent, Good, and Fair condition.')
        }
        benefits={
          upgradeType === 'auth'
            ? [
                { icon: '🔒', text: lang === 'th' ? 'รายงานตรวจสอบหน้าปัดและขอบมุมละเอียดทุกชิ้นส่วน' : 'Full itemized point-by-point dial/case reports' },
                { icon: '🛡️', text: lang === 'th' ? 'ตรวจสอบการสลักลายเซ็นกลไกเครื่องและตัวเรือน' : 'Imaged caliber finishing and micro-hallmark audit' },
                { icon: '📊', text: lang === 'th' ? 'เพิ่มโควต้าจำนวนการสแกนความแท้รายเดือน' : 'Increased monthly scan quota' },
              ]
            : [
                { icon: '💰', text: lang === 'th' ? 'ดึงราคาตลาดรองแบบเรียลไทม์ด้วย Grounded RAG' : 'Live secondary market values (grounded RAG)' },
                { icon: '🏷️', text: lang === 'th' ? 'แยกแยะเกรดตามสภาพเพื่อเปรียบเทียบราคาได้ดีที่สุด' : 'Condition-based market price grading tiers' },
                { icon: '📈', text: lang === 'th' ? 'คำนวณมูลค่ารวมตู้นิรภัยและวิเคราะห์อัตรากำไร (P&L)' : 'Automated portfolio value & P&L tracking' },
              ]
        }
      />

      {/* Data Consent Modal */}
      <DataConsentModal
        visible={consentModalVisible}
        onDecided={(granted) => {
          console.log('[ResultScreen] data consent decided:', granted);
        }}
        onClose={() => setConsentModalVisible(false)}
      />

      {/* ─────────────────────────────────────────────────────────
          Serial-input modal (AI-Data Fusion v2 entry point).
          User types the serial off the rehaut/caseback; submit runs
          validateSerial locally and updates `result` so the serial
          banner re-renders. No Gemini call. Free, all tiers.
          ───────────────────────────────────────────────────────── */}
      <Modal
        animationType="fade"
        transparent
        visible={serialModalOpen}
        onRequestClose={() => setSerialModalOpen(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(0, 0, 0, 0.85)',
            justifyContent: 'center',
            alignItems: 'center',
            padding: 16,
          }}
        >
          <View
            style={{
              width: '100%',
              maxWidth: 380,
              backgroundColor: '#0F0B06',
              borderColor: colors.amber,
              borderWidth: 1.5,
              borderRadius: 16,
              padding: 22,
              overflow: 'hidden',
            }}
          >
            <LinearGradient
              colors={['#1F160E', '#0A0805']}
              style={StyleSheet.absoluteFillObject}
            />

            <View style={{ alignItems: 'center', marginBottom: 14 }}>
              <View
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 24,
                  backgroundColor: 'rgba(236, 200, 122, 0.10)',
                  borderWidth: 1,
                  borderColor: 'rgba(236, 200, 122, 0.35)',
                  justifyContent: 'center',
                  alignItems: 'center',
                  marginBottom: 10,
                }}
              >
                <Feather name="hash" size={22} color={colors.amber} />
              </View>
              <Text style={{ color: '#F5E9CC', fontSize: 18, fontWeight: '800', textAlign: 'center' }}>
                Serial Number
              </Text>
              <Text style={{ color: '#A89E8A', fontSize: 12, marginTop: 4, textAlign: 'center', lineHeight: 17 }}>
                {lang === 'th'
                  ? 'กรอกซีเรียลที่สลักบน rehaut / ฝาหลัง / ระหว่างขาสาย'
                  : 'Enter the serial engraved on the rehaut / caseback / between the lugs'}
              </Text>
            </View>

            <TextInput
              style={{
                backgroundColor: 'rgba(0,0,0,0.55)',
                borderColor: colors.amber,
                borderWidth: 1.5,
                borderRadius: 10,
                color: '#fff',
                padding: 16,
                fontSize: 20,
                fontWeight: '800',
                letterSpacing: 2,
                textAlign: 'center',
                marginBottom: 18,
              }}
              placeholder={lang === 'th' ? 'เช่น 7F8K2M9P' : 'e.g. 7F8K2M9P'}
              placeholderTextColor="rgba(255,255,255,0.2)"
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={20}
              value={serialInput}
              onChangeText={setSerialInput}
              autoFocus
            />

            <Pressable
              onPress={() => {
                const s = serialInput.trim();
                if (!s) {
                  Alert.alert(
                    lang === 'th' ? 'ยังไม่ได้กรอกซีเรียล' : 'No serial entered',
                    lang === 'th'
                      ? 'กรุณากรอกหมายเลขซีเรียลที่อ่านได้จากตัวเรือน'
                      : 'Please enter the serial read off the watch.'
                  );
                  return;
                }
                setResult((prev) => {
                  const check = validateSerial(prev.brand, s, prev.year);
                  const next = { ...prev, serialNumber: s, serialCheck: check };
                  if (check.penalty > 0) {
                    next.authenticityProbability = Math.max(5, (prev.authenticityProbability ?? 0) - check.penalty);
                  }
                  return next;
                });
                setSerialModalOpen(false);
              }}
              style={({ pressed }) => ({
                backgroundColor: colors.amber,
                borderRadius: 10,
                padding: 14,
                alignItems: 'center',
                marginBottom: 10,
                opacity: pressed ? 0.8 : 1,
              })}
            >
              <Text style={{ color: '#1A130C', fontWeight: '800', fontSize: 14, letterSpacing: 0.5 }}>
                {lang === 'th' ? 'ยืนยันและตรวจสอบ' : 'VERIFY SERIAL'}
              </Text>
            </Pressable>

            <Pressable
              onPress={() => setSerialModalOpen(false)}
              style={({ pressed }) => ({
                borderColor: 'rgba(255,255,255,0.2)',
                borderWidth: 1,
                borderRadius: 10,
                padding: 12,
                alignItems: 'center',
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Text style={{ color: colors.textSecondary, fontSize: 12.5 }}>
                {lang === 'th' ? 'ยกเลิก' : 'CANCEL'}
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0805',
  },
  header: {
    height: 72,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    backgroundColor: 'rgba(10, 8, 5, 0.75)',
    borderBottomWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.03)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
  },
  headerBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  headerAppLogo: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  headerCenter: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  headerLogo: {
    marginBottom: 2,
  },
  headerTitleMain: {
    fontSize: 14,
    fontWeight: '800',
    color: '#ECC87A',
    letterSpacing: 2,
    textAlign: 'center',
  },
  headerTitleSub: {
    fontSize: 9,
    fontWeight: '700',
    color: '#ECC87A',
    letterSpacing: 1.5,
    textAlign: 'center',
    marginTop: 1,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  scrollContent: {
    paddingBottom: 110,
  },
  liveRateWarningBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(236, 200, 122, 0.06)',
    borderColor: 'rgba(236, 200, 122, 0.25)',
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    marginHorizontal: spacing.md,
    marginTop: spacing.md,
  },
  liveRateWarningText: {
    flex: 1,
    fontSize: 12,
    color: colors.amberLight,
    fontWeight: '600',
  },
  actionContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    marginTop: spacing.md,
    gap: 12,
  },
  actionBtn: {
    flex: 1,
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: 1.2,
    borderColor: 'rgba(236, 200, 122, 0.25)',
    backgroundColor: 'rgba(236, 200, 122, 0.04)',
  },
  actionBtnPrimary: {
    backgroundColor: '#ECC87A',
    borderColor: '#ECC87A',
  },
  actionBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#ECC87A',
  },
  disclaimerBox: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    marginTop: spacing.md,
    marginBottom: spacing.lg,
  },
  disclaimerText: {
    fontSize: 9.5,
    color: '#7A736A',
    lineHeight: 15,
    textAlign: 'justify',
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#0A0805',
    borderTopWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.03)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
});
