/**
 * IAP (In-App Purchase) wrapper — built on RevenueCat (react-native-purchases).
 *
 * WHY RevenueCat over raw StoreKit/Google Billing:
 *   1. Single API for iOS + Android (no platform branching in app code).
 *   2. Server-side receipt validation handled automatically.
 *   3. Subscription state synced via webhooks — we don't have to poll.
 *   4. Free tier covers up to $10k Monthly Tracked Revenue (~3,000 paid users
 *      at our Standard tier ฿990, plenty for Year 1).
 *   5. Sandbox + production environments unified.
 *
 * ARCHITECTURE:
 *   - This module exposes a small surface area (init, getOfferings, purchase,
 *     restore, sync, listenCustomerInfo). The rest of the app should NEVER
 *     import 'react-native-purchases' directly — go through this wrapper.
 *   - In DEV mode (when EXPO_PUBLIC_REVENUECAT_API_KEY is not set), this
 *     module degrades to "mock mode": purchase() resolves immediately and
 *     setMembership(tier) is called locally, so developers can still test
 *     UI flows in Expo Go without native build.
 *   - In PROD (key configured + native build), real StoreKit / Google
 *     Billing flows are invoked.
 *
 * PRODUCT IDS (must match App Store Connect + Google Play Console):
 *   - lux_std_990     → Standard plan, ฿990/month, entitlement "standard"
 *   - lux_pro_1990    → Pro plan, ฿1,990/month, entitlement "pro"
 *   - lux_premium_4990 → Premium plan, ฿4,990/month, entitlement "premium"
 *
 * RevenueCat dashboard mapping (manually configured by operator):
 *   - Each product attaches to a unique "Entitlement" with matching name.
 *   - The 3 products are bundled under a single "Offering" named "default".
 */

import { Platform } from 'react-native';
import type { MembershipTier } from './auth';

// Apple uses a separate key from Google in RevenueCat dashboard.
const RC_API_KEY_IOS = process.env.EXPO_PUBLIC_REVENUECAT_API_KEY_IOS ?? '';
const RC_API_KEY_ANDROID = process.env.EXPO_PUBLIC_REVENUECAT_API_KEY_ANDROID ?? '';

/** True when RevenueCat is configured for the current platform. */
export function isIapConfigured(): boolean {
  if (Platform.OS === 'ios') return RC_API_KEY_IOS.length > 0;
  if (Platform.OS === 'android') return RC_API_KEY_ANDROID.length > 0;
  return false;
}

/**
 * Product ID → MembershipTier mapping. The KEYS are what we register in
 * App Store Connect and Google Play. The VALUES are our internal tier names.
 *
 * Renaming a key requires re-creating the product in both stores AND
 * matching the new ID in RevenueCat dashboard. Best to NEVER rename.
 */
export const PRODUCT_TO_TIER: Record<string, MembershipTier> = {
  lux_std_990: 'standard',
  lux_pro_1990: 'pro',
  lux_premium_4990: 'premium',
};

/**
 * Reverse map — internal tier → store product ID. Used when initiating
 * a purchase from a tier-selection UI ("Buy Pro").
 */
export const TIER_TO_PRODUCT: Record<Exclude<MembershipTier, 'free'>, string> = {
  standard: 'lux_std_990',
  pro: 'lux_pro_1990',
  premium: 'lux_premium_4990',
};

/**
 * Entitlement IDs in RevenueCat. We use one entitlement per tier so the
 * customer's active tier is just "the entitlement that's currently active".
 */
export const ENTITLEMENT_FOR_TIER: Record<Exclude<MembershipTier, 'free'>, string> = {
  standard: 'standard',
  pro: 'pro',
  premium: 'premium',
};

// ─── Lazy Purchases import (only when configured) ─────────────────────
// We lazy-load to avoid Expo Go errors — react-native-purchases is a
// native module and crashes if imported on platforms where it's not
// linked (Expo Go, web).
let _Purchases: any = null;

async function getPurchases() {
  if (_Purchases) return _Purchases;
  if (!isIapConfigured()) return null;
  try {
    const mod = await import('react-native-purchases');
    _Purchases = mod.default || mod;
    return _Purchases;
  } catch (e: any) {
    console.warn('[iap] react-native-purchases import failed:', e?.message);
    return null;
  }
}

// ─── Initialization ───────────────────────────────────────────────────

