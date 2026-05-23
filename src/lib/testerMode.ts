/**
 * Tester Mode — special distribution for closed-beta testers.
 *
 * How it works:
 *   - Build APK/IPA with EXPO_PUBLIC_TESTER_BUILD=true + EXPO_PUBLIC_TESTER_END_DATE=ISO-string
 *   - On first launch (`activateTesterMode`), set tier='free' + trial state
 *     with extended scan cap (50 instead of 10) so testers can exercise all
 *     paid features without burning quota
 *   - On every launch (`checkTesterExpiry`), compare now vs end date — past
 *     end date renders TesterLockoutScreen and never lets the user back in
 *   - Telemetry (`logTesterEvent`) writes lifecycle + error events to
 *     Supabase `tester_events`; feedback writes to `tester_feedback`
 *
 * Production builds bypass all of this.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

let APP_VERSION: string | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const appJson = require('../../app.json');
  APP_VERSION = appJson?.expo?.version ?? null;
} catch {
  APP_VERSION = null;
}

const KEYS = {
  testerActivated: '@luxuryauthenticator/tester_activated_at',
  testerDeviceId: '@luxuryauthenticator/tester_device_id',
};

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

export const TESTER_SCAN_LIMIT = 50;

/** Returns true when this app was built with the tester flag. */
export function isTesterBuild(): boolean {
  return process.env.EXPO_PUBLIC_TESTER_BUILD === 'true';
}

/** ISO timestamp after which the app self-locks. */
export function getTesterEndDate(): Date | null {
  const raw = process.env.EXPO_PUBLIC_TESTER_END_DATE;
  if (!raw) return null;
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d;
}

export function isTesterExpired(): boolean {
  if (!isTesterBuild()) return false;
  const end = getTesterEndDate();
  if (!end) return false; // missing end date = never expires
  return Date.now() > end.getTime();
}

export function getTesterRemainingMs(): number {
  const end = getTesterEndDate();
  if (!end) return 0;
  return Math.max(0, end.getTime() - Date.now());
}

export function getTesterRemainingDays(): number {
  const ms = getTesterRemainingMs();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

/**
 * On first launch in a tester build, plant a trialStart timestamp.
 */
export async function activateTesterModeIfNeeded(): Promise<void> {
  if (!isTesterBuild()) return;
  const existing = await AsyncStorage.getItem(KEYS.testerActivated);
  if (existing) return; // already activated this device

  const now = new Date().toISOString();
  await AsyncStorage.setItem(KEYS.testerActivated, now);

  const { startTrialAgain } = await import('./auth');
  await startTrialAgain();

  void logTesterEvent('tester_activated', {
    activatedAt: now,
    endDate: process.env.EXPO_PUBLIC_TESTER_END_DATE,
  });
}

/** Stable per-device ID for grouping events. */
let inflightDeviceId: Promise<string> | null = null;

async function getOrCreateDeviceId(): Promise<string> {
  if (inflightDeviceId) return inflightDeviceId;
  inflightDeviceId = (async () => {
    const cached = await AsyncStorage.getItem(KEYS.testerDeviceId);
    if (cached) return cached;
    const id = `t-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    await AsyncStorage.setItem(KEYS.testerDeviceId, id);
    return id;
  })().catch((e) => {
    inflightDeviceId = null;
    throw e;
  });
  return inflightDeviceId;
}

export type TesterEventType =
  | 'tester_activated'
  | 'app_open'
  | 'screen_view'
  | 'scan_start'
  | 'scan_complete'
  | 'scan_error'
  | 'auth_check'
  | 'heatmap_view'
  | 'feature_used'
  | 'crash'
  | 'error';

/** Fire-and-forget logger. Writes to Supabase `tester_events`. */
export async function logTesterEvent(
  type: TesterEventType,
  payload?: Record<string, unknown>
): Promise<void> {
  if (!isTesterBuild()) return;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return;

  try {
    const deviceId = await getOrCreateDeviceId();
    const url = `${SUPABASE_URL}/rest/v1/tester_events`;
    await fetch(url, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        device_id: deviceId,
        event_type: type,
        platform: Platform.OS,
        app_version: APP_VERSION,
        payload: payload ?? null,
      }),
    });
  } catch {
    // Silent
  }
}

/**
 * Install a global JS error handler for unhandled native crashes.
 */
export function installGlobalErrorHandler(): void {
  if (!isTesterBuild()) return;
  const g = globalThis as unknown as {
    ErrorUtils?: {
      getGlobalHandler: () => (e: Error, isFatal?: boolean) => void;
      setGlobalHandler: (
        handler: (e: Error, isFatal?: boolean) => void
      ) => void;
    };
  };
  if (!g.ErrorUtils) return;

  const previous = g.ErrorUtils.getGlobalHandler();
  g.ErrorUtils.setGlobalHandler((error: Error, isFatal?: boolean) => {
    void logTesterEvent('error', {
      message: String(error?.message ?? error).slice(0, 500),
      stack: String(error?.stack ?? '').slice(0, 2000),
      isFatal: !!isFatal,
    });
    if (typeof previous === 'function') {
      previous(error, isFatal);
    }
  });
}

/** Submit free-form feedback from the in-app feedback button. */
export async function submitTesterFeedback(args: {
  message: string;
  category?: 'bug' | 'ux' | 'feature' | 'general';
  screenshotUri?: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return { ok: false, error: 'Supabase is not configured' };
  }
  try {
    const deviceId = await getOrCreateDeviceId();
    const url = `${SUPABASE_URL}/rest/v1/tester_feedback`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        device_id: deviceId,
        message: args.message,
        category: args.category ?? 'general',
        platform: Platform.OS,
        app_version: APP_VERSION,
      }),
    });
    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}` };
    }
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: String(e?.message ?? e) };
  }
}
