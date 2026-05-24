/**
 * Branded upgrade modal — replaces ugly default Alert.alert() popups for
 * upsell/gate prompts. Matches Membership screen aesthetic: dark surface,
 * golden gradient header, golden border glow, polished CTA button.
 *
 * Use for any "Pro/Premium-only feature" upsell. For destructive action
 * confirmations (delete, logout) keep using native Alert.alert.
 */

import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { colors, radius, spacing } from '../lib/theme';

import { useLanguage } from '../lib/localization';

export type UpgradeReason =
  | { kind: 'auth_quota_exhausted'; used: number; cap: number; windowDays: number }
  | { kind: 'feature_locked'; feature: 'heatmap' | 'ai_qa' | 'bg_removal' }
  | { kind: 'tier_lock'; required: 'standard' | 'pro' | 'premium' };

export type UpgradeBenefit = {
  icon: string; // emoji
  text: string;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  onUpgrade: () => void;

  /** Optional: leading lock icon emoji (default 🔒) */
  iconEmoji?: string;
  /** Required tier the feature is gated behind — affects the CTA label & color hint */
  tier: 'standard' | 'pro' | 'premium';
  /** Headline text — e.g. "ปลดล็อก Authenticity AI" */
  title: string;
  /** Sub-headline body, 1-2 lines describing what the feature does */
  body: string;
  /** Bullet list of features unlocked */
  benefits: UpgradeBenefit[];
  /** CTA text override (default: "UPGRADE TO {tier}") */
  ctaText?: string;
  /** Cancel text override (default: "Not Now") */
  cancelText?: string;
  /** Optional contextual reason for why the upgrade is prompted */
  reason?: UpgradeReason;
};

