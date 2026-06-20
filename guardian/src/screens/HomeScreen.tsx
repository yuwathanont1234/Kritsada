import React, { useState, useCallback } from 'react';
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { colors, spacing, radius, typography } from '../lib/theme';
import { getRecentChecks } from '../lib/analysis';
import { InputSelector } from '../components/InputSelector';
import { RiskBadge } from '../components/RiskBadge';
import { useLang } from '../i18n/LangContext';
import type { ContentType, RecentCheck, RootStackParamList } from '../lib/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

export default function HomeScreen({ navigation }: Props) {
  const { t, lang } = useLang();
  const [mode, setMode] = useState<ContentType>('text');
  const [text, setText] = useState('');
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [recent, setRecent] = useState<RecentCheck[]>([]);
  const [loadingRecent, setLoadingRecent] = useState(true);

  // Refresh history whenever Home regains focus (after a check completes).
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
    // Resize to max 1024px wide before base64 to stay well under the edge
    // function's payload ceiling and keep upload fast.
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

  const handleAnalyze = useCallback(() => {
    if (mode === 'text' && !text.trim()) {
      Alert.alert('', t('error.contentRequired'));
      return;
    }
    if (mode === 'image' && !imageBase64) {
      Alert.alert('', t('error.contentRequired'));
      return;
    }
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
            <View style={{ flex: 1 }}>
              <Text style={styles.appName}>{t('app.name')}</Text>
              <Text style={styles.subtitle}>{t('home.subtitle')}</Text>
            </View>
            <Pressable onPress={() => navigation.navigate('Settings')} hitSlop={10}>
              <Text style={styles.gearIcon}>⚙️</Text>
            </Pressable>
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

          {/* Analyze */}
          <Pressable
            style={[styles.analyzeBtn, !canAnalyze && styles.btnDisabled]}
            onPress={handleAnalyze}
            disabled={!canAnalyze}
          >
            <Text style={styles.analyzeBtnText}>{t('home.analyzeButton')}</Text>
          </Pressable>

          {/* Family entry */}
          <Pressable style={styles.familyRow} onPress={() => navigation.navigate('Family')}>
            <Text style={styles.familyIcon}>👨‍👩‍👧‍👦</Text>
            <Text style={styles.familyLabel}>{t('home.family')}</Text>
            <Text style={styles.familyArrow}>›</Text>
          </Pressable>

          {/* Recent */}
          <Text style={styles.sectionTitle}>{t('home.recentTitle')}</Text>
          {loadingRecent ? (
            <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.md }} />
          ) : recent.length === 0 ? (
            <Text style={styles.emptyText}>{t('home.recentEmpty')}</Text>
          ) : (
            recent.map((check) => (
              <View key={check.id} style={styles.recentRow}>
                <RiskBadge level={check.risk_level} size="sm" />
                <Text style={styles.recentPreview} numberOfLines={1}>
                  {check.content_preview}
                </Text>
                <Text style={styles.recentDate}>
                  {new Date(check.created_at).toLocaleDateString(lang === 'th' ? 'th-TH' : 'en-US', {
                    month: 'short',
                    day: 'numeric',
                  })}
                </Text>
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
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: spacing.lg },
  appName: { ...typography.h1, color: colors.primary },
  subtitle: { ...typography.caption, marginTop: 4, lineHeight: 20 },
  gearIcon: { fontSize: 22, marginTop: 4 },
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
  familyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  familyIcon: { fontSize: 22, marginRight: spacing.sm },
  familyLabel: { flex: 1, ...typography.bodyBold, color: colors.text },
  familyArrow: { fontSize: 24, color: colors.textMuted },
  sectionTitle: { ...typography.h3, marginTop: spacing.xl, marginBottom: spacing.md },
  emptyText: { ...typography.body, color: colors.textMuted, textAlign: 'center', marginTop: spacing.md },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  recentPreview: { flex: 1, ...typography.body, color: colors.textSecondary, marginHorizontal: spacing.sm },
  recentDate: { ...typography.small, color: colors.textMuted },
});
