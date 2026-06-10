/**
 * Scan Coaching Overlay (Trick C1 — Framing/Quality Layer).
 *
 * Sits inside ScanScreen above the 1:1 framing guide. Shows:
 *
 *   1. A live "readiness" pill that flips state based on motion stability:
 *        🔴 ขยับมือเยอะ — สั่นให้พอ
 *        🟡 ใกล้พร้อม...
 *        🟢 พร้อมถ่ายแล้ว!
 *
 *   2. A coaching hint that rotates every ~3 seconds with tip text. Tips
 *      are static educational copy — they don't depend on AI inference,
 *      so they ship without any model dependency. (Real-time AI hints
 *      will arrive when DINOv3 lands on-device in C2 phase.)
 *
 *   3. A countdown ring around the shutter (rendered separately in
 *      ScanScreen — this component exposes the `stable` signal via
 *      props so the shutter can render its own glow).
 *
 * Design constraints:
 *   - Must not block the framing guide corners — positioned ABOVE the
 *     guide, between the badge bar and the corners.
 *   - Text must be readable on any backdrop. Uses heavy text shadow + semi-opaque pill.
 *   - Auto-hides when busy (during capture). Stays out of the way.
 */

import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing } from '../lib/theme';
import type { StabilityState } from '../lib/useMotionStability';
import { useLanguage } from '../lib/localization';

interface Props {
  stability: StabilityState;
  /** When true, suppress the overlay (e.g. while capturing). */
  hidden?: boolean;
  /** Optional: number of photo slots still empty — adjusts tip set. */
  remainingSlots?: number;
  /** True if AUTO mode is armed — pill text changes to telegraph that
   *  reaching the green state will trigger a capture, so the user
   *  isn't surprised when the shutter fires on its own. */
  autoArmed?: boolean;
}

// Static educational tips. Rotated every ~3.5s. Order is intentional:
// strongest signals first (lighting + steady), then framing + cleanliness.
const TIPS_EN: string[] = [
  '💡 Find bright lighting — natural light is ideal',
  '✋ Hold steady & center the timepiece inside the frame',
  '📏 Keep camera distance at 6-10 inches (15-25 cm)',
  '🚫 Avoid heavy shadows & harsh reflections',
  '🪞 Use a neutral, solid, clutter-free background',
  '🔍 Ensure the entire watch body is fully visible',
];

const TIPS_TH: string[] = [
  '💡 หาพื้นที่แสงสว่างเพียงพอ — แสงธรรมชาติเหมาะสมที่สุด',
  '✋ ถือกล้องให้นิ่งและจัดตำแหน่งนาฬิกาให้อยู่ในกรอบ',
  '📏 รักษาระยะห่างของกล้องประมาณ 6-10 นิ้ว (15-25 ซม.)',
  '🚫 หลีกเลี่ยงเงาสะท้อนที่บดบังและแสงที่แรงเกินไป',
  '🪞 เลือกใช้พื้นหลังสีพื้นเรียบ ไม่มีสิ่งของรบกวน',
  '🔍 ตรวจสอบให้แน่ใจว่าตัวเรือนนาฬิกาแสดงครบถ้วนชัดเจน',
];

const TIP_ROTATE_MS = 3500;

export function ScanCoachingOverlay({
  stability,
  hidden,
  remainingSlots,
  autoArmed,
}: Props) {
  const { lang } = useLanguage();
  const tips = lang === 'th' ? TIPS_TH : TIPS_EN;
  const [tipIdx, setTipIdx] = useState(0);
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const pulseAnim = useRef(new Animated.Value(0)).current;

  // Rotate tips on a fixed cadence. Fade out + swap + fade in.
  useEffect(() => {
    if (hidden) return;
    const interval = setInterval(() => {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 280,
        useNativeDriver: true,
      }).start(() => {
        setTipIdx((i) => (i + 1) % tips.length);
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 280,
          useNativeDriver: true,
        }).start();
      });
    }, TIP_ROTATE_MS);
    return () => clearInterval(interval);
  }, [hidden, fadeAnim, tips.length]);

  // Pulse glow on the "stable" pill — subtle breathing effect at 1 Hz
  // when we're in the green state.
  useEffect(() => {
    if (stability !== 'stable') {
      pulseAnim.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 700,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0,
          duration: 700,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [stability, pulseAnim]);

  if (hidden) return null;

  const pill = pillContent(stability, lang, autoArmed);
  const pulseScale = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.06],
  });
  const pulseOpacity = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.85, 1],
  });

  return (
    <View pointerEvents="none" style={styles.wrap}>
      <Animated.View
        style={[
          styles.pill,
          { backgroundColor: pill.bg, borderColor: pill.border },
          stability === 'stable' && {
            transform: [{ scale: pulseScale }],
            opacity: pulseOpacity,
          },
        ]}
      >
        <Text style={[styles.pillText, { color: pill.fg }]}>{pill.label}</Text>
      </Animated.View>

      <Animated.Text
        style={[styles.tip, { opacity: fadeAnim }]}
        numberOfLines={1}
      >
        {tips[tipIdx]}
      </Animated.Text>

      {remainingSlots !== undefined && remainingSlots > 0 && (
        <Text style={styles.remaining} numberOfLines={1}>
          {remainingSlots} {lang === 'th' ? 'สล็อตเหลืออยู่' : (remainingSlots === 1 ? 'slot left' : 'slots left')}
        </Text>
      )}
    </View>
  );
}
 
function pillContent(
  state: StabilityState,
  lang: string,
  autoArmed?: boolean
): { label: string; bg: string; fg: string; border: string } {
  switch (state) {
    case 'stable':
      return {
        label: autoArmed 
          ? (lang === 'th' ? '📸 กำลังบันทึกอัตโนมัติ...' : '📸 AUTO CAPTURING...') 
          : (lang === 'th' ? '🟢 พร้อมสแกนแล้ว!' : '🟢 READY TO CAPTURE'),
        bg: 'rgba(74, 222, 128, 0.92)',
        fg: '#0A0805',
        border: colors.success,
      };
    case 'stabilizing':
      return {
        label: autoArmed 
          ? (lang === 'th' ? '🟡 กำลังนิ่งกล้อง (อัตโนมัติ)...' : '🟡 STABILIZING (AUTO)...') 
          : (lang === 'th' ? '🟡 กำลังปรับตำแหน่งกล้อง...' : '🟡 STABILIZING...'),
        bg: 'rgba(245, 158, 11, 0.92)',
        fg: '#0A0805',
        border: '#F59E0B',
      };
    case 'unstable':
    default:
      return {
        label: lang === 'th' ? '✋ กรุณาถือกล้องให้นิ่ง' : '✋ HOLD STEADY',
        bg: 'rgba(0,0,0,0.55)',
        fg: '#fff',
        border: 'rgba(255,255,255,0.4)',
      };
  }
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: '50%',
    left: 0,
    right: 0,
    marginTop: -220, // Sits comfortably above the 240x240 frame (which goes from -120 to +120)
    alignItems: 'center',
    gap: spacing.xs,
  },
  pill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.full,
    borderWidth: 1.5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 6,
  },
  pillText: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  tip: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(0,0,0,0.55)',
    textShadowColor: 'rgba(0,0,0,0.9)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
    overflow: 'hidden',
  },
  remaining: {
    color: colors.amberLight,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
    textShadowColor: 'rgba(0,0,0,0.9)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
});
