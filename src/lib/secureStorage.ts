import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

/**
 * secureStorage — a Supabase auth storage adapter backed by the device
 * Keychain (iOS) / Keystore (Android) instead of plaintext AsyncStorage.
 *
 * WHY: the Supabase session (access + refresh JWT) is bearer credentials. In
 * AsyncStorage it sits in a plaintext SQLite/file that's recoverable via device
 * backup extraction or on a rooted/jailbroken device — below bar for an app
 * with PII + paid entitlements. SecureStore is hardware-backed encrypted.
 *
 * CHUNKING: SecureStore caps each value at ~2 KB; a Supabase session can exceed
 * that, so we split into chunks across keys (`${key}__0..n-1` + `${key}__n`).
 * Values ≤ one chunk are stored under the bare key (also the legacy/unchunked
 * read path), so reads stay backward-compatible.
 *
 * WEB: SecureStore is native-only; on web (dev/Expo-web) we fall back to
 * AsyncStorage. Production ships native.
 *
 * Note: existing logged-in dev sessions live in AsyncStorage and won't migrate
 * — those users simply re-authenticate once. The app is pre-launch, so there's
 * no production migration to worry about.
 */

const CHUNK_SIZE = 1800; // headroom under SecureStore's ~2 KB ceiling
const isWeb = Platform.OS === 'web';

async function getChunkCount(key: string): Promise<number> {
  const meta = await SecureStore.getItemAsync(`${key}__n`);
  return meta ? parseInt(meta, 10) || 0 : 0;
}

export const secureStorage = {
  getItem: async (key: string): Promise<string | null> => {
    if (isWeb) return AsyncStorage.getItem(key);
    const n = await getChunkCount(key);
    if (n === 0) {
      // No chunk metadata → value is either absent or stored unchunked.
      return SecureStore.getItemAsync(key);
    }
    let out = '';
    for (let i = 0; i < n; i++) {
      const part = await SecureStore.getItemAsync(`${key}__${i}`);
      if (part == null) return null; // a missing chunk = corrupted → treat as absent
      out += part;
    }
    return out;
  },

  setItem: async (key: string, value: string): Promise<void> => {
    if (isWeb) return AsyncStorage.setItem(key, value);
    // Clear any prior representation (chunked or bare) before writing.
    await secureStorage.removeItem(key);
    if (value.length <= CHUNK_SIZE) {
      await SecureStore.setItemAsync(key, value);
      return;
    }
    const n = Math.ceil(value.length / CHUNK_SIZE);
    for (let i = 0; i < n; i++) {
      await SecureStore.setItemAsync(
        `${key}__${i}`,
        value.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE)
      );
    }
    await SecureStore.setItemAsync(`${key}__n`, String(n));
  },

  removeItem: async (key: string): Promise<void> => {
    if (isWeb) return AsyncStorage.removeItem(key);
    const n = await getChunkCount(key);
    for (let i = 0; i < n; i++) {
      await SecureStore.deleteItemAsync(`${key}__${i}`);
    }
    if (n > 0) await SecureStore.deleteItemAsync(`${key}__n`);
    await SecureStore.deleteItemAsync(key); // also clear any bare/legacy value
  },
};