export function UpgradeModal({
  visible,
  onClose,
  onUpgrade,
  iconEmoji = '🔒',
  tier,
  title,
  body,
  benefits,
  ctaText,
  cancelText = 'Not Now',
  reason,
}: Props) {
  const { t } = useLanguage();
  const tierLabel =
    tier === 'standard' ? 'STANDARD' : tier === 'pro' ? 'PRO' : 'PREMIUM';
  const finalCtaText = ctaText ?? `UPGRADE TO ${tierLabel}`;

  const renderReasonAlert = () => {
    if (!reason) return null;

    let text = '';
    switch (reason.kind) {
      case 'auth_quota_exhausted':
        text = t('upgradeReason.auth_quota_exhausted', {
          used: reason.used,
          cap: reason.cap,
          windowDays: reason.windowDays,
        });
        break;
      case 'feature_locked':
        if (reason.feature === 'heatmap') {
          text = t('upgradeReason.feature_locked_heatmap');
        } else if (reason.feature === 'ai_qa') {
          text = t('upgradeReason.feature_locked_ai_qa');
        } else if (reason.feature === 'bg_removal') {
          text = t('upgradeReason.feature_locked_bg_removal');
        }
        break;
      case 'tier_lock':
        if (reason.required === 'standard') {
          text = t('upgradeReason.tier_lock_standard');
        } else if (reason.required === 'pro') {
          text = t('upgradeReason.tier_lock_pro');
        } else if (reason.required === 'premium') {
          text = t('upgradeReason.tier_lock_premium');
        }
        break;
    }

    return (
      <View style={styles.reasonAlert}>
        <Feather name="alert-circle" size={14} color={colors.amber} style={{ marginRight: 8, marginTop: 1 }} />
        <Text style={styles.reasonAlertText}>{text}</Text>
      </View>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <View style={styles.cardWrap}>
          <View style={styles.card}>
            {/* Signature amber glow at the top — same pattern HomeScreen,
                MembershipScreen, DataConsentModal use. Replaces the
                heavier brown gradient that felt off-brand against the
                rest of the app's clean dark surfaces. */}
            <LinearGradient
              colors={[colors.amberGlow, 'transparent']}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
              style={styles.glow}
              pointerEvents="none"
            />

            {/* Close (top-right) */}
            <Pressable
              onPress={onClose}
              hitSlop={12}
              style={styles.closeBtn}
            >
              <Feather name="x" size={18} color={colors.textMuted} />
            </Pressable>

            {/* Hero icon */}
            <View style={styles.iconBubble}>
              <Text style={styles.iconEmoji}>{iconEmoji}</Text>
            </View>

            {/* Tier chip */}
            <View style={styles.tierChip}>
               <Feather name="zap" size={11} color={colors.amber} />
               <Text style={tierChipText}>RESERVED FOR {tierLabel}</Text>
            </View>

            {/* Title */}
            <Text style={styles.title}>{title}</Text>

            {/* Body */}
            <Text style={styles.body}>{body}</Text>

            {/* Benefits list */}
            <View style={styles.benefitsBox}>
              {benefits.map((b, i) => (
                <View key={i} style={styles.benefitRow}>
                  <Text style={styles.benefitIcon}>{b.icon}</Text>
                  <Text style={styles.benefitText}>{b.text}</Text>
                </View>
              ))}
            </View>

            {/* Reason Alert */}
            {renderReasonAlert()}

            {/* Buttons */}
            <Pressable
              style={({ pressed }) => [
                styles.ctaBtn,
                pressed && { opacity: 0.88 },
              ]}
              onPress={onUpgrade}
            >
              <Feather name="arrow-up-circle" size={16} color="#1A1410" />
              <Text style={styles.ctaText}>{finalCtaText}</Text>
            </Pressable>

            <Pressable
              onPress={onClose}
              style={({ pressed }) => [
                styles.cancelBtn,
                pressed && { opacity: 0.6 },
              ]}
            >
              <Text style={styles.cancelText}>{cancelText}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.78)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  cardWrap: {
    width: '100%',
    maxWidth: 380,
  },
  // Amber glow that bleeds down from the top of the card — matches the
  // signature surface across the rest of the app (HomeScreen,
  // DataConsentModal, SuccessModal).
  glow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 240,
  },
  card: {
    backgroundColor: colors.background,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: 'rgba(236, 200, 122, 0.3)',
    padding: spacing.lg,
    overflow: 'hidden',
    alignItems: 'center',
  },

  closeBtn: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },

  iconBubble: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(236, 200, 122, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(236, 200, 122, 0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  iconEmoji: {
    fontSize: 32,
  },

  tierChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: spacing.md,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: 'rgba(236, 200, 122, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(236, 200, 122, 0.35)',
    borderRadius: radius.full,
  },
  tierChipText: {
    fontSize: 10,
    color: colors.amberLight,
    fontWeight: '800',
    letterSpacing: 1,
  },

  title: {
    fontSize: 22,
    fontWeight: '900',
    color: colors.text,
    marginTop: spacing.sm,
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  body: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 6,
    textAlign: 'center',
    lineHeight: 19,
    paddingHorizontal: spacing.sm,
  },

  benefitsBox: {
    width: '100%',
    marginTop: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: 10,
  },
  benefitRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  benefitIcon: {
    fontSize: 16,
    width: 22,
  },
  benefitText: {
    flex: 1,
    fontSize: 13,
    color: colors.text,
    fontWeight: '600',
    lineHeight: 19,
  },

  ctaBtn: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.amber,
    paddingVertical: 14,
    borderRadius: radius.full,
    marginTop: spacing.lg,
    shadowColor: colors.amber,
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  ctaText: {
    fontSize: 15,
    fontWeight: '900',
    color: '#1A1410',
    letterSpacing: 0.3,
  },
  cancelBtn: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    marginTop: 4,
  },
  cancelText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textMuted,
  },
  reasonAlert: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(236, 200, 122, 0.06)',
    borderColor: 'rgba(236, 200, 122, 0.25)',
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  reasonAlertText: {
    flex: 1,
    fontSize: 12,
    color: colors.amberLight,
    fontWeight: '500',
    lineHeight: 17,
  },
});
const tierChipText = styles.tierChipText; // Fixes compilation issue in style sheet
