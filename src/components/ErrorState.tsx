import React from 'react';
import { View, Text, StyleSheet, Pressable, Platform } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, radius, spacing } from '../lib/theme';
import { useLanguage } from '../lib/localization';

interface ErrorStateProps {
  errorMsg: string;
  onRetry: () => void;
  onCancel: () => void;
}

export function ErrorState({ errorMsg, onRetry, onCancel }: ErrorStateProps) {
  const { t, lang } = useLanguage();

  // Try to determine the nature of the error to show localized context
  let displayTitle = t('error.title');
  let displayBody = errorMsg;

  const isOffline =
    errorMsg.toLowerCase().includes('network') ||
    errorMsg.toLowerCase().includes('offline') ||
    errorMsg.toLowerCase().includes('failed to fetch') ||
    errorMsg.toLowerCase().includes('connect');

  const isTimeout =
    errorMsg.toLowerCase().includes('timeout') ||
    errorMsg.toLowerCase().includes('time out') ||
    errorMsg.toLowerCase().includes('limit') ||
    errorMsg.toLowerCase().includes('exhausted');

  if (isOffline) {
    displayBody = t('error.networkFailed');
  } else if (isTimeout) {
    displayBody = t('error.aiFailed');
  }

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        {/* Glow behind the icon */}
        <View style={styles.glowOverlay} />

        {/* Warning Icon Bubble */}
        <View style={styles.iconCircle}>
          <Feather name="alert-triangle" size={32} color="#ECC87A" />
        </View>

        {/* Localized Error Title */}
        <Text style={styles.title}>{displayTitle}</Text>

        {/* Error Body Text */}
        <Text style={styles.body}>{displayBody}</Text>

        {/* Raw Developer Diagnostics (collapsed & styled subtly) */}
        <View style={styles.diagnosticsBox}>
          <Text style={styles.diagnosticsLabel}>DIAGNOSTIC LOG (RAW):</Text>
          <Text style={styles.diagnosticsText} numberOfLines={3}>
            {errorMsg}
          </Text>
        </View>

        {/* CTAs */}
        <View style={styles.actionsBox}>
          <Pressable
            style={({ pressed }) => [
              styles.retryBtn,
              pressed && { opacity: 0.85 },
            ]}
            onPress={onRetry}
          >
            <Feather name="refresh-cw" size={16} color="#1A1410" style={{ marginRight: 8 }} />
            <Text style={styles.retryBtnText}>{t('error.retry')}</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.cancelBtn,
              pressed && { opacity: 0.6 },
            ]}
            onPress={onCancel}
          >
            <Text style={styles.cancelBtnText}>{t('error.cancel')}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0805',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#13100E',
    borderColor: 'rgba(236, 200, 122, 0.22)',
    borderWidth: 1.5,
    borderRadius: radius.xl,
    padding: spacing.lg,
    alignItems: 'center',
    position: 'relative',
    overflow: 'hidden',
    shadowColor: '#ECC87A',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 30,
    elevation: 10,
  },
  glowOverlay: {
    position: 'absolute',
    top: -50,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: 'rgba(236, 200, 122, 0.04)',
    zIndex: 0,
  },
  iconCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: 'rgba(236, 200, 122, 0.08)',
    borderColor: 'rgba(236, 200, 122, 0.35)',
    borderWidth: 1.2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
    zIndex: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: '900',
    color: '#ECC87A',
    textAlign: 'center',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
  },
  body: {
    fontSize: 13,
    color: '#B5AFA5',
    textAlign: 'center',
    lineHeight: 19,
    paddingHorizontal: spacing.sm,
    marginBottom: spacing.md,
  },
  diagnosticsBox: {
    width: '100%',
    backgroundColor: 'rgba(0,0,0,0.25)',
    borderColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  diagnosticsLabel: {
    fontSize: 8.5,
    fontWeight: '800',
    color: '#7A736A',
    letterSpacing: 1,
    marginBottom: 4,
  },
  diagnosticsText: {
    fontSize: 10,
    color: '#7A736A',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    lineHeight: 14,
  },
  actionsBox: {
    width: '100%',
    gap: spacing.sm,
  },
  retryBtn: {
    width: '100%',
    height: 48,
    backgroundColor: '#ECC87A',
    borderRadius: radius.full,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#ECC87A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 4,
  },
  retryBtnText: {
    fontSize: 14,
    fontWeight: '900',
    color: '#1A1410',
    letterSpacing: 0.3,
  },
  cancelBtn: {
    width: '100%',
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textMuted,
  },
});
