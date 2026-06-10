import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Image, View, ActivityIndicator, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Feather } from '@expo/vector-icons';
import { colors } from '../lib/theme';
import { isAuthenticated } from '../lib/auth';
import { styles, screenW, screenH } from './AppStyles';

export default function SplashScreen({ navigation }: any) {
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

    // Auto navigate after 2.8s. isAuthenticated() reads the locally-persisted
    // session, but guard with a 4s timeout anyway — a hung storage/SDK call
    // would otherwise strand the user on the splash forever. Fail toward
    // Login: re-authenticating is cheap, an infinite splash is not.
    const timer = setTimeout(async () => {
      const logged = await Promise.race([
        isAuthenticated(),
        new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 4000)),
      ]).catch(() => false);
      navigation.replace(logged ? 'Main' : 'Login');
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
                source={require('../../assets/splash-icon.png')} 
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
