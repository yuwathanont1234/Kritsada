/**
 * ScanningImageAnimation — show user's photos cycling with multi-layer
 * "AI is examining the watch" animation. Used during AI analysis loading.
 *
 * Layers (back → front):
 *   1. Photo (zoomed 1.4× to focus on the dial/case, background fades)
 *   2. Dim overlay
 *   3. Holographic glow ring — pulsing gold/amber halo around frame
 *   4. Mechanical chronometer & tourbillon gear overlay — rotating SVG mechanism
 *   5. Scanner line — gradient amber sweep top↔bottom
 *   6. Particle stream — 6 floating gold dots orbiting the watch dial
 *   7. Corner brackets — viewfinder framing
 *
 * Designed to keep working even if only `front` is provided.
 */

import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Line, G } from 'react-native-svg';
import { colors, radius } from '../lib/theme';

const AnimatedG = Animated.createAnimatedComponent(G) as any;

type Props = {
  /** All images to cycle through — front first, then back, then gallery. */
  images: string[];
  /** Diameter of the framed image area. Default 320. */
  size?: number;
  /** ms per image before crossfading to next. Default 2800. */
  cycleMs?: number;
};

const DEFAULT_SIZE = 320;
const DEFAULT_CYCLE_MS = 2800;
const SCAN_DURATION_MS = 1600;
const FADE_DURATION_MS = 320;
// Inner zoom on the displayed photo so the watch body fills the frame.
const PHOTO_DISPLAY_SCALE = 1.4;

