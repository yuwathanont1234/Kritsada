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
} from './prompts';
import { ScanResult } from './types';
import { fillScanResultDefaults } from './ai';
import type { AuthPayload, PricePayload } from './ai';
import { publishRetry } from './retryStatus';

// Model strings are env-overridable
const GEMINI_FLASH_MODEL =
  process.env.EXPO_PUBLIC_GEMINI_FLASH_MODEL || 'gemini-3-flash-preview';
const GEMINI_PRO_MODEL =
  process.env.EXPO_PUBLIC_GEMINI_PRO_MODEL || 'gemini-3.5-flash';
const GEMINI_FLASH_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_FLASH_MODEL}:generateContent`;
const GEMINI_PRO_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_PRO_MODEL}:generateContent`;
const MAX_OUTPUT_TOKENS = 16000;

export function isGeminiConfigured(): boolean {
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
  } catch {}

  const codeBlockRegex = /```(?:json)?\s*([\s\S]*?)\s*```/g;
  let match;
  while ((match = codeBlockRegex.exec(cleaned)) !== null) {
    try {
      return JSON.parse(match[1]);
    } catch {}
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
        } catch {}
      }
    }
  }

  if (firstBrace >= 0 && lastBrace > firstBrace) {
    try {
      return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1));
    } catch {}
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
  }
): Promise<AuthPayload> {
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
          extraB64s.length
        )
      : buildAuthAssessmentPrompt(
          identified.name,
          identified.brand,
          identified.reference,
          opts?.signals,
          backB64 !== null,
          extraB64s.length
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
  });
}

export async function fetchWatchPricesGemini(
  name: string,
  brand: string,
  reference: string,
  opts?: { disableThinking?: boolean; idConfidence?: number }
): Promise<PricePayload> {
  const parts = [{ text: buildPriceLookupPrompt(name, brand, reference, opts?.idConfidence) }];

  console.log(
    '[gemini] fetchWatchPricesGemini:', name, '/', brand, '/', reference,
    '/ conf=', opts?.idConfidence ?? '?'
  );

  return callGeminiJson<PricePayload>({
    systemInstruction: PRICE_ONLY_SYSTEM_PROMPT,
    parts,
    enableWebSearch: true,
    disableThinking: opts?.disableThinking,
    label: 'price',
  });
}
