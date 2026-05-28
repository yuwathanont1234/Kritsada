import AsyncStorage from '@react-native-async-storage/async-storage';
import { MembershipTier, TRIAL_SCAN_LIMIT } from './auth';
import { shouldGateFreeTier } from './costBreaker';
import {
  FREE_SCAN_LIMIT,
  FREE_WINDOW_DAYS,
  getFreeScansBonus,
  getFreeScansUsed,
  isFreeWindowExpired,
  resetFreeScans,
} from './storage';

/**
 * Centralized capability matrix per tier.
 * Read these via `tierCaps(tier)` instead of hardcoding limits in screens.
 *
 * All AI features have concrete monthly caps to bound worst-case costs.
 */
export type TierCapabilities = {
  // === Scan limits (every tier has a hard cap to prevent runaway cost) ===
  monthlyScanLimit: number;
  /** Hard cap per calendar day. Catches abuse like "scan 500 in one night". */
  dailyScanLimit: number;
  /** One-time bonus scans on first install. Free only. */
  welcomeScans: number;
  /** Lifetime cap. Set to a very high number for non-Free tiers. */
  lifetimeScanLimit: number | 'unlimited';

  // Collection
  collectionLimit: number | 'unlimited';

  // Camera
  highQualityPhoto: boolean;
  autoCrop: boolean;

  // BG removal — number of removals/month. Premium has its own counter.
  bgRemoval: boolean;
  bgRemovalPerMonth: number;

  // Live price fetch — monthly cap on grounded-search calls.
  priceFetchPerMonth: number;

  // Result screen — what to show
  showAuthenticitySignals: boolean;
  showFullPriceSourceUrls: boolean;
  showRealPrices: boolean;       // Free = false (blur prices)
  showPriceHistory6Months: boolean;
  // Live web_search refresh of cached prices (Pro+ only).
  priceFetchLive: boolean;
  // Recommendation panel (retired in current versions).
  showRecommendation: boolean;

  // Sharing/Export
  hasWatermark: boolean;          // true = show watermark on shared images
  pdfExport: boolean;

  // Other Premium perks
  priorityAi: boolean;
  cloudBackup: boolean;

  // AI Q&A — questions/month limit
  aiQuestionsPerMonth: number;

  // Authenticity AI — monthly quota for cost control.
  authenticityPerMonth: number;

  // Heatmap pre-fire during auth — Standard+ gets this for accuracy boost.
  useHeatmapInAuth: boolean;

  // AI Authenticity Heatmap (Premium only) — visual region-by-region.
  authenticityHeatmap: boolean;
  heatmapPerMonth: number;

  // Deep Search (Pro+)
  deepSearchPerMonth: number;

  // Number of photo slots shown on the scan template:
  //   Free        = 1 (front dial only)
  //   Standard    = 2 (front dial + caseback)
  //   Pro         = 3 (front dial + caseback + side profile)
  //   Premium     = 4 (front dial + caseback + 2 side profile/details)
  templatePhotoCount: 1 | 2 | 3 | 4;

  // AI-Data Fusion: weight-discrepancy check (Premium only).
  // The fusion engine catches the "real warranty card + counterfeit
  // case" fraud pattern by cross-referencing the user's measured
  // weight against the manufacturer-spec range for the identified
  // reference. Gated to Premium because it's a defensible
  // upgrade-driver — same tier that gets the AI heatmap overlay.
  weightFusion: boolean;
};

// Free tier — 5 scans within a 30-DAY WINDOW. After the window elapses,
// Free is permanently LOCKED.
const FREE_CAPS: TierCapabilities = {
  monthlyScanLimit: 9999,         // bypass — Free uses lifetime window, not monthly
  dailyScanLimit: 9999,           // no daily pacing
  welcomeScans: 0,
  lifetimeScanLimit: FREE_SCAN_LIMIT,
  collectionLimit: 0,             // Free = scan only; saving to the vault requires an upgrade
  highQualityPhoto: false,
  autoCrop: false,
  bgRemoval: false,
  bgRemovalPerMonth: 0,
  priceFetchPerMonth: 0,          // Pro+ only
  showAuthenticitySignals: true,  // Free taste of Auth (image-only signals)
  showFullPriceSourceUrls: false,
  showRealPrices: false,          // blur prices for Free
  showPriceHistory6Months: false,
  priceFetchLive: false,
  showRecommendation: false,
  hasWatermark: true,
  pdfExport: false,
  priorityAi: false,
  cloudBackup: false,
  aiQuestionsPerMonth: 30,        // FAQ cache only — 0 cost (no LLM fallback)
  authenticityPerMonth: 3,        // 3 auth tries / 30-day window
  useHeatmapInAuth: false,        // Free auth runs WITHOUT heatmap signals
  authenticityHeatmap: false,
  heatmapPerMonth: 0,
  deepSearchPerMonth: 0,
  templatePhotoCount: 1,          // front dial only
  weightFusion: false,
};

