import React, { useState } from 'react';
import { View, ScrollView, Text, Image, Pressable, StyleSheet, Dimensions } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, radius, spacing } from '../../lib/theme';
import { AuthColor } from '../../lib/authVerdictColor';
import { ScanResult } from '../../lib/types';
import { useLanguage } from '../../lib/localization';
import Svg, { Rect, Circle, G, Path } from 'react-native-svg';

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
                
                {/* Visual Heatmap Overlay */}
                {showHeatmap && activeImageIdx === 0 && (
                  <View style={StyleSheet.absoluteFillObject}>
                    <Svg width="100%" height="100%" viewBox="0 0 300 300" style={styles.heatmapOverlay}>
                      {/* Grid representation */}
                      <G opacity={0.3} stroke="#ECC87A" strokeWidth={0.5}>
                        <Line x1="75" y1="0" x2="75" y2="300" />
                        <Line x1="150" y1="0" x2="150" y2="300" />
                        <Line x1="225" y1="0" x2="225" y2="300" />
                        <Line x1="0" y1="75" x2="300" y2="75" />
                        <Line x1="0" y1="150" x2="300" y2="150" />
                        <Line x1="0" y1="225" x2="300" y2="225" />
                      </G>

                      {/* Hotspots for watch authentication (Gold/Green aura points) */}
                      {/* Logo Area */}
                      <Circle cx="150" cy="90" r="28" fill="rgba(46, 204, 113, 0.45)" stroke="#2ECC71" strokeWidth={1} />
                      <Circle cx="150" cy="90" r="14" fill="rgba(46, 204, 113, 0.6)" />
                      {/* Dial Center Pin */}
                      <Circle cx="150" cy="150" r="20" fill="rgba(241, 196, 15, 0.45)" stroke="#F1C40F" strokeWidth={1} />
                      <Circle cx="150" cy="150" r="8" fill="rgba(241, 196, 15, 0.6)" />
                      {/* Chrono / Subdial 9 */}
                      <Circle cx="100" cy="150" r="18" fill="rgba(46, 204, 113, 0.35)" stroke="#2ECC71" strokeWidth={0.8} />
                      {/* Chrono / Subdial 3 */}
                      <Circle cx="200" cy="150" r="18" fill="rgba(46, 204, 113, 0.35)" stroke="#2ECC71" strokeWidth={0.8} />
                      {/* Date Window at 6 */}
                      <Circle cx="150" cy="210" r="22" fill="rgba(231, 76, 60, 0.3)" stroke="#E74C3C" strokeWidth={1} />
                      <Circle cx="150" cy="210" r="10" fill="rgba(231, 76, 60, 0.5)" />
                    </Svg>
                    <View style={styles.heatmapLabelContainer}>
                      <Text style={styles.heatmapLabel}>AI LANDMARK Reticulated Heatmap ACTIVE</Text>
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

      {/* Heatmap Overlay Toggle Switch (Bilingual, premium look) */}
      <View style={styles.heatmapToggleRow}>
        <View style={styles.heatmapTextContainer}>
          <Text style={styles.heatmapTitle}>{lang === 'th' ? 'แสดงแผนภาพตรวจวิเคราะห์ AI Heatmap' : 'AI Heatmap Target Diagnostics'}</Text>
          <Text style={styles.heatmapDesc}>{lang === 'th' ? 'แสดงพิกัดจัดตำแหน่งออปติคอลและการวิเคราะห์สัดส่วนขนาดเล็ก' : 'Highlight micro-hallmark vectors and dial alignment zones'}</Text>
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

// Reusable SVG helper line component
function Line({ x1, y1, x2, y2, ...props }: any) {
  return <Path d={`M${x1} ${y1} L${x2} ${y2}`} {...props} />;
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