let _initialized = false;
let _initPromise: Promise<void> | null = null;

/**
 * Initialize RevenueCat. Idempotent — safe to call multiple times.
 * Pass the current user's UUID as appUserId so subscription state follows
 * the user across reinstalls / device changes.
 */
export async function initIap(appUserId?: string | null): Promise<void> {
  if (_initialized) return;
  if (_initPromise) return _initPromise;

  _initPromise = (async () => {
    const Purchases = await getPurchases();
    if (!Purchases) {
      console.log('[iap] RevenueCat key not configured — running in MOCK mode');
      _initialized = true;
      return;
    }

    const apiKey = Platform.OS === 'ios' ? RC_API_KEY_IOS : RC_API_KEY_ANDROID;
    try {
      // Verbose logs only in DEV.
      if (__DEV__) {
        Purchases.setLogLevel?.('debug');
      }
      Purchases.configure({
        apiKey,
        appUserID: appUserId || undefined,
      });
      console.log(`[iap] RevenueCat configured (platform=${Platform.OS}, user=${appUserId || 'anonymous'})`);
      _initialized = true;
    } catch (e: any) {
      console.error('[iap] RevenueCat configure failed:', e?.message);
      throw e;
    }
  })();

  return _initPromise;
}

/**
 * Re-identify the user (call after login). RevenueCat will migrate
 * anonymous purchases onto the new user ID if they were made before login.
 */
export async function identifyIapUser(appUserId: string): Promise<void> {
  const Purchases = await getPurchases();
  if (!Purchases) return;
  try {
    await Purchases.logIn(appUserId);
  } catch (e: any) {
    console.warn('[iap] logIn failed:', e?.message);
  }
}

/** Call on user logout — reverts to anonymous customer. */
export async function logoutIapUser(): Promise<void> {
  const Purchases = await getPurchases();
  if (!Purchases) return;
  try {
    await Purchases.logOut();
  } catch (e: any) {
    // logOut throws if the user is already anonymous — that's fine.
    console.log('[iap] logOut:', e?.message);
  }
}

// ─── Offerings (products available for purchase) ─────────────────────

export type IapOffering = {
  identifier: string;
  productId: string;
  tier: Exclude<MembershipTier, 'free'>;
  priceString: string;     // localized, e.g. "฿990.00" / "$29.99"
  priceMicros: number;     // raw amount × 1,000,000 (revenue analytics)
  currencyCode: string;
  title: string;
  description: string;
};

/**
 * Fetch the list of products configured in App Store Connect / Play Console.
 * Returns one entry per tier — keys are 'standard' / 'pro' / 'premium'.
 *
 * In MOCK mode, returns synthetic price strings so the paywall UI can
 * still render reasonable text in Expo Go.
 */
export async function getOfferings(): Promise<Record<string, IapOffering>> {
  const Purchases = await getPurchases();
  if (!Purchases) {
    // Mock — used in Expo Go / web. Prices match what's in tier.ts.
    return {
      standard: {
        identifier: 'standard',
        productId: TIER_TO_PRODUCT.standard,
        tier: 'standard',
        priceString: '฿990.00',
        priceMicros: 990_000_000,
        currencyCode: 'THB',
        title: 'Standard Monthly',
        description: '20 scans / month',
      },
      pro: {
        identifier: 'pro',
        productId: TIER_TO_PRODUCT.pro,
        tier: 'pro',
        priceString: '฿1,990.00',
        priceMicros: 1_990_000_000,
        currencyCode: 'THB',
        title: 'Pro Monthly',
        description: '50 scans / month',
      },
      premium: {
        identifier: 'premium',
        productId: TIER_TO_PRODUCT.premium,
        tier: 'premium',
        priceString: '฿4,990.00',
        priceMicros: 4_990_000_000,
        currencyCode: 'THB',
        title: 'Premium Monthly',
        description: '100 scans / month',
      },
    };
  }

  try {
    const offerings = await Purchases.getOfferings();
    const current = offerings?.current;
    if (!current) {
      console.warn('[iap] No current offering — check RevenueCat dashboard "Offerings" tab');
      return {};
    }

    const result: Record<string, IapOffering> = {};
    for (const pkg of current.availablePackages ?? []) {
      const product = pkg.product;
      const tier = PRODUCT_TO_TIER[product.identifier];
      if (!tier || tier === 'free') continue;
      result[tier] = {
        identifier: pkg.identifier,
        productId: product.identifier,
        tier: tier as Exclude<MembershipTier, 'free'>,
        priceString: product.priceString,
        priceMicros: Math.round(product.price * 1_000_000),
        currencyCode: product.currencyCode,
        title: product.title,
        description: product.description,
      };
    }
    return result;
  } catch (e: any) {
    console.warn('[iap] getOfferings failed:', e?.message);
    return {};
  }
}