// Standard Package — monthly scan limit: 20
const STANDARD_CAPS: TierCapabilities = {
  monthlyScanLimit: 20,           // 20 scans paired 1:1 with auth
  dailyScanLimit: 9999,
  welcomeScans: 0,
  lifetimeScanLimit: 'unlimited',
  collectionLimit: 20,            // matches monthly scan cap
  highQualityPhoto: true,
  autoCrop: false,
  bgRemoval: false,
  bgRemovalPerMonth: 0,
  priceFetchPerMonth: 0,
  showAuthenticitySignals: true,
  showFullPriceSourceUrls: false,
  showRealPrices: true,
  showPriceHistory6Months: false,
  priceFetchLive: false,
  showRecommendation: false,
  hasWatermark: true,
  pdfExport: false,
  priorityAi: false,
  cloudBackup: false,
  aiQuestionsPerMonth: 30,
  authenticityPerMonth: 20,       // 20 auth tries (1:1 with scans)
  useHeatmapInAuth: true,         // heatmap pre-fire ON for accuracy
  authenticityHeatmap: false,
  heatmapPerMonth: 0,
  deepSearchPerMonth: 0,
  templatePhotoCount: 2,          // front dial + caseback
  weightFusion: false,
};

// Pro Package — monthly scan limit: 50
const PRO_CAPS: TierCapabilities = {
  monthlyScanLimit: 50,            // 50 scans paired 1:1 with auth
  dailyScanLimit: 9999,
  welcomeScans: 0,
  lifetimeScanLimit: 'unlimited',
  collectionLimit: 50,            // matches monthly scan cap
  highQualityPhoto: true,
  autoCrop: false,
  bgRemoval: true,
  bgRemovalPerMonth: 30,
  priceFetchPerMonth: 30,
  showAuthenticitySignals: true,
  showFullPriceSourceUrls: false,
  showRealPrices: true,
  showPriceHistory6Months: false,
  priceFetchLive: true,
  showRecommendation: false,
  hasWatermark: true,
  pdfExport: true,
  priorityAi: false,
  cloudBackup: true,
  aiQuestionsPerMonth: 100,
  authenticityPerMonth: 50,        // 50 auth tries (1:1 with scans)
  useHeatmapInAuth: true,
  authenticityHeatmap: false,
  heatmapPerMonth: 0,
  deepSearchPerMonth: 0,
  templatePhotoCount: 3,          // front + back + side profile
  weightFusion: false,
};

// Premium Package — monthly scan limit: 100
const PREMIUM_CAPS: TierCapabilities = {
  monthlyScanLimit: 100,          // 100 scans paired 1:1 with auth
  dailyScanLimit: 9999,
  welcomeScans: 0,
  lifetimeScanLimit: 'unlimited',
  collectionLimit: 100,           // matches monthly scan cap
  highQualityPhoto: true,
  autoCrop: true,
  bgRemoval: true,
  bgRemovalPerMonth: 100,
  priceFetchPerMonth: 100,
  showAuthenticitySignals: true,
  showFullPriceSourceUrls: false,
  showRealPrices: true,
  showPriceHistory6Months: false,
  priceFetchLive: true,
  showRecommendation: false,
  hasWatermark: false,            // Premium removes watermark
  pdfExport: true,
  priorityAi: true,
  cloudBackup: true,
  aiQuestionsPerMonth: 300,
  authenticityPerMonth: 100,      // 100 auth tries (1:1 with scans)
  useHeatmapInAuth: true,
  authenticityHeatmap: true,      // AI heatmap UI overlay
  heatmapPerMonth: 50,
  deepSearchPerMonth: 0,
  templatePhotoCount: 4,          // full 4-angle capture
  weightFusion: true,             // 🏋️ AI-Data Fusion: material-density verification
};

