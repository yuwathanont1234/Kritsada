import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://placeholder-project.supabase.co';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.placeholder';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // Persist the auth session in AsyncStorage so the user stays signed in
    // across app restarts. autoRefreshToken keeps the access token fresh.
    storage: AsyncStorage,
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
