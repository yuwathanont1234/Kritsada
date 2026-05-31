/**
 * Serial-number validation for authenticity SCREENING — ASYMMETRIC, flag-only.
 *
 *   L1  format/charset/length sanity per brand (rule-based, no DB).
 *   L2  production-ERA inference cross-checked against the identified model's
 *       production years. Coarse + conservative — see the Rolex note below.
 *
 * ── CRITICAL design rule ──────────────────────────────────────────────────
 * A serial that PASSES does NOT confirm authenticity — a good fake copies a
 * real serial. This signal can only ever RAISE caution (format-impossible or
 * era-mismatched serial), never reassure. Wire it like the A1 classifier:
 * a positive `penalty` lowers confidence; a "plausible" result does NOTHING.
 *
 * ── Why no hardcoded year charts ──────────────────────────────────────────
 * A WRONG serial→year chart flags genuine watches as fake, which is worse than
 * no check. So L2 deliberately avoids precise year tables (those need
 * authoritative curation per brand). Instead it uses only well-documented,
 * coarse STRUCTURAL facts — e.g. Rolex switched from sequential
 * letter-prefix serials to fully RANDOM serials around 2010. That style→era
 * mapping is reliable; an exact year is not. Brands without a safe rule get
 * L1 only. To add precise L2 for a brand, drop a `decodeEra` in below.
 */

export type SerialStatus =
  | 'absent'          // no serial read from the photo → no signal
  | 'unsupported'     // brand has no rule → only the generic garbage check ran
  | 'plausible'       // format OK (+ era OK if checked) → NO confidence change
  | 'format_suspect'  // charset/length impossible for the brand → caution
  | 'era_mismatch';   // inferred era can't overlap the model's production window

export type SerialCheck = {
  status: SerialStatus;
  serial: string;            // normalized serial that was checked ('' when absent)
  brand: string;
  inferredEra?: { min: number; max: number };
  modelEra?: { min: number; max: number };
  note: { en: string; th: string };
  // 0..N caution points — ASYMMETRIC, only ever subtracts from confidence.
  penalty: number;
};

type BrandRule = {
  // L1 — the normalized serial (UPPER, no spaces/dashes) must match this.
  format: RegExp;
  formatDesc: { en: string; th: string };
  // L2 — infer a production-era band from the serial, or null when the style
  // is unknown/undecodable (e.g. a modern random serial whose style is
  // ambiguous). Omit the whole field for brands with no safe rule.
  decodeEra?: (serial: string) => { min: number; max: number } | null;
};

// Generic fallback — only catches obvious garbage (OCR noise, symbols, absurd
// length). Intentionally permissive so it never flags a clean real serial.
const GENERIC_FORMAT = /^[A-Z0-9]{3,16}$/;

