/**
 * Q&A Topic Guards — protect against AI leaking restricted info in the luxury watch domain.
 *
 * Why this exists:
 *   • LEGAL — telling a user "this watch is real" or "worth $50K" without
 *     proper image-based assessment exposes us to liability when they buy and
 *     find out it's a replica.
 *   • BUSINESS — price discovery + authenticity assessment are PAID features
 *     (Pro/Premium). Letting Free users get them via Q&A undercuts the
 *     subscription value prop.
 *   • COST — blocking forbidden questions at the gate saves the LLM API call.
 */
import type { MembershipTier } from './auth';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

// ─────────────────────────────────────────────────────────────────────────────
// Topic detection
// ─────────────────────────────────────────────────────────────────────────────

export type QaTopic =
  | 'price-general'           // "Rolex Submariner ราคาเท่าไหร่" → Pro+ gets range
  | 'price-specific'          // "เรือนนี้ราคาเท่าไหร่" → all blocked, must Scan
  | 'authenticity-judgment'   // "เรือนนี้แท้ไหม / % เท่าไหร่" → all blocked, Scan only
  | 'authenticity-educational'// "ดูนาฬิกาแท้ยังไง / จุดสังเกตเก๊" → all allowed
  | 'investment'              // "ลงทุนนาฬิกาดีไหม" → all blocked
  | 'general';                // history, brand details, glossary, specs → all allowed

/** Words that indicate the user is asking about a SPECIFIC watch they're holding/considering. */
/** Words that indicate the user is asking about a SPECIFIC watch they're holding/considering. */
const SPECIFIC_OWNERSHIP_PATTERNS = [
  /(นาฬิกา|เรือน|ตัว|อัน|รุ่น)\s*(นี้|นั้น)/u, // "เรือนนี้", "นาฬิกานี้"
  /(นาฬิกา|เรือน).*ของ\s*(ผม|ฉัน|กู|เรา|หนู|ดิฉัน)/u, // "นาฬิกาของผม"
  /(ผม|ฉัน|เรา|หนู|ดิฉัน).*มี\s*(นาฬิกา|เรือน)/u, // "ผมมีนาฬิกา"
  /(ผม|ฉัน|เรา|หนู|ดิฉัน).*ได้\s*(นาฬิกา|เรือน)/u, // "ผมได้นาฬิกามา"
  /(นาฬิกา|เรือน).*ที่\s*(ผม|ฉัน|กู|เรา)/u, // "นาฬิกาที่ฉัน"
  /ดูให้หน่อย/u,
  // English patterns
  /\b(this|that|my|our)\s+(watch|timepiece|reference|model)\b/i,
  /\bi\s+(have|got|own)\s+(a|this|my)\s+(watch|timepiece)\b/i,
  /\blook\s+at\s+my\s+(watch|timepiece)\b/i,
  /\bcheck\s+this\b/i,
];

/** Investment/speculation requests — blocked for ALL tiers (legal liability). */
const INVESTMENT_PATTERNS = [
  /ลงทุน/u,
  /เก็งกำไร/u,
  /เก็ง.*กำไร/u,
  /ซื้อ.*ขายต่อ/u,
  /ทำกำไร/u,
  /รวย.*จากนาฬิกา/u,
  /กำไร.*จากนาฬิกา/u,
  /นาฬิกา.*ลงทุน/u,
  /พอร์ต(การ)?ลงทุน/u,
  // English patterns
  /\binvest(ment|ing)?\b/i,
  /\bspeculat(e|ion|ive)\b/i,
  /\bresell\b/i,
  /\bmake\s+profit\b/i,
  /\bportfolio\s+roi\b/i,
  /\bflip(ping)?\b/i,
];

/** Definitive authenticity judgment requests — blocked for ALL tiers (Scan only). */
const AUTHENTICITY_JUDGMENT_PATTERNS = [
  /แท้\s*ไหม/u,
  /ปลอม\s*ไหม/u,
  /เก๊\s*ไหม/u,
  /ของจริง\s*ไหม/u,
  /ใช่\s*ของแท้/u,
  /เป็น\s*(นาฬิกา)?แท้/u,
  /เป็น\s*ของแท้/u,
  /(นาฬิกา|เรือน)\s*เก๊\s*หรือ/u,
  /(เรือน|ตัว|อัน)\s*นี้\s*แท้/u,
  /กี่\s*%[^?]*แท้/u,
  /แท้.*กี่\s*%/u,
  /แท้.*[?]*\s*\d{1,3}\s*%/u,
  /โอกาส.*แท้/u,
  /ความน่าจะเป็น.*แท้/u,
  /(พิสูจน์|ตรวจสอบ|วินิจฉัย).*ความแท้/u,
  /เช็ค.*ของแท้/u,
  // English patterns
  /\bis\s+it\s+real\b/i,
  /\bis\s+this\s+(authentic|genuine|fake|replica|reproduction|counterfeit)\b/i,
  /\bhow\s+many\s+percent\s+authentic\b/i,
  /\bprobability\s+of\s+authentic\b/i,
  /\bcheck\s+authenticity\b/i,
  /\bverify\s+this\b/i,
];

