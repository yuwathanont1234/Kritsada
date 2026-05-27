import React from 'react';
import { View, Text, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather, Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing } from '../../lib/theme';
import { AuthColor } from '../../lib/authVerdictColor';
import { ScanResult } from '../../lib/types';
import { TierCapabilities } from '../../lib/tier';
import { useLanguage } from '../../lib/localization';
import { usePriceFallback } from './usePriceFallback';
import {
  getLandmarksForBrand,
  matchSignalToLandmark,
} from '../../lib/data/watchLandmarks';

interface SpecsSectionProps {
  authColor: AuthColor;
  result: ScanResult;
  caps: TierCapabilities;
  exchangeRate: number | null;
  savedId?: string;
  refreshingPrices: boolean;
  handleUpgradePress: (type: 'auth' | 'price') => void;
  handleRefreshPrices: () => void;
  getBadgeLabel: (color: AuthColor) => string;
}

export default function SpecsSection({
  authColor,
  result,
  caps,
  exchangeRate,
  savedId,
  refreshingPrices,
  handleUpgradePress,
  handleRefreshPrices,
  getBadgeLabel,
}: SpecsSectionProps) {
  const { lang } = useLanguage();
  const { formatTHB, getBrandFallbackPrice } = usePriceFallback();

  // Get authenticity badge styling
  let authBadge = null;
  if (authColor === 'green') {
    authBadge = { primary: colors.success, tint: 'rgba(46, 204, 113, 0.08)', icon: 'check-circle' as const };
  } else if (authColor === 'yellow') {
    authBadge = { primary: colors.warning, tint: 'rgba(236, 200, 122, 0.08)', icon: 'help-circle' as const };
  } else if (authColor === 'red') {
    authBadge = { primary: colors.danger, tint: 'rgba(231, 76, 60, 0.08)', icon: 'alert-triangle' as const };
  }

  return (
    <View style={styles.container}>
      {/* Dynamic Authenticity Section */}
      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>{lang === 'th' ? 'การวิเคราะห์ความแท้ด้วย AI' : 'AI AUTHENTICITY ANALYSIS'}</Text>

        {authBadge ? (
          <View
            style={[
              styles.authBadgeContainer,
              { backgroundColor: authBadge.tint },
            ]}
          >
            <Feather name={authBadge.icon} size={20} color={authBadge.primary} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.authBadgeLabel, { color: authBadge.primary }]}>
                {getBadgeLabel(authColor)}
              </Text>
              {typeof result.authenticityProbability === 'number' && (
                <Text style={styles.authBadgeConfidence}>
                  {lang === 'th' ? 'ระดับความเชื่อมั่น' : 'Confidence'}: {result.authenticityProbability}%
                </Text>
              )}
            </View>
          </View>
        ) : (
          <View style={styles.noAuthBox}>
            <Feather name="help-circle" size={18} color={colors.textSecondary} />
            <Text style={styles.noAuthText}>{lang === 'th' ? 'กำลังประมวลผลการวิเคราะห์ความแท้...' : 'Analyzing authenticity details...'}</Text>
          </View>
        )}

        {/* Gated Authenticity Reasoning based on Subscription capabilities */}
        {caps.showAuthenticitySignals ? (
          <View style={styles.authReasonBox}>
            {/* When the verdict was overridden by Weight Fusion, surface
                the structured bilingual override message FIRST so the
                user reads it before the (now-stale) Gemini reasoning.
                Without this the reasoning area shows only Gemini's
                pre-override paragraph (e.g. "the watch shows authentic
                features…") which contradicts the Likely Reproduction
                verdict above and reads as a system bug. */}
            {result.weightCheck?.overrideMessage && (
              <View
                style={{
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: 'rgba(239, 68, 68, 0.50)',
                  backgroundColor: 'rgba(239, 68, 68, 0.10)',
                  padding: 12,
                  marginBottom: 12,
                }}
              >
                <Text
                  style={{
                    color: '#FCA5A5',
                    fontSize: 13,
                    fontWeight: '700',
                    lineHeight: 19,
                  }}
                >
                  {lang === 'th'
                    ? result.weightCheck.overrideMessage.th
                    : result.weightCheck.overrideMessage.en}
                </Text>
              </View>
            )}

            <Text style={styles.authReasonTitle}>{lang === 'th' ? 'การวิเคราะห์การตกแต่งและโครงสร้างตัวเรือน' : 'CASE MICRO-FINISHING ANALYSIS'}</Text>
            <Text style={styles.authReasonBody}>
              {result.authenticityReasoning || (lang === 'th' ? 'ตัวบ่งชี้การวิเคราะห์เกณฑ์มาตรฐานครบถ้วนแล้ว' : 'Standard inspection check-markers analyzed.')}
            </Text>

            {/* ── Numbered Landmark Cards ──
                Replace flat signals list with brand-specific landmark
                analysis. Each card has the same number as the pin on
                the watch image above, so users can cross-reference
                "where is #3 → that's the rehaut engraving area".
                Pin colour ↔ card status colour by design. */}
            <LandmarkCardsSection result={result} lang={lang} />

            {/* ── AI Metrics Summary Panel ──
                Compact numeric ratio bar — same data Songphra shows
                ("Heatmap Green Ratio 80%, Initial Scan Confidence 85%")
                that turns the abstract verdict into a defensible
                number a buyer can quote. */}
            <AiMetricsPanel result={result} lang={lang} />
          </View>
        ) : (
          <View style={styles.lockedBox}>
            <LinearGradient
              colors={['transparent', 'rgba(10, 8, 5, 0.95)']}
              style={StyleSheet.absoluteFillObject}
            />
            <View style={styles.lockedInner}>
              <View style={styles.lockIconCircle}>
                <Feather name="lock" size={20} color={colors.amber} />
              </View>
              <Text style={styles.lockedTitle}>{lang === 'th' ? 'ปลดล็อกรายงานความแท้ AI ฉบับเต็ม' : 'Unlock Full AI Authenticity Report'}</Text>
              <Text style={styles.lockedSub}>
                {lang === 'th'
                  ? 'ปลดล็อกการประเมินรายละเอียดเครื่อง การแกะสลักกลไก ฟันเฟือง และตำแหน่งลายเซ็นการผลิตดั้งเดิมอย่างละเอียด'
                  : 'Unlock detailed caliber finishing evaluation, hallmark micro-engraving detection, and visual signal weights.'}
              </Text>
              <Pressable
                style={styles.lockedBtn}
                onPress={() => handleUpgradePress('auth')}
              >
                <Text style={styles.lockedBtnText}>{lang === 'th' ? 'อัปเกรดเพื่อปลดล็อก' : 'Upgrade to Unlock'}</Text>
              </Pressable>
            </View>
          </View>
        )}
      </View>

      {/* Sleek, Glassmorphic Resale Market Valuation Card matching mockup */}
      {authColor === 'red' ? (
        <View style={[styles.marketValCard, { borderColor: 'rgba(239, 68, 68, 0.25)', borderWidth: 1 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <Feather name="alert-triangle" size={16} color="#EF4444" />
            <Text style={{ color: '#EF4444', fontSize: 14, fontWeight: '800', letterSpacing: 1 }}>
              {lang === 'th' ? 'ระงับการประเมินราคา' : 'VALUATION DISABLED'}
            </Text>
          </View>
          <Text style={{ color: '#B5AFA5', fontSize: 13, lineHeight: 19 }}>
            {lang === 'th'
              ? 'นาฬิกาเรือนนี้จัดอยู่ในประเภทของเลียนแบบ (Likely Reproduction) ระบบจึงปิดการแสดงมูลค่าตลาดดัชนีราคาสำหรับนาฬิกาที่ไม่ใช่ของแท้'
              : 'This timepiece has been classified as a Likely Reproduction (counterfeit). Market valuation and pricing indexes are disabled for unverified replicas.'}
          </Text>
        </View>
      ) : (
        <View style={styles.marketValCard}>
          <View style={styles.marketValHeader}>
            <Text style={styles.marketValTitle}>{lang === 'th' ? 'ราคาตลาดรองประเมิน: ' : 'Market Value: '} </Text>
            {caps.showRealPrices ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={styles.marketValPrice}>
                  {formatTHB(result.marketPrice, exchangeRate)}
                </Text>
                {savedId && (
                  <Pressable
                    onPress={handleRefreshPrices}
                    disabled={refreshingPrices}
                    hitSlop={12}
                    style={{
                      marginLeft: 6,
                      backgroundColor: 'rgba(236, 200, 122, 0.1)',
                      width: 24,
                      height: 24,
                      borderRadius: 12,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {refreshingPrices ? (
                      <ActivityIndicator size="small" color="#ECC87A" style={{ transform: [{ scale: 0.75 }] }} />
                    ) : (
                      <Feather name="refresh-cw" size={11} color="#ECC87A" />
                    )}
                  </Pressable>
                )}
              </View>
            ) : (
              <Text style={styles.marketValPriceBlurred}>฿X,XXX,XXX</Text>
            )}
          </View>
          
          <View style={styles.marketValDivider} />

          <View style={styles.gradeGridHorizontal}>
            {/* Column 1: Excellent */}
            <View style={styles.gradeColumn}>
              <View style={styles.gradeRowHeader}>
                <Ionicons name="checkmark-circle" size={14} color="#ECC87A" style={{ marginRight: 2 }} />
                <Text style={styles.gradeTextLabel}>{lang === 'th' ? 'สภาพดีเยี่ยม' : 'Excellent'}</Text>
              </View>
              <Text style={styles.gradeTextSubLabel}>{lang === 'th' ? 'ระดับดีเลิศ' : 'Condition'}</Text>
              <Text style={styles.gradeColorLabel}>{lang === 'th' ? 'ทองคำ' : 'Gold'}</Text>
              <Text style={styles.gradePriceGold}>
                {caps.showRealPrices
                  ? formatTHB(result.priceByGrade?.excellent || Math.round((result.marketPrice || getBrandFallbackPrice(result.brand, result.name)) * 1.1), exchangeRate)
                  : formatTHB(Math.round(getBrandFallbackPrice(result.brand, result.name) * 1.1), exchangeRate)}
              </Text>
            </View>

            {/* Column 2: Good */}
            <View style={styles.gradeColumn}>
              <View style={styles.gradeRowHeader}>
                <Ionicons name="ellipse" size={10} color="#FFFFFF" style={{ marginRight: 4, marginTop: 2 }} />
                <Text style={styles.gradeTextLabel}>{lang === 'th' ? 'สภาพดี' : 'Good'}</Text>
              </View>
              <Text style={styles.gradeTextSubLabel}>{lang === 'th' ? 'ระดับทั่วไป' : 'Condition'}</Text>
              <Text style={styles.gradeColorLabel}>{lang === 'th' ? 'สีขาว' : 'White'}</Text>
              <Text style={styles.gradePriceWhite}>
                {caps.showRealPrices
                  ? formatTHB(result.priceByGrade?.good || (result.marketPrice || getBrandFallbackPrice(result.brand, result.name)), exchangeRate)
                  : formatTHB(getBrandFallbackPrice(result.brand, result.name), exchangeRate)}
              </Text>
            </View>

            {/* Column 3: Fair */}
            <View style={styles.gradeColumn}>
              <View style={styles.gradeRowHeader}>
                <Ionicons name="ellipse" size={10} color="#7A736A" style={{ marginRight: 4, marginTop: 2 }} />
                <Text style={styles.gradeTextLabel}>{lang === 'th' ? 'สภาพปานกลาง' : 'Fair'}</Text>
              </View>
              <Text style={styles.gradeTextSubLabel}>{lang === 'th' ? 'ระดับผ่านเกณฑ์' : 'Condition'}</Text>
              <Text style={styles.gradeColorLabel}>{lang === 'th' ? 'สีเทา' : 'Grey'}</Text>
              <Text style={styles.gradePriceGrey}>
                {caps.showRealPrices
                  ? formatTHB(result.priceByGrade?.fair || Math.round((result.marketPrice || getBrandFallbackPrice(result.brand, result.name)) * 0.9), exchangeRate)
                  : formatTHB(Math.round(getBrandFallbackPrice(result.brand, result.name) * 0.9), exchangeRate)}
              </Text>
            </View>
          </View>

          {!caps.showRealPrices && (
            <View style={styles.marketValUpgradeOverlay}>
              <Pressable
                style={styles.marketValUpgradeBtn}
                onPress={() => handleUpgradePress('price')}
              >
                <Feather name="lock" size={12} color="#1A1410" style={{ marginRight: 4 }} />
                <Text style={styles.marketValUpgradeBtnText}>{lang === 'th' ? 'ปลดล็อกการประเมินราคาเรียลไทม์' : 'Unlock Real-Time Valuation'}</Text>
              </Pressable>
            </View>
          )}
        </View>
      )}

      {/* Educational Checklist Card */}
      {result.checklist && result.checklist.length > 0 && (
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>{lang === 'th' ? 'เกณฑ์มาตรฐานสำหรับการตรวจสอบทางกายภาพ' : 'PHYSICAL INSPECTION CHECKLIST'}</Text>
          <View style={styles.checklistContainer}>
            {result.checklist.map((item, idx) => (
              <View key={idx} style={styles.checkRow}>
                <View style={styles.checkBullet}>
                  <Feather name="check" size={12} color={colors.amber} />
                </View>
                <Text style={styles.checkText}>{item}</Text>
              </View>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  sectionCard: {
    marginHorizontal: spacing.md,
    marginTop: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    overflow: 'hidden',
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.text,
    borderLeftWidth: 3,
    borderColor: colors.amber,
    paddingLeft: spacing.sm,
    marginBottom: spacing.md,
    letterSpacing: 1,
  },
  authBadgeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  authBadgeLabel: {
    fontSize: 15,
    fontWeight: '900',
  },
  authBadgeConfidence: {
    fontSize: 10,
    color: colors.textSecondary,
    marginTop: 2,
    fontWeight: '500',
  },
  noAuthBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
  },
  noAuthText: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  authReasonBox: {
    marginTop: spacing.md,
  },
  authReasonTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.amber,
    marginBottom: 4,
  },
  authReasonBody: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  signalsList: {
    marginTop: spacing.md,
    backgroundColor: colors.background,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 8,
  },
  signalsTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 4,
  },
  signalRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  signalText: {
    flex: 1,
    fontSize: 11,
    color: colors.textSecondary,
    lineHeight: 16,
  },
  lockedBox: {
    height: 180,
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  lockedInner: {
    alignItems: 'center',
    padding: spacing.md,
    zIndex: 1,
  },
  lockIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(236, 200, 122, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  lockedTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.text,
  },
  lockedSub: {
    fontSize: 10,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 14,
    paddingHorizontal: spacing.lg,
  },
  lockedBtn: {
    backgroundColor: colors.amber,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    marginTop: spacing.md,
    shadowColor: colors.amber,
    shadowOpacity: 0.3,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  lockedBtnText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#1A1410',
  },
  marketValCard: {
    marginHorizontal: spacing.md,
    marginTop: spacing.md,
    backgroundColor: 'rgba(30, 24, 20, 0.35)',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(236, 200, 122, 0.12)',
    padding: spacing.md,
    position: 'relative',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
  },
  marketValHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 4,
    paddingVertical: 2,
  },
  marketValTitle: {
    fontSize: 11,
    color: '#7A736A',
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  marketValPrice: {
    fontSize: 13,
    fontWeight: '800',
    color: '#ECC87A',
  },
  marketValPriceBlurred: {
    fontSize: 13,
    fontWeight: '800',
    color: '#ECC87A',
    opacity: 0.6,
  },
  marketValDivider: {
    height: 1,
    backgroundColor: 'rgba(236, 200, 122, 0.08)',
    marginVertical: spacing.md,
  },
  gradeGridHorizontal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  gradeColumn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gradeRowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 20,
  },
  gradeTextLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  gradeTextSubLabel: {
    fontSize: 8,
    color: '#7A736A',
    marginTop: 2,
  },
  gradeColorLabel: {
    fontSize: 9,
    color: '#7A736A',
    marginTop: 1,
  },
  gradePriceGold: {
    fontSize: 12,
    fontWeight: '800',
    color: '#ECC87A',
    marginTop: 6,
  },
  gradePriceWhite: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
    marginTop: 6,
  },
  gradePriceGrey: {
    fontSize: 12,
    fontWeight: '800',
    color: '#B5AFA5',
    marginTop: 6,
  },
  marketValUpgradeOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(10, 8, 5, 0.88)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  marketValUpgradeBtn: {
    backgroundColor: '#ECC87A',
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#ECC87A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  marketValUpgradeBtnText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#1A1410',
  },
  checklistContainer: {
    gap: spacing.sm,
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  checkBullet: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: 'rgba(236, 200, 122, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  checkText: {
    flex: 1,
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 17,
  },
});

// ════════════════════════════════════════════════════════════════════
// LandmarkCardsSection
// ════════════════════════════════════════════════════════════════════
// Replaces the old flat signals bullet list. Each card maps 1-to-1 with
// the numbered pin on the watch image above (rendered by VerdictHeader).
// Cards are collapsed by default; tap to expand and read what AI saw
// at that specific anatomical landmark. Status colour:
//   ✅ green  — landmark passed (Gemini positive signal matched)
//   ⚠️ amber  — landmark neutral signal (mention but no clear pass/fail)
//   ❌ red    — landmark failed (negative signal)
//   ⚪ gray   — no Gemini signal mentioned this landmark
// ════════════════════════════════════════════════════════════════════
function LandmarkCardsSection({
  result,
  lang,
}: {
  result: ScanResult;
  lang: 'th' | 'en';
}) {
  const [expandedId, setExpandedId] = React.useState<string | null>(null);
  const landmarks = React.useMemo(
    () => getLandmarksForBrand(result.brand),
    [result.brand]
  );
  const signals = result.authenticitySignals ?? [];
  const overridden = result.weightCheck?.grade === 'mismatch';

  // Pre-compute matches so we don't re-run the regex on every render.
  const cards = React.useMemo(
    () =>
      landmarks.map((lm) => ({
        landmark: lm,
        match: matchSignalToLandmark(lm, signals),
      })),
    [landmarks, signals]
  );

  return (
    <View style={{ marginTop: 8 }}>
      <Text style={{ color: '#E8DCC0', fontSize: 13, fontWeight: '800', letterSpacing: 1, marginBottom: 8 }}>
        {lang === 'th' ? 'จุดสำคัญสำหรับการตรวจสอบ (AI Landmarks)' : 'AUTHENTICATION LANDMARKS'}
      </Text>

      {overridden && (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 10,
            paddingVertical: 8,
            borderRadius: 8,
            backgroundColor: 'rgba(120, 120, 130, 0.18)',
            marginBottom: 10,
          }}
        >
          <Feather name="info" size={12} color="#A89E8A" style={{ marginRight: 6 }} />
          <Text
            style={{
              color: '#A89E8A',
              fontSize: 11,
              flex: 1,
              lineHeight: 16,
              fontStyle: 'italic',
            }}
          >
            {lang === 'th'
              ? 'การวิเคราะห์ด้านล่างมาจาก Gemini ก่อนตรวจ Weight Fusion (คำตัดสินด้านบนแทนที่แล้ว)'
              : 'Pre-Weight-Fusion Gemini analysis below (superseded by the verdict above).'}
          </Text>
        </View>
      )}

      {cards.map(({ landmark, match }, idx) => {
        const expanded = expandedId === landmark.id;
        const weight = match?.weight;
        const isMuted = overridden || !match;

        const statusColor = isMuted
          ? '#94A3B8'
          : weight === 'positive'
          ? '#22C55E'
          : weight === 'negative'
          ? '#EF4444'
          : '#F59E0B';

        const statusIcon: any = !match
          ? 'circle'
          : weight === 'positive'
          ? 'check-circle'
          : weight === 'negative'
          ? 'alert-triangle'
          : 'info';

        return (
          <Pressable
            key={landmark.id}
            onPress={() => setExpandedId(expanded ? null : landmark.id)}
            style={{
              flexDirection: 'row',
              alignItems: 'flex-start',
              paddingVertical: 10,
              paddingHorizontal: 10,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: expanded
                ? 'rgba(236, 200, 122, 0.40)'
                : 'rgba(236, 200, 122, 0.12)',
              backgroundColor: expanded
                ? 'rgba(236, 200, 122, 0.06)'
                : 'rgba(18, 14, 10, 0.4)',
              marginBottom: 6,
            }}
          >
            {/* Numbered badge — must match the pin number on the image */}
            <View
              style={{
                width: 24,
                height: 24,
                borderRadius: 12,
                backgroundColor: statusColor,
                borderWidth: 1.5,
                borderColor: 'rgba(255,255,255,0.85)',
                justifyContent: 'center',
                alignItems: 'center',
                marginRight: 10,
                marginTop: 1,
              }}
            >
              <Text style={{ color: '#0A0805', fontSize: 11, fontWeight: '900' }}>
                {idx + 1}
              </Text>
            </View>

            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text
                  style={{
                    color: isMuted ? '#A89E8A' : '#F5E9CC',
                    fontSize: 13,
                    fontWeight: '700',
                    letterSpacing: 0.2,
                    flex: 1,
                    paddingRight: 8,
                  }}
                >
                  {lang === 'th' ? landmark.labelTh : landmark.labelEn}
                </Text>
                <Feather
                  name={statusIcon}
                  size={14}
                  color={statusColor}
                  style={{ marginRight: 4 }}
                />
                <Feather
                  name={expanded ? 'chevron-up' : 'chevron-down'}
                  size={14}
                  color="#A89E8A"
                />
              </View>

              {/* Always-visible 1-line preview when not expanded */}
              {!expanded && match && (
                <Text
                  numberOfLines={1}
                  style={{ color: '#C0B4A0', fontSize: 11.5, marginTop: 2, lineHeight: 16 }}
                >
                  {match.signal}
                </Text>
              )}
              {!expanded && !match && (
                <Text style={{ color: '#6B6258', fontSize: 11, marginTop: 2, fontStyle: 'italic' }}>
                  {lang === 'th' ? 'ไม่มีข้อสังเกตจาก AI' : 'No AI observation'}
                </Text>
              )}

              {/* Expanded — Gemini signal text + landmark guide */}
              {expanded && (
                <View style={{ marginTop: 8 }}>
                  {match ? (
                    <View
                      style={{
                        borderLeftWidth: 2,
                        borderLeftColor: statusColor,
                        paddingLeft: 10,
                        marginBottom: 8,
                      }}
                    >
                      <Text
                        style={{
                          color: '#8A8278',
                          fontSize: 9.5,
                          fontWeight: '700',
                          letterSpacing: 1,
                          marginBottom: 2,
                        }}
                      >
                        {lang === 'th' ? 'การสังเกตของ AI' : 'AI OBSERVATION'}
                      </Text>
                      <Text style={{ color: '#E8DCC0', fontSize: 12.5, lineHeight: 18 }}>
                        {match.signal}
                      </Text>
                    </View>
                  ) : null}

                  <Text
                    style={{
                      color: '#8A8278',
                      fontSize: 9.5,
                      fontWeight: '700',
                      letterSpacing: 1,
                      marginBottom: 2,
                    }}
                  >
                    {lang === 'th' ? 'สิ่งที่ผู้เชี่ยวชาญตรวจ' : 'WHAT EXPERTS LOOK FOR'}
                  </Text>
                  <Text style={{ color: '#C0B4A0', fontSize: 12, lineHeight: 17 }}>
                    {lang === 'th' ? landmark.descriptionTh : landmark.descriptionEn}
                  </Text>
                </View>
              )}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

// ════════════════════════════════════════════════════════════════════
// AiMetricsPanel  — Songphra-style summary metrics
// ════════════════════════════════════════════════════════════════════
// Compact panel that summarises all the "system signals" the user
// usually wants in one glance:
//   • Heatmap Green Ratio  — green landmarks / total
//   • Initial Scan Confidence — Gemini's pre-cap confidence
//   • Weight Match  — Pass / Mismatch / Not provided
//   • DB Reference Match — found / not found
// These match the "ข้อมูลจาก AI สัญญาณที่ AI สังเกต" panel that gives the
// Songphra report its data-driven trustworthy feel.
// ════════════════════════════════════════════════════════════════════
function AiMetricsPanel({
  result,
  lang,
}: {
  result: ScanResult;
  lang: 'th' | 'en';
}) {
  const landmarks = React.useMemo(
    () => getLandmarksForBrand(result.brand),
    [result.brand]
  );
  const signals = result.authenticitySignals ?? [];
  const totals = React.useMemo(() => {
    let green = 0;
    let red = 0;
    let amber = 0;
    let unmatched = 0;
    for (const lm of landmarks) {
      const m = matchSignalToLandmark(lm, signals);
      if (!m) {
        unmatched++;
        continue;
      }
      if (m.weight === 'positive') green++;
      else if (m.weight === 'negative') red++;
      else amber++;
    }
    const total = landmarks.length;
    const greenRatio = total > 0 ? Math.round((green / total) * 100) : 0;
    return { green, red, amber, unmatched, total, greenRatio };
  }, [landmarks, signals]);

  // Weight check pretty-printer.
  const weightLabel = result.weightCheck
    ? result.weightCheck.material === 'unknown'
      ? lang === 'th'
        ? 'ไม่มีค่ามาตรฐาน'
        : 'No spec'
      : result.weightCheck.grade === 'match'
      ? lang === 'th'
        ? '✓ ผ่าน'
        : '✓ Pass'
      : result.weightCheck.grade === 'mismatch'
      ? lang === 'th'
        ? '🚩 ไม่ผ่าน'
        : '🚩 Mismatch'
      : lang === 'th'
      ? 'ใกล้เคียง'
      : 'Close'
    : lang === 'th'
    ? 'ยังไม่กรอก'
    : 'Not provided';

  const weightColor = result.weightCheck
    ? result.weightCheck.grade === 'match'
      ? '#22C55E'
      : result.weightCheck.grade === 'mismatch'
      ? '#EF4444'
      : '#F59E0B'
    : '#94A3B8';

  return (
    <View
      style={{
        marginTop: 14,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: 'rgba(236, 200, 122, 0.20)',
        backgroundColor: 'rgba(18, 14, 10, 0.6)',
        padding: 14,
      }}
    >
      <Text
        style={{
          color: '#ECC87A',
          fontSize: 11,
          fontWeight: '800',
          letterSpacing: 1.4,
          marginBottom: 12,
        }}
      >
        {lang === 'th' ? 'สัญญาณที่ AI สังเกต' : 'AI SIGNALS SUMMARY'}
      </Text>

      {/* Heatmap Green Ratio — most prominent row */}
      <View style={{ marginBottom: 10 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
          <Text style={{ color: '#C0B4A0', fontSize: 12 }}>
            {lang === 'th' ? 'อัตราส่วนจุดเขียว (Green Ratio)' : 'Heatmap Green Ratio'}
          </Text>
          <Text style={{ color: '#F5E9CC', fontSize: 13, fontWeight: '800' }}>
            {totals.greenRatio}% · {totals.green}/{totals.total}
          </Text>
        </View>
        {/* Visual bar */}
        <View
          style={{
            height: 8,
            borderRadius: 4,
            backgroundColor: 'rgba(255,255,255,0.06)',
            flexDirection: 'row',
            overflow: 'hidden',
          }}
        >
          <View
            style={{
              flex: totals.green,
              backgroundColor: '#22C55E',
            }}
          />
          <View
            style={{
              flex: totals.amber,
              backgroundColor: '#F59E0B',
            }}
          />
          <View
            style={{
              flex: totals.red,
              backgroundColor: '#EF4444',
            }}
          />
          <View
            style={{
              flex: totals.unmatched,
              backgroundColor: 'rgba(148, 163, 184, 0.3)',
            }}
          />
        </View>
      </View>

      {/* Initial Scan Confidence */}
      <MetricRow
        label={lang === 'th' ? 'ความเชื่อมั่นการระบุ' : 'Identify Confidence'}
        value={`${result.confidence ?? 0}%`}
        valueColor="#F5E9CC"
      />

      {/* Weight Match */}
      <MetricRow
        label={lang === 'th' ? 'ความหนาแน่นวัสดุ (Weight)' : 'Material Density (Weight)'}
        value={weightLabel}
        valueColor={weightColor}
      />

      {/* DB Reference Match */}
      <MetricRow
        label={lang === 'th' ? 'อ้างอิงจากฐานข้อมูล' : 'Reference DB Match'}
        value={
          result.expertCertMatch
            ? lang === 'th'
              ? '✓ พบ Cert match'
              : '✓ Cert matched'
            : lang === 'th'
            ? 'ไม่พบ'
            : 'Not found'
        }
        valueColor={result.expertCertMatch ? '#22C55E' : '#94A3B8'}
      />
    </View>
  );
}

function MetricRow({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: string;
  valueColor: string;
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 6,
        borderTopWidth: 1,
        borderTopColor: 'rgba(255,255,255,0.04)',
      }}
    >
      <Text style={{ color: '#C0B4A0', fontSize: 12 }}>{label}</Text>
      <Text style={{ color: valueColor, fontSize: 12.5, fontWeight: '700' }}>{value}</Text>
    </View>
  );
}
