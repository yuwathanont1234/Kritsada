import AsyncStorage from '@react-native-async-storage/async-storage';

const CACHE_KEY = '@luxuryauthenticator/exchange_rate_usd_thb';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

let memoryRate: number | null = null;

interface CachePayload {
  rate: number;
  timestamp: number;
}

export async function fetchLiveExchangeRate(): Promise<number | null> {
  try {
    const response = await fetch('https://open.er-api.com/v6/latest/USD');
    if (response.ok) {
      const data = await response.json();
      if (data && data.rates && typeof data.rates.THB === 'number') {
        const rate = data.rates.THB;
        memoryRate = rate;
        await AsyncStorage.setItem(
          CACHE_KEY,
          JSON.stringify({
            rate,
            timestamp: Date.now(),
          })
        );
        return rate;
      }
    }
  } catch (error) {
    console.warn(
      '[Currency] Failed to fetch live exchange rate, attempting cache fallback',
      error
    );
  }

  // Fallback to cache (even if expired) if request fails
  try {
    const cached = await AsyncStorage.getItem(CACHE_KEY);
    if (cached) {
      const parsed: CachePayload = JSON.parse(cached);
      if (parsed && typeof parsed.rate === 'number') {
        memoryRate = parsed.rate;
        console.warn('[Currency] Live fetch failed. Falling back to expired cached exchange rate:', parsed.rate);
        return parsed.rate;
      }
    }
  } catch (err) {
    console.warn('[Currency] Error reading cached exchange rate in fetch fallback:', err);
  }

  memoryRate = null;
  return null;
}

export async function getExchangeRate(): Promise<number | null> {
  if (memoryRate !== null) {
    return memoryRate;
  }

  try {
    const cached = await AsyncStorage.getItem(CACHE_KEY);
    if (cached) {
      const parsed: CachePayload = JSON.parse(cached);
      if (parsed && typeof parsed.rate === 'number') {
        const age = Date.now() - parsed.timestamp;
        if (age < CACHE_TTL_MS) {
          memoryRate = parsed.rate;
          return parsed.rate;
        }
        console.warn('[Currency] Cached exchange rate is expired (older than 24h). Triggering refresh...');
      }
    }
  } catch (err) {
    console.warn('[Currency] Error reading cached exchange rate in getExchangeRate:', err);
  }

  // Expired or no cache. Fetch fresh rate.
  const freshRate = await fetchLiveExchangeRate();
  return freshRate;
}
