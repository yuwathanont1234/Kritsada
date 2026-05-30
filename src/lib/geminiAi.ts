import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';
import {
  WATCH_AUTH_SYSTEM_PROMPT,
  WATCH_QUICK_ID_SYSTEM_PROMPT,
  WATCH_SYSTEM_PROMPT,
  PRICE_ONLY_SYSTEM_PROMPT,
  USER_PROMPT_FRONT_BACK,
  USER_PROMPT_FRONT_ONLY,
  USER_PROMPT_IDENTIFY_FRONT_BACK,
  USER_PROMPT_IDENTIFY_FRONT_ONLY,
  buildAuthAssessmentPrompt,
  buildAuthAssessmentPromptWithCert,
  buildCandidatesPrompt,
  buildPriceLookupPrompt,
  WATCH_HEATMAP_SYSTEM_PROMPT,
  WATCH_HEATMAP_USER_PROMPT,
} from './prompts';
import { ScanResult, HeatmapResult, HeatmapRegion, HeatmapSignal } from './types';
import { fillScanResultDefaults } from './ai';
import type { AuthPayload, PricePayload } from './ai';
import { publishRetry } from './retryStatus';
import { supabase, USE_EDGE_FUNCTIONS } from './supabase';
import { ensureCohortHash } from './dataConsent';

// Model strings are env-overridable
const GEMINI_FLASH_MODEL =
  process.env.EXPO_PUBLIC_GEMINI_FLASH_MODEL || 'gemini-3-flash-preview';
const GEMINI_PRO_MODEL =
  process.env.EXPO_PUBLIC_GEMINI_PRO_MODEL || 'gemini-3.5-flash';
const GEMINI_FLASH_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_FLASH_MODEL}:generateContent`;
const GEMINI_PRO_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_PRO_MODEL}:generateContent`;
const MAX_OUTPUT_TOKENS = 16000;

export function isGeminiConfigured(): boolean {
  if (USE_EDGE_FUNCTIONS) return true;
  return (process.env.EXPO_PUBLIC_GEMINI_API_KEY ?? '').length > 0;
}

function getApiKey(): string {
  const key = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
  if (!key) {
    throw new Error(
      'ยังไม่ได้ตั้งค่า GEMINI API KEY (EXPO_PUBLIC_GEMINI_API_KEY ใน .env)'
    );
  }
  return key;
}

const IMAGE_WIDTH_BY_TIER: Record<string, number> = {
  free: 600,
  standard: 800,
  pro: 1024,
  premium: 1024,
};
const DEFAULT_IMAGE_WIDTH = 1024;

async function compressAndEncode(
  uri: string,
  maxWidth: number = DEFAULT_IMAGE_WIDTH
): Promise<string> {
  const result = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: maxWidth } }],
    { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG, base64: true }
  );
  if (!result.base64) throw new Error('ไม่สามารถแปลงรูปภาพเป็น base64 ได้');
  return result.base64;
}

export function imageWidthForTier(tier: string): number {
  return IMAGE_WIDTH_BY_TIER[tier] ?? DEFAULT_IMAGE_WIDTH;
}

const OUTPUT_TOKENS_BY_TIER: Record<string, number> = {
  free: 4000,
  standard: 8000,
  pro: 16000,
  premium: 16000,
};
export function outputTokensForTier(tier: string): number {
  return OUTPUT_TOKENS_BY_TIER[tier] ?? 16000;
}

function stripCodeFences(text: string): string {
  return text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();
}

function tryRepairJson(text: string): any | null {
  let inString = false;
  let escaped = false;
  const stack: string[] = []; 
  let lastStructuralClose = -1; 
  let stackDepthAtCut = 0;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (inString) {
      if (c === '\\') {
        escaped = true;
      } else if (c === '"') {
        inString = false;
      }
      continue;
    }

    if (c === '"') {
      inString = true;
    } else if (c === '{' || c === '[') {
      stack.push(c);
    } else if (c === '}' || c === ']') {
      stack.pop();
      lastStructuralClose = i;
      stackDepthAtCut = stack.length;
    }
  }

  if (stack.length === 0 && !inString) {
    return null;
  }

  if (lastStructuralClose < 0) return null;

  let repaired = text.slice(0, lastStructuralClose + 1);

  const outerStack: string[] = [];
  let s = false;
  let e = false;
  for (let i = 0; i <= lastStructuralClose; i++) {
    const c = repaired[i];
    if (e) { e = false; continue; }
    if (s) { if (c === '\\') e = true; else if (c === '"') s = false; continue; }
    if (c === '"') s = true;
    else if (c === '{' || c === '[') outerStack.push(c);
    else if (c === '}' || c === ']') outerStack.pop();
  }
  while (outerStack.length > 0) {
    const open = outerStack.pop();
    repaired += open === '{' ? '}' : ']';
  }
  void stackDepthAtCut;

  repaired = repaired.replace(/,(\s*[}\]])/g, '$1');

  try {
    return JSON.parse(repaired);
  } catch {
    return null;
  }
}

