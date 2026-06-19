import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { colors, spacing, radius } from '../lib/theme';
import type { RedFlag } from '../lib/types';
import { useLang } from '../i18n/LangContext';

const SEVERITY_COLOR: Record<RedFlag['severity'], string> = {
  high: colors.red,
  medium: colors.yellow,
  low: colors.textSecondary,
};

export function RedFlagCard({ flag }: { flag: RedFlag }) {
  const { t } = useLang();
  const [expanded, setExpanded] = useState(false);

  // Category labels are keyed by the 9 known categories; an unknown category
  // from the model falls back to its raw key rather than blanking out.
  const categoryLabel = t(`categories.${flag.category}`);
  const dotColor = SEVERITY_COLOR[flag.severity] ?? colors.textSecondary;

  return (
    <Pressable
      onPress={() => setExpanded((v) => !v)}
      style={styles.card}
      accessibilityRole="button"
    >
      <View style={styles.header}>
        <View style={[styles.dot, { backgroundColor: dotColor }]} />
        <Text style={styles.categoryLabel}>{categoryLabel}</Text>
        <Text style={styles.arrow}>{expanded ? '▲' : '▼'}</Text>
      </View>

      <Text style={styles.headline}>{flag.headline}</Text>

      {expanded && (
        <View>
          {!!flag.quote && (
            <View style={styles.quoteBox}>
              <Text style={styles.quoteLabel}>{t('result.quoteLabel')}</Text>
              <Text style={styles.quoteText}>“{flag.quote}”</Text>
            </View>
          )}
          {!!flag.why && <Text style={styles.why}>{flag.why}</Text>}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
  categoryLabel: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
    letterSpacing: 0.3,
  },
  arrow: { fontSize: 10, color: colors.textMuted },
  headline: { fontSize: 15, fontWeight: '600', color: colors.text, lineHeight: 23 },
  quoteBox: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.sm,
    padding: spacing.sm,
    marginTop: spacing.sm,
    borderLeftWidth: 3,
    borderLeftColor: colors.yellow,
  },
  quoteLabel: { fontSize: 10, fontWeight: '700', color: colors.textMuted, marginBottom: 3, letterSpacing: 0.5 },
  quoteText: { fontSize: 13, color: colors.textSecondary, fontStyle: 'italic', lineHeight: 21 },
  why: { fontSize: 13, color: colors.textSecondary, lineHeight: 21, marginTop: spacing.sm },
});
