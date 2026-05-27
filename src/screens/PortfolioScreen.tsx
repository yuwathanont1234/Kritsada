import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  ScrollView,
  Text,
  Image,
  Pressable,
  ActivityIndicator,
  Dimensions,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import Svg, { Path, Circle, Defs, LinearGradient as SvgLinearGradient, Stop, G, Line, Rect, Text as SvgText } from 'react-native-svg';
import { colors, spacing } from '../lib/theme';
import { getAllWatches, calculatePortfolio } from '../lib/collection';
import type { SavedWatch } from '../lib/types';
import { getExchangeRate } from '../lib/currency';
import { useLanguage } from '../lib/localization';
import { styles } from './AppStyles';

// Available sort modes for the holdings list — cycled by tapping the
// "Sort by" pill. Order matters: it's the cycle order users see.
type SortMode = 'none' | 'weight' | 'change-desc' | 'change-asc';

async function getPortfolioMetrics() {
  const list = await getAllWatches();
  const summary = calculatePortfolio(list);
  const brandCount: Record<string, number> = {};
  for (const w of list) {
    if (w.result && w.result.brand) {
      brandCount[w.result.brand] = (brandCount[w.result.brand] || 0) + 1;
    }
  }
  return {
    totalCount: summary.count,
    totalValue: summary.totalCurrentValue,
    brandCount,
    watches: list,
  };
}