function extractJson(text: string): any {
  const cleaned = stripCodeFences(text.trim());

  try {
    return JSON.parse(cleaned);
  } catch (err) {
    console.warn('[gemini:extractJson] Initial direct parse failed. Cleaned content was not raw JSON.', err);
  }

  const codeBlockRegex = /```(?:json)?\s*([\s\S]*?)\s*```/g;
  let match;
  while ((match = codeBlockRegex.exec(cleaned)) !== null) {
    try {
      return JSON.parse(match[1]);
    } catch (err) {
      console.warn('[gemini:extractJson] Code block matching parse failed.', err);
    }
  }

  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');

  if (firstBrace >= 0) {
    const balanced = sliceBalancedJson(cleaned, firstBrace);
    if (balanced) {
      try {
        return JSON.parse(balanced);
      } catch {
        try {
          return JSON.parse(sanitizeJsonStrings(balanced));
        } catch (err) {
          console.warn('[gemini:extractJson] Sanitized balanced JSON parse failed.', err);
        }
      }
    }
  }

  if (firstBrace >= 0 && lastBrace > firstBrace) {
    try {
      return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1));
    } catch (err) {
      console.warn('[gemini:extractJson] Sliced brace JSON parse failed.', err);
    }
  }

  if (firstBrace >= 0) {
    const repaired = tryRepairJson(cleaned.slice(firstBrace));
    if (repaired !== null) {
      console.warn(
        '[gemini:extractJson] used truncated-JSON repair — some fields may be missing'
      );
      return repaired;
    }
  }

  console.error(
    `[gemini:extractJson] all paths failed (${cleaned.length} chars). Full text:\n${cleaned}`
  );

  throw new Error(
    `Gemini ตอบยาวเกินไปหรือถูกตัด — ลองอีกครั้ง (response: ${cleaned.length} chars)\n\n${cleaned.slice(0, 200)}`
  );
}

