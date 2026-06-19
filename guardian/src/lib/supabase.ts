import { AppState } from 'react-native';
import { createClient } from '@supabase/supabase-js';
import { secureStorage } from './secureStorage';

const PLACEHOLDER_URL = 'https://placeholder-project.supabase.co';
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || PLACEHOLDER_URL;
const supabaseAnonKey =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.placeholder';

// Fail fast in release builds when env vars are missing — same hardening as the
// watch app, so a misconfigured production build crashes loudly instead of
// silently talking to a placeholder project.
if (
  !__DEV__ &&
  (supabaseUrl === PLACEHOLDER_URL || supabaseAnonKey.endsWith('.placeholder'))
) {
  throw new Error(
    '[guardian] EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY are not ' +
      'set in this build. Add them to the EAS production environment before shipping.'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: secureStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// Pause token refresh while backgrounded to avoid needless network churn.
AppState.addEventListener('change', (state) => {
  if (state === 'active') supabase.auth.startAutoRefresh();
  else supabase.auth.stopAutoRefresh();
});
