import { Feather } from '@expo/vector-icons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useState, useRef } from 'react';
import Svg, { Path, Circle, Defs, LinearGradient as SvgLinearGradient, Stop, G, Line, Rect, Text as SvgText } from 'react-native-svg';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Easing,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';

import * as ImagePicker from 'expo-image-picker';
import { colors, radius, shadow, spacing, typography } from './src/lib/theme';
import { RootStackParamList, SavedWatch, ScanResult } from './src/lib/types';
import {
  AuthUser,
  getAuthUser,
  getMembership,
  isAuthenticated,
  loginMock,
  logout,
  setMembership,
  startTrialAgain,
  clearTrial,
  MembershipTier,
  updateUser,
} from './src/lib/auth';
import {
  getAllWatches,
  deleteWatch,
  saveWatch,
  calculatePortfolio,
} from './src/lib/collection';

const getSavedWatches = getAllWatches;
const deleteSavedWatch = deleteWatch;

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


// Core Screens
import { ScanScreen } from './src/screens/ScanScreen';
import { LoadingScreen } from './src/screens/LoadingScreen';
import { ResultScreen } from './src/screens/ResultScreen';
import { MagazineScreen } from './src/screens/MagazineScreen';
import { getExchangeRate, fetchLiveExchangeRate } from './src/lib/currency';
import { LanguageProvider, useLanguage } from './src/lib/localization';

// Navigation Stack and Tabs
const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator();

// Developer Event Listener for tier remounting
let globalUpdateAppTier: ((tier: MembershipTier) => void) | null = null;

// ==========================================
// 1. SPLASH SCREEN (Premium Luxury Splash)
// ==========================================
// ==========================================
// 1. SPLASH SCREEN (Premium Luxury Splash)
// ==========================================
function SplashScreen({ navigation }: any) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const logoScale = useRef(new Animated.Value(0.9)).current;
  const tickAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Elegant mechanical tick rotation
    Animated.loop(
      Animated.timing(tickAnim, {
        toValue: 1,
        duration: 60000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    ).start();

    // Fade and scale logo
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 1500,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(logoScale, {
        toValue: 1,
        duration: 1800,
        easing: Easing.out(Easing.back(1.5)),
        useNativeDriver: true,
      }),
    ]).start();

    // Auto navigate after 2.8s
    const timer = setTimeout(async () => {
      const logged = await isAuthenticated();
      if (logged) {
        navigation.replace('Main');
      } else {
        navigation.replace('Login');
      }
    }, 2800);

    return () => clearTimeout(timer);
  }, []);

  const spin = tickAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const spinOpposite = tickAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['360deg', '0deg'],
  });

  return (
    <SafeAreaView style={styles.splashContainer}>
      <StatusBar style="light" />
      <View style={styles.splashGraphicWrap}>
        {/* Animated tourbillon background - Dual Gears */}
        <Animated.View style={[styles.tourbillonBackground, { transform: [{ rotate: spin }] }]}>
          <Feather name="loader" size={260} color="rgba(236, 200, 122, 0.05)" />
        </Animated.View>
        <Animated.View style={[styles.tourbillonBackground, { left: screenW * 0.1, top: screenH * 0.08, transform: [{ rotate: spinOpposite }] }]}>
          <Feather name="settings" size={170} color="rgba(236, 200, 122, 0.02)" />
        </Animated.View>

        <Animated.View style={{ opacity: fadeAnim, transform: [{ scale: logoScale }], alignItems: 'center' }}>
          {/* Double-border luxury monogram shield frame */}
          <View style={styles.splashLogoOuterBorder}>
            <View style={styles.splashLogoInnerBorder}>
              <Image 
                source={require('./assets/splash-icon.png')} 
                style={styles.splashLogoImage} 
                resizeMode="contain"
              />
            </View>
          </View>

          <Text style={styles.splashTitle}>LUXURY</Text>
          <Text style={styles.splashSubtitle}>AUTHENTICATOR</Text>
          
          <View style={styles.splashDivider} />
          <Text style={styles.splashDescription}>
            AI-POWERED HOROLOGICAL VERIFICATION & MARKET VALUATION{"\n"}
            Independent 1:1 Precision AI Inspection & Valuation
          </Text>
        </Animated.View>
      </View>

      <View style={styles.splashFooter}>
        <ActivityIndicator size="small" color={colors.amber} />
        <Text style={styles.splashFooterText}>SECURE CRYPTO-VISION ENGINE v1.2</Text>
      </View>
    </SafeAreaView>
  );
}

