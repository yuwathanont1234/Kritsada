import AsyncStorage from '@react-native-async-storage/async-storage';

const CACHE_KEY = '@luxuryauthenticator/exchange_rate_usd_thb';
const DEFAULT_RATE = 36.5;

let memoryRate: number | null = null;

export async function fetchLiveExchangeRate(): Promise<number> {
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
      '[Currency] Failed to fetch live exchange rate, using cached value if available',
      error
    );
  }

  // Fallback to cache if request fails
  try {
    const cached = await AsyncStorage.getItem(CACHE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed && typeof parsed.rate === 'number') {
        memoryRate = parsed.rate;
        return parsed.rate;
      }
    }
  } catch {}

  memoryRate = DEFAULT_RATE;
  return DEFAULT_RATE;
}

export async function getExchangeRate(): Promise<number> {
  if (memoryRate !== null) {
    return memoryRate;
  }
  // Try loading from AsyncStorage cache first for instant sync response
  try {
    const cached = await AsyncStorage.getItem(CACHE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed && typeof parsed.rate === 'number') {
        memoryRate = parsed.rate;
        return parsed.rate;
      }
    }
  } catch {}

  memoryRate = DEFAULT_RATE;
  return DEFAULT_RATE;
}
