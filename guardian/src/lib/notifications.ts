import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { supabase } from './supabase';

/**
 * Request notification permission, fetch the Expo push token, and persist it to
 * guardian_push_tokens for the signed-in user. The guardian-analyze Edge
 * Function reads these tokens to dispatch a RED-level family alert.
 *
 * Returns the token on success, or null if permission was denied / unavailable
 * (e.g. simulator) — callers should treat null as "push not set up" and never
 * block on it.
 */
export async function registerForPush(): Promise<string | null> {
  try {
    const { status: existing } = await Notifications.getPermissionsAsync();
    let status = existing;
    if (existing !== 'granted') {
      const req = await Notifications.requestPermissionsAsync();
      status = req.status;
    }
    if (status !== 'granted') return null;

    const tokenData = await Notifications.getExpoPushTokenAsync();
    const token = tokenData?.data;
    if (!token) return null;

    const { data: sess } = await supabase.auth.getSession();
    const uid = sess.session?.user?.id;
    if (uid) {
      await supabase.from('guardian_push_tokens').upsert(
        {
          user_id: uid,
          expo_token: token,
          platform: Platform.OS,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,expo_token' }
      );
    }
    return token;
  } catch {
    return null;
  }
}
