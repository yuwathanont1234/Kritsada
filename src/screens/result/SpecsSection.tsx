import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { colors, radius, spacing } from '../../lib/theme';
import { AuthColor } from '../../lib/authVerdictColor';
import { ScanResult } from '../../lib/types';
import { TierCapabilities } from '../../lib/tier';
import { useLanguage } from '../../lib/localization';
import {
  getLandmarksForWatch,
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
  handleUpgradePress,
  getBadgeLabel,
}: SpecsSectionProps) {
  const { lang } = useLanguage();

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
    () => getLandmarksForWatch(result.brand, result.name, result.reference),
    [result.brand, result.name, result.reference]
  );
  const signals = result.authenticitySignals ?? [];
  const overridden = result.weightCheck?.grade === 'mismatch';
  // A reproduction verdict with POSITIVE per-feature scores is contradictory:
  // a good replica looks correct feature-by-feature (these scores rate how the
  // feature LOOKS in the photo, not authenticity), and the verdict is driven by
  // HOLISTIC signals (web-seller watermark, A1 classifier) that aren't tied to
  // these landmark checkpoints. So when the app already called the watch fake,
  // mute the misleading greens + show an explainer — the list must never read
  // as "passed" on a watch the verdict says is a reproduction.
  const verdictIsFake =
    result.authenticityVerdict === 'likely-reproduction' ||
    (result.authenticityProbability != null && result.authenticityProbability < 35);

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
      <Text style={{ color: colors.textGold, fontSize: 13, fontWeight: '800', letterSpacing: 1, marginBottom: 8 }}>
        {lang === 'th' ? 'จุดตรวจสอบ Hallmark' : 'HALLMARK INSPECTION POINTS'}
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

      {verdictIsFake && cards.some((c) => c.match?.weight === 'positive') && (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'flex-start',
            paddingHorizontal: 10,
            paddingVertical: 9,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: 'rgba(236, 200, 122, 0.45)',
            backgroundColor: 'rgba(236, 200, 122, 0.07)',
            marginBottom: 10,
          }}
        >
          <Feather name="alert-triangle" size={13} color="#ECC87A" style={{ marginRight: 7, marginTop: 1 }} />
          <Text style={{ color: '#D9CBA8', fontSize: 11, flex: 1, lineHeight: 16 }}>
            {lang === 'th'
              ? 'คะแนนรายจุดด้านล่างสะท้อน "หน้าตา" ของแต่ละจุดในภาพ ไม่ใช่ความแท้ — ของเลียนแบบเกรดดีผ่านรายจุดได้ คำตัดสินรวมเป็น "ของเลียนแบบ" มาจากสัญญาณองค์รวม (เช่น ลายน้ำเว็บขายของปลอม หรือ AI classifier)'
              : 'The per-point scores below reflect how each feature LOOKS in the photo, not authenticity — a good replica can score well point-by-point. The overall "Reproduction" verdict comes from holistic signals (e.g. a reseller watermark or the AI classifier).'}
          </Text>
        </View>
      )}

      {cards.map(({ landmark, match }, idx) => {
        const expanded = expandedId === landmark.id;
        const weight = match?.weight;
        // A positive (green) score on a fake verdict is contradictory — mute it
        // so the list never reassures on a watch the app already called fake.
        // Negative/neutral scores stay (they support the verdict).
        const contradictoryPositive = verdictIsFake && weight === 'positive';
        const isMuted = overridden || !match || contradictoryPositive;

        const statusColor = isMuted
          ? '#94A3B8'
          : weight === 'positive'
          ? colors.success
          : weight === 'negative'
          ? '#EF4444'
          : '#F59E0B';

        const statusIcon: any = !match
          ? 'circle'
          : isMuted
          ? 'minus-circle'
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
                    color: isMuted ? '#A89E8A' : colors.textCream,
                    fontSize: 13,
                    fontWeight: '700',
                    letterSpacing: 0.2,
                    flex: 1,
                    paddingRight: 8,
                  }}
                >
                  {lang === 'th' ? landmark.labelTh : landmark.labelEn}
                </Text>
                {!isMuted && match?.score != null && (
                  <View
                    style={{
                      paddingHorizontal: 6,
                      paddingVertical: 1,
                      borderRadius: 6,
                      borderWidth: 1,
                      borderColor: statusColor,
                      marginRight: 6,
                    }}
                  >
                    <Text style={{ color: statusColor, fontSize: 11, fontWeight: '800' }}>
                      {`${match.score}/10`}
                    </Text>
                  </View>
                )}
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
                  style={{ color: colors.textCreamDim, fontSize: 11.5, marginTop: 2, lineHeight: 16 }}
                >
                  {lang === 'th' ? (match.signalTh || match.signal) : match.signal}
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
                      <Text style={{ color: colors.textGold, fontSize: 12.5, lineHeight: 18 }}>
                        {lang === 'th' ? (match.signalTh || match.signal) : match.signal}
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
                  <Text style={{ color: colors.textCreamDim, fontSize: 12, lineHeight: 17 }}>
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
