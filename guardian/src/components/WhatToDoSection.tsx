import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, radius } from '../lib/theme';
import type { RiskLevel } from '../lib/types';
import { useLang } from '../i18n/LangContext';

const BORDER: Record<RiskLevel, string> = {
  RED: colors.red,
  YELLOW: colors.yellow,
  GREEN: colors.green,
};

export function WhatToDoSection({ text, riskLevel }: { text: string; riskLevel: RiskLevel }) {
  const { t } = useLang();
  // Claude returns newline-separated steps; render as bullets.
  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);

  return (
    <View style={[styles.box, { borderLeftColor: BORDER[riskLevel] }]}>
      <Text style={styles.title}>{t('result.whatToDoTitle')}</Text>
      {lines.length === 0 ? (
        <Text style={styles.line}>{text}</Text>
      ) : (
        lines.map((line, i) => (
          <View key={i} style={styles.row}>
            <Text style={styles.bullet}>•</Text>
            <Text style={styles.line}>{line.replace(/^[-•]\s*/, '')}</Text>
          </View>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    padding: spacing.md,
    borderLeftWidth: 4,
  },
  title: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.text,
    marginBottom: spacing.sm,
    letterSpacing: 0.3,
  },
  row: { flexDirection: 'row', marginBottom: 7 },
  bullet: { color: colors.textSecondary, marginRight: 8, fontSize: 15, lineHeight: 22 },
  line: { flex: 1, fontSize: 14, color: colors.text, lineHeight: 22 },
});
