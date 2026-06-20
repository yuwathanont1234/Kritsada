import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, CompositeScreenProps } from '@react-navigation/native';
import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as Haptics from 'expo-haptics';
import { colors, spacing, radius, typography, shadow } from '../lib/theme';
import { getRecentChecks } from '../lib/analysis';
import { InputSelector } from '../components/InputSelector';
import { RiskBadge } from '../components/RiskBadge';
import { useLang } from '../i18n/LangContext';
import type { ContentType, RecentCheck, RootStackParamList, TabParamList } from '../lib/types';

type Props = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, 'Home'>,
  NativeStackScreenProps<RootStackParamList>
>;

export default function HomeScreen({ navigation }: Props) {
  const { t, lang } = useLang();
  const [mode, setMode] = useState<ContentType>('text');
  const [text, setText] = useState('');
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [recent, setRecent] = useState<RecentCheck[]>([]);
  const [loadingRecent, setLoadingRecent] = useState(true);
  const scaleAnim = useRef(new Animated.Value(1)).current;

  useFocusEffect(
    useCallback(() => {
      let active = true;
      getRecentChecks()
        .then((checks) => {
          if (active) {
            setRecent(checks);
            setLoadingRecent(false);
          }
        })
        .catch(() => {
          if (active) setLoadingRecent(false);
        });
      return () => {
        active = false;
      };
    }, [])
  );

  const pickImage = useCallback(async () => {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.9,
    });
    if (res.canceled || !res.assets?.[0]?.uri) return;
    try {
      const manip = await ImageManipulator.manipulateAsync(
        res.assets[0].uri,
        [{ resize: { width: 1024 } }],
        { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG, base64: true }
      );
      if (manip.base64) setImageBase64(manip.base64);
    } catch {
      Alert.alert(t('error.title'), t('error.analysisFailed'));
    }
  }, [t]);

  const handlePressIn = useCallback(() => {
    Animated.spring(scaleAnim, {
      toValue: 0.96,
      useNativeDriver: true,
      tension: 200,
      friction: 10,
    }).start();
  }, [scaleAnim]);

  const handlePressOut = useCallback(() => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      tension: 200,
      friction: 10,
    }).start();
  }, [scaleAnim]);

  const handleAnalyze = useCallback(() => {
    if (mode === 'text' && !text.trim()) {
      Alert.alert('', t('error.contentRequired'));
      return;
    }
    if (mode === 'image' && !imageBase64) {
      Alert.alert('', t('error.contentRequired'));
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    navigation.navigate('Analysis', {
      content: mode === 'text' ? text.trim() : imageBase64!,
      content_type: mode,
      identifiers: [],
    });
  }, [mode, text, imageBase64, navigation, t]);

  const canAnalyze = mode === 'text' ? text.trim().length > 0 : imageBase64 !== null;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={{ flex: 1 }}
    >
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {/* Header */}
          <View style={styles.headerRow}>
            <Text style={styles.appName}>{t('app.name')}</Text>
            <Text style={styles.subtitle}>{t('home.subtitle')}</Text>
          </View>

          {/* Mode selector */}
          <InputSelector
            selected={mode}
            onSelect={(m) => {
              setMode(m);
              setImageBase64(null);
              setText('');
            }}
            labelText={t('home.inputModeText')}
            labelImage={t('home.inputModeImage')}
          />

          {/* Input area */}
          <View style={styles.inputArea}>
            {mode === 'text' ? (
              <TextInput
                style={styles.textInput}
                multiline
                placeholder={t('home.textPlaceholder')}
                placeholderTextColor={colors.textMuted}
                value={text}
                onChangeText={setText}
                textAlignVertical="top"
                autoCorrect={false}
              />
            ) : (
              <Pressable style={styles.imagePicker} onPress={pickImage}>
                <Text style={styles.imagePickerIcon}>{imageBase64 ? '✅' : '🖼️'}</Text>
                <Text style={styles.imagePickerLabel}>
                  {imageBase64 ? t('home.imageSelected') : t('home.pickImage')}
                </Text>
              </Pressable>
            )}
          </View>

          {/* Analyze — spring scale + haptic on tap */}
          <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
            <Pressable
              style={[styles.analyzeBtn, !canAnalyze && styles.btnDisabled]}
              onPress={handleAnalyze}
              onPressIn={canAnalyze ? handlePressIn : undefined}
              onPressOut={canAnalyze ? handlePressOut : undefined}
              disabled={!canAnalyze}
            >
              <Text style={styles.analyzeBtnText}>{t('home.analyzeButton')}</Text>
            </Pressable>
          </Animated.View>

          {/* Recent */}
          <Text style={styles.sectionTitle}>{t('home.recentTitle')}</Text>
          {loadingRecent ? (
            <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.md }} />
          ) : recent.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyIcon}>📋</Text>
              <Text style={styles.emptyTitle}>{t('home.recentEmpty')}</Text>
              <Text style={styles.emptyHint}>{t('home.recentEmptyHint')}</Text>
            </View>
          ) : (
            recent.map((check) => (
              <View key={check.id} style={styles.recentCard}>
                <RiskBadge level={check.risk_level} size="sm" />
                <View style={styles.recentCardBody}>
                  <Text style={styles.recentPreview} numberOfLines={1}>
                    {check.content_preview}
                  </Text>
                  <Text style={styles.recentDate}>
                    {new Date(check.created_at).toLocaleDateString(
                      lang === 'th' ? 'th-TH' : 'en-US',
                      { month: 'short', day: 'numeric' }
                    )}
                  </Text>
                </View>
              </View>
            ))
          )}
        </ScrollView>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl },
  headerRow: { marginBottom: spacing.lg },
  appName: { ...typography.h1, color: colors.primary },
  subtitle: { ...typography.caption, marginTop: 4, lineHeight: 20 },
  inputArea: { marginVertical: spacing.md },
  textInput: {
    backgroundColor: colors.inputBg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    fontSize: 15,
    color: colors.text,
    minHeight: 150,
    lineHeight: 24,
  },
  imagePicker: {
    backgroundColor: colors.inputBg,
    borderWidth: 2,
    borderColor: colors.border,
    borderStyle: 'dashed',
    borderRadius: radius.md,
    height: 150,
    alignItems: 'center',
    justifyContent: 'center',
  },
  imagePickerIcon: { fontSize: 40, marginBottom: spacing.sm },
  imagePickerLabel: { ...typography.body, color: colors.textSecondary },
  analyzeBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 16,
    alignItems: 'center',
  },
  analyzeBtnText: { fontSize: 16, fontWeight: '700', color: colors.textOnPrimary, letterSpacing: 0.3 },
  btnDisabled: { opacity: 0.5 },
  sectionTitle: { ...typography.h3, marginTop: spacing.xl, marginBottom: spacing.md },
  // Empty state
  emptyCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  emptyIcon: { fontSize: 36, marginBottom: spacing.md },
  emptyTitle: { ...typography.bodyBold, color: colors.textSecondary, marginBottom: spacing.xs },
  emptyHint: { ...typography.caption, color: colors.textMuted, textAlign: 'center', lineHeight: 20 },
  // Recent checks as cards
  recentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.sm,
  },
  recentCardBody: { flex: 1, marginLeft: spacing.sm },
  recentPreview: { ...typography.body, color: colors.text, marginBottom: 2 },
  recentDate: { ...typography.small, color: colors.textMuted },
});
