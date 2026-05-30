/**
 * Push Notifications — Expo Push token registration + Supabase sync.
 *
 * Architecture:
 *   1. Client requests permission (typically post-onboarding or after
 *      first scan complete — moments of high willingness-to-allow).
 *   2. If granted, request Expo Push Token (server-managed, no Firebase
 *      cert wrangling needed for managed Expo apps).
 *   3. Persist token to user_profile.push_token via userProfile.upsert.
 *   4. Server-side send-re-engagement Edge Function reads the token
 *      and posts to https://exp.host/--/api/v2/push/send.
 *
 * Setup required (one-time, EAS config):
 *   • For development builds: works out of the box on physical devices
 *   • For production: configure FCM credentials in EAS for Android
 *     (Expo handles iOS via APN automatically when using managed Expo)
 *   • app.json needs the expo-notifications plugin (added by `expo install`)
 *
 * Privacy posture:
 *   • Token is per-install — rotates on app reinstall or token refresh
 *   • No PII transmitted — push body composed server-side
 *   • User can revoke via system Settings → Notifications, AND from
 *     in-app Settings toggle (sets push_token = null)
 */
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';
import { upsertUserProfile } from './userProfile';
import { logFunnelEvent } from './funnelEvents';

const EAS_PROJECT_ID = process.env.EXPO_PUBLIC_EAS_PROJECT_ID || 'a694d76a-4616-41b8-a109-a3ab58f666cd';

/**
 * True when running inside Expo Go (not a development build / EAS
 * standalone). expo-notifications removed Android push support from
 * Expo Go in SDK 53 — calling registerForPushNotifications there
 * triggers a noisy warning + always returns null. Skip silently so
 * Expo Go dev sessions are quiet. EAS / dev-client / standalone
 * builds are unaffected.
 */
const IS_EXPO_GO =
  Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

// In-memory cache so repeated init calls don't spam the registration
// API. Cleared on disablePushNotifications().
let cachedToken: string | null = null;
let initialized = false;

/**
 * Configure foreground notification behavior. Called once at app start.
 * Default Expo behavior is "do nothing" when app is foreground — we
 * override to show banner + sound so re-engagement pushes that arrive
 * during an active session still nudge the user.
 */
export function configurePushHandler(): void {
  if (initialized) return;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
  initialized = true;
}

/**
 * Check current permission status without prompting. Used by the
 * Settings toggle to render the correct on/off state.
 */
export async function getPushPermissionStatus(): Promise<'granted' | 'denied' | 'undetermined'> {
  try {
    const { status } = await Notifications.getPermissionsAsync();
    return status as 'granted' | 'denied' | 'undetermined';
  } catch {
    return 'undetermined';
  }
}

/**
 * Request push permission + register Expo Push Token. Idempotent.
 * Safe to call multiple times — caches the token in memory.
 *
 * Returns the token string on success, null on any failure (permission
 * denied, simulator, no network, EAS not configured, etc.).
 *
 * Side effects:
 *   • Persists token to user_profile.push_token via Supabase upsert
 *   • Fires `push_token_registered` funnel event
 *   • Fires `camera_permission_denied`-style event on denial (TODO)
 */
