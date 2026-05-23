import AsyncStorage from '@react-native-async-storage/async-storage';

const KEYS = {
  // Counter — increments on every scan a Free user makes within the 30-day
  // window. Resets ONLY via `resetFreeScans()` (DEV use only) — not on
  // window expiry, because expiry locks the tier permanently and we want
  // the counter to remain visible for analytics.
  freeScansUsed: '@luxuryauthenticator/free_scans_used',
  // One-time bonus from consent — adds to the effective limit. Expires
  // together with the 30-day window (no separate clock).
  freeScansBonus: '@luxuryauthenticator/free_scans_bonus',
  // Timestamp (ms) when the Free window started. Set lazily on first read
  // if missing — for fresh installs that's effectively install time, for
  // existing users migrating from the lifetime model that's the first
  // moment the new build runs.
  freeStartAt: '@luxuryauthenticator/free_start_at',
  isPremium: '@luxuryauthenticator/is_premium',
};

// Free Tier — 30-day WINDOW model (v9, 2026-05-06):
//   - Install → 5 scans available, 30-day clock starts
//   - Consent → +5 bonus scans within the SAME 30-day window
//   - Window expires → 0 scans, no further consent bonus, must upgrade or
//     buy a credit pack. Free tier is permanently locked after expiry.
// Migration: existing users keep their `freeScansUsed` counter; their
// 30-day clock starts the first time the new build reads `freeStartAt`.
export const FREE_SCAN_LIMIT = 5;
export const FREE_SCAN_BONUS = 5; // one-time, on consent grant
export const FREE_WINDOW_DAYS = 30;
export const FREE_WINDOW_MS = FREE_WINDOW_DAYS * 24 * 60 * 60 * 1000;

export async function getFreeScansUsed(): Promise<number> {
  const value = await AsyncStorage.getItem(KEYS.freeScansUsed);
  return value ? parseInt(value, 10) : 0;
}

export async function incrementFreeScansUsed(): Promise<number> {
  const current = await getFreeScansUsed();
  const next = current + 1;
  await AsyncStorage.setItem(KEYS.freeScansUsed, String(next));
  return next;
}

/**
 * Read the bonus scans the user has earned (capped at FREE_SCAN_BONUS to
 * prevent toggle-cycling exploits).
 */
export async function getFreeScansBonus(): Promise<number> {
  const value = await AsyncStorage.getItem(KEYS.freeScansBonus);
  return value ? Math.min(FREE_SCAN_BONUS, parseInt(value, 10)) : 0;
}

/**
 * Grant the consent bonus. Idempotent — calling twice doesn't stack. The
 * bonus shares the existing 30-day window; it does NOT extend the clock.
 * Safe to call from the consent modal's onDecided handler.
 *
 * Module-level in-flight Promise prevents a read-then-write race when two
 * `onDecided` callers fire concurrently (consent modal fast double-tap,
 * Strict Mode re-render). Both would otherwise see `existing < FREE_SCAN_BONUS`,
 * both would call setItem — harmless today (idempotent value) but the
 * function's JSDoc idempotency claim was being violated. If the logic ever
 * changes to add-instead-of-set, this becomes a data-loss bug.
 */
let inflightGrantBonus: Promise<void> | null = null;

export async function grantFreeScanBonus(): Promise<void> {
  if (inflightGrantBonus) return inflightGrantBonus;
  inflightGrantBonus = (async () => {
    const existing = await getFreeScansBonus();
    if (existing >= FREE_SCAN_BONUS) return;
    await AsyncStorage.setItem(KEYS.freeScansBonus, String(FREE_SCAN_BONUS));
  })().finally(() => {
    inflightGrantBonus = null;
  });
  return inflightGrantBonus;
}

/**
 * Returns the timestamp when the Free 30-day window started. Lazy-init: if
 * never recorded (fresh install OR existing user migrating from lifetime
 * model), writes `Date.now()` and returns it. Existing users get a fresh
 * 30-day window from upgrade time, which is the most generous migration.
 */
export async function getFreeStartAt(): Promise<number> {
  const value = await AsyncStorage.getItem(KEYS.freeStartAt);
  if (value) return parseInt(value, 10);
  const now = Date.now();
  await AsyncStorage.setItem(KEYS.freeStartAt, String(now));
  return now;
}

/**
 * True once the 30-day window has elapsed. After this, Free is permanently
 * locked — no consent bonus, no resets, must upgrade or buy a credit pack.
 */
export async function isFreeWindowExpired(): Promise<boolean> {
  const start = await getFreeStartAt();
  return Date.now() - start >= FREE_WINDOW_MS;
}

/**
 * Milliseconds remaining in the 30-day window, or 0 if already expired.
 * Useful for UI countdowns ("เหลือ 12 วัน").
 */
export async function getFreeWindowRemainingMs(): Promise<number> {
  const start = await getFreeStartAt();
  return Math.max(0, FREE_WINDOW_MS - (Date.now() - start));
}

export async function isPremium(): Promise<boolean> {
  const value = await AsyncStorage.getItem(KEYS.isPremium);
  return value === 'true';
}

/**
 * Effective remaining free scans = (BASE + BONUS) - used, OR 0 if the
 * 30-day window has expired (window expiry is a hard lock).
 */
export async function getRemainingFreeScans(): Promise<number> {
  if (await isPremium()) return Infinity;
  if (await isFreeWindowExpired()) return 0;
  const [used, bonus] = await Promise.all([
    getFreeScansUsed(),
    getFreeScansBonus(),
  ]);
  return Math.max(0, FREE_SCAN_LIMIT + bonus - used);
}

export async function canScan(): Promise<boolean> {
  const remaining = await getRemainingFreeScans();
  return remaining > 0;
}

/** DEV reset — wipes counter, bonus, AND the 30-day window clock. */
export async function resetFreeScans(): Promise<void> {
  await AsyncStorage.removeItem(KEYS.freeScansUsed);
  await AsyncStorage.removeItem(KEYS.freeScansBonus);
  await AsyncStorage.removeItem(KEYS.freeStartAt);
}