export function tierCaps(tier: MembershipTier): TierCapabilities {
  if (tier === 'premium') return PREMIUM_CAPS;
  if (tier === 'pro') return PRO_CAPS;
  if (tier === 'standard') return STANDARD_CAPS;
  return FREE_CAPS;
}

export function effectiveCaps(status: {
  tier: MembershipTier;
  isTrialing: boolean;
}): TierCapabilities {
  if (status.isTrialing && status.tier === 'free') return PREMIUM_CAPS;
  return tierCaps(status.tier);
}

// === Monthly counters (scans + AI Q&A + BG removal + etc.) ===
const KEYS = {
  monthlyScans: '@luxuryauthenticator/monthly_scans',
  monthlyAIQuestions: '@luxuryauthenticator/monthly_ai_questions',
  monthlyDeepSearch: '@luxuryauthenticator/monthly_deep_search',
  monthlyAuthenticity: '@luxuryauthenticator/monthly_authenticity',
  monthlyHeatmap: '@luxuryauthenticator/monthly_heatmap',
  monthlyBgRemoval: '@luxuryauthenticator/monthly_bg_removal',
  monthlyPriceFetch: '@luxuryauthenticator/monthly_price_fetch',
  trialScans: '@luxuryauthenticator/trial_scans',
  dailyScans: '@luxuryauthenticator/daily_scans',
};

export const PREMIUM_DAILY_SCAN_LIMIT = 50;

function currentYearMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

type MonthlyState = { yearMonth: string; count: number };

async function readMonthlyState(): Promise<MonthlyState> {
  const raw = await AsyncStorage.getItem(KEYS.monthlyScans);
  if (!raw) return { yearMonth: currentYearMonth(), count: 0 };
  try {
    const parsed = JSON.parse(raw) as MonthlyState;
    if (parsed.yearMonth !== currentYearMonth()) {
      return { yearMonth: currentYearMonth(), count: 0 };
    }
    return parsed;
  } catch {
    return { yearMonth: currentYearMonth(), count: 0 };
  }
}

export async function getMonthlyScansUsed(): Promise<number> {
  return (await readMonthlyState()).count;
}

export async function incrementMonthlyScans(): Promise<number> {
  const state = await readMonthlyState();
  const next = { yearMonth: state.yearMonth, count: state.count + 1 };
  await AsyncStorage.setItem(KEYS.monthlyScans, JSON.stringify(next));
  return next.count;
}

export async function resetMonthlyScans(): Promise<void> {
  await AsyncStorage.removeItem(KEYS.monthlyScans);
}

export async function addBonusToMonthlyScans(bonus: number): Promise<number> {
  const state = await readMonthlyState();
  const nextCount = Math.max(0, state.count - bonus);
  const next = { yearMonth: state.yearMonth, count: nextCount };
  await AsyncStorage.setItem(KEYS.monthlyScans, JSON.stringify(next));
  return nextCount;
}

// === Daily scan counter ===
type DailyState = { date: string; count: number };

function currentDateKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function readDailyState(): Promise<DailyState> {
  const raw = await AsyncStorage.getItem(KEYS.dailyScans);
  if (!raw) return { date: currentDateKey(), count: 0 };
  try {
    const parsed = JSON.parse(raw) as DailyState;
    if (parsed.date !== currentDateKey()) {
      return { date: currentDateKey(), count: 0 };
    }
    return parsed;
  } catch {
    return { date: currentDateKey(), count: 0 };
  }
}

export async function getDailyScansUsed(): Promise<number> {
  return (await readDailyState()).count;
}

export async function incrementDailyScans(): Promise<number> {
  const state = await readDailyState();
  const next = { date: state.date, count: state.count + 1 };
  await AsyncStorage.setItem(KEYS.dailyScans, JSON.stringify(next));
  return next.count;
}

export async function getRemainingDailyScans(): Promise<number> {
  const used = await getDailyScansUsed();
  return Math.max(0, PREMIUM_DAILY_SCAN_LIMIT - used);
}

// === Monthly AI Q&A counter ===
async function readMonthlyAIState(): Promise<MonthlyState> {
  const raw = await AsyncStorage.getItem(KEYS.monthlyAIQuestions);
  if (!raw) return { yearMonth: currentYearMonth(), count: 0 };
  try {
    const parsed = JSON.parse(raw) as MonthlyState;
    if (parsed.yearMonth !== currentYearMonth()) {
      return { yearMonth: currentYearMonth(), count: 0 };
    }
    return parsed;
  } catch {
    return { yearMonth: currentYearMonth(), count: 0 };
  }
}

