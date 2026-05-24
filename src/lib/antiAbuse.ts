import AsyncStorage from '@react-native-async-storage/async-storage';
import { MembershipTier } from './auth';

const KEYS = {
  lastScanTime: '@luxuryauthenticator/last_scan_time',
  dailyScanHistory: '@luxuryauthenticator/daily_scan_history',
  consecutiveFailures: '@luxuryauthenticator/consecutive_failures',
  lockoutExpires: '@luxuryauthenticator/lockout_expires',
};

// Rates & Limits configuration
const SCAN_COOLDOWN_MS = 15000; // 15 seconds cooldown between scans
const MAX_FAILURES_BEFORE_LOCKOUT = 3;
const LOCKOUT_DURATION_MS = 900000; // 15 minutes lockout

const DAILY_VELOCITY_LIMITS: Record<MembershipTier | 'trial', number> = {
  free: 1, // capped by trial checks
  trial: 3, // max 3 scans per day in trial
  standard: 15, // max 15 scans per day
  pro: 30, // max 30 scans per day
  premium: 50, // max 50 scans per day
};

export type AntiAbuseCheckResult =
  | { allowed: true }
  | { allowed: false; reason: 'cooldown' | 'velocity' | 'lockout'; userMessage: string; nextAllowedTimeMs?: number };

/**
 * Check if the user is allowed to scan, based on rate limits, daily velocity, and lockout status.
 */
export async function checkAntiAbuse(
  tier: MembershipTier,
  isTrialing: boolean
): Promise<AntiAbuseCheckResult> {
  const now = Date.now();

  // 1. Check lockout status
  const lockoutStr = await AsyncStorage.getItem(KEYS.lockoutExpires);
  if (lockoutStr) {
    const lockoutExpires = parseInt(lockoutStr, 10);
    if (now < lockoutExpires) {
      const remainingMinutes = Math.ceil((lockoutExpires - now) / 60000);
      return {
        allowed: false,
        reason: 'lockout',
        userMessage: `ระบบตรวจพบพฤติกรรมการใช้งานที่น่าสงสัย (อัปโหลดรูปไม่ถูกต้องติดต่อกัน) เพื่อความปลอดภัย ระบบได้ระงับการสแกนชั่วคราวเป็นเวลาอีก ${remainingMinutes} นาที`,
        nextAllowedTimeMs: lockoutExpires,
      };
    } else {
      // Lockout expired, clean up
      await AsyncStorage.removeItem(KEYS.lockoutExpires);
      await AsyncStorage.setItem(KEYS.consecutiveFailures, '0');
    }
  }

  // 2. Check 15-second cooldown rate limit
  const lastScanStr = await AsyncStorage.getItem(KEYS.lastScanTime);
  if (lastScanStr) {
    const lastScanTime = parseInt(lastScanStr, 10);
    const elapsed = now - lastScanTime;
    if (elapsed < SCAN_COOLDOWN_MS) {
      const remainingSeconds = Math.ceil((SCAN_COOLDOWN_MS - elapsed) / 1000);
      return {
        allowed: false,
        reason: 'cooldown',
        userMessage: `กรุณารออีก ${remainingSeconds} วินาที ก่อนทำการสแกนครั้งต่อไป เพื่อป้องกันการสแกนซ้ำซ้อน`,
        nextAllowedTimeMs: lastScanTime + SCAN_COOLDOWN_MS,
      };
    }
  }

  // 3. Check daily velocity cap (scans in the last 24 hours)
  const historyStr = await AsyncStorage.getItem(KEYS.dailyScanHistory);
  let history: number[] = historyStr ? JSON.parse(historyStr) : [];
  
  // Filter out timestamps older than 24 hours
  const cutoff = now - 24 * 60 * 60 * 1000;
  history = history.filter((timestamp) => timestamp > cutoff);
  await AsyncStorage.setItem(KEYS.dailyScanHistory, JSON.stringify(history));

  const limitKey = isTrialing ? 'trial' : tier;
  const maxDaily = DAILY_VELOCITY_LIMITS[limitKey] ?? 15;

  if (history.length >= maxDaily) {
    // Find when the oldest scan in the history window drops off
    const oldestScan = history[0];
    const nextResetTime = oldestScan + 24 * 60 * 60 * 1000;
    const remainingHours = Math.ceil((nextResetTime - now) / (60000 * 60));
    
    return {
      allowed: false,
      reason: 'velocity',
      userMessage: `คุณใช้โควต้าสแกนสูงสุดประจำวันเกินกำหนดความปลอดภัย (${maxDaily} สแกน/วัน) เพื่อป้องกันการโจมตีระบบกรุณารออีกประมาณ ${remainingHours} ชั่วโมง`,
      nextAllowedTimeMs: nextResetTime,
    };
  }

  return { allowed: true };
}

/**
 * Record a successful scan starting. Updates scan cooldown and daily velocity history.
 */
export async function recordSuccessfulScan(): Promise<void> {
  const now = Date.now();
  await AsyncStorage.setItem(KEYS.lastScanTime, now.toString());

  const historyStr = await AsyncStorage.getItem(KEYS.dailyScanHistory);
  const history: number[] = historyStr ? JSON.parse(historyStr) : [];
  history.push(now);
  await AsyncStorage.setItem(KEYS.dailyScanHistory, JSON.stringify(history));

  // Reset consecutive failures on successful scan execution
  await AsyncStorage.setItem(KEYS.consecutiveFailures, '0');
}

/**
 * Record a failed pre-flight or image validation scan. Triggers lockout if consecutive failures breach cap.
 */
export async function recordFailedScan(): Promise<boolean> {
  const currentFailuresStr = await AsyncStorage.getItem(KEYS.consecutiveFailures);
  const currentFailures = currentFailuresStr ? parseInt(currentFailuresStr, 10) : 0;
  const nextFailures = currentFailures + 1;

  if (nextFailures >= MAX_FAILURES_BEFORE_LOCKOUT) {
    const lockoutExpires = Date.now() + LOCKOUT_DURATION_MS;
    await AsyncStorage.setItem(KEYS.lockoutExpires, lockoutExpires.toString());
    await AsyncStorage.setItem(KEYS.consecutiveFailures, '0');
    return true; // Lockout triggered
  } else {
    await AsyncStorage.setItem(KEYS.consecutiveFailures, nextFailures.toString());
    return false; // Lockout not triggered yet
  }
}
