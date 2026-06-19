import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

/**
 * secureStorage — a Supabase auth storage adapter backed by the device
 * Keychain (iOS) / Keystore (Android) instead of plaintext AsyncStorage.
 *
 * The Supabase session (access + refresh JWT) is a bearer credential; storing
 * it hardware-encrypted keeps it out of recoverable plaintext on a rooted /
 * jailbroken or backup-extracted device.
 *
 * CHUNKING: SecureStore caps each value at ~2 KB; a Supabase session can exceed
 * that, so values are split across `${key}__0..n-1` with a `${key}__n` counter.
 * Values within one chunk are stored under the bare key (backward-compatible).
 *
 * WEB: SecureStore is native-only; on web we fall back to AsyncStorage.
 */
const CHUNK_SIZE = 1800;
const isWeb = Platform.OS === 'web';

async function getChunkCount(key: string): Promise<number> {
  const meta = await SecureStore.getItemAsync(`${key}__n`);
  return meta ? parseInt(meta, 10) || 0 : 0;
}

export const secureStorage = {
  getItem: async (key: string): Promise<string | null> => {
    if (isWeb) return AsyncStorage.getItem(key);
    const n = await getChunkCount(key);
    if (n === 0) return SecureStore.getItemAsync(key);
    let out = '';
    for (let i = 0; i < n; i++) {
      const part = await SecureStore.getItemAsync(`${key}__${i}`);
      if (part == null) return null;
      out += part;
    }
    return out;
  },

  setItem: async (key: string, value: string): Promise<void> => {
    if (isWeb) return AsyncStorage.setItem(key, value);
    await secureStorage.removeItem(key);
    if (value.length <= CHUNK_SIZE) {
      await SecureStore.setItemAsync(key, value);
      return;
    }
    const n = Math.ceil(value.length / CHUNK_SIZE);
    for (let i = 0; i < n; i++) {
      await SecureStore.setItemAsync(`${key}__${i}`, value.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE));
    }
    await SecureStore.setItemAsync(`${key}__n`, String(n));
  },

  removeItem: async (key: string): Promise<void> => {
    if (isWeb) return AsyncStorage.removeItem(key);
    const n = await getChunkCount(key);
    for (let i = 0; i < n; i++) {
      try { await SecureStore.deleteItemAsync(`${key}__${i}`); } catch { /* ignore missing chunks */ }
    }
    if (n > 0) { try { await SecureStore.deleteItemAsync(`${key}__n`); } catch { /* ignore */ } }
    try { await SecureStore.deleteItemAsync(key); } catch { /* ignore */ }
  },
};