const BRAND_RULES: Record<string, BrandRule> = {
  rolex: {
    // Vintage = all digits (4-7); 'dated' era = 1 letter + digits; modern =
    // 8-char scrambled alphanumeric. Union, uppercase only.
    format: /^[A-Z0-9]{4,8}$/,
    formatDesc: {
      en: '4-8 uppercase letters/digits (vintage all-digit, 1987-2010 letter-prefix, or post-2010 8-char random)',
      th: 'ตัวพิมพ์ใหญ่/ตัวเลข 4-8 ตัว (รุ่นเก่าเลขล้วน, ปี 1987-2010 ขึ้นต้นด้วยตัวอักษร, หรือหลังปี 2010 สุ่ม 8 ตัว)',
    },
    // Coarse STRUCTURAL era (well-documented; not a precise year). Generous
    // buffers around the ~1987 and ~2010 transitions to avoid boundary false
    // flags.
    decodeEra: (s) => {
      if (/^\d{4,7}$/.test(s)) return { min: 1926, max: 1989 };          // pure digits → vintage
      if (/^[A-Z]\d{5,7}$/.test(s)) return { min: 1987, max: 2011 };     // letter + digits → 'dated' era
      const letters = (s.match(/[A-Z]/g) ?? []).length;
      if (/^[A-Z0-9]{8}$/.test(s) && letters >= 2) return { min: 2008, max: 2099 }; // random scrambled → 2010+
      return null; // ambiguous style → no era flag
    },
  },
  omega: {
    format: /^\d{7,9}$/,
    formatDesc: { en: '7-9 digit number (no letters)', th: 'ตัวเลข 7-9 หลัก (ไม่มีตัวอักษร)' },
    // Omega serials are sequential but the year chart is large + not safe to
    // hardcode from memory → L1 only (no decodeEra) until a real chart is added.
  },
  patek: {
    format: /^\d{6,8}$/,
    formatDesc: { en: '6-8 digit movement/case number', th: 'เลขกลไก/ตัวเรือน 6-8 หลัก' },
  },
  'patek philippe': {
    format: /^\d{6,8}$/,
    formatDesc: { en: '6-8 digit movement/case number', th: 'เลขกลไก/ตัวเรือน 6-8 หลัก' },
  },
  audemars: {
    format: /^[A-Z0-9]{4,9}$/,
    formatDesc: { en: '4-9 char case/movement number', th: 'เลขตัวเรือน/กลไก 4-9 ตัว' },
  },
  'audemars piguet': {
    format: /^[A-Z0-9]{4,9}$/,
    formatDesc: { en: '4-9 char case/movement number', th: 'เลขตัวเรือน/กลไก 4-9 ตัว' },
  },
  tudor: {
    format: /^[A-Z0-9]{4,9}$/,
    formatDesc: { en: '4-9 uppercase letters/digits', th: 'ตัวพิมพ์ใหญ่/ตัวเลข 4-9 ตัว' },
  },
  cartier: {
    format: /^[A-Z0-9]{6,12}$/,
    formatDesc: { en: '6-12 char alphanumeric', th: 'ตัวอักษร/ตัวเลข 6-12 ตัว' },
  },
  'tag heuer': {
    format: /^[A-Z0-9]{6,12}$/,
    formatDesc: { en: '6-12 char alphanumeric', th: 'ตัวอักษร/ตัวเลข 6-12 ตัว' },
  },
  breitling: {
    format: /^[A-Z0-9]{6,12}$/,
    formatDesc: { en: '6-12 char alphanumeric', th: 'ตัวอักษร/ตัวเลข 6-12 ตัว' },
  },
};

export function normalizeSerialForCheck(serial?: string): string {
  return (serial ?? '').toUpperCase().replace(/[\s\-_.]/g, '').trim();
}

function resolveBrandRule(brand: string): BrandRule | null {
  const b = brand.toLowerCase();
  const key = Object.keys(BRAND_RULES).find((k) => b.includes(k));
  return key ? BRAND_RULES[key] : null;
}

/** Parse a production-year band from a model `year` string ("2013-2019",
 *  "2020-Present", "1970"). Returns null if no 4-digit year is present. */
export function parseModelEra(year?: string): { min: number; max: number } | null {
  if (!year) return null;
  const nums = (year.match(/\d{4}/g) ?? []).map(Number).filter((y) => y >= 1900 && y <= 2100);
  if (!nums.length) return null;
  const min = Math.min(...nums);
  const max = /present|current|now|ปัจจุบัน/i.test(year) ? 2099 : Math.max(...nums);
  return { min, max };
}

/**
 * Validate a watch serial. ASYMMETRIC: returns penalty>0 ONLY for a
 * format-impossible or era-mismatched serial; a clean serial returns penalty=0
 * (must NOT boost confidence).
 */
