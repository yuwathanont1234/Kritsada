import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { colors, radius, shadow } from '../lib/theme';
import type { ContentType } from '../lib/types';

type Props = {
  selected: ContentType;
  onSelect: (mode: ContentType) => void;
  labelText: string;
  labelImage: string;
};

export function InputSelector({ selected, onSelect, labelText, labelImage }: Props) {
  return (
    <View style={styles.container}>
      {(['text', 'image'] as ContentType[]).map((mode) => {
        const active = selected === mode;
        const label = mode === 'text' ? labelText : labelImage;
        return (
          <Pressable
            key={mode}
            onPress={() => onSelect(mode)}
            style={[styles.tab, active && styles.activeTab]}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
          >
            <Text style={[styles.tabLabel, active && styles.activeLabel]}>
              {mode === 'text' ? '📝  ' : '🖼️  '}
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    padding: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 11,
    alignItems: 'center',
    borderRadius: radius.sm + 2,
  },
  activeTab: { backgroundColor: colors.surface, ...shadow.sm },
  tabLabel: { fontSize: 14, fontWeight: '600', color: colors.textSecondary },
  activeLabel: { color: colors.primary, fontWeight: '700' },
});