export async function getMonthlyAIQuestionsUsed(): Promise<number> {
  return (await readMonthlyAIState()).count;
}

export async function incrementMonthlyAIQuestions(): Promise<number> {
  const state = await readMonthlyAIState();
  const next = { yearMonth: state.yearMonth, count: state.count + 1 };
  await AsyncStorage.setItem(KEYS.monthlyAIQuestions, JSON.stringify(next));
  return next.count;
}

export async function resetMonthlyAIQuestions(): Promise<void> {
  await AsyncStorage.removeItem(KEYS.monthlyAIQuestions);
}

// === Monthly Deep Search counter ===
async function readMonthlyDeepSearchState(): Promise<MonthlyState> {
  const raw = await AsyncStorage.getItem(KEYS.monthlyDeepSearch);
  if (!raw) return { yearMonth: currentYearMonth(), count: 0 };
  try {
    const parsed = JSON.parse(raw) as MonthlyState;
    if (parsed.yearMonth !== currentYearMonth()) {
      return { yearMonth: currentYearMonth(), count: 0 };
    }
    return parsed;
  } catch {
    return { yearMonth: currentYearMonth(), count: 0 };
  }
}

export async function getMonthlyDeepSearchUsed(): Promise<number> {
  return (await readMonthlyDeepSearchState()).count;
}

export async function incrementMonthlyDeepSearch(): Promise<number> {
  const state = await readMonthlyDeepSearchState();
  const next = { yearMonth: state.yearMonth, count: state.count + 1 };
  await AsyncStorage.setItem(KEYS.monthlyDeepSearch, JSON.stringify(next));
  return next.count;
}

export async function resetMonthlyDeepSearch(): Promise<void> {
  await AsyncStorage.removeItem(KEYS.monthlyDeepSearch);
}

// === Monthly Authenticity AI counter ===
async function readMonthlyAuthenticityState(): Promise<MonthlyState> {
  const raw = await AsyncStorage.getItem(KEYS.monthlyAuthenticity);
  if (!raw) return { yearMonth: currentYearMonth(), count: 0 };
  try {
    const parsed = JSON.parse(raw) as MonthlyState;
    if (parsed.yearMonth !== currentYearMonth()) {
      return { yearMonth: currentYearMonth(), count: 0 };
    }
    return parsed;
  } catch {
    return { yearMonth: currentYearMonth(), count: 0 };
  }
}

export async function getMonthlyAuthenticityUsed(): Promise<number> {
  return (await readMonthlyAuthenticityState()).count;
}

export async function incrementMonthlyAuthenticity(): Promise<number> {
  const state = await readMonthlyAuthenticityState();
  const next = { yearMonth: state.yearMonth, count: state.count + 1 };
  await AsyncStorage.setItem(KEYS.monthlyAuthenticity, JSON.stringify(next));
  return next.count;
}

export async function resetMonthlyAuthenticity(): Promise<void> {
  await AsyncStorage.removeItem(KEYS.monthlyAuthenticity);
}

// === Monthly Heatmap counter ===
async function readMonthlyHeatmapState(): Promise<MonthlyState> {
  const raw = await AsyncStorage.getItem(KEYS.monthlyHeatmap);
  if (!raw) return { yearMonth: currentYearMonth(), count: 0 };
  try {
    const parsed = JSON.parse(raw) as MonthlyState;
    if (parsed.yearMonth !== currentYearMonth()) {
      return { yearMonth: currentYearMonth(), count: 0 };
    }
    return parsed;
  } catch {
    return { yearMonth: currentYearMonth(), count: 0 };
  }
}

export async function getMonthlyHeatmapUsed(): Promise<number> {
  return (await readMonthlyHeatmapState()).count;
}

export async function incrementMonthlyHeatmap(): Promise<number> {
  const state = await readMonthlyHeatmapState();
  const next = { yearMonth: state.yearMonth, count: state.count + 1 };
  await AsyncStorage.setItem(KEYS.monthlyHeatmap, JSON.stringify(next));
  return next.count;
}

export async function resetMonthlyHeatmap(): Promise<void> {
  await AsyncStorage.removeItem(KEYS.monthlyHeatmap);
}

