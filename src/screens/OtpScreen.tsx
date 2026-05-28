import React, { useEffect, useState, useRef } from 'react';
import {
  Animated,
  Easing,
  View,
  ScrollView,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  Alert,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { colors, shadow } from '../lib/theme';
import { loginMock } from '../lib/auth';
import { useLanguage } from '../lib/localization';
import { getUserProfile } from '../lib/userProfile';
import { styles, screenW, screenH } from './AppStyles';

export default function LoginScreen({ navigation }: any) {
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
      // Route to Onboarding for first-time users (anonymous cohort hasn't
      // completed the role/brand quiz). Returning users skip straight to
      // Main. The Onboarding screen itself is also skippable, so worst
      // case we add one screen swipe — acceptable for the segmentation
      // data we collect (drives paywall personalization in Phase 2).
      const profile = await getUserProfile();
      if (!profile.onboardingDone) {
        navigation.replace('Onboarding');
      } else {
        navigation.replace('Main');
      }
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

          {/* Sandbox testing profiles — DEV builds only. Apple rejects apps
              that ship test fixtures visible to end users. */}
          {__DEV__ && (
            <>
              <Text style={styles.orText}>
                {lang === 'th' ? '— หรือเลือกโปรไฟล์ทดสอบระบบ Sandbox —' : '— Or choose a sandbox testing profile —'}
              </Text>

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
            </>
          )}
        </SafeAreaView>
      </ScrollView>
    </View>
  );
}
