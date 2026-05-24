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
            <Text style={styles.authReasonTitle}>{lang === 'th' ? 'การวิเคราะห์การตกแต่งและโครงสร้างตัวเรือน' : 'CASE MICRO-FINISHING ANALYSIS'}</Text>
            <Text style={styles.authReasonBody}>
              {result.authenticityReasoning || (lang === 'th' ? 'ตัวบ่งชี้การวิเคราะห์เกณฑ์มาตรฐานครบถ้วนแล้ว' : 'Standard inspection check-markers analyzed.')}
            </Text>

            {result.authenticitySignals && result.authenticitySignals.length > 0 && (
              <View style={styles.signalsList}>
                <Text style={styles.signalsTitle}>{lang === 'th' ? 'สัญญาณบ่งชี้คุณภาพของชิ้นส่วน (AI Signals)' : 'Imaged Quality Signifiers (Signals)'}</Text>
                {result.authenticitySignals.map((s, idx) => {
                  const iconColor = s.weight === 'positive' ? colors.success : s.weight === 'negative' ? colors.danger : colors.textSecondary;
                  const iconName = s.weight === 'positive' ? 'check-circle' : s.weight === 'negative' ? 'alert-triangle' : 'info';
                  return (
                    <View key={idx} style={styles.signalRow}>
                      <Feather name={iconName} size={14} color={iconColor} style={{ marginTop: 2 }} />
                      <Text style={styles.signalText}>{s.signal}</Text>
                    </View>
                  );
                })}
              </View>
            )}
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