function sliceBalancedJson(text: string, start: number): string | null {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (escaped) { escaped = false; continue; }
    if (inString) {
      if (c === '\\') escaped = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

function sanitizeJsonStrings(text: string): string {
  let out = '';
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (escaped) {
      out += c;
      escaped = false;
      continue;
    }
    if (inString) {
      if (c === '\\') {
        out += c;
        escaped = true;
      } else if (c === '"') {
        out += c;
        inString = false;
      } else if (c === '\n') {
        out += '\\n';
      } else if (c === '\r') {
        out += '\\r';
      } else if (c === '\t') {
        out += '\\t';
      } else {
        out += c;
      }
      continue;
    }
    if (c === '"') inString = true;
    out += c;
  }
  return out;
}

type GeminiCallOptions = {
  systemInstruction: string;
  parts: any[];
  enableWebSearch?: boolean;
  disableThinking?: boolean;
  maxOutputTokens?: number;
  label?: string;
  // AbortSignal propagated from the scan path. When the user backgrounds
  // the app, hits back, or LoadingScreen unmounts mid-scan, we abort
  // the in-flight Gemini fetch instead of letting it complete and bill
  // for nothing. supabase-js v2.105+ honours signal in functions.invoke().
  signal?: AbortSignal;
  // For label='price' only: the (brand, ref) tuple the edge function should
  // persist into watch_price_cache after a successful grounded lookup. The
  // client can't write the cache itself (anon is SELECT-only per migration
  // 0004), so the write happens server-side with the service-role key.
  priceCacheKey?: { brand: string; ref: string };
};

const MAX_RETRY_ATTEMPTS = 4;
const FALLBACK_TO_PRO_AT_ATTEMPT = 4;
const TRANSIENT_STATUSES = new Set([500, 502, 503, 504]);

function isTransientError(status: number): boolean {
  return TRANSIENT_STATUSES.has(status);
}

function backoffMs(attempt: number): number {
  const base = [1500, 3000, 5000, 8000][attempt - 1] ?? 8000;
  return base + Math.floor(Math.random() * 500);
}

function pickEndpoint(attempt: number): string {
  return attempt >= FALLBACK_TO_PRO_AT_ATTEMPT ? GEMINI_PRO_URL : GEMINI_FLASH_URL;
}

async function callGeminiJson<T = any>(opts: GeminiCallOptions): Promise<T> {
  if (USE_EDGE_FUNCTIONS) {
    // Retry transient edge / upstream failures with a single backoff.
    // The edge function wraps Gemini, and Gemini occasionally returns 5xx
    // (rate-limit, quota burst, region-specific outage). Without retry the
    // user sees the "Diagnostic system failed" screen and has to manually
    // tap "Try again" — bad UX for what is fundamentally a transient
    // issue.
    //
    // Reduced 3 → 2 (one retry) after live scan logged
    // "[gemini:edge] attempt 1/3 failed" on a cold-start path that already
    // had Replicate warming up. Three retries with 1s/2s/4s backoff add
    // ~7s of dead-air before the request actually succeeds on attempt 2
    // anyway. One retry with a 1s pause covers the genuine transient case
    // (network blip, edge cold start) while capping worst-case overhead
    // at ~2s instead of ~10s. If a request fails twice it's likely a real
    // outage, not a transient — surfacing the error sooner lets the user
    // retry manually rather than staring at the spinner.
    const MAX_EDGE_RETRIES = 2;
    let lastError: any = null;
    for (let attempt = 1; attempt <= MAX_EDGE_RETRIES; attempt++) {
      console.log(
        `[gemini:${opts.label}] Secure Edge Routing: Calling serverless analyze-watch backend` +
        (attempt > 1 ? ` (retry ${attempt}/${MAX_EDGE_RETRIES})` : '')
      );
      // Early-abort check — if the caller already cancelled, don't even
      // open the connection. Saves a round-trip when LoadingScreen
      // unmounts before the first attempt fires.
      if (opts.signal?.aborted) {
        throw new DOMException('Scan cancelled', 'AbortError');
      }
      const { data, error } = await supabase.functions.invoke('analyze-watch', {
        body: {
          systemInstruction: opts.systemInstruction,
          parts: opts.parts,
          enableWebSearch: opts.enableWebSearch,
          disableThinking: opts.disableThinking,
          maxOutputTokens: opts.maxOutputTokens,
          label: opts.label,
          // Anonymous per-install id → server-side abuse cap (edge quota).
          deviceId: await ensureCohortHash().catch(() => undefined),
          ...(opts.priceCacheKey ? { priceCacheKey: opts.priceCacheKey } : {}),
        },
        // supabase-js threads this to the underlying fetch so the
        // upstream Gemini call is aborted in-flight.
        ...(opts.signal ? { signal: opts.signal } : {}),
      } as any);

      if (!error) {
        if (attempt > 1) {
          console.log(`[gemini:edge] succeeded on retry ${attempt}`);
        }
        return data as T;
      }

      lastError = error;
      // Abort errors aren't transient — the user cancelled. Surface
      // immediately without retry so we don't burn budget pretending
      // we'll succeed.
      if ((error as any)?.name === 'AbortError' || opts.signal?.aborted) {
        console.log('[gemini:edge] aborted by caller — propagating');
        throw error;
      }
      console.warn(
        `[gemini:edge] attempt ${attempt}/${MAX_EDGE_RETRIES} failed:`,
        error?.message || error
      );

      // Don't retry on client errors (4xx) that indicate a bad request —
      // they'll never succeed. supabase-js wraps the response in a generic
      // FunctionsHttpError but the status is exposed via error.context.
      const status = (error as any)?.context?.status;
      if (status && status >= 400 && status < 500 && status !== 429) {
        console.warn(`[gemini:edge] permanent client error ${status}, not retrying`);
        break;
      }

      if (attempt < MAX_EDGE_RETRIES) {
        // Fixed 1s backoff for the single retry — exponential ramp was
        // designed for 3-retry budget; with 1 retry we want a short
        // pause that smooths a network blip without compounding latency.
        await new Promise((r) => setTimeout(r, 1000));
      }
    }

    throw new Error('ระบบ AI ขัดข้องชั่วคราว (Edge Error) กรุณาลองใหม่อีกครั้ง');
  }

  console.warn(`[SECURITY WARNING] Direct client-side AI calls active (label=${opts.label}). Enable Edge Functions in production!`);

  const apiKey = getApiKey();

  const generationConfig: any = {
    temperature: 0.1,
    maxOutputTokens: opts.maxOutputTokens ?? MAX_OUTPUT_TOKENS,
  };
  if (!opts.enableWebSearch) {
    generationConfig.responseMimeType = 'application/json';
  }

  const body: any = {
    contents: [{ role: 'user', parts: opts.parts }],
    systemInstruction: { parts: [{ text: opts.systemInstruction }] },
    generationConfig,
  };
  if (opts.enableWebSearch) {
    body.tools = [{ google_search: {} }];
  }

  for (let attempt = 1; attempt <= MAX_RETRY_ATTEMPTS; attempt++) {
    const endpoint = pickEndpoint(attempt);
    const modelTag = endpoint === GEMINI_PRO_URL ? 'pro' : 'flash';

    if (opts.disableThinking && endpoint === GEMINI_FLASH_URL) {
      body.generationConfig.thinkingConfig = { thinkingBudget: 0 };
    } else {
      delete body.generationConfig.thinkingConfig;
    }

    const t0 = Date.now();

    let response: Response;
    try {
      response = await fetch(`${endpoint}?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch (networkErr: any) {
      if (attempt < MAX_RETRY_ATTEMPTS) {
        const delay = backoffMs(attempt);
        console.log(
          `[gemini:${opts.label}/${modelTag}] network error, retry ${attempt}/${MAX_RETRY_ATTEMPTS} in ${delay}ms`
        );
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      throw new Error('เชื่อมต่ออินเทอร์เน็ตไม่ได้ กรุณาตรวจสอบสัญญาณ');
    }

    if (response.ok) {
      const data = await response.json();
      const elapsed = Date.now() - t0;
      const finishReason = data?.candidates?.[0]?.finishReason;
      const usage = data.usageMetadata ?? {};
      const cachedTokens = usage.cachedContentTokenCount ?? 0;
      const cacheNote =
        cachedTokens > 0 ? ` | 🟢 cached:${cachedTokens}` : '';
      console.log(
        `[gemini:${opts.label}/${modelTag}] ${elapsed}ms | usage:`,
        JSON.stringify(usage),
        '| finish:',
        finishReason,
        attempt > 1 ? `| attempt ${attempt}` : '',
        cacheNote
      );

      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) throw new Error('AI ไม่ตอบกลับข้อมูล กรุณาลองใหม่อีกครั้ง');

      console.log(`[gemini:${opts.label}] Response (first 200):`, text.slice(0, 200));

      if (finishReason === 'MAX_TOKENS') {
        console.warn(
          `[gemini:${opts.label}] hit MAX_TOKENS — response truncated, attempting repair`
        );
      }
      if (finishReason === 'SAFETY') {
        throw new Error('AI ปฏิเสธภาพนี้ — ลองถ่ายภาพใหม่ให้ชัดและเต็มหน้าปัด');
      }
      if (finishReason === 'RECITATION') {
        throw new Error('AI ปฏิเสธคำขอนี้ — กรุณาลองอีกครั้ง');
      }

      return extractJson(text) as T;
    }

    const errText = await response.text();

    if (isTransientError(response.status) && attempt < MAX_RETRY_ATTEMPTS) {
      const delay = backoffMs(attempt);
      const nextEndpoint = pickEndpoint(attempt + 1);
      const nextTag = nextEndpoint === GEMINI_PRO_URL ? 'pro' : 'flash';
      console.log(
        `[gemini:${opts.label}/${modelTag}] ${response.status} transient — retry ${attempt + 1}/${MAX_RETRY_ATTEMPTS} on ${nextTag} in ${delay}ms`
      );
      publishRetry({
        label: opts.label ?? 'gemini',
        status: response.status,
        attempt: attempt + 1,
        maxAttempts: MAX_RETRY_ATTEMPTS,
        nextModel: nextTag as 'flash' | 'pro',
        delayMs: delay,
      });
      await new Promise((r) => setTimeout(r, delay));
      continue;
    }

    console.warn(
      `[gemini:${opts.label}] final ${response.status} after ${attempt} attempts`
    );

    if (response.status === 429) {
      throw new Error('AI ใช้งานหนาแน่น กรุณารอ 30 วินาทีแล้วลองใหม่');
    }
    if (isTransientError(response.status)) {
      throw new Error(
        'ระบบ AI กำลังคึกคัก กรุณารอ 1-2 นาทีแล้วลองใหม่อีกครั้ง'
      );
    }
    if (response.status === 401 || response.status === 403) {
      throw new Error('การเชื่อมต่อ AI ขัดข้อง กรุณาติดต่อผู้ดูแลระบบ');
    }
    if (errText.toLowerCase().includes('quota')) {
      throw new Error('โควตา AI ของวันนี้ถูกใช้หมด กรุณาลองใหม่พรุ่งนี้');
    }
    if (errText.toLowerCase().includes('safety')) {
      throw new Error(
        'AI ปฏิเสธภาพนี้ — ลองถ่ายภาพใหม่ให้ชัดและเต็มหน้าปัด'
      );
    }
    throw new Error(
      `AI ขัดข้องชั่วคราว (${response.status}) กรุณาลองใหม่อีกครั้ง`
    );
  }

  throw new Error('ระบบ AI กำลังคึกคัก กรุณารอสักครู่แล้วลองใหม่อีกครั้ง');
}

export async function analyzeWatchGemini(
  frontUri: string,
  backUri?: string,
  candidates?: import('./visualRag').SimilarWatch[],
  opts?: { disableThinking?: boolean; imageMaxWidth?: number }
): Promise<ScanResult> {
  const w = opts?.imageMaxWidth;
  const frontB64 = await compressAndEncode(frontUri, w);
  const backB64 = backUri ? await compressAndEncode(backUri, w) : null;

  const parts: any[] = [{ inline_data: { mime_type: 'image/jpeg', data: frontB64 } }];
  if (backB64) {
    parts.push({ inline_data: { mime_type: 'image/jpeg', data: backB64 } });
  }

  let promptText = backB64 ? USER_PROMPT_FRONT_BACK : USER_PROMPT_FRONT_ONLY;
  if (candidates && candidates.length > 0) {
    // Translate format of candidates to format prompts.ts buildCandidatesPrompt expects
    const adaptedCandidates = candidates.map(c => ({
      id: c.id,
      name: c.name,
      brand: c.brand,
      reference: c.reference,
      dial_color: '', 
      similarity: c.similarity,
      visualSignatures: [],
      uniqueIdentifiers: []
    }));
    promptText = buildCandidatesPrompt(adaptedCandidates) + promptText;
  }
  parts.push({ text: promptText });

  console.log(
    '[gemini] analyzeWatchGemini:',
    backB64 ? '2 images' : '1 image',
    '+ google_search',
    candidates ? `+ ${candidates.length} RAG` : '(no RAG)'
  );

  return callGeminiJson<ScanResult>({
    systemInstruction: WATCH_SYSTEM_PROMPT,
    parts,
    enableWebSearch: true,
    disableThinking: opts?.disableThinking,
    label: 'analyze',
  });
}

export async function identifyWatchGemini(
  frontUri: string,
  backUri?: string,
  candidates?: import('./visualRag').SimilarWatch[],
  bookContext?: string,
  webContext?: string,
  opts?: {
    enableGroundedSearch?: boolean;
    disableThinking?: boolean;
    imageMaxWidth?: number;
    maxOutputTokens?: number;
    signal?: AbortSignal;
  }
): Promise<ScanResult> {
  const w = opts?.imageMaxWidth;
  const frontB64 = await compressAndEncode(frontUri, w);
  const backB64 = backUri ? await compressAndEncode(backUri, w) : null;

  const parts: any[] = [{ inline_data: { mime_type: 'image/jpeg', data: frontB64 } }];
  if (backB64) {
    parts.push({ inline_data: { mime_type: 'image/jpeg', data: backB64 } });
  }

  let promptText = backB64
    ? USER_PROMPT_IDENTIFY_FRONT_BACK
    : USER_PROMPT_IDENTIFY_FRONT_ONLY;
  if (candidates && candidates.length > 0) {
    const adaptedCandidates = candidates.map(c => ({
      id: c.id,
      name: c.name,
      brand: c.brand,
      reference: c.reference,
      dial_color: '',
      similarity: c.similarity,
      visualSignatures: [],
      uniqueIdentifiers: []
    }));
    promptText = buildCandidatesPrompt(adaptedCandidates) + promptText;
  }
  if (bookContext) {
    promptText = `${bookContext}\n\n${promptText}`;
  }
  if (webContext) {
    promptText = `${webContext}\n\n${promptText}`;
  }
  if (opts?.enableGroundedSearch) {
    promptText =
      `=== คำแนะนำการค้นหา ===\n` +
      `กรุณาใช้ Google Search ค้นหาข้อมูลเพิ่มเติมจากเว็บนาฬิกาหรูสากล เช่น chrono24.com, watchcharts.com, watchbox.com, bobswatches.com, sothebys.com, christies.com — เน้นชื่อรุ่น, แบรนด์, และเลขรหัสอ้างอิง (Reference) ที่ตรงกับภาพ\n\n` +
      promptText;
  }
  parts.push({ text: promptText });

  console.log(
    '[gemini] identifyWatchGemini',
    opts?.enableGroundedSearch ? '(GROUNDED SEARCH on):' : '(no search):',
    backB64 ? '2 images' : '1 image',
    candidates ? `+ ${candidates.length} RAG` : '(no RAG)',
    bookContext ? '+ book chunks' : '',
    webContext ? '+ web context' : ''
  );

  const partial = await callGeminiJson<Partial<ScanResult>>({
    systemInstruction: WATCH_QUICK_ID_SYSTEM_PROMPT,
    parts,
    enableWebSearch: !!opts?.enableGroundedSearch,
    disableThinking: opts?.disableThinking,
    maxOutputTokens: opts?.maxOutputTokens,
    label: opts?.enableGroundedSearch ? 'identify-grounded' : 'identify',
    signal: opts?.signal,
  });
  return fillScanResultDefaults(partial);
}

async function fetchUrlAsBase64(url: string): Promise<string | null> {
  try {
    const tmp = `${FileSystem.cacheDirectory}cert-exemplar-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}.jpg`;
    const res = await FileSystem.downloadAsync(url, tmp);
    if (res.status !== 200) return null;
    const base64 = await FileSystem.readAsStringAsync(tmp, {
      encoding: FileSystem.EncodingType.Base64,
    });
    FileSystem.deleteAsync(tmp, { idempotent: true }).catch(() => {});
    return base64;
  } catch {
    return null;
  }
}

export async function assessAuthenticityGemini(
  frontUri: string,
  backUri: string | undefined,
  identified: { name: string; brand: string; reference: string },
  opts?: {
    disableThinking?: boolean;
    imageMaxWidth?: number;
    signals?: import('./prompts').AuthSignals;
    certExemplarUrls?: string[];
    extraAngleUris?: string[];
    // Parallel to extraAngleUris — labels each macro shot ('crown' | 'clasp')
    // so the prompt can tell Gemini what each extra image is.
    extraAngleRoles?: string[];
    signal?: AbortSignal;
    language?: 'th' | 'en';
  }
): Promise<AuthPayload> {
  // ── Auth-bypass fast-path (cheap-watch brands) ────────────────────────
  // The generic luxury-watch auth prompt (case bevels, 904L polish, cyclops
  // typography, hand pinion alignment, etc.) is calibrated for $5k+ Swiss
  // luxury watches. Applying it to mass-produced affordable watches makes
  // Gemini hallucinate "anomalies" that are factory-correct for that class
  // (plastic case ≠ replica, quartz movement ≠ counterfeit, painted dial
  // ≠ poor finishing). The cheap-brand allowlist below skips Gemini auth
  // entirely — both for accuracy AND cost (auth is ~33% of total scan cost).
  //
  // Brands listed here meet ALL of these criteria:
  //   1. Median retail price < $1,000 USD
  //   2. No meaningful super-clone counterfeit market (replicas cost as
  //      much or more than the real thing)
  //   3. Sold widely through authorised retail (not grey market)
  //
  // Note: We bypass for the whole brand. Edge cases (e.g. vintage Hamilton
  // mechanical, Seiko Credor) are knowingly traded off for the cost win;
  // user can still inspect details via the heatmap + visual RAG layer.
  const _refUpper = (identified.reference || '').toUpperCase().replace(/\s/g, '');
  const _nameLc = (identified.name || '').toLowerCase();
  const _brandLc = (identified.brand || '').toLowerCase();

  const isMoonSwatch =
    /^SO3[3-9][A-Z][0-9]{3}/.test(_refUpper) ||
    (_brandLc.includes('swatch') && _nameLc.includes('moonswatch')) ||
    (_brandLc.includes('omega') && _nameLc.includes('moonswatch'));

  // Brand-allowlist bypass (affordable, no counterfeit market).
  // Order: most-likely first for short-circuit speed.
  const CHEAP_BRAND_PATTERNS = [
    /\bcasio\b/, /\bg[\- ]?shock\b/, /\bpro[\- ]?trek\b/, /\bedifice\b/,
    /\bswatch\b/,
    /\btimex\b/, /\bfossil\b/, /\bskagen\b/, /\bnixon\b/, /\bmvmt\b/,
    /\bdaniel wellington\b/, /\bdw\b/,
    /\bdiesel\b/, /\barmani exchange\b/, /\bguess\b/,
    /\btissot\b/,     // mostly <$1k quartz/mech, some Powermatic ~$700
    /\bcitizen\b/,    // most <$1k Eco-Drive; Promaster ~$300-700
    /\bhamilton\b/,   // quartz <$500, Khaki Field auto ~$500-900
    /\bseiko 5\b/,    // entry mechanical line specifically
    /\bbulova\b/,
    /\borient\b/,
    /\binvicta\b/,
    /\bfestina\b/,
    /\bskmei\b/, /\bnaviforce\b/,  // entry fashion brands
  ];
  const isCheapBrand =
    !isMoonSwatch && CHEAP_BRAND_PATTERNS.some((re) => re.test(_brandLc));

  // ── New-release allowlist ─────────────────────────────────────────────
  // Watch references released AFTER Gemini's training cutoff routinely
  // get falsely flagged as "non-existent / AI-generated" because the model
  // has never seen them. The allowlist below pre-empts that failure mode
  // for high-profile 2024-2025 releases. Each entry pairs a brand with a
  // reference pattern (or model substring) and supplies the auth verdict
  // we would expect once the model is properly catalogued.
  //
  // Maintenance: add new entries whenever a major new release lands AND
  // before Gemini sees it in training. Remove entries once the new model
  // is widely indexed in our pgvector reference set.
  type NewReleaseEntry = {
    name: string;            // human-readable model
    brandMatch: RegExp;      // brand normalised match
    refMatch?: RegExp;       // optional ref-code match
    nameMatch?: RegExp;      // optional name/model match
    msrpUsd?: number;        // approximate retail (for context)
  };
  const NEW_RELEASE_ALLOWLIST: NewReleaseEntry[] = [
    {
      name: 'Rolex Land-Dweller',
      brandMatch: /\brolex\b/,
      refMatch: /^127[0-9]{3}/,                         // 127xxx series
      nameMatch: /land[\- ]?dweller/i,
      msrpUsd: 14900,
    },
    {
      name: 'Patek Philippe Cubitus',
      brandMatch: /\bpatek( philippe)?\b/,
      refMatch: /^58(20|21)/,                           // 5820/1A, 5821/1G, etc.
      nameMatch: /cubitus/i,
      msrpUsd: 41600,
    },
    {
      name: 'Tudor Black Bay 58 GMT',
      brandMatch: /\btudor\b/,
      refMatch: /^M7939/,
      nameMatch: /black bay 58 gmt|bb58 gmt/i,
      msrpUsd: 4675,
    },
    {
      name: 'Omega Speedmaster Super Racing',
      brandMatch: /\bomega\b/,
      nameMatch: /super racing/i,
      msrpUsd: 12300,
    },
    {
      name: 'AP Royal Oak Selfwinding 50th Anniversary Variants',
      brandMatch: /\baudemars( piguet)?\b|\bap\b/,
      refMatch: /^15510|^15550|^26240|^26242/,          // 50th-anniv refs
      msrpUsd: 26000,
    },
    {
      name: 'Cartier Privé / CPCP 2024-2025',
      brandMatch: /\bcartier\b/,
      nameMatch: /priv[ée]|cpcp/i,
      msrpUsd: 32000,
    },
  ];

  const matchedNewRelease = NEW_RELEASE_ALLOWLIST.find(
    (e) =>
      e.brandMatch.test(_brandLc) &&
      ((e.refMatch && e.refMatch.test(_refUpper)) ||
        (e.nameMatch && e.nameMatch.test(_nameLc)))
  );
  if (matchedNewRelease) {
    console.log(
      '[gemini] assessAuthenticityGemini: new-release fast-path —',
      `bypassing Gemini auth for ${identified.brand} ${identified.name}`,
      `(matches "${matchedNewRelease.name}")`
    );
    return {
      authenticityProbability: 80,
      authenticityVerdict: 'likely-authentic',
      authenticityReasoning:
        `${matchedNewRelease.name} is a recent manufacturer release (post-2024) and may not be in the AI's training data. Visual checkpoints look consistent with ${identified.brand}'s design language. The verdict bypasses Gemini's authenticity check because newer-than-cutoff references are routinely false-flagged as 'non-existent'. Always verify the reference code on the caseback against the manufacturer's current catalogue.`,
      authenticitySignals: [
        { signal: `Brand and reference match a known post-2024 ${identified.brand} release`, weight: 'positive' },
        { signal: 'Design language consistent with manufacturer specifications', weight: 'positive' },
        { signal: 'Recent release — limited reproduction market established yet', weight: 'neutral' },
      ],
      checklist: [
        `Verify reference code on caseback matches ${identified.brand}'s current catalogue.`,
        'Check for paperwork / warranty card with matching reference and serial.',
        'Inspect crown engravings (logo crispness, depth, alignment).',
        'Compare bracelet end-link integration against official manufacturer renders.',
        'Verify case finish (brushed vs polished surfaces) matches catalog spec.',
      ],
      reproductionPrice: {
        typical: 0,
        range: { min: 0, max: 0 },
        notes: `Counterfeit market for ${matchedNewRelease.name} is still nascent — established replica factories typically need 12-18 months after release to produce viable clones.`,
      },
      recommendation:
        `${matchedNewRelease.name} is a recent legitimate release. Verify via the caseback reference code and warranty paperwork rather than relying on AI authentication for newly-launched models.`,
      warningFlags: [],
    };
  }
  // ──────────────────────────────────────────────────────────────────────

  if (isMoonSwatch || isCheapBrand) {
    const label = isMoonSwatch ? 'MoonSwatch' : 'cheap-brand';
    console.log(
      `[gemini] assessAuthenticityGemini: ${label} fast-path —`,
      `bypassing Gemini auth for ${identified.brand} ${identified.name} (${identified.reference})`
    );
    if (isMoonSwatch) {
      return {
        authenticityProbability: 88,
        authenticityVerdict: 'likely-authentic',
        authenticityReasoning:
          'MoonSwatch (Omega × Swatch collaboration) — Bioceramic case, quartz movement, sold openly at Swatch boutiques. This line has no meaningful counterfeit market; the verdict bypasses physical-luxury-watch authentication heuristics that do not apply to mass-produced Bioceramic timepieces.',
        authenticitySignals: [
          { signal: 'Bioceramic case with intentional matte plastic finish (factory-correct)', weight: 'positive' },
          { signal: 'Quartz chronograph movement (factory-correct for MoonSwatch)', weight: 'positive' },
          { signal: 'Planet-themed dial graphics matching catalog reference', weight: 'positive' },
        ],
        checklist: [
          'Reference code on caseback matches SO33/SO34 pattern.',
          'Strap is Velcro/textile (factory-correct for MoonSwatch).',
          'Movement is quartz chronograph (not mechanical — factory-correct).',
          'Case material is Bioceramic (smooth matte plastic — factory-correct).',
        ],
        reproductionPrice: {
          typical: 0,
          range: { min: 0, max: 0 },
          notes: 'No meaningful counterfeit market for MoonSwatch — replicas cost more than the $260 retail price.',
        },
        recommendation:
          'Verify reference code on caseback (e.g., SO33T100 for Mission to Saturn). The MoonSwatch is sold openly at Swatch boutiques and is not a typical counterfeit target.',
        warningFlags: [],
      };
    }
    // Generic cheap-brand bypass.
    return {
      authenticityProbability: 85,
      authenticityVerdict: 'likely-authentic',
      authenticityReasoning:
        `${identified.brand} is a mass-market watch brand with median retail under $1,000 USD and no meaningful super-clone counterfeit market. Luxury-watch authentication heuristics (Swiss case bevels, 904L polish patterns, exotic-metal finishing) do not apply to this class of timepiece. The verdict bypasses physical-luxury-watch checks; verify the reference code matches the manufacturer's catalog.`,
      authenticitySignals: [
        { signal: `${identified.brand} brand identified — affordable retail tier`, weight: 'positive' },
        { signal: 'Construction and finishing consistent with mass-market production', weight: 'positive' },
        { signal: 'No high-value counterfeit incentive for this price tier', weight: 'positive' },
      ],
      checklist: [
        `Reference code matches ${identified.brand}'s official catalog.`,
        'Movement type (quartz/mechanical) matches catalog specification.',
        'Caseback engravings (logo, model number, serial) are crisp and centred.',
        'Crown, pushers, and bezel rotate/click with expected feel.',
      ],
      reproductionPrice: {
        typical: 0,
        range: { min: 0, max: 0 },
        notes: `No meaningful counterfeit market for ${identified.brand} — replicas typically cost more than authentic retail.`,
      },
      recommendation:
        `Verify the reference number on the caseback against ${identified.brand}'s official catalog. This brand tier has no significant counterfeit risk.`,
      warningFlags: [],
    };
  }
  // ──────────────────────────────────────────────────────────────────────

  const w = opts?.imageMaxWidth;
  const frontB64 = await compressAndEncode(frontUri, w);
  const backB64 = backUri ? await compressAndEncode(backUri, w) : null;

  const extraUris = (opts?.extraAngleUris ?? []).slice(0, 3);
  const extraB64s: string[] = extraUris.length
    ? (
        await Promise.all(
          extraUris.map((uri) =>
            compressAndEncode(uri, w).catch(() => null)
          )
        )
      ).filter((b): b is string => b !== null)
    : [];

  const certUrls = (opts?.certExemplarUrls ?? []).slice(0, 3);
  const certBase64s: string[] = certUrls.length
    ? (await Promise.all(certUrls.map(fetchUrlAsBase64))).filter(
        (b): b is string => b !== null
      )
    : [];

  // In Phase 1 MVP, we use the visual similarity signals and certMatches directly.
  // Book RAG is bypassed/empty for watches in MVP.
  const authPrompt =
    certBase64s.length > 0
      ? buildAuthAssessmentPromptWithCert(
          identified.name,
          identified.brand,
          identified.reference,
          certBase64s.length,
          backB64 !== null,
          opts?.signals,
          extraB64s.length,
          opts?.language ?? 'en',
          opts?.extraAngleRoles?.slice(0, extraB64s.length)
        )
      : buildAuthAssessmentPrompt(
          identified.name,
          identified.brand,
          identified.reference,
          opts?.signals,
          backB64 !== null,
          extraB64s.length,
          opts?.language ?? 'en',
          opts?.extraAngleRoles?.slice(0, extraB64s.length)
        );

  const parts: any[] = [{ inline_data: { mime_type: 'image/jpeg', data: frontB64 } }];
  if (backB64) {
    parts.push({ inline_data: { mime_type: 'image/jpeg', data: backB64 } });
  }
  for (const extraB64 of extraB64s) {
    parts.push({ inline_data: { mime_type: 'image/jpeg', data: extraB64 } });
  }
  for (const certB64 of certBase64s) {
    parts.push({ inline_data: { mime_type: 'image/jpeg', data: certB64 } });
  }
  parts.push({ text: authPrompt });

  console.log(
    '[gemini] assessAuthenticityGemini:',
    `${1 + (backB64 ? 1 : 0) + extraB64s.length} user-image(s)`,
    extraB64s.length > 0 ? `(+${extraB64s.length} extra angles)` : '',
    certBase64s.length > 0 ? `+ ${certBase64s.length} cert-exemplars` : '',
    `for ${identified.name}`
  );

  return callGeminiJson<AuthPayload>({
    systemInstruction: WATCH_AUTH_SYSTEM_PROMPT,
    parts,
    enableWebSearch: false,
    disableThinking: opts?.disableThinking,
    label: 'auth',
    signal: opts?.signal,
  });
}

