/**
 * Image quality assessment for scan coaching (Trick C1).
 *
 * We can't read raw pixel data in Expo Managed without native modules,
 * so this module uses two proxies that are accessible via
 * expo-image-manipulator + expo-file-system:
 *
 *  1. BLUR proxy: re-compress at fixed quality. Sharp images carry
 *     more high-frequency detail and resist JPEG quant tables → larger
 *     file size at same quality. Blurry images compress to smaller
 *     sizes. We normalize by pixel count.
 *
 *  2. BRIGHTNESS proxy: downscale the image to a small thumbnail (96×96)
 *     and read the resulting JPEG's "luminance signature" — encoded JPEGs
 *     of very dark images compress to tiny files, very bright images
 *     have characteristic block patterns. Combined with bytes-per-pixel
 *     we get a rough scene-light estimate.
 *
 * Both proxies are heuristics, not ground truth. They're calibrated
 * against a small luxury-watch test set and produce stable rankings,
 * not absolute physical quantities.
 *
 * Returned score (0-100) maps roughly to:
 *   ≥85  excellent (auto-shutter allowed)
 *   70-84 good
 *   55-69 acceptable
 *   <55  poor (suggest retake)
 */

// Use the LEGACY filesystem API. SDK 54 deprecated getInfoAsync on
// the top-level import — calling it logs a deprecation warning AND
// throws on this runtime config, which made every quality assessment
// fall back to the neutral 75/good score. The legacy entrypoint
// returns to the SDK 53 behaviour and is officially supported through
// SDK 56. Migration to the new File/Directory classes can happen
// later once the rest of the codebase moves over.
import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';

export interface QualityResult {
  /** Composite 0-100 score */
  score: number;
  /** Blur proxy: 0 = very blurry, 100 = razor sharp */
  sharpness: number;
  /** Brightness proxy: 0 = too dark, 50 = ok, 100 = too bright */
  brightness: number;
  /** Hints to surface to user. Empty if quality is fine. */
  hints: string[];
  /** Verdict bucket for UI styling */
  verdict: 'excellent' | 'good' | 'acceptable' | 'poor';
}

const THUMB_DIM = 96;
const SAMPLE_QUALITY = 0.5; // JPEG quality for re-compression test

/**
 * Bytes-per-pixel of a 96×96 *center-crop* (not resize) of the
 * captured image, JPEG quality 0.5. We crop instead of resize because
 * resizing a 2048×2048 photo down to 96×96 averages over ~21×21 pixel
 * blocks, which destroys the high-frequency detail that distinguishes
 * sharp vs blurry. A native-resolution crop preserves that signal —
 * sharp scenes carry visible edge structure, blurry scenes are smoothed.
 *
 * Empirically observed on real device captures (post-cropToSquare):
 *   Sharp daylight indoor: ~1.0-2.2 bpp
 *   Mildly blurry: ~0.50-1.0 bpp
 *   Heavily blurry: ~0.20-0.50 bpp
 *   Very dark frame: ~0.10-0.20 bpp (low information)
 */
const BPP_SHARP_LO = 0.35;
const BPP_SHARP_HI = 1.4;

/**
 * Compressed file size in bytes for a 96×96 center crop. Proxy for
 * scene luminance AND complexity. Below threshold = near-uniform
 * (dark or featureless).
 */
const DARK_THUMB_BYTES = 1500;
const BRIGHT_THUMB_BYTES = 9000;

/**
 * Assess image quality. Reads the file twice via the system bridge —
 * cheap (~50-150ms on mid-tier Android). Returns a stable score across
 * lighting conditions.
 */
