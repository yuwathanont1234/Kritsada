/**
 * Sentry crash & error reporting.
 *
 * Initialized once at app start (App.tsx). The DSN is read from
 * EXPO_PUBLIC_SENTRY_DSN — set this in `.env` AND in the EAS build
 * profile so production builds get it. Without a DSN, init() is a
 * no-op and the rest of the file's helpers are safe to call (they
 * just don't do anything).
 *
 * SETUP CHECKLIST (one-time, user action required):
 *   1. Create Sentry account at https://sentry.io (free tier covers
 *      5,000 errors/month — plenty for 1K DAU).
 *   2. Create a new project → React Native.
 *   3. Copy the DSN (looks like https://abc123@oXXX.ingest.sentry.io/123).
 *   4. Add to .env (LOCAL):
 *        EXPO_PUBLIC_SENTRY_DSN=https://abc123@oXXX.ingest.sentry.io/123
 *   5. Add to EAS secret (PRODUCTION):
 *        eas secret:create --scope project --name EXPO_PUBLIC_SENTRY_DSN --value "https://..."
 *   6. Rebuild + redeploy: `eas build --platform ios` / android.
 *
 * The Sentry config plugin in app.json handles native linking
 * automatically — no Xcode/Gradle edits needed for Expo managed.
 */
import * as Sentry from '@sentry/react-native';

let initialized = false;

export function initSentry(): void {
  if (initialized) return;

  const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
  if (!dsn) {
    if (__DEV__) {
      console.log('[sentry] EXPO_PUBLIC_SENTRY_DSN not set — Sentry disabled. See src/lib/sentry.ts for setup.');
    }
    return;
  }

  Sentry.init({
    dsn,
    // Lower volume in development to avoid burning the free-tier quota
    // on simulator hot-reload crashes. Production captures everything.
    enabled: !__DEV__,
    // Trace 10% of transactions in production — enough to spot slow scan
    // paths without overwhelming the free tier (10K transactions/month).
    tracesSampleRate: __DEV__ ? 1.0 : 0.1,
    // Release identification helps Sentry correlate errors to specific
    // app versions. EAS sets this automatically when integrated, but
    // we surface the version from package.json as a fallback.
    release: process.env.EXPO_PUBLIC_APP_VERSION || 'unknown',
    // Strip PII from the breadcrumbs trail. Watch images / user weight
    // entries / scan content should never leave the device.
    sendDefaultPii: false,
    beforeSend(event) {
      // Last-line scrub — any request URLs in the breadcrumbs that
      // contain base64 image data get truncated so we don't ship
      // a user's photo to Sentry by accident.
      if (event.breadcrumbs) {
        event.breadcrumbs = event.breadcrumbs.map((bc) => {
          if (bc.data && typeof bc.data.url === 'string' && bc.data.url.includes('base64')) {
            bc.data.url = '[redacted base64 url]';
          }
          return bc;
        });
      }
      return event;
    },
  });

  initialized = true;
  if (__DEV__) console.log('[sentry] initialized (dev mode — sending disabled)');
}

/**
 * Add a scan-pipeline breadcrumb. Used by aiRouter to mark phase
 * transitions so a crash report includes the last ~20 phases the
 * scan went through (Sentry default breadcrumb buffer).
 */
export function scanBreadcrumb(phase: string, data?: Record<string, any>): void {
  if (!initialized) return;
  try {
    Sentry.addBreadcrumb({
      category: 'scan',
      message: phase,
      level: 'info',
      data,
    });
  } catch {
    /* ignore — breadcrumbs are best-effort */
  }
}

/**
 * Capture a non-fatal error with scan context. Use for caught exceptions
 * that we recover from but want telemetry on (e.g. RAG embed timeout —
 * not a crash, but we want to track the rate at scale).
 */
export function captureScanError(err: any, context?: Record<string, any>): void {
  if (!initialized) return;
  try {
    Sentry.withScope((scope) => {
      if (context) {
        Object.entries(context).forEach(([k, v]) => scope.setExtra(k, v));
      }
      scope.setTag('domain', 'scan');
      Sentry.captureException(err);
    });
  } catch {
    /* ignore */
  }
}

/**
 * Re-export Sentry's ErrorBoundary so App.tsx can wrap the tree.
 * Renders a fallback when an uncaught React error explodes, prevents
 * the whole app going white-screen.
 */
export const ErrorBoundary = Sentry.ErrorBoundary;
