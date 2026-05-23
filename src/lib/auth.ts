import AsyncStorage from '@react-native-async-storage/async-storage';

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
export const TRIAL_SCAN_LIMIT =
  process.env.EXPO_PUBLIC_TESTER_BUILD === 'true' ? 50 : 10;

export type AuthUser = {
  email: string;
  displayName: string;
  phone?: string;
  avatarSeed: string;
  avatarUri?: string;
  createdAt: string;
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
  await AsyncStorage.removeItem(KEYS.authUser);
}

export async function getMembership(): Promise<MembershipStatus> {
  const raw = (await AsyncStorage.getItem(KEYS.membership)) ?? 'premium';
  let tier: MembershipTier;
  if (raw === 'plus') tier = 'standard';
  else if (raw === 'trial') tier = 'free'; // trial is a flag now, not a tier
  else if (raw === 'standard' || raw === 'pro' || raw === 'premium') tier = raw;
  else tier = 'premium';

  // Check trial state — independent of subscribed tier
  const trialStart = await AsyncStorage.getItem(KEYS.trialStart);
  let isTrialing = false;
  let trialDaysLeft = 0;
  let activeTrialStart: string | null = null;
  if (trialStart) {
    const start = new Date(trialStart).getTime();
    const elapsedDays = (Date.now() - start) / (1000 * 60 * 60 * 24);
    const daysLeft = Math.max(0, Math.ceil(TRIAL_DAYS - elapsedDays));
    if (daysLeft > 0) {
      isTrialing = true;
      trialDaysLeft = daysLeft;
      activeTrialStart = trialStart;
    } else {
      // Trial expired — run post-trial counter cleanup (idempotent).
      void runPostTrialCleanupIfNeeded(trialStart);
    }
  }

  // Paid tier — load period bookkeeping
  if (tier === 'standard' || tier === 'pro' || tier === 'premium') {
    const period = ((await AsyncStorage.getItem(KEYS.membershipPeriod)) ||
      'monthly') as BillingPeriod;
    const startedAt = (await AsyncStorage.getItem(KEYS.membershipStartedAt)) ?? undefined;
    const expiresAt = (await AsyncStorage.getItem(KEYS.membershipExpiresAt)) ?? undefined;

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
      tier.resetMonthlyAIQuestions(),
      tier.resetMonthlyHeatmap(),
    ]);
    await AsyncStorage.setItem(KEYS.trialPostCleanupDoneFor, trialStart);
    // eslint-disable-next-line no-console
    console.log(
      `[auth] post-trial cleanup done for trialStart=${trialStart} — ` +
        `reset monthlyAuthenticity/AIQuestions/Heatmap counters`
    );
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[auth] post-trial cleanup failed:', e);
  }
}