export async function checkHeatmapAllowed(
  tier: MembershipTier,
  isTrialing: boolean
): Promise<{ allowed: boolean; reason?: string; remaining: number; quota: number }> {
  const caps = effectiveCaps({ tier, isTrialing });
  const quota = caps.heatmapPerMonth;

  if (quota === 0) {
    return {
      allowed: false,
      reason: 'วิเคราะห์ตำแหน่งตรวจแท้ (Heatmap) เปิดให้เฉพาะแพ็คเกจ Premium',
      remaining: 0,
      quota: 0,
    };
  }

  const used = await getMonthlyHeatmapUsed();
  const remaining = Math.max(0, quota - used);

  if (remaining === 0) {
    return {
      allowed: false,
      reason: `ใช้ครบโควต้าเดือนนี้แล้ว (${quota} ครั้ง) — เริ่มใหม่เดือนหน้า`,
      remaining: 0,
      quota,
    };
  }

  return { allowed: true, remaining, quota };
}

// === Monthly BG removal counter ===
async function readMonthlyBgRemovalState(): Promise<MonthlyState> {
  const raw = await AsyncStorage.getItem(KEYS.monthlyBgRemoval);
  if (!raw) return { yearMonth: currentYearMonth(), count: 0 };
  try {
    const parsed = JSON.parse(raw) as MonthlyState;
    if (parsed.yearMonth !== currentYearMonth()) {
      return { yearMonth: currentYearMonth(), count: 0 };
    }
    return parsed;
  } catch {
    return { yearMonth: currentYearMonth(), count: 0 };
  }
}

export async function getMonthlyBgRemovalUsed(): Promise<number> {
  return (await readMonthlyBgRemovalState()).count;
}

export async function incrementMonthlyBgRemoval(): Promise<number> {
  const state = await readMonthlyBgRemovalState();
  const next = { yearMonth: state.yearMonth, count: state.count + 1 };
  await AsyncStorage.setItem(KEYS.monthlyBgRemoval, JSON.stringify(next));
  return next.count;
}

export async function resetMonthlyBgRemoval(): Promise<void> {
  await AsyncStorage.removeItem(KEYS.monthlyBgRemoval);
}

export async function checkBgRemovalAllowed(
  tier: MembershipTier,
  isTrialing: boolean
): Promise<{ allowed: boolean; reason?: string; remaining: number; quota: number }> {
  const caps = effectiveCaps({ tier, isTrialing });
  const quota = caps.bgRemovalPerMonth;

  if (quota === 0) {
    return {
      allowed: false,
      reason: 'ฟีเจอร์ตัดพื้นหลัง AI เปิดให้เฉพาะแพ็คเกจ Pro ขึ้นไป',
      remaining: 0,
      quota: 0,
    };
  }

  const used = await getMonthlyBgRemovalUsed();
  const remaining = Math.max(0, quota - used);

  if (remaining === 0) {
    return {
      allowed: false,
      reason: `ใช้ครบโควต้าเดือนนี้แล้ว (${quota} ครั้ง) — เริ่มใหม่เดือนหน้า หรืออัปเกรดแพ็คเกจ`,
      remaining: 0,
      quota,
    };
  }

  return { allowed: true, remaining, quota };
}

// === Monthly Live Price Fetch counter ===
async function readMonthlyPriceFetchState(): Promise<MonthlyState> {
  const raw = await AsyncStorage.getItem(KEYS.monthlyPriceFetch);
  if (!raw) return { yearMonth: currentYearMonth(), count: 0 };
  try {
    const parsed = JSON.parse(raw) as MonthlyState;
    if (parsed.yearMonth !== currentYearMonth()) {
      return { yearMonth: currentYearMonth(), count: 0 };
    }
    return parsed;
  } catch {
    return { yearMonth: currentYearMonth(), count: 0 };
  }
}

export async function getMonthlyPriceFetchUsed(): Promise<number> {
  return (await readMonthlyPriceFetchState()).count;
}

export async function incrementMonthlyPriceFetch(): Promise<number> {
  const state = await readMonthlyPriceFetchState();
  const next = { yearMonth: state.yearMonth, count: state.count + 1 };
  await AsyncStorage.setItem(KEYS.monthlyPriceFetch, JSON.stringify(next));
  return next.count;
}

export async function resetMonthlyPriceFetch(): Promise<void> {
  await AsyncStorage.removeItem(KEYS.monthlyPriceFetch);
}