// ─── Purchase flow ────────────────────────────────────────────────────

export type PurchaseResult = {
  success: boolean;
  /** The tier the user now holds, or null if purchase failed/cancelled. */
  activeTier: MembershipTier | null;
  /** True if user cancelled the StoreKit / Google Play sheet themselves. */
  userCancelled: boolean;
  /** Human-readable error for non-cancellation failures. */
  errorMessage?: string;
};

/**
 * Trigger StoreKit / Google Billing purchase sheet for the given tier.
 * Returns the resulting active tier so the UI can navigate to a confirmation.
 *
 * MOCK MODE: immediately succeeds and updates AsyncStorage via setMembership.
 * Useful for UI development without native build.
 */
export async function purchaseTier(
  tier: Exclude<MembershipTier, 'free'>
): Promise<PurchaseResult> {
  const Purchases = await getPurchases();

  // ── MOCK MODE (DEV builds only) ───────────────────────────────────
  // A production build must never grant a tier without payment. Purchases
  // is null both when RevenueCat keys are missing AND when the native
  // module fails to import — either way, fail closed outside __DEV__.
  if (!Purchases) {
    if (!__DEV__) {
      return {
        success: false,
        activeTier: null,
        userCancelled: false,
        errorMessage: 'In-app purchases are unavailable in this build. Please update the app or contact support.',
      };
    }
    const { setMembership } = await import('./auth');
    await setMembership(tier);
    console.log(`[iap] MOCK purchase succeeded: ${tier}`);
    return { success: true, activeTier: tier, userCancelled: false };
  }

  // ── REAL FLOW ─────────────────────────────────────────────────────
  try {
    const offerings = await Purchases.getOfferings();
    const pkg = offerings?.current?.availablePackages?.find(
      (p: any) => p.product?.identifier === TIER_TO_PRODUCT[tier]
    );
    if (!pkg) {
      return {
        success: false,
        activeTier: null,
        userCancelled: false,
        errorMessage: `Product ${TIER_TO_PRODUCT[tier]} not found in current offering. Check RevenueCat dashboard.`,
      };
    }

    const { customerInfo } = await Purchases.purchasePackage(pkg);
    const activeTier = customerInfoToTier(customerInfo);
    // Sync to local AsyncStorage so existing tier-gated code keeps working.
    const { setMembership } = await import('./auth');
    if (activeTier !== 'free') {
      await setMembership(activeTier);
    }
    return { success: true, activeTier, userCancelled: false };
  } catch (e: any) {
    // RevenueCat throws an error with userCancelled=true when user dismisses.
    if (e?.userCancelled) {
      return { success: false, activeTier: null, userCancelled: true };
    }
    console.warn('[iap] purchase error:', e?.message, e?.code);
    return {
      success: false,
      activeTier: null,
      userCancelled: false,
      errorMessage: e?.message || 'Purchase failed',
    };
  }
}

/**
 * Restore previous purchases — required by App Store guideline 3.1.1.
 * Must be visible on every paywall screen as a button.
 */
export async function restorePurchases(): Promise<PurchaseResult> {
  const Purchases = await getPurchases();
  if (!Purchases) {
    if (!__DEV__) {
      return {
        success: false,
        activeTier: null,
        userCancelled: false,
        errorMessage: 'In-app purchases are unavailable in this build. Please update the app or contact support.',
      };
    }
    // DEV mock mode: just return current local membership.
    const { getMembership } = await import('./auth');
    const m = await getMembership();
    return { success: true, activeTier: m.tier, userCancelled: false };
  }
  try {
    const customerInfo = await Purchases.restorePurchases();
    const tier = customerInfoToTier(customerInfo);
    const { setMembership } = await import('./auth');
    if (tier !== 'free') {
      await setMembership(tier);
    }
    return { success: true, activeTier: tier, userCancelled: false };
  } catch (e: any) {
    return {
      success: false,
      activeTier: null,
      userCancelled: false,
      errorMessage: e?.message || 'Restore failed',
    };
  }
}