// ==========================================
// 2. LOGIN SCREEN (Luxury Mock Login)
// ==========================================
function LoginScreen({ navigation }: any) {
  const { t, lang } = useLanguage();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const tickAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.timing(tickAnim, {
        toValue: 1,
        duration: 80000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    ).start();
  }, []);

  const spin = tickAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const spinOpposite = tickAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['360deg', '0deg'],
  });

  const handleLogin = async (presetEmail?: string) => {
    const targetEmail = presetEmail || email;
    if (!targetEmail || !targetEmail.includes('@')) {
      Alert.alert(
        lang === 'th' ? 'จำเป็นต้องระบุอีเมล' : 'Email Required',
        lang === 'th' ? 'กรุณากรอกอีเมลที่ถูกต้องเพื่อเข้าใช้งานตู้นิรภัยสะสมของคุณ' : 'Please enter a valid email address to access your vault.'
      );
      return;
    }
    setLoading(true);
    try {
      await loginMock(targetEmail);
      navigation.replace('Main');
    } catch (e) {
      Alert.alert(
        lang === 'th' ? 'การเข้าถึงถูกปฏิเสธ' : 'Access Denied',
        lang === 'th' ? 'การตรวจสอบสิทธิ์ล้มเหลว กรุณาตรวจสอบข้อมูลการเข้าสู่ระบบของคุณอีกครั้ง' : 'Authentication failed. Please check your credentials.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <LinearGradient
        colors={['#1F130E', '#0A0805']}
        style={StyleSheet.absoluteFillObject}
      />
      {/* Animated gear background */}
      <Animated.View style={[styles.tourbillonBackground, { top: screenH * 0.15, transform: [{ rotate: spin }] }]}>
        <Feather name="loader" size={300} color="rgba(236, 200, 122, 0.04)" />
      </Animated.View>
      <Animated.View style={[styles.tourbillonBackground, { right: screenW * 0.05, top: screenH * 0.45, transform: [{ rotate: spinOpposite }] }]}>
        <Feather name="settings" size={180} color="rgba(236, 200, 122, 0.02)" />
      </Animated.View>

      <ScrollView contentContainerStyle={styles.scrollGrow} style={[styles.loginContainer, { backgroundColor: 'transparent' }]}>
        <StatusBar style="light" />
        <SafeAreaView style={styles.loginContent}>
          <View style={styles.loginHeader}>
            {/* Double-bordered luxury crown avatar monogram */}
            <View style={styles.loginLogoOuterBorder}>
              <View style={styles.loginLogoInnerBorder}>
                <Feather name="shield" size={44} color={colors.amber} />
                <View style={styles.monogramWrap}>
                  <Text style={styles.monogramText}>LA</Text>
                </View>
                {/* Crown decoration dot */}
                <View style={styles.crownDot} />
              </View>
            </View>
            <Text style={styles.loginTitle}>
              {lang === 'th' ? 'ยินดีต้อนรับ นักสะสม' : 'Welcome, Collector'}
            </Text>
            <Text style={styles.loginSubtitle}>
              {lang === 'th' ? 'พอร์ทัลนักสะสมหรู' : 'COLLECTOR PORTAL'}
            </Text>
            <Text style={styles.loginSubDesc}>
              {lang === 'th' ? 'เข้าสู่ตู้นิรภัยสะสมส่วนตัวและระบบสแกนด้วย AI' : 'Access your private collector vault and AI diagnostics'}
            </Text>
          </View>

          {/* Translucent Glassmorphic Panel */}
          <View style={[styles.loginCard, { overflow: 'hidden', borderColor: 'rgba(236, 200, 122, 0.25)', borderWidth: 1, ...shadow.amber }]}>
            <LinearGradient
              colors={['rgba(28, 22, 17, 0.88)', 'rgba(18, 14, 10, 0.94)']}
              style={StyleSheet.absoluteFillObject}
            />
            <Text style={styles.inputLabel}>
              {lang === 'th' ? 'ที่อยู่อีเมลของคุณ' : 'EMAIL ADDRESS'}
            </Text>
            <View style={[styles.inputContainer, { borderColor: 'rgba(236, 200, 122, 0.25)' }]}>
              <Feather name="mail" size={18} color={colors.amber} style={styles.inputIcon} />
              <TextInput
                style={styles.textInput}
                placeholder="example@luxury.com"
                placeholderTextColor={colors.textMuted}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>

            {/* Premium Gold Satin Action Button */}
            <Pressable style={styles.loginPremiumBtn} onPress={() => handleLogin()} disabled={loading}>
              <LinearGradient
                colors={['#ECC87A', '#C59A45', '#9A7326']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFillObject}
              />
              {loading ? (
                <ActivityIndicator size="small" color="#000" />
              ) : (
                <Text style={styles.loginPremiumBtnText}>
                  {lang === 'th' ? 'เข้าสู่ตู้สะสมนิรภัย' : 'ENTER VAULT'}
                </Text>
              )}
            </Pressable>
          </View>

          <Text style={styles.orText}>
            {lang === 'th' ? '— หรือเลือกโปรไฟล์ทดสอบระบบ Sandbox —' : '— Or choose a sandbox testing profile —'}
          </Text>

          {/* Preset cards styled with gold borders */}
          <View style={styles.presetGrid}>
            <Pressable style={[styles.presetCard, { overflow: 'hidden', borderColor: 'rgba(236, 200, 122, 0.2)' }]} onPress={() => handleLogin('vip@patek.com')}>
              <LinearGradient
                colors={['rgba(30, 24, 20, 0.75)', 'rgba(18, 14, 12, 0.9)']}
                style={StyleSheet.absoluteFillObject}
              />
              <Text style={styles.presetEmoji}>👑</Text>
              <Text style={styles.presetName}>Patek VIP</Text>
              <Text style={styles.presetEmail}>vip@patek.com</Text>
            </Pressable>

            <Pressable style={[styles.presetCard, { overflow: 'hidden', borderColor: 'rgba(236, 200, 122, 0.2)' }]} onPress={() => handleLogin('collector@rolex.com')}>
              <LinearGradient
                colors={['rgba(30, 24, 20, 0.75)', 'rgba(18, 14, 12, 0.9)']}
                style={StyleSheet.absoluteFillObject}
              />
              <Text style={styles.presetEmoji}>⌚</Text>
              <Text style={styles.presetName}>Rolex Collector</Text>
              <Text style={styles.presetEmail}>collector@rolex.com</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </ScrollView>
    </View>
  );
}

// ==========================================
// 3. HOME SCREEN (Luxury Dashboard)
// ==========================================
function HomeScreen({ navigation }: any) {
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
        setExchangeRate(cachedRate);
        const liveRate = await fetchLiveExchangeRate();
        setExchangeRate(liveRate);
      } catch (e) {}
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
            <View style={{ flex: 1, marginRight: spacing.md }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={styles.greeting}>
                  {lang === 'th' ? `ยินดีต้อนรับกลับคุณ ${user?.displayName || 'นักสะสม'}` : `Welcome Back, ${user?.displayName || 'Collector'}`}
                </Text>
                <Text style={{ fontSize: 20 }}>👑</Text>
              </View>
              <Text style={styles.headerSub}>
                {lang === 'th' ? 'วันนี้คุณตรวจสอบนาฬิกาของคุณหรือยัง?' : 'HAVE YOU VERIFIED YOUR TIMEPIECE TODAY?'}
              </Text>
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

// ==========================================
// 4. COLLECTION SCREEN (List of Saved Watches)
// ==========================================
function CollectionScreen({ navigation }: any) {
  const { t, lang } = useLanguage();
  const [watches, setWatches] = useState<SavedWatch[]>([]);
  const [metrics, setMetrics] = useState({ totalCount: 0, totalValue: 0 });
  const [filter, setFilter] = useState<'all' | 'active' | 'sold'>('all');
  const [exchangeRate, setExchangeRate] = useState<number>(36.5);

  const loadData = async () => {
    try {
      const list = await getSavedWatches();
      const sorted = list.sort((a: SavedWatch, b: SavedWatch) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime());
      setWatches(sorted);
      const m = await getPortfolioMetrics();
      setMetrics(m);
      const rate = await getExchangeRate();
      setExchangeRate(rate);
    } catch (e) {
      console.warn(e);
    }
  };

  useEffect(() => {
    loadData();
    const timer = setInterval(loadData, 2000);
    return () => clearInterval(timer);
  }, []);

  const filteredWatches = watches.filter((w) => {
    if (filter === 'active') return !w.soldAt;
    if (filter === 'sold') return !!w.soldAt;
    return true;
  });

  const handleDelete = (id: string, name: string) => {
    Alert.alert(
      lang === 'th' ? 'ยืนยันการลบข้อมูล' : 'Confirm Deletion',
      lang === 'th'
        ? `คุณแน่ใจหรือไม่ว่าต้องการลบ ${name} ออกจากตู้นิรภัยสะสมของคุณ?`
        : `Are you sure you want to remove ${name} from your collector vault?`,
      [
        { text: lang === 'th' ? 'ยกเลิก' : 'Cancel', style: 'cancel' },
        {
          text: lang === 'th' ? 'ลบข้อมูล' : 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteSavedWatch(id);
            loadData();
          },
        },
      ]
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <LinearGradient
        colors={['#1C130E', '#0A0805']}
        style={StyleSheet.absoluteFillObject}
      />
      <StatusBar style="light" />
      <SafeAreaView style={styles.safeAreaZero} edges={['top']}>
        {/* Collection Summary Header */}
        <View style={[styles.colHeaderCard, { overflow: 'hidden', borderBottomWidth: 1.5, borderBottomColor: 'rgba(212, 175, 55, 0.25)' }]}>
          <LinearGradient
            colors={['rgba(28, 22, 17, 0.9)', 'rgba(18, 14, 10, 0.95)']}
            style={StyleSheet.absoluteFillObject}
          />
          <Text style={styles.colHeaderTitle}>
            {lang === 'th' ? 'ตู้นิรภัยสะสมของฉัน' : 'MY VAULT COLLECTION'}
          </Text>
          <View style={styles.colSummaryRow}>
            <View>
              <Text style={styles.colSummaryLabel}>
                {lang === 'th' ? 'ทรัพย์สินสะสมทั้งหมด' : 'TOTAL ASSETS'}
              </Text>
              <Text style={styles.colSummaryValue}>
                {metrics.totalCount} {lang === 'th' ? 'เรือน' : 'Timepieces'}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.colSummaryLabel}>
                {lang === 'th' ? 'ประเมินมูลค่ารวมตลาดรอง' : 'TOTAL ESTIMATED VALUE'}
              </Text>
              <Text style={[styles.colSummaryValue, { color: colors.amber }]}>
                ฿{Math.round(metrics.totalValue * exchangeRate).toLocaleString()}
              </Text>
            </View>
          </View>
        </View>

        {/* Segmented Filter Tabs */}
        <View style={styles.filterTabsRow}>
          {(['all', 'active', 'sold'] as const).map((tab) => (
            <Pressable
              key={tab}
              style={[styles.filterTab, filter === tab && styles.filterTabActive, { overflow: 'hidden' }]}
              onPress={() => setFilter(tab)}
            >
              {filter === tab && (
                <LinearGradient
                  colors={['#ECC87A', '#A37C2F']}
                  style={StyleSheet.absoluteFillObject}
                />
              )}
              <Text style={[styles.filterTabText, filter === tab && styles.filterTabTextActive]}>
                {tab === 'all' ? (lang === 'th' ? 'ทั้งหมด' : 'ALL') : tab === 'active' ? (lang === 'th' ? 'ตู้สะสม' : 'VAULTED') : (lang === 'th' ? 'ขายแล้ว' : 'SOLD')}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Saved List */}
        {filteredWatches.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Feather name="folder-minus" size={48} color={colors.textMuted} />
            <Text style={styles.emptyText}>
              {lang === 'th' ? 'ไม่มีนาฬิกาในตู้นิรภัยกลุ่มนี้' : 'No timepieces in this category'}
            </Text>
            <Pressable style={styles.emptyBtn} onPress={() => navigation.navigate('Scan')}>
              <Text style={styles.emptyBtnText}>
                {lang === 'th' ? 'เริ่มต้นการสแกนนาฬิกา' : 'START SCANNING'}
              </Text>
            </Pressable>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.colListScroll}>
            {filteredWatches.map((w) => {
              const verdict = w.result.authenticityVerdict || 'cannot-assess';
              const name = w.customName || w.result.name;
              
              // Color indicator for authenticity
              let verdictColor = colors.textMuted;
              let verdictText = lang === 'th' ? 'ไม่สามารถระบุได้' : 'UNABLE TO VERIFY';
              if (verdict === 'likely-authentic') {
                verdictColor = colors.success;
                verdictText = lang === 'th' ? 'ของแท้ผ่านเกณฑ์' : 'LIKELY AUTHENTIC';
              } else if (verdict === 'uncertain') {
                verdictColor = colors.warning;
                verdictText = lang === 'th' ? 'ไม่แน่นอน' : 'UNCERTAIN';
              } else if (verdict === 'likely-reproduction') {
                verdictColor = colors.danger;
                verdictText = lang === 'th' ? 'ของเลียนแบบ' : 'REPRODUCTION';
              }

              return (
                <Pressable
                  key={w.id}
                  style={[styles.watchItemCard, { overflow: 'hidden', borderColor: 'rgba(212, 175, 55, 0.25)', borderWidth: 1 }]}
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
                >
                  <LinearGradient
                    colors={['rgba(28, 22, 17, 0.75)', 'rgba(18, 14, 10, 0.85)']}
                    style={StyleSheet.absoluteFillObject}
                  />
                  <Image source={{ uri: w.frontUri }} style={[styles.watchItemImg, { borderWidth: 1.5, borderColor: '#ECC87A', borderRadius: 40 }]} />
                  
                  <View style={{ flex: 1, gap: 4 }}>
                    <View style={styles.watchItemRow}>
                      <Text style={styles.watchItemBrand}>{w.result.brand?.toUpperCase()}</Text>
                      {w.soldAt && <View style={styles.soldBadge}><Text style={styles.soldBadgeText}>{lang === 'th' ? 'ขายแล้ว' : 'SOLD'}</Text></View>}
                    </View>
                    <Text style={styles.watchItemName} numberOfLines={1}>{name}</Text>
                    <Text style={styles.watchItemReference}>Ref. {w.result.year || 'N/A'}</Text>
                    
                    <View style={styles.watchItemFooter}>
                      <View style={{
                        paddingHorizontal: 8,
                        paddingVertical: 3,
                        borderRadius: 12,
                        borderWidth: 1,
                        borderColor: verdictColor,
                        backgroundColor: verdictColor === colors.success ? 'rgba(46, 204, 113, 0.12)' : verdictColor === colors.warning ? 'rgba(236, 200, 122, 0.12)' : verdictColor === colors.danger ? 'rgba(231, 76, 60, 0.12)' : 'rgba(255, 255, 255, 0.05)',
                        shadowColor: verdictColor,
                        shadowOffset: { width: 0, height: 0 },
                        shadowOpacity: 0.35,
                        shadowRadius: 5,
                      }}>
                        <Text style={[styles.verdictBadgeText, { color: verdictColor, fontSize: 10, fontWeight: '800' }]}>
                          ● {verdictText} ({w.result.authenticityProbability || 0}%)
                        </Text>
                      </View>
                      <Text style={[styles.watchItemPrice, { color: verdict === 'likely-reproduction' ? colors.danger : colors.amber }]}>
                        {verdict === 'likely-reproduction' ? 'N/A' : `฿${Math.round((w.customPrice || w.result.marketPrice || 0) * exchangeRate).toLocaleString()}`}
                      </Text>
                    </View>
                  </View>

                  <Pressable style={styles.deleteItemBtn} onPress={() => handleDelete(w.id, name)}>
                    <Feather name="trash-2" size={15} color={colors.danger} />
                  </Pressable>
                </Pressable>
              );
            })}
          </ScrollView>
        )}
      </SafeAreaView>
    </View>
  );
}

// ==========================================
// 5. PORTFOLIO SCREEN (Metrics Analysis)
// ==========================================
function PortfolioScreen() {
  const { t, lang } = useLanguage();
  const [metrics, setMetrics] = useState<any>(null);
  const [exchangeRate, setExchangeRate] = useState<number>(36.5);

  const load = async () => {
    const m = await getPortfolioMetrics();
    setMetrics(m);
    const rate = await getExchangeRate();
    setExchangeRate(rate);
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

// ==========================================
// 6. SETTINGS SCREEN & DEV CONTROL PANEL
// ==========================================
function SettingsScreen({ navigation }: any) {
  const { t, lang, setLang } = useLanguage();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [membership, setMembershipState] = useState<any>(null);

  const load = async () => {
    const u = await getAuthUser();
    const m = await getMembership();
    setUser(u);
    setMembershipState(m);
  };

  useEffect(() => {
    load();
    const timer = setInterval(load, 2000);
    return () => clearInterval(timer);
  }, []);

  const handleSelectAvatar = async () => {
    // Request permission first
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Permission Required',
        'We need access to your photo library to set a profile picture.'
      );
      return;
    }

    // Launch image picker
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      const selectedUri = result.assets[0].uri;
      // Update local storage and state
      const updated = await updateUser({ avatarUri: selectedUri });
      if (updated) {
        setUser(updated);
      }
    }
  };

  const handleLogout = async () => {
    await logout();
    navigation.replace('Login');
  };

  const handleClearData = async () => {
    Alert.alert(t('settings.wipeConfirmTitle'), t('settings.wipeConfirmDesc'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('settings.wipeConfirmTitle'),
        style: 'destructive',
        onPress: async () => {
          await AsyncStorage.clear();
          await load();
          if (globalUpdateAppTier) globalUpdateAppTier('free');
          Alert.alert(t('common.success'), t('settings.wipeSuccess'));
        },
      },
    ]);
  };

  // Switch tier dynamically from the developer control bar
  const changeTierDev = async (tier: MembershipTier) => {
    await setMembership(tier);
    await load();
    if (globalUpdateAppTier) {
      globalUpdateAppTier(tier);
    }
    HapticsLogMock('notificationSuccess');
  };

  // Mock haptic logs for UI response
  const HapticsLogMock = (type: string) => {
    console.log(`[Haptics Mock] fired: ${type}`);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <LinearGradient
        colors={['#1B130E', '#0A0805']}
        style={StyleSheet.absoluteFillObject}
      />
      <ScrollView style={styles.settingsContainer} contentContainerStyle={styles.settingsContent}>
        <StatusBar style="light" />
        <SafeAreaView style={styles.safeAreaZero} edges={['top']}>
          <Text style={styles.settingsTitle}>{t('settings.title')}</Text>

          {/* Profile Card */}
          <View style={[styles.profileCard, { overflow: 'hidden', borderColor: '#ECC87A', borderWidth: 1.5, marginBottom: spacing.sm }]}>
            <LinearGradient
              colors={['rgba(30, 24, 20, 0.85)', 'rgba(18, 14, 12, 0.95)']}
              style={StyleSheet.absoluteFillObject}
            />
            <Pressable
              onPress={handleSelectAvatar}
              style={[styles.profileAvatar, { borderWidth: 2, borderColor: '#ECC87A', overflow: 'hidden', justifyContent: 'center', alignItems: 'center' }]}
            >
              {user?.avatarUri ? (
                <Image source={{ uri: user.avatarUri }} style={StyleSheet.absoluteFillObject} />
              ) : (
                <>
                  <LinearGradient
                    colors={['rgba(28, 22, 17, 0.95)', 'rgba(10, 8, 5, 0.98)']}
                    style={StyleSheet.absoluteFillObject}
                  />
                  <Text style={[styles.avatarText, { color: '#ECC87A', fontWeight: '900' }]}>
                    {user?.displayName?.slice(0, 2).toUpperCase() || 'LU'}
                  </Text>
                </>
              )}
              <View style={styles.avatarEditOverlay}>
                <Feather name="camera" size={10} color="#fff" />
              </View>
            </Pressable>
            <View>
              <Text style={styles.profileName}>{user?.displayName || (lang === 'th' ? 'นักสะสมนาฬิกาหรู' : 'Horological Collector')}</Text>
              <Text style={styles.profileEmail}>{user?.email || 'collector@luxury.com'}</Text>
            </View>
          </View>

          {/* Premium Glassmorphic Language Switcher */}
          <View style={[styles.planCard, { overflow: 'hidden', borderColor: 'rgba(236, 200, 122, 0.35)', borderWidth: 1.5, padding: 14, marginBottom: spacing.sm }]}>
            <LinearGradient
              colors={['rgba(28, 22, 15, 0.9)', 'rgba(18, 14, 10, 0.95)']}
              style={StyleSheet.absoluteFillObject}
            />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={[styles.planTitle, { fontSize: 13, letterSpacing: 0.5, color: '#ECC87A' }]}>
                {t('settings.language')}
              </Text>
              <View style={{ flexDirection: 'row', borderRadius: radius.sm, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(236, 200, 122, 0.3)' }}>
                <Pressable
                  style={{
                    paddingHorizontal: 16,
                    paddingVertical: 8,
                    backgroundColor: lang === 'en' ? colors.amber : 'transparent',
                  }}
                  onPress={() => setLang('en')}
                >
                  <Text style={{ color: lang === 'en' ? '#000' : '#fff', fontSize: 11, fontWeight: '900' }}>
                    🇺🇸 EN
                  </Text>
                </Pressable>
                <Pressable
                  style={{
                    paddingHorizontal: 16,
                    paddingVertical: 8,
                    backgroundColor: lang === 'th' ? colors.amber : 'transparent',
                  }}
                  onPress={() => setLang('th')}
                >
                  <Text style={{ color: lang === 'th' ? '#000' : '#fff', fontSize: 11, fontWeight: '900' }}>
                    🇹🇭 TH
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>

          {/* Active Plan Info */}
          <View style={[styles.planCard, { overflow: 'hidden', borderColor: 'rgba(212, 175, 55, 0.35)', borderWidth: 1.5 }]}>
            <LinearGradient
              colors={['rgba(28, 22, 15, 0.9)', 'rgba(18, 14, 10, 0.95)']}
              style={StyleSheet.absoluteFillObject}
            />
            <View style={styles.planHeader}>
              <Text style={styles.planTitle}>{t('settings.activePlan')}</Text>
              <Text style={[styles.planTier, { color: colors.amber }]}>
                {membership?.tier?.toUpperCase() || 'FREE'}
              </Text>
            </View>
             <Text style={styles.planDetails}>
              {membership?.isTrialing
                ? (lang === 'th' ? `เปิดใช้งานสิทธิ์ทดลองใช้ Premium ฟรี (${membership?.trialDaysLeft} วันที่เหลือ)` : `Active in Free Premium Trial (${membership?.trialDaysLeft} days remaining)`)
                : membership?.tier === 'free'
                  ? (lang === 'th' ? 'ระดับทดลองใช้ฟรี (จำกัดการสแกนความแท้ด้วย AI ทั้งหมด 5 ครั้ง)' : 'Free Trial tier (limited to 5 lifetime AI scans)')
                  : membership?.tier === 'standard'
                    ? (lang === 'th' ? 'ระดับแพลทินัมสแตนดาร์ด (สูงสุด 50 สแกน/เดือน, ช่องถ่าย 2 มุม)' : 'Platinum Standard tier (up to 50 scans/month, 2 photo slots)')
                    : membership?.tier === 'pro'
                      ? (lang === 'th' ? 'ระดับดีลเลอร์โกลด์โปร (สูงสุด 100 สแกน/เดือน, รายงาน A5 PDF, ช่องถ่าย 3 มุม)' : 'Dealer Gold Pro tier (up to 100 scans/month, A5 PDF reports, 3 photo slots)')
                      : (lang === 'th' ? 'ระดับวีไอพีเอลิทพรีเมียม (สูงสุด 200 สแกน/เดือน, พอร์ตโฟลิโอสะสมไม่จำกัดความจุ, PDF ไม่มีลายน้ำ)' : 'VIP Elite Premium tier (up to 200 scans/month, unlimited portfolio, watermark-free PDF)')}
            </Text>
            <Pressable style={styles.planUpgradeBtn} onPress={() => navigation.navigate('Membership')}>
              <Text style={styles.planUpgradeText}>{t('settings.manageSub')}</Text>
            </Pressable>
          </View>

          {/* Standard Action Links */}
          <View style={[styles.settingsMenu, { overflow: 'hidden', borderColor: 'rgba(236, 200, 122, 0.15)' }]}>
            <LinearGradient
              colors={['rgba(30, 24, 20, 0.6)', 'rgba(18, 14, 12, 0.75)']}
              style={StyleSheet.absoluteFillObject}
            />
            <Pressable style={styles.menuItem} onPress={() => navigation.navigate('Info', { kind: 'faq' })}>
              <Feather name="help-circle" size={18} color={colors.amber} style={{ opacity: 0.85 }} />
              <Text style={styles.menuItemText}>{t('settings.faqs')}</Text>
              <Feather name="chevron-right" size={16} color={colors.textMuted} />
            </Pressable>

            <Pressable style={styles.menuItem} onPress={() => navigation.navigate('Info', { kind: 'terms' })}>
              <Feather name="file-text" size={18} color={colors.amber} style={{ opacity: 0.85 }} />
              <Text style={styles.menuItemText}>{t('settings.terms')}</Text>
              <Feather name="chevron-right" size={16} color={colors.textMuted} />
            </Pressable>

            <Pressable style={styles.menuItem} onPress={() => navigation.navigate('Info', { kind: 'privacy' })}>
              <Feather name="lock" size={18} color={colors.amber} style={{ opacity: 0.85 }} />
              <Text style={styles.menuItemText}>{t('settings.privacy')}</Text>
              <Feather name="chevron-right" size={16} color={colors.textMuted} />
            </Pressable>

            <Pressable style={styles.menuItem} onPress={handleClearData}>
              <Feather name="trash-2" size={18} color={colors.danger} />
              <Text style={[styles.menuItemText, { color: colors.danger }]}>{t('settings.wipeData')}</Text>
              <Feather name="chevron-right" size={16} color={colors.textMuted} />
            </Pressable>
          </View>

        {/* Logout Button */}
        <Pressable style={styles.logoutBtn} onPress={handleLogout}>
          <Feather name="log-out" size={18} color="#fff" />
          <Text style={styles.logoutText}>{t('settings.logout')}</Text>
        </Pressable>

        {/* ==========================================
            DEVELOPER CONTROL PANEL OVERLAY (FOR SANDBOX GATES TESTING)
            ========================================== */}
        <View style={styles.devCard}>
          <Text style={styles.devCardTitle}>{t('settings.devControls')}</Text>
          <Text style={styles.devCardSub}>{t('settings.devSub')}</Text>
          
          <View style={styles.devBtnRow}>
            {(['free', 'standard', 'pro', 'premium'] as MembershipTier[]).map((tier) => {
              const active = membership?.tier === tier;
              return (
                <Pressable
                  key={tier}
                  style={[styles.devTierBtn, active && styles.devTierBtnActive]}
                  onPress={() => changeTierDev(tier)}
                >
                  <Text style={[styles.devTierText, active && styles.devTierTextActive]}>
                    {tier.toUpperCase()}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.devActionRow}>
            <Pressable
              style={styles.devActionBtn}
              onPress={async () => {
                await startTrialAgain();
                await load();
                if (globalUpdateAppTier) globalUpdateAppTier('free');
                Alert.alert(t('common.success'), t('settings.trialActivated'));
              }}
            >
              <Text style={styles.devActionText}>{t('settings.startTrial')}</Text>
            </Pressable>

            <Pressable
              style={styles.devActionBtn}
              onPress={async () => {
                await clearTrial();
                await load();
                if (globalUpdateAppTier) globalUpdateAppTier('free');
                Alert.alert(t('common.success'), t('settings.trialCleared'));
              }}
            >
              <Text style={styles.devActionText}>{t('settings.clearTrial')}</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    </ScrollView>
  </View>
  );
}

// ==========================================
// 7. MEMBERSHIP / UPGRADE SCREEN
// ==========================================
function MembershipScreen({ navigation }: any) {
  const { t, lang } = useLanguage();
  const [activeTier, setActiveTier] = useState<MembershipTier>('free');
  const [exchangeRate, setExchangeRate] = useState<number>(36.5);

  useEffect(() => {
    getMembership().then((m) => setActiveTier(m.tier));
    getExchangeRate().then((rate) => setExchangeRate(rate));
  }, []);

  const handleSelectTier = async (tier: MembershipTier) => {
    await setMembership(tier);
    setActiveTier(tier);
    if (globalUpdateAppTier) {
      globalUpdateAppTier(tier);
    }
    Alert.alert(
      lang === 'th' ? 'อัปเกรดสำเร็จ!' : 'UPGRADE SUCCESSFUL!',
      lang === 'th'
        ? `บัญชีผู้ใช้ของคุณได้รับการอัปเกรดเป็นระดับ ${tier.toUpperCase()} เรียบร้อยแล้ว`
        : `Your account has been upgraded to ${tier.toUpperCase()} successfully.`,
      [{ text: lang === 'th' ? 'ตกลง' : 'OK', onPress: () => navigation.goBack() }]
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <LinearGradient
        colors={['#1E120A', '#0A0805']}
        style={StyleSheet.absoluteFillObject}
      />
      <ScrollView style={styles.upgradeContainer} contentContainerStyle={styles.upgradeContent}>
        <StatusBar style="light" />
        <SafeAreaView style={styles.safeAreaZero} edges={['top']}>
          <View style={styles.upgradeHeader}>
            <Pressable style={styles.upgradeClose} onPress={() => navigation.goBack()}>
              <Feather name="arrow-left" size={24} color="#fff" />
            </Pressable>
            <Text style={styles.upgradeTitle}>Upgrade Membership</Text>
            <Text style={styles.upgradeSubtitle}>SELECT MEMBERSHIP PLAN</Text>
            <Text style={[styles.upgradeSubtitle, { fontSize: 12, color: colors.textSecondary, marginTop: 4 }]}>
              Premium AI Watch Verification & High-End Analytics
            </Text>
          </View>

          {/* Tier 1: Platinum Standard Plan */}
          <View style={[styles.tierOptionCard, { overflow: 'hidden', borderColor: 'rgba(229, 229, 229, 0.45)', borderWidth: 1.5 }]}>
            <LinearGradient
              colors={['#2E3238', '#1C1F24', '#0F1115']}
              style={StyleSheet.absoluteFillObject}
            />
            
            <View style={styles.tierBadgeWrap}>
              <View style={styles.tierHeaderTop}>
                <Text style={[styles.tierName, { flexShrink: 1 }]}>{t('membership.platinumTitle')}</Text>
                <View style={[styles.tierBadge, { backgroundColor: 'rgba(176, 196, 222, 0.15)', borderColor: '#B0C4DE' }]}>
                  <Text style={[styles.tierBadgeText, { color: '#B0C4DE' }]}>PLATINUM</Text>
                </View>
              </View>
              
              <View style={styles.tierPriceSection}>
                <Text style={styles.tierPrice}>{lang === 'th' ? '฿990' : '$29.99'}</Text>
                <Text style={styles.tierPriceUnit}>{t('membership.monthly')}</Text>
              </View>
              
              <Text style={[styles.tierDailyEst, { color: '#B0C4DE' }]}>
                {t('membership.estimatedDaily')}{lang === 'th' ? '฿33' : '$0.99'}
              </Text>
            </View>

            <View style={styles.featuresList}>
              {[
                lang === 'th' ? 'ตรวจสอบสิทธิ์ AI สูงสุด 50 สแกนต่อเดือน' : 'AI verification up to 50 scans per month',
                lang === 'th' ? 'ปลดล็อกการวิเคราะห์ขอบหน้าปัดและฟอนต์ตัวอักษรหน้าปัด' : 'Unlocks bezel alignment & dial typography analytics',
                lang === 'th' ? 'การเปรียบเทียบและดัชนีราคาตลาดรอง (USD)' : 'Estimated market valuation indexing (USD)',
                lang === 'th' ? 'การสแกนความละเอียดสูงแบบ 2 มุมกล้อง (หน้าปัด + ฝาหลัง)' : 'High-fidelity 2-angle scan (dial + caseback)'
              ].map((feat, idx) => (
                <View key={idx} style={styles.featureRow}>
                  <Feather name="check" size={14} color="#B0C4DE" style={styles.featureIcon} />
                  <Text style={styles.featureText}>{feat}</Text>
                </View>
              ))}
            </View>

            <Pressable
              style={({ pressed }) => [
                styles.tierActionBtn, 
                activeTier === 'standard' && styles.tierActionBtnActive,
                pressed && { opacity: 0.8 }
              ]}
              onPress={() => handleSelectTier('standard')}
            >
              {activeTier === 'standard' ? (
                <Text style={[styles.tierActionBtnText, { color: '#B0C4DE' }]}>{t('membership.currentPlan')}</Text>
              ) : (
                <Text style={styles.tierActionBtnText}>
                  {lang === 'th' ? 'สมัครสแตนดาร์ดแพลน' : 'SELECT STANDARD PLAN'}
                </Text>
              )}
            </Pressable>
          </View>

          {/* Tier 2: Rich Gold Pro Plan (Recommended) */}
          <View style={[styles.tierOptionCard, styles.tierOptionCardBest, { overflow: 'hidden', borderColor: '#ECC87A', borderWidth: 2 }]}>
            <LinearGradient
              colors={['#302517', '#1F160A', '#0F0B05']}
              style={StyleSheet.absoluteFillObject}
            />

            <View style={styles.tierBadgeWrap}>
              <View style={styles.tierHeaderTop}>
                <Text style={[styles.tierName, { color: colors.amber, flexShrink: 1 }]}>{t('membership.goldTitle')}</Text>
                <View style={[styles.tierBadge, { backgroundColor: 'rgba(236, 200, 122, 0.15)', borderColor: '#ECC87A' }]}>
                  <Text style={[styles.tierBadgeText, { color: '#ECC87A' }]}>BEST VALUE 🌟</Text>
                </View>
              </View>
              
              <View style={styles.tierPriceSection}>
                <Text style={[styles.tierPrice, { color: colors.amber }]}>{lang === 'th' ? '฿1,990' : '$59.99'}</Text>
                <Text style={[styles.tierPriceUnit, { color: colors.amber }]}>{t('membership.monthly')}</Text>
              </View>
              
              <Text style={[styles.tierDailyEst, { color: colors.amber }]}>
                {t('membership.estimatedDaily')}{lang === 'th' ? '฿66' : '$1.99'}
              </Text>
            </View>

            <View style={styles.featuresList}>
              {[
                lang === 'th' ? 'ตรวจสอบสิทธิ์ AI สูงสุด 100 สแกนต่อเดือน' : 'AI verification up to 100 scans per month',
                lang === 'th' ? 'อัปเดตดัชนีราคาตลาดสดแบบเรียลไทม์และรีเฟรช' : 'Live market index updates & real-time refresh',
                lang === 'th' ? 'การสแกนความละเอียดสูงแบบ 3 มุมกล้อง (หน้าปัด, ฝาหลัง, เม็ดมะยม)' : 'High-fidelity 3-angle scan (dial, caseback, profile)',
                lang === 'th' ? 'การลบพื้นหลังรูปถ่ายอัตโนมัติสำหรับตู้สะสม' : 'Automated background removal for perfect showcase',
                lang === 'th' ? 'สร้างใบรับรองและรายงานสแกนนาฬิกาเป็นไฟล์ PDF คุณภาพระดับพรีเมียม' : 'Premium PDF scan report generation & exporting'
              ].map((feat, idx) => (
                <View key={idx} style={styles.featureRow}>
                  <Feather name="check" size={14} color={colors.amber} style={styles.featureIcon} />
                  <Text style={[styles.featureText, { color: '#ECE5D8' }]}>{feat}</Text>
                </View>
              ))}
            </View>

            <Pressable
              style={({ pressed }) => [
                styles.tierActionBtn, 
                styles.tierActionBtnBest, 
                activeTier === 'pro' && styles.tierActionBtnActive,
                pressed && { opacity: 0.8 }
              ]}
              onPress={() => handleSelectTier('pro')}
            >
              <LinearGradient
                colors={['#ECC87A', '#C59A45', '#9A7326']}
                style={StyleSheet.absoluteFillObject}
              />
              {activeTier === 'pro' ? (
                <Text style={[styles.tierActionBtnText, { color: '#000', fontWeight: '900' }]}>{t('membership.currentPlan')}</Text>
              ) : (
                <Text style={[styles.tierActionBtnText, { color: '#000', fontWeight: '900' }]}>
                  {lang === 'th' ? 'สมัครโปรดีลเลอร์เพลน' : 'SELECT PRO DEALER PLAN'}
                </Text>
              )}
            </Pressable>
          </View>

          {/* Tier 3: Premium Executive Plan */}
          <View style={[styles.tierOptionCard, { overflow: 'hidden', borderColor: '#ECC87A', borderWidth: 2.5, shadowColor: '#ECC87A', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.25, shadowRadius: 15 }]}>
            <LinearGradient
              colors={['#181512', '#0A0807', '#1F1A15']}
              style={StyleSheet.absoluteFillObject}
            />

            <View style={styles.tierBadgeWrap}>
              <View style={styles.tierHeaderTop}>
                <Text style={[styles.tierName, { color: '#fff', flexShrink: 1 }]}>{t('membership.vipTitle')}</Text>
                <View style={[styles.tierBadge, { backgroundColor: 'rgba(236, 200, 122, 0.2)', borderColor: '#ECC87A' }]}>
                  <Text style={[styles.tierBadgeText, { color: '#ECC87A' }]}>VIP ELITE 👑</Text>
                </View>
              </View>
              
              <View style={styles.tierPriceSection}>
                <Text style={[styles.tierPrice, { color: '#fff' }]}>{lang === 'th' ? '฿4,990' : '$149.99'}</Text>
                <Text style={[styles.tierPriceUnit, { color: colors.textSecondary }]}>{t('membership.monthly')}</Text>
              </View>
              
              <Text style={[styles.tierDailyEst, { color: colors.amber }]}>
                {t('membership.estimatedDaily')}{lang === 'th' ? '฿166' : '$4.99'}
              </Text>
            </View>

            <View style={styles.featuresList}>
              {[
                lang === 'th' ? 'สิทธิ์การเข้าถึงตรวจสอบ AI แบบลำดับความสำคัญสูงสุด 200 สแกนต่อเดือน' : 'Ultimate priority access up to 200 scans per month',
                lang === 'th' ? 'การแผนที่ความร้อนและการวินิจฉัยแสงเลเซอร์ตัวสลักตราสัญญาลักษณ์' : 'Micro-hallmark optical heatmaps & laser diagnostics',
                lang === 'th' ? 'สแกนความละเอียดสูงระดับสุดยอด 4 มุมกล้อง (หน้าปัด, ฝาหลัง, เม็ดมะยม, สายสาย)' : 'High-fidelity 4-angle scan (adds typography & caliber micro-shots)',
                lang === 'th' ? 'ตู้นิรภัยสำหรับเก็บนาฬิกาไม่จำกัดขนาด พร้อมการบันทึกเอกสารซื้อขายส่วนตัว' : 'Unlimited collection vault size & custom purchase logs',
                lang === 'th' ? 'การสร้างไฟล์รายงานผลสแกนและแชร์ในนามแบรนด์ร้านค้า (ไม่มีลายน้ำ)' : 'Custom branding PDF export without security watermarks'
              ].map((feat, idx) => (
                <View key={idx} style={styles.featureRow}>
                  <Feather name="check" size={14} color={colors.amber} style={styles.featureIcon} />
                  <Text style={styles.featureText}>{feat}</Text>
                </View>
              ))}
            </View>

            <Pressable
              style={({ pressed }) => [
                styles.tierActionBtn, 
                activeTier === 'premium' && styles.tierActionBtnActive,
                pressed && { opacity: 0.8 }
              ]}
              onPress={() => handleSelectTier('premium')}
            >
              {activeTier === 'premium' ? (
                <Text style={[styles.tierActionBtnText, { color: colors.amber }]}>{t('membership.currentPlan')}</Text>
              ) : (
                <Text style={styles.tierActionBtnText}>
                  {lang === 'th' ? 'สมัครวีไอพีเอ็กเซ็กคิวทีฟเพลน' : 'SELECT VIP EXECUTIVE PLAN'}
                </Text>
              )}
            </Pressable>
          </View>

          {/* Section: Pay-Per-Scan Credit Packs */}
          <View style={[styles.creditPacksContainer, { marginTop: spacing.lg }]}>
            <Text style={[styles.upgradeTitle, { fontSize: 20, textAlign: 'center', marginBottom: spacing.xs }]}>
              {t('membership.scanCredits')}
            </Text>
            <Text style={[styles.upgradeSubtitle, { fontSize: 12, marginBottom: spacing.md }]}>
              {t('membership.payPerScan')}
            </Text>

            {/* Credit Pack 1 */}
            <View style={[styles.creditPackCard, { overflow: 'hidden', borderColor: 'rgba(236, 200, 122, 0.15)', borderWidth: 1 }]}>
              <LinearGradient
                colors={['rgba(26, 20, 16, 0.85)', 'rgba(15, 12, 10, 0.92)']}
                style={StyleSheet.absoluteFillObject}
              />
              <View style={styles.creditBadgeWrap}>
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <Text style={styles.creditTitle}>{t('membership.oneScanTitle')}</Text>
                  <Text style={styles.creditDesc}>
                    {lang === 'th' ? 'ตรวจสอบการสลักหน้าปัด เลนส์ขยายวันที่ รายละเอียดเครื่อง และราคาตลาดได้ทันที' : 'Verify dial engraving, date magnifier, caliber finish & value instantly'}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={[styles.creditPrice, { color: colors.amber }]}>฿{Math.round(15.00 * exchangeRate).toLocaleString()}</Text>
                </View>
              </View>
              <Pressable
                style={({ pressed }) => [styles.creditActionBtn, pressed && { opacity: 0.8 }]}
                onPress={() => Alert.alert(t('membership.purchaseSuccess'), t('membership.creditAdded', { count: 1 }))}
              >
                <Text style={styles.creditActionBtnText}>{t('membership.buyScan')}</Text>
              </Pressable>
            </View>

            {/* Credit Pack 2 */}
            <View style={[styles.creditPackCard, { overflow: 'hidden', borderColor: '#ECC87A', borderWidth: 1.2 }]}>
              <LinearGradient
                colors={['rgba(28, 22, 17, 0.9)', 'rgba(18, 14, 10, 0.95)']}
                style={StyleSheet.absoluteFillObject}
              />
              <View style={[styles.saveTag, { backgroundColor: '#ECC87A' }]}>
                <Text style={[styles.saveTagText, { color: '#000' }]}>{t('membership.savePercent', { percent: 13 })}</Text>
              </View>
              <View style={styles.creditBadgeWrap}>
                {/* Apply flex layout fix here */}
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <Text style={[styles.creditTitle, { color: '#ECC87A' }]}>{t('membership.threeScansTitle')}</Text>
                  <Text style={styles.creditDesc}>
                    {lang === 'th' ? `แนะนำเป็นพิเศษเพื่อความสะดวกในการสแกนหลายเรือน (฿${Math.round(13.00 * exchangeRate).toLocaleString()} / สแกน)` : `Highly recommended for quick multi-watch inspections (฿${Math.round(13.00 * exchangeRate).toLocaleString()} / scan)`}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={[styles.creditPrice, { color: '#ECC87A' }]}>฿{Math.round(39.00 * exchangeRate).toLocaleString()}</Text>
                </View>
              </View>
              <Pressable
                style={({ pressed }) => [styles.creditActionBtn, { borderColor: '#ECC87A' }, pressed && { opacity: 0.8 }]}
                onPress={() => Alert.alert(t('membership.purchaseSuccess'), t('membership.creditAdded', { count: 3 }))}
              >
                <Text style={[styles.creditActionBtnText, { color: '#ECC87A' }]}>{t('membership.buyScans', { count: 3 })}</Text>
              </Pressable>
            </View>

            {/* Credit Pack 3 */}
            <View style={[styles.creditPackCard, styles.creditPackCardBest, { overflow: 'hidden', borderColor: '#ECC87A', borderWidth: 1.8 }]}>
              <LinearGradient
                colors={['#2D2316', '#1E160D', '#0F0B06']}
                style={StyleSheet.absoluteFillObject}
              />
              <View style={styles.saveTag}>
                <Text style={styles.saveTagText}>{t('membership.savePercent', { percent: 34 })}</Text>
              </View>
              <View style={styles.creditBadgeWrap}>
                {/* Apply flex layout fix here */}
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <Text style={[styles.creditTitle, { color: colors.amber }]}>{t('membership.tenScansTitle')}</Text>
                  <Text style={[styles.creditDesc, { color: '#ECE5D8' }]}>
                    {lang === 'th' ? `แพ็คเกจราคาที่คุ้มค่าที่สุดสำหรับมืออาชีพและร้านค้า (฿${Math.round(9.90 * exchangeRate).toLocaleString()} / สแกน)` : `The best valuation deal for professional dealers and stores (฿${Math.round(9.90 * exchangeRate).toLocaleString()} / scan)`}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={[styles.creditPrice, { color: colors.amber }]}>฿{Math.round(99.00 * exchangeRate).toLocaleString()}</Text>
                </View>
              </View>
              <Pressable
                style={({ pressed }) => [
                  styles.creditActionBtn, 
                  { backgroundColor: colors.amber, borderColor: colors.amber },
                  pressed && { opacity: 0.8 }
                ]}
                onPress={() => Alert.alert(t('membership.purchaseSuccess'), t('membership.creditAdded', { count: 10 }))}
              >
                <LinearGradient
                  colors={['#ECC87A', '#C59A45', '#9A7326']}
                  style={StyleSheet.absoluteFillObject}
                />
                <Text style={[styles.creditActionBtnText, { color: '#000', fontWeight: '900' }]}>{t('membership.buyScans', { count: 10 })}</Text>
              </Pressable>
            </View>
          </View>
        </SafeAreaView>
      </ScrollView>
    </View>
  );
}

// ==========================================
// 8. OTHER REQUIRED STUB ROUTE SCREENS
// ==========================================
function InfoScreen({ route, navigation }: any) {
  const kind = route?.params?.kind || 'faq';
  return (
    <SafeAreaView style={styles.stubContainer}>
      <Text style={styles.stubTitle}>
        {kind === 'faq' ? 'Frequently Asked Questions' : kind === 'terms' ? 'Terms of Service' : 'Privacy Policy'}
      </Text>
      <ScrollView style={{ flex: 1, marginVertical: spacing.md }}>
        <Text style={styles.stubDetails}>
          {kind === 'faq'
            ? 'Q: How does the AI perform verification?\nA: We utilize high-fidelity computer vision and visual RAG comparison engines to analyze dial proportions, caliber alignment, and surface hallmarks against our reference vault vector datasets.\n\nQ: Is the verification result 100% definitive?\nA: No. This application serves as a high-fidelity visual screening and micro-hallmark verification tool. It is designed to assist collectors and does not replace physical inspection, case-back disassembly, or diagnostic analysis by an authorized Swiss watchmaker or brand boutique.'
            : kind === 'terms'
            ? 'Use of the Luxury Authenticator application is subject to our terms of independent, objective horological assessment. We operate without direct brand affiliations. Reference valuations are dynamically indexed against global collector markets.'
            : 'Your privacy is paramount. Scan images and metadata are processed in highly secured environments. No visual assets or personal telemetry are sold or shared with third-party networks, in strict accordance with Swiss digital privacy standards.'}
        </Text>
      </ScrollView>
      <Pressable style={styles.stubCloseBtn} onPress={() => navigation.goBack()}>
        <Text style={styles.stubCloseBtnText}>RETURN</Text>
      </Pressable>
    </SafeAreaView>
  );
}

function GameScreen({ navigation }: any) {
  const { t, lang } = useLanguage();
  const [score, setScore] = useState(0);
  const [level, setLevel] = useState(1);
  const [busy, setBusy] = useState(false);
  const [timeLeft, setTimeLeft] = useState(30);
  const [hintsRemaining, setHintsRemaining] = useState(1);
  const [hintVisible, setHintVisible] = useState(false);
  const [gamePhase, setGamePhase] = useState<'playing' | 'result' | 'scoreboard'>('playing');
  const [resultType, setResultType] = useState<'correct' | 'incorrect' | 'timeout'>('correct');
  const [speedBonusEarned, setSpeedBonusEarned] = useState(false);

  useEffect(() => {
    if (gamePhase !== 'playing') return;

    const timer = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          clearInterval(timer);
          handleTimeout();
          return 0;
        }
        return t - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [level, gamePhase]);

  const handleGuess = (choice: 'A' | 'B') => {
    if (busy || gamePhase !== 'playing') return;
    setBusy(true);

    const details = getCaliberDetails();
    const correct = choice === details.correctCaliber;
    
    const isSpeedy = timeLeft > 20; // Answered within 10 seconds
    const ptsEarned = correct ? (10 + (isSpeedy ? 5 : 0)) : 0;
    
    setScore((s) => s + ptsEarned);
    setSpeedBonusEarned(isSpeedy);
    setResultType(correct ? 'correct' : 'incorrect');
    setGamePhase('result');
    setBusy(false);
  };

  const handleTimeout = () => {
    setSpeedBonusEarned(false);
    setResultType('timeout');
    setGamePhase('result');
  };

  // Get active caliber details
  const getCaliberDetails = () => {
    switch (level) {
      case 1:
        return {
          title: 'ROLEX SUBMARINER REF. 126610LN',
          subtitle: 'Caliber 3235 Verification',
          imageUrl: 'https://images.unsplash.com/photo-1547996160-81dfa63595aa?auto=format&fit=crop&w=400&q=80',
          correctCaliber: 'A' as const,
          hint: 'Examine the hairspring. Genuine Rolex Caliber 3235 utilizes a blue Parachrom hairspring, whereas reproductions use standard steel.',
          insight: 'Rolex Caliber 3235 is highly anti-magnetic due to the patented blue Parachrom hairspring. It features flawlessly mirror-polished and chamfered bridge bevels, and gold Microstella regulating nuts. Reproductions exhibit coarse stamped bridges, standard steel hairsprings, and shallow gold-plating bleed.',
          calA: {
            title: 'CALIBER A (GENUINE)',
            desc: [
              '• Anti-magnetic blue Parachrom hairspring',
              '• High-performance Paraflex shock absorbers',
              '• Meticulously mirror-polished and chamfered bridge bevels',
              '• Four gold Microstella regulating nuts on the balance wheel',
              '• Deeply engraved, perfectly filled gold-gilt inscriptions'
            ]
          },
          calB: {
            title: 'CALIBER B (REPRODUCTION)',
            desc: [
              '• Standard silver alloy hairspring sensitive to magnetic fields',
              '• Generic shock absorber mimicking standard Incabloc design',
              '• Coarse, stamped bridges showing prominent tooling marks',
              '• Exposed regulator pin adjusting lever for rate calibration',
              '• Shallow, unevenly painted inscriptions with gold-plating bleed'
            ]
          }
        };
      case 2:
        return {
          title: 'AUDEMARS PIGUET ROYAL OAK 15500ST',
          subtitle: 'Caliber 4302 Verification',
          imageUrl: 'https://images.unsplash.com/photo-1522312346375-d1a52e2b99b3?auto=format&fit=crop&w=400&q=80',
          correctCaliber: 'B' as const,
          hint: 'Look closely at the rotor ball bearings. Genuine Audemars Piguet Caliber 4302 has silent, premium ceramic ball bearings.',
          insight: 'Audemars Piguet Caliber 4302 is equipped with an integrated 22k gold hand-skeletonized oscillating weight and rotates silently on specialized high-grade ceramic ball bearings. Replicas use cheap steel ball bearings (creating loud mechanical noise) and gold-plated brass rotors with shallow, machine-chattered lines.',
          calA: {
            title: 'CALIBER A (REPRODUCTION)',
            desc: [
              '• Gold-plated brass oscillating weight with insufficient heft',
              '• Rounded AP logo with soft, indistinct edge profiles',
              '• Coarse, shallow Côtes de Genève stripes with machine chatter',
              '• Regulator pin tail visible above the balance wheel jewel',
              '• Rough steel ball bearings generating noisy rotor oscillation'
            ]
          },
          calB: {
            title: 'CALIBER B (GENUINE)',
            desc: [
              '• Hand-skeletonized 22K gold oscillating weight with pristine finish',
              '• Pristine, razor-sharp anglage and hand-polished bevel edges',
              '• Deep, vivid Côtes de Genève reflecting light in silk-like waves',
              '• Free-sprung balance wheel with variable inertia blocks',
              '• High-grade ceramic ball bearing assembly offering silent rotation'
            ]
          }
        };
      case 3:
      default:
        return {
          title: 'PATEK PHILIPPE NAUTILUS 5711/1A',
          subtitle: 'Caliber 324 S C Verification',
          imageUrl: 'https://images.unsplash.com/photo-1614162692292-7ac56d7f7f1e?auto=format&fit=crop&w=400&q=80',
          correctCaliber: 'A' as const,
          hint: 'Spot the Hallmark seal. Patek Philippe Nautilus has a hand-finished Geneva or PP seal with pristine anglage on beveled flanks.',
          insight: 'Patek Philippe Caliber 324 S C bears the prestigious PP Seal, showcasing hand-polished anglage, concentric circular graining (perlage), and a black silicon Spiromax balance spring. Replicas are usually based on cheap modified Miyota 9015 movements with rough, decorative overlay plates glued together.',
          calA: {
            title: 'CALIBER A (GENUINE)',
            desc: [
              '• Deeply stamped Patek Philippe (PP) Seal with hand-polished anglage',
              '• Spiromax balance spring with black silicon surface protection',
              '• Concentric Circular Graining (perlage) on the main plate base',
              '• Gyromax balance wheel with adjustable gold inertia blocks',
              '• Ultra-thin caliber profile with mirror-polished beveled flanks'
            ]
          },
          calB: {
            title: 'CALIBER B (REPRODUCTION)',
            desc: [
              '• Modified Miyota 9015 movement with decorative overlay plates',
              '• Weakly stamped brand markings with glue residue on plastic ring',
              '• Synthetic bright pink jewel bearings without proper lubrication',
              '• Faux PP Seal plate held by adhesive, slightly misaligned',
              '• Oscillating weight with raw, unchamfered interior cutouts'
            ]
          }
        };
    }
  };

  const details = getCaliberDetails();
  const accuracy = Math.round((score / 45) * 100);
  
  const getRank = () => {
    if (score >= 40) {
      return { 
        title: lang === 'th' ? '👑 แกรนด์มาสเตอร์ผู้เชี่ยวชาญการผลิต' : '👑 GRANDMASTER HOROLOGIST', 
        desc: lang === 'th' 
          ? 'ความแม่นยำไร้ที่ติ สายตาของคุณในการสแกนตรวจสอบตราประทับ รายละเอียดการขัดแต่ง และโครงสร้างกลไกมีความแม่นยำเทียบเท่าปรมาจารย์ช่างนาฬิกาสวิสในเจนีวา' 
          : 'Flawless precision. Your eye for micro-hallmarks, finishing anomalies, and caliber balance configurations matches the top Swiss master watchmakers in Geneva.' 
      };
    }
    if (score >= 30) {
      return { 
        title: lang === 'th' ? '💎 ช่างทำนาฬิกาขั้นปรมาจารย์' : '💎 MASTER WATCHMAKER', 
        desc: lang === 'th'
          ? 'ความแม่นยำยอดเยี่ยม คุณมีสายตาที่เฉียบคมอย่างมาก สามารถแยกแยะความก้าวหน้าวัสดุใยสปริงและตลับลูกปืนเซรามิกของ AP ได้อย่างง่ายดาย'
          : 'Superb precision. You have an extremely sharp horological eye, noticing hairspring composition and AP ceramic bearing alignments with ease.' 
      };
    }
    if (score >= 20) {
      return { 
        title: lang === 'th' ? '🔍 นักประเมินอาวุโส' : '🔍 SENIOR APPRAISER', 
        desc: lang === 'th'
          ? 'ทักษะการตรวจสอบความแท้ดีมาก คุณสามารถระบุความผิดปกติพื้นฐานของการลอกเลียนแบบเครื่องนาฬิกาได้ดี แต่อาจพลาดในบางจังหวะที่เวลาจำกัด'
          : 'Skilled visual assessment. You easily identify basic movement reproduction anomalies but missed a few speedy judgments.' 
      };
    }
    if (score >= 10) {
      return { 
        title: lang === 'th' ? '🗃️ ผู้เชี่ยวชาญตู้นิรภัยสะสม' : '🗃️ VAULT SPECIALIST', 
        desc: lang === 'th'
          ? 'การตรวจสอบผ่านเกณฑ์ดี คุณเข้าใจการทำงานของฟันเฟืองจักรกลนาฬิกาหรู แต่อาจมีรายละเอียดตราประทับบางจุดที่เล็ดลอดสายตาไป'
          : 'Adequate assessment. You have a solid grasp of luxury watch movements, though some subtle stamp and engraving flaws slipped past.' 
      };
    }
    return { 
      title: lang === 'th' ? '🪵 นักสะสมมือสมัครเล่น' : '🪵 APPRENTICE COLLECTOR', 
      desc: lang === 'th'
        ? 'เพิ่งเริ่มต้นการเดินทางสู่โลกนาฬิกาหรู แนะนำให้ศึกษาลักษณะของใยสปริง Parachrom และความต่างของกลไก Miyota ในตู้เก็บข้อมูลเพิ่มเติมครับ'
        : 'Beginning your journey. Take some time to study standard Parachrom hairsprings and Miyota mod plate layouts in the Vault archives.' 
    };
  };

  const rank = getRank();

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <LinearGradient
        colors={['#1E120A', '#0A0805']}
        style={StyleSheet.absoluteFillObject}
      />
      
      {/* SCOREBOARD PHASE OVERLAY */}
      {gamePhase === 'scoreboard' ? (
        <View style={styles.scoreboardContainer}>
          <LinearGradient
            colors={['#1F130B', '#080604']}
            style={StyleSheet.absoluteFillObject}
          />
          <ScrollView contentContainerStyle={{ padding: spacing.lg, alignItems: 'center', gap: spacing.md, paddingBottom: spacing.xxl }}>
            <Feather name="award" size={48} color={colors.amber} style={{ marginTop: 40 }} />
            <Text style={styles.scoreboardHeaderTitle}>
              {lang === 'th' ? 'รายงานผลการวิเคราะห์สายตา' : 'CALIBRATION REPORT'}
            </Text>
            <Text style={styles.scoreboardHeaderSubtitle}>
              {lang === 'th' ? 'รายงานผลการประเมินจากผู้เชี่ยวชาญสากล' : 'OFFICIAL APPRAISER ASSESSMENT'}
            </Text>

            {/* Metrics Ring Card */}
            <View style={styles.scoreboardMetricsCard}>
              <LinearGradient
                colors={['rgba(236, 200, 122, 0.08)', 'rgba(0, 0, 0, 0.4)']}
                style={StyleSheet.absoluteFillObject}
              />
              <View style={{ alignItems: 'center', marginVertical: 12 }}>
                <Text style={{ fontSize: 42, fontWeight: '900', color: colors.amber }}>{score}</Text>
                <Text style={{ fontSize: 10, color: colors.textMuted, fontWeight: '800', letterSpacing: 1.5 }}>
                  {lang === 'th' ? 'คะแนนความน่าเชื่อถือรวม' : 'TOTAL CREDIBILITY SCORE'}
                </Text>
              </View>
              <View style={{ height: 1, backgroundColor: 'rgba(236, 200, 122, 0.15)', width: '100%', marginVertical: 8 }} />
              <View style={{ flexDirection: 'row', justifyContent: 'space-around', width: '100%', paddingVertical: 4 }}>
                <View style={{ alignItems: 'center' }}>
                  <Text style={{ fontSize: 18, fontWeight: '800', color: '#fff' }}>{accuracy}%</Text>
                  <Text style={{ fontSize: 9, color: colors.textSecondary }}>
                    {lang === 'th' ? 'อัตราความเที่ยงตรง' : 'ACCURACY RATE'}
                  </Text>
                </View>
                <View style={{ alignItems: 'center' }}>
                  <Text style={{ fontSize: 18, fontWeight: '800', color: '#fff' }}>{score >= 35 ? '3 / 3' : score >= 20 ? '2 / 3' : score >= 10 ? '1 / 3' : '0 / 3'}</Text>
                  <Text style={{ fontSize: 9, color: colors.textSecondary }}>
                    {lang === 'th' ? 'การทดสอบที่ผ่าน' : 'DIAGNOSTICS PASSED'}
                  </Text>
                </View>
              </View>
            </View>

            {/* Rank Card */}
            <View style={styles.rankCard}>
              <LinearGradient
                colors={['rgba(30, 22, 17, 0.95)', 'rgba(18, 14, 10, 0.98)']}
                style={StyleSheet.absoluteFillObject}
              />
              <Text style={styles.rankTitle}>{rank.title}</Text>
              <Text style={styles.rankDesc}>{rank.desc}</Text>
            </View>

            {/* Action Row */}
            <View style={{ width: '100%', gap: spacing.md, marginTop: spacing.md }}>
              <Pressable 
                style={styles.gameContinueBtn} 
                onPress={() => {
                  setScore(0);
                  setLevel(1);
                  setTimeLeft(30);
                  setHintsRemaining(1);
                  setHintVisible(false);
                  setGamePhase('playing');
                }}
              >
                <LinearGradient
                  colors={['#ECC87A', '#C59A45', '#9A7326']}
                  style={StyleSheet.absoluteFillObject}
                />
                <Text style={styles.gameContinueBtnText}>
                  {lang === 'th' ? 'ปรับจูนใหม่ / เล่นอีกครั้ง' : 'RE-CALIBRATE / PLAY AGAIN'}
                </Text>
              </Pressable>

              <Pressable 
                style={styles.returnVaultBtn} 
                onPress={() => navigation.goBack()}
              >
                <Text style={styles.returnVaultBtnText}>
                  {lang === 'th' ? 'กลับสู่ตู้สะสมนิรภัย' : 'RETURN TO VAULT'}
                </Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      ) : (
        <ScrollView style={styles.gameContainer} contentContainerStyle={styles.gameContent}>
          <StatusBar style="light" />
          <SafeAreaView style={styles.safeAreaZero} edges={['top']}>
            {/* Header Bar */}
            <View style={styles.gameHeaderRow}>
              <Pressable style={styles.gameCloseBtn} onPress={() => navigation.goBack()}>
                <Feather name="arrow-left" size={24} color="#fff" />
              </Pressable>
              <View style={{ flex: 1, alignItems: 'center', marginRight: 40 }}>
                <Text style={styles.gameHeaderTitle}>
                  {lang === 'th' ? 'ฝึกฝนสายตานักสะสม' : 'Horological Eye Calibration'}
                </Text>
                <Text style={styles.gameHeaderSubtitle}>
                  {lang === 'th' ? 'เกมประเมินความแม่นยำ' : 'COLLECTOR CALIBRATION GAME'}
                </Text>
              </View>
            </View>

            {/* Visual Circular Watch Photo Header (magnifying view) */}
            <View style={styles.gameWatchHeaderSection}>
              <View style={[styles.watchDialOuterRing, { borderColor: '#ECC87A', borderWidth: 2, overflow: 'hidden' }]}>
                {details.imageUrl ? (
                  <Image
                    source={{ uri: details.imageUrl }}
                    style={StyleSheet.absoluteFillObject}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={[StyleSheet.absoluteFillObject, { backgroundColor: '#13100C', justifyContent: 'center', alignItems: 'center' }]}>
                    <Feather name="image" size={32} color="rgba(236, 200, 122, 0.3)" />
                  </View>
                )}
                {/* Thin gold inner overlay to resemble loupe glass lens */}
                <View style={{
                  position: 'absolute',
                  top: 4, left: 4, right: 4, bottom: 4,
                  borderRadius: 120,
                  borderWidth: 0.75,
                  borderColor: 'rgba(236, 200, 122, 0.35)',
                  backgroundColor: 'transparent'
                }} />
              </View>
              <View style={styles.gameProgressRow}>
                <Text style={styles.gameProgressText}>
                  {lang === 'th' ? 'ระดับนักสะสม: ' : 'Calibration Tier: '}
                  {score >= 35 ? (lang === 'th' ? 'ช่างทำนาฬิกาขั้นปรมาจารย์' : 'MASTER WATCHMAKER') : score >= 20 ? (lang === 'th' ? 'ผู้เชี่ยวชาญตู้สะสม' : 'VAULT SPECIALIST') : (lang === 'th' ? 'นักสะสมมือสมัครเล่น' : 'APPRENTICE COLLECTOR')}
                </Text>
                <Text style={styles.gameProgressCounter}>
                  {lang === 'th' ? 'ด่านที่ ' : 'Diagnostic '}{level} / 3
                </Text>
              </View>
              {/* Step markers */}
              <View style={styles.gameStepIndicatorRow}>
                {[1, 2, 3].map((step) => (
                  <View 
                    key={step} 
                    style={[
                      styles.gameStepDot, 
                      level === step && styles.gameStepDotActive,
                      level > step && styles.gameStepDotCompleted
                    ]} 
                  />
                ))}
              </View>
            </View>

            {/* Target Watch Card (Text-only now for clean minimalist look) */}
            <View style={[styles.gameWatchInfoCard, { borderColor: 'rgba(236, 200, 122, 0.35)', borderWidth: 1, padding: 14, alignItems: 'center' }]}>
              <LinearGradient
                colors={['rgba(28, 22, 17, 0.95)', 'rgba(18, 14, 10, 0.98)']}
                style={StyleSheet.absoluteFillObject}
              />
              <View style={{ width: '100%', alignItems: 'center' }}>
                <View style={styles.gameWatchInfoHead}>
                  <Feather name="crosshair" size={14} color={colors.amber} style={{ marginRight: 6 }} />
                  <Text style={styles.gameWatchTitle} numberOfLines={1}>{details.title}</Text>
                </View>
                <Text style={[styles.gameWatchSubtitle, { textAlign: 'center', marginTop: 4 }]}>{details.subtitle}</Text>
              </View>
            </View>

            {/* Accuracy Points & Timer HUD Bar at the Bottom */}
            <View style={[styles.gameStatsHudRow, { borderColor: 'rgba(236, 200, 122, 0.25)', borderWidth: 1 }]}>
              <LinearGradient
                colors={['rgba(30, 24, 20, 0.9)', 'rgba(12, 10, 8, 0.95)']}
                style={StyleSheet.absoluteFillObject}
              />
              
              {/* Accuracy Points Dial */}
              <View style={styles.hudStatBox}>
                <Feather name="award" size={14} color={colors.amber} style={{ marginRight: 6 }} />
                <Text style={styles.hudStatLabel}>
                  {lang === 'th' ? 'ความเที่ยงตรง:' : 'ACCURACY:'}
                </Text>
                <Text style={styles.hudStatValue}>{score} PTS</Text>
              </View>

              {/* Elegant Divider */}
              <View style={{ width: 1, height: 14, backgroundColor: 'rgba(236, 200, 122, 0.2)' }} />

              {/* Ticking Timer */}
              <View style={styles.hudStatBox}>
                <Feather 
                  name="clock" 
                  size={13} 
                  color={timeLeft <= 10 ? '#E03E3E' : colors.amber} 
                  style={{ marginRight: 6 }} 
                />
                <Text style={styles.hudStatLabel}>
                  {lang === 'th' ? 'เวลาที่เหลือ:' : 'TIME LEFT:'}
                </Text>
                <Text style={[
                  styles.hudStatValue,
                  timeLeft <= 10 && { color: '#E03E3E' }
                ]}>
                  {timeLeft}s
                </Text>
              </View>
            </View>

            {/* Loupe Hint Activator */}
            {hintsRemaining > 0 && !hintVisible && gamePhase === 'playing' && (
              <Pressable style={styles.hintBtn} onPress={() => {
                setHintsRemaining(0);
                setHintVisible(true);
              }}>
                <Feather name="search" size={14} color="#000" style={{ marginRight: 6 }} />
                <Text style={styles.hintBtnText}>🔍 ACTIVATE LOUPE INSPECTION HINT (1 Left)</Text>
              </Pressable>
            )}

            {/* Loupe Hint Content Card */}
            {hintVisible && gamePhase === 'playing' && (
              <View style={styles.hintCard}>
                <LinearGradient
                  colors={['rgba(236, 200, 122, 0.15)', 'rgba(236, 200, 122, 0.05)']}
                  style={StyleSheet.absoluteFillObject}
                />
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                  <Feather name="zoom-in" size={14} color={colors.amber} style={{ marginRight: 6 }} />
                  <Text style={{ fontSize: 12, fontWeight: '800', color: colors.amber, letterSpacing: 0.5 }}>
                    {lang === 'th' ? 'เปิดใช้งานคำใบ้กล้องส่อง Loupe สำเร็จ' : 'LOUPE HALLMARK HINT ACTIVATED'}
                  </Text>
                </View>
                <Text style={styles.hintText}>{details.hint}</Text>
              </View>
            )}

            {/* Dynamic Comparison specs or Custom Inline Result Overlay Card */}
            {gamePhase === 'result' ? (
              <View style={styles.resultOverlayCard}>
                <LinearGradient
                  colors={['#1E1611', '#0A0806']}
                  style={StyleSheet.absoluteFillObject}
                />
                
                {/* Status Header */}
                <View style={[
                  styles.resultCardHeader,
                  resultType === 'correct' ? { borderColor: colors.success } : resultType === 'timeout' ? { borderColor: '#E07A2F' } : { borderColor: '#E03E3E' }
                ]}>
                  <Feather 
                    name={resultType === 'correct' ? 'check-circle' : resultType === 'timeout' ? 'clock' : 'alert-circle'} 
                    size={36} 
                    color={resultType === 'correct' ? colors.success : resultType === 'timeout' ? '#E07A2F' : '#E03E3E'} 
                    style={{ marginBottom: 10 }} 
                  />
                  <Text style={[
                    styles.resultCardTitle,
                    { color: resultType === 'correct' ? colors.success : resultType === 'timeout' ? '#E07A2F' : '#E03E3E' }
                  ]}>
                    {resultType === 'correct' 
                      ? (lang === 'th' ? 'การวินิจฉัยถูกต้อง! 🎉' : 'CORRECT DIAGNOSIS! 🎉') 
                      : resultType === 'timeout' 
                      ? (lang === 'th' ? 'หมดเวลาการวินิจฉัย ⚠️' : 'DIAGNOSTIC TIMEOUT ⚠️') 
                      : (lang === 'th' ? 'วิเคราะห์ตรวจพบของปลอม! 😢' : 'REPLICA DETECTED 😢')}
                  </Text>
                  <Text style={styles.resultCardSub}>
                    {resultType === 'correct' 
                      ? (lang === 'th' ? 'เทียบจูนระดับสำเร็จ คุณแยกแยะงานขัดและจุดเด่นของเครื่องแท้ได้สมบูรณ์!' : 'Successfully calibrated. You identified the genuine caliber finishing details!')
                      : resultType === 'timeout'
                      ? (lang === 'th' ? 'ระยะเวลาการวิเคราะห์สิ้นสุดลงแล้ว! ยอดช่างต้องประเมินด้วยความรวดเร็ว' : "Assessment period expired! Switzerland's elite watchmakers must act with speed.")
                      : (lang === 'th' ? 'คุณมองข้ามรอยสลักตัวอักษรกลไกที่ไม่สมบูรณ์หรือการขัดแต่งขอบเฟืองราคาถูกไป' : 'Faux caliber markings or coarse mechanical bevelings were overlooked.')}
                  </Text>
                </View>

                {/* Points Card */}
                <View style={styles.resultScoreContainer}>
                  <Text style={[styles.resultScoreValue, resultType !== 'correct' && { color: colors.textSecondary }]}>
                    {resultType === 'correct' ? (lang === 'th' ? '+10 คะแนนความแม่นยำ' : '+10 Accuracy Pts') : '+0 Pts'}
                  </Text>
                  {resultType === 'correct' && speedBonusEarned && (
                    <View style={styles.speedBonusBadge}>
                      <LinearGradient
                        colors={['#ECC87A', '#C59A45']}
                        style={StyleSheet.absoluteFillObject}
                      />
                      <Feather name="zap" size={10} color="#000" style={{ marginRight: 4 }} />
                      <Text style={styles.speedBonusText}>
                        {lang === 'th' ? '+5 คะแนนโบนัสตอบเร็ว' : '+5 SPEED RUN BONUS'}
                      </Text>
                    </View>
                  )}
                </View>

                {/* Educational Insight Panel */}
                <View style={styles.explanationSection}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                    <Feather name="book-open" size={13} color={colors.amber} style={{ marginRight: 6 }} />
                    <Text style={styles.explanationTitle}>
                      {lang === 'th' ? 'รายงานผลการประเมินจากผู้เชี่ยวชาญ' : 'HOROLOGICAL INSIGHT ANALYSIS'}
                    </Text>
                  </View>
                  <Text style={styles.explanationText}>{details.insight}</Text>
                </View>

                {/* Continue Action */}
                <Pressable 
                  style={styles.gameContinueBtn} 
                  onPress={() => {
                    if (level < 3) {
                      setLevel(level + 1);
                      setTimeLeft(30);
                      setHintVisible(false);
                      setGamePhase('playing');
                    } else {
                      setGamePhase('scoreboard');
                    }
                  }}
                >
                  <LinearGradient
                    colors={['#ECC87A', '#C59A45', '#9A7326']}
                    style={StyleSheet.absoluteFillObject}
                  />
                  <Text style={styles.gameContinueBtnText}>
                    {level < 3 
                      ? (lang === 'th' ? 'ด่านถัดไป ➔' : 'PROCEED TO NEXT DIAGNOSTIC ➔') 
                      : (lang === 'th' ? 'ดูรายงานผลประเมินรวม ➔' : 'VIEW CALIBRATION REPORT ➔')}
                  </Text>
                </Pressable>
              </View>
            ) : (
              /* Split-Screen Caliber spec list layout */
              <View style={styles.comparisonGridRow}>
                {/* Caliber A Card */}
                <View style={[styles.caliberHalfCard, { borderColor: 'rgba(236, 200, 122, 0.15)', borderWidth: 1 }]}>
                  <LinearGradient
                    colors={['rgba(30, 24, 20, 0.8)', 'rgba(18, 14, 12, 0.95)']}
                    style={StyleSheet.absoluteFillObject}
                  />
                  <View style={styles.caliberCardHeader}>
                    <Feather name="settings" size={13} color={colors.amber} style={{ marginRight: 5 }} />
                    <Text style={styles.caliberCardTitle}>{details.calA.title}</Text>
                  </View>
                  <View style={styles.caliberSpecList}>
                    {details.calA.desc.map((bullet, idx) => (
                      <Text key={idx} style={styles.caliberBulletText}>{bullet}</Text>
                    ))}
                  </View>
                  <Pressable 
                    style={({ pressed }) => [
                      styles.caliberSelectBtn,
                      pressed && { opacity: 0.8 }
                    ]}
                    onPress={() => handleGuess('A')}
                  >
                    <LinearGradient
                      colors={['#ECC87A', '#C59A45', '#9A7326']}
                      style={StyleSheet.absoluteFillObject}
                    />
                    <Text style={styles.caliberSelectBtnText}>
                      {lang === 'th' ? 'เลือกกลไก A' : 'SELECT CALIBER A'}
                    </Text>
                  </Pressable>
                </View>

                {/* Caliber B Card */}
                <View style={[styles.caliberHalfCard, { borderColor: 'rgba(236, 200, 122, 0.15)', borderWidth: 1 }]}>
                  <LinearGradient
                    colors={['rgba(30, 24, 20, 0.8)', 'rgba(18, 14, 12, 0.95)']}
                    style={StyleSheet.absoluteFillObject}
                  />
                  <View style={styles.caliberCardHeader}>
                    <Feather name="settings" size={13} color={colors.amber} style={{ marginRight: 5 }} />
                    <Text style={styles.caliberCardTitle}>{details.calB.title}</Text>
                  </View>
                  <View style={styles.caliberSpecList}>
                    {details.calB.desc.map((bullet, idx) => (
                      <Text key={idx} style={styles.caliberBulletText}>{bullet}</Text>
                    ))}
                  </View>
                  <Pressable 
                    style={({ pressed }) => [
                      styles.caliberSelectBtn,
                      pressed && { opacity: 0.8 }
                    ]}
                    onPress={() => handleGuess('B')}
                  >
                    <LinearGradient
                      colors={['#ECC87A', '#C59A45', '#9A7326']}
                      style={StyleSheet.absoluteFillObject}
                    />
                    <Text style={styles.caliberSelectBtnText}>
                      {lang === 'th' ? 'เลือกกลไก B' : 'SELECT CALIBER B'}
                    </Text>
                  </Pressable>
                </View>
              </View>
            )}

            {/* Bottom helper notice */}
            <View style={styles.gameHelperCard}>
              <Feather name="info" size={14} color={colors.amber} style={{ marginTop: 2, marginRight: 6 }} />
              <Text style={styles.gameHelperText}>
                Carefully inspect movement anglage, Côtes de Genève finishing, magnetic shielding, and hallmark engravings to differentiate authentic movements at a 1:1 level.
              </Text>
            </View>
          </SafeAreaView>
        </ScrollView>
      )}
    </View>
  );
}

// Additional stubs for other unused routes
const DummyScreen = (title: string) => ({ navigation }: any) => (
  <SafeAreaView style={styles.stubContainer}>
    <Text style={styles.stubTitle}>{title}</Text>
    <Text style={styles.stubDetails}>This feature is scheduled for release in the upcoming Phase 2 updates.</Text>
    <Pressable style={styles.stubCloseBtn} onPress={() => navigation.goBack()}>
      <Text style={styles.stubCloseBtnText}>RETURN</Text>
    </Pressable>
  </SafeAreaView>
);

// Tab Navigator Setup
function MainTabNavigator() {
  const { t } = useLanguage();
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#0F0C09',
          borderTopWidth: 1,
          borderTopColor: colors.border,
          height: 64,
          paddingBottom: 8,
          paddingTop: 8,
        },
        tabBarActiveTintColor: colors.amber,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarIcon: ({ color, size }) => {
          let iconName: any = 'home';
          if (route.name === 'Home') iconName = 'home';
          else if (route.name === 'Collection') iconName = 'briefcase';
          else if (route.name === 'Portfolio') iconName = 'pie-chart';
          else if (route.name === 'Magazine') iconName = 'book-open';
          else if (route.name === 'Settings') iconName = 'settings';
          return <Feather name={iconName} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} options={{ tabBarLabel: t('tabs.home') }} />
      <Tab.Screen name="Collection" component={CollectionScreen} options={{ tabBarLabel: t('tabs.collection') }} />
      <Tab.Screen name="Portfolio" component={PortfolioScreen} options={{ tabBarLabel: t('tabs.portfolio') }} />
      <Tab.Screen name="Magazine" component={MagazineScreen} options={{ tabBarLabel: t('tabs.magazine') }} />
      <Tab.Screen name="Settings" component={SettingsScreen} options={{ tabBarLabel: t('tabs.settings') }} />
    </Tab.Navigator>
  );
}

// ==========================================
// 9. ROOT APP MAIN COMPONENT
// ==========================================
export default function App() {
  const [appTierKey, setAppTierKey] = useState<string>('free');

  useEffect(() => {
    // Sync active tier for navigation container rebuilding on dev bar switches
    getMembership().then((m) => {
      setAppTierKey(m.tier);
    });

    globalUpdateAppTier = (tier: MembershipTier) => {
      setAppTierKey(tier);
    };

    return () => {
      globalUpdateAppTier = null;
    };
  }, []);

  return (
    <LanguageProvider>
      <SafeAreaProvider>
        <NavigationContainer key={appTierKey}>
          <Stack.Navigator
            screenOptions={{
              headerShown: false,
              animation: 'slide_from_right',
            }}
            initialRouteName="Splash"
          >
            {/* Main Core Scanning Flow */}
            <Stack.Screen name="Splash" component={SplashScreen} />
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="Main" component={MainTabNavigator} />
            
            <Stack.Screen name="Scan" component={ScanScreen} />
            <Stack.Screen name="Loading" component={LoadingScreen} />
            <Stack.Screen name="Result" component={ResultScreen} />

            {/* Core App Upgrade Screens */}
            <Stack.Screen name="Membership" component={MembershipScreen} />
            <Stack.Screen name="Subscription" component={MembershipScreen} />

            {/* Sub-Stubs and Utilities */}
            <Stack.Screen name="Info" component={InfoScreen} />
            <Stack.Screen name="Game" component={GameScreen} />
            <Stack.Screen name="RefCompare" component={DummyScreen('Horological Comparison')} />
            <Stack.Screen name="ResultDetail" component={DummyScreen('In-Depth Authentication Analytics')} />
            <Stack.Screen name="CollectionGoals" component={DummyScreen('Collector Portfolio Milestones')} />
            <Stack.Screen name="Transactions" component={DummyScreen('Asset Transactions Log')} />
            <Stack.Screen name="TrayDetail" component={DummyScreen('Brand Vault Trays')} />
            <Stack.Screen name="Articles" component={DummyScreen('Horology Academy')} />
            <Stack.Screen name="ArticleDetail" component={DummyScreen('Academy Article')} />
            <Stack.Screen name="News" component={DummyScreen('Industry News')} />
            <Stack.Screen name="DeviceInfo" component={DummyScreen('System Diagnostics')} />
            <Stack.Screen name="PrivacySettings" component={DummyScreen('Privacy Preferences')} />
            <Stack.Screen name="ManageAccount" component={DummyScreen('Collector Profile Credentials')} />
            <Stack.Screen name="Profile" component={DummyScreen('User Portfolio Profile')} />
            <Stack.Screen name="ImageCredits" component={DummyScreen('Scan Credits & Entitlements')} />
            <Stack.Screen name="AIQA" component={DummyScreen('AI Horology Inquiries')} />
            <Stack.Screen name="AuthGuide" component={DummyScreen('Authenticity Reference Library')} />
            <Stack.Screen name="AuthGuideList" component={DummyScreen('Reference Library Index')} />
            <Stack.Screen name="AdminDashboard" component={DummyScreen('System Administrator Console')} />
            <Stack.Screen name="ErrorReport" component={DummyScreen('Diagnostic Error Report')} />
            <Stack.Screen name="Capture" component={DummyScreen('Timepiece Image Capture')} />
          </Stack.Navigator>
        </NavigationContainer>
      </SafeAreaProvider>
    </LanguageProvider>
  );
}

// ==========================================
// 10. LUXURY PREMIUM TYPOGRAPHY AND STYLE
// ==========================================
const { width: screenW, height: screenH } = Dimensions.get('window');

const styles = StyleSheet.create({
  scrollGrow: { flexGrow: 1 },
  safeAreaZero: { flex: 1 },

  // Added luxury components styles
  heroSubDescBilingual: {
    fontSize: 10,
    color: 'rgba(0, 0, 0, 0.65)',
    fontWeight: '600',
    marginTop: 4,
  },
  heroArrowWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  statBoxHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  statSubTextLabel: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
  },
  gamePlayCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(236, 200, 122, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  splashLogoOuterBorder: {
    width: 160,
    height: 160,
    borderRadius: 80,
    borderWidth: 2.5,
    borderColor: 'rgba(236, 200, 122, 0.45)', // outer gold ring
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.lg,
    backgroundColor: 'rgba(236, 200, 122, 0.03)',
  },
  splashLogoInnerBorder: {
    width: 146,
    height: 146,
    borderRadius: 73,
    borderWidth: 1.5,
    borderColor: '#ECC87A', // inner hairline gold ring
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Splash styling
  splashContainer: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.xxl,
  },
  splashGraphicWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
  },
  tourbillonBackground: {
    position: 'absolute',
    alignSelf: 'center',
  },
  splashIconOutline: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 2,
    borderColor: 'rgba(236, 200, 122, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.xl,
    backgroundColor: 'rgba(236, 200, 122, 0.05)',
  },
  splashLogoImage: {
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 2.5,
    borderColor: 'rgba(236, 200, 122, 0.65)',
    marginBottom: spacing.lg,
    backgroundColor: '#0A0806',
  },
  crownDot: {
    position: 'absolute',
    top: 10,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.amber,
  },
  splashTitle: {
    fontSize: 40,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: 4,
    lineHeight: 48,
  },
  splashSubtitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.amber,
    letterSpacing: 8,
    marginTop: spacing.xs,
    lineHeight: 18,
  },
  splashDivider: {
    width: 48,
    height: 2,
    backgroundColor: 'rgba(236, 200, 122, 0.35)',
    marginVertical: spacing.lg,
  },
  splashDescription: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: spacing.xl,
  },
  splashFooter: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  splashFooterText: {
    ...typography.small,
    color: colors.textMuted,
    letterSpacing: 1.5,
  },

  loginLogoOuterBorder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 2,
    borderColor: 'rgba(236, 200, 122, 0.45)', // outer gold ring
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
    backgroundColor: 'rgba(236, 200, 122, 0.03)',
    position: 'relative',
  },
  loginLogoInnerBorder: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 1.5,
    borderColor: '#ECC87A', // inner hairline gold ring
    justifyContent: 'center',
    alignItems: 'center',
  },
  loginPremiumBtn: {
    height: 52,
    borderRadius: radius.md,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: spacing.md,
    overflow: 'hidden',
  },
  loginPremiumBtnText: {
    color: '#0A0805', // dark premium text color
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 2,
  },

  // Login styling
  loginContainer: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loginContent: {
    padding: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: screenH - 80,
  },
  loginHeader: {
    alignItems: 'center',
    marginBottom: spacing.xxl,
  },
  loginLogo: {
    marginBottom: spacing.md,
  },
  loginLogoContainer: {
    width: 80,
    height: 80,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
    position: 'relative',
  },
  monogramWrap: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
  },
  monogramText: {
    fontSize: 10,
    fontWeight: '900',
    color: colors.amber,
    marginTop: 2,
  },
  loginTitle: {
    ...typography.h1,
    marginBottom: spacing.xs,
  },
  loginSubtitle: {
    ...typography.caption,
    fontWeight: '800',
    color: colors.amber,
    letterSpacing: 2,
    textAlign: 'center',
  },
  loginSubDesc: {
    ...typography.caption,
    textAlign: 'center',
    paddingHorizontal: spacing.md,
    marginTop: spacing.xs,
  },
  loginCard: {
    backgroundColor: colors.surface,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    width: '100%',
    gap: spacing.md,
    ...shadow.md,
  },
  inputLabel: {
    ...typography.bodyBold,
    color: colors.textSecondary,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.backgroundElevated,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    height: 48,
  },
  inputIcon: { marginRight: spacing.sm },
  textInput: {
    flex: 1,
    color: '#fff',
    fontSize: 15,
  },
  loginBtn: {
    backgroundColor: colors.amber,
    height: 48,
    borderRadius: radius.md,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  loginBtnText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '700',
  },
  orText: {
    ...typography.caption,
    color: colors.textMuted,
    marginVertical: spacing.xl,
  },
  presetGrid: {
    flexDirection: 'row',
    gap: spacing.md,
    width: '100%',
  },
  presetCard: {
    flex: 1,
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    gap: spacing.xs,
  },
  presetEmoji: { fontSize: 24 },
  presetName: {
    ...typography.bodyBold,
    fontSize: 14,
  },
  presetEmail: {
    ...typography.caption,
    fontSize: 11,
    color: colors.textMuted,
  },

  // Home styling
  homeContainer: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  homeContent: {
    padding: spacing.md,
    gap: spacing.md,
    paddingBottom: spacing.xxl,
  },
  homeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.md,
  },
  greeting: {
    ...typography.h2,
  },
  headerSub: {
    ...typography.caption,
  },
  membershipBadge: {
    backgroundColor: colors.goldLight,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.amber,
  },
  membershipBadgeText: {
    color: colors.amber,
    fontSize: 11,
    fontWeight: '800',
  },
  heroCard: {
    backgroundColor: colors.amber,
    padding: spacing.lg,
    borderRadius: radius.lg,
    marginTop: spacing.sm,
    overflow: 'hidden',
    ...shadow.amber,
  },
  heroGlow: {
    position: 'absolute',
    right: -20,
    top: -20,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  heroTextContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  heroIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#000',
    lineHeight: 24,
  },
  heroDesc: {
    fontSize: 12,
    color: 'rgba(0,0,0,0.65)',
    lineHeight: 16,
    fontWeight: '600',
    marginTop: 2,
  },
  statsCard: {
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sectionTitle: {
    ...typography.bodyBold,
    marginBottom: spacing.md,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  statBox: {
    flex: 1,
    backgroundColor: colors.backgroundElevated,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statLabel: {
    ...typography.caption,
    color: colors.textMuted,
  },
  statValue: {
    ...typography.h3,
    marginTop: spacing.xs,
  },
  statSubText: {
    ...typography.small,
    marginTop: 2,
  },
  miniGameCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(236, 200, 122, 0.08)',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(236, 200, 122, 0.2)',
    padding: spacing.md,
  },
  gameTextWrap: { flex: 1 },
  gameTitle: {
    ...typography.bodyBold,
    color: colors.amber,
  },
  gameDesc: {
    ...typography.caption,
    fontSize: 12,
    marginTop: 2,
  },
  subSectionHeader: {
    ...typography.bodyBold,
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
  verticalBrandListContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
    marginTop: spacing.sm,
  },
  brandColumn: {
    flex: 1,
    gap: 6,
  },
  verticalBrandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md - 2,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(236, 200, 122, 0.18)',
    elevation: 2,
    shadowColor: colors.amber,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  brandRowInner: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  brandRowText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  brandRowStatus: {
    color: colors.amber,
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.5,
    opacity: 0.8,
  },

  // Collection styling
  collectionContainer: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  colHeaderCard: {
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  colHeaderTitle: {
    ...typography.h2,
    marginBottom: spacing.xs,
  },
  colSummaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
  colSummaryLabel: {
    ...typography.caption,
    color: colors.textMuted,
  },
  colSummaryValue: {
    ...typography.h3,
  },
  filterTabsRow: {
    flexDirection: 'row',
    padding: spacing.md,
    gap: spacing.sm,
  },
  filterTab: {
    flex: 1,
    height: 38,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterTabActive: {
    backgroundColor: colors.amber,
    borderColor: colors.amber,
  },
  filterTabText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '700',
  },
  filterTabTextActive: {
    color: '#000',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xxl,
    gap: spacing.md,
    minHeight: 300,
  },
  emptyText: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: 'center',
  },
  emptyBtn: {
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  emptyBtnText: {
    color: colors.amber,
    fontWeight: '700',
  },
  colListScroll: {
    padding: spacing.md,
    gap: spacing.md,
    paddingBottom: spacing.xxl,
  },
  watchItemCard: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.md,
    position: 'relative',
    ...shadow.sm,
  },
  watchItemImg: {
    width: 80,
    height: 80,
    borderRadius: radius.md,
    backgroundColor: colors.background,
  },
  watchItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  watchItemBrand: {
    ...typography.caption,
    color: colors.amber,
    fontWeight: '700',
  },
  watchItemName: {
    ...typography.bodyBold,
    fontSize: 16,
    paddingRight: 24,
  },
  watchItemReference: {
    ...typography.small,
    color: colors.textMuted,
  },
  watchItemFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.xs,
    flexWrap: 'wrap',
    gap: 6,
  },
  verdictBadgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  watchItemPrice: {
    ...typography.bodyBold,
    color: '#fff',
  },
  deleteItemBtn: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  soldBadge: {
    backgroundColor: colors.successLight,
    paddingHorizontal: spacing.xs,
    paddingVertical: 1,
    borderRadius: radius.sm,
  },
  soldBadgeText: {
    color: colors.success,
    fontSize: 9,
    fontWeight: '800',
  },

  // Portfolio styling
  portContainer: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  portContent: {
    padding: spacing.md,
    gap: spacing.md,
    paddingBottom: spacing.xxl,
  },
  portTitle: {
    ...typography.h2,
    marginTop: spacing.md,
  },
  roiCard: {
    backgroundColor: colors.surface,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  roiLabel: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  roiValue: {
    fontSize: 36,
    fontWeight: '900',
    color: colors.success,
    marginVertical: spacing.xs,
  },
  roiDelta: {
    ...typography.small,
    color: colors.textMuted,
  },
  roiGrid: {
    flexDirection: 'row',
    gap: spacing.lg,
    marginTop: spacing.lg,
    width: '100%',
  },
  roiBox: {
    flex: 1,
    backgroundColor: colors.backgroundElevated,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  roiBoxLabel: {
    ...typography.small,
    color: colors.textMuted,
  },
  roiBoxVal: {
    ...typography.bodyBold,
    fontSize: 16,
    marginTop: 4,
  },
  diversificationCard: {
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.md,
  },
  diverRow: {
    gap: spacing.xs,
  },
  diverHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  diverName: {
    ...typography.bodyBold,
  },
  diverCount: {
    ...typography.caption,
  },
  progressBarBg: {
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.backgroundElevated,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: colors.amber,
    borderRadius: 4,
  },
  emptyProgressText: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: 'center',
    paddingVertical: spacing.md,
  },
  graphWrap: {
    flexDirection: 'row',
    height: 180,
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    marginTop: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  graphBar: {
    width: 28,
    height: 40,
    backgroundColor: colors.backgroundElevated,
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
  },
  graphMonthsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    marginTop: spacing.sm,
  },
  graphMonthText: {
    fontSize: 11,
    color: colors.textMuted,
    fontWeight: '600',
  },

  // Settings styling
  settingsContainer: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  settingsContent: {
    padding: spacing.md,
    gap: spacing.md,
    paddingBottom: spacing.xxl,
  },
  settingsTitle: {
    ...typography.h2,
    marginTop: spacing.md,
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  profileAvatar: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: colors.amber,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarEditOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: '#000',
    fontWeight: '900',
    fontSize: 18,
  },
  profileName: {
    ...typography.bodyBold,
    fontSize: 18,
  },
  profileEmail: {
    ...typography.caption,
    color: colors.textMuted,
  },
  planCard: {
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.xs,
  },
  planHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  planTitle: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  planTier: {
    fontSize: 16,
    fontWeight: '900',
  },
  planDetails: {
    ...typography.body,
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    marginTop: spacing.xs,
  },
  planUpgradeBtn: {
    backgroundColor: colors.surfaceMuted,
    height: 42,
    borderRadius: radius.md,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: spacing.sm,
  },
  planUpgradeText: {
    color: colors.amber,
    fontWeight: '700',
  },
  settingsMenu: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.sm,
  },
  menuItemText: {
    flex: 1,
    ...typography.bodyBold,
    fontSize: 14,
  },
  logoutBtn: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.danger,
    height: 48,
    borderRadius: radius.md,
  },
  logoutText: {
    color: '#fff',
    fontWeight: '700',
  },

  // Dev bar overlay
  devCard: {
    backgroundColor: '#1E120A',
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: colors.amber,
    padding: spacing.md,
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  devCardTitle: {
    color: colors.amber,
    fontWeight: '900',
    fontSize: 14,
    textAlign: 'center',
  },
  devCardSub: {
    color: colors.textSecondary,
    fontSize: 11,
    textAlign: 'center',
    lineHeight: 16,
  },
  devBtnRow: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  devTierBtn: {
    flex: 1,
    height: 32,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(255,255,255,0.05)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  devTierBtnActive: {
    backgroundColor: colors.amber,
    borderColor: colors.amber,
  },
  devTierText: {
    color: colors.textSecondary,
    fontSize: 10,
    fontWeight: '800',
  },
  devTierTextActive: {
    color: '#000',
  },
  devActionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  devActionBtn: {
    flex: 1,
    height: 36,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(236, 200, 122, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(236, 200, 122, 0.25)',
  },
  devActionText: {
    color: colors.amber,
    fontSize: 12,
    fontWeight: '700',
  },

  // Upgrade / Membership Styling
  upgradeContainer: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  upgradeContent: {
    padding: spacing.md,
    gap: spacing.md,
    paddingBottom: spacing.xxl,
  },
  upgradeHeader: {
    alignItems: 'center',
    marginVertical: spacing.md,
    position: 'relative',
  },
  upgradeClose: {
    position: 'absolute',
    left: 0,
    top: 4,
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  upgradeTitle: {
    ...typography.h1,
    marginTop: spacing.sm,
  },
  upgradeSubtitle: {
    ...typography.caption,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  tierOptionCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    borderRadius: radius.lg,
    gap: spacing.md,
    position: 'relative',
  },
  tierOptionCardBest: {
    borderColor: colors.amber,
    borderWidth: 2,
    backgroundColor: '#1C160F',
    ...shadow.amber,
  },
  recommendedBadge: {
    position: 'absolute',
    top: -12,
    right: 20,
    backgroundColor: colors.amber,
    paddingHorizontal: spacing.md,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  recommendedText: {
    color: '#000',
    fontSize: 11,
    fontWeight: '800',
  },
  tierBadgeWrap: {
    marginBottom: 12,
  },
  tierHeaderTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  tierName: {
    fontSize: 18,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: 0.5,
  },
  tierPriceSection: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: 4,
  },
  tierPrice: {
    fontSize: 28,
    fontWeight: '900',
    color: '#fff',
  },
  tierPriceUnit: {
    fontSize: 14,
    color: colors.textSecondary,
    marginLeft: 4,
    fontWeight: '600',
  },
  tierDailyEst: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
  featuresList: {
    gap: 8,
    marginVertical: 12,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  featureIcon: {
    marginTop: 2,
  },
  featureText: {
    fontSize: 13,
    lineHeight: 18,
    color: colors.textSecondary,
    flex: 1,
  },
  tierBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
  },
  tierBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  tierDetails: {
    fontSize: 13,
    lineHeight: 18,
    color: colors.textSecondary,
  },
  tierActionBtn: {
    backgroundColor: colors.surfaceMuted,
    height: 44,
    borderRadius: radius.md,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  tierActionBtnBest: {
    backgroundColor: colors.amber,
    borderColor: colors.amber,
  },
  tierActionBtnActive: {
    opacity: 0.5,
  },
  tierActionBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
  tierPriceThai: {
    marginTop: -4,
  },
  creditPacksContainer: {
    gap: spacing.md,
    marginTop: spacing.xl,
    paddingTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  creditPackCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    borderRadius: radius.md,
    gap: spacing.sm,
    position: 'relative',
  },
  creditPackCardBest: {
    borderColor: colors.amber,
    borderWidth: 1.5,
    backgroundColor: '#1C160F',
  },
  creditBadgeWrap: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  creditTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
  creditDesc: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
    paddingRight: 60,
  },
  creditPrice: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
  creditActionBtn: {
    backgroundColor: colors.surfaceMuted,
    height: 38,
    borderRadius: radius.sm,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: 4,
  },
  creditActionBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
  },
  saveTag: {
    position: 'absolute',
    top: -10,
    right: 15,
    backgroundColor: colors.amber,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  saveTagText: {
    color: '#000',
    fontSize: 10,
    fontWeight: '800',
  },

  // Stub and auxiliary screens styling
  stubContainer: {
    flex: 1,
    backgroundColor: colors.background,
    padding: spacing.lg,
    justifyContent: 'center',
  },
  stubTitle: {
    ...typography.h1,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  stubDetails: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'justify',
    lineHeight: 24,
  },
  stubCloseBtn: {
    backgroundColor: colors.amber,
    height: 48,
    borderRadius: radius.md,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  stubCloseBtnText: {
    color: '#000',
    fontWeight: '700',
    fontSize: 16,
  },

  // Game Styling
  gameScoreText: {
    ...typography.caption,
    textAlign: 'center',
    color: colors.amber,
    fontWeight: '700',
    marginBottom: spacing.lg,
  },
  gameBoxCard: {
    backgroundColor: colors.surface,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 140,
    justifyContent: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  gameLabel: {
    ...typography.bodyBold,
    fontSize: 16,
    color: '#fff',
  },
  gameSub: {
    ...typography.caption,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  gameActionRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  gameOptionBtn: {
    flex: 1,
    height: 52,
    borderRadius: radius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  gameOptionText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 15,
  },

  // Premium Caliber Game Screen Overhaul Styles
  gameContainer: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  gameContent: {
    padding: spacing.md,
    gap: spacing.md,
    paddingBottom: spacing.xxl,
  },
  gameHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: spacing.md,
    position: 'relative',
  },
  gameCloseBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  gameHeaderTitle: {
    ...typography.h2,
    color: '#fff',
    textAlign: 'center',
  },
  gameHeaderSubtitle: {
    ...typography.caption,
    color: colors.amber,
    letterSpacing: 2,
    textAlign: 'center',
  },
  gameWatchHeaderSection: {
    alignItems: 'center',
    marginVertical: spacing.md,
  },
  watchDialOuterRing: {
    width: 140,
    height: 140,
    borderRadius: 70,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    shadowColor: colors.amber,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
  gameStatsHudRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    width: '100%',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: 'rgba(30, 24, 20, 0.95)',
    marginVertical: spacing.md,
  },
  hudStatBox: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  hudStatLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.textSecondary,
    letterSpacing: 0.5,
    marginRight: 4,
  },
  hudStatValue: {
    fontSize: 12,
    fontWeight: '900',
    color: '#FFF',
    letterSpacing: 0.5,
  },
  gameProgressRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginTop: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  gameProgressText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
  },
  gameProgressCounter: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.amber,
  },
  gameStepIndicatorRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  gameStepDot: {
    width: 12,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
  },
  gameStepDotActive: {
    backgroundColor: colors.amber,
  },
  gameStepDotCompleted: {
    backgroundColor: colors.success,
  },
  gameWatchInfoCard: {
    padding: spacing.md,
    borderRadius: radius.md,
    overflow: 'hidden',
    marginVertical: spacing.sm,
    backgroundColor: 'rgba(30, 18, 10, 0.4)',
    borderWidth: 1,
    borderColor: 'rgba(236, 200, 122, 0.15)',
  },
  gameWatchInfoHead: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  gameWatchTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#fff',
  },
  gameWatchSubtitle: {
    fontSize: 11,
    color: colors.textSecondary,
  },
  comparisonGridRow: {
    gap: spacing.md,
    marginVertical: spacing.sm,
  },
  caliberHalfCard: {
    padding: spacing.md,
    borderRadius: radius.lg,
    overflow: 'hidden',
    gap: spacing.sm,
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  caliberCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  caliberCardTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#fff',
  },
  caliberSpecList: {
    gap: 4,
    marginVertical: 4,
  },
  caliberBulletText: {
    fontSize: 12,
    color: '#ECE5D8',
    lineHeight: 18,
  },
  caliberSelectBtn: {
    height: 40,
    borderRadius: radius.md,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    marginTop: spacing.xs,
  },
  caliberSelectBtnText: {
    color: '#000',
    fontSize: 13,
    fontWeight: '900',
  },
  gameHelperCard: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    padding: spacing.md,
    borderRadius: radius.md,
    marginTop: spacing.sm,
  },
  gameHelperText: {
    flex: 1,
    fontSize: 11,
    color: colors.textMuted,
    lineHeight: 16,
    textAlign: 'justify',
  },
  gameTimerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    borderWidth: 1,
    borderColor: 'rgba(236, 200, 122, 0.15)',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    marginVertical: spacing.xs,
  },
  gameTimerText: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.amber,
    letterSpacing: 1,
  },
  hintBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ECC87A',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    marginVertical: spacing.xs,
  },
  hintBtnText: {
    color: '#000',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  hintCard: {
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: 'rgba(236, 200, 122, 0.35)',
    backgroundColor: 'rgba(30, 24, 20, 0.65)',
    marginVertical: spacing.xs,
    overflow: 'hidden',
  },
  hintText: {
    fontSize: 12,
    color: '#ECE5D8',
    lineHeight: 18,
    fontStyle: 'italic',
  },
  resultOverlayCard: {
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: 'rgba(236, 200, 122, 0.3)',
    backgroundColor: 'rgba(15, 12, 10, 0.98)',
    marginVertical: spacing.md,
    overflow: 'hidden',
    gap: spacing.md,
  },
  resultCardHeader: {
    alignItems: 'center',
    borderWidth: 1.5,
    borderRadius: radius.md,
    padding: spacing.md,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  resultCardTitle: {
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 1,
    marginBottom: 6,
  },
  resultCardSub: {
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: spacing.sm,
  },
  resultScoreContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    padding: spacing.md,
    borderRadius: radius.md,
  },
  resultScoreValue: {
    fontSize: 14,
    fontWeight: '900',
    color: colors.amber,
  },
  speedBonusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  speedBonusText: {
    fontSize: 9,
    fontWeight: '900',
    color: '#000',
    letterSpacing: 0.5,
  },
  explanationSection: {
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
    borderWidth: 1,
    borderColor: 'rgba(236, 200, 122, 0.15)',
    padding: spacing.md,
    borderRadius: radius.md,
  },
  explanationTitle: {
    fontSize: 12,
    fontWeight: '900',
    color: colors.amber,
    letterSpacing: 0.8,
  },
  explanationText: {
    fontSize: 12,
    color: '#ECE5D8',
    lineHeight: 18,
    textAlign: 'justify',
  },
  gameContinueBtn: {
    height: 48,
    borderRadius: radius.md,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    marginTop: spacing.sm,
  },
  gameContinueBtnText: {
    color: '#000',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 1,
  },
  scoreboardContainer: {
    flex: 1,
    backgroundColor: '#0A0805',
  },
  scoreboardHeaderTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: 1,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  scoreboardHeaderSubtitle: {
    fontSize: 10,
    color: colors.amber,
    fontWeight: '800',
    letterSpacing: 2,
    textAlign: 'center',
  },
  scoreboardMetricsCard: {
    width: '100%',
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: 'rgba(236, 200, 122, 0.25)',
    backgroundColor: 'rgba(30, 24, 20, 0.4)',
    alignItems: 'center',
    overflow: 'hidden',
    marginVertical: spacing.md,
  },
  rankCard: {
    width: '100%',
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(236, 200, 122, 0.15)',
    alignItems: 'center',
    overflow: 'hidden',
  },
  rankTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: colors.amber,
    letterSpacing: 0.5,
    marginBottom: 6,
    textAlign: 'center',
  },
  rankDesc: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 18,
    textAlign: 'center',
  },
  returnVaultBtn: {
    height: 48,
    borderRadius: radius.md,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.25)',
    backgroundColor: 'transparent',
  },
  returnVaultBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 1,
  },
});
