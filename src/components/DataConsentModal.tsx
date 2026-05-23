/**
 * Data Contribution Consent Modal — the explicit opt-in surface for the
 * scan-analytics data flywheel.
 *
 * Three contexts (caller picks):
 *   • 'initial'     — generic ask (legacy / fallback)
 *   • 'quota-wall'  — user just hit their monthly cap, hot moment
 *   • 'nudge'       — user has 1-2 free scans left, soft nudge
 *
 * Tone: friend recommending a friend, not corporate speak.
 */
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  BONUS_SCANS_PER_MONTH,
  grantDataConsent,
  revokeDataConsent,
} from '../lib/dataConsent';
import { colors, radius, spacing } from '../lib/theme';

export type ConsentContext = 'initial' | 'quota-wall' | 'nudge';

type Props = {
  visible: boolean;
  onDecided: (granted: boolean) => void;
  onClose: () => void;
  /** What triggered the modal — drives copy variant. Default 'initial'. */
  context?: ConsentContext;
  /** Free scans remaining — only relevant for 'nudge' context. */
  remainingScans?: number;
};

/** Friend-tone copy keyed by context. Each variant is purpose-built. */
const COPY: Record<
  ConsentContext,
  { title: string; subtitle: string; rewardLabel: string; ctaLabel: string }
> = {
  initial: {
    title: 'Partner With Us? 🤝',
    subtitle:
      'Help the Luxury Authenticator team optimize our neural models.\nYour anonymized feedback directly boosts diagnostic accuracy.',
    rewardLabel: `As a token of appreciation — receive ${BONUS_SCANS_PER_MONTH} free credits`,
    ctaLabel: `Opt In & Claim ${BONUS_SCANS_PER_MONTH} Credits`,
  },
  'quota-wall': {
    title: 'Out of Credits? 🥺',
    subtitle:
      'Let us top you up for free! Optimize our neural models\nby sharing anonymous metrics and stay scanning.',
    rewardLabel: `Claim ${BONUS_SCANS_PER_MONTH} instant credits to continue diagnostics`,
    ctaLabel: `Accept & Receive ${BONUS_SCANS_PER_MONTH} Credits`,
  },
  nudge: {
    title: 'Want More Free Credits? 🎁',
    subtitle:
      'Support the Luxury Authenticator project\nby contributing diagnostic stats, and we\'ll credit your account.',
    rewardLabel: `Claim ${BONUS_SCANS_PER_MONTH} complimentary scan credits`,
    ctaLabel: `Join Cohort & Claim Credits`,
  },
};
 
