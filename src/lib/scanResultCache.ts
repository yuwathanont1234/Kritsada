import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImageManipulator from 'expo-image-manipulator';
import { supabase } from './supabase';
import { ScanResult } from './types';

/**
 * Local scan-result cache keyed by image content fingerprint.
 *
 * Why: users sometimes re-tap the scan button on the same photo (network
 * glitch, accidentally back-and-forward, or just curiosity) — without a
 * cache, every re-tap pays the full Gemini cost again. A 7-day local
 * cache catches the dedupe case for ฿0.
 *
 * Why a thumbnail-bytes hash and not a perceptual/AI hash:
 *   - We need a stable fingerprint without an extra Replicate call (would
 *     defeat the cost savings).
 *   - Resizing to a tiny 32×32 grayscale thumb canonicalises the image
 *     enough that re-encodes from the same source yield the same hash,
 *     while still differing across distinct photos.
 *   - It will NOT match two different shots of the same physical watch
 *     under different lighting — that's a feature, not a bug. Those are
 *     genuinely new scans and the user expects fresh AI analysis.
 *
 * Storage: AsyncStorage `@luxury/scan_cache:<hash>` → JSON {ts, result}
 * with a sliding 7-day TTL. We don't bother with an eviction policy —
 * even at 1k cached entries × ~3KB each = ~3MB, which is fine for mobile.
 */

const KEY_PREFIX = '@luxury/scan_cache:';
const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

type CacheEntry = {
  ts: number;
  result: ScanResult;
};

/**
 * Compute a stable string fingerprint of the image's visual content.
 * Steps:
 *   1. Resize to 32×32 JPEG at low quality (canonicalises encoding noise).
 *   2. Grab the base64 string of those bytes.
 *   3. Run a 32-bit FNV-1a hash over them and return as base36.
 *
 * Returns null on any failure — caller should treat that as "skip cache"
 * rather than crash the scan.
 */
export async function computeImageFingerprint(
  uri: string
): Promise<string | null> {
  try {
    const tiny = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: 32, height: 32 } }],
      {
        compress: 0.1,
        format: ImageManipulator.SaveFormat.JPEG,
        base64: true,
      }
    );
    if (!tiny.base64) return null;
    return fnv1a32(tiny.base64);
  } catch {
    return null;
  }
}

/**
 * 32-bit FNV-1a string hash → base36. Not cryptographic, but plenty
 * unique for cache-key purposes (~4 billion buckets).
 */
function fnv1a32(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/**
 * Combined fingerprint for a multi-image scan. Concatenates per-image
 * fingerprints so front-only and front+back scans hash differently even
 * when the front photo is identical.
 */
export async function computeScanFingerprint(
  frontUri: string,
  backUri?: string,
  extras?: string[]
): Promise<string | null> {
  const uris = [frontUri, backUri, ...(extras ?? [])].filter(
    Boolean
  ) as string[];
  const parts = await Promise.all(uris.map(computeImageFingerprint));
  if (parts.some((p) => p === null)) return null;
  return parts.join('-');
}

export async function getCachedScanResult(
  fingerprint: string
): Promise<ScanResult | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY_PREFIX + fingerprint);
    if (!raw) return null;
    const entry = JSON.parse(raw) as CacheEntry;
    if (!entry?.ts || Date.now() - entry.ts > TTL_MS) {
      // Stale — clean up so the cache doesn't accumulate dead entries.
      await AsyncStorage.removeItem(KEY_PREFIX + fingerprint);
      return null;
    }
    return entry.result;
  } catch {
    return null;
  }
}

export async function setCachedScanResult(
  fingerprint: string,
  result: ScanResult
): Promise<void> {
  try {
    const entry: CacheEntry = { ts: Date.now(), result };
    await AsyncStorage.setItem(KEY_PREFIX + fingerprint, JSON.stringify(entry));
  } catch {
    // Cache write failures are non-fatal — the user still gets the result.
  }
}

// ─── Shared Cache via Supabase ──────────────────────────
//
// Phase 2 cost-opt: same image bytes from ANY user → return cached scan
// result. Hit rate estimated 5-10% globally (popular watches get re-scanned
// across the user base). Lookup fires AFTER the local cache miss but BEFORE
// the live AI pipeline.
//
// Tier-aware: Pro/Premium users won't accept a Free 1-photo result (lower
// quality). The RPC filters by `min_tier`. Cache writes record the
// originating tier so we can promote/demote later.

/**
 * Look up the shared (cross-user) cache. Caller passes their tier so the
 * RPC can filter out lower-quality results when appropriate.
 *
 * Returns null if there's no hit — caller falls through to live AI.
 */
export async function getSharedCachedResult(
  fingerprint: string,
  tier: string
): Promise<ScanResult | null> {
  try {
    const { data, error } = await supabase.rpc('scan_dedup_hit', {
      p_hash: fingerprint,
      p_min_tier: tier,
    });
    if (error || !data || data.length === 0) return null;
    const row = data[0] as { scan_result: ScanResult };
    return row.scan_result ?? null;
  } catch {
    return null;
  }
}

/**
 * Write-through to the shared cache. Best-effort; cache write failures are
 * non-fatal. Origin tier is recorded so future tier-aware lookups can
 * filter quality.
 */
export async function setSharedCachedResult(
  fingerprint: string,
  result: ScanResult,
  provider: 'gemini' | 'claude' | 'cache-merged',
  tier: string
): Promise<void> {
  try {
    await supabase.rpc('scan_dedup_set', {
      p_hash: fingerprint,
      p_result: result,
      p_provider: provider,
      p_tier: tier,
    });
  } catch {
    // non-fatal
  }
}

/**
 * Wipe every local scan-cache entry.
 */
export async function clearAllScanCache(): Promise<number> {
  try {
    const all = await AsyncStorage.getAllKeys();
    const ours = all.filter((k) => k.startsWith(KEY_PREFIX));
    if (ours.length === 0) return 0;
    await AsyncStorage.multiRemove(ours);
    return ours.length;
  } catch (e) {
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.warn('[scanCache] clearAllScanCache failed:', e);
    }
    return 0;
  }
}

// RN global — keeps the file portable.
declare const __DEV__: boolean;
