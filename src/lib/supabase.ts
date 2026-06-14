import { AppState } from 'react-native';
import { createClient } from '@supabase/supabase-js';
import { secureStorage } from './secureStorage';

const PLACEHOLDER_URL = 'https://placeholder-project.supabase.co';
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || PLACEHOLDER_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.placeholder';

// Fail FAST in release builds when the Supabase env wasn't injected. With the
// placeholder fallback the app would otherwise boot "successfully" but every
// auth + scan call silently fails against a non-existent project — a
// dead-on-arrival launch that still passes a smoke test. A loud startup error
// makes a misconfigured production build impossible to miss in QA. In __DEV__
// we tolerate the placeholder so the UI can run without a backend.
if (
  !__DEV__ &&
  (supabaseUrl === PLACEHOLDER_URL || supabaseAnonKey.endsWith('.placeholder'))
) {
  throw new Error(
    '[supabase] EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY are not set in ' +
      'this build. Add them to the EAS "production" environment before shipping.'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // Persist the session in the device Keychain/Keystore (see secureStorage)
    // — bearer tokens must not sit in plaintext AsyncStorage. autoRefreshToken
    // keeps the access token fresh.
    storage: secureStorage,
    autoRefreshToken: true,
    persistSession: true,
    // React Native has no URL bar — OAuth redirects are handled manually
    // (we parse tokens out of the deep-link URL and call setSession), so
    // there's nothing for the SDK to detect in a window.location.
    detectSessionInUrl: false,
  },
});

// Supabase recommends gating token auto-refresh on app foreground state in
// React Native: refresh while active, pause in the background to avoid
// spurious network churn. Registered once at module load.
AppState.addEventListener('change', (state) => {
  if (state === 'active') {
    supabase.auth.startAutoRefresh();
  } else {
    supabase.auth.stopAutoRefresh();
  }
});

export const USE_EDGE_FUNCTIONS = process.env.EXPO_PUBLIC_USE_EDGE_FUNCTIONS === 'true';
