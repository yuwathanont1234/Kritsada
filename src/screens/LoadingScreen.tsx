import { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Feather, Ionicons } from '@expo/vector-icons';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PrimaryButton } from '../components/PrimaryButton';
import { ScanningImageAnimation } from '../components/ScanningImageAnimation';
import { ErrorState } from '../components/ErrorState';
import { analyzeWatchByTier, logFullyCachedScan } from '../lib/aiRouter';
import { getMembership } from '../lib/auth';
import {
  clearScanCaches,
  embedFrontAndBack,
  findSimilarWatches,
  findSimilarExpertCerts,
  prewarmAll,
} from '../lib/visualRag';
import { logScanEvent } from '../lib/scanAnalytics';
import { subscribeRetry, type RetryStatus } from '../lib/retryStatus';
import { COST_PER_CALL, logCostEvent } from '../lib/costBreaker';
import { getDataConsent } from '../lib/dataConsent';
import { incrementFreeScansUsed } from '../lib/storage';
import {
  incrementMonthlyScans,
  incrementTrialScans,
} from '../lib/tier';
import { preflightWatchCheck } from '../lib/scanPreflight';
import { checkAntiAbuse, recordSuccessfulScan, recordFailedScan } from '../lib/antiAbuse';
import { cropToBbox, isValidBbox } from '../lib/bboxCrop';
import { logTesterEvent } from '../lib/testerMode';
import {
  computeScanFingerprint,
  getCachedScanResult,
  getSharedCachedResult,
  setCachedScanResult,
  setSharedCachedResult,
} from '../lib/scanResultCache';
import { colors, radius, spacing, typography } from '../lib/theme';
import { RootStackParamList } from '../lib/types';
import { useLanguage, translations } from '../lib/localization';

// Progressive probe state — populated by parallel "fast probe"
type Probe = {
  brand?: string;
  model?: string;
  reference?: string;
};

type Props = NativeStackScreenProps<RootStackParamList, 'Loading'>;

const TIPS = [
  'Genuine luxury timepieces exhibit immaculate case finishing with hand-polished, seamlessly beveled edges and no sharp undercuts.',
  'An authentic mechanical movement sweeps smoothly and gracefully. The seconds hand glides across the dial with near-frictionless sweep oscillations.',
  'Authentic dials feature ultra-crisp typography, perfect alignment, and flawless logo transfer printing without any bleeding or micro-fuzziness.',
  'Prestigious manufacturers employ ultra-premium materials: Oystersteel 904L, solid 18K gold, or high-tech scratch-resistant ceramic, giving a reassuringly heavy wrist presence.',
  'Genuine luminescence (Super-LumiNova/Chromalight) displays a uniform, highly intense glow with pristine, even-layered application.',
  'Beware of sophisticated "Super Clones" that mirror exterior details. Absolute authenticity is resolved via caliber engravings and gear train micro-geometry.',
  'Authentic date apertures and cyclops magnification lenses are perfectly aligned, offering clean distortion-free enlargement and crisp font rendering.',
];

const CERT_TRUST_DISTANCE = 0.30;

function ProbeLine({ icon, text }: { icon: string; text: string }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, {
      toValue: 1,
      duration: 380,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [anim]);
  return (
    <Animated.View
      style={[
        styles.probeRow,
        {
          opacity: anim,
          transform: [
            {
              translateY: anim.interpolate({
                inputRange: [0, 1],
                outputRange: [8, 0],
              }),
            },
          ],
        },
      ]}
    >
      <Text style={styles.probeIcon}>{icon}</Text>
      <Text style={styles.probeText}>{text}</Text>
      <Animated.Text style={[styles.probeCheck, { opacity: anim }]}>✓</Animated.Text>
    </Animated.View>
  );
}