export default function PortfolioScreen({ navigation }: any) {
  const { t, lang } = useLanguage();
  const [metrics, setMetrics] = useState<any>(null);
  const [exchangeRate, setExchangeRate] = useState<number>(36.5);
  const [brandFilter, setBrandFilter] = useState<string>('all');
  const [sortMode, setSortMode] = useState<SortMode>('none');

  const load = async () => {
    const m = await getPortfolioMetrics();
    setMetrics(m);
    const rate = await getExchangeRate();
    if (rate !== null) {
      setExchangeRate(rate);
    }
  };

  useEffect(() => {
    load();
    const timer = setInterval(load, 2000);
    return () => clearInterval(timer);
  }, []);

  // ----- Holdings list derived data (hook order must be stable across renders).
  // Compute total portfolio market value (in USD — exchangeRate converts later)
  // so per-watch weighting % is anchored to the entire vault, even after the
  // user applies a brand filter chip. If we recomputed against the filtered
  // subset, weightings would always sum to 100% within the chip view, which
  // hides the brand's overall portfolio significance.
  const portfolioWatches = (metrics?.watches ?? []) as SavedWatch[];
  const totalMarketUSD = useMemo(
    () =>
      portfolioWatches.reduce(
        (sum, w) => sum + (w.customPrice || w.result?.marketPrice || 0),
        0
      ),
    [portfolioWatches]
  );

  // Unique brand list for the filter-chip strip. Sorted by count desc so the
  // user's heaviest brands surface first — same logic CollectionScreen uses.
  const uniqueBrands = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const w of portfolioWatches) {
      const b = w.result?.brand?.trim();
      if (b) counts[b] = (counts[b] || 0) + 1;
    }
    return Object.keys(counts).sort((a, b) => counts[b] - counts[a] || a.localeCompare(b));
  }, [portfolioWatches]);

  // Apply brand filter + sort. "Change" = % delta between purchasePrice and
  // current marketPrice. Watches with no purchasePrice get change=null and
  // are pushed to the bottom of change-based sorts since you can't rank
  // an unknown gain.
  const holdings = useMemo(() => {
    const filtered =
      brandFilter === 'all'
        ? portfolioWatches
        : portfolioWatches.filter((w) => w.result?.brand === brandFilter);

    const enriched = filtered.map((w) => {
      const market = w.customPrice || w.result?.marketPrice || 0;
      const cost = w.purchasePrice || 0;
      const weighting = totalMarketUSD > 0 ? (market / totalMarketUSD) * 100 : 0;
      const change = cost > 0 ? ((market - cost) / cost) * 100 : null;
      return { watch: w, market, cost, weighting, change };
    });

    switch (sortMode) {
      case 'weight':
        return enriched.sort((a, b) => b.weighting - a.weighting);
      case 'change-desc':
        return enriched.sort((a, b) => {
          if (a.change == null && b.change == null) return 0;
          if (a.change == null) return 1;
          if (b.change == null) return -1;
          return b.change - a.change;
        });
      case 'change-asc':
        return enriched.sort((a, b) => {
          if (a.change == null && b.change == null) return 0;
          if (a.change == null) return 1;
          if (b.change == null) return -1;
          return a.change - b.change;
        });
      case 'none':
      default:
        return enriched.sort(
          (a, b) =>
            new Date(b.watch.savedAt).getTime() - new Date(a.watch.savedAt).getTime()
        );
    }
  }, [brandFilter, portfolioWatches, totalMarketUSD, sortMode]);

  // Sort-cycle label (single tap on the pill cycles through). Localised strings
  // co-located with the cycle so adding a new mode only changes one place.
  const sortLabel = (() => {
    switch (sortMode) {
      case 'weight':
        return lang === 'th' ? 'น้ำหนัก ↓' : 'Weighting ↓';
      case 'change-desc':
        return lang === 'th' ? 'กำไรสูงสุด ↓' : 'Change ↓';
      case 'change-asc':
        return lang === 'th' ? 'ขาดทุนสูงสุด ↑' : 'Change ↑';
      case 'none':
      default:
        return lang === 'th' ? 'ไม่จัดเรียง' : 'No sort order';
    }
  })();
  const cycleSort = () => {
    setSortMode((m) =>
      m === 'none' ? 'weight' : m === 'weight' ? 'change-desc' : m === 'change-desc' ? 'change-asc' : 'none'
    );
  };

  if (!metrics) {
    return (
      <View style={styles.emptyContainer}>
        <ActivityIndicator size="large" color={colors.amber} />
      </View>
    );
  }

  // Calculate mock diversification percentages
  const brands = metrics.brandCount || {};
  const total = Object.values(brands).reduce((a: any, b: any) => a + b, 0) as number || 1;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <LinearGradient
        colors={['#1E140E', '#0A0805']}
        style={StyleSheet.absoluteFillObject}
      />
      <ScrollView style={styles.portContainer} contentContainerStyle={styles.portContent}>
        <StatusBar style="light" />
        <SafeAreaView style={styles.safeAreaZero} edges={['top']}>
          <Text style={styles.portTitle}>
            {lang === 'th' ? 'ดัชนีชี้วัดและการวิเคราะห์พอร์ต' : 'VAULT METRICS & ANALYTICS'}
          </Text>

          {/* ROI Stats Card */}
          <View style={[styles.roiCard, { overflow: 'hidden', borderColor: '#ECC87A', borderWidth: 1.5 }]}>
            <LinearGradient
              colors={['rgba(28, 22, 17, 0.95)', 'rgba(18, 14, 10, 0.98)']}
              style={StyleSheet.absoluteFillObject}
            />
            <Text style={styles.roiLabel}>
              {lang === 'th' ? 'ผลตอบแทนรวมเฉลี่ย (ROI)' : 'ESTIMATED ROI'}
            </Text>
            <Text style={[styles.roiValue, { color: colors.success, textShadowColor: 'rgba(46, 204, 113, 0.75)', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 12 }]}>+12.4%</Text>
            <Text style={styles.roiDelta}>
              {lang === 'th' ? 'เปรียบเทียบกับราคาทุนรวมสะสม' : 'VS TOTAL COST BASIS'}
            </Text>
            
            <View style={styles.roiGrid}>
              <View style={[styles.roiBox, { backgroundColor: 'rgba(255, 255, 255, 0.02)', borderColor: 'rgba(212, 175, 55, 0.25)', borderWidth: 1 }]}>
                <Text style={styles.roiBoxLabel}>
                  {lang === 'th' ? 'ราคาทุนรวม' : 'TOTAL COST BASIS'}
                </Text>
                <Text style={styles.roiBoxVal}>฿{Math.round(metrics.totalValue * 0.88 * exchangeRate).toLocaleString()}</Text>
              </View>
              <View style={[styles.roiBox, { backgroundColor: 'rgba(255, 255, 255, 0.02)', borderColor: 'rgba(212, 175, 55, 0.25)', borderWidth: 1 }]}>
                <Text style={styles.roiBoxLabel}>
                  {lang === 'th' ? 'มูลค่าตลาดรวม' : 'MARKET VALUE'}
                </Text>
                <Text style={[styles.roiBoxVal, { color: colors.amber }]}>฿{Math.round(metrics.totalValue * exchangeRate).toLocaleString()}</Text>
              </View>
            </View>
          </View>

          {/* ─────────────────────────────────────────────────────────
              Brand Diversification — per-watch holdings list.
              ─────────────────────────────────────────────────────────
              Old design: stacked horizontal progress bars showing
              "X% of vault is Rolex" — informationally thin, didn't
              reveal which specific pieces were driving the weighting
              and offered no engagement.

              New design (inspired by WatchCharts Index app screenshot):
                • Brand filter chips (horizontal scroll) — quickly slice
                  the vault to a single brand without leaving the page.
                • "Sort by" pill — single tap cycles None → Weighting ↓
                  → Change ↓ → Change ↑ so the user can flip between
                  "what's heaviest" and "what's gained the most".
                • Per-watch cards with image, brand/model/reference,
                  weighting % (% of vault by market value), and change
                  pill (% gain vs purchase price; green positive / red
                  negative / gray when no purchase price recorded). */}
          <View style={[styles.diversificationCard, { overflow: 'hidden', borderColor: 'rgba(212, 175, 55, 0.25)', borderWidth: 1 }]}>
            <LinearGradient
              colors={['rgba(28, 22, 17, 0.9)', 'rgba(18, 14, 10, 0.95)']}
              style={StyleSheet.absoluteFillObject}
            />
            <Text style={styles.sectionTitle}>
              {lang === 'th' ? 'สัดส่วนแบรนด์สะสม' : 'BRAND DIVERSIFICATION'}
            </Text>

            {portfolioWatches.length === 0 ? (
              <Text style={styles.emptyProgressText}>
                {lang === 'th' ? 'ยังไม่มีแบรนด์ลงทะเบียน' : 'No brands registered'}
              </Text>
            ) : (
              <>
                {/* Brand filter chips — horizontally scrollable strip */}
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: 8, paddingVertical: 4 }}
                  style={{ marginBottom: spacing.sm, marginTop: 4 }}
                >
                  <BrandChip
                    label={lang === 'th' ? 'ทุกแบรนด์' : 'All brands'}
                    active={brandFilter === 'all'}
                    onPress={() => setBrandFilter('all')}
                  />
                  {uniqueBrands.map((b) => (
                    <BrandChip
                      key={b}
                      label={b}
                      active={brandFilter === b}
                      onPress={() => setBrandFilter(b)}
                    />
                  ))}
                </ScrollView>

                {/* Sort by row */}
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm }}>
                  <Text style={{ color: '#A89E8A', fontSize: 12, fontWeight: '600', marginRight: 10 }}>
                    {lang === 'th' ? 'จัดเรียงตาม' : 'Sort by'}
                  </Text>
                  <Pressable
                    onPress={cycleSort}
                    style={{
                      flex: 1,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      paddingHorizontal: 12,
                      paddingVertical: 10,
                      borderRadius: 10,
                      borderWidth: 1,
                      borderColor: 'rgba(236, 200, 122, 0.3)',
                      backgroundColor: 'rgba(18, 14, 10, 0.6)',
                    }}
                  >
                    <Text style={{ color: '#E8DCC0', fontSize: 13, fontWeight: '600' }}>
                      {sortLabel}
                    </Text>
                    <Feather name="chevron-down" size={16} color={colors.amber} />
                  </Pressable>
                </View>

                {/* Holdings list — one card per watch */}
                {holdings.length === 0 ? (
                  <Text style={styles.emptyProgressText}>
                    {lang === 'th' ? 'ไม่มีนาฬิกาในแบรนด์นี้' : 'No timepieces in this brand'}
                  </Text>
                ) : (
                  holdings.map(({ watch, weighting, change }) => (
                    <HoldingCard
                      key={watch.id}
                      watch={watch}
                      weighting={weighting}
                      change={change}
                      lang={lang}
                      onPress={() =>
                        navigation?.navigate?.('Result', {
                          result: watch.result,
                          frontUri: watch.frontUri,
                          backUri: watch.backUri,
                          savedId: watch.id,
                          processedFrontUri: watch.processedFrontUri,
                          customName: watch.customName,
                          customPrice: watch.customPrice,
                          purchasePrice: watch.purchasePrice,
                          soldAt: watch.soldAt,
                          soldPrice: watch.soldPrice,
                          soldTo: watch.soldTo,
                          soldNotes: watch.soldNotes,
                          galleryImages: watch.galleryImages,
                          bgColor: watch.bgColor,
                        })
                      }
                    />
                  ))
                )}
              </>
            )}
          </View>

          {/* Market Analytics Graph Mock */}
          <View style={[styles.statsCard, { overflow: 'hidden', borderColor: 'rgba(212, 175, 55, 0.25)', borderWidth: 1 }]}>
            <LinearGradient
              colors={['rgba(28, 22, 17, 0.9)', 'rgba(18, 14, 10, 0.95)']}
              style={StyleSheet.absoluteFillObject}
            />
            <Text style={styles.sectionTitle}>
              {lang === 'th' ? 'ดัชนีแนวโน้มราคาตลาดรอง 6 เดือน' : '6-MONTH MARKET PRICE TREND'}
            </Text>
            {(() => {
              const chartWidth = Dimensions.get('window').width - 64;
              const paddingX = 15;
              const usableWidth = chartWidth - 2 * paddingX;
              const step = usableWidth / 5;
              
              const x0 = paddingX;
              const x1 = paddingX + step;
              const x2 = paddingX + 2 * step;
              const x3 = paddingX + 3 * step;
              const x4 = paddingX + 4 * step;
              const x5 = chartWidth - paddingX;
              
              const y0 = 145; // Dec
              const y1 = 125; // Jan
              const y2 = 95;  // Feb
              const y3 = 75;  // Mar
              const y4 = 55;  // Apr
              const y5 = 25;  // May (highest)
              
              const linePath = `M ${x0} ${y0} L ${x1} ${y1} L ${x2} ${y2} L ${x3} ${y3} L ${x4} ${y4} L ${x5} ${y5}`;
              const areaPath = `M ${x0} ${y0} L ${x1} ${y1} L ${x2} ${y2} L ${x3} ${y3} L ${x4} ${y4} L ${x5} ${y5} L ${x5} 170 L ${x0} 170 Z`;
              
              return (
                <View style={{ height: 180, width: '100%', marginTop: spacing.md, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)' }}>
                  <Svg width={chartWidth} height={180}>
                    <Defs>
                      <SvgLinearGradient id="goldGradient" x1="0" y1="0" x2="0" y2="1">
                        <Stop offset="0%" stopColor="#ECC87A" stopOpacity={0.25} />
                        <Stop offset="100%" stopColor="#1E140E" stopOpacity={0.0} />
                      </SvgLinearGradient>
                      <SvgLinearGradient id="lineGlow" x1="0" y1="0" x2="1" y2="0">
                        <Stop offset="0%" stopColor="#A37C2F" stopOpacity={0.9} />
                        <Stop offset="50%" stopColor="#ECC87A" stopOpacity={1} />
                        <Stop offset="100%" stopColor="#ECC87A" stopOpacity={1} />
                      </SvgLinearGradient>
                    </Defs>
                    
                    {/* Horizontal Guideline Grids */}
                    <Line x1={paddingX} y1={145} x2={chartWidth - paddingX} y2={145} stroke="rgba(236, 200, 122, 0.05)" strokeWidth={1} strokeDasharray="3, 3" />
                    <Line x1={paddingX} y1={95} x2={chartWidth - paddingX} y2={95} stroke="rgba(236, 200, 122, 0.05)" strokeWidth={1} strokeDasharray="3, 3" />
                    <Line x1={paddingX} y1={25} x2={chartWidth - paddingX} y2={25} stroke="rgba(236, 200, 122, 0.05)" strokeWidth={1} strokeDasharray="3, 3" />
                    
                    {/* Vertical Active line for May */}
                    <Line x1={x5} y1={25} x2={x5} y2={145} stroke="rgba(46, 204, 113, 0.25)" strokeWidth={1.5} strokeDasharray="2, 2" />
                    
                    {/* Area fill under curve */}
                    <Path d={areaPath} fill="url(#goldGradient)" />
                    
                    {/* Soft background glow line */}
                    <Path d={linePath} stroke="#ECC87A" strokeWidth={6} fill="none" opacity={0.12} />
                    
                    {/* Main sharp elegant vector line */}
                    <Path d={linePath} stroke="url(#lineGlow)" strokeWidth={3.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
                    
                    {/* Dots at intersections */}
                    <Circle cx={x0} cy={y0} r={4.5} fill="#C59A45" stroke="#120E0A" strokeWidth={1.5} />
                    <Circle cx={x1} cy={y1} r={4.5} fill="#C59A45" stroke="#120E0A" strokeWidth={1.5} />
                    <Circle cx={x2} cy={y2} r={4.5} fill="#C59A45" stroke="#120E0A" strokeWidth={1.5} />
                    <Circle cx={x3} cy={y3} r={4.5} fill="#C59A45" stroke="#120E0A" strokeWidth={1.5} />
                    <Circle cx={x4} cy={y4} r={4.5} fill="#C59A45" stroke="#120E0A" strokeWidth={1.5} />
                    
                    {/* Active May Dot with elegant outer glowing pulse */}
                    <Circle cx={x5} cy={y5} r={8} fill={colors.success} opacity={0.3} />
                    <Circle cx={x5} cy={y5} r={4.5} fill={colors.success} stroke="#120E0A" strokeWidth={1.5} />
                    
                    {/* Floating Tooltip displaying current estimated ROI */}
                    <G transform={`translate(${x5 - 50}, 2)`}>
                      <Rect width={48} height={16} rx={4} fill="rgba(10, 8, 5, 0.95)" stroke="#ECC87A" strokeWidth={0.75} />
                      <SvgText x={24} y={11} fontSize={8} fontWeight="800" fill={colors.success} textAnchor="middle">+12.4%</SvgText>
                    </G>
                  </Svg>
                </View>
              );
            })()}
            <View style={styles.graphMonthsRow}>
              {['Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May'].map((m) => (
                <Text key={m} style={styles.graphMonthText}>{m}</Text>
              ))}
            </View>
          </View>
        </SafeAreaView>
      </ScrollView>
    </View>
  );
}

