import React, { useEffect, useState } from 'react';
import { View, Text, Image, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import Svg, { Line, Polygon } from 'react-native-svg';
import { Feather } from '@expo/vector-icons';
import { colors, radius, spacing } from '../../lib/theme';
import { AuthColor } from '../../lib/authVerdictColor';
import { ScanResult, HeatmapResult, HeatmapSignal } from '../../lib/types';
import { useLanguage } from '../../lib/localization';
import { generateWatchHeatmap } from '../../lib/geminiAi';

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

const colorFor = (s: HeatmapSignal) =>
  s === 'green' ? '#2ECC71' : s === 'red' ? '#E74C3C' : '#ECC87A';

/**
 * VerdictHeader — the single hero. Shows ONE main watch image (aspect-preserved
 * so the AI Hallmark overlay coordinates line up), the verdict badge, a small
 * thumbnail strip to switch angles, and the on-demand AI Hallmark overlay
 * (Gemini boxes inspection spots; numbers sit in a right-edge column with
 * leader arrows to the real spots). The overlay only renders on the FRONT photo
 * — that's the one Gemini boxed — so switching to a back/macro thumbnail hides
 * it. Replaces the old duplicate (carousel hero + separate PhotoHeatmap card).
 */
export default function VerdictHeader({
  images,
  authColor,
  result,
  customName,
  specsText,
  getVerdictLabel,
  t,
}: VerdictHeaderProps) {
  const { lang } = useLanguage();
  const [activeIdx, setActiveIdx] = useState(0);
  const [boxW, setBoxW] = useState(0);
  const [ratio, setRatio] = useState(1); // natural h / w of the active image

  // AI Hallmark (on-demand heatmap) state
  const [heatmap, setHeatmap] = useState<HeatmapResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sel, setSel] = useState<number | null>(null);

  const isFront = activeIdx === 0;
  const mainUri = images[activeIdx] ?? images[0];

  useEffect(() => {
    let alive = true;
    Image.getSize(
      mainUri,
      (w, h) => alive && w > 0 && setRatio(h / w),
      () => alive && setRatio(1)
    );
    return () => {
      alive = false;
    };
  }, [mainUri]);

  const runHeatmap = async () => {
    setLoading(true);
    setErr(null);
    setSel(null);
    try {
      const r = await generateWatchHeatmap(images[0]);
      setHeatmap(r);
      if (!r.regions.length) {
        setErr(lang === 'th' ? 'ไม่พบจุดเด่นที่ชี้ได้จากภาพนี้ ลองถ่ายชัด/ใกล้ขึ้น' : 'No notable spots detected — try a sharper / closer photo.');
      }
    } catch (e: any) {
      setErr(e?.message || (lang === 'th' ? 'วิเคราะห์ไม่สำเร็จ' : 'Analysis failed'));
    } finally {
      setLoading(false);
    }
  };

  const getVerdictBorderColor = (color: AuthColor) => {
    switch (color) {
      case 'green': return '#22C55E';
      case 'yellow': return '#F59E0B';
      case 'red': return '#EF4444';
      default: return '#ECC87A';
    }
  };

  const displayH = boxW * ratio;
  const regions = isFront ? heatmap?.regions ?? [] : [];
  const selRegion = sel != null && heatmap ? heatmap.regions[sel] : null;

  // overlay geometry (right-edge column of numbers + leader arrows)
  const BADGE = 22;
  const INSET = 6;
  const railCX = boxW - INSET - BADGE / 2;
  const lineStartX = railCX - BADGE / 2;
  const badgeCY = (i: number, n: number) =>
    n <= 1 ? displayH / 2 : BADGE / 2 + 4 + (i * (displayH - BADGE - 8)) / (n - 1);
  const spotX = (r: HeatmapResult['regions'][number]) => ((r.box.xmin + r.box.xmax) / 2 / 1000) * boxW;
  const spotY = (r: HeatmapResult['regions'][number]) => ((r.box.ymin + r.box.ymax) / 2 / 1000) * displayH;

  return (
    <View style={styles.container}>
      {/* ── Hero: single aspect-preserved image + overlay + verdict badge ── */}
      <View onLayout={(e) => setBoxW(e.nativeEvent.layout.width)} style={styles.heroWrap}>
        {boxW > 0 && displayH > 0 && (
          <View style={{ width: boxW, height: displayH }}>
            <View style={styles.heroImageBox}>
              <Image source={{ uri: mainUri }} style={{ width: boxW, height: displayH }} resizeMode="cover" />
            </View>

            {/* AI Hallmark overlay — front photo only */}
            {regions.length > 0 && (
              <>
                <Svg pointerEvents="none" width={boxW} height={displayH} style={StyleSheet.absoluteFill}>
                  {regions.map((r, i) => {
                    const sx = spotX(r);
                    const sy = spotY(r);
                    const bx = lineStartX;
                    const by = badgeCY(i, regions.length);
                    const c = colorFor(r.type);
                    const active = sel === i;
                    const dx = sx - bx;
                    const dy = sy - by;
                    const len = Math.max(1, Math.hypot(dx, dy));
                    const ux = dx / len;
                    const uy = dy / len;
                    const AH = 8;
                    const AW = 4.5;
                    const baseX = sx - ux * AH;
                    const baseY = sy - uy * AH;
                    const px = -uy;
                    const py = ux;
                    return (
                      <React.Fragment key={`l${i}`}>
                        <Line x1={bx} y1={by} x2={baseX} y2={baseY} stroke={c} strokeWidth={active ? 2.5 : 1.5} strokeOpacity={active ? 1 : 0.7} />
                        <Polygon points={`${sx},${sy} ${baseX + px * AW},${baseY + py * AW} ${baseX - px * AW},${baseY - py * AW}`} fill={c} fillOpacity={active ? 1 : 0.85} />
                      </React.Fragment>
                    );
                  })}
                </Svg>

                {/* tappable spot markers */}
                {regions.map((r, i) => {
                  const active = sel === i;
                  const D = active ? 16 : 12;
                  const c = colorFor(r.type);
                  return (
                    <Pressable
                      key={`m${i}`}
                      onPress={() => setSel(active ? null : i)}
                      hitSlop={8}
                      style={{ position: 'absolute', left: spotX(r) - D / 2, top: spotY(r) - D / 2, width: D, height: D, borderRadius: D / 2, backgroundColor: c + (active ? 'FF' : 'AA'), borderWidth: 2, borderColor: '#0A0805' }}
                    />
                  );
                })}

                {/* right-edge numbered column */}
                {regions.map((r, i) => {
                  const active = sel === i;
                  const c = colorFor(r.type);
                  const cy = badgeCY(i, regions.length);
                  return (
                    <Pressable
                      key={`b${i}`}
                      onPress={() => setSel(active ? null : i)}
                      hitSlop={6}
                      style={{ position: 'absolute', left: railCX - BADGE / 2, top: cy - BADGE / 2, width: BADGE, height: BADGE, borderRadius: BADGE / 2, backgroundColor: c, alignItems: 'center', justifyContent: 'center', borderWidth: active ? 2 : 1, borderColor: active ? '#fff' : 'rgba(0,0,0,0.45)' }}
                    >
                      <Text style={styles.railNumText}>{i + 1}</Text>
                    </Pressable>
                  );
                })}
              </>
            )}

            {/* Verdict badge */}
            {authColor && (
              <View style={styles.absoluteVerdictContainer}>
                <View style={[styles.verdictOuterBorder, { borderColor: 'rgba(236, 200, 122, 0.35)', shadowColor: getVerdictBorderColor(authColor) }]}>
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
        )}
      </View>

      {/* ── Thumbnail strip (switch angle) ── */}
      {images.length > 1 && (
        <View style={styles.thumbRow}>
          {images.map((uri, i) => (
            <Pressable key={i} onPress={() => setActiveIdx(i)} style={[styles.thumb, activeIdx === i && styles.thumbActive]}>
              <Image source={{ uri }} style={styles.thumbImg} resizeMode="cover" />
            </Pressable>
          ))}
        </View>
      )}

      {/* ── AI Hallmark controls (front photo only) ── */}
      {isFront && (
        <View style={styles.hallmarkCard}>
          <View style={styles.hallmarkHeader}>
            <Feather name="crosshair" size={14} color={colors.amber} style={{ marginRight: 7 }} />
            <Text style={styles.hallmarkTitle}>AI HALLMARK</Text>
          </View>
          <Text style={styles.hallmarkDesc}>
            {lang === 'th'
              ? 'AI ชี้จุดที่ผู้เชี่ยวชาญตรวจบนรูปจริงของคุณ — เพื่อ "ดูประกอบ" ไม่ใช่การรับประกันความแท้'
              : 'AI marks the spots an expert inspects on your photo — guidance only, NOT a certification.'}
          </Text>

          {!heatmap && !loading && (
            <Pressable style={styles.genBtn} onPress={runHeatmap}>
              <Feather name="zap" size={14} color="#1A1410" style={{ marginRight: 6 }} />
              <Text style={styles.genBtnText}>{lang === 'th' ? 'วิเคราะห์จุดตรวจด้วย AI' : 'Analyze spots with AI'}</Text>
            </Pressable>
          )}
          {loading && (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={colors.amber} />
              <Text style={styles.loadingText}>{lang === 'th' ? 'AI กำลังชี้จุดตรวจ...' : 'AI is marking inspection spots...'}</Text>
            </View>
          )}
          {err && <Text style={styles.errText}>{err}</Text>}

          {heatmap && heatmap.regions.length > 0 && (
            <>
              <View style={styles.legendRow}>
                <Legend color="#2ECC71" label={lang === 'th' ? `ผ่าน ${heatmap.counts.green}` : `OK ${heatmap.counts.green}`} />
                <Legend color="#ECC87A" label={lang === 'th' ? `ตรวจซ้ำ ${heatmap.counts.yellow}` : `Check ${heatmap.counts.yellow}`} />
                <Legend color="#E74C3C" label={lang === 'th' ? `น่าสงสัย ${heatmap.counts.red}` : `Flag ${heatmap.counts.red}`} />
                <Pressable onPress={runHeatmap} hitSlop={10} style={{ marginLeft: 'auto' }}>
                  <Feather name="refresh-cw" size={13} color={colors.textMuted} />
                </Pressable>
              </View>
              {!!heatmap.overallNote && <Text style={styles.overall}>{heatmap.overallNote}</Text>}
              <Text style={styles.tapHint}>{lang === 'th' ? 'แตะหมายเลขหรือจุดบนรูปเพื่อดูรายละเอียด' : 'Tap a number or marker to see details.'}</Text>
            </>
          )}

          {selRegion && (
            <View style={[styles.detail, { borderLeftColor: colorFor(selRegion.type) }]}>
              <Text style={[styles.detailFeature, { color: colorFor(selRegion.type) }]}>
                {sel != null ? sel + 1 : ''}. {selRegion.feature}
              </Text>
              <Text style={styles.detailObs}>{selRegion.observation}</Text>
              {!!selRegion.reasoning && <Text style={styles.detailReason}>{selRegion.reasoning}</Text>}
            </View>
          )}
        </View>
      )}

      {/* ── Watch details ── */}
      <View style={styles.watchDetailsBox}>
        <Text style={styles.watchBrand}>{result.brand?.toUpperCase() || 'ROLEX'}</Text>
        <Text style={styles.watchName}>{customName || result.name || 'Cosmograph Daytona'}</Text>
        <Text style={styles.watchRef}>{result.reference ? `Ref: ${result.reference}` : 'Ref: 116500LN'}</Text>
        {!!result.serialNumber && <Text style={styles.watchSpecs}>{`Serial: ${result.serialNumber}`}</Text>}
        <Text style={styles.watchSpecs}>{specsText}</Text>
      </View>
    </View>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: 12 }}>
      <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: color, marginRight: 4 }} />
      <Text style={{ color: '#B5AFA5', fontSize: 11, fontWeight: '600' }}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%' },
  heroWrap: {
    width: '100%',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    alignItems: 'center',
  },
  heroImageBox: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#1E1814',
    borderWidth: 1.5,
    borderColor: 'rgba(236, 200, 122, 0.12)',
  },
  railNumText: { color: '#1A1410', fontSize: 11, fontWeight: '900' },
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
  thumbRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  thumb: {
    width: 46,
    height: 46,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  thumbActive: {
    borderColor: colors.amber,
  },
  thumbImg: { width: '100%', height: '100%' },
  hallmarkCard: {
    marginHorizontal: spacing.md,
    marginTop: spacing.md,
    backgroundColor: 'rgba(30, 24, 20, 0.35)',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(236, 200, 122, 0.12)',
    padding: spacing.md,
  },
  hallmarkHeader: { flexDirection: 'row', alignItems: 'center' },
  hallmarkTitle: { color: colors.amber, fontSize: 12, fontWeight: '800', letterSpacing: 1 },
  hallmarkDesc: { color: '#8A8076', fontSize: 11, lineHeight: 16, marginTop: 4 },
  genBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.amber,
    borderRadius: radius.md,
    paddingVertical: 11,
    marginTop: spacing.md,
  },
  genBtnText: { color: '#1A1410', fontSize: 13, fontWeight: '800' },
  loadingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: spacing.md },
  loadingText: { color: '#B5AFA5', fontSize: 12 },
  errText: { color: '#E0A0A0', fontSize: 12, marginTop: spacing.sm, textAlign: 'center' },
  legendRow: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.md },
  overall: { color: '#CFC7BB', fontSize: 12, lineHeight: 18, marginTop: spacing.sm },
  tapHint: { color: '#7A736A', fontSize: 10, marginTop: 6, fontStyle: 'italic' },
  detail: {
    marginTop: spacing.sm,
    backgroundColor: 'rgba(10,8,5,0.5)',
    borderRadius: radius.sm,
    borderLeftWidth: 3,
    padding: spacing.sm,
  },
  detailFeature: { fontSize: 13, fontWeight: '800', marginBottom: 3 },
  detailObs: { color: '#E8DCC0', fontSize: 12, lineHeight: 18 },
  detailReason: { color: '#9A9088', fontSize: 11, lineHeight: 16, marginTop: 4 },
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
