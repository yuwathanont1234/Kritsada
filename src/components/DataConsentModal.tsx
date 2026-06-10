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
import { grantDataConsent, revokeDataConsent } from '../lib/dataConsent';
import { useLanguage } from '../lib/localization';
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

/**
 * Honest opt-in copy — NO reward promises. The previous variants offered
 * "5 instant credits" for consenting, but the granted bonus fed a counter
 * that no quota gate reads (and FREE_SCAN_BONUS is 0 since the free AI tier
 * was cut), so users surrendered PDPA consent and received nothing. All
 * three contexts now make the same truthful ask. Bilingual: PDPA consent
 * must be understandable to the data subject, and the app defaults to Thai.
 */
type CopyVariant = { title: string; subtitle: string; missionLabel: string; ctaLabel: string };
const COPY: Record<'en' | 'th', Record<ConsentContext, CopyVariant>> = (() => {
  const en: CopyVariant = {
    title: 'Help Improve the AI?',
    subtitle:
      'Optionally share anonymized scan metrics so our team can tune the diagnostic models.\nEntirely voluntary — nothing changes about your plan either way.',
    missionLabel: 'Your metrics directly sharpen counterfeit detection for every collector',
    ctaLabel: 'Opt In & Share Metrics',
  };
  const th: CopyVariant = {
    title: 'ช่วยพัฒนา AI ของเราไหม?',
    subtitle:
      'ร่วมแชร์สถิติการสแกนแบบไม่ระบุตัวตน เพื่อให้ทีมงานปรับจูนโมเดลวินิจฉัยให้แม่นยำขึ้น\nเป็นความสมัครใจล้วน ๆ — แพ็กเกจของคุณไม่เปลี่ยนแปลงไม่ว่าจะเลือกทางใด',
    missionLabel: 'ข้อมูลของคุณช่วยให้ระบบจับของปลอมได้แม่นยำขึ้นสำหรับนักสะสมทุกคน',
    ctaLabel: 'ยินยอมแชร์สถิติ',
  };
  return {
    en: { initial: en, 'quota-wall': en, nudge: en },
    th: { initial: th, 'quota-wall': th, nudge: th },
  };
})();
 
export function DataConsentModal({
  visible,
  onDecided,
  onClose,
  context = 'initial',
  remainingScans,
}: Props) {
  const { lang } = useLanguage();
  const th = lang === 'th';
  const [submitting, setSubmitting] = useState(false);
  const copy = COPY[lang][context] ?? COPY[lang].initial;
 
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
            {/* Hero bubble — partnership, not a gift (there is no reward) */}
            <View style={s.heroWrap}>
              <View style={s.heroBubble}>
                <Text style={s.heroEmoji}>🤝</Text>
              </View>
            </View>
 
            {/* Optional inline counter — only for 'nudge' context */}
            {context === 'nudge' && typeof remainingScans === 'number' && (
              <View style={s.counterChip}>
                <Feather name="alert-circle" size={12} color={colors.amber} />
                <Text style={s.counterChipText}>
                  {th ? `เหลือสิทธิ์สแกน ${remainingScans} ครั้ง` : `${remainingScans} scans remaining`}
                </Text>
              </View>
            )}
 
            <Text style={s.title}>{copy.title}</Text>
            <Text style={s.subtitle}>{copy.subtitle}</Text>
 
            {/* Mission chip (replaces the old fake "reward" chip) */}
            <View style={s.rewardChip}>
              <Feather name="trending-up" size={16} color="#1A1410" />
              <Text style={s.rewardText}>{copy.missionLabel}</Text>
            </View>

            {/* Two-column transparency */}
            <View style={s.twoColRow}>
              <View style={s.col}>
                <Text style={s.colTitle}>{th ? '📊 ข้อมูลที่เก็บ' : '📊 Collected Metrics'}</Text>
                <CompactBullet text={th ? 'แบรนด์ รุ่น และรหัสอ้างอิง' : 'Brand, model, & reference tags'} />
                <CompactBullet text={th ? 'คะแนนความเชื่อมั่นของ AI' : 'AI confidence scores'} />
                <CompactBullet text={th ? 'เวอร์ชันของแอป' : 'Application client version'} />
              </View>

              <View style={s.col}>
                <Text style={s.colTitle}>{th ? '🚫 ไม่เก็บเด็ดขาด' : '🚫 Never Collected'}</Text>
                <CompactBullet text={th ? 'ชื่อ อีเมล หรือเบอร์โทรศัพท์' : 'Names, emails, or phone numbers'} negative />
                <CompactBullet text={th ? 'ไฟล์ภาพนาฬิกาความละเอียดสูง' : 'Original high-res watch photos'} negative />
                <CompactBullet text={th ? 'พิกัด GPS หรือที่อยู่' : 'GPS coordinates or physical addresses'} negative />
                <CompactBullet text={th ? 'ประวัติการใช้งานแอปอื่น ๆ' : 'Other application usage history'} negative />
              </View>
            </View>

            {/* Use-case section */}
            <View style={s.section}>
              <Text style={s.sectionTitle}>{th ? '🎯 นำไปใช้เพื่อ' : '🎯 Ultimate Objectives'}</Text>
              <Bullet text={th ? 'ฝึกและปรับจูนโมเดลวิเคราะห์ภาพ DINOv3' : 'Train and optimize DINOv3 visual layers'} />
              <Bullet text={th ? 'ตรวจจับรูปแบบของปลอมและงานเลียนแบบรุ่นใหม่ ๆ' : 'Detect emerging counterfeit patterns and replicas'} />
            </View>

            {/* Trust note */}
            <View style={s.trustNote}>
              <Feather name="info" size={14} color={colors.textMuted} />
              <Text style={s.trustText}>
                {th
                  ? 'เป็นทางเลือกโดยสมบูรณ์ — ปฏิเสธได้โดยไม่กระทบการใช้งานตามแพ็กเกจของคุณ เปลี่ยนใจได้ทุกเมื่อที่การตั้งค่า หรือขอให้ลบข้อมูลสถิติที่เคยแชร์ทั้งหมดได้'
                  : 'Completely optional — declining changes nothing about your plan. Toggle consent under Settings, or request full deletion of previously shared metrics.'}
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
                {submitting ? (th ? 'กำลังบันทึก...' : 'Saving...') : copy.ctaLabel}
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
              <Text style={s.btnDeclineText}>{th ? 'ไม่ยินยอม' : 'Decline'}</Text>
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
