import React from 'react';
import { View, Text, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import { Feather, Ionicons } from '@expo/vector-icons';
import { radius, spacing } from '../../lib/theme';
import { AuthColor } from '../../lib/authVerdictColor';
import { ScanResult } from '../../lib/types';
import { TierCapabilities } from '../../lib/tier';
import { useLanguage } from '../../lib/localization';
import { usePriceFallback } from './usePriceFallback';

interface PriceCardProps {
  authColor: AuthColor;
  result: ScanResult;
  caps: TierCapabilities;
  exchangeRate: number | null;
  savedId?: string;
  refreshingPrices: boolean;
  handleUpgradePress: (type: 'auth' | 'price') => void;
  handleRefreshPrices: () => void;
}

/**
 * Resale market valuation card. Extracted from SpecsSection so it can render
 * ABOVE the share / PDF action bar (it's the headline number a buyer quotes).
 */
export default function PriceCard({
  authColor,
  result,
  caps,
  exchangeRate,
  savedId,
  refreshingPrices,
  handleUpgradePress,
  handleRefreshPrices,
}: PriceCardProps) {
  const { lang } = useLanguage();
  const { formatTHB, getBrandFallbackPrice } = usePriceFallback();

  if (authColor === 'red') {
    return (
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
    );
  }

  return (
    <View style={styles.marketValCard}>
      <View style={styles.marketValHeader}>
        <Text style={styles.marketValTitle}>{lang === 'th' ? 'ราคาตลาดรองประเมิน: ' : 'Market Value: '} </Text>
        {caps.priceData ? (
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
            {caps.priceData
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
            {caps.priceData
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
            {caps.priceData
              ? formatTHB(result.priceByGrade?.fair || Math.round((result.marketPrice || getBrandFallbackPrice(result.brand, result.name)) * 0.9), exchangeRate)
              : formatTHB(Math.round(getBrandFallbackPrice(result.brand, result.name) * 0.9), exchangeRate)}
          </Text>
        </View>
      </View>

      {!caps.priceData && (
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
  );
}

const styles = StyleSheet.create({
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
});
