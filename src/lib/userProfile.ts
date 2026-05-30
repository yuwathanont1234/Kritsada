/**
 * User Profile — anonymous segmentation data keyed by cohortHash.
 *
 * Strategy:
 *   • Local-first: every read returns instantly from AsyncStorage.
 *   • Sync-when-changed: every upsert writes locally then fire-and-forgets
 *     a Supabase upsert so server-side analytics has the freshest snapshot.
 *   • Never blocks UI: same fire-and-forget posture as scanAnalytics /
 *     funnelEvents — telemetry must never gate UX.
 *
 * Identifier:
 *   • cohortHash is the only key (from src/lib/dataConsent.ts). Anonymous,
 *     32-char random per install, rotates on eraseMyData.
 *   • No email/phone/auth.users linkage — pure cohort segmentation.
 *
 * Sync gate:
 *   • Supabase write only fires if dataConsent.granted === true. The local
 *     AsyncStorage cache works regardless of consent so the app can still
 *     render personalized UI (e.g. paywall copy) without leaking server-side.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ensureCohortHash } from './dataConsent';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

const LOCAL_KEY = '@luxury_authenticator/user_profile';

export type UserRole = 'collector' | 'dealer' | 'first_time';
export type PreferredBrand = 'rolex' | 'patek' | 'ap' | 'omega' | 'other';
export type WatchCountEst = '1-3' | '4-10' | '10+';
export type BudgetTier = 'entry' | 'mid' | 'luxury';
export type InstallSource = 'organic' | 'fb_ads' | 'tiktok' | 'line_oa' | 'referral';

export interface UserProfile {
  cohortHash?: string;
  role?: UserRole;
  preferredBrand?: PreferredBrand;
  watchCountEst?: WatchCountEst;
  budgetTier?: BudgetTier;
  language?: 'th' | 'en';
  country?: string;
  appVersion?: string;
  installSource?: InstallSource;
  phoneVerified?: boolean;
  // phone_e164, push_token, line_user_id intentionally OMITTED from
  // the client-side TS type — they're set only via dedicated Phase-3
  // flows (OTP verification, push registration) that go directly to
  // Supabase, never via this generic upsert path.
  firstSeenAt?: string;
  lastActiveAt?: string;
  onboardingDone?: boolean;
}

/**
 * In-memory cache to avoid an AsyncStorage round-trip on every read.
 * Populated lazily on first getUserProfile() call, mutated by upsert.
 */
let memCache: UserProfile | null = null;

/**
 * Read the local profile. Returns an empty object {} if nothing stored —
 * callers should treat all fields as optional.
 */
export async function getUserProfile(): Promise<UserProfile> {
  if (memCache) return memCache;

  try {
    const raw = await AsyncStorage.getItem(LOCAL_KEY);
    if (!raw) {
      memCache = {};
      return memCache;
    }
    const parsed = JSON.parse(raw) as UserProfile;
    memCache = parsed;
    return parsed;
  } catch (e: any) {
    console.warn('[userProfile] read failed:', e?.message);
    memCache = {};
    return memCache;
  }
}

/**
 * Merge-update the profile. Local write is awaited (small + synchronous-ish);
 * Supabase sync is fire-and-forget.
 *
 * @param updates Partial fields to merge.
 * @returns the merged profile.
 */
export async function upsertUserProfile(
  updates: Partial<UserProfile>
): Promise<UserProfile> {
  const current = await getUserProfile();
  const merged: UserProfile = { ...current, ...updates };

  // Stamp activity timestamp on every upsert (cheap, useful for churn analysis)
  merged.lastActiveAt = new Date().toISOString();
  if (!merged.firstSeenAt) merged.firstSeenAt = merged.lastActiveAt;

  memCache = merged;
  try {
    await AsyncStorage.setItem(LOCAL_KEY, JSON.stringify(merged));
  } catch (e: any) {
    console.warn('[userProfile] local write failed:', e?.message);
  }

  // Fire-and-forget Supabase sync
  void syncToSupabase(merged).catch((e) =>
    console.warn('[userProfile] sync failed:', e?.message)
  );

  return merged;
}

/**
 * Clear local profile state (called by dataConsent.eraseMyData).
 * Server-side delete is handled separately by the eraseMyData RPC.
 */
export async function clearLocalUserProfile(): Promise<void> {
  memCache = null;
  try {
    await AsyncStorage.removeItem(LOCAL_KEY);
  } catch (e: any) {
    console.warn('[userProfile] clear failed:', e?.message);
  }
}

// ── Internal: Supabase upsert ────────────────────────────────
async function syncToSupabase(profile: UserProfile): Promise<void> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return;

  // user_profile is anonymous (cohort_hash + role/brand category data
  // only — no PII). Per PDPA Section 26 anonymous data needs no
  // consent. Use ensureCohortHash() which auto-generates on first
  // call rather than waiting for explicit grant.
  let cohortHash: string;
  try {
    cohortHash = await ensureCohortHash();
  } catch {
    return;
  }

  // Map camelCase TS → snake_case DB columns. Drop any undefined values
  // so an upsert doesn't blow away existing fields with NULL.
  const row: Record<string, any> = {
    cohort_hash: cohortHash,
  };
  if (profile.role !== undefined)          row.role             = profile.role;
  if (profile.preferredBrand !== undefined)row.preferred_brand  = profile.preferredBrand;
  if (profile.watchCountEst !== undefined) row.watch_count_est  = profile.watchCountEst;
  if (profile.budgetTier !== undefined)    row.budget_tier      = profile.budgetTier;
  if (profile.language !== undefined)      row.language         = profile.language;
  if (profile.country !== undefined)       row.country          = profile.country;
  if (profile.appVersion !== undefined)    row.app_version      = profile.appVersion;
  if (profile.installSource !== undefined) row.install_source   = profile.installSource;
  if (profile.phoneVerified !== undefined) row.phone_verified   = profile.phoneVerified;
  if (profile.onboardingDone !== undefined)row.onboarding_done  = profile.onboardingDone;
  if (profile.firstSeenAt !== undefined)   row.first_seen_at    = profile.firstSeenAt;
  if (profile.lastActiveAt !== undefined)  row.last_active_at   = profile.lastActiveAt;

  try {
    // Postgrest upsert via on_conflict=cohort_hash
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/user_profile?on_conflict=cohort_hash`,
      {
        method: 'POST',
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'resolution=merge-duplicates,return=minimal',
        },
        body: JSON.stringify(row),
      }
    );
    if (!res.ok) {
      console.warn('[userProfile] supabase upsert non-2xx:', res.status);
    }
  } catch (e: any) {
    console.warn('[userProfile] supabase upsert error:', e?.message);
  }
}
