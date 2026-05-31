import React, { useEffect, useMemo, useRef } from 'react';
import { View, Text, Pressable, Animated, Easing, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { colors, spacing } from '../../lib/theme';
import { SavedWatch } from '../../lib/types';

/**
 * WatchWinder — renders the saved collection as a luxury automatic watch-winder
 * cabinet: a dark glass case with a 3-column grid of chrome-ringed winder cups,
 * each holding a watch that rotates continuously (the "automatic" winding
 * motion). Empty cups pad the grid so it always reads as a full cabinet.
 */

const MIN_SLOTS = 9;      // 3×3 — matches a real 9-winder cabinet even when emptier
const COLS = 3;
const SPIN_MS = 9000;     // one full revolution — slow, like a real winder

type Props = {
  watches: SavedWatch[];
  onOpen: (w: SavedWatch) => void;
  lang: 'th' | 'en';
};

export default function WatchWinder({ watches, onOpen, lang }: Props) {
  // One shared driver for all cups (native-driven, cheap). Alternating cups
  // spin opposite directions for a more mechanical, less uniform look.
  const spin = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const anim = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: SPIN_MS,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    anim.start();
    return () => anim.stop();
  }, [spin]);

  const rotateCW = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const rotateCCW = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '-360deg'] });

  // Pad to a full grid: at least MIN_SLOTS, and always a whole number of rows.
  const slots = useMemo(() => {
    const target = Math.max(MIN_SLOTS, Math.ceil(watches.length / COLS) * COLS);
    const arr: (SavedWatch | null)[] = [...watches];
    while (arr.length < target) arr.push(null);
    return arr;
  }, [watches]);

  return (
    <View style={styles.cabinet}>
      <LinearGradient colors={['#15110D', '#0A0807', '#171210']} style={StyleSheet.absoluteFillObject} />

      {/* Header brass plate */}
      <View style={styles.header}>
        <Feather name="refresh-cw" size={13} color={colors.amber} style={{ marginRight: 7 }} />
        <Text style={styles.headerText}>
          {lang === 'th' ? 'ตู้หมุนนาฬิกาอัตโนมัติ' : 'AUTOMATIC WATCH WINDER'}
        </Text>
      </View>

      {/* Winder cups grid */}
      <View style={styles.grid}>
        {slots.map((w, i) => (
          <WinderCup
            key={w ? w.id : `empty-${i}`}
            watch={w}
            rotate={i % 2 === 0 ? rotateCW : rotateCCW}
            onOpen={onOpen}
          />
        ))}
      </View>

      {/* Cosmetic control panel (LCD + buttons) — mirrors a real winder fascia */}
      <View style={styles.panelRow}>
        <View style={styles.lcd}>
          <Text style={styles.lcdLabel}>TPD</Text>
          <Text style={styles.lcdValue}>650</Text>
        </View>
        <View style={styles.btnPanel}>
          {(['power', 'rotate-cw', 'clock', 'moon', 'settings'] as const).map((ic) => (
            <View key={ic} style={styles.fasciaBtn}>
              <Feather name={ic === 'rotate-cw' ? 'rotate-cw' : ic === 'clock' ? 'clock' : ic === 'moon' ? 'moon' : ic === 'settings' ? 'settings' : 'power'} size={11} color="#6FA8DC" />
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

function WinderCup({
  watch,
  rotate,
  onOpen,
}: {
  watch: SavedWatch | null;
  rotate: Animated.AnimatedInterpolation<string>;
  onOpen: (w: SavedWatch) => void;
}) {
  const uri = watch?.processedFrontUri || watch?.frontUri;
  return (
    <Pressable
      style={styles.cupWrap}
      disabled={!watch}
      onPress={() => watch && onOpen(watch)}
    >
      {/* Chrome ring */}
      <LinearGradient
        colors={['#E8E8EC', '#9A9AA0', '#5A5A60', '#C8C8CE']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.chromeRing}
      >
        {/* Dark velvet cup */}
        <View style={styles.cup}>
          <LinearGradient
            colors={['#1A1A1E', '#050505']}
            style={StyleSheet.absoluteFillObject}
          />
          {uri ? (
            <Animated.Image
              source={{ uri }}
              style={[styles.watchImg, { transform: [{ rotate }] }]}
              resizeMode="cover"
            />
          ) : (
            <Feather name="watch" size={26} color="rgba(236,200,122,0.18)" />
          )}
          {/* Glass glare highlight */}
          <LinearGradient
            colors={['rgba(255,255,255,0.18)', 'rgba(255,255,255,0)']}
            start={{ x: 0.1, y: 0 }}
            end={{ x: 0.6, y: 0.6 }}
            style={styles.glare}
            pointerEvents="none"
          />
        </View>
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  cabinet: {
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: 'rgba(180, 180, 188, 0.35)',
    overflow: 'hidden',
    padding: spacing.md,
    marginBottom: spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 6,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(236, 200, 122, 0.12)',
  },
  headerText: {
    color: colors.amber,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.6,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: spacing.md,
  },
  cupWrap: {
    width: '31.5%',
    aspectRatio: 1,
  },
  chromeRing: {
    flex: 1,
    borderRadius: 999,
    padding: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
  },
  cup: {
    flex: 1,
    borderRadius: 999,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.6)',
  },
  watchImg: {
    width: '88%',
    height: '88%',
    borderRadius: 999,
  },
  glare: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 999,
  },
  panelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  lcd: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    backgroundColor: '#0E2A4A',
    borderColor: '#2E6FB0',
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  lcdLabel: {
    color: '#6FA8DC',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
  },
  lcdValue: {
    color: '#AFE0FF',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 1,
  },
  btnPanel: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: '#0E2A4A',
    borderColor: '#2E6FB0',
    borderWidth: 1,
    borderRadius: 6,
    paddingVertical: 7,
    paddingHorizontal: 8,
  },
  fasciaBtn: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: 'rgba(111, 168, 220, 0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
