import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, radius } from '../lib/theme';
import type { RiskLevel } from '../lib/types';
import { useLang } from '../i18n/LangContext';

type Props = { level: RiskLevel; size?: 'sm' | 'lg' };

const CONFIG: Record<RiskLevel, { bg: string; border: string; text: string; icon: string; key: string }> = {
  RED: { bg: colors.redLight, border: colors.redBorder, text: colors.red, icon: '🔴', key: 'result.red' },
  YELLOW: { bg: colors.yellowLight, border: colors.yellowBorder, text: colors.yellow, icon: '🟡', key: 'result.yellow' },
  GREEN: { bg: colors.greenLight, border: colors.greenBorder, text: colors.green, icon: '🟢', key: 'result.green' },
};

export function RiskBadge({ level, size = 'sm' }: Props) {
  const { t } = useLang();
  const cfg = CONFIG[level];
  const isLg = size === 'lg';

  return (
    <View style={[styles.base, { backgroundColor: cfg.bg, borderColor: cfg.border }, isLg && styles.lg]}>
      <Text style={[styles.icon, isLg && styles.iconLg]}>{cfg.icon}</Text>
      <Text style={[styles.label, { color: cfg.text }, isLg && styles.labelLg]}>{t(cfg.key)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.full,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  lg: { paddingHorizontal: 18, paddingVertical: 10 },
  icon: { fontSize: 13, marginRight: 5 },
  iconLg: { fontSize: 20, marginRight: 8 },
  label: { fontSize: 12, fontWeight: '700' },
  labelLg: { fontSize: 18, fontWeight: '800' },
});