/**
 * Sync the local membership state with RevenueCat's source-of-truth.
 * Call at app startup + on resume from background.
 */
export async function syncMembershipFromIap(): Promise<MembershipTier | null> {
  const Purchases = await getPurchases();
  if (!Purchases) return null;
  try {
    const customerInfo = await Purchases.getCustomerInfo();
    const tier = customerInfoToTier(customerInfo);
    const { setMembership, getMembership } = await import('./auth');
    const current = await getMembership();
    if (current.tier !== tier) {
      console.log(`[iap] Syncing membership: ${current.tier} → ${tier}`);
      if (tier !== 'free') {
        await setMembership(tier);
      } else {
        // Subscription expired — downgrade to free.
        await setMembership('free' as MembershipTier);
      }
    } else if (tier !== 'free') {
      // Same paid tier re-confirmed by RevenueCat — roll the local 30-day
      // expiry window forward so getMembership()'s fail-closed expiry check
      // doesn't lapse a continuously-renewing subscriber.
      await setMembership(tier);
    }
    return tier;
  } catch (e: any) {
    console.warn('[iap] sync failed:', e?.message);
    return null;
  }
}

/**
 * Subscribe to RevenueCat customer-info changes (entitlement
 * activated/expired in real time, e.g. when a refund is processed).
 * Returns an unsubscribe function.
 */
export async function listenIapChanges(
  onChange: (tier: MembershipTier) => void
): Promise<() => void> {
  const Purchases = await getPurchases();
  if (!Purchases) return () => {};

  // Remember the last tier we observed so we only fire subscription_*
  // events on actual transitions (not every customerInfo refresh).
  let lastTier: MembershipTier | null = null;
  try {
    const { getMembership } = await import('./auth');
    const m = await getMembership();
    lastTier = m.tier;
  } catch {
    /* ignore — lastTier stays null */
  }

  const handler = async (customerInfo: any) => {
    const tier = customerInfoToTier(customerInfo);
    onChange(tier);

    // Fire conversion telemetry only when the tier actually transitions
    // from a lower-or-free tier to a paid one. Skips:
    //   • Same-tier refreshes (renewal heartbeat)
    //   • Downgrades (cancellation handled by subscription_cancelled later)
    //   • Initial bootstrap (lastTier === null but tier === free)
    const isUpgrade =
      lastTier !== null &&
      lastTier !== tier &&
      tier !== 'free' &&
      tierRank(tier) > tierRank(lastTier);

    if (isUpgrade) {
      try {
        const { logFunnelEvent } = await import('./funnelEvents');
        // Detect trial via RevenueCat entitlement metadata when available.
        const entitlement = customerInfo?.entitlements?.active?.[ENTITLEMENT_FOR_TIER[tier]];
        const isTrial = !!entitlement?.periodType && entitlement.periodType === 'trial';
        await logFunnelEvent('subscription_completed', {
          tier,
          previous_tier: lastTier,
          via: 'iap',
          is_trial: isTrial,
        }, tier);
      } catch (e: any) {
        console.warn('[iap] subscription_completed log failed:', e?.message);
      }
    }
    lastTier = tier;
  };

  try {
    Purchases.addCustomerInfoUpdateListener?.(handler);
  } catch (e: any) {
    console.warn('[iap] listen failed:', e?.message);
  }
  return () => {
    try {
      Purchases.removeCustomerInfoUpdateListener?.(handler);
    } catch {}
  };
}

// Tier ordinal for upgrade-detection. Higher = more premium.
function tierRank(tier: MembershipTier): number {
  switch (tier) {
    case 'premium': return 3;
    case 'pro':     return 2;
    case 'standard':return 1;
    case 'free':
    default:        return 0;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────

/** Inspect a RevenueCat customerInfo and pick the highest active tier. */
function customerInfoToTier(customerInfo: any): MembershipTier {
  const entitlements = customerInfo?.entitlements?.active ?? {};
  // Priority order: Premium > Pro > Standard > Free.
  if (entitlements[ENTITLEMENT_FOR_TIER.premium]) return 'premium';
  if (entitlements[ENTITLEMENT_FOR_TIER.pro]) return 'pro';
  if (entitlements[ENTITLEMENT_FOR_TIER.standard]) return 'standard';
  return 'free' as MembershipTier;
}

declare const __DEV__: boolean;