export async function checkPriceFetchAllowed(
  tier: MembershipTier,
  isTrialing: boolean
): Promise<{ allowed: boolean; reason?: string; remaining: number; quota: number }> {
  const caps = effectiveCaps({ tier, isTrialing });
  const quota = caps.priceFetchPerMonth;

  if (quota === 0) {
    return {
      allowed: false,
      reason: 'เช็คราคารองรับเฉพาะแพ็คเกจ Pro ขึ้นไป',
      remaining: 0,
      quota: 0,
    };
  }

  const used = await getMonthlyPriceFetchUsed();
  const remaining = Math.max(0, quota - used);

  if (remaining === 0) {
    return {
      allowed: false,
      reason: `ใช้ครบโควต้าเช็คราคานาฬิกาหรูเดือนนี้แล้ว (${quota} ครั้ง) — เริ่มใหม่เดือนหน้า หรืออัปเกรดแพ็คเกจ`,
      remaining: 0,
      quota,
    };
  }

  return { allowed: true, remaining, quota };
}

export async function resetDailyScans(): Promise<void> {
  await AsyncStorage.removeItem(KEYS.dailyScans);
}

/** DEV helper — wipe every quota counter */
export async function resetAllQuotas(): Promise<void> {
  await Promise.all([
    resetMonthlyScans(),
    resetMonthlyAIQuestions(),
    resetMonthlyDeepSearch(),
    resetMonthlyAuthenticity(),
    resetMonthlyHeatmap(),
    resetMonthlyBgRemoval(),
    resetMonthlyPriceFetch(),
    resetDailyScans(),
    resetTrialScans(),
    resetFreeScans(),
  ]);
}

/** Check if user can run another Deep Search this month. Pro+ only. */
export async function checkDeepSearchAllowed(
  tier: MembershipTier
): Promise<{ allowed: boolean; reason?: string; remaining: number; quota: number }> {
  const caps = tierCaps(tier);
  const quota = caps.deepSearchPerMonth;

  if (quota === 0) {
    return {
      allowed: false,
      reason: 'ค้นหาละเอียดพิเศษ เปิดให้เฉพาะแพ็คเกจ Pro ขึ้นไป',
      remaining: 0,
      quota: 0,
    };
  }

  const used = await getMonthlyDeepSearchUsed();
  const remaining = Math.max(0, quota - used);

  if (remaining === 0) {
    return {
      allowed: false,
      reason: `ใช้ครบโควต้าเดือนนี้แล้ว (${quota} ครั้ง) — เริ่มใหม่เดือนหน้า หรืออัปเกรดแพ็คเกจ`,
      remaining: 0,
      quota,
    };
  }

  return { allowed: true, remaining, quota };
}

/** Check if user can ask another AI question this month. */
export async function checkAIQuestionAllowed(
  tier: MembershipTier,
  isTrialing: boolean = false
): Promise<{ allowed: boolean; reason?: string; remaining: number; quota: number }> {
  const caps = effectiveCaps({ tier, isTrialing });
  const quota = caps.aiQuestionsPerMonth;

  if (quota === 0) {
    return {
      allowed: false,
      reason: 'บริการ AI ผู้ช่วยตอบคำถาม เปิดให้เฉพาะแพ็คเกจ Standard ขึ้นไป',
      remaining: 0,
      quota: 0,
    };
  }

  const used = await getMonthlyAIQuestionsUsed();
  const remaining = Math.max(0, quota - used);

  if (remaining === 0) {
    return {
      allowed: false,
      reason: `ใช้ครบโควต้า AI ตอบคำถามเดือนนี้แล้ว (${quota} คำถาม) — เริ่มใหม่เดือนหน้า หรืออัปเกรดแพ็คเกจ`,
      remaining: 0,
      quota,
    };
  }

  return { allowed: true, remaining, quota };
}

