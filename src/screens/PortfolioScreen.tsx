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
import type { PortfolioSummary } from '../lib/collection';
import type { SavedWatch } from '../lib/types';
import { getExchangeRate } from '../lib/currency';
import { useLanguage } from '../lib/localization';
import { styles } from './AppStyles';

// Available sort modes for the holdings list — cycled by tapping the
// "Sort by" pill. Order matters: it's the cycle order users see.
type SortMode = 'none' | 'weight' | 'change-desc' | 'change-asc';

const TH_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const EN_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

type ValuePoint = { label: string; value: number };

// ── Real portfolio value time-series ──────────────────────────────────────
// For each of the last `months` calendar months (ending this month) we sum
// the *current* market value (customPrice ?? marketPrice, USD) of every
// active (unsold) watch that had already been acquired (savedAt ≤ month end).
// The result is a cumulative "how my portfolio value built up" curve — 100%
// derived from the user's own holdings + acquisition dates, and it updates
// automatically whenever prices or holdings change. No synthetic data.
function buildValueSeries(watches: SavedWatch[], months: number, lang: 'th' | 'en'): ValuePoint[] {
  const labels = lang === 'th' ? TH_MONTHS : EN_MONTHS;
  const now = new Date();
  const active = watches.filter((w) => !w.soldAt);
  const points: ValuePoint[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const endOfMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999).getTime();
    const value = active
      .filter((w) => {
        const t = new Date(w.savedAt).getTime();
        return !isNaN(t) && t <= endOfMonth;
      })
      .reduce((s, w) => s + (w.customPrice || w.result?.marketPrice || 0), 0);
    points.push({ label: labels[d.getMonth()], value });
  }
  return points;
}

async function getPortfolioMetrics() {
  const list = await getAllWatches();
  const summary = calculatePortfolio(list);
  return { summary, watches: list };
}