/** Educational authenticity questions — ALLOWED for all tiers. */
const AUTHENTICITY_EDUCATIONAL_PATTERNS = [
  /วิธี.*ดู.*(เก๊|แท้|ปลอม)/u,
  /จุดสังเกต/u,
  /ดู.*(เก๊|แท้).*(ยังไง|อย่างไร)/u,
  /สังเกต.*(เก๊|แท้).*(ยังไง|อย่างไร)/u,
  /(ทำเลียน|เลียนแบบ).*คืออะไร/u,
  /(ของเก๊|นาฬิกาเก๊).*ลักษณะ/u,
  /(วัสดุ|เนื้อ|ขอบ).*(แท้|ปลอม|เก๊).*(ยังไง|อย่างไร|ลักษณะ)/u,
  // English patterns
  /\bhow\s+to\s+spot\b/i,
  /\b(authentic|fake|replica)\s+guide\b/i,
  /\bwhat\s+are\s+the\s+signs\b/i,
  /\bdial\s+hallmarks\b/i,
  /\bhow\s+to\s+tell\b/i,
];

/** Price-related keywords. */
const PRICE_KEYWORDS = [
  'ราคา',
  'มูลค่า',
  'แพง',
  'ถูก',
  'กี่บาท',
  'เท่าไหร่บาท',
  'เท่าไร',
  'ราคากลาง',
  'ราคาตลาด',
  'ราคาขาย',
  'ราคา resale',
  // English
  'price',
  'value',
  'worth',
  'cost',
  'how much',
  'resale market',
  'retail price',
];

/** Number followed by money unit. */
const PRICE_NUMBER_PATTERN = /(?:\d+\s*(บาท|฿|หมื่น|แสน|ล้าน))|(?:\$\s*\d+)/u;

export function detectTopic(question: string): QaTopic {
  const q = question.trim();

  // 1. Investment first — strongest no
  if (INVESTMENT_PATTERNS.some((p) => p.test(q))) return 'investment';

  // 2. Authenticity judgment
  if (AUTHENTICITY_JUDGMENT_PATTERNS.some((p) => p.test(q))) {
    return 'authenticity-judgment';
  }

  // 3. Price detection
  const isPriceQuestion =
    PRICE_KEYWORDS.some((k) => q.toLowerCase().includes(k.toLowerCase())) || PRICE_NUMBER_PATTERN.test(q);
  if (isPriceQuestion) {
    if (SPECIFIC_OWNERSHIP_PATTERNS.some((p) => p.test(q))) {
      return 'price-specific';
    }
    return 'price-general';
  }

  // 4. Specific ownership without price/auth keywords
  if (SPECIFIC_OWNERSHIP_PATTERNS.some((p) => p.test(q))) {
    return 'authenticity-judgment'; // closest fit — sends to Scan
  }

  // 5. Educational authenticity
  if (AUTHENTICITY_EDUCATIONAL_PATTERNS.some((p) => p.test(q))) {
    return 'authenticity-educational';
  }

  // 6. Default — general knowledge
  return 'general';
}

// ─────────────────────────────────────────────────────────────────────────────
// Policy matrix
// ─────────────────────────────────────────────────────────────────────────────

export type PolicyAction =
  | 'allow'
  | 'allow-with-range-instruction'
  | 'block-redirect-scan'
  | 'block-upgrade'
  | 'block-investment';

