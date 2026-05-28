/**
 * Data Contribution Consent — manages the opt-in flag and the bonus-scans
 * reward that goes with it.
 *
 * The deal:
 *   • User opts in → we log anonymous scan events for trending detection,
 *     DB gap analysis, and AI improvement.
 *   • In return → user gets +5 bonus scans/month on top of their tier cap.
 *   • User can opt out at any time → we stop logging immediately AND erase
 *     past contributions on request (PDPA Section 33).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEYS = {
  consentGranted: '@luxury_authenticator/data_consent',
  consentTimestamp: '@luxury_authenticator/data_consent_at',
  cohortHash: '@luxury_authenticator/cohort_hash',
  shareProvince: '@luxury_authenticator/share_province',
  province: '@luxury_authenticator/province',
  // Track bonus-scan accrual separately from the tier scan counter so a
  // user opt-in/opt-out cycle doesn't mess with the main scan budget.
  bonusScansEarnedThisMonth: '@luxury_authenticator/bonus_scans_earned',
  bonusScansMonth: '@luxury_authenticator/bonus_scans_month',  // YYYY-MM key
};

export const BONUS_SCANS_PER_MONTH = 5;

export type DataConsentStatus = {
  /** True if user has agreed to anonymous data contribution */
  granted: boolean;
  /** ISO timestamp when consent was granted (or null if never) */
  grantedAt: string | null;
  /** Anonymous random per-install identifier — used to dedupe scans without
   *  linking back to the user. Stable across sessions but rotates on
   *  "delete my data". */
  cohortHash: string | null;
  /** Whether user opted-in to share province (separate granular consent) */
  shareProvince: boolean;
  /** Optional province string — only set if shareProvince is true */
  province: string | null;
  /** Bonus scans earned this calendar month (caps at BONUS_SCANS_PER_MONTH) */
  bonusScansThisMonth: number;
};

// ---------------------------------------------------------------------------
// Cohort hash generation
// ---------------------------------------------------------------------------

function generateCohortHash(): string {
  const a = Math.random().toString(36).slice(2, 12);
  const b = Math.random().toString(36).slice(2, 12);
  const c = Date.now().toString(36);
  return (a + b + c).slice(0, 32).padEnd(32, '0');
}

let inflightCohortHash: Promise<string> | null = null;

/**
 * Get-or-create the anonymous cohort hash. Exported so funnel/event
 * loggers can attach the cohort id without requiring full consent
 * grant first (the hash is by definition anonymous per PDPA Section
 * 26 — "anonymous data" — so it's safe to generate on first use).
 *
 * Stable across sessions, rotates on eraseMyData().
 */