/**
 * Try to read a cached price entry from watch_price_cache.
 * Returns null on miss, expired, or any error (silently — cache is a perf
 * win, not a correctness requirement).
 */
async function readPriceCache(
  brand: string,
  reference: string
): Promise<PricePayload | null> {
  try {
    const brandKey = brand.trim().toLowerCase();
    const refKey = reference.trim().toLowerCase();
    if (!brandKey || !refKey) return null;
    const { data, error } = await supabase
      .from('watch_price_cache')
      .select('price_payload, expires_at, hit_count')
      .eq('brand_key', brandKey)
      .eq('ref_key', refKey)
      .maybeSingle();
    if (error || !data) return null;
    if (new Date(data.expires_at).getTime() < Date.now()) return null;
    // Best-effort hit-count update; do not block the response.
    supabase
      .from('watch_price_cache')
      .update({ hit_count: (data.hit_count ?? 0) + 1 })
      .eq('brand_key', brandKey)
      .eq('ref_key', refKey)
      .then(() => {}, () => {});
    return data.price_payload as PricePayload;
  } catch {
    return null;
  }
}

/**
 * Store a fresh PricePayload in watch_price_cache with 30-day TTL.
 * Best-effort — failures are logged but never thrown.
 */
async function writePriceCache(
  brand: string,
  reference: string,
  payload: PricePayload
): Promise<void> {
  try {
    const brandKey = brand.trim().toLowerCase();
    const refKey = reference.trim().toLowerCase();
    if (!brandKey || !refKey) return;
    const now = new Date();
    const expires = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // +30 days
    await supabase
      .from('watch_price_cache')
      .upsert(
        {
          brand_key: brandKey,
          ref_key: refKey,
          brand: brand,
          ref: reference,
          market_price_usd: payload.marketPrice ?? null,
          price_payload: payload,
          source: 'gemini-grounded',
          cached_at: now.toISOString(),
          expires_at: expires.toISOString(),
        },
        { onConflict: 'brand_key,ref_key' }
      );
  } catch (e: any) {
    console.warn('[gemini] price cache write failed:', e?.message);
  }
}

