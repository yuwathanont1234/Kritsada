import { Feather } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { CameraType, CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { useAudioPlayer } from 'expo-audio';
import React, { useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Easing,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PrimaryButton } from '../components/PrimaryButton';
import { ScanCoachingOverlay } from '../components/ScanCoachingOverlay';
import { UpgradeModal, UpgradeReason } from '../components/UpgradeModal';
import { DataConsentModal } from '../components/DataConsentModal';
import { AiProcessingConsentModal } from '../components/AiProcessingConsentModal';
import { hasValidAiConsent } from '../lib/aiConsent';
import { BONUS_SCANS_PER_MONTH, getDataConsent } from '../lib/dataConsent';
import { grantFreeScanBonus } from '../lib/storage';
import { getMembership } from '../lib/auth';
import { getFreeScansUsed, isFreeWindowExpired } from '../lib/storage';
import { assessImageQuality } from '../lib/imageQuality';
import { useMotionStability } from '../lib/useMotionStability';
import { checkScanAllowed, tierCaps } from '../lib/tier';
import { logTesterEvent } from '../lib/testerMode';
import { colors, radius, spacing, typography } from '../lib/theme';
import { RootStackParamList } from '../lib/types';
import { prewarmAll } from '../lib/visualRag';
import { useLanguage } from '../lib/localization';

type Props = NativeStackScreenProps<RootStackParamList, 'Scan'>;

type Side = 'front' | 'back' | 'top' | 'bottom';

const SIDE_LABEL: Record<Side, string> = {
  front: 'Dial & Bezel',
  back: 'Caseback & Movement',
  top: 'Crown & Profile',
  bottom: 'Bracelet & Clasp',
};

// Capture order — front is required, the rest are optional. Tapping the
// shutter advances to the next un-filled slot automatically so the user
// can hit shutter 4 times without thinking.
const SIDE_ORDER: Side[] = ['front', 'back', 'top', 'bottom'];

// On-screen framing guide. 1:1 square ratio matching luxury watch dial and caseback
const FRAME_W = 240;
const FRAME_H = 240; // 1:1 Square
const SCAN_DURATION_MS = 1300;
const SCAN_BEEP_VOLUME = 0.35;

// Imported once; expo-audio's useAudioPlayer expects the asset module
const SCAN_BEEP = require('../../assets/sounds/scan-beep.wav');

const WATCH_RATIO = 1.0; // 1:1 aspect ratio for watch dials and cases

/**
 * Auto-crop the captured image to a centered watch-shaped square (1:1)
 * at max quality. Trims the longer dimension only.
 */
// Hard cap for any image we hold in app memory. 2048 is high enough that
// AI vision (which compresses to 384px anyway) loses nothing, and zoom-in
// still looks crisp on phone screens.
const MAX_IMAGE_DIMENSION = 2048;

async function resizeIfHuge(uri: string): Promise<string> {
  try {
    const info = await ImageManipulator.manipulateAsync(uri, [], { compress: 1 });
    const longSide = Math.max(info.width, info.height);
    if (longSide <= MAX_IMAGE_DIMENSION) return uri;
    const scale = MAX_IMAGE_DIMENSION / longSide;
    const targetW = Math.round(info.width * scale);
    const targetH = Math.round(info.height * scale);
    const result = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: targetW, height: targetH } }],
      { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG }
    );
    return result.uri;
  } catch {
    // Resize failed — return original; better to risk OOM than lose photo
    return uri;
  }
}

// Inner zoom factor applied AFTER the 1:1 crop. 1.0 = no zoom, 0.42 = drop
// remove ~58% peripheral — pure watch face only.
// Gallery photos do NOT tighten — the user already framed/cropped outside
// the app, so further zoom risks cutting off the subject.
const ZOOM_TIGHTEN_CAMERA = 0.42;

