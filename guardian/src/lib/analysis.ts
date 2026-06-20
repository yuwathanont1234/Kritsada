import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import type { AnalysisRequest, AnalysisResponse, RecentCheck } from './types';

const FUNCTION_NAME = 'guardian-analyze';
const RECENT_KEY = '@guardian/recent_checks';
const MAX_RECENT = 20;

/** Call the guardian-analyze Edge Function. Passes the session token (if any)
 *  so the function can resolve user_id for logging + family alerts. */
export async function analyzeContent(request: AnalysisRequest): Promise<AnalysisResponse> {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;

  const headers: Record<string, string> = {};
  if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

  const { data, error } = await supabase.functions.invoke(FUNCTION_NAME, {
    body: request,
    headers,
  });

  if (error) throw new Error(error.message || 'Analysis failed');
  if (data && (data as { error?: string }).error) {
    throw new Error((data as { error: string }).error);
  }
  return data as AnalysisResponse;
}

// ── Recent checks (local-only history) ──────────────────────────────────
export async function saveRecentCheck(check: RecentCheck): Promise<void> {
  try {
    const existing = await getRecentChecks();
    const updated = [check, ...existing].slice(0, MAX_RECENT);
    await AsyncStorage.setItem(RECENT_KEY, JSON.stringify(updated));
  } catch {
    // non-fatal
  }
}

export async function getRecentChecks(): Promise<RecentCheck[]> {
  try {
    const raw = await AsyncStorage.getItem(RECENT_KEY);
    return raw ? (JSON.parse(raw) as RecentCheck[]) : [];
  } catch {
    return [];
  }
}

export async function deleteCheck(id: string): Promise<void> {
  try {
    const existing = await getRecentChecks();
    await AsyncStorage.setItem(RECENT_KEY, JSON.stringify(existing.filter((c) => c.id !== id)));
  } catch {}
}

export async function clearHistory(): Promise<void> {
  try {
    await AsyncStorage.removeItem(RECENT_KEY);
  } catch {}
}
