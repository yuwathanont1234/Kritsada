import AsyncStorage from '@react-native-async-storage/async-storage';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import { supabase } from './supabase';

// Required so the in-app browser tab dismisses and returns control to the
// app after the OAuth redirect completes (no-op on most native flows, but
// recommended by expo-web-browser for auth sessions).
WebBrowser.maybeCompleteAuthSession();

const KEYS = {
  authUser: '@luxuryauthenticator/auth_user',
  trialStart: '@luxuryauthenticator/trial_start',
  membership: '@luxuryauthenticator/membership',
  membershipPeriod: '@luxuryauthenticator/membership_period',
  membershipStartedAt: '@luxuryauthenticator/membership_started_at',
  membershipExpiresAt: '@luxuryauthenticator/membership_expires_at',
  hasSeenSplash: '@luxuryauthenticator/has_seen_splash',
  // Marker for post-trial counter cleanup
  trialPostCleanupDoneFor: '@luxuryauthenticator/trial_post_cleanup_done_for',
};

export const TRIAL_DAYS = 7;
// Hard cap on scans during the 7-day trial.
export const TRIAL_SCAN_LIMIT = 5;

export type AuthUser = {
  email: string;
  displayName: string;
  phone?: string;
  avatarSeed: string;
  avatarUri?: string;
  createdAt: string;
  /** Auth provider the session was established with ('email' | 'google'). */
  provider?: string;
};

export type MembershipTier = 'free' | 'standard' | 'pro' | 'premium';

export type BillingPeriod = 'monthly' | 'yearly';

export type MembershipStatus = {
  tier: MembershipTier;
  isTrialing: boolean;
  trialDaysLeft: number;
  trialStart: string | null;
  period?: BillingPeriod;
  isActive: boolean;
  startedAt?: string;
  expiresAt?: string;
  cancelable: boolean;
};

export async function getAuthUser(): Promise<AuthUser | null> {
  const raw = await AsyncStorage.getItem(KEYS.authUser);
  return raw ? (JSON.parse(raw) as AuthUser) : null;
}

export async function isAuthenticated(): Promise<boolean> {
  // Primary source of truth: the persisted Supabase session (read from
  // AsyncStorage by the SDK — works offline on cold start, no network).
  try {
    const { data } = await supabase.auth.getSession();
    if (data.session?.user) {
      // Keep the local AuthUser mirror fresh so every getAuthUser() consumer
      // (HomeScreen, Settings, App.tsx IAP) sees the real signed-in identity.
      void syncAuthUserFromSupabase(data.session.user);
      return true;
    }
  } catch {
    /* fall through to the local mirror below */
  }
  // Fallback: local mirror. Covers the __DEV__ sandbox presets (loginMock
  // writes a local user but no Supabase session) and offline edge cases.
  return (await getAuthUser()) !== null;
}

export async function loginMock(email: string): Promise<AuthUser> {
  const displayName = email.split('@')[0] || 'User';
  const user: AuthUser = {
    email,
    displayName,
    avatarSeed: email,
    createdAt: new Date().toISOString(),
  };
  await AsyncStorage.setItem(KEYS.authUser, JSON.stringify(user));
  return user;
}

export async function updateUser(patch: Partial<AuthUser>): Promise<AuthUser | null> {
  const current = await getAuthUser();
  if (!current) return null;
  const next = { ...current, ...patch };
  await AsyncStorage.setItem(KEYS.authUser, JSON.stringify(next));
  return next;
}

export async function logout(): Promise<void> {
  try {
    await supabase.auth.signOut();
  } catch {
    // Network/sign-out failure must never trap the user in the app — we
    // still clear the local mirror so the UI returns to the login screen.
  }
  await AsyncStorage.removeItem(KEYS.authUser);
}

// ── Real Supabase Auth (email OTP + Google OAuth) ────────────────────────

/**
 * Map a Supabase auth user → the app's AuthUser shape, preserving any
 * locally-chosen avatar the user set in Settings (provider avatar wins if
 * present). Writes the result to the AsyncStorage mirror so all existing
 * getAuthUser() consumers keep working unchanged.
 */