export function ScanningImageAnimation({
  images,
  size = DEFAULT_SIZE,
  cycleMs = DEFAULT_CYCLE_MS,
}: Props) {
  const validImages = images.filter((u) => u && u.length > 0);
  const [activeIdx, setActiveIdx] = useState(0);

  const fadeAnim = useRef(new Animated.Value(1)).current;
  const scanAnim = useRef(new Animated.Value(0)).current;
  const glowAnim = useRef(new Animated.Value(0.4)).current;
  const gearRotate = useRef(new Animated.Value(0)).current;
  const secondaryGearRotate = useRef(new Animated.Value(0)).current;
  const particleAnim = useRef(new Animated.Value(0)).current;

  // ── Scanner line: continuous top → bottom loop ─────────────────────────
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scanAnim, {
          toValue: 1,
          duration: SCAN_DURATION_MS,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(scanAnim, {
          toValue: 0,
          duration: 0,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [scanAnim]);

  // ── Holographic glow: luxury gold halo breathes ─────────────────────────
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, {
          toValue: 1,
          duration: 1500,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(glowAnim, {
          toValue: 0.4,
          duration: 1500,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [glowAnim]);

  // ── Gear Rotation: primary wheel (clockwise) and offset escapement (counter-clockwise) ──
  useEffect(() => {
    const primary = Animated.loop(
      Animated.timing(gearRotate, {
        toValue: 1,
        duration: 20000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    const secondary = Animated.loop(
      Animated.timing(secondaryGearRotate, {
        toValue: 1,
        duration: 8000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    primary.start();
    secondary.start();
    return () => {
      primary.stop();
      secondary.stop();
    };
  }, [gearRotate, secondaryGearRotate]);

  // ── Particle orbit: dots float around the frame ───────────────────
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(particleAnim, {
        toValue: 1,
        duration: 4000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [particleAnim]);

  // ── Image cycler: crossfade to next every `cycleMs` ────────────────────
  useEffect(() => {
    if (validImages.length <= 1) return;
    const interval = setInterval(() => {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: FADE_DURATION_MS,
        useNativeDriver: true,
      }).start(() => {
        setActiveIdx((i) => (i + 1) % validImages.length);
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: FADE_DURATION_MS,
          useNativeDriver: true,
        }).start();
      });
    }, cycleMs);
    return () => clearInterval(interval);
  }, [validImages.length, cycleMs, fadeAnim]);

  if (validImages.length === 0) {
    return <View style={[styles.frame, { width: size, height: size }]} />;
  }

  const lineTranslateY = scanAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-size / 2 + 4, size / 2 - 4],
  });
  const lineOpacity = scanAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.6, 1, 0.6],
  });

  const glowOpacity = glowAnim;
  const glowScale = glowAnim.interpolate({
    inputRange: [0.4, 1],
    outputRange: [1.0, 1.04],
  });

  const gearSpin = gearRotate.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const secondaryGearSpin = secondaryGearRotate.interpolate({
    inputRange: [0, 1],
    outputRange: ['360deg', '0deg'],
  });

  const orbitR = size / 2 - 22;
  const particles = Array.from({ length: 6 }, (_, i) => {
    const baseAngle = (i * 60 * Math.PI) / 180;
    return particleAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [baseAngle, baseAngle + 2 * Math.PI],
    });
  });

  // Renders 12 fine-line ticks representing luxury watch dial indexes
  const renderDialTicks = () => {
    const ticks = [];
    for (let i = 0; i < 12; i++) {
      const angle = (i * 30 * Math.PI) / 180;
      const x1 = Math.cos(angle) * 41;
      const y1 = Math.sin(angle) * 41;
      const x2 = Math.cos(angle) * 45;
      const y2 = Math.sin(angle) * 45;
      ticks.push(
        <Line
          key={i}
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
          stroke={colors.gold}
          strokeWidth={i % 3 === 0 ? '0.6' : '0.3'}
        />
      );
    }
    return ticks;
  };

  return (
    <View style={[styles.outer, { width: size + 32, height: size + 32 }]}>
      {/* Holographic glow ring behind the frame */}
      <Animated.View
        style={[
          styles.glow,
          {
            width: size + 24,
            height: size + 24,
            borderRadius: radius.lg + 12,
            opacity: glowOpacity,
            transform: [{ scale: glowScale }],
          },
        ]}
        pointerEvents="none"
      />

      <View style={[styles.frame, { width: size, height: size, borderRadius: radius.lg }]}>
        {/* Photo layer */}
        <Animated.View style={[styles.imageWrap, { opacity: fadeAnim }]}>
          <Image
            source={{ uri: validImages[activeIdx] }}
            style={[
              styles.image,
              { transform: [{ scale: PHOTO_DISPLAY_SCALE }] },
            ]}
            resizeMode="contain"
          />
        </Animated.View>

        <View style={styles.dimOverlay} pointerEvents="none" />

        {/* Watch Mechanical Tourbillon Overlay */}
        <Animated.View
          style={[
            StyleSheet.absoluteFillObject,
            { opacity: 0.35 },
          ]}
          pointerEvents="none"
        >
          <Svg width="100%" height="100%" viewBox="-50 -50 100 100">
            {/* Dial Ticks (Static Outer Frame) */}
            <G>{renderDialTicks()}</G>

            {/* Main Center Tourbillon Wheel (Slow Clockwise Spin) */}
            <AnimatedG style={{ transform: [{ rotate: gearSpin }] }}>
              {/* Outer dial ring */}
              <Circle
                cx="0"
                cy="0"
                r="40"
                fill="none"
                stroke={colors.gold}
                strokeWidth="0.4"
                strokeDasharray="1.5,1.5"
              />
              <Circle
                cx="0"
                cy="0"
                r="35"
                fill="none"
                stroke={colors.gold}
                strokeWidth="0.3"
              />
              <Circle
                cx="0"
                cy="0"
                r="24"
                fill="none"
                stroke={colors.gold}
                strokeWidth="0.2"
                strokeDasharray="3,1.5"
              />
              {/* Gear teeth arms */}
              <Line x1="0" y1="-35" x2="0" y2="35" stroke={colors.gold} strokeWidth="0.2" />
              <Line x1="-35" y1="0" x2="35" y2="0" stroke={colors.gold} strokeWidth="0.2" />
              <Circle cx="0" cy="0" r="1.5" fill={colors.gold} />
            </AnimatedG>

            {/* Escapement Wheel (Offset, Fast Counter-Clockwise Spin) */}
            <AnimatedG style={{ transform: [{ rotate: secondaryGearSpin }] }}>
              <Circle
                cx="-12"
                cy="-12"
                r="14"
                fill="none"
                stroke={colors.gold}
                strokeWidth="0.35"
                strokeDasharray="1,1"
              />
              <Circle
                cx="-12"
                cy="-12"
                r="8"
                fill="none"
                stroke={colors.gold}
                strokeWidth="0.2"
              />
              <Line x1="-12" y1="-26" x2="-12" y2="2" stroke={colors.gold} strokeWidth="0.15" />
              <Line x1="-26" y1="-12" x2="2" y2="-12" stroke={colors.gold} strokeWidth="0.15" />
            </AnimatedG>
          </Svg>
        </Animated.View>

        {/* Scanner line */}
        <Animated.View
          style={[
            styles.scanLine,
            {
              transform: [{ translateY: lineTranslateY }],
              opacity: lineOpacity,
            },
          ]}
          pointerEvents="none"
        >
          <LinearGradient
            colors={['transparent', colors.gold + 'CC', colors.gold, colors.gold + 'CC', 'transparent']}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={styles.scanLineGradient}
          />
        </Animated.View>

        {/* Particle orbit */}
        {particles.map((angle, i) => (
          <Animated.View
            key={i}
            style={[
              styles.particle,
              {
                left: size / 2 - 3,
                top: size / 2 - 3,
                transform: [
                  {
                    translateX: angle.interpolate({
                      inputRange: [0, 2 * Math.PI],
                      outputRange: [
                        Math.cos(0) * orbitR,
                        Math.cos(2 * Math.PI) * orbitR,
                        ],
                      extrapolate: 'clamp',
                    }) as any,
                  },
                  {
                    translateY: angle.interpolate({
                      inputRange: [0, 2 * Math.PI],
                      outputRange: [
                        Math.sin(0) * orbitR,
                        Math.sin(2 * Math.PI) * orbitR,
                        ],
                      extrapolate: 'clamp',
                    }) as any,
                  },
                ],
              },
            ]}
            pointerEvents="none"
          />
        ))}

        {/* Corner brackets */}
        <View style={[styles.corner, styles.cornerTL]} pointerEvents="none" />
        <View style={[styles.corner, styles.cornerTR]} pointerEvents="none" />
        <View style={[styles.corner, styles.cornerBL]} pointerEvents="none" />
        <View style={[styles.corner, styles.cornerBR]} pointerEvents="none" />

        {/* Page indicator dots */}
        {validImages.length > 1 && (
          <View style={styles.dotsWrap} pointerEvents="none">
            {validImages.map((_, i) => (
              <View
                key={i}
                style={[
                  styles.dot,
                  i === activeIdx && styles.dotActive,
                ]}
              />
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

const CORNER_SIZE = 18;
const CORNER_THICK = 2.5;
const CORNER_INSET = 8;

const styles = StyleSheet.create({
  outer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  glow: {
    position: 'absolute',
    backgroundColor: colors.gold + '15',
    borderWidth: 1.5,
    borderColor: colors.gold + '66',
  },
  frame: {
    overflow: 'hidden',
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderWidth: 1,
    borderColor: 'rgba(236, 200, 122, 0.3)',
  },
  imageWrap: {
    ...StyleSheet.absoluteFillObject,
  },
  image: { width: '100%', height: '100%' },

  dimOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.18)',
  },

  scanLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '50%',
    height: 3,
    marginTop: -1.5,
  },
  scanLineGradient: {
    flex: 1,
    height: 3,
  },

  particle: {
    position: 'absolute',
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.gold,
    shadowColor: colors.gold,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 4,
  },

  corner: {
    position: 'absolute',
    width: CORNER_SIZE,
    height: CORNER_SIZE,
    borderColor: colors.gold,
  },
  cornerTL: {
    top: CORNER_INSET,
    left: CORNER_INSET,
    borderTopWidth: CORNER_THICK,
    borderLeftWidth: CORNER_THICK,
    borderTopLeftRadius: 4,
  },
  cornerTR: {
    top: CORNER_INSET,
    right: CORNER_INSET,
    borderTopWidth: CORNER_THICK,
    borderRightWidth: CORNER_THICK,
    borderTopRightRadius: 4,
  },
  cornerBL: {
    bottom: CORNER_INSET,
    left: CORNER_INSET,
    borderBottomWidth: CORNER_THICK,
    borderLeftWidth: CORNER_THICK,
    borderBottomLeftRadius: 4,
  },
  cornerBR: {
    bottom: CORNER_INSET,
    right: CORNER_INSET,
    borderBottomWidth: CORNER_THICK,
    borderRightWidth: CORNER_THICK,
    borderBottomRightRadius: 4,
  },

  dotsWrap: {
    position: 'absolute',
    bottom: 10,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 5,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
  dotActive: {
    backgroundColor: colors.gold,
    width: 18,
  },
});