async function autoCropToSquare(
  uri: string,
  source: 'camera' | 'gallery' = 'camera'
): Promise<string> {
  try {
    const info = await ImageManipulator.manipulateAsync(uri, [], {
      compress: 1,
      format: ImageManipulator.SaveFormat.JPEG,
    });
    const w = info.width;
    const h = info.height;
    const photoRatio = w / h;

    let cropW: number;
    let cropH: number;
    if (photoRatio > WATCH_RATIO) {
      // Photo is wider than 1:1 — keep full height, trim sides
      cropH = h;
      cropW = Math.round(h * WATCH_RATIO);
    } else {
      // Photo is taller than 1:1 — keep full width, trim top/bottom equally
      cropW = w;
      cropH = Math.round(w / WATCH_RATIO);
    }
    // Apply inner-zoom tighten ONLY when the photo came from the camera —
    // gallery photos are already cropped/framed by the user and may have
    // the watch sitting at the edge (further zoom would cut it off).
    if (source === 'camera') {
      cropW = Math.round(cropW * ZOOM_TIGHTEN_CAMERA);
      cropH = Math.round(cropH * ZOOM_TIGHTEN_CAMERA);
    }
    const originX = Math.round((w - cropW) / 2);
    const originY = Math.round((h - cropH) / 2);

    const result = await ImageManipulator.manipulateAsync(
      uri,
      [{ crop: { originX, originY, width: cropW, height: cropH } }],
      { compress: 1, format: ImageManipulator.SaveFormat.JPEG }
    );
    return result.uri;
  } catch {
    return uri;
  }
}