async function syncAuthUserFromSupabase(u: {
  id?: string;
  email?: string | null;
  created_at?: string;
  user_metadata?: Record<string, any> | null;
  app_metadata?: Record<string, any> | null;
}): Promise<AuthUser> {
  const email = (u.email || u.user_metadata?.email || '').toLowerCase();
  const meta = u.user_metadata || {};
  const displayName =
    meta.full_name || meta.name || (email ? email.split('@')[0] : '') || 'Collector';
  const providerAvatar = meta.avatar_url || meta.picture;

  const existing = await getAuthUser();
  const merged: AuthUser = {
    email,
    displayName,
    avatarSeed: u.id || email || 'collector',
    avatarUri: providerAvatar || existing?.avatarUri,
    createdAt: u.created_at || existing?.createdAt || new Date().toISOString(),
    phone: existing?.phone,
    provider: u.app_metadata?.provider || existing?.provider,
  };
  await AsyncStorage.setItem(KEYS.authUser, JSON.stringify(merged));
  return merged;
}

/**
 * Step 1 of email sign-in: send a 6-digit one-time code to `email`.
 * Creates the account on first sign-in (shouldCreateUser:true).
 */
export async function sendEmailOtp(email: string): Promise<void> {
  const clean = email.trim().toLowerCase();
  const { error } = await supabase.auth.signInWithOtp({
    email: clean,
    options: { shouldCreateUser: true },
  });
  if (error) throw error;
}

/**
 * Step 2 of email sign-in: verify the 6-digit code. On success the session
 * is persisted by the SDK and the local AuthUser mirror is updated.
 */
export async function verifyEmailOtp(email: string, token: string): Promise<AuthUser> {
  const { data, error } = await supabase.auth.verifyOtp({
    email: email.trim().toLowerCase(),
    token: token.trim(),
    type: 'email',
  });
  if (error) throw error;
  if (!data.user) throw new Error('verifyOtp returned no user');
  return syncAuthUserFromSupabase(data.user);
}

/** Pull access/refresh tokens out of an implicit-flow redirect fragment. */
function parseFragmentTokens(url: string): {
  access_token?: string;
  refresh_token?: string;
} {
  const frag = url.includes('#') ? url.split('#')[1] : '';
  const out: Record<string, string> = {};
  for (const kv of frag.split('&')) {
    const [k, v] = kv.split('=');
    if (k) out[k] = decodeURIComponent(v ?? '');
  }
  return { access_token: out.access_token, refresh_token: out.refresh_token };
}

/** Pull a single query-string param (used for the PKCE `code`). */
function parseQueryParam(url: string, key: string): string | undefined {
  const q = url.includes('?') ? url.split('?')[1].split('#')[0] : '';
  for (const kv of q.split('&')) {
    const [k, v] = kv.split('=');
    if (k === key) return decodeURIComponent(v ?? '');
  }
  return undefined;
}

/**
 * Google sign-in via web OAuth: open Supabase's Google authorize URL in an
 * in-app browser tab, then complete the session from the redirect back to
 * our app scheme. Handles both PKCE (?code=) and implicit (#access_token=)
 * redirect shapes so it works regardless of the client's flowType default.
 */
export async function signInWithGoogle(): Promise<AuthUser> {
  const redirectTo = Linking.createURL('auth-callback');
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error) throw error;
  if (!data?.url) throw new Error('signInWithOAuth returned no URL');

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type === 'cancel' || result.type === 'dismiss') {
    throw new Error('cancelled');
  }
  if (result.type !== 'success' || !result.url) {
    throw new Error('Google sign-in did not complete');
  }

  // PKCE flow (?code=...) — exchange the code for a session.
  const code = parseQueryParam(result.url, 'code');
  if (code) {
    const { data: ex, error: exErr } = await supabase.auth.exchangeCodeForSession(code);
    if (exErr) throw exErr;
    if (!ex.user) throw new Error('code exchange returned no user');
    return syncAuthUserFromSupabase(ex.user);
  }

  // Implicit flow (#access_token=...&refresh_token=...) — set the session.
  const { access_token, refresh_token } = parseFragmentTokens(result.url);
  if (access_token && refresh_token) {
    const { data: sess, error: sErr } = await supabase.auth.setSession({
      access_token,
      refresh_token,
    });
    if (sErr) throw sErr;
    if (!sess.user) throw new Error('setSession returned no user');
    return syncAuthUserFromSupabase(sess.user);
  }

  throw new Error('OAuth redirect contained no code or tokens');
}

