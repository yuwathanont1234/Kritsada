import React, { useEffect, useState } from 'react';
import {
  View,
  ScrollView,
  Text,
  ActivityIndicator,
  Dimensions,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path, Circle, Defs, LinearGradient as SvgLinearGradient, Stop, G, Line, Rect, Text as SvgText } from 'react-native-svg';
import { colors, spacing } from '../lib/theme';
import { getAllWatches, calculatePortfolio } from '../lib/collection';
import { getExchangeRate } from '../lib/currency';
import { useLanguage } from '../lib/localization';
import { styles } from './AppStyles';

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
  };
}

export default function PortfolioScreen() {
  const { t, lang } = useLanguage();
  const [metrics, setMetrics] = useState<any>(null);
  const [exchangeRate, setExchangeRate] = useState<number>(36.5);

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

          {/* Diversification Progress Bar */}
          <View style={[styles.diversificationCard, { overflow: 'hidden', borderColor: 'rgba(212, 175, 55, 0.25)', borderWidth: 1 }]}>
            <LinearGradient
              colors={['rgba(28, 22, 17, 0.9)', 'rgba(18, 14, 10, 0.95)']}
              style={StyleSheet.absoluteFillObject}
            />
            <Text style={styles.sectionTitle}>
              {lang === 'th' ? 'สัดส่วนแบรนด์สะสม' : 'BRAND DIVERSIFICATION'}
            </Text>
            {Object.keys(brands).length === 0 ? (
              <Text style={styles.emptyProgressText}>
                {lang === 'th' ? 'ยังไม่มีแบรนด์ลงทะเบียน' : 'No brands registered'}
              </Text>
            ) : (
              Object.entries(brands).map(([brand, count]: any) => {
                const pct = Math.round((count / total) * 100);
                return (
                  <View key={brand} style={styles.diverRow}>
                    <View style={styles.diverHeader}>
                      <Text style={styles.diverName}>{brand?.toUpperCase()}</Text>
                      <Text style={styles.diverCount}>{count} ({pct}%)</Text>
                    </View>
                    <View style={[styles.progressBarBg, { borderColor: 'rgba(212, 175, 55, 0.2)', borderWidth: 0.5 }]}>
                      <LinearGradient
                        colors={['#ECC87A', '#A37C2F']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={[styles.progressBarFill, { width: `${pct}%` }]}
                      />
                    </View>
                  </View>
                );
              })
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