/** Check if user can run another Authenticity AI assessment this month. */
export async function checkAuthenticityAllowed(
  tier: MembershipTier,
  isTrialing: boolean
): Promise<{ allowed: boolean; reason?: string; remaining: number; quota: number }> {
  const caps = effectiveCaps({ tier, isTrialing });
  const quota = caps.authenticityPerMonth;

  if (quota === 0) {
    return {
      allowed: false,
      reason: 'ระบบตรวจสอบความแท้ AI เปิดให้เฉพาะแพ็คเกจที่กำหนด',
      remaining: 0,
      quota: 0,
    };
  }

  const used = await getMonthlyAuthenticityUsed();
  const remaining = Math.max(0, quota - used);

  if (remaining === 0) {
    return {
      allowed: false,
      reason: `ใช้ครบโควต้าตรวจสอบความแท้เดือนนี้แล้ว (${quota} ครั้ง) — เริ่มใหม่เดือนหน้า หรืออัปเกรดแพ็คเกจ`,
      remaining: 0,
      quota,
    };
  }

  return { allowed: true, remaining, quota };
}

// === Trial scan counter ===
type TrialScanState = { trialStart: string; count: number };

async function readTrialScanState(activeTrialStart: string): Promise<TrialScanState> {
  const raw = await AsyncStorage.getItem(KEYS.trialScans);
  if (!raw) return { trialStart: activeTrialStart, count: 0 };
  try {
    const parsed = JSON.parse(raw) as TrialScanState;
    if (parsed.trialStart !== activeTrialStart) {
      return { trialStart: activeTrialStart, count: 0 };
    }
    return parsed;
  } catch {
    return { trialStart: activeTrialStart, count: 0 };
  }
}

export async function getTrialScansUsed(activeTrialStart: string): Promise<number> {
  return (await readTrialScanState(activeTrialStart)).count;
}

export async function getRemainingTrialScans(activeTrialStart: string): Promise<number> {
  const used = await getTrialScansUsed(activeTrialStart);
  return Math.max(0, TRIAL_SCAN_LIMIT - used);
}

type TrialDailyState = { date: string; count: number };

async function readTrialDailyState(): Promise<TrialDailyState> {
  const raw = await AsyncStorage.getItem('@luxuryauthenticator/trial_daily_scans');
  if (!raw) return { date: currentDateKey(), count: 0 };
  try {
    const parsed = JSON.parse(raw) as TrialDailyState;
    if (parsed.date !== currentDateKey()) {
      return { date: currentDateKey(), count: 0 };
    }
    return parsed;
  } catch {
    return { date: currentDateKey(), count: 0 };
  }
}

export async function getTrialDailyScansUsed(): Promise<number> {
  return (await readTrialDailyState()).count;
}

export async function incrementTrialDailyScans(): Promise<number> {
  const state = await readTrialDailyState();
  const next = { date: state.date, count: state.count + 1 };
  await AsyncStorage.setItem('@luxuryauthenticator/trial_daily_scans', JSON.stringify(next));
  return next.count;
}

export async function resetTrialDailyScans(): Promise<void> {
  await AsyncStorage.removeItem('@luxuryauthenticator/trial_daily_scans');
}

export async function incrementTrialScans(activeTrialStart: string): Promise<number> {
  const state = await readTrialScanState(activeTrialStart);
  const next = { trialStart: state.trialStart, count: state.count + 1 };
  await AsyncStorage.setItem(KEYS.trialScans, JSON.stringify(next));
  await incrementTrialDailyScans();
  return next.count;
}

export async function resetTrialScans(): Promise<void> {
  await AsyncStorage.removeItem(KEYS.trialScans);
  await resetTrialDailyScans();
}

/** Check if user can scan now based on their tier and trial state. */
/**
 * Helper: compute the "approaching limit" flag. Fires when the user has
 * ≤ 20% of their quota remaining (rounded up, minimum 1). Used by
 * ScanScreen to render an amber warning + fire scan_quota_approaching.
 */
function isApproaching(remaining: number, total: number): boolean {
  if (total <= 0) return false;
  if (remaining <= 0) return false; // exhausted is a separate state
  const threshold = Math.max(1, Math.ceil(total * 0.2));
  return remaining <= threshold;
}