export async function registerForPushNotifications(): Promise<string | null> {
  // Expo Push Tokens only work on physical devices — simulator returns
  // a 400 from the registration endpoint, which spams Sentry with
  // useless errors. Skip silently.
  if (!Device.isDevice) {
    console.log('[push] simulator — skipping push token registration');
    return null;
  }

  // Expo Go (SDK 53+) does NOT support Android push notifications.
  // Calling getExpoPushTokenAsync there logs a misleading "Android
  // Push removed" warning. Skip silently in Expo Go — production EAS
  // builds register normally.
  if (IS_EXPO_GO) {
    if (__DEV__) {
      console.log('[push] Expo Go — push not supported. Use a development build to test.');
    }
    return null;
  }

  if (cachedToken) return cachedToken;

  try {
    // Ask permission. On iOS this shows the system modal once per
    // install (subsequent calls return current status without UI).
    const existing = await Notifications.getPermissionsAsync();
    let finalStatus = existing.status;
    if (existing.status !== 'granted') {
      const ask = await Notifications.requestPermissionsAsync();
      finalStatus = ask.status;
    }

    if (finalStatus !== 'granted') {
      console.log('[push] permission not granted:', finalStatus);
      // Don't fire a denial event here — Settings UI is the right
      // place to surface the system state on next visit.
      return null;
    }

    // Android requires a channel BEFORE getExpoPushToken — otherwise
    // notifications won't display. Use the "default" channel for
    // re-engagement; we can split into 'reminders' / 'updates'
    // channels later for finer user control.
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Luxury Authenticator',
        importance: Notifications.AndroidImportance.DEFAULT,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#D4B98C',  // Champagne Gold accent
      });
    }

    // Get the Expo Push Token. projectId comes from EAS config or env.
    const tokenResponse = await Notifications.getExpoPushTokenAsync({
      projectId: EAS_PROJECT_ID,
    });
    const token = tokenResponse.data;
    cachedToken = token;

    // Persist to Supabase + AsyncStorage. Best-effort — token still
    // returned even if upsert fails so caller can use it for testing.
    void upsertUserProfile({
      // userProfile.ts strips push_token from the generic upsert path
      // for safety. Use a direct Supabase write via a side channel.
    } as any).catch(() => {});

    // Direct push_token sync — bypasses the userProfile TS shape since
    // we intentionally hid that field from the generic upsert API.
    await syncPushTokenToSupabase(token);

    // Funnel event
    logFunnelEvent('push_token_registered', {
      platform: Platform.OS,
    }).catch(() => {});

    console.log('[push] registered token:', token.slice(0, 30) + '...');
    return token;
  } catch (e: any) {
    console.warn('[push] register failed:', e?.message);
    return null;
  }
}

/**
 * Clear the registered push token (e.g. user toggled off in Settings).
 * Server-side cleanup happens via the same upsert path with null value.
 */
export async function disablePushNotifications(): Promise<void> {
  cachedToken = null;
  await syncPushTokenToSupabase(null);
}

// ── Internal: direct Supabase upsert for push_token field ────
// userProfile.ts intentionally omits push_token from the typed
// surface (so generic upserts can't leak the token to PostHog
// payload merges). We write to it via a dedicated REST call.
async function syncPushTokenToSupabase(token: string | null): Promise<void> {
  const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
  const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return;

  // Resolve cohort hash for the row key
  const { ensureCohortHash } = await import('./dataConsent');
  let cohortHash: string;
  try {
    cohortHash = await ensureCohortHash();
  } catch {
    return;
  }

  try {
    await fetch(
      `${SUPABASE_URL}/rest/v1/user_profile?on_conflict=cohort_hash`,
      {
        method: 'POST',
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'resolution=merge-duplicates,return=minimal',
        },
        body: JSON.stringify({
          cohort_hash: cohortHash,
          push_token: token,
        }),
      }
    );
  } catch (e: any) {
    console.warn('[push] supabase token sync failed:', e?.message);
  }
}

/**
 * Listen for incoming notifications (foreground delivery). Use the
 * returned unsubscribe function on screen unmount.
 *
 * For tap responses (user opens a notification from outside the app),
 * use `addNotificationResponseReceivedListener` separately — that one
 * lives in App.tsx so the navigation deep-link can route correctly.
 */
export function addForegroundReceivedListener(
  handler: (event: Notifications.Notification) => void
): () => void {
  const sub = Notifications.addNotificationReceivedListener((notif) => {
    try {
      // Log telemetry — useful for measuring impressions vs opens
      logFunnelEvent('push_received', {
        title: typeof notif.request.content.title === 'string' ? notif.request.content.title.slice(0, 50) : null,
      }).catch(() => {});
    } catch {}
    handler(notif);
  });
  return () => sub.remove();
}