/**
 * Sign in with Apple (iOS only). REQUIRED by App Store Guideline 4.8 because
 * the app also offers Google sign-in. Uses the native Apple flow → an
 * identity token, which we hand to Supabase via signInWithIdToken.
 *
 * Nonce hardening (replay protection): we generate a random nonce, send its
 * SHA-256 to Apple, and pass the RAW nonce to Supabase. Supabase verifies the
 * token's hashed `nonce` claim matches the raw value — so a stolen token can't
 * be replayed. Apple returns the user's name ONLY on first authorization, so
 * we capture it then.
 */
export async function signInWithApple(): Promise<AuthUser> {
  const rawNonce = `${Crypto.randomUUID()}${Crypto.randomUUID()}`.replace(/-/g, '');
  const hashedNonce = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    rawNonce
  );

  let credential: AppleAuthentication.AppleAuthenticationCredential;
  try {
    credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce: hashedNonce,
    });
  } catch (e: any) {
    // User tapped Cancel on the Apple sheet — mirror the Google flow's signal.
    if (e?.code === 'ERR_REQUEST_CANCELED') throw new Error('cancelled');
    throw e;
  }

  if (!credential.identityToken) {
    throw new Error('Apple sign-in returned no identity token');
  }

  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: 'apple',
    token: credential.identityToken,
    nonce: rawNonce,
  });
  if (error) throw error;
  if (!data.user) throw new Error('Apple sign-in returned no user');

  const merged = await syncAuthUserFromSupabase(data.user);

  // First-authorization-only: Apple gives the real name once. If our display
  // name is still just the email prefix, upgrade it to the Apple-provided name.
  const given = credential.fullName?.givenName;
  const family = credential.fullName?.familyName;
  if (given || family) {
    const appleName = [given, family].filter(Boolean).join(' ').trim();
    const looksLikeEmailPrefix =
      !merged.displayName || merged.displayName === merged.email.split('@')[0];
    if (appleName && looksLikeEmailPrefix) {
      return (await updateUser({ displayName: appleName })) ?? merged;
    }
  }
  return merged;
}

export async function getMembership(): Promise<MembershipStatus> {
  // Default to 'free' when unset/unrecognized (audit M2). Previously defaulted to
  // 'premium', so a fresh install or corrupted membership state silently granted
  // full Premium for free. A genuinely paid user's tier is restored from IAP /
  // RevenueCat on launch (syncMembershipFromIap), so failing closed to 'free' is
  // safe — at worst a paid user shows free for a moment until the sync runs.
  const raw = (await AsyncStorage.getItem(KEYS.membership)) ?? 'free';
  let tier: MembershipTier;
  if (raw === 'plus') tier = 'standard';
  else if (raw === 'trial') tier = 'free'; // trial is a flag now, not a tier
  else if (raw === 'standard' || raw === 'pro' || raw === 'premium') tier = raw;
  else tier = 'free';

  // Check trial state — independent of subscribed tier
  const trialStart = await AsyncStorage.getItem(KEYS.trialStart);
  let isTrialing = false;
  let trialDaysLeft = 0;
  let activeTrialStart: string | null = null;
  if (trialStart) {
    const start = new Date(trialStart).getTime();
    const elapsedDays = (Date.now() - start) / (1000 * 60 * 60 * 24);
    const daysLeft = Math.max(0, Math.ceil(TRIAL_DAYS - elapsedDays));

    // Dynamic import of tier to prevent circular dependency
    const tierLib = await import('./tier');
    const used = await tierLib.getTrialScansUsed(trialStart);
    const limitExceeded = used >= TRIAL_SCAN_LIMIT;

    if (daysLeft > 0 && !limitExceeded) {
      isTrialing = true;
      trialDaysLeft = daysLeft;
      activeTrialStart = trialStart;
    } else {
      // Trial expired or scan limit exhausted → fall back to FREE. (This used
      // to auto-grant the paid 'standard' tier with copy claiming a bound
      // credit card was charged — no billing flow exists, so it was a free
      // giveaway wrapped in a false statement. Paid tiers only ever come
      // from the IAP layer.)
      await AsyncStorage.removeItem(KEYS.trialStart);
      void runPostTrialCleanupIfNeeded(trialStart);
    }
  }

  // Paid tier — load period bookkeeping
  if (tier === 'standard' || tier === 'pro' || tier === 'premium') {
    const period = ((await AsyncStorage.getItem(KEYS.membershipPeriod)) ||
      'monthly') as BillingPeriod;
    const startedAt = (await AsyncStorage.getItem(KEYS.membershipStartedAt)) ?? undefined;
    const expiresAt = (await AsyncStorage.getItem(KEYS.membershipExpiresAt)) ?? undefined;

    // Fail-closed expiry: the local tier is only a CACHE of the store
    // subscription. Once past expiry (+3-day renewal grace, so an active
    // renewal that hasn't re-synced yet doesn't flap), drop to free and let
    // RevenueCat re-grant on its next sync. Without this, a tier set in
    // mock mode (or while RC was unreachable) lived forever.
    if (expiresAt) {
      const GRACE_MS = 3 * 24 * 60 * 60 * 1000;
      if (Date.now() > new Date(expiresAt).getTime() + GRACE_MS) {
        await setMembership('free');
        try {
          const iap = await import('./iap');
          if (iap.isIapConfigured()) void iap.syncMembershipFromIap();
        } catch {
          /* iap module unavailable — stay free until next launch */
        }
        return {
          tier: 'free',
          isTrialing,
          trialDaysLeft,
          trialStart: activeTrialStart,
          isActive: isTrialing,
          cancelable: true,
        };
      }
    }

    const cancelable =
      period === 'monthly' ||
      !expiresAt ||
      new Date(expiresAt).getTime() <= Date.now();

    return {
      tier,
      isTrialing,
      trialDaysLeft,
      trialStart: activeTrialStart,
      period,
      isActive: true,
      startedAt,
      expiresAt,
      cancelable,
    };
  }

  // Free tier (possibly trialing)
  return {
    tier: 'free',
    isTrialing,
    trialDaysLeft,
    trialStart: activeTrialStart,
    isActive: isTrialing,
    cancelable: true,
  };
}