export async function checkScanAllowed(
  tier: MembershipTier,
  freeScansUsedLifetime: number,
  trialStart?: string | null
): Promise<{
  allowed: boolean;
  reason?: string;
  remaining?: number | 'unlimited';
  total?: number;
  approaching?: boolean;
}> {
  // If Free tier and NOT trialing, they are completely locked out of scanning!
  if (tier === 'free' && !trialStart) {
    return {
      allowed: false,
      reason: 'ไม่มีระบบสแกนฟรี — กรุณาผูกบัตรเครดิตเพื่อเริ่มสิทธิ์ทดลองใช้ Premium ฟรี 7 วัน (สูงสุด 5 สแกน)',
      remaining: 0,
    };
  }

  // Trial users — capped at TRIAL_SCAN_LIMIT (5 scans)
  if (trialStart) {
    const used = await getTrialScansUsed(trialStart);
    const remaining = TRIAL_SCAN_LIMIT - used;
    if (remaining <= 0) {
      return {
        allowed: false,
        reason: `ใช้ครบโควต้าทดลองใช้ ${TRIAL_SCAN_LIMIT} ครั้งแล้ว — ระบบทำการหักชำระเงินผ่านบัตรเครดิตที่ผูกไว้เพื่อเริ่มใช้งานแผนสแตนดาร์ดอัตโนมัติ`,
        remaining: 0,
      };
    }

    // Enforce trial daily cap of 3 scans per day
    const dailyUsed = await getTrialDailyScansUsed();
    const dailyRemaining = 3 - dailyUsed;
    if (dailyRemaining <= 0) {
      return {
        allowed: false,
        reason: '🚫 ช่วงทดลองจำกัดสแกนได้ไม่เกิน 3 ครั้งต่อวัน (กรุณาลองใหม่อีกครั้งในวันพรุ่งนี้ หรือเปิดใช้งานแพ็คเกจแบบเต็ม)',
        remaining: 0,
      };
    }

    const effectiveRemaining = Math.min(remaining, dailyRemaining);
    return {
      allowed: true,
      remaining: effectiveRemaining,
      total: TRIAL_SCAN_LIMIT,
      approaching: isApproaching(effectiveRemaining, TRIAL_SCAN_LIMIT),
    };
  }

  const caps = tierCaps(tier);

  // Cost circuit breaker
  if (tier === 'free') {
    const gated = await shouldGateFreeTier();
    if (gated) {
      return {
        allowed: false,
        reason:
          'ระบบหยุดบริการสแกนฟรีชั่วคราวเนื่องจากปริมาณการใช้สูง — ลองใหม่พรุ่งนี้ หรือสมัครสมาชิกเพื่อใช้ต่อทันที',
        remaining: 0,
      };
    }

    // Free tier — 30-day WINDOW model
    if (await isFreeWindowExpired()) {
      return {
        allowed: false,
        reason: `ครบ ${FREE_WINDOW_DAYS} วันที่ใช้สแกนฟรีแล้ว — อัปเกรดสมาชิก หรือซื้อเครดิตเพื่อสแกนต่อ`,
        remaining: 0,
      };
    }
    const [used, bonus] = await Promise.all([
      getFreeScansUsed(),
      getFreeScansBonus(),
    ]);
    const effectiveLimit = FREE_SCAN_LIMIT + bonus;
    const remaining = Math.max(0, effectiveLimit - used);
    if (remaining <= 0) {
      const hint = bonus > 0
        ? 'อัปเกรดสมาชิก หรือซื้อเครดิตเพื่อสแกนต่อ'
        : 'แชร์ข้อมูลเพื่อรับเพิ่ม 5 เครดิต · อัปเกรด · หรือซื้อเครดิต';
      return {
        allowed: false,
        reason: `ใช้ครบสแกนฟรี ${effectiveLimit} ครั้งแล้ว — ${hint}`,
        remaining: 0,
        total: effectiveLimit,
      };
    }
    return {
      allowed: true,
      remaining,
      total: effectiveLimit,
      approaching: isApproaching(remaining, effectiveLimit),
    };
  }

  // Paid tiers — monthly cadence, no daily cap
  const used = await getMonthlyScansUsed();
  const remaining = caps.monthlyScanLimit - used;
  if (remaining <= 0) {
    const now = new Date();
    const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const diffMs = nextMonthStart.getTime() - now.getTime();
    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const countdown = days > 0 ? `${days} วัน ${hours} ชม.` : `${hours} ชม.`;
    return {
      allowed: false,
      reason: `ใช้ครบโควต้า ${caps.monthlyScanLimit} ครั้งของเดือนนี้แล้ว · ซื้อเครดิตเพื่อสแกนต่อทันที หรือรออีก ${countdown}`,
      remaining: 0,
      total: caps.monthlyScanLimit,
    };
  }
  return {
    allowed: true,
    remaining,
    total: caps.monthlyScanLimit,
    approaching: isApproaching(remaining, caps.monthlyScanLimit),
  };
}
