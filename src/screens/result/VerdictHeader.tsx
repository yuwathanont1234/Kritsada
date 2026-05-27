import React, { useState } from 'react';
import { View, ScrollView, Text, Image, Pressable, StyleSheet, Dimensions } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, radius, spacing } from '../../lib/theme';
import { AuthColor } from '../../lib/authVerdictColor';
import { ScanResult } from '../../lib/types';
import { useLanguage } from '../../lib/localization';
import {
  getLandmarksForBrand,
  matchSignalToLandmark,
  LandmarkPoint,
} from '../../lib/data/watchLandmarks';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface VerdictHeaderProps {
  images: string[];
  authColor: AuthColor;
  probability: number;
  result: ScanResult;
  customName?: string;
  specsText: string;
  getVerdictLabel: (color: AuthColor) => string;
  t: (key: string, options?: any) => string;
}

export default function VerdictHeader({
  images,
  authColor,
  probability,
  result,
  customName,
  specsText,
  getVerdictLabel,
  t,
}: VerdictHeaderProps) {
  const { lang } = useLanguage();
  const [activeImageIdx, setActiveImageIdx] = useState(0);
  const [showHeatmap, setShowHeatmap] = useState(false);

  // ── Brand-aware landmark resolution + signal matching ──
  // Pull 5-7 landmark coordinates for this watch's brand (or generic
  // fallback). Match each landmark against Gemini's auth signals so
  // pins inherit the correct colour. `greenCount` powers the pass-
  // ratio header text ("6/7 PASS").
  const landmarks: LandmarkPoint[] = React.useMemo(
    () => getLandmarksForBrand(result.brand),
    [result.brand]
  );
  const signals = result.authenticitySignals ?? [];
  const greenCount = React.useMemo(() => {
    let c = 0;
    for (const lm of landmarks) {
      const m = matchSignalToLandmark(lm, signals);
      if (m && m.weight === 'positive') c++;
    }
    return c;
  }, [landmarks, signals]);
  const landmarkBrandLabel = (result.brand || (lang === 'th' ? 'ทั่วไป' : 'GENERIC')).toUpperCase();

  const getVerdictBorderColor = (color: AuthColor) => {
    switch (color) {
      case 'green': return '#22C55E';
      case 'yellow': return '#F59E0B';
      case 'red': return '#EF4444';
      default: return '#ECC87A';
    }
  };

  return (
    <View style={styles.container}>
      {/* Elegant Image Gallery Carousel with overlapping Verdict Badge */}
      <View style={styles.galleryContainer}>
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onScroll={(e) => {
            const x = e.nativeEvent.contentOffset.x;
            const idx = Math.round(x / e.nativeEvent.layoutMeasurement.width);
            setActiveImageIdx(idx);
          }}
          scrollEventThrottle={16}
          style={styles.galleryScroller}
        >
          {images.map((uri, idx) => (
            <View key={idx} style={styles.gallerySlide}>
              <View style={styles.imageWrapper}>
                <Image
                  source={{ uri }}
                  style={styles.galleryImg}
                  resizeMode="cover"
                />
                
                {/* Numbered AI landmark pins — only on the front photo
                    (idx 0). Each pin is positioned by % so it works for
                    any image aspect ratio. Colour reflects the matched
                    Gemini signal weight (positive→green, negative→red,
                    neutral→amber, no match→neutral gray). Numbered so
                    users can cross-reference against the cards below. */}
                {showHeatmap && activeImageIdx === 0 && (
                  <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
                    {landmarks.map((lm, idx) => {
                      const match = matchSignalToLandmark(lm, signals);
                      const colorPalette = match
                        ? match.weight === 'positive'
                          ? { bg: '#22C55E', shadow: '#22C55E' }
                          : match.weight === 'negative'
                          ? { bg: '#EF4444', shadow: '#EF4444' }
                          : { bg: '#F59E0B', shadow: '#F59E0B' }
                        : { bg: '#94A3B8', shadow: '#64748B' };
                      return (
                        <View
                          key={lm.id}
                          style={{
                            position: 'absolute',
                            left: `${lm.xPct}%`,
                            top: `${lm.yPct}%`,
                            transform: [{ translateX: -14 }, { translateY: -14 }],
                          }}
                        >
                          <View
                            style={{
                              width: 28,
                              height: 28,
                              borderRadius: 14,
                              backgroundColor: colorPalette.bg,
                              borderWidth: 2,
                              borderColor: 'rgba(255,255,255,0.9)',
                              justifyContent: 'center',
                              alignItems: 'center',
                              shadowColor: colorPalette.shadow,
                              shadowOffset: { width: 0, height: 2 },
                              shadowOpacity: 0.6,
                              shadowRadius: 4,
                              elevation: 5,
                            }}
                          >
                            <Text
                              style={{
                                color: '#0A0805',
                                fontSize: 13,
                                fontWeight: '900',
                                letterSpacing: 0,
                              }}
                            >
                              {idx + 1}
                            </Text>
                          </View>
                        </View>
                      );
                    })}
                    <View style={styles.heatmapLabelContainer}>
                      <Text style={styles.heatmapLabel}>
                        {lang === 'th'
                          ? `${greenCount}/${landmarks.length} ผ่าน • ${landmarkBrandLabel} HALLMARK`
                          : `${greenCount}/${landmarks.length} PASS • ${landmarkBrandLabel} HALLMARK`}
                      </Text>
                    </View>
                  </View>
                )}
              </View>
            </View>
          ))}
        </ScrollView>

        {images.length > 1 && (
          <View style={styles.galleryIndicator}>
            {images.map((_, i) => (
              <View
                key={i}
                style={[
                  styles.indicatorDot,
                  activeImageIdx === i && styles.indicatorDotActive,
                ]}
              />
            ))}
          </View>
        )}

        {/* Luxury double-bordered Verdict capsule Badge with soft aura glow */}
        {authColor && (
          <View style={styles.absoluteVerdictContainer}>
            <View
              style={[
                styles.verdictOuterBorder,
                {
                  borderColor: 'rgba(236, 200, 122, 0.35)',
                  shadowColor: getVerdictBorderColor(authColor),
                },
              ]}
            >
              <View style={[styles.verdictInnerBorder, { borderColor: getVerdictBorderColor(authColor) }]}>
                <Text style={styles.verdictMiniText}>{t('result.verdict')}</Text>
                <Text style={[styles.verdictMainText, { color: getVerdictBorderColor(authColor) }]}>
                  {getVerdictLabel(authColor)}
                </Text>
              </View>
            </View>
          </View>
        )}
      </View>

      {/* Hallmark Diagnostic Map Toggle (was "AI Heatmap" — renamed
          to use horology-native vocabulary that signals expert-grade
          authentication. "Hallmark" is the RSC/Sotheby's word for a
          maker's authenticity mark; "Diagnostic Map" frames the
          numbered landmark grid as medical-precision analysis. */}
      <View style={styles.heatmapToggleRow}>
        <View style={styles.heatmapTextContainer}>
          <Text style={styles.heatmapTitle}>{lang === 'th' ? 'แผนภาพตราประจำการตรวจสอบ' : 'Hallmark Diagnostic Map'}</Text>
          <Text style={styles.heatmapDesc}>{lang === 'th' ? 'แสดงตำแหน่งจุดตรวจสอบเฉพาะของแบรนด์ พร้อมรายงานสัญญาณ AI ต่อจุด' : 'Brand-specific authentication points with per-landmark AI signal report'}</Text>
        </View>
        <Pressable
          onPress={() => setShowHeatmap(!showHeatmap)}
          style={[styles.switchContainer, showHeatmap && styles.switchActive]}
        >
          <View style={[styles.switchKnob, showHeatmap && styles.switchKnobActive]} />
        </Pressable>
      </View>

      {/* Center-aligned Luxury Watch Details Section */}
      <View style={styles.watchDetailsBox}>
        <Text style={styles.watchBrand}>{result.brand?.toUpperCase() || 'ROLEX'}</Text>
        <Text style={styles.watchName}>{customName || result.name || 'Cosmograph Daytona'}</Text>
        <Text style={styles.watchRef}>{result.reference ? `Ref: ${result.reference}` : 'Ref: 116500LN'}</Text>
        <Text style={styles.watchSpecs}>{specsText}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  galleryContainer: {
    width: '100%',
    height: 380,
    backgroundColor: 'transparent',
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  galleryScroller: {
    flex: 1,
    width: '100%',
  },
  gallerySlide: {
    width: SCREEN_WIDTH,
    height: 330,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    overflow: 'visible',
  },
  imageWrapper: {
    width: '100%',
    height: '100%',
    borderRadius: 24,
    overflow: 'hidden',
    position: 'relative',
  },
  galleryImg: {
    width: '100%',
    height: '100%',
    borderRadius: 24,
    backgroundColor: '#1E1814',
    borderWidth: 1.5,
    borderColor: 'rgba(236, 200, 122, 0.12)',
  },
  heatmapOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(10, 8, 5, 0.35)',
  },
  heatmapLabelContainer: {
    position: 'absolute',
    top: 12,
    alignSelf: 'center',
    backgroundColor: 'rgba(15, 11, 8, 0.85)',
    borderColor: '#ECC87A',
    borderWidth: 0.75,
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  heatmapLabel: {
    fontSize: 8,
    fontWeight: '900',
    color: '#ECC87A',
    letterSpacing: 1,
  },
  galleryIndicator: {
    position: 'absolute',
    bottom: spacing.md,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  indicatorDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
  indicatorDotActive: {
    width: 14,
    backgroundColor: colors.amber,
  },
  absoluteVerdictContainer: {
    position: 'absolute',
    bottom: 8,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 20,
  },
  verdictOuterBorder: {
    minWidth: 220,
    maxWidth: 280,
    borderRadius: 24,
    borderWidth: 1,
    padding: 3,
    backgroundColor: 'rgba(18, 14, 11, 0.95)',
    justifyContent: 'center',
    alignItems: 'center',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 8,
  },
  verdictInnerBorder: {
    width: '100%',
    borderRadius: 20,
    borderWidth: 1.5,
    paddingVertical: 8,
    paddingHorizontal: 20,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  verdictMiniText: {
    fontSize: 8,
    fontWeight: '800',
    color: '#B5AFA5',
    letterSpacing: 2,
    lineHeight: 11,
    opacity: 0.8,
    marginBottom: 2,
  },
  verdictMainText: {
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 1.5,
    lineHeight: 16,
    textAlign: 'center',
  },
  heatmapToggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(236, 200, 122, 0.04)',
    borderColor: 'rgba(236, 200, 122, 0.1)',
    borderWidth: 1,
    borderRadius: radius.md,
    padding: 12,
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
  },
  heatmapTextContainer: {
    flex: 1,
    paddingRight: 8,
  },
  heatmapTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FFF',
    letterSpacing: 0.5,
  },
  heatmapDesc: {
    fontSize: 9,
    color: colors.textMuted,
    marginTop: 2,
  },
  switchContainer: {
    width: 38,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    padding: 2,
    justifyContent: 'center',
  },
  switchActive: {
    backgroundColor: colors.amber,
    borderColor: colors.amber,
  },
  switchKnob: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#B5AFA5',
  },
  switchKnobActive: {
    backgroundColor: '#0A0805',
    transform: [{ translateX: 18 }],
  },
  watchDetailsBox: {
    paddingHorizontal: spacing.md,
    paddingTop: 24,
    paddingBottom: spacing.md,
    backgroundColor: 'transparent',
    borderBottomWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.03)',
    alignItems: 'center',
  },
  watchBrand: {
    fontSize: 14,
    fontWeight: '900',
    color: '#ECC87A',
    letterSpacing: 3,
    textAlign: 'center',
    marginBottom: 4,
  },
  watchName: {
    fontSize: 20,
    fontWeight: '300',
    color: '#FFFFFF',
    textAlign: 'center',
    marginTop: 2,
    letterSpacing: 0.5,
  },
  watchRef: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
    marginTop: 4,
    letterSpacing: 0.8,
  },
  watchSpecs: {
    fontSize: 11,
    color: '#7A736A',
    textAlign: 'center',
    marginTop: 6,
    letterSpacing: 0.3,
  },
});