export function validateSerial(
  brand: string | undefined,
  serial: string | undefined,
  modelYear?: string
): SerialCheck {
  const b = brand ?? '';
  const s = normalizeSerialForCheck(serial);

  if (!s) {
    return {
      status: 'absent',
      serial: '',
      brand: b,
      penalty: 0,
      note: {
        en: 'No legible serial in the photos — serial check skipped. Add a sharp shot of the rehaut / caseback to enable it.',
        th: 'ไม่พบซีเรียลที่อ่านได้ในรูป — ข้ามการตรวจซีเรียล ถ่ายรูป rehaut / ฝาหลังให้ชัดเพื่อเปิดใช้',
      },
    };
  }

  const rule = resolveBrandRule(b);
  const format = rule?.format ?? GENERIC_FORMAT;

  // L1 — format / charset / length sanity.
  if (!format.test(s)) {
    const desc = rule?.formatDesc;
    return {
      status: 'format_suspect',
      serial: s,
      brand: b,
      penalty: 5,
      note: {
        en: `Serial "${s}" doesn't match the expected ${b || 'brand'} format${desc ? ` (${desc.en})` : ''} — possible misread or non-standard engraving. Verify against the physical piece.`,
        th: `ซีเรียล "${s}" ไม่ตรงรูปแบบของ ${b || 'แบรนด์นี้'}${desc ? ` (${desc.th})` : ''} — อาจอ่านผิดหรือสลักผิดมาตรฐาน ควรตรวจกับตัวจริง`,
      },
    };
  }

  // L2 — production-era cross-check (only when the brand has a safe decoder
  // AND the model year is known).
  const modelEra = parseModelEra(modelYear);
  const inferredEra = rule?.decodeEra ? rule.decodeEra(s) : null;
  if (inferredEra && modelEra) {
    const overlaps = inferredEra.min <= modelEra.max && modelEra.min <= inferredEra.max;
    if (!overlaps) {
      return {
        status: 'era_mismatch',
        serial: s,
        brand: b,
        inferredEra,
        modelEra,
        penalty: 10,
        note: {
          en: `The serial's style points to roughly ${inferredEra.min}-${inferredEra.max === 2099 ? 'present' : inferredEra.max}, but this model was produced ${modelEra.min}-${modelEra.max === 2099 ? 'present' : modelEra.max}. A serial era that can't overlap the model's production window is a classic counterfeit tell — verify the serial and reference together.`,
          th: `รูปแบบซีเรียลบ่งชี้ช่วงราว ${inferredEra.min}-${inferredEra.max === 2099 ? 'ปัจจุบัน' : inferredEra.max} แต่รุ่นนี้ผลิตช่วง ${modelEra.min}-${modelEra.max === 2099 ? 'ปัจจุบัน' : modelEra.max} ซีเรียลที่ช่วงผลิตไม่คาบเกี่ยวกับรุ่นเป็นจุดสังเกตของของปลอม ควรตรวจซีเรียลกับรหัสรุ่นพร้อมกัน`,
        },
      };
    }
  }

  // Format OK (+ era OK or not checked). No confidence change.
  return {
    status: rule ? 'plausible' : 'unsupported',
    serial: s,
    brand: b,
    inferredEra: inferredEra ?? undefined,
    modelEra: modelEra ?? undefined,
    penalty: 0,
    note: rule
      ? {
          en: inferredEra && modelEra
            ? `Serial format and inferred era are consistent with a ${b} from this period. (A valid serial supports — but cannot prove — authenticity; fakes copy real serials.)`
            : `Serial format is consistent with ${b}. (A valid serial supports — but cannot prove — authenticity; fakes copy real serials.)`,
          th: inferredEra && modelEra
            ? `รูปแบบซีเรียลและช่วงยุคสอดคล้องกับ ${b} ยุคนี้ (ซีเรียลถูกต้อง "สนับสนุน" แต่ไม่ "ยืนยัน" ความแท้ ของปลอมก๊อปซีเรียลจริงได้)`
            : `รูปแบบซีเรียลสอดคล้องกับ ${b} (ซีเรียลถูกต้อง "สนับสนุน" แต่ไม่ "ยืนยัน" ความแท้ ของปลอมก๊อปซีเรียลจริงได้)`,
        }
      : {
          en: `No serial-format rule for "${b}" yet — only a generic sanity check ran. Format looks plausible.`,
          th: `ยังไม่มีกฎรูปแบบซีเรียลสำหรับ "${b}" — ตรวจแบบทั่วไปเท่านั้น รูปแบบดูสมเหตุสมผล`,
        },
  };
}