export async function ensureCohortHash(): Promise<string> {
  if (inflightCohortHash) return inflightCohortHash;
  inflightCohortHash = (async () => {
    const existing = await AsyncStorage.getItem(KEYS.cohortHash);
    if (existing) return existing;
    const fresh = generateCohortHash();
    await AsyncStorage.setItem(KEYS.cohortHash, fresh);
    return fresh;
  })().catch((e) => {
    inflightCohortHash = null;
    throw e;
  });
  return inflightCohortHash;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function getDataConsent(): Promise<DataConsentStatus> {
  const [granted, grantedAt, cohort, shareProv, province] =
    await Promise.all([
      AsyncStorage.getItem(KEYS.consentGranted),
      AsyncStorage.getItem(KEYS.consentTimestamp),
      AsyncStorage.getItem(KEYS.cohortHash),
      AsyncStorage.getItem(KEYS.shareProvince),
      AsyncStorage.getItem(KEYS.province),
    ]);

  return {
    granted: granted === 'true',
    grantedAt: grantedAt,
    cohortHash: cohort,
    shareProvince: shareProv === 'true',
    province: province,
    bonusScansThisMonth: await readBonusScansThisMonth(),
  };
}

export async function grantDataConsent(): Promise<DataConsentStatus> {
  const cohort = await ensureCohortHash();
  await AsyncStorage.setItem(KEYS.consentGranted, 'true');
  await AsyncStorage.setItem(KEYS.consentTimestamp, new Date().toISOString());
  await awardBonusScansIfNotYet();
  return await getDataConsent();
}

export async function revokeDataConsent(): Promise<DataConsentStatus> {
  await AsyncStorage.setItem(KEYS.consentGranted, 'false');
  await AsyncStorage.setItem(KEYS.consentTimestamp, new Date().toISOString());
  return await getDataConsent();
}

export async function setShareProvince(enabled: boolean, province?: string): Promise<void> {
  await AsyncStorage.setItem(KEYS.shareProvince, enabled ? 'true' : 'false');
  if (enabled && province) {
    await AsyncStorage.setItem(KEYS.province, province);
  } else if (!enabled) {
    await AsyncStorage.removeItem(KEYS.province);
  }
}

export async function devResetConsent(): Promise<void> {
  await Promise.all([
    AsyncStorage.removeItem(KEYS.consentGranted),
    AsyncStorage.removeItem(KEYS.consentTimestamp),
    AsyncStorage.removeItem(KEYS.cohortHash),
    AsyncStorage.removeItem(KEYS.shareProvince),
    AsyncStorage.removeItem(KEYS.province),
    AsyncStorage.removeItem(KEYS.bonusScansEarnedThisMonth),
    AsyncStorage.removeItem(KEYS.bonusScansMonth),
  ]);
  inflightCohortHash = null;
  inflightAwardBonus = null;
  console.log('[dataConsent] DEV reset — consent states cleared');
}

export async function eraseMyData(): Promise<{ deleted: number }> {
  const cohort = await AsyncStorage.getItem(KEYS.cohortHash);
  if (!cohort) return { deleted: 0 };

  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  let deleted = 0;
  if (url && key) {
    try {
      const res = await fetch(`${url}/rest/v1/rpc/delete_my_scan_events`, {
        method: 'POST',
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ my_cohort_hash: cohort }),
      });
      if (res.ok) {
        const body = await res.json();
        deleted = typeof body === 'number' ? body : 0;
      } else {
        console.warn('[dataConsent] eraseMyData HTTP', res.status);
      }
    } catch (e: any) {
      console.warn('[dataConsent] eraseMyData failed:', e?.message);
    }
  }

  const fresh = generateCohortHash();
  await AsyncStorage.setItem(KEYS.cohortHash, fresh);
  inflightCohortHash = null;
  return { deleted };
}

// ---------------------------------------------------------------------------
// Bonus scan accounting
// ---------------------------------------------------------------------------

function currentMonthKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export async function readBonusScansThisMonth(): Promise<number> {
  const monthKey = await AsyncStorage.getItem(KEYS.bonusScansMonth);
  if (monthKey !== currentMonthKey()) return 0;
  const raw = await AsyncStorage.getItem(KEYS.bonusScansEarnedThisMonth);
  return raw ? parseInt(raw, 10) || 0 : 0;
}

let inflightAwardBonus: Promise<boolean> | null = null;
let inflightAwardBonusMonth: string | null = null;

async function awardBonusScansIfNotYet(): Promise<boolean> {
  const monthKey = currentMonthKey();
  if (inflightAwardBonus && inflightAwardBonusMonth === monthKey) {
    return inflightAwardBonus;
  }
  inflightAwardBonusMonth = monthKey;
  inflightAwardBonus = (async () => {
    const existing = await AsyncStorage.getItem(KEYS.bonusScansMonth);
    if (existing === monthKey) return false;
    await AsyncStorage.setItem(KEYS.bonusScansMonth, monthKey);
    await AsyncStorage.setItem(
      KEYS.bonusScansEarnedThisMonth,
      String(BONUS_SCANS_PER_MONTH)
    );
    console.log(`[dataConsent] awarded +${BONUS_SCANS_PER_MONTH} bonus scans for ${monthKey}`);
    return true;
  })().catch((e) => {
    inflightAwardBonus = null;
    throw e;
  });
  return inflightAwardBonus;
}