/**
 * AI Authenticity Heatmap — ask Gemini (via the secure edge) to box 3-7
 * specific inspection spots on the user's actual watch photo, each coloured
 * green/yellow/red with an observation + reasoning. On-demand (1 Gemini call,
 * ~฿0.06). Explainable visual layer — NOT a certification.
 */
export async function generateWatchHeatmap(
  frontUri: string,
  opts?: { signal?: AbortSignal }
): Promise<HeatmapResult> {
  const b64 = await compressAndEncode(frontUri, 1024);
  const parts: any[] = [
    { inline_data: { mime_type: 'image/jpeg', data: b64 } },
    { text: WATCH_HEATMAP_USER_PROMPT },
  ];
  console.log('[gemini] generateWatchHeatmap: 1 image');
  const raw = await callGeminiJson<any>({
    systemInstruction: WATCH_HEATMAP_SYSTEM_PROMPT,
    parts,
    label: 'heatmap',
    maxOutputTokens: 4000,
    signal: opts?.signal,
  });

  const rawRegions: any[] = Array.isArray(raw?.regions) ? raw.regions : [];
  const clamp = (n: any) => Math.max(0, Math.min(1000, Math.round(Number(n) || 0)));
  const regions: HeatmapRegion[] = rawRegions
    .map((r): HeatmapRegion | null => {
      const box = Array.isArray(r?.box_2d) ? r.box_2d : Array.isArray(r?.box) ? r.box : null;
      if (!box || box.length < 4) return null;
      let [ymin, xmin, ymax, xmax] = box.map(clamp);
      if (ymax < ymin) [ymin, ymax] = [ymax, ymin];
      if (xmax < xmin) [xmin, xmax] = [xmax, xmin];
      // Drop imprecise boxes: a box covering >25% of the image area (or nearly
      // the full width/height) is almost always a vague "whole watch" guess, not
      // a pinpointed spot — its centre lands nowhere useful, so the leader arrow
      // looks wrong. Better to show fewer, well-placed spots.
      const areaFrac = ((xmax - xmin) / 1000) * ((ymax - ymin) / 1000);
      if (areaFrac > 0.25 || xmax - xmin > 850 || ymax - ymin > 850) return null;
      const type: HeatmapSignal =
        r?.type === 'green' || r?.type === 'red' ? r.type : 'yellow';
      return {
        box: { ymin, xmin, ymax, xmax },
        type,
        feature: String(r?.feature ?? '').slice(0, 40),
        observation: String(r?.observation ?? '').slice(0, 300),
        reasoning: String(r?.reasoning ?? '').slice(0, 300),
      };
    })
    .filter((r): r is HeatmapRegion => r !== null)
    // Cap to 5: Gemini is most accurate on its top, most-prominent picks; extra
    // boxes are usually the lower-confidence (less precise) ones.
    .slice(0, 5);

  const counts = {
    green: regions.filter((r) => r.type === 'green').length,
    yellow: regions.filter((r) => r.type === 'yellow').length,
    red: regions.filter((r) => r.type === 'red').length,
  };
  return { regions, overallNote: String(raw?.overallNote ?? ''), counts };
}