/**
 * BrandChip — single horizontal-scroll filter chip used at the top of the
 * Brand Diversification block. Active chip uses gold border + faint gold
 * fill so it reads as "selected" against the neighbouring outline-only
 * chips, matching the WatchCharts Index reference screenshot.
 */
function BrandChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: active ? '#ECC87A' : 'rgba(236, 200, 122, 0.30)',
        backgroundColor: active ? 'rgba(236, 200, 122, 0.14)' : 'transparent',
      }}
    >
      <Text
        style={{
          color: active ? '#F5E9CC' : '#C0B4A0',
          fontSize: 12.5,
          fontWeight: active ? '800' : '600',
          letterSpacing: 0.3,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * HoldingCard — single watch row in the Brand Diversification list.
 *
 * Mirrors WatchCharts Index card anatomy:
 *   • Square thumbnail (left).
 *   • Brand label (gray) + model name (bold) + reference (gray) stacked.
 *   • Bottom row: "Weighting" label + % on left, "Change" label + colored
 *     pill on right.
 *
 * The change pill colour-codes the delta from purchase price → current
 * market price: green for gains, red for losses, neutral gray for
 * unrecorded (no purchasePrice). Neutral state matters because most users
 * scan first and only fill in cost basis later — they should still see
 * the row, just without a misleading "0%" or "+∞%" badge.
 */
function HoldingCard({
  watch,
  weighting,
  change,
  lang,
  onPress,
}: {
  watch: SavedWatch;
  weighting: number;
  change: number | null;
  lang: 'th' | 'en';
  onPress: () => void;
}) {
  const isGain = change != null && change >= 0;
  const pillBg =
    change == null
      ? 'rgba(120, 120, 130, 0.18)'
      : isGain
      ? 'rgba(46, 204, 113, 0.85)'
      : 'rgba(231, 76, 60, 0.85)';
  const pillText = change == null ? '#A89E8A' : '#0A0805';
  const pillLabel =
    change == null
      ? lang === 'th'
        ? 'ไม่มีต้นทุน'
        : 'No cost basis'
      : `${change >= 0 ? '+' : ''}${change.toFixed(2)}%`;

  return (
    <Pressable
      onPress={onPress}
      style={{
        borderRadius: 14,
        borderWidth: 1,
        borderColor: 'rgba(236, 200, 122, 0.18)',
        backgroundColor: 'rgba(18, 14, 10, 0.55)',
        padding: 12,
        marginBottom: 12,
      }}
    >
      {/* Header row — thumbnail + identity */}
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Image
          source={{ uri: watch.frontUri }}
          style={{
            width: 80,
            height: 80,
            borderRadius: 10,
            backgroundColor: '#000',
            borderWidth: 1,
            borderColor: 'rgba(236, 200, 122, 0.25)',
          }}
          resizeMode="cover"
        />
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={{ color: '#A89E8A', fontSize: 11, fontWeight: '600', letterSpacing: 0.3 }}>
            {watch.result?.brand || '—'}
          </Text>
          <Text
            numberOfLines={1}
            style={{
              color: '#F5E9CC',
              fontSize: 16,
              fontWeight: '800',
              marginTop: 1,
              letterSpacing: 0.2,
            }}
          >
            {watch.customName || watch.result?.name || '—'}
          </Text>
          {watch.result?.reference ? (
            <Text style={{ color: '#8A8278', fontSize: 12, marginTop: 2 }}>
              {watch.result.reference}
            </Text>
          ) : null}
        </View>
      </View>

      {/* Stats row — weighting on left, change pill on right */}
      <View
        style={{
          flexDirection: 'row',
          marginTop: 12,
          paddingTop: 12,
          borderTopWidth: 1,
          borderTopColor: 'rgba(236, 200, 122, 0.12)',
        }}
      >
        <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={{ color: '#C0B4A0', fontSize: 13, fontWeight: '600' }}>
            {lang === 'th' ? 'น้ำหนัก' : 'Weighting'}
          </Text>
          <Text style={{ color: '#F5E9CC', fontSize: 13, fontWeight: '700' }}>
            {weighting.toFixed(2)}%
          </Text>
        </View>
      </View>
      <View
        style={{
          flexDirection: 'row',
          marginTop: 8,
          alignItems: 'center',
        }}
      >
        <Text style={{ color: '#C0B4A0', fontSize: 13, fontWeight: '600', flex: 1 }}>
          {lang === 'th' ? 'การเปลี่ยนแปลง' : 'Change'}
        </Text>
        <View
          style={{
            paddingHorizontal: 12,
            paddingVertical: 5,
            borderRadius: 14,
            backgroundColor: pillBg,
          }}
        >
          <Text style={{ color: pillText, fontSize: 12.5, fontWeight: '800' }}>
            {pillLabel}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}
