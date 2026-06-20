import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Dimensions,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors, spacing, radius, typography } from '../lib/theme';
import { useLang } from '../i18n/LangContext';
import type { RootStackParamList } from '../lib/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Onboarding'>;

export const ONBOARDED_KEY = '@guardian/onboarded';

const { width } = Dimensions.get('window');

const SLIDES = [
  {
    emoji: '🛡️',
    titleKey: 'onboarding.slide1Title',
    bodyKey: 'onboarding.slide1Body',
    accentColor: colors.primary,
  },
  {
    emoji: '🔍',
    titleKey: 'onboarding.slide2Title',
    bodyKey: 'onboarding.slide2Body',
    accentColor: colors.green,
  },
  {
    emoji: '👨‍👩‍👧‍👦',
    titleKey: 'onboarding.slide3Title',
    bodyKey: 'onboarding.slide3Body',
    accentColor: colors.yellow,
  },
] as const;

export default function OnboardingScreen({ navigation }: Props) {
  const { t } = useLang();
  const scrollRef = useRef<ScrollView>(null);
  const [current, setCurrent] = useState(0);

  const goTo = (idx: number) => {
    scrollRef.current?.scrollTo({ x: idx * width, animated: true });
    setCurrent(idx);
  };

  const finish = async () => {
    await AsyncStorage.setItem(ONBOARDED_KEY, 'true');
    navigation.replace('MainTabs', { screen: 'Home' });
  };

  const isLast = current === SLIDES.length - 1;

  return (
    <SafeAreaView style={styles.safe}>
      {/* Slides */}
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEnabled={false}
        style={{ flex: 1 }}
        contentContainerStyle={{ width: width * SLIDES.length }}
      >
        {SLIDES.map((slide, idx) => (
          <View key={idx} style={[styles.slide, { width }]}>
            <View style={[styles.emojiCircle, { backgroundColor: slide.accentColor + '18' }]}>
              <Text style={styles.emoji}>{slide.emoji}</Text>
            </View>
            <Text style={styles.slideTitle}>{t(slide.titleKey)}</Text>
            <Text style={styles.slideBody}>{t(slide.bodyKey)}</Text>
          </View>
        ))}
      </ScrollView>

      {/* Dot indicators */}
      <View style={styles.dots}>
        {SLIDES.map((_, idx) => (
          <Pressable key={idx} onPress={() => goTo(idx)} hitSlop={8}>
            <View style={[styles.dot, current === idx && styles.dotActive]} />
          </Pressable>
        ))}
      </View>

      {/* Navigation */}
      <View style={styles.navRow}>
        <Pressable onPress={finish} style={styles.skipBtn}>
          <Text style={styles.skipText}>{t('onboarding.skip')}</Text>
        </Pressable>
        <Pressable
          style={[styles.nextBtn, isLast && styles.nextBtnLast]}
          onPress={() => (isLast ? finish() : goTo(current + 1))}
        >
          <Text style={styles.nextText}>
            {isLast ? t('onboarding.start') : `${t('onboarding.next')} ›`}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  slide: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  emojiCircle: {
    width: 128,
    height: 128,
    borderRadius: 64,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xl,
  },
  emoji: { fontSize: 58 },
  slideTitle: {
    ...typography.h1,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  slideBody: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 26,
    maxWidth: 320,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.border,
  },
  dotActive: { width: 24, backgroundColor: colors.primary },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
  },
  skipBtn: { padding: spacing.md },
  skipText: { ...typography.body, color: colors.textMuted },
  nextBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 14,
    paddingHorizontal: spacing.xl,
  },
  nextBtnLast: { paddingHorizontal: spacing.xxl },
  nextText: { fontSize: 16, fontWeight: '700', color: colors.textOnPrimary },
});
