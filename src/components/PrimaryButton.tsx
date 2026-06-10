import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextStyle,
  ViewStyle,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, radius, spacing } from '../lib/theme';

type Props = {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost';
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
  icon?: string;
};

export function PrimaryButton({
  label,
  onPress,
  variant = 'primary',
  loading,
  disabled,
  style,
  textStyle,
  icon,
}: Props) {
  const isDisabled = disabled || loading;

  // Decide default label color based on variant
  const getLabelColor = () => {
    if (variant === 'primary') return '#fff';
    return colors.primary;
  };

  const iconColor = (textStyle?.color as string) || getLabelColor();

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        variant === 'primary' && styles.primary,
        variant === 'secondary' && styles.secondary,
        variant === 'ghost' && styles.ghost,
        pressed && !isDisabled && styles.pressed,
        isDisabled && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator
          color={variant === 'primary' ? '#fff' : colors.primary}
        />
      ) : (
        <>
          {icon ? (
            <Feather
              name={icon as any}
              size={18}
              color={iconColor}
              style={styles.icon}
            />
          ) : null}
          <Text
            style={[
              styles.label,
              variant === 'primary' && styles.labelPrimary,
              variant === 'secondary' && styles.labelSecondary,
              variant === 'ghost' && styles.labelGhost,
              textStyle,
            ]}
          >
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    height: 56,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
  },
  primary: {
    backgroundColor: colors.primary,
  },
  secondary: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  ghost: {
    backgroundColor: 'transparent',
  },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.5 },
  icon: {
    marginRight: spacing.sm,
  },
  label: { fontSize: 16, fontWeight: '600' },
  // Dark espresso on the gold fill — white-on-gold measured ~1.6:1 contrast,
  // far below WCAG; every hand-rolled gold button elsewhere uses dark text.
  labelPrimary: { color: '#1A1410' },
  labelSecondary: { color: colors.primary },
  labelGhost: { color: colors.primary },
});