export default function PortfolioScreen({ navigation }: any) {
  const { lang } = useLanguage();
  const [metrics, setMetrics] = useState<{ summary: PortfolioSummary; watches: SavedWatch[] } | null>(null);
  const [exchangeRate, setExchangeRate] = useState<number>(36.5);
  const [brandFilter, setBrandFilter] = useState<string>('all');
  const [sortMode, setSortMode] = useState<SortMode>('none');

  const load = async () => {
    const m = await getPortfolioMetrics();
    setMetrics(m);
  };

  useEffect(() => {
    load();
    // Exchange rate barely moves — fetch once rather than every poll.
    getExchangeRate().then((rate) => {
      if (rate !== null) setExchangeRate(rate);
    });
    const timer = setInterval(load, 2500);
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

  // Active (unsold) watches drive the analytics — value chart + allocation.
  const activeWatches = useMemo(() => portfolioWatches.filter((w) => !w.soldAt), [portfolioWatches]);

  // Cumulative portfolio value over the last 6 months (real, from savedAt).
  const valueSeries = useMemo(() => buildValueSeries(portfolioWatches, 6, lang), [portfolioWatches, lang]);

  // Brand allocation by *market value* (not count) — what a portfolio app shows.
  const brandAlloc = useMemo(() => {
    const m: Record<string, number> = {};
    for (const w of activeWatches) {
      const b = w.result?.brand?.trim();
      if (!b) continue;
      m[b] = (m[b] || 0) + (w.customPrice || w.result?.marketPrice || 0);
    }
    const total = Object.values(m).reduce((a, b) => a + b, 0);
    return Object.entries(m)
      .map(([brand, val]) => ({ brand, val, pct: total > 0 ? (val / total) * 100 : 0 }))
      .sort((a, b) => b.val - a.val);
  }, [activeWatches]);

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

  const summary = metrics.summary;
  const rate = exchangeRate || 1;
  const fmtTHB = (usd: number) => '฿' + Math.round(usd * rate).toLocaleString();
  const fmtSignedTHB = (usd: number) => `${usd >= 0 ? '+' : '−'}฿${Math.round(Math.abs(usd) * rate).toLocaleString()}`;

  const hasCost = summary.trackedCount > 0 && summary.totalPurchaseCost > 0;
  const gainUSD = summary.totalUnrealizedGain;
  const roi = summary.totalROI;
  const isGain = gainUSD >= 0;
  const gainColor = !hasCost ? colors.textSecondary : isGain ? colors.success : colors.danger;

  // Chart is meaningful only with movement across ≥2 months — otherwise show
  // an honest "keep collecting" prompt instead of a flat/degenerate line.
  const chartReady = valueSeries.filter((p) => p.value > 0).length >= 2;

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

          {/* Live valuation strip — credibility / "updated" signal */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: -spacing.xs, marginBottom: spacing.xs }}>
            <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: colors.success }} />
            <Text style={{ color: '#8A8278', fontSize: 11.5, fontWeight: '600', letterSpacing: 0.3 }}>
              {lang === 'th' ? 'ประเมินตามราคาตลาดล่าสุด · อัพเดทอัตโนมัติ' : 'Live market valuation · auto-updating'}
            </Text>
          </View>

          {/* ───────────────────────── Portfolio value hero ───────────────────────── */}
          <View style={[styles.roiCard, { overflow: 'hidden', borderColor: '#ECC87A', borderWidth: 1.5, alignItems: 'stretch' }]}>
            <LinearGradient
              colors={['rgba(28, 22, 17, 0.95)', 'rgba(18, 14, 10, 0.98)']}
              style={StyleSheet.absoluteFillObject}
            />
            <Text style={[styles.roiLabel, { textAlign: 'center', letterSpacing: 0.6 }]}>
              {lang === 'th' ? 'มูลค่าพอร์ตรวม' : 'TOTAL PORTFOLIO VALUE'}
            </Text>
            <Text
              style={[
                styles.roiValue,
                {
                  color: colors.amberLight,
                  textAlign: 'center',
                  textShadowColor: 'rgba(236, 200, 122, 0.45)',
                  textShadowOffset: { width: 0, height: 0 },
                  textShadowRadius: 14,
                },
              ]}
            >
              {fmtTHB(summary.totalCurrentValue)}
            </Text>

            {/* Total return pill + absolute delta */}
            <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, marginBottom: 2, flexWrap: 'wrap' }}>
              {hasCost ? (
                <>
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 4,
                      paddingHorizontal: 10,
                      paddingVertical: 5,
                      borderRadius: 12,
                      backgroundColor: isGain ? 'rgba(74, 222, 128, 0.14)' : 'rgba(239, 68, 68, 0.14)',
                      borderWidth: 1,
                      borderColor: isGain ? 'rgba(74, 222, 128, 0.4)' : 'rgba(239, 68, 68, 0.4)',
                    }}
                  >
                    <Feather name={isGain ? 'trending-up' : 'trending-down'} size={13} color={gainColor} />
                    <Text style={{ color: gainColor, fontSize: 13.5, fontWeight: '800' }}>
                      {`${isGain ? '+' : ''}${roi.toFixed(2)}%`}
                    </Text>
                  </View>
                  <Text style={{ color: gainColor, fontSize: 13, fontWeight: '700' }}>
                    {fmtSignedTHB(gainUSD)}
                  </Text>
                </>
              ) : (
                <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '600', textAlign: 'center' }}>
                  {summary.count === 0
                    ? lang === 'th'
                      ? 'เริ่มสแกนและบันทึกนาฬิกาเพื่อเริ่มติดตามพอร์ต'
                      : 'Scan & save a timepiece to start tracking your vault'
                    : lang === 'th'
                    ? 'ยังไม่ได้บันทึกราคาทุน — เพิ่มราคาที่ซื้อมาเพื่อดูผลตอบแทน'
                    : 'No cost basis yet — add acquisition cost to see ROI'}
                </Text>
              )}
            </View>

            {/* 3-up stat grid */}
            <View style={{ flexDirection: 'row', gap: 10, marginTop: spacing.lg }}>
              <StatBox
                label={lang === 'th' ? 'ต้นทุนรวม' : 'COST BASIS'}
                value={hasCost ? fmtTHB(summary.totalPurchaseCost) : '—'}
              />
              <StatBox
                label={lang === 'th' ? 'กำไร/ขาดทุน' : 'UNREALIZED P/L'}
                value={hasCost ? fmtSignedTHB(gainUSD) : '—'}
                valueColor={hasCost ? gainColor : undefined}
              />
              <StatBox
                label={lang === 'th' ? 'จำนวนเรือน' : 'HOLDINGS'}
                value={String(summary.count)}
              />
            </View>

            {/* Transparency footnote */}
            {summary.count > 0 && (
              <Text style={{ color: '#8A8278', fontSize: 10.5, textAlign: 'center', marginTop: 12, lineHeight: 15 }}>
                {lang === 'th'
                  ? `${summary.trackedCount}/${summary.count} เรือนบันทึกต้นทุน · ประเมินจากราคาตลาดล่าสุด`
                  : `${summary.trackedCount}/${summary.count} with cost basis · valued at latest market price`}
              </Text>
            )}
            {summary.soldCount > 0 && (
              <Text style={{ color: '#8A8278', fontSize: 10.5, textAlign: 'center', marginTop: 3, lineHeight: 15 }}>
                {lang === 'th'
                  ? `ขายแล้ว ${summary.soldCount} เรือน · กำไรจริง ${fmtSignedTHB(summary.totalRealizedGain)}`
                  : `${summary.soldCount} sold · realized ${fmtSignedTHB(summary.totalRealizedGain)}`}
              </Text>
            )}
          </View>

          {/* ───────────────────── Portfolio value chart (real) ───────────────────── */}
          <View style={[styles.statsCard, { overflow: 'hidden', borderColor: 'rgba(212, 175, 55, 0.25)', borderWidth: 1 }]}>
            <LinearGradient
              colors={['rgba(28, 22, 17, 0.9)', 'rgba(18, 14, 10, 0.95)']}
              style={StyleSheet.absoluteFillObject}
            />
            <Text style={styles.sectionTitle}>
              {lang === 'th' ? 'มูลค่าพอร์ตสะสม · 6 เดือน' : 'PORTFOLIO VALUE · 6 MONTHS'}
            </Text>

            {(() => {
              const chartWidth = Dimensions.get('window').width - 64;
              const paddingX = 15;
              const usableWidth = chartWidth - 2 * paddingX;
              const topY = 25;
              const baseY = 145;
              const floorY = 170;

              if (!chartReady) {
                return (
                  <View style={{ height: 180, justifyContent: 'center', alignItems: 'center' }}>
                    <Feather name="trending-up" size={28} color="rgba(236, 200, 122, 0.4)" />
                    <Text style={{ color: '#A89E8A', fontSize: 13, textAlign: 'center', marginTop: 10, paddingHorizontal: 20, lineHeight: 19 }}>
                      {lang === 'th'
                        ? 'สะสมนาฬิกาข้ามเดือนเพื่อเริ่มติดตามมูลค่าพอร์ตตามเวลาจริง'
                        : 'Add timepieces across months to start tracking portfolio value over time'}
                    </Text>
                  </View>
                );
              }

              const series = valueSeries;
              const values = series.map((p) => p.value);
              const maxV = Math.max(...values);
              const minV = Math.min(...values);
              const range = maxV - minV || 1;
              const n = series.length;
              const step = usableWidth / (n - 1);
              const xs = series.map((_, i) => paddingX + i * step);
              const ys = series.map((p) => baseY - ((p.value - minV) / range) * (baseY - topY));

              const linePath = xs.map((x, i) => `${i === 0 ? 'M' : 'L'} ${x} ${ys[i]}`).join(' ');
              const areaPath = `${linePath} L ${xs[n - 1]} ${floorY} L ${xs[0]} ${floorY} Z`;

              // Growth from first non-zero point → latest point (real %).
              const firstNZ = values.find((v) => v > 0) || 0;
              const last = values[n - 1];
              const growth = firstNZ > 0 ? ((last - firstNZ) / firstNZ) * 100 : 0;
              const up = growth >= 0;
              const growthColor = up ? colors.success : colors.danger;
              const lastX = xs[n - 1];
              const lastY = ys[n - 1];
              const tipW = 54;
              const tipX = Math.min(Math.max(lastX - tipW / 2, 0), chartWidth - tipW);

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

                    {/* Horizontal guideline grids */}
                    <Line x1={paddingX} y1={topY} x2={chartWidth - paddingX} y2={topY} stroke="rgba(236, 200, 122, 0.05)" strokeWidth={1} strokeDasharray="3, 3" />
                    <Line x1={paddingX} y1={(topY + baseY) / 2} x2={chartWidth - paddingX} y2={(topY + baseY) / 2} stroke="rgba(236, 200, 122, 0.05)" strokeWidth={1} strokeDasharray="3, 3" />
                    <Line x1={paddingX} y1={baseY} x2={chartWidth - paddingX} y2={baseY} stroke="rgba(236, 200, 122, 0.05)" strokeWidth={1} strokeDasharray="3, 3" />

                    {/* Vertical marker on the latest point */}
                    <Line x1={lastX} y1={topY} x2={lastX} y2={baseY} stroke={`${up ? 'rgba(74, 222, 128, 0.25)' : 'rgba(239, 68, 68, 0.25)'}`} strokeWidth={1.5} strokeDasharray="2, 2" />

                    {/* Area + line */}
                    <Path d={areaPath} fill="url(#goldGradient)" />
                    <Path d={linePath} stroke="#ECC87A" strokeWidth={6} fill="none" opacity={0.12} />
                    <Path d={linePath} stroke="url(#lineGlow)" strokeWidth={3.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />

                    {/* Data dots */}
                    {xs.slice(0, n - 1).map((x, i) => (
                      <Circle key={i} cx={x} cy={ys[i]} r={4} fill="#C59A45" stroke="#120E0A" strokeWidth={1.5} />
                    ))}

                    {/* Latest point — glowing pulse */}
                    <Circle cx={lastX} cy={lastY} r={8} fill={growthColor} opacity={0.3} />
                    <Circle cx={lastX} cy={lastY} r={4.5} fill={growthColor} stroke="#120E0A" strokeWidth={1.5} />

                    {/* Floating growth badge */}
                    <G transform={`translate(${tipX}, 2)`}>
                      <Rect width={tipW} height={16} rx={4} fill="rgba(10, 8, 5, 0.95)" stroke="#ECC87A" strokeWidth={0.75} />
                      <SvgText x={tipW / 2} y={11} fontSize={8} fontWeight="800" fill={growthColor} textAnchor="middle">
                        {`${up ? '+' : ''}${growth.toFixed(1)}%`}
                      </SvgText>
                    </G>
                  </Svg>
                </View>
              );
            })()}

            {chartReady && (
              <View style={styles.graphMonthsRow}>
                {valueSeries.map((p, i) => (
                  <Text key={i} style={styles.graphMonthText}>{p.label}</Text>
                ))}
              </View>
            )}
          </View>

          {/* ───────────────────── Brand diversification + holdings ───────────────────── */}
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
                {/* Allocation bars — % of portfolio value per brand (real) */}
                {brandAlloc.length > 0 && (
                  <View style={{ marginTop: 2, marginBottom: spacing.xs }}>
                    {(() => {
                      const top = brandAlloc.slice(0, 5);
                      const restPct = brandAlloc.slice(5).reduce((s, x) => s + x.pct, 0);
                      const rows: { label: string; pct: number }[] = top.map((x) => ({ label: x.brand, pct: x.pct }));
                      if (restPct > 0.1) rows.push({ label: lang === 'th' ? 'อื่นๆ' : 'Others', pct: restPct });
                      return rows.map((r, i) => (
                        <View key={`${r.label}-${i}`} style={{ marginBottom: 10 }}>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 }}>
                            <Text numberOfLines={1} style={{ color: '#E8DCC0', fontSize: 12.5, fontWeight: '600', flex: 1, marginRight: 8 }}>
                              {r.label}
                            </Text>
                            <Text style={{ color: colors.amber, fontSize: 12.5, fontWeight: '700' }}>
                              {r.pct.toFixed(1)}%
                            </Text>
                          </View>
                          <View style={{ height: 7, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                            <LinearGradient
                              colors={[colors.amberDark, colors.amber]}
                              start={{ x: 0, y: 0 }}
                              end={{ x: 1, y: 0 }}
                              style={{ width: `${Math.max(2, Math.min(100, r.pct))}%`, height: '100%', borderRadius: 4 }}
                            />
                          </View>
                        </View>
                      ));
                    })()}
                  </View>
                )}

                {/* Divider */}
                <View style={{ height: 1, backgroundColor: 'rgba(236, 200, 122, 0.12)', marginBottom: spacing.sm }} />

                {/* Brand filter chips — horizontally scrollable strip */}
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: 8, paddingVertical: 4 }}
                  style={{ marginBottom: spacing.sm }}
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
        </SafeAreaView>
      </ScrollView>
    </View>
  );
}

/**
 * StatBox — one cell in the portfolio hero's 3-up stat grid (cost basis,
 * unrealized P/L, holdings count). Outline + faint fill matches the gold
 * card language; value auto-shrinks so long THB figures never clip.
 */
function StatBox({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: 'rgba(255, 255, 255, 0.02)',
        borderColor: 'rgba(212, 175, 55, 0.25)',
        borderWidth: 1,
        borderRadius: 12,
        paddingVertical: 12,
        paddingHorizontal: 8,
        alignItems: 'center',
      }}
    >
      <Text
        numberOfLines={1}
        style={{ color: '#8A8278', fontSize: 10, fontWeight: '700', letterSpacing: 0.4, textAlign: 'center' }}
      >
        {label}
      </Text>
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.7}
        style={{ color: valueColor || '#F5E9CC', fontSize: 14.5, fontWeight: '800', marginTop: 5, textAlign: 'center' }}
      >
        {value}
      </Text>
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