function PulsingProbeRow({ text }: { text: string }) {
  const pulse = useRef(new Animated.Value(0.45)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 700,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0.45,
          duration: 700,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  return (
    <View style={[styles.probeRow, styles.probeRowMuted]}>
      <View style={styles.probeIconWrap}>
        <ActivityIndicator size="small" color={colors.amber} />
      </View>
      <Animated.Text
        style={[styles.probeText, styles.probeTextMuted, { opacity: pulse }]}
      >
        {text}
      </Animated.Text>
    </View>
  );
}

function NeuralTourbillon({ size = 64, duration = 3000 }: { size?: number; duration?: number }) {
  const spinAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(spinAnim, {
        toValue: 1,
        duration: duration,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [spinAnim, duration]);

  const spin = spinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <View style={{
      width: size,
      height: size,
      borderRadius: size / 2,
      borderWidth: 2,
      borderColor: '#ECC87A',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(28, 22, 17, 0.65)',
      shadowColor: '#ECC87A',
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.8,
      shadowRadius: 10,
      elevation: 5,
    }}>
      {/* Outer concentric pulsing ring */}
      <View style={{
        position: 'absolute',
        width: size + 12,
        height: size + 12,
        borderRadius: (size + 12) / 2,
        borderWidth: 1,
        borderColor: 'rgba(236, 200, 122, 0.35)',
        borderStyle: 'dashed',
      }} />
      <Animated.View style={{
        transform: [{ rotate: spin }],
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <Feather name="aperture" size={size * 0.6} color="#ECC87A" />
      </Animated.View>
      <View style={{
        position: 'absolute',
        width: size * 0.2,
        height: size * 0.2,
        borderRadius: (size * 0.2) / 2,
        backgroundColor: '#FFF',
        shadowColor: '#FFF',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 1,
        shadowRadius: 4,
      }} />
    </View>
  );
}

function AnimatedAITitle() {
  const { lang } = useLanguage();
  const pulse = useRef(new Animated.Value(0.7)).current;
  const scale = useRef(new Animated.Value(1)).current;
  const [dots, setDots] = useState('');

  useEffect(() => {
    const opacityLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 750,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0.7,
          duration: 750,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );
    const scaleLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, {
          toValue: 1.15,
          duration: 750,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 1,
          duration: 750,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );
    opacityLoop.start();
    scaleLoop.start();
    const dotsTimer = setInterval(() => {
      setDots((d) => (d.length >= 3 ? '' : d + '.'));
    }, 400);
    return () => {
      opacityLoop.stop();
      scaleLoop.stop();
      clearInterval(dotsTimer);
    };
  }, [pulse, scale]);

  return (
    <View style={styles.aiTitleRow}>
      <Animated.View
        style={[
          { opacity: pulse, transform: [{ scale }], marginRight: spacing.sm },
        ]}
      >
        <NeuralTourbillon size={38} duration={4000} />
      </Animated.View>
      <Text style={styles.title}>{lang === 'th' ? 'ระบบ AI กำลังวิเคราะห์' : 'AI Analyzing'}{dots}</Text>
    </View>
  );
}

function SparkleHeader() {
  const { lang } = useLanguage();
  const sparkle = useRef(new Animated.Value(0.7)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(sparkle, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(sparkle, {
          toValue: 0.7,
          duration: 900,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [sparkle]);
  return (
    <View style={styles.probeHeader}>
      <Animated.Text style={[styles.probeHeaderIcon, { opacity: sparkle }]}>
        ✨
      </Animated.Text>
      <Text style={styles.probeHeaderText}>
        {lang === 'th' ? 'AI กำลังวิเคราะห์เรขาคณิตและฐานข้อมูลรุ่น' : 'AI DISCOVERING GEOMETRY & PEDIGREE'}
      </Text>
    </View>
  );
}

function AiRunner() {
  const bounce = useRef(new Animated.Value(0)).current;
  const sway = useRef(new Animated.Value(0)).current;
  const dash = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(bounce, {
          toValue: 1,
          duration: 280,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(bounce, {
          toValue: 0,
          duration: 280,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    ).start();
    Animated.loop(
      Animated.sequence([
        Animated.timing(sway, {
          toValue: 1,
          duration: 560,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(sway, {
          toValue: -1,
          duration: 560,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    ).start();
    Animated.loop(
      Animated.timing(dash, {
        toValue: 1,
        duration: 800,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    ).start();
  }, [bounce, sway, dash]);

  const translateY = bounce.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -10],
  });
  const rotate = sway.interpolate({
    inputRange: [-1, 1],
    outputRange: ['-10deg', '10deg'],
  });

  return (
    <View style={styles.runnerWrap} pointerEvents="none">
      {[0, 0.33, 0.66].map((offset) => {
        const tx = dash.interpolate({
          inputRange: [0, 1],
          outputRange: [60 + offset * 60, -60 + offset * 60],
        });
        const opacity = dash.interpolate({
          inputRange: [0, 0.5, 1],
          outputRange: [0, 0.55, 0],
        });
        return (
          <Animated.View
            key={offset}
            style={[
              styles.runnerDash,
              { transform: [{ translateX: tx }], opacity },
            ]}
          />
        );
      })}
      <Animated.View
        style={[
          { transform: [{ translateY }, { rotate }] },
        ]}
      >
        <NeuralTourbillon size={54} duration={2500} />
      </Animated.View>
    </View>
  );
}

function ProgressAiDots({ count, activeUpTo }: { count: number; activeUpTo?: number }) {
  const safeCount = Math.max(1, count);
  const dotAnims = useRef(
    Array.from({ length: safeCount }, () => new Animated.Value(0))
  ).current;

  useEffect(() => {
    if (activeUpTo !== undefined) {
      const target = Math.max(0, Math.min(safeCount, activeUpTo));
      Animated.parallel(
        dotAnims.map((a, i) =>
          Animated.timing(a, {
            toValue: i < target ? 1 : 0,
            duration: 280,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: false,
          })
        )
      ).start();
      return;
    }

    const stagger = 180;
    const dotDuration = 320;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.parallel(
          dotAnims.map((a, i) =>
            Animated.sequence([
              Animated.delay(stagger * i),
              Animated.timing(a, {
                toValue: 1,
                duration: dotDuration,
                easing: Easing.out(Easing.cubic),
                useNativeDriver: false,
              }),
            ])
          )
        ),
        Animated.delay(420),
        Animated.parallel(
          dotAnims.map((a) =>
            Animated.timing(a, {
              toValue: 0,
              duration: 240,
              useNativeDriver: false,
            })
          )
        ),
        Animated.delay(120),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [safeCount, activeUpTo, dotAnims]);

  return (
    <View style={styles.dotsRow}>
      {dotAnims.map((a, i) => (
        <Animated.View
          key={i}
          style={[
            styles.dot,
            {
              backgroundColor: a.interpolate({
                inputRange: [0, 1],
                outputRange: ['rgba(236, 200, 122, 0)', 'rgba(236, 200, 122, 0.85)'],
              }),
              borderColor: a.interpolate({
                inputRange: [0, 1],
                outputRange: ['rgba(236, 200, 122, 0.45)', 'rgba(236, 200, 122, 0.85)'],
              }),
            },
          ]}
        />
      ))}
    </View>
  );
}

const AI_COUNT_BY_TIER: Record<string, number> = {
  free: 2,
  standard: 4,
  pro: 7,
  premium: 12,
};

export function LoadingScreen({ route, navigation }: Props) {
  const { t, lang } = useLanguage();
  const { frontUri, backUri, extraImages } = route.params;
  const [tipIdx, setTipIdx] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [aiCount, setAiCount] = useState(7);
  const [retry, setRetry] = useState<RetryStatus | null>(null);
  useEffect(() => subscribeRetry(setRetry), []);

  const [probe, setProbe] = useState<Probe>({});

  const { width: screenW } = useWindowDimensions();
  const scannerSize = Math.min(360, Math.max(260, Math.min(320, screenW * 0.78)));

  const cycleImages = useMemo(() => {
    const out: string[] = [];
    if (frontUri) out.push(frontUri);
    if (backUri) out.push(backUri);
    if (Array.isArray(extraImages)) {
      for (const u of extraImages) if (u) out.push(u);
    }
    return out;
  }, [frontUri, backUri, extraImages]);

  useEffect(() => {
    const startedAt = Date.now();
    const tips = translations[lang].loading.tips;
    const tipInterval = setInterval(() => {
      setTipIdx((i) => (i + 1) % tips.length);
    }, 3500);
    const elapsedInterval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => {
      clearInterval(tipInterval);
      clearInterval(elapsedInterval);
    };
  }, []);

  // Progressive probe — fast visual RAG + cert lookup in parallel
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const membership = await getMembership();
        if (cancelled) return;
        if (membership.tier === 'free' && !membership.isTrialing) return;

        const PROBE_EMBED_TIMEOUT_MS = 8000;
        const embedding = await Promise.race([
          embedFrontAndBack(frontUri, backUri),
          new Promise<null>((resolve) =>
            setTimeout(() => resolve(null), PROBE_EMBED_TIMEOUT_MS)
          ),
        ]);
        if (cancelled || !embedding) return;

        const [watchesResult, certs] = await Promise.all([
          findSimilarWatches(embedding, 5, 0.0).catch(() => null),
          findSimilarExpertCerts(embedding, 5).catch(() => []),
        ]);
        if (cancelled) return;

        // Phase 1 — BRAND/MODEL from visual RAG top candidate
        const top = watchesResult?.candidates[0];
        if (top) {
          setProbe((p) => ({
            ...p,
            brand: top.brand,
            model: top.name,
          }));
        }

        // Phase 2 — REFERENCE from cert lookup or visual RAG
        const cert = certs[0];
        if (cert && cert.distance < CERT_TRUST_DISTANCE) {
          setProbe((p) => ({
            ...p,
            brand: cert.brand ?? undefined,
            model: cert.watchName ?? undefined,
            reference: cert.watchReference ?? undefined,
          }));
        } else if (top && top.reference) {
          setProbe((p) => ({
            ...p,
            reference: top.reference,
          }));
        }
      } catch (err: any) {
        console.warn('[LoadingScreen] probe failed:', err?.message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [frontUri, backUri]);

  useEffect(() => {
    let cancelled = false;
    clearScanCaches();
    prewarmAll();
    const scanT0 = Date.now();
    console.log('[scan] === START === watch check next');
    void logTesterEvent('scan_start', { hasBackPhoto: !!backUri });

    (async () => {
      try {
        const membership = await getMembership();
        setAiCount(AI_COUNT_BY_TIER[membership.tier] ?? 7);

        // 0. Anti-Abuse Check
        const antiAbuseCheck = await checkAntiAbuse(
          membership.tier,
          membership.isTrialing
        );
        if (!antiAbuseCheck.allowed) {
          Alert.alert('Security Alert', antiAbuseCheck.userMessage, [
            { text: 'OK', onPress: () => navigation.goBack() },
          ]);
          return;
        }

        // Preflight check
        const preflight = await preflightWatchCheck(frontUri);
        if (!preflight.ok) {
          const wasLockedOut = await recordFailedScan();
          const finalMsg = wasLockedOut
            ? 'ระบบตรวจพบพฤติกรรมการใช้งานที่น่าสงสัย (อัปโหลดรูปไม่ถูกต้องติดต่อกัน) เพื่อความปลอดภัย ระบบได้ระงับการสแกนชั่วคราวเป็นเวลา 15 นาที'
            : preflight.userMessage;

          Alert.alert('Image Verification', finalMsg, [
            { text: 'OK', onPress: () => navigation.goBack() },
          ]);
          return;
        }

        // Deduplication Cache Lookup
        const fingerprint = await computeScanFingerprint(
          frontUri,
          backUri,
          extraImages
        );
        let result;
        let provider: 'claude' | 'gemini' | 'cache' = 'cache';
        let cacheHit = false;
        let cacheLayer: 'local' | 'shared' | null = null;
        if (fingerprint) {
          const cached = await getCachedScanResult(fingerprint);
          if (cached) {
            result = cached;
            cacheHit = true;
            cacheLayer = 'local';
          } else {
            const shared = await getSharedCachedResult(
              fingerprint,
              membership.tier
            );
            if (shared) {
              result = shared;
              cacheHit = true;
              cacheLayer = 'shared';
              setCachedScanResult(fingerprint, shared).catch(() => {});
            }
          }
        }

        const tAnalyze = Date.now();
        if (!cacheHit) {
          const out = await analyzeWatchByTier(
            membership.tier,
            frontUri,
            backUri,
            membership.isTrialing
          );
          result = out.result;
          provider = out.provider;
          if (fingerprint) {
            setCachedScanResult(fingerprint, result).catch(() => {});
            if (result.identified) {
              setSharedCachedResult(
                fingerprint,
                result,
                provider as 'gemini' | 'claude' | 'cache-merged',
                membership.tier
              ).catch(() => {});
            }
          }
        }
        const analyzeMs = Date.now() - tAnalyze;
        if (cancelled) return;

        const scanTotalMs = Date.now() - scanT0;
        void logTesterEvent('scan_complete', {
          totalMs: scanTotalMs,
          confidence: result!.confidence,
          identified: result!.identified,
          cacheHit,
          provider,
          tier: membership.tier,
          watchName: result!.name ?? null,
          brand: result!.brand ?? null,
          certMatched: !!result!.expertCertMatch,
          certDistance: result!.expertCertMatch?.distance ?? null,
          certName: result!.expertCertMatch?.watchName ?? null,
          alternateCount: result!.alternateNames?.length ?? 0,
          authVerdict: result!.authenticityVerdict ?? null,
          authProbability: result!.authenticityProbability ?? null,
        });

        if (!cacheHit) {
          logScanEvent({
            result: result!,
            tier: membership.tier,
            usedGroundedFallback: (result as any)._identifiedVia === 'gemini-grounded',
          }).catch(() => {});
        }

        // Quota updates
        if (membership.isTrialing && membership.trialStart) {
          await incrementTrialScans(membership.trialStart);
        } else if (membership.tier === 'free') {
          await incrementFreeScansUsed();
        } else {
          await incrementMonthlyScans();
        }

        // Cost logging
        const consentForCost = await getDataConsent();
        if (cacheHit) {
          logFullyCachedScan(
            membership.tier,
            consentForCost.granted ? consentForCost.cohortHash : null
          ).catch(() => {});
        }

        // Anti-Abuse update on successful execution
        await recordSuccessfulScan();

        // Crop processing
        let processedFrontUri: string | undefined;
        if (result && isValidBbox(result.watchBbox)) {
          try {
            const cropped = await cropToBbox(frontUri, result.watchBbox);
            if (cropped && cropped !== frontUri) {
              processedFrontUri = cropped;
            }
          } catch (e: any) {
            console.warn('[scan] bbox-crop error (fail-soft):', e?.message ?? e);
          }
        }

        navigation.replace('Result', {
          result: result!,
          frontUri,
          backUri,
          galleryImages: extraImages,
          processedFrontUri,
        });
      } catch (e: any) {
        if (cancelled) return;
        const msg = e?.message ?? 'An unexpected diagnostic error occurred.';
        void logTesterEvent('scan_error', {
          totalMs: Date.now() - scanT0,
          message: String(msg).slice(0, 500),
        });
        setError(msg);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <ErrorState
        errorMsg={error}
        onRetry={() => navigation.replace('Loading', { frontUri, backUri, extraImages })}
        onCancel={() => navigation.goBack()}
      />
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.spinnerWrap}>
        <ScanningImageAnimation images={cycleImages} size={scannerSize} />

        {/* Progressive probe panel */}
        <View style={styles.probeStack}>
          <SparkleHeader />

          {/* Brand Row */}
          {probe.brand && (
            <ProbeLine icon="🏷️" text={`${lang === 'th' ? 'ยี่ห้อ' : 'Brand'}: ${probe.brand}`} />
          )}

          {/* Model Row */}
          {probe.model && (
            <ProbeLine icon="⌚" text={`${lang === 'th' ? 'รุ่น' : 'Model'}: ${probe.model}`} />
          )}

          {/* Reference Row */}
          {probe.reference && (
            <ProbeLine icon="🔢" text={`${lang === 'th' ? 'รหัสอ้างอิง' : 'Reference'}: Ref. ${probe.reference}`} />
          )}

          {/* Still searching row */}
          <PulsingProbeRow
            text={
              !probe.brand
                ? t('loading.step1')
                : !probe.model
                ? t('loading.step2')
                : !probe.reference
                ? t('loading.step3')
                : t('loading.step4')
            }
          />
        </View>

        <Text style={styles.timeHint}>
          {elapsed > 0 ? `${elapsed}s · ` : ''}{lang === 'th' ? 'ปกติใช้เวลาประมาณ 8-15 วินาที' : 'Typically 8-15s'}
        </Text>

        {retry && (
          <View style={styles.retryBanner}>
            <Text style={styles.retryIcon}>🔄</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.retryTitle}>
                {lang === 'th'
                  ? `เครือข่าย AI หนาแน่น — กำลังลองใหม่ (${retry.attempt}/{retry.maxAttempts})`
                  : `AI Network Congested — Retrying (${retry.attempt}/{retry.maxAttempts})`}
              </Text>
              <Text style={styles.retrySub}>
                {retry.nextModel === 'pro'
                  ? (lang === 'th'
                      ? `กำลังสลับไปยังระบบผู้เชี่ยวชาญ (รอประมาณ ${Math.round(retry.delayMs / 1000)} วินาที) — กรุณารอสักครู่`
                      : `Switching to expert tier (waiting ${Math.round(retry.delayMs / 1000)}s) — Please stand by`)
                  : (lang === 'th'
                      ? `กำลังลองใหม่ในอีก ${Math.round(retry.delayMs / 1000)} วินาที`
                      : `Retrying in ${Math.round(retry.delayMs / 1000)}s`)}
              </Text>
            </View>
          </View>
        )}
      </View>

      {/* Bottom prepare panel */}
      <View style={styles.preparePanel}>
        <AiRunner />
        <View style={styles.aiCountLabelRow}>
          <Text style={styles.aiCountLabelIcon}>🧠</Text>
          <Text style={styles.aiCountLabel}>
            {lang === 'th' ? `กำลังตรวจสอบด้วยระบบ AI ประสานงาน ${aiCount} ระบบ` : `Ensemble of ${aiCount} AIs Authenticating`}
          </Text>
        </View>
        <ProgressAiDots count={aiCount} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: spacing.lg,
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  spinnerWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 40, // Shift scanned image down so it's clearly visible
    gap: spacing.md,
    width: '100%',
  },
  title: { ...typography.h2 },
  aiTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.xl,
  },
  aiTitleEmoji: { fontSize: 28 },
  probeStack: {
    marginTop: spacing.lg,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    backgroundColor: 'rgba(236, 200, 122, 0.06)',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(236, 200, 122, 0.25)',
    alignSelf: 'stretch',
    gap: spacing.sm,
  },
  probeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingBottom: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(236, 200, 122, 0.18)',
    marginBottom: 2,
  },
  probeHeaderIcon: { fontSize: 16 },
  probeHeaderText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.amber,
    letterSpacing: 0.3,
  },
  probeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 2,
  },
  probeRowMuted: {
    paddingTop: spacing.xs + 2,
    marginTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: 'rgba(236, 200, 122, 0.12)',
  },
  probeIcon: { fontSize: 18, width: 26, textAlign: 'center' },
  probeIconWrap: {
    width: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  probeText: { fontSize: 14, color: colors.text, flexShrink: 1, fontWeight: '600' },
  probeTextMuted: { color: colors.textMuted, fontSize: 13, fontWeight: '500' },
  probeCheck: {
    fontSize: 14,
    color: '#22C55E',
    fontWeight: '900',
    marginLeft: 'auto',
    paddingLeft: spacing.sm,
  },
  timeHint: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  retryBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
    marginHorizontal: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.warningLight,
    borderWidth: 1,
    borderColor: colors.warning,
  },
  retryIcon: {
    fontSize: 18,
  },
  retryTitle: {
    color: colors.warning,
    fontSize: 13,
    fontWeight: '700',
  },
  retrySub: {
    color: colors.textSecondary,
    fontSize: 11,
    marginTop: 2,
  },
  preparePanel: {
    paddingBottom: spacing.lg,
    alignItems: 'center',
    gap: spacing.sm,
  },
  runnerWrap: {
    height: 64,
    width: 200,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  runner: {
    fontSize: 44,
    textShadowColor: 'rgba(236, 200, 122, 0.7)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 12,
  },
  runnerDash: {
    position: 'absolute',
    width: 14,
    height: 2,
    borderRadius: 1,
    backgroundColor: 'rgba(236, 200, 122, 0.7)',
    bottom: 18,
  },
  aiCountLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 22,
  },
  aiCountLabelIcon: { fontSize: 16 },
  aiCountLabel: {
    fontSize: 14,
    color: colors.amberLight ?? colors.gold,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 4,
    flexWrap: 'wrap',
    justifyContent: 'center',
    maxWidth: 200,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    borderWidth: 1,
  },

  errorIcon: { fontSize: 60, marginTop: spacing.xxl },
  errorTitle: { ...typography.h2, marginTop: spacing.md },
  errorMsg: {
    ...typography.body,
    color: colors.danger,
    textAlign: 'center',
    paddingHorizontal: spacing.md,
    marginVertical: spacing.lg,
  },
});