export function DataConsentModal({
  visible,
  onDecided,
  onClose,
  context = 'initial',
  remainingScans,
}: Props) {
  const [submitting, setSubmitting] = useState(false);
  const copy = COPY[context];
 
  async function handleAllow() {
    setSubmitting(true);
    try {
      await grantDataConsent();
      onDecided(true);
    } catch (e) {
      console.warn('[DataConsentModal] grant failed', e);
    } finally {
      setSubmitting(false);
      onClose();
    }
  }
 
  async function handleDecline() {
    setSubmitting(true);
    try {
      await revokeDataConsent();
      onDecided(false);
    } finally {
      setSubmitting(false);
      onClose();
    }
  }
 
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={s.backdrop}>
        <View style={s.card}>
          {/* Signature amber glow at the top of the sheet */}
          <LinearGradient
            colors={[colors.amberGlow, 'transparent']}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={s.glow}
            pointerEvents="none"
          />
          <ScrollView
            contentContainerStyle={s.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* Hero gift bubble */}
            <View style={s.heroWrap}>
              <View style={s.heroBubble}>
                <Text style={s.heroEmoji}>🎁</Text>
              </View>
            </View>
 
            {/* Optional inline counter — only for 'nudge' context */}
            {context === 'nudge' && typeof remainingScans === 'number' && (
              <View style={s.counterChip}>
                <Feather name="alert-circle" size={12} color={colors.amber} />
                <Text style={s.counterChipText}>
                  {remainingScans} scans remaining
                </Text>
              </View>
            )}
 
            <Text style={s.title}>{copy.title}</Text>
            <Text style={s.subtitle}>{copy.subtitle}</Text>
 
            {/* Reward chip */}
            <View style={s.rewardChip}>
              <Feather name="gift" size={16} color="#1A1410" />
              <Text style={s.rewardText}>{copy.rewardLabel}</Text>
            </View>
 
            {/* Two-column transparency */}
            <View style={s.twoColRow}>
              <View style={s.col}>
                <Text style={s.colTitle}>📊 Collected Metrics</Text>
                <CompactBullet text="Brand, model, & reference tags" />
                <CompactBullet text="AI confidence scores" />
                <CompactBullet text="Application client version" />
              </View>
 
              <View style={s.col}>
                <Text style={s.colTitle}>🚫 Never Collected</Text>
                <CompactBullet text="Names, emails, or phone numbers" negative />
                <CompactBullet text="Original high-res watch photos" negative />
                <CompactBullet text="GPS coordinates or physical addresses" negative />
                <CompactBullet text="Other application usage history" negative />
              </View>
            </View>
 
            {/* Use-case section */}
            <View style={s.section}>
              <Text style={s.sectionTitle}>🎯 Ultimate Objectives</Text>
              <Bullet text="Train and optimize DINOv3 visual layers" />
              <Bullet text="Detect emerging counterfeit patterns and replicas" />
            </View>
 
            {/* Trust note */}
            <View style={s.trustNote}>
              <Feather name="info" size={14} color={colors.textMuted} />
              <Text style={s.trustText}>
                Completely Optional — Refuse at any time and scan normally with standard limits.
                Toggle consent under Settings, or request full deletion of previously shared metrics.
              </Text>
            </View>
          </ScrollView>
 
          {/* Footer — clean flat pill buttons */}
          <View style={s.footer}>
            <Pressable
              style={({ pressed }) => [
                s.btnAllow,
                pressed && { opacity: 0.88 },
              ]}
              onPress={handleAllow}
              disabled={submitting}
            >
              <Text style={s.btnAllowText}>
                {submitting ? 'Saving...' : copy.ctaLabel}
              </Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                s.btnDecline,
                pressed && { opacity: 0.55 },
              ]}
              onPress={handleDecline}
              disabled={submitting}
            >
              <Text style={s.btnDeclineText}>Decline</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function CompactBullet({ text, negative }: { text: string; negative?: boolean }) {
  return (
    <View style={s.compactBulletRow}>
      <Feather
        name={negative ? 'x' : 'check'}
        size={12}
        color={negative ? '#E57373' : '#81C784'}
        style={{ marginTop: 2 }}
      />
      <Text style={s.compactBulletText}>{text}</Text>
    </View>
  );
}

function Bullet({ text, negative }: { text: string; negative?: boolean }) {
  return (
    <View style={s.bulletRow}>
      <Feather
        name={negative ? 'x' : 'check'}
        size={16}
        color={negative ? '#E57373' : '#81C784'}
        style={{ marginTop: 2 }}
      />
      <Text style={s.bulletText}>{text}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  card: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    maxHeight: '92%',
    paddingTop: spacing.lg,
    borderTopWidth: 1,
    borderColor: 'rgba(236, 200, 122, 0.25)',
    overflow: 'hidden',
  },
  glow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 320,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },

  heroWrap: {
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  heroBubble: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: 'rgba(236, 200, 122, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(236, 200, 122, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroEmoji: {
    fontSize: 38,
  },

  counterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.full,
    backgroundColor: 'rgba(236, 200, 122, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(236, 200, 122, 0.3)',
    marginBottom: 8,
  },
  counterChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.amberLight,
    letterSpacing: 0.2,
  },

  title: {
    fontSize: 22,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'center',
    letterSpacing: -0.5,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 13,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: spacing.lg,
  },

  rewardChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    backgroundColor: colors.amber,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: radius.full,
    gap: 8,
    marginBottom: spacing.lg,
  },
  rewardText: {
    color: '#1A1410',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: -0.2,
  },

  twoColRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  col: {
    flex: 1,
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  colTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 10,
    letterSpacing: -0.2,
  },
  compactBulletRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 6,
    alignItems: 'flex-start',
  },
  compactBulletText: {
    flex: 1,
    fontSize: 11.5,
    color: colors.textMuted,
    lineHeight: 16,
  },

  section: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 10,
    letterSpacing: -0.2,
  },
  bulletRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 6,
    alignItems: 'flex-start',
  },
  bulletText: {
    flex: 1,
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 19,
  },

  trustNote: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
    backgroundColor: colors.surface,
    padding: spacing.sm + 2,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  trustText: {
    flex: 1,
    fontSize: 11.5,
    color: colors.textMuted,
    lineHeight: 17,
  },

  footer: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
  btnAllow: {
    flex: 1.7,
    height: 56,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.amber,
  },
  btnAllowText: {
    color: '#1A1410',
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: -0.3,
  },
  btnDecline: {
    flex: 1,
    height: 56,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.border,
  },
  btnDeclineText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '700',
  },
});
