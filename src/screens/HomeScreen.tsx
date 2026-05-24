import React, { useEffect, useState } from 'react';
import {
  View,
  ScrollView,
  Text,
  Pressable,
  Image,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { colors, spacing } from '../lib/theme';
import { AuthUser, getAuthUser, getMembership } from '../lib/auth';
import { getExchangeRate, fetchLiveExchangeRate } from '../lib/currency';
import { useLanguage } from '../lib/localization';
import { styles } from './AppStyles';

// Direct import to get collection metrics
import { getAllWatches, calculatePortfolio } from '../lib/collection';

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

export default function HomeScreen({ navigation }: any) {
  const { t, lang } = useLanguage();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [membership, setMembershipState] = useState<any>(null);
  const [portfolio, setPortfolio] = useState({ totalCount: 0, totalValue: 0 });
  const [exchangeRate, setExchangeRate] = useState<number>(36.5);

  useEffect(() => {
    const load = async () => {
      const u = await getAuthUser();
      const m = await getMembership();
      const p = await getPortfolioMetrics();
      setUser(u);
      setMembershipState(m);
      setPortfolio(p);

      try {
        const cachedRate = await getExchangeRate();
        if (cachedRate !== null) {
          setExchangeRate(cachedRate);
        }
        const liveRate = await fetchLiveExchangeRate();
        if (liveRate !== null) {
          setExchangeRate(liveRate);
        }
      } catch (e) {
        console.warn('[HomeScreen] Error loading exchange rate:', e);
      }
    };
    load();
    const interval = setInterval(load, 4000);
    return () => clearInterval(interval);
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <LinearGradient
        colors={['#1C130E', '#0A0805']}
        style={StyleSheet.absoluteFillObject}
      />
      <ScrollView style={styles.homeContainer} contentContainerStyle={styles.homeContent}>
        <StatusBar style="light" />
        <SafeAreaView style={styles.safeAreaZero} edges={['top']}>
          {/* Header Greeting */}
          <View style={styles.homeHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: spacing.md }}>
              {/* Premium Gold-Border Circular App Logo */}
              <View style={{
                width: 44,
                height: 44,
                borderRadius: 22,
                borderWidth: 1.5,
                borderColor: '#ECC87A',
                backgroundColor: 'rgba(18, 14, 11, 0.7)',
                justifyContent: 'center',
                alignItems: 'center',
                marginRight: spacing.sm,
                shadowColor: '#ECC87A',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.35,
                shadowRadius: 5,
                elevation: 4
              }}>
                <Image
                  source={require('../../assets/splash-icon.png')}
                  style={{ width: 38, height: 38, borderRadius: 19 }}
                  resizeMode="contain"
                />
              </View>
              
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={styles.greeting} numberOfLines={1}>
                    {lang === 'th' ? `ยินดีต้อนรับกลับคุณ ${user?.displayName || 'นักสะสม'}` : `Welcome Back, ${user?.displayName || 'Collector'}`}
                  </Text>
                  <Text style={{ fontSize: 16 }}>👑</Text>
                </View>
                <Text style={styles.headerSub} numberOfLines={1}>
                  {lang === 'th' ? 'วันนี้คุณตรวจสอบนาฬิกาของคุณหรือยัง?' : 'HAVE YOU VERIFIED YOUR TIMEPIECE TODAY?'}
                </Text>
              </View>
            </View>
            <View style={[styles.membershipBadge, { overflow: 'hidden' }]}>
              <LinearGradient
                colors={['rgba(236, 200, 122, 0.25)', 'rgba(236, 200, 122, 0.05)']}
                style={StyleSheet.absoluteFillObject}
              />
              <Feather name="award" size={12} color={colors.amber} style={{ marginRight: 4 }} />
              <Text style={styles.membershipBadgeText}>
                {membership?.tier?.toUpperCase() || 'FREE'}
              </Text>
            </View>
          </View>

          {/* Hero Scanning Card */}
          <Pressable style={[styles.heroCard, { borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.35)' }]} onPress={() => navigation.navigate('Scan')}>
            <LinearGradient
              colors={['#ECC87A', '#C59A45', '#9A7326']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFillObject}
            />
            <View style={styles.heroGlow} />
            <View style={styles.heroTextContainer}>
              <View style={[styles.heroIconWrap, { shadowColor: '#ECC87A', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 8 }]}>
                <Feather name="aperture" size={24} color="#000" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.heroTitle}>
                  {lang === 'th' ? 'เริ่มสแกนนาฬิกาเรือนใหม่' : 'START NEW WATCH SCAN'}
                </Text>
                <Text style={styles.heroDesc}>
                  {lang === 'th' ? 'ระบบวิเคราะห์ภาพ AI และตรวจสอบตราประทับ 1:1' : '1:1 AI Visual RAG & Micro-Hallmark Verification'}
                </Text>
                <Text style={styles.heroSubDescBilingual}>
                  {lang === 'th' ? 'สแกนเนอร์วัดแนวขอบและโครงสร้างขนาดเล็กแบบความละเอียดสูง' : 'High-fidelity optical alignment and bezel micro-structure scanner'}
                </Text>
              </View>
              <View style={styles.heroArrowWrap}>
                <Feather name="arrow-right" size={18} color="#000" />
              </View>
            </View>
          </Pressable>

          {/* Portfolio Stats Panel */}
          <View style={[styles.statsCard, { overflow: 'hidden', borderColor: 'rgba(212, 175, 55, 0.35)', borderWidth: 1 }]}>
            <LinearGradient
              colors={['rgba(28, 22, 17, 0.85)', 'rgba(18, 14, 10, 0.95)']}
              style={StyleSheet.absoluteFillObject}
            />
            <View style={styles.sectionHeaderRow}>
              <Feather name="shield" size={16} color={colors.amber} style={{ marginRight: 6 }} />
              <Text style={styles.sectionTitle}>
                {lang === 'th' ? 'ตู้สะสมนิรภัยของฉัน' : 'MY COLLECTOR VAULT'}
              </Text>
            </View>
            <View style={styles.statsGrid}>
              <View style={[styles.statBox, { borderColor: 'rgba(212, 175, 55, 0.15)', borderWidth: 1 }]}>
                <LinearGradient
                  colors={['rgba(255, 255, 255, 0.02)', 'rgba(255, 255, 255, 0.005)']}
                  style={StyleSheet.absoluteFillObject}
                />
                <View style={styles.statBoxHeader}>
                  <Feather name="briefcase" size={13} color={colors.textSecondary} style={{ marginRight: 4 }} />
                  <Text style={styles.statLabel}>
                    {lang === 'th' ? 'เก็บสะสมแล้ว' : 'VAULTED'}
                  </Text>
                </View>
                <Text style={styles.statValue}>
                  {portfolio.totalCount} {lang === 'th' ? 'เรือน' : 'Timepieces'}
                </Text>
                <Text style={styles.statSubTextLabel}>
                  {lang === 'th' ? 'นาฬิกาผ่านการตรวจสอบแล้ว' : 'verified timepieces'}
                </Text>
              </View>
              <View style={[styles.statBox, { borderColor: 'rgba(212, 175, 55, 0.15)', borderWidth: 1 }]}>
                <LinearGradient
                  colors={['rgba(255, 255, 255, 0.02)', 'rgba(255, 255, 255, 0.005)']}
                  style={StyleSheet.absoluteFillObject}
                />
                <View style={styles.statBoxHeader}>
                  <Feather name="trending-up" size={13} color={colors.amber} style={{ marginRight: 4 }} />
                  <Text style={styles.statLabel}>
                    {lang === 'th' ? 'มูลค่ารวมโดยประมาณ' : 'ESTIMATED VALUE'}
                  </Text>
                </View>
                <Text style={[styles.statValue, { color: colors.amber }]}>
                  ฿{Math.round(portfolio.totalValue * exchangeRate).toLocaleString()}
                </Text>
                <Text style={styles.statSubText}>
                  {lang === 'th' ? 'เฉลี่ยตลาดรองสกุลเงินบาท' : 'THB Market Average'}
                </Text>
              </View>
            </View>
          </View>

          {/* Mini Game Promo */}
          <Pressable style={[styles.miniGameCard, { overflow: 'hidden', borderColor: 'rgba(212, 175, 55, 0.25)', borderWidth: 1 }]} onPress={() => navigation.navigate('Game')}>
            <LinearGradient
              colors={['rgba(236, 200, 122, 0.12)', 'rgba(236, 200, 122, 0.02)']}
              style={StyleSheet.absoluteFillObject}
            />
            <View style={styles.gameTextWrap}>
              <Text style={styles.gameTitle}>
                {lang === 'th' ? '🎮 เกมท้าทายเวลาฝึกสายตา' : "🎮 TIMEKEEPER'S CHALLENGE"}
              </Text>
              <Text style={styles.gameDesc}>
                {lang === 'th' ? 'จับผิดนาฬิกากลไกสวิสเลียนแบบ' : 'SPOT THE SWISS CALIBER REPLICA'}
              </Text>
            </View>
            <View style={styles.gamePlayCircle}>
              <Feather name="play" size={14} color={colors.amber} />
            </View>
          </Pressable>

          {/* Supported Luxury Brands Vertical Ordered Grid */}
          <View style={{ marginTop: spacing.sm, marginBottom: spacing.lg }}>
            <Text style={styles.subSectionHeader}>
              {lang === 'th' ? 'แบรนด์หรูที่รองรับการตรวจสอบ' : 'SUPPORTED ELIGIBLE BRANDS'}
            </Text>
            <View style={styles.verticalBrandListContainer}>
              <View style={styles.brandColumn}>
                {[
                  'Rolex',
                  'Patek Philippe',
                  'Audemars Piguet',
                  'Cartier',
                  'Omega',
                  'TAG Heuer',
                  'Tudor',
                ].map((b) => (
                  <View key={b} style={[styles.verticalBrandRow, { overflow: 'hidden' }]}>
                    <LinearGradient
                      colors={['rgba(30, 24, 20, 0.85)', 'rgba(12, 10, 8, 0.98)']}
                      style={StyleSheet.absoluteFillObject}
                    />
                    <View style={styles.brandRowInner}>
                      <Feather name="shield" size={10} color={colors.amber} style={{ marginRight: 6 }} />
                      <Text style={styles.brandRowText}>{b}</Text>
                    </View>
                    <Text style={styles.brandRowStatus}>ELIGIBLE</Text>
                  </View>
                ))}
              </View>
              
              <View style={styles.brandColumn}>
                {[
                  'Panerai',
                  'Chopard',
                  'Franck Muller',
                  'Zenith',
                  'Breitling',
                  'Longines',
                  'Seiko',
                ].map((b) => (
                  <View key={b} style={[styles.verticalBrandRow, { overflow: 'hidden' }]}>
                    <LinearGradient
                      colors={['rgba(30, 24, 20, 0.85)', 'rgba(12, 10, 8, 0.98)']}
                      style={StyleSheet.absoluteFillObject}
                    />
                    <View style={styles.brandRowInner}>
                      <Feather name="shield" size={10} color={colors.amber} style={{ marginRight: 6 }} />
                      <Text style={styles.brandRowText}>{b}</Text>
                    </View>
                    <Text style={styles.brandRowStatus}>ELIGIBLE</Text>
                  </View>
                ))}
              </View>
            </View>
          </View>
        </SafeAreaView>
      </ScrollView>
    </View>
  );
}