export function ScanScreen({ navigation }: Props) {
  const { t, lang } = useLanguage();
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const [side, setSide] = useState<Side>('front');
  const [frontUri, setFrontUri] = useState<string | null>(null);
  const [backUri, setBackUri] = useState<string | null>(null);
  const [topUri, setTopUri] = useState<string | null>(null);
  const [bottomUri, setBottomUri] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [facing] = useState<CameraType>('back');

  // Tap-to-focus visual feedback
  const [focusPos, setFocusPos] = useState<{ x: number; y: number } | null>(null);
  const focusAnim = useRef(new Animated.Value(0)).current;

  // Scanner animation: sweep line top→bottom + flash + sound
  const scanLineAnim = useRef(new Animated.Value(0)).current;
  const flashAnim = useRef(new Animated.Value(0)).current;
  const beepPlayer = useAudioPlayer(SCAN_BEEP);
  // Lower volume — phone speakers are loud; default WAV peak is 0.75 amplitude.
  React.useEffect(() => {
    if (beepPlayer) {
      beepPlayer.volume = SCAN_BEEP_VOLUME;
    }
  }, [beepPlayer]);

  // Continuous scanning and pulsing hotspots animations for premium mockups
  const continuousScanAnim = useRef(new Animated.Value(0)).current;
  const hotspotPulseAnim = useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    // 1. Continuous Laser Line Sweep Loop (up/down)
    const scanLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(continuousScanAnim, {
          toValue: 1,
          duration: 3200,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(continuousScanAnim, {
          toValue: 0,
          duration: 3200,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    );
    scanLoop.start();

    // 2. Concentric Green Hotspots Pulse Loop (scale/opacity)
    const pulseLoop = Animated.loop(
      Animated.timing(hotspotPulseAnim, {
        toValue: 1,
        duration: 2000,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      })
    );
    pulseLoop.start();

    return () => {
      scanLoop.stop();
      pulseLoop.stop();
    };
  }, [continuousScanAnim, hotspotPulseAnim]);

  // Tier capabilities (for HQ photo + Auto Crop gating)
  const [caps, setCaps] = useState(tierCaps('free'));

  // Branded quota-wall modal — replaces native Alert.alert. We carry the
  // friendly reason text from checkScanAllowed and a flag for whether the
  // user is on Free tier (so we can show the trial-first CTA).
  const [quotaModal, setQuotaModal] = useState<{
    visible: boolean;
    reason: string;
    isFreeQuotaWall: boolean;
    reasonPayload?: UpgradeReason;
  }>({ visible: false, reason: '', isFreeQuotaWall: false });

  // "Hot moment" data-consent modal. Triggered when a Free user without
  // a recorded consent decision hits the quota wall — instead of the
  // generic upgrade prompt, we offer +5 credits in exchange for opt-in.
  const [consentBridgeVisible, setConsentBridgeVisible] = useState(false);

  // P1 AI Processing Consent Gate — Apple AI Policy 2025 + PDPA require explicit
  // consent before sending user photos to third-party AI (Google Gemini + Replicate, USA).
  const [aiConsentLoading, setAiConsentLoading] = useState(true);
  const [aiConsentModalVisible, setAiConsentModalVisible] = useState(false);
  React.useEffect(() => {
    (async () => {
      const granted = await hasValidAiConsent();
      if (!granted) {
        setAiConsentModalVisible(true);
      }
      setAiConsentLoading(false);
    })();
  }, []);

  // C1 — Auto-shutter preference. Default OFF after field report
  const [autoShutter, setAutoShutter] = useState(false);
  const autoShutterFired = useRef(false);
  // Track when the camera became visible — gate auto-fire against the
  // first 1.5s of camera-open time so the system doesn't trigger
  // immediately when the user opens the scan screen.
  const cameraOpenAt = useRef(Date.now());
  React.useEffect(() => {
    cameraOpenAt.current = Date.now();
  }, []);

  // C1 — Motion stability tracker. Only active while the camera is
  // visible AND we're not in the middle of capture.
  const { state: stability } = useMotionStability({
    enabled: !busy,
  });
  React.useEffect(() => {
    (async () => {
      const m = await getMembership();
      setCaps(tierCaps(m.tier));
    })();
  }, []);

  // Pre-warm fires on EVERY focus of the scan screen.
  useFocusEffect(
    React.useCallback(() => {
      prewarmAll();
    }, [])
  );

  // Reset the auto-shutter latch whenever we change which slot we're
  // capturing for, so each slot gets one (and only one) auto-fire.
  React.useEffect(() => {
    autoShutterFired.current = false;
  }, [side]);

  // Auto-shutter: when the user has steady hands AND auto-shutter is enabled AND we have an empty slot.
  React.useEffect(() => {
    if (!autoShutter) return;
    if (stability !== 'stable') return;
    if (busy) return;
    if (autoShutterFired.current) return;
    // Settling-in gate — ignore the first 1.5s after the camera opens
    if (Date.now() - cameraOpenAt.current < 1500) return;
    // Don't auto-fire if this slot already has a photo.
    const slotEmpty =
      (side === 'front' && !frontUri) ||
      (side === 'back' && !backUri) ||
      (side === 'top' && !topUri) ||
      (side === 'bottom' && !bottomUri);
    if (!slotEmpty) return;
    autoShutterFired.current = true;
    void logTesterEvent('feature_used', {
      feature: 'auto_shutter_fired',
      side,
    }).catch(() => {});
    // Defer so the "📸 AUTO Capturing..." pill paints
    setTimeout(() => takePicture(), 450);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stability, autoShutter, busy, side, frontUri, backUri, topUri, bottomUri]);

  if (!permission) {
    return (
      <View style={styles.permWrap}>
        <Text style={styles.permText}>Loading Camera...</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.permWrap}>
        <Text style={styles.permTitle}>📷 {t('scan.cameraPermission')}</Text>
        <Text style={styles.permText}>
          {t('scan.cameraDesc')}
        </Text>
        <PrimaryButton
          label={t('scan.cameraBtn')}
          onPress={requestPermission}
          style={{ width: '100%', marginTop: spacing.lg }}
        />
        <PrimaryButton
          label={t('common.cancel')}
          variant="ghost"
          onPress={() => navigation.goBack()}
          style={{ width: '100%' }}
        />
      </SafeAreaView>
    );
  }

  function showFocusRing(x: number, y: number) {
    setFocusPos({ x, y });
    focusAnim.setValue(0);
    Animated.sequence([
      Animated.timing(focusAnim, {
        toValue: 1,
        duration: 200,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.delay(600),
      Animated.timing(focusAnim, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }),
    ]).start(() => setFocusPos(null));
  }

  function runScannerEffect() {
    // Sound (fire-and-forget; safe if asset failed to load)
    try {
      if (beepPlayer) {
        beepPlayer.seekTo(0);
        beepPlayer.play();
      }
    } catch {
      // ignore — visual still works
    }

    // Heavy haptic at start
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

    // Scan line sweep top→bottom
    scanLineAnim.setValue(0);
    Animated.timing(scanLineAnim, {
      toValue: 1,
      duration: SCAN_DURATION_MS,
      easing: Easing.inOut(Easing.quad),
      useNativeDriver: true,
    }).start(() => {
      // Flash + success haptic at the end
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Animated.sequence([
        Animated.timing(flashAnim, {
          toValue: 1,
          duration: 60,
          useNativeDriver: true,
        }),
        Animated.timing(flashAnim, {
          toValue: 0,
          duration: 180,
          useNativeDriver: true,
        }),
      ]).start();
    });
  }

  async function takePicture() {
    if (!cameraRef.current || busy) return;
    setBusy(true);
    try {
      // Kick off scanner effect in parallel with capture
      runScannerEffect();

      const photo = await cameraRef.current.takePictureAsync({
        quality: caps.highQualityPhoto ? 1 : 0.6,
        skipProcessing: false,
        exif: false,
      });
      if (!photo?.uri) return;

      // Cap to 2048px
      const sized = await resizeIfHuge(photo.uri);

      // Auto-crop only if tier allows it
      const croppedUri = caps.autoCrop ? await autoCropToSquare(sized, 'camera') : sized;

      // C1 quality gate
      const q = await assessImageQuality(croppedUri);
      void logTesterEvent('feature_used', {
        feature: 'capture_quality',
        side,
        score: q.score,
        sharpness: q.sharpness,
        brightness: q.brightness,
        verdict: q.verdict,
      }).catch(() => {});

      await new Promise((r) => setTimeout(r, 150));

      assignToSide(side, croppedUri);
      setSide(nextEmptySide(side, croppedUri));
    } catch (e) {
      Alert.alert('CAMERA ERROR', 'Failed to capture timepiece exposure: ' + String(e));
    } finally {
      setBusy(false);
    }
  }

  async function pickFromGallery() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: caps.highQualityPhoto ? 1 : 0.6,
    });
    if (result.canceled || !result.assets[0]?.uri) return;
    const sized = await resizeIfHuge(result.assets[0].uri);
    // Gallery path → skip inner-zoom tightening
    const cropped = caps.autoCrop ? await autoCropToSquare(sized, 'gallery') : sized;
    assignToSide(side, cropped);
    setSide(nextEmptySide(side, cropped));
  }

  function assignToSide(s: Side, uri: string) {
    if (s === 'front') setFrontUri(uri);
    else if (s === 'back') setBackUri(uri);
    else if (s === 'top') setTopUri(uri);
    else setBottomUri(uri);
  }

  // After capturing for `s`, jump to the next still-empty slot.
  function nextEmptySide(s: Side, justCaptured: string): Side {
    const filled: Record<Side, string | null> = {
      front: s === 'front' ? justCaptured : frontUri,
      back: s === 'back' ? justCaptured : backUri,
      top: s === 'top' ? justCaptured : topUri,
      bottom: s === 'bottom' ? justCaptured : bottomUri,
    };
    const order = SIDE_ORDER.slice(0, caps.templatePhotoCount);
    for (const next of order) {
      if (!filled[next]) return next;
    }
    return s;
  }

  async function handleAnalyze() {
    if (!frontUri) return;
    const membership = await getMembership();
    const freeUsed = await getFreeScansUsed();
    const check = await checkScanAllowed(
      membership.tier,
      freeUsed,
      membership.trialStart
    );
    if (!check.allowed) {
      const isFreeQuotaWall =
        membership.tier === 'free' && !membership.isTrialing;

      const consentForLog = await getDataConsent();
      const windowExpired =
        isFreeQuotaWall && (await isFreeWindowExpired());
      console.log('[ScanScreen] quota wall hit, gate check:', {
        tier: membership.tier,
        isTrialing: membership.isTrialing,
        isFreeQuotaWall,
        consentGrantedAt: consentForLog.grantedAt,
        windowExpired,
        willShowConsentBridge:
          isFreeQuotaWall && !consentForLog.grantedAt && !windowExpired,
      });
      if (isFreeQuotaWall && !windowExpired) {
        if (!consentForLog.grantedAt) {
          setConsentBridgeVisible(true);
          return;
        }
      }

      // Compute caps/used details for reason payload
      let cap = 5;
      let used = 5;
      if (membership.tier === 'standard') {
        cap = 10;
        used = 10;
      } else if (membership.tier === 'pro') {
        cap = 30;
        used = 30;
      }

      setQuotaModal({
        visible: true,
        reason: check.reason ?? 'Monthly scan allocation has been fully exhausted.',
        isFreeQuotaWall,
        reasonPayload: { kind: 'auth_quota_exhausted', used, cap, windowDays: 30 },
      });
      void logTesterEvent('feature_used', {
        feature: 'quota_wall_shown',
        tier: membership.tier,
        isTrialing: membership.isTrialing,
        isFreeQuotaWall,
        windowExpired,
        reason: check.reason ?? null,
      });
      return;
    }

    const extras: string[] =
      caps.templatePhotoCount === 4
        ? ([topUri, bottomUri].filter(Boolean) as string[])
        : caps.templatePhotoCount === 3
          ? ([topUri].filter(Boolean) as string[])
          : [];
    navigation.replace('Loading', {
      frontUri,
      backUri: backUri ?? undefined,
      extraImages: extras.length > 0 ? extras : undefined,
    });
  }

  function reset(target: Side) {
    if (target === 'front') {
      setFrontUri(null);
      setBackUri(null);
      setTopUri(null);
      setBottomUri(null);
      setSide('front');
      return;
    }
    if (target === 'back') setBackUri(null);
    else if (target === 'top') setTopUri(null);
    else setBottomUri(null);
    setSide(target);
  }

  return (
    <View style={styles.container}>
      <CameraView
        ref={cameraRef}
        style={styles.camera}
        facing={facing}
        autofocus="on"
      />

      {/* Tap-to-focus overlay */}
      <Pressable
        style={styles.tapOverlay}
        onPress={(e) => {
          showFocusRing(e.nativeEvent.locationX, e.nativeEvent.locationY);
          Haptics.selectionAsync();
        }}
      />

      {focusPos && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.focusRing,
            {
              left: focusPos.x - 35,
              top: focusPos.y - 35,
              opacity: focusAnim,
              transform: [
                {
                  scale: focusAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [1.4, 1],
                  }),
                },
              ],
            },
          ]}
        />
      )}

      <ScanCoachingOverlay
        stability={stability}
        hidden={busy}
        autoArmed={autoShutter}
        remainingSlots={
          caps.templatePhotoCount -
          [frontUri, backUri, topUri, bottomUri].filter(Boolean).length
        }
      />

      {/* Frame at TRUE screen center — aligned to 1:1 watch dial guidlines */}
      <View style={styles.frameAbsolute} pointerEvents="none">
        <View style={[styles.corner, styles.cornerTL]} />
        <View style={[styles.corner, styles.cornerTR]} />
        <View style={[styles.corner, styles.cornerBL]} />
        <View style={[styles.corner, styles.cornerBR]} />

        {/* Hint centered inside the frame */}
        <View style={styles.hintCenter} pointerEvents="none">
          <Text style={styles.hintLine}>{t('scan.instructions')}</Text>
          <Text style={styles.hintLine}>{lang === 'th' ? 'แตะหน้าจอเพื่อโฟกัส' : 'Tap screen to focus'}</Text>
        </View>

        {/* Continuous Laser scan line */}
        <Animated.View
          pointerEvents="none"
          style={[
            styles.continuousScanLine,
            {
              transform: [
                {
                  translateY: continuousScanAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, FRAME_H - 2],
                  }),
                },
              ],
            },
          ]}
        />

        {/* Pulsing Green Authenticity Hotspots */}
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          {/* Logo Hotspot */}
          <View style={[styles.hotspotContainer, { left: 120, top: 75 }]}>
            <Animated.View
              style={[
                styles.hotspotPulse,
                {
                  transform: [
                    {
                      scale: hotspotPulseAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.6, 1.8],
                      }),
                    },
                  ],
                  opacity: hotspotPulseAnim.interpolate({
                    inputRange: [0, 0.8, 1],
                    outputRange: [0.8, 0.4, 0],
                  }),
                },
              ]}
            />
            <View style={styles.hotspotDot} />
            <Text style={styles.hotspotText}>LOGO</Text>
          </View>

          {/* Bezel Hotspot */}
          <View style={[styles.hotspotContainer, { left: 120, top: 25 }]}>
            <Animated.View
              style={[
                styles.hotspotPulse,
                {
                  transform: [
                    {
                      scale: hotspotPulseAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.6, 1.8],
                      }),
                    },
                  ],
                  opacity: hotspotPulseAnim.interpolate({
                    inputRange: [0, 0.8, 1],
                    outputRange: [0.8, 0.4, 0],
                  }),
                },
              ]}
            />
            <View style={styles.hotspotDot} />
            <Text style={styles.hotspotText}>BEZEL</Text>
          </View>

          {/* Crown Hotspot */}
          <View style={[styles.hotspotContainer, { left: 215, top: 120 }]}>
            <Animated.View
              style={[
                styles.hotspotPulse,
                {
                  transform: [
                    {
                      scale: hotspotPulseAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.6, 1.8],
                      }),
                    },
                  ],
                  opacity: hotspotPulseAnim.interpolate({
                    inputRange: [0, 0.8, 1],
                    outputRange: [0.8, 0.4, 0],
                  }),
                },
              ]}
            />
            <View style={styles.hotspotDot} />
            <Text style={styles.hotspotText}>CROWN</Text>
          </View>

          {/* Hands/Dial Hotspot */}
          <View style={[styles.hotspotContainer, { left: 120, top: 195 }]}>
            <Animated.View
              style={[
                styles.hotspotPulse,
                {
                  transform: [
                    {
                      scale: hotspotPulseAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.6, 1.8],
                      }),
                    },
                  ],
                  opacity: hotspotPulseAnim.interpolate({
                    inputRange: [0, 0.8, 1],
                    outputRange: [0.8, 0.4, 0],
                  }),
                },
              ]}
            />
            <View style={styles.hotspotDot} />
            <Text style={styles.hotspotText}>DIAL/HANDS</Text>
          </View>
        </View>

        {/* Shutter Capture success fast scan line */}
        <Animated.View
          pointerEvents="none"
          style={[
            styles.scanLine,
            {
              opacity: scanLineAnim.interpolate({
                inputRange: [0, 0.05, 0.95, 1],
                outputRange: [0, 1, 1, 0],
              }),
              transform: [
                {
                  translateY: scanLineAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, FRAME_H - 3],
                  }),
                },
              ],
            },
          ]}
        />
        {/* Glow trail behind shutter scan line */}
        <Animated.View
          pointerEvents="none"
          style={[
            styles.scanGlow,
            {
              opacity: scanLineAnim.interpolate({
                inputRange: [0, 0.1, 0.9, 1],
                outputRange: [0, 0.6, 0.6, 0],
              }),
              transform: [
                {
                  translateY: scanLineAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-30, FRAME_H - 30],
                  }),
                },
              ],
            },
          ]}
        />
      </View>

      {/* Capture flash */}
      <Animated.View
        pointerEvents="none"
        style={[styles.flash, { opacity: flashAnim }]}
      />

      <SafeAreaView style={styles.overlay} edges={['top', 'bottom']} pointerEvents="box-none">
        <View style={styles.topBar}>
          <Pressable style={styles.iconBtn} onPress={() => navigation.goBack()}>
            <Feather name="x" size={20} color="#fff" />
          </Pressable>
          <View style={styles.sideBadge}>
            <Text style={styles.sideText}>{t(`scan.${side}SideLabel`)}</Text>
          </View>
          <View style={{ width: 40 }} />
        </View>

        <View style={{ flex: 1 }} pointerEvents="box-none" />

        <View style={styles.bottomBar}>
          <View style={styles.previewRow}>
            <Preview
              label={lang === 'th' ? 'หน้าปัด' : 'Dial'}
              uri={frontUri}
              onPress={() => reset('front')}
              active={side === 'front'}
            />
            {caps.templatePhotoCount >= 2 && (
              <Preview
                label={lang === 'th' ? 'ฝาหลัง' : 'Caseback'}
                uri={backUri}
                onPress={() => reset('back')}
                optional
                active={side === 'back'}
              />
            )}
            {caps.templatePhotoCount >= 3 && (
              <Preview
                label={lang === 'th' ? 'เม็ดมะยม' : 'Crown'}
                uri={topUri}
                onPress={() => reset('top')}
                optional
                active={side === 'top'}
              />
            )}
            {caps.templatePhotoCount === 4 && (
              <Preview
                // Slot 4 is the highest-value macro shot for counterfeit
                // detection — rehaut engraving (Rolex post-2008), bezel
                // ceramic insert close-up, or movement through display
                // back. Label kept generic ("Macro") so user can shoot
                // whichever micro-detail is most informative for their
                // watch.
                label={lang === 'th' ? 'รายละเอียด' : 'Macro'}
                uri={bottomUri}
                onPress={() => reset('bottom')}
                optional
                active={side === 'bottom'}
              />
            )}
          </View>

          <View style={styles.controls}>
            <Pressable style={styles.galleryBtn} onPress={pickFromGallery}>
              <Feather name="image" size={24} color="#fff" />
            </Pressable>
            <Pressable
              style={[
                styles.shutter,
                stability === 'stable' && styles.shutterReady,
                stability === 'stabilizing' && styles.shutterStabilizing,
                busy && { opacity: 0.5 },
              ]}
              onPress={takePicture}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel={t('a11y.shutter')}
            >
              <View style={styles.shutterInner} />
            </Pressable>
            <Pressable
              style={[
                styles.autoShutterBtn,
                autoShutter && styles.autoShutterBtnOn,
              ]}
              onPress={() => {
                setAutoShutter((on) => {
                  void logTesterEvent('feature_used', {
                    feature: 'auto_shutter_toggle',
                    enabled: !on,
                  }).catch(() => {});
                  return !on;
                });
              }}
            >
              <Feather
                name="zap"
                size={18}
                color={autoShutter ? colors.gold : 'rgba(255,255,255,0.7)'}
              />
              <Text
                style={[
                  styles.autoShutterText,
                  autoShutter && { color: colors.gold },
                ]}
              >
                AUTO
              </Text>
            </Pressable>
          </View>

          {(() => {
            const filledCount = [frontUri, backUri, topUri, bottomUri].filter(Boolean).length;
            const required = caps.templatePhotoCount;
            if (filledCount < required) return null;
            const label = lang === 'th'
              ? (required === 1 ? 'เริ่มวิเคราะห์ (เฉพาะหน้าปัด)' : `✓ เริ่มวิเคราะห์ด้วย AI (${filledCount} ภาพ)`)
              : (required === 1 ? 'ANALYZE (DIAL ONLY)' : `✓ AI DIAGNOSIS (${filledCount} PHOTOS)`);
            return (
              <PrimaryButton
                label={label}
                onPress={handleAnalyze}
                variant="primary"
                style={styles.analyzeBtn}
              />
            );
          })()}
        </View>
      </SafeAreaView>

      <AiProcessingConsentModal
        visible={aiConsentModalVisible}
        onDecided={(granted) => {
          setAiConsentModalVisible(false);
          if (!granted) {
            navigation.goBack();
          }
        }}
      />

      <DataConsentModal
        visible={consentBridgeVisible}
        context="quota-wall"
        onDecided={async (granted) => {
          if (!granted) return;
          await grantFreeScanBonus();
          const extras =
            caps.templatePhotoCount === 4
              ? ([topUri, bottomUri].filter(Boolean) as string[])
              : [];
          if (frontUri) {
            navigation.replace('Loading', {
              frontUri,
              backUri: backUri ?? undefined,
              extraImages: extras.length > 0 ? extras : undefined,
            });
          }
        }}
        onClose={() => setConsentBridgeVisible(false)}
      />

      <UpgradeModal
        visible={quotaModal.visible}
        onClose={() => setQuotaModal((m) => ({ ...m, visible: false }))}
        onUpgrade={() => {
          setQuotaModal((m) => ({ ...m, visible: false }));
          navigation.navigate('Membership');
        }}
        tier={quotaModal.isFreeQuotaWall ? 'premium' : 'pro'}
        reason={quotaModal.reasonPayload}
        iconEmoji="📷"
        title={lang === 'th' ? 'สิทธิ์การสแกนหมดแล้ว' : 'Scan Limit Reached'}
        body={quotaModal.reason}
        ctaText={
          quotaModal.isFreeQuotaWall
            ? (lang === 'th' ? 'เริ่มทดลองใช้ Premium ฟรี 7 วัน' : 'Start Premium 7-Day Free Trial')
            : (lang === 'th' ? 'อัปเกรดระดับสมาชิก' : 'Upgrade Membership')
        }
        cancelText={lang === 'th' ? 'ปิด' : 'Close'}
        benefits={
          quotaModal.isFreeQuotaWall
            ? [
                { icon: '🎁', text: lang === 'th' ? 'เข้าถึงฟีเจอร์พรีเมียมทั้งหมดฟรี 7 วัน' : 'Access all Premium features for 7 days' },
                { icon: '📷', text: lang === 'th' ? 'รับสิทธิ์สแกนเพิ่ม 10 ครั้งระหว่างทดลองใช้' : '10 additional scans during trial' },
                { icon: '✨', text: lang === 'th' ? 'ยกเลิกได้ทุกเมื่อ ไม่มีเงื่อนไขผูกมัด' : 'Cancel anytime, zero obligations' },
              ]
            : [
                { icon: '📷', text: lang === 'th' ? 'เพิ่มโควต้าจำนวนการสแกนรายเดือน' : 'Increase monthly scan allocations' },
                { icon: '🛡️', text: lang === 'th' ? 'ปลดล็อกการวิเคราะห์ความแท้ AI ระดับลึก' : 'Unlock deep Authenticity AI diagnostics' },
                { icon: '☁️', text: lang === 'th' ? 'สำรองข้อมูลคลาวด์ตู้นิรภัยอย่างปลอดภัย' : 'Secure cloud backup of your collector vault' },
              ]
        }
      />
    </View>
  );
}

