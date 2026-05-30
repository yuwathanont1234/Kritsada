import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, Image, ActivityIndicator, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, radius, spacing } from '../../lib/theme';
import { useLanguage } from '../../lib/localization';
import { generateWatchHeatmap } from '../../lib/geminiAi';
import { HeatmapResult, HeatmapSignal } from '../../lib/types';

const colorFor = (t: HeatmapSignal) =>
  t === 'green' ? '#2ECC71' : t === 'red' ? '#E74C3C' : '#ECC87A';

/**
 * AI Authenticity Heatmap — on-demand. Boxes 3-7 inspection spots on the user's
 * actual watch photo (Gemini via the secure edge). Explainable visual layer;
 * NOT a certification — the disclaimer makes that explicit.
 */
export default function PhotoHeatmap({ frontUri }: { frontUri: string }) {
  const { lang } = useLanguage();
  const [result, setResult] = useState<HeatmapResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sel, setSel] = useState<number | null>(null);
  const [boxW, setBoxW] = useState(0);
  const [ratio, setRatio] = useState(1); // natural height / width

  useEffect(() => {
    let alive = true;
    Image.getSize(
      frontUri,
      (w, h) => alive && w > 0 && setRatio(h / w),
      () => alive && setRatio(1)
    );
    return () => {
      alive = false;
    };
  }, [frontUri]);

  const run = async () => {
    setLoading(true);
    setErr(null);
    setSel(null);
    try {
      const r = await generateWatchHeatmap(frontUri);
      setResult(r);
      if (!r.regions.length) {
        setErr(lang === 'th' ? 'ไม่พบจุดเด่นที่ชี้ได้จากภาพนี้ ลองถ่ายชัด/ใกล้ขึ้น' : 'No notable spots detected — try a sharper / closer photo.');
      }
    } catch (e: any) {
      setErr(e?.message || (lang === 'th' ? 'วิเคราะห์ไม่สำเร็จ' : 'Analysis failed'));
    } finally {
      setLoading(false);
    }
  };

  const displayH = boxW * ratio;
  const selRegion = sel != null && result ? result.regions[sel] : null;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Feather name="crosshair" size={15} color={colors.amber} style={{ marginRight: 7 }} />
        <Text style={styles.title}>{lang === 'th' ? 'แผนที่จุดตรวจบนรูป (AI)' : 'AI INSPECTION HEATMAP'}</Text>
      </View>
      <Text style={styles.desc}>
        {lang === 'th'
          ? 'AI ชี้จุดที่ผู้เชี่ยวชาญตรวจบนรูปจริงของคุณ — เพื่อ "ดูประกอบ" ไม่ใช่การรับประกันความแท้'
          : 'AI marks the spots an expert inspects on your actual photo — guidance only, NOT a certification.'}
      </Text>

      {/* Image with overlaid boxes */}
      <View onLayout={(e) => setBoxW(e.nativeEvent.layout.width)} style={{ width: '100%', marginTop: spacing.sm }}>
        {boxW > 0 && (
          <View style={{ width: boxW, height: displayH, borderRadius: radius.md, overflow: 'hidden' }}>
            <Image source={{ uri: frontUri }} style={{ width: boxW, height: displayH }} resizeMode="cover" />
            {result?.regions.map((r, i) => {
              const left = (r.box.xmin / 1000) * boxW;
              const top = (r.box.ymin / 1000) * displayH;
              const w = ((r.box.xmax - r.box.xmin) / 1000) * boxW;
              const h = ((r.box.ymax - r.box.ymin) / 1000) * displayH;
              const c = colorFor(r.type);
              const active = sel === i;
              return (
                <Pressable
                  key={i}
                  onPress={() => setSel(active ? null : i)}
                  style={{
                    position: 'absolute',
                    left,
                    top,
                    width: Math.max(12, w),
                    height: Math.max(12, h),
                    borderWidth: active ? 3 : 2,
                    borderColor: c,
                    borderRadius: 4,
                    backgroundColor: active ? c + '33' : 'transparent',
                  }}
                >
                  <View style={[styles.numBadge, { backgroundColor: c }]}>
                    <Text style={styles.numBadgeText}>{i + 1}</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}
      </View>

      {/* Generate button (only before first run) */}
      {!result && !loading && (
        <Pressable style={styles.genBtn} onPress={run}>
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

      {/* Legend + overall note */}
      {result && result.regions.length > 0 && (
        <>
          <View style={styles.legendRow}>
            <Legend color="#2ECC71" label={lang === 'th' ? `ผ่าน ${result.counts.green}` : `OK ${result.counts.green}`} />
            <Legend color="#ECC87A" label={lang === 'th' ? `ตรวจซ้ำ ${result.counts.yellow}` : `Check ${result.counts.yellow}`} />
            <Legend color="#E74C3C" label={lang === 'th' ? `น่าสงสัย ${result.counts.red}` : `Flag ${result.counts.red}`} />
            <Pressable onPress={run} hitSlop={10} style={{ marginLeft: 'auto' }}>
              <Feather name="refresh-cw" size={13} color={colors.textMuted} />
            </Pressable>
          </View>
          {!!result.overallNote && <Text style={styles.overall}>{result.overallNote}</Text>}
          <Text style={styles.tapHint}>{lang === 'th' ? 'แตะกรอบบนรูปเพื่อดูรายละเอียดแต่ละจุด' : 'Tap a box on the photo to see each spot.'}</Text>
        </>
      )}

      {/* Selected region detail */}
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
  card: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    backgroundColor: 'rgba(30, 24, 20, 0.35)',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(236, 200, 122, 0.12)',
    padding: spacing.md,
  },
  header: { flexDirection: 'row', alignItems: 'center' },
  title: { color: colors.amber, fontSize: 12, fontWeight: '800', letterSpacing: 1 },
  desc: { color: '#8A8076', fontSize: 11, lineHeight: 16, marginTop: 4 },
  numBadge: {
    position: 'absolute',
    top: -9,
    left: -9,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.4)',
  },
  numBadgeText: { color: '#1A1410', fontSize: 10, fontWeight: '900' },
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
});