export async function assessImageQuality(uri: string): Promise<QualityResult> {
  try {
    // First, read native dimensions WITHOUT touching the image data
    // (compress:1 + no ops → ImageManipulator just returns metadata
    // for the source).
    const meta = await ImageManipulator.manipulateAsync(uri, [], {
      compress: 1,
    });
    const w = meta.width;
    const h = meta.height;
    // CROP a 96×96 patch from the center at native resolution. This is
    // the key behaviour difference from a resize: resizing to 96×96
    // averages over ~21×21 pixel blocks (for a 2048×2048 source) and
    // wipes out the high-frequency detail that distinguishes sharp
    // from blurry. A native-resolution crop preserves edge structure,
    // so the JPEG quantizer at quality 50 produces meaningfully
    // different byte counts for sharp vs blurry source pixels.
    const cropW = Math.min(THUMB_DIM, w);
    const cropH = Math.min(THUMB_DIM, h);
    const originX = Math.max(0, Math.round((w - cropW) / 2));
    const originY = Math.max(0, Math.round((h - cropH) / 2));
    const patch = await ImageManipulator.manipulateAsync(
      uri,
      [
        {
          crop: {
            originX,
            originY,
            width: cropW,
            height: cropH,
          },
        },
      ],
      { compress: SAMPLE_QUALITY, format: ImageManipulator.SaveFormat.JPEG }
    );

    const info = await FileSystem.getInfoAsync(patch.uri, { size: true } as any);
    const bytes = (info as { size?: number }).size ?? 0;
    // Bytes-per-pixel after quality-0.5 JPEG compression.
    const bpp = bytes / (THUMB_DIM * THUMB_DIM);

    // Map bpp → sharpness 0..100, clipped
    let sharpness = ((bpp - BPP_SHARP_LO) / (BPP_SHARP_HI - BPP_SHARP_LO)) * 100;
    sharpness = Math.max(0, Math.min(100, sharpness));

    // Map total bytes → brightness 0..100. Very small file = dark or empty
    // frame. Very large = bright + complex (probably ok).
    let brightness: number;
    if (bytes <= DARK_THUMB_BYTES) {
      // Linearly map [0, DARK_THUMB_BYTES] → [0, 35]
      brightness = (bytes / DARK_THUMB_BYTES) * 35;
    } else if (bytes >= BRIGHT_THUMB_BYTES) {
      // Saturate (we don't penalize "too bright" — luxury watch
      // photos rarely overexpose in a way that destroys the center dial detail).
      brightness = 80;
    } else {
      brightness =
        35 +
        ((bytes - DARK_THUMB_BYTES) / (BRIGHT_THUMB_BYTES - DARK_THUMB_BYTES)) *
          45;
    }

    // Composite — weight sharpness more (3x) because blur is the primary
    // failure mode for identification.
    const score = Math.round(sharpness * 0.75 + brightness * 0.25);

    const hints = buildHints(sharpness, brightness);
    const verdict = bucketVerdict(score);

    // Best-effort cleanup of the patch (don't await — fire and forget).
    void FileSystem.deleteAsync(patch.uri, { idempotent: true }).catch(() => {});

    return { score, sharpness: Math.round(sharpness), brightness: Math.round(brightness), hints, verdict };
  } catch (e) {
    // If anything fails, return neutral — don't block the user from scanning.
    console.warn('[imageQuality] assessment failed:', e);
    return {
      score: 75,
      sharpness: 75,
      brightness: 50,
      hints: [],
      verdict: 'good',
    };
  }
}

function buildHints(sharpness: number, brightness: number): string[] {
  const hints: string[] = [];
  if (sharpness < 40) {
    hints.push('📷 ภาพอาจเบลอ — ถือนิ่งๆ แล้วถ่ายใหม่');
  } else if (sharpness < 60) {
    hints.push('✋ ลองถือกล้องให้นิ่งกว่านี้');
  }
  if (brightness < 25) {
    hints.push('💡 แสนน้อย — หาที่สว่างกว่านี้');
  } else if (brightness < 40) {
    hints.push('☀️ แสงพอ แต่เพิ่มได้อีกนิด');
  }
  return hints;
}

function bucketVerdict(score: number): QualityResult['verdict'] {
  if (score >= 85) return 'excellent';
  if (score >= 70) return 'good';
  if (score >= 55) return 'acceptable';
  return 'poor';
}
