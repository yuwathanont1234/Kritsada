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
import { prewarmAll } from '../lib/visualRag';

// Direct import to get collection metrics
import { getAllWatches, calculatePortfolio } from '../lib/collection';
import type { SavedWatch } from '../lib/types';
import { EXAMPLE_SCANS } from '../lib/data/exampleScans';

type BrandGroup = { brand: string; count: number; watches: SavedWatch[] };

async function getPortfolioMetrics(): Promise<{
  totalCount: number;
  totalValue: number;
  byBrand: BrandGroup[];
  recent: SavedWatch[];
  brandCount: number;
  verifiedCount: number;
}> {
  const list = await getAllWatches();
  const summary = calculatePortfolio(list);
  const grouped: Record<string, BrandGroup> = {};
  for (const w of list) {
    const brand = w.result?.brand?.trim() || 'Unknown';
    if (!grouped[brand]) grouped[brand] = { brand, count: 0, watches: [] };
    grouped[brand].count++;
    grouped[brand].watches.push(w);
  }
  for (const g of Object.values(grouped)) {
    g.watches.sort((a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime());
  }
  const byBrand = Object.values(grouped).sort(
    (a, b) => b.count - a.count || a.brand.localeCompare(b.brand)
  );
  // Flat list sorted by recency for the horizontal "เพิ่งสแกน" carousel.
  const recent = [...list]
    .sort((a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime())
    .slice(0, 8);
  // "Verified" = watches that came back with a likely-authentic verdict.
  const verifiedCount = list.filter(
    (w) => w.result?.authenticityVerdict === 'likely-authentic'
  ).length;
  return {
    totalCount: summary.count,
    totalValue: summary.totalCurrentValue,
    byBrand,
    recent,
    brandCount: byBrand.length,
    verifiedCount,
  };
}

export default function HomeScreen({ navigation }: any) {
  const { lang } = useLanguage();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [membership, setMembershipState] = useState<any>(null);
  const [portfolio, setPortfolio] = useState<{
    totalCount: number;
    totalValue: number;
    byBrand: BrandGroup[];
    recent: SavedWatch[];
    brandCount: number;
    verifiedCount: number;
  }>({ totalCount: 0, totalValue: 0, byBrand: [], recent: [], brandCount: 0, verifiedCount: 0 });
  const [exchangeRate, setExchangeRate] = useState<number>(36.5);

  useEffect(() => {
    // Fire-and-forget Replicate prewarm on HomeScreen mount.
    // This is a client-side insurance layer that complements the server-side
    // pg_cron `replicate-keepwarm` (*/5). Pattern stolen from songphra/visualRag.ts
    // which also has a 10-min cooldown to avoid burning Replicate $ on
    // every screen focus. By the time the user finishes browsing Home,
    // taps Scan, frames the photo, and hits Analyze (~15-30s typical),
    // Replicate is already warm — we skip the 30-60s cold-start that
    // otherwise stalls the first scan of a session.
    prewarmAll();

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
    // Refresh when the user returns to Home (e.g. after a scan/save) instead
    // of polling every 4s — same freshness, without the battery drain and
    // re-render churn of a timer firing while the user is reading the screen.
    const unsub = navigation.addListener('focus', load);
    return () => unsub();
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
                  <Text style={styles.greeting} numberOfLines={1} ellipsizeMode="tail">
                    {lang === 'th' ? `สวัสดี ${user?.displayName || 'นักสะสม'}` : `Hi, ${user?.displayName || 'Collector'}`}
                  </Text>
                </View>
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

          {/* Hero Scanning Card — Songphra-inspired luxury layout
              ────────────────────────────────────────────────────────
              Old design: full gold-gradient surface with black text. Read
              as a "shiny button" rather than a curated feature card. The
              new design swaps to a dark, museum-cabinet surface where
              gold is used selectively (circular emblem + CTA button only)
              — that mirrors how high-end watch brands actually present
              themselves online (Patek's site is mostly cream-on-black,
              not gold-on-gold). The CTA button is a separate prominent
              pill so the tap target reads clearly. */}
          <Pressable
            // Free (non-trial) users have ZERO AI scans — sending them into
            // the camera flow only to hit the quota wall AFTER they staged
            // and photographed their watch was the most expensive way to
            // say no. Route them to the paywall up front instead.
            onPress={() =>
              membership?.tier === 'free' && !membership?.isTrialing
                ? navigation.navigate('Membership', { trigger: 'home_hero_free' })
                : navigation.navigate('Scan')
            }
            style={{
              borderRadius: 22,
              borderWidth: 1,
              borderColor: 'rgba(236, 200, 122, 0.35)',
              overflow: 'hidden',
              marginBottom: spacing.md,
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 6 },
              shadowOpacity: 0.35,
              shadowRadius: 12,
              elevation: 6,
            }}
          >
            <LinearGradient
              colors={['#2A1F15', '#1A130C', '#0E0905']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFillObject}
            />
            {/* Subtle gold radial accent on the right side */}
            <View
              style={{
                position: 'absolute',
                right: -40,
                top: -40,
                width: 180,
                height: 180,
                borderRadius: 90,
                backgroundColor: 'rgba(236, 200, 122, 0.10)',
              }}
            />

            <View style={{ padding: 20, flexDirection: 'row', alignItems: 'center' }}>
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text style={{ color: colors.amber, fontSize: 11, fontWeight: '700', letterSpacing: 1.5, marginBottom: 8 }}>
                  {membership?.tier === 'free' && !membership?.isTrialing
                    ? (lang === 'th' ? 'สแกน AI สำหรับสมาชิก' : 'AI SCANNING — MEMBERS')
                    : (lang === 'th' ? 'เริ่มสแกน' : 'NEW SCAN')}
                </Text>
                <Text style={{ color: colors.textCream, fontSize: 26, fontWeight: '800', lineHeight: 32, marginBottom: 8 }}>
                  {lang === 'th' ? 'ถ่ายรูปนาฬิกา\nตรวจสอบความแท้' : 'Authenticate\nYour Timepiece'}
                </Text>
                <Text style={{ color: colors.textCreamDim, fontSize: 13, lineHeight: 19 }}>
                  {lang === 'th'
                    ? 'AI Visual RAG · ตรวจตราประทับ\nค้นราคาตลาดรองอัตโนมัติ'
                    : 'AI Visual RAG · Micro-hallmark detection\nLive secondary-market valuation'}
                </Text>
              </View>

              {/* Gold emblem */}
              <View
                style={{
                  width: 76,
                  height: 76,
                  borderRadius: 38,
                  backgroundColor: 'rgba(18, 14, 10, 0.7)',
                  borderWidth: 2,
                  borderColor: 'rgba(236, 200, 122, 0.45)',
                  alignItems: 'center',
                  justifyContent: 'center',
                  shadowColor: '#ECC87A',
                  shadowOffset: { width: 0, height: 3 },
                  shadowOpacity: 0.6,
                  shadowRadius: 12,
                  elevation: 8,
                }}
              >
                <LinearGradient
                  colors={['#ECC87A', '#A37C2F']}
                  style={{
                    width: 58,
                    height: 58,
                    borderRadius: 29,
                    alignItems: 'center',
                    justifyContent: 'center',
                    overflow: 'hidden',
                  }}
                >
                  <Image
                    source={require('../../assets/splash-icon.png')}
                    style={{ width: 50, height: 50, borderRadius: 25 }}
                    resizeMode="contain"
                  />
                </LinearGradient>
              </View>
            </View>

            {/* Gold pill CTA — separated row for clear tap-target hierarchy */}
            <View style={{ paddingHorizontal: 20, paddingBottom: 18 }}>
              <View
                style={{
                  alignSelf: 'flex-start',
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingHorizontal: 18,
                  paddingVertical: 10,
                  borderRadius: 24,
                  overflow: 'hidden',
                }}
              >
                <LinearGradient
                  colors={['#ECC87A', '#C59A45']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={StyleSheet.absoluteFillObject}
                />
                <Feather
                  name={membership?.tier === 'free' && !membership?.isTrialing ? 'unlock' : 'camera'}
                  size={15}
                  color="#1A130C"
                  style={{ marginRight: 8 }}
                />
                <Text style={{ color: '#1A130C', fontSize: 14, fontWeight: '800', letterSpacing: 0.4 }}>
                  {membership?.tier === 'free' && !membership?.isTrialing
                    ? (lang === 'th' ? 'อัปเกรดเพื่อเริ่มสแกน' : 'Upgrade to Scan')
                    : (lang === 'th' ? 'เริ่มสแกนเลย' : 'Start Scanning')}
                </Text>
              </View>
            </View>
          </Pressable>

          {/* Example results — curated READ-ONLY showcases (no AI). Replaces a
              free-scan tier: a prospect experiences the full result UI at zero
              cost, with an upgrade CTA inside each example. */}
          <View style={{ marginBottom: spacing.md }}>
            <Text style={{ color: colors.textGold, fontSize: 14, fontWeight: '700', letterSpacing: 0.5, marginBottom: spacing.sm }}>
              {lang === 'th' ? 'ตัวอย่างผลตรวจ' : 'Example Results'}
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, paddingVertical: 2 }}>
              {EXAMPLE_SCANS.map((ex) => (
                <Pressable
                  key={ex.id}
                  onPress={() => navigation.navigate('Result', { result: ex.result, frontUri: '', isExample: true, exampleImage: ex.image })}
                  style={{ width: 150, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(236, 200, 122, 0.3)', backgroundColor: 'rgba(18, 14, 10, 0.7)' }}
                >
                  <Image source={ex.image} style={{ width: 150, height: 150, backgroundColor: '#000' }} resizeMode="cover" />
                  <View style={{ position: 'absolute', top: 8, left: 8, backgroundColor: 'rgba(0, 0, 0, 0.6)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 }}>
                    <Text style={{ color: colors.textCream, fontSize: 9, fontWeight: '700', letterSpacing: 0.5 }}>
                      {lang === 'th' ? 'ตัวอย่าง' : 'EXAMPLE'}
                    </Text>
                  </View>
                  <View style={{ padding: 10 }}>
                    <Text numberOfLines={1} style={{ color: '#888', fontSize: 9, letterSpacing: 1, fontWeight: '700', marginBottom: 2 }}>
                      {ex.result.brand.toUpperCase()}
                    </Text>
                    <Text numberOfLines={1} style={{ color: colors.textGold, fontSize: 12.5, fontWeight: '600', marginBottom: 4 }}>
                      {ex.result.name}
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Feather name="check-circle" size={11} color={colors.success} style={{ marginRight: 4 }} />
                      <Text style={{ color: colors.success, fontSize: 11, fontWeight: '700' }}>
                        {ex.result.authenticityProbability}% {lang === 'th' ? 'ผ่านเกณฑ์' : 'verified'}
                      </Text>
                    </View>
                  </View>
                </Pressable>
              ))}
            </ScrollView>
          </View>

          {/* Recent Scans — horizontal carousel of saved watches.
              Mirrors the songphra "เพิ่งสแกน" UX: a quick visual reminder
              of what you most recently looked at, with one-tap re-open.
              Only renders when the user actually has saved watches — empty
              vaults skip the section entirely so first-install Home doesn't
              show a confusing empty row. */}
          {portfolio.recent.length > 0 && (
            <View style={{ marginBottom: spacing.md }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm }}>
                <Text style={{ color: colors.textGold, fontSize: 14, fontWeight: '700', letterSpacing: 0.5 }}>
                  {lang === 'th' ? 'เพิ่งสแกน' : 'Recent Scans'}
                </Text>
                <Pressable onPress={() => navigation.navigate('Main', { screen: 'Collection' })}>
                  <Text style={{ color: colors.amber, fontSize: 12, fontWeight: '600' }}>
                    {lang === 'th' ? 'ดูทั้งหมด ›' : 'View all ›'}
                  </Text>
                </Pressable>
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: spacing.sm, paddingVertical: 2 }}
              >
                {portfolio.recent.map((w) => {
                  const marketPrice = (w.customPrice || w.result?.marketPrice || 0) * exchangeRate;
                  return (
                    <Pressable
                      key={w.id}
                      onPress={() =>
                        navigation.navigate('Result', {
                          result: w.result,
                          frontUri: w.frontUri,
                          backUri: w.backUri,
                          savedId: w.id,
                          processedFrontUri: w.processedFrontUri,
                          customName: w.customName,
                          customPrice: w.customPrice,
                          purchasePrice: w.purchasePrice,
                          soldAt: w.soldAt,
                          soldPrice: w.soldPrice,
                          soldTo: w.soldTo,
                          soldNotes: w.soldNotes,
                          galleryImages: w.galleryImages,
                          bgColor: w.bgColor,
                        })
                      }
                      style={{
                        width: 140,
                        borderRadius: 12,
                        overflow: 'hidden',
                        borderWidth: 1,
                        borderColor: 'rgba(236, 200, 122, 0.3)',
                        backgroundColor: 'rgba(18, 14, 10, 0.7)',
                      }}
                    >
                      <Image
                        source={{ uri: w.frontUri }}
                        style={{ width: 140, height: 140, backgroundColor: '#000' }}
                        resizeMode="cover"
                      />
                      <View style={{ padding: 8 }}>
                        <Text
                          numberOfLines={1}
                          style={{ color: '#888', fontSize: 9, letterSpacing: 1, fontWeight: '700', marginBottom: 2 }}
                        >
                          {(w.result?.brand || '').toUpperCase()}
                        </Text>
                        <Text
                          numberOfLines={2}
                          style={{ color: colors.textGold, fontSize: 12, fontWeight: '600', lineHeight: 16, marginBottom: 4, minHeight: 32 }}
                        >
                          {w.customName || w.result?.name || '—'}
                        </Text>
                        <Text style={{ color: colors.amber, fontSize: 13, fontWeight: '800' }}>
                          {marketPrice > 0 ? `฿${Math.round(marketPrice).toLocaleString()}` : '—'}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          )}

          {/* Portfolio Stats Panel — songphra-style vault summary.
              Reorganised from "title + 2-stat grid" to "big-total + 3 stat
              pills + view-all CTA". Hierarchy matches how watch collectors
              actually scan this section: total portfolio value is the headline
              metric, count/brands/verified are quick context, deep dive lives
              behind a single clear CTA. */}
          <View style={[styles.statsCard, { overflow: 'hidden', borderColor: 'rgba(212, 175, 55, 0.35)', borderWidth: 1, padding: spacing.lg }]}>
            <LinearGradient
              colors={['rgba(28, 22, 17, 0.92)', 'rgba(18, 14, 10, 0.98)']}
              style={StyleSheet.absoluteFillObject}
            />

            {/* Title row */}
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm }}>
              <Feather name="award" size={18} color={colors.amber} style={{ marginRight: 8 }} />
              <Text style={{ color: colors.amber, fontSize: 13, fontWeight: '700', letterSpacing: 1.4 }}>
                {lang === 'th' ? 'มูลค่าคอลเลกชันรวม' : 'PORTFOLIO VALUE'}
              </Text>
            </View>

            {/* Big total value */}
            <View style={{ flexDirection: 'row', alignItems: 'baseline', marginBottom: spacing.md }}>
              <Text style={{ color: colors.textCream, fontSize: 16, fontWeight: '700', marginRight: 6 }}>฿</Text>
              <Text style={{ color: '#FFFFFF', fontSize: 30, fontWeight: '800', letterSpacing: -0.5, lineHeight: 34 }}>
                {Math.round(portfolio.totalValue * exchangeRate).toLocaleString()}
              </Text>
            </View>

            {/* 3 stat pills */}
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: spacing.md }}>
              <View style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: 18,
                borderWidth: 1,
                borderColor: 'rgba(236, 200, 122, 0.3)',
                backgroundColor: 'rgba(236, 200, 122, 0.05)',
              }}>
                <Feather name="layers" size={12} color={colors.amber} style={{ marginRight: 5 }} />
                <Text style={{ color: colors.textGold, fontSize: 12, fontWeight: '700' }}>
                  {portfolio.totalCount} {lang === 'th' ? 'เรือน' : 'pcs'}
                </Text>
              </View>
              <View style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: 18,
                borderWidth: 1,
                borderColor: 'rgba(236, 200, 122, 0.3)',
                backgroundColor: 'rgba(236, 200, 122, 0.05)',
              }}>
                <Feather name="grid" size={12} color={colors.amber} style={{ marginRight: 5 }} />
                <Text style={{ color: colors.textGold, fontSize: 12, fontWeight: '700' }}>
                  {portfolio.brandCount} {lang === 'th' ? 'แบรนด์' : 'brands'}
                </Text>
              </View>
              <View style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: 18,
                borderWidth: 1,
                borderColor: 'rgba(46, 204, 113, 0.3)',
                backgroundColor: 'rgba(46, 204, 113, 0.06)',
              }}>
                <Feather name="check-circle" size={12} color="#2ECC71" style={{ marginRight: 5 }} />
                <Text style={{ color: '#D0E8D7', fontSize: 12, fontWeight: '700' }}>
                  {portfolio.verifiedCount} {lang === 'th' ? 'ผ่านเกณฑ์' : 'verified'}
                </Text>
              </View>
            </View>

            {/* View-all CTA */}
            <Pressable
              onPress={() => navigation.navigate('Main', { screen: 'Collection' })}
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end' }}
            >
              <Text style={{ color: colors.amber, fontSize: 13, fontWeight: '700', marginRight: 4 }}>
                {lang === 'th' ? 'เปิดดูทั้งคอลเลกชัน' : 'View entire vault'}
              </Text>
              <Feather name="arrow-right" size={14} color={colors.amber} />
            </Pressable>

            {/* Per-brand watch-stack carousel.
                Renders a horizontally-scrolling row of brand "stacks": each
                stack is up to 3 overlapping circular thumbnails of saved
                watches in that brand, plus a "+N" pill if the brand has more.
                Tapping a stack jumps to the Vault tab pre-filtered by brand
                (TODO when nav-param support lands; for now navigates to vault).
                Falls back to a quiet empty-state card when the user has no
                watches yet so the section never collapses on first install. */}
            {portfolio.byBrand.length > 0 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={{ marginBottom: spacing.md, marginTop: -spacing.xs }}
                contentContainerStyle={{ paddingHorizontal: 2, paddingVertical: 4, gap: spacing.sm }}
              >
                {portfolio.byBrand.map((g) => {
                  const stack = g.watches.slice(0, 3);
                  const extra = g.count - stack.length;
                  return (
                    <Pressable
                      key={g.brand}
                      onPress={() => navigation.navigate('Main', { screen: 'Collection' })}
                      style={{
                        minWidth: 92,
                        paddingHorizontal: 10,
                        paddingVertical: 8,
                        borderRadius: 12,
                        borderWidth: 1,
                        borderColor: 'rgba(236, 200, 122, 0.25)',
                        backgroundColor: 'rgba(28, 22, 17, 0.6)',
                        alignItems: 'center',
                      }}
                    >
                      <View style={{ flexDirection: 'row', height: 32, marginBottom: 6 }}>
                        {stack.map((w, idx) => (
                          <Image
                            key={w.id}
                            source={{ uri: w.frontUri }}
                            style={{
                              width: 32,
                              height: 32,
                              borderRadius: 16,
                              borderWidth: 1.2,
                              borderColor: '#ECC87A',
                              marginLeft: idx === 0 ? 0 : -10,
                              zIndex: stack.length - idx,
                              backgroundColor: '#000',
                            }}
                          />
                        ))}
                        {extra > 0 && (
                          <View
                            style={{
                              width: 32,
                              height: 32,
                              borderRadius: 16,
                              borderWidth: 1.2,
                              borderColor: '#ECC87A',
                              marginLeft: -10,
                              backgroundColor: 'rgba(18, 14, 10, 0.95)',
                              justifyContent: 'center',
                              alignItems: 'center',
                            }}
                          >
                            <Text style={{ color: colors.amber, fontSize: 10, fontWeight: '800' }}>
                              +{extra}
                            </Text>
                          </View>
                        )}
                      </View>
                      <Text
                        numberOfLines={1}
                        style={{
                          color: colors.textGold,
                          fontSize: 11,
                          fontWeight: '700',
                          letterSpacing: 0.3,
                          textAlign: 'center',
                          maxWidth: 100,
                        }}
                      >
                        {g.brand}
                      </Text>
                      <Text style={{ color: colors.textMuted, fontSize: 10, marginTop: 2 }}>
                        {g.count}{' '}
                        {lang === 'th' ? (g.count === 1 ? 'เรือน' : 'เรือน') : g.count === 1 ? 'piece' : 'pcs'}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            ) : null}

            {/* (Removed the duplicate VAULTED / ESTIMATED-VALUE statsGrid — the
                piece count and total value are already shown above in the big
                total + 3-pill row, so the card no longer repeats them.) */}
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
                {lang === 'th' ? 'ฝึกสายตานักสะสม — ทายรุ่น เดาราคา สะสม XP' : "TRAIN YOUR COLLECTOR'S EYE — GUESS MODELS, EARN XP"}
              </Text>
            </View>
            <View style={styles.gamePlayCircle}>
              <Feather name="play" size={14} color={colors.amber} />
            </View>
          </Pressable>

          {/* Supported Brands + Coverage Roadmap moved to Settings → see
              SettingsScreen "Authentication Coverage" block. The HomeScreen
              now ends after Mini-Game promo so the feed reads "scan → recent
              → portfolio → fun challenge" and not "...and here are 31 brand
              names". Brand catalog is reference material, not a daily-use
              surface, so it lives in Settings (alongside FAQ/Terms). */}
        </SafeAreaView>
      </ScrollView>
    </View>
  );
}