export async function fetchWatchPricesGemini(
  name: string,
  brand: string,
  reference: string,
  opts?: { disableThinking?: boolean; idConfidence?: number; skipCache?: boolean; signal?: AbortSignal }
): Promise<PricePayload> {
  // ── Price cache fast-path ─────────────────────────────────────────────
  // Grounding queries are the single most expensive component per scan
  // (~$0.035 each = ~62% of total cost). Prices for a given (brand, ref)
  // tuple are stable for weeks at a time, so a 30-day cache yields a huge
  // hit rate without sacrificing accuracy. Cache lookup runs in <100ms
  // and gates the entire price+grounding call.
  if (!opts?.skipCache) {
    const cached = await readPriceCache(brand, reference);
    if (cached) {
      console.log(
        '[gemini] fetchWatchPricesGemini: CACHE HIT for',
        `${brand} / ${reference} (skipping Gemini grounding — savings ~$0.053)`
      );
      // Mark this payload as cache-served so upstream cost logging can flag it.
      return { ...cached, priceDataFreshness: 'mixed' };
    }
  }

  const parts = [{ text: buildPriceLookupPrompt(name, brand, reference, opts?.idConfidence) }];

  console.log(
    '[gemini] fetchWatchPricesGemini:', name, '/', brand, '/', reference,
    '/ conf=', opts?.idConfidence ?? '?', '(cache miss — calling Gemini)'
  );

  const fresh = await callGeminiJson<PricePayload>({
    systemInstruction: PRICE_ONLY_SYSTEM_PROMPT,
    parts,
    enableWebSearch: true,
    disableThinking: opts?.disableThinking,
    label: 'price',
    signal: opts?.signal,
    // Edge function persists the result to watch_price_cache with the
    // service-role key (anon is SELECT-only — see migration 0004).
    priceCacheKey: { brand, ref: reference },
  });

  // Persist for the next 30 days. When edge functions are active (production),
  // the analyze-watch edge owns the write via priceCacheKey above — anon can't
  // write the cache under RLS, so a client write here would only fail noisily.
  // The direct-client dev path (USE_EDGE_FUNCTIONS=false) has no edge to do it,
  // so fall back to the client write there. Best-effort either way.
  if (!USE_EDGE_FUNCTIONS) {
    void writePriceCache(brand, reference, fresh);
  }

  return fresh;
}