function Preview({
  label,
  uri,
  onPress,
  optional,
  active,
}: {
  label: string;
  uri: string | null;
  onPress: () => void;
  optional?: boolean;
  active?: boolean;
}) {
  return (
    <Pressable style={styles.preview} onPress={onPress}>
      {uri ? (
        <Image source={{ uri }} style={styles.previewImg} />
      ) : (
        <View style={[styles.previewEmpty, active && styles.previewEmptyActive]}>
          <Feather
            name="camera"
            size={18}
            color={active ? colors.gold : 'rgba(255,255,255,0.5)'}
          />
        </View>
      )}
      <Text style={[styles.previewLabel, active && styles.previewLabelActive]}>
        {label}
        {optional && !uri && <Text style={styles.previewOptional}> *</Text>}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  camera: { ...StyleSheet.absoluteFillObject },
  tapOverlay: { ...StyleSheet.absoluteFillObject },
  overlay: { flex: 1, justifyContent: 'space-between' },
  permWrap: {
    flex: 1,
    backgroundColor: colors.background,
    padding: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  permTitle: { ...typography.h2, textAlign: 'center' },
  permText: { ...typography.body, textAlign: 'center', color: colors.textSecondary },

  focusRing: {
    position: 'absolute',
    width: 70,
    height: 70,
    borderRadius: 35,
    borderWidth: 2,
    borderColor: colors.amber,
    backgroundColor: 'rgba(236, 200, 122, 0.08)',
  },

  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnText: { color: '#fff', fontSize: 18, fontWeight: '600' },
  sideBadge: {
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
  },
  sideText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  frame: {
    alignSelf: 'center',
    width: FRAME_W,
    height: FRAME_H,
  },
  frameAbsolute: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: FRAME_W,
    height: FRAME_H,
    marginLeft: -FRAME_W / 2,
    marginTop: -FRAME_H / 2,
  },
  corner: {
    position: 'absolute',
    width: 30,
    height: 30,
    borderColor: colors.gold,
  },
  cornerTL: { top: 0, left: 0, borderTopWidth: 1.5, borderLeftWidth: 1.5 },
  cornerTR: { top: 0, right: 0, borderTopWidth: 1.5, borderRightWidth: 1.5 },
  cornerBL: { bottom: 0, left: 0, borderBottomWidth: 1.5, borderLeftWidth: 1.5 },
  cornerBR: { bottom: 0, right: 0, borderBottomWidth: 1.5, borderRightWidth: 1.5 },

  continuousScanLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1.5,
    backgroundColor: '#ECC87A',
    shadowColor: '#ECC87A',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.85,
    shadowRadius: 8,
    elevation: 4,
  },

  hotspotContainer: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    width: 40,
    height: 40,
    marginLeft: -20,
    marginTop: -20,
  },
  hotspotPulse: {
    position: 'absolute',
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.2,
    borderColor: '#4ADE80',
    backgroundColor: 'rgba(74, 222, 128, 0.12)',
  },
  hotspotDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#4ADE80',
    shadowColor: '#4ADE80',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 3,
    elevation: 2,
  },
  hotspotText: {
    position: 'absolute',
    top: 14,
    color: '#4ADE80',
    fontSize: 7.5,
    fontWeight: '800',
    letterSpacing: 0.5,
    textShadowColor: 'rgba(0,0,0,0.85)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },

  scanLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: 3,
    backgroundColor: colors.amber,
    shadowColor: colors.amber,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 12,
    elevation: 8,
  },
  scanGlow: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: 60,
    backgroundColor: colors.amber,
    opacity: 0.18,
  },
  flash: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#FFFFFF',
  },

  hintCenter: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  hintLine: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    textShadowColor: 'rgba(0,0,0,0.85)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },

  bottomBar: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    gap: spacing.md,
  },
  previewRow: { flexDirection: 'row', gap: spacing.sm, justifyContent: 'center' },
  preview: { alignItems: 'center', gap: spacing.xs },
  previewImg: {
    width: 56,
    height: 56,
    borderRadius: radius.sm,
    borderWidth: 2,
    borderColor: colors.gold,
  },
  previewEmpty: {
    width: 56,
    height: 56,
    borderRadius: radius.sm,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: 'rgba(255,255,255,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewEmptyActive: {
    borderColor: colors.gold,
    borderStyle: 'solid',
    backgroundColor: 'rgba(236, 200, 122, 0.15)',
  },
  previewEmptyIcon: { fontSize: 22, opacity: 0.7 },
  previewLabel: { color: '#fff', fontSize: 11 },
  previewLabelActive: { color: colors.gold, fontWeight: '700' },
  previewOptional: { fontSize: 10, opacity: 0.7, color: colors.gold },

  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
  },
  galleryBtn: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  galleryIcon: { fontSize: 24 },
  shutter: {
    width: 78,
    height: 78,
    borderRadius: 39,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: '#fff',
  },
  shutterReady: {
    borderColor: '#4ADE80',
    backgroundColor: 'rgba(74, 222, 128, 0.30)',
    shadowColor: '#4ADE80',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 14,
    elevation: 10,
  },
  shutterStabilizing: {
    borderColor: '#F59E0B',
    backgroundColor: 'rgba(245, 158, 11, 0.20)',
  },
  shutterInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#fff',
  },
  autoShutterBtn: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.25)',
    gap: 2,
  },
  autoShutterBtnOn: {
    borderColor: colors.gold,
    backgroundColor: 'rgba(236, 200, 122, 0.18)',
  },
  autoShutterText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  analyzeBtn: { backgroundColor: colors.gold },
});