/**
 * Set the user's membership tier.
 */
export async function setMembership(
  tier: MembershipTier,
  period: BillingPeriod = 'monthly'
): Promise<void> {
  await AsyncStorage.setItem(KEYS.membership, tier);

  if (tier === 'standard' || tier === 'pro' || tier === 'premium') {
    const now = new Date();
    const expires = new Date(now);
    if (period === 'yearly') {
      expires.setDate(expires.getDate() + 365);
    } else {
      expires.setDate(expires.getDate() + 30);
    }
    await AsyncStorage.setItem(KEYS.membershipPeriod, period);
    await AsyncStorage.setItem(KEYS.membershipStartedAt, now.toISOString());
    await AsyncStorage.setItem(KEYS.membershipExpiresAt, expires.toISOString());
    // Clear trial flag when converting to paid
    await AsyncStorage.removeItem(KEYS.trialStart);
  } else {
    // Cancelled / free / trial — clear period bookkeeping
    await AsyncStorage.removeItem(KEYS.membershipPeriod);
    await AsyncStorage.removeItem(KEYS.membershipStartedAt);
    await AsyncStorage.removeItem(KEYS.membershipExpiresAt);
  }
}

/**
 * Start (or restart) the 7-day trial.
 */
export async function startTrialAgain(): Promise<void> {
  await AsyncStorage.setItem(KEYS.trialStart, new Date().toISOString());
  try {
    const { prewarmAll } = await import('./visualRag');
    prewarmAll();
  } catch {
    // visualRag not configured in this build
  }
}

/**
 * Force-end the current trial (DEV / testing helper).
 */
export async function clearTrial(): Promise<void> {
  await AsyncStorage.removeItem(KEYS.trialStart);
}

export async function hasSeenSplash(): Promise<boolean> {
  return (await AsyncStorage.getItem(KEYS.hasSeenSplash)) === 'true';
}

export async function markSplashSeen(): Promise<void> {
  await AsyncStorage.setItem(KEYS.hasSeenSplash, 'true');
}

/**
 * Post-trial counter cleanup — fires once per trial when it expires.
 */
async function runPostTrialCleanupIfNeeded(trialStart: string): Promise<void> {
  try {
    const already = await AsyncStorage.getItem(KEYS.trialPostCleanupDoneFor);
    if (already === trialStart) return; // already cleaned up for this trial
    const tier = await import('./tier');
    await Promise.all([
      tier.resetMonthlyAuthenticity(),
      tier.resetMonthlyHeatmap(),
    ]);
    await AsyncStorage.setItem(KEYS.trialPostCleanupDoneFor, trialStart);
    // eslint-disable-next-line no-console
    console.log(
      `[auth] post-trial cleanup done for trialStart=${trialStart} — ` +
        `reset monthlyAuthenticity/Heatmap counters`
    );
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[auth] post-trial cleanup failed:', e);
  }
}