const POLICY: Record<QaTopic, Record<MembershipTier, PolicyAction>> = {
  'price-general': {
    free: 'block-upgrade',
    standard: 'block-upgrade',
    pro: 'allow-with-range-instruction',
    premium: 'allow-with-range-instruction',
  },
  'price-specific': {
    free: 'block-redirect-scan',
    standard: 'block-redirect-scan',
    pro: 'block-redirect-scan',
    premium: 'block-redirect-scan',
  },
  'authenticity-judgment': {
    free: 'block-redirect-scan',
    standard: 'block-redirect-scan',
    pro: 'block-redirect-scan',
    premium: 'block-redirect-scan',
  },
  'authenticity-educational': {
    free: 'allow',
    standard: 'allow',
    pro: 'allow',
    premium: 'allow',
  },
  investment: {
    free: 'block-investment',
    standard: 'block-investment',
    pro: 'block-investment',
    premium: 'block-investment',
  },
  general: {
    free: 'allow',
    standard: 'allow',
    pro: 'allow',
    premium: 'allow',
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Suggestions (UI templates for blocked questions)
// ─────────────────────────────────────────────────────────────────────────────

export type BlockReason =
  | 'price-general-needs-pro'
  | 'price-specific-needs-scan'
  | 'authenticity-needs-scan'
  | 'investment-disallowed';

export type SuggestionTarget = 'membership' | 'scan' | 'dismiss';

export type BlockSuggestion = {
  reason: BlockReason;
  topic: QaTopic;
  title: string;
  message: string;
  primaryCta: { label: string; target: SuggestionTarget };
  secondaryCta?: { label: string; target: SuggestionTarget };
};

export function getSuggestion(
  action: PolicyAction,
  topic: QaTopic,
  _tier: MembershipTier
): BlockSuggestion {
  switch (action) {
    case 'block-upgrade':
      return {
        reason: 'price-general-needs-pro',
        topic,
        title: '🔒 Market Valuation Requires Pro',
        message:
          'This feature provides historical market price ranges to inform buying and selling. Included in our Pro Plan at $19.99/month.',
        primaryCta: { label: 'Upgrade to Pro', target: 'membership' },
        secondaryCta: { label: 'Scan Watch for Price', target: 'scan' },
      };

    case 'block-redirect-scan':
      if (topic === 'authenticity-judgment') {
        return {
          reason: 'authenticity-needs-scan',
          topic,
          title: '📷 Submit Photos to Authenticity AI',
          message:
            'Verifying authenticity requires real physical evidence. Please scan your timepiece — Authenticity AI delivers precise confidence ratings alongside custom visual heatmaps.',
          primaryCta: { label: 'Start Watch Scan', target: 'scan' },
        };
      }
      return {
        reason: 'price-specific-needs-scan',
        topic,
        title: '📷 Instant Price Valuation via Scan',
        message:
          'Individual price valuation requires visual reference. Our engine analyzes reference model, condition grade, and matching active market sales.',
        primaryCta: { label: 'Scan Watch for Valuation', target: 'scan' },
      };

    case 'block-investment':
      return {
        reason: 'investment-disallowed',
        topic,
        title: '💼 Investment Advisory Restrictions',
        message:
          'Our AI is not licensed to provide financial or investment advice. Luxury timepieces are highly volatile assets — please perform independent research or consult a certified financial advisor.',
        primaryCta: { label: 'Acknowledge', target: 'dismiss' },
      };

    default:
      throw new Error(`getSuggestion called with non-block action: ${action}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Pre-filter
// ─────────────────────────────────────────────────────────────────────────────

export const RANGE_PRICING_INSTRUCTION = `
🚨 User with tier {tier} asked a price question — Strict Rules:
1. **Provide a "Price Range" ONLY** (e.g., "approx. $8,500–$9,800").
   NEVER state a single point price (e.g., "$9,000").
2. **Specify Source** (e.g., "based on Q1/2026 secondary market data").
3. **Append this exact disclaimer:**
   "💡 Individual valuation requires a visual scan for condition assessment — Tap the camera icon on the Home screen."
4. **NEVER** pass an authenticity judgment, even if requested.
5. If the user refers to their own specific watch: "To get an accurate valuation for your exact timepiece, please use the AI scan feature."
`.trim();

export type GuardCheckResult = {
  topic: QaTopic;
  action: PolicyAction;
  systemPromptAddition?: string;
  suggestion?: BlockSuggestion;
};

export function checkQuestionAllowed(
  question: string,
  tier: MembershipTier
): GuardCheckResult {
  const topic = detectTopic(question);
  const action = POLICY[topic][tier];

  let systemPromptAddition: string | undefined;
  let suggestion: BlockSuggestion | undefined;

  if (action === 'allow-with-range-instruction') {
    systemPromptAddition = RANGE_PRICING_INSTRUCTION.replace('{tier}', tier);
  } else if (action !== 'allow') {
    suggestion = getSuggestion(action, topic, tier);
  }

  return { topic, action, systemPromptAddition, suggestion };
}

// ─────────────────────────────────────────────────────────────────────────────
// Post-filter
// ─────────────────────────────────────────────────────────────────────────────

const PRICE_NUMBER_PATTERN_FULL =
  /(?:\d{1,3}(?:,\d{3})+|\d{4,})\s*(บาท|฿)|\$\s*(?:\d{1,3}(?:,\d{3})+|\d{2,})/gu;

const ABSOLUTE_JUDGMENT_PATTERNS: Array<{ pattern: RegExp; replacement: string }> = [
  { pattern: /เป็น\s*ของแท้\s*แน่นอน/gu,
    replacement: '[Authenticity cannot be verified via chat — Use AI Scan]' },
  { pattern: /แท้\s*100\s*%/gu,
    replacement: '[Authenticity cannot be verified via chat — Use AI Scan]' },
  { pattern: /ปลอม\s*100\s*%/gu,
    replacement: '[Cannot evaluate replica status via chat — Use AI Scan]' },
  { pattern: /เก๊\s*แน่นอน/gu,
    replacement: '[Cannot evaluate replica status via chat — Use AI Scan]' },
  { pattern: /แท้\s*แน่นอน/gu,
    replacement: '[Authenticity cannot be verified via chat — Use AI Scan]' },
  { pattern: /ของแท้\s*ชัวร์/gu,
    replacement: '[Authenticity cannot be verified via chat — Use AI Scan]' },
  // English equivalents
  { pattern: /\b100%\s*(authentic|genuine|real)\b/gi,
    replacement: '[Authenticity cannot be verified via chat — Use AI Scan]' },
  { pattern: /\bdefinitely\s*(authentic|genuine|real)\b/gi,
    replacement: '[Authenticity cannot be verified via chat — Use AI Scan]' },
  { pattern: /\b100%\s*(fake|replica|counterfeit)\b/gi,
    replacement: '[Cannot evaluate replica status via chat — Use AI Scan]' },
  { pattern: /\bdefinitely\s*(fake|replica|counterfeit)\b/gi,
    replacement: '[Cannot evaluate replica status via chat — Use AI Scan]' },
];

export type SanitizeResult = {
  clean: string;
  redacted: boolean;
  reasons: string[];
};

export function sanitizeAnswer(answer: string, topic: QaTopic): SanitizeResult {
  const reasons: string[] = [];
  let clean = answer;

  // 1. Strip absolute judgment
  for (const { pattern, replacement } of ABSOLUTE_JUDGMENT_PATTERNS) {
    if (pattern.test(clean)) {
      clean = clean.replace(pattern, replacement);
      if (!reasons.includes('absolute-judgment')) {
        reasons.push('absolute-judgment');
      }
    }
  }

  // 2. Strip bare prices
  let priceRedacted = false;
  clean = clean.replace(PRICE_NUMBER_PATTERN_FULL, (match, _unit, offset: number, full: string) => {
    const before = full.slice(Math.max(0, offset - 15), offset);
    const isRangeSecondHalf = /\d[\d,]*\s*[-–]\s*$/.test(before);
    if (isRangeSecondHalf) return match;
    priceRedacted = true;
    return '[Valuation — Use Shutter Scan for Precise Price]';
  });
  if (priceRedacted) reasons.push('bare-price-redacted');

  return { clean, redacted: reasons.length > 0, reasons };
}

// ─────────────────────────────────────────────────────────────────────────────
// Errors
// ─────────────────────────────────────────────────────────────────────────────

export class RestrictedTopicError extends Error {
  readonly suggestion: BlockSuggestion;

  constructor(suggestion: BlockSuggestion) {
    super(`RESTRICTED_TOPIC:${suggestion.reason}`);
    this.name = 'RestrictedTopicError';
    this.suggestion = suggestion;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Analytics
// ─────────────────────────────────────────────────────────────────────────────

function isConfigured(): boolean {
  return SUPABASE_URL.length > 0 && SUPABASE_ANON_KEY.length > 0;
}

export async function logBlockedEvent(
  question: string,
  topic: QaTopic,
  tier: MembershipTier,
  action: PolicyAction,
  reason: BlockReason
): Promise<void> {
  if (!isConfigured()) return;
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/qa_blocked_events`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        question: question.slice(0, 500),
        topic,
        tier,
        action,
        reason,
      }),
    });
  } catch {
    // Fire-and-forget
  }
}

export async function logSanitizationEvent(
  question: string,
  topic: QaTopic,
  tier: MembershipTier,
  reasons: string[]
): Promise<void> {
  if (!isConfigured()) return;
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/qa_blocked_events`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        question: question.slice(0, 500),
        topic,
        tier,
        action: 'sanitized',
        reason: reasons.join(','),
      }),
    });
  } catch {
    // Fire-and-forget
  }
}
