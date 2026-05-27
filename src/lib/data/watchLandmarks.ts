/**
 * Brand-specific authentication landmark maps.
 *
 * Each brand has a curated set of 5-7 visual landmarks that authenticators
 * focus on when assessing a piece. Rendering numbered pins at these
 * positions on the watch photo + matching cards below lets users see
 * exactly WHAT the AI is evaluating and WHY a verdict is what it is —
 * vs the previous "abstract green dots" UX where users saw colour but
 * not meaning.
 *
 * Coordinates are expressed as percentages of the image frame so the
 * overlay works for any image aspect ratio. (0,0) = top-left,
 * (100,100) = bottom-right.
 *
 * Adding a new brand: copy one of the existing maps, update the
 * `landmarks` array, and add the brand key to `BRAND_LANDMARKS`. The
 * fallback `GENERIC_LANDMARKS` covers any brand not yet mapped — the
 * cards still render with brand-agnostic labels (Logo, Dial, Hands,
 * Case, Strap).
 */

export type LandmarkPoint = {
  /** Stable id used to match cards ↔ pins ↔ Gemini signals. */
  id: string;
  /** Human-readable label, English. */
  labelEn: string;
  /** Human-readable label, Thai. */
  labelTh: string;
  /** One-line explanation of what authenticators check at this spot. */
  descriptionEn: string;
  descriptionTh: string;
  /** Position as percentage of image — x: left→right (0-100), y: top→bottom (0-100). */
  xPct: number;
  yPct: number;
  /** Keywords that Gemini auth signals are matched against to populate this landmark.
   *  Case-insensitive substring match against `signal` text. */
  signalKeywords: string[];
};

export type BrandLandmarkMap = {
  brand: string;
  landmarks: LandmarkPoint[];
};

// ────────────────────────────────────────────────────────────────────
// ROLEX — 7 landmarks (Submariner/Datejust/GMT/Daytona share these)
// ────────────────────────────────────────────────────────────────────
const ROLEX_LANDMARKS: LandmarkPoint[] = [
  {
    id: 'crown',
    labelEn: 'Crown Coronet',
    labelTh: 'มงกุฎ Rolex',
    descriptionEn: 'Laser-etched 5-point coronet at 6 o\'clock sapphire crystal (post-2002). Should be barely visible without loupe.',
    descriptionTh: 'มงกุฎ 5 แฉก laser-etched ที่ 6 นาฬิกาบนกระจกแซฟไฟร์ (หลังปี 2002) ต้องเห็นยากต้องใช้แว่นขยาย',
    xPct: 50, yPct: 88,
    signalKeywords: ['coronet', 'crown logo', '6 o\'clock', 'laser-etched', 'crown'],
  },
  {
    id: 'cyclops',
    labelEn: 'Cyclops Magnification',
    labelTh: 'ไซคลอปส์ขยายเลขวันที่',
    descriptionEn: 'Date window magnifier should be exactly 2.5× refraction with anti-reflective coating.',
    descriptionTh: 'เลนส์ขยายเลขวันที่ต้องขยาย 2.5 เท่า + เคลือบป้องกันการสะท้อน',
    xPct: 78, yPct: 50,
    signalKeywords: ['cyclops', 'magnification', '2.5', 'date window', 'date wheel'],
  },
  {
    id: 'rehaut',
    labelEn: 'Rehaut Engraving',
    labelTh: 'แถบ Rehaut',
    descriptionEn: 'ROLEX ROLEX repeating around inner bezel ring (post-2008). Font weight + spacing distinctive.',
    descriptionTh: 'ตัวอักษร ROLEX ROLEX สลักบนวงในขอบหน้าปัด (หลังปี 2008) ความหนาฟอนต์และระยะห่างเป็นเอกลักษณ์',
    xPct: 50, yPct: 18,
    signalKeywords: ['rehaut', 'inner bezel', 'engraving', 'rolex rolex'],
  },
  {
    id: 'dial',
    labelEn: 'Dial Typography',
    labelTh: 'อักษรบนหน้าปัด',
    descriptionEn: 'Applied indices, sharp transfer printing, perfectly aligned crown logo at 12.',
    descriptionTh: 'หลักชั่วโมงแบบ applied, ตัวอักษรพิมพ์คมชัด, โลโก้มงกุฎที่ 12 อยู่ตรงตำแหน่ง',
    xPct: 50, yPct: 38,
    signalKeywords: ['dial', 'typography', 'indices', 'index', 'logo', 'transfer'],
  },
  {
    id: 'datewheel',
    labelEn: 'Date Wheel Font',
    labelTh: 'เลขปฏิทิน',
    descriptionEn: 'Date numerals: black-on-white (or white-on-black), correct font, instantaneous flip at midnight.',
    descriptionTh: 'เลขวันที่: ดำบนขาว (หรือขาวบนดำ), ฟอนต์ถูกต้อง, เปลี่ยนเลขที่เที่ยงคืนทันที',
    xPct: 80, yPct: 50,
    signalKeywords: ['date', 'datewheel', 'date font', 'date numeral'],
  },
  {
    id: 'bezel',
    labelEn: 'Bezel Insert',
    labelTh: 'ขอบหน้าปัด',
    descriptionEn: 'Ceramic (Cerachrom) or aluminum — depth of platinum fill, smoothness, edge sharpness.',
    descriptionTh: 'เซรามิค (Cerachrom) หรือ aluminum — ความลึกของแพลทินั่ม, ความเรียบ, ความคมของขอบ',
    xPct: 50, yPct: 8,
    signalKeywords: ['bezel', 'cerachrom', 'ceramic', 'platinum fill', 'aluminum'],
  },
  {
    id: 'bracelet',
    labelEn: 'Oyster/Jubilee Bracelet',
    labelTh: 'สายนาฬิกา Oyster/Jubilee',
    descriptionEn: 'Brushing pattern, link articulation, Oysterlock clasp engraving + safety mechanism.',
    descriptionTh: 'ลวดลายขัดด้าน, การพับข้อต่อ, ตราสลักบน Oysterlock + กลไกล็อค',
    xPct: 50, yPct: 96,
    signalKeywords: ['bracelet', 'oyster', 'jubilee', 'clasp', 'oysterlock', 'links'],
  },
];

// ────────────────────────────────────────────────────────────────────
// AUDEMARS PIGUET — Royal Oak / Offshore / Code 11.59
// ────────────────────────────────────────────────────────────────────
const AP_LANDMARKS: LandmarkPoint[] = [
  {
    id: 'bezel-screws',
    labelEn: '8 Bezel Screws',
    labelTh: 'น็อต 8 ตัวขอบหน้าปัด',
    descriptionEn: 'Eight white-gold screws on bezel — perfect octagonal alignment, all slot grooves parallel.',
    descriptionTh: 'น็อตทองคำขาว 8 ตัวบนขอบหน้าปัด — เรียงตัวสมมาตรแปดเหลี่ยม ร่องบากขนานกันทั้งหมด',
    xPct: 50, yPct: 6,
    signalKeywords: ['bezel screws', 'octagonal', '8 screws', 'gold screws'],
  },
  {
    id: 'tapisserie',
    labelEn: 'Tapisserie Pattern',
    labelTh: 'ลาย Tapisserie',
    descriptionEn: 'Grand/Petite/Mega Tapisserie waffle dial — grid uniformity + depth of pyramids.',
    descriptionTh: 'หน้าปัดลายตาราง Grand/Petite/Mega Tapisserie — ความสม่ำเสมอ + ความลึกของพีระมิด',
    xPct: 50, yPct: 38,
    signalKeywords: ['tapisserie', 'waffle', 'grid pattern', 'pyramid'],
  },
  {
    id: 'ap-signature',
    labelEn: 'AP Signature',
    labelTh: 'ลายเซ็น AP',
    descriptionEn: '"Audemars Piguet" applied, perfect kerning, "AP" hash logo above 6 o\'clock.',
    descriptionTh: '"Audemars Piguet" applied, ช่องว่างระหว่างตัวอักษรพอดี, โลโก้ AP เหนือ 6 นาฬิกา',
    xPct: 50, yPct: 22,
    signalKeywords: ['ap signature', 'audemars piguet', 'logo'],
  },
  {
    id: 'integrated-bracelet',
    labelEn: 'Integrated Bracelet',
    labelTh: 'สายแบบฝังตัวเรือน',
    descriptionEn: 'Bracelet flows from case — link taper, polished/brushed alternation pattern.',
    descriptionTh: 'สายต่อจากตัวเรือน — การลดขนาดของข้อต่อ, สลับขัดเงา/ขัดด้าน',
    xPct: 50, yPct: 96,
    signalKeywords: ['integrated', 'bracelet taper', 'links', 'polished brushed'],
  },
  {
    id: 'hands',
    labelEn: 'Calatrava Cross Hands',
    labelTh: 'เข็ม Calatrava',
    descriptionEn: 'Royal Oak Calatrava cross-pattern luminous hands — sharp tips + uniform lume.',
    descriptionTh: 'เข็มลาย Calatrava แบบ Royal Oak — ปลายแหลม + lume เนียน',
    xPct: 50, yPct: 50,
    signalKeywords: ['hands', 'calatrava', 'luminous', 'lume hands'],
  },
  {
    id: 'caseback',
    labelEn: 'Caseback',
    labelTh: 'ฝาหลัง',
    descriptionEn: 'Open (sapphire) or solid — engraving depth, calibre marking, serial position.',
    descriptionTh: 'แบบเปิด (sapphire) หรือทึบ — ความลึกของลายแกะ, ระบุเลขกลไก, ตำแหน่ง serial',
    xPct: 50, yPct: 88,
    signalKeywords: ['caseback', 'sapphire back', 'engraving', 'serial'],
  },
  {
    id: 'crown',
    labelEn: 'Crown',
    labelTh: 'เม็ดมะยม',
    descriptionEn: 'AP-stamped crown — depth of pip, octagonal shape, position relative to lugs.',
    descriptionTh: 'เม็ดมะยมตรา AP — ความลึกของจุด, รูปร่างแปดเหลี่ยม, ตำแหน่งเทียบกับขา',
    xPct: 92, yPct: 50,
    signalKeywords: ['crown', 'ap crown', 'pip'],
  },
];

// ────────────────────────────────────────────────────────────────────
// TUDOR — Black Bay / Pelagos / Heritage
// ────────────────────────────────────────────────────────────────────
const TUDOR_LANDMARKS: LandmarkPoint[] = [
  {
    id: 'snowflake-hands',
    labelEn: 'Snowflake Hands',
    labelTh: 'เข็ม Snowflake',
    descriptionEn: 'Black Bay signature snowflake hour hand + lollipop seconds — sharp facets, even lume.',
    descriptionTh: 'เข็มชั่วโมง Snowflake เอกลักษณ์ Black Bay + เข็มวินาที lollipop — เหลี่ยมคม lume สม่ำเสมอ',
    xPct: 50, yPct: 50,
    signalKeywords: ['snowflake', 'lollipop', 'hands', 'lume hands'],
  },
  {
    id: 'shield-logo',
    labelEn: 'Tudor Shield Logo',
    labelTh: 'โลโก้โล่ Tudor',
    descriptionEn: 'Applied shield logo at 12 (modern) or rose logo (heritage) — sharp 3D relief.',
    descriptionTh: 'โลโก้โล่ applied ที่ 12 (รุ่นใหม่) หรือโลโก้กุหลาบ (heritage) — นูนคม 3D',
    xPct: 50, yPct: 22,
    signalKeywords: ['shield', 'tudor logo', 'rose logo'],
  },
  {
    id: 'rivet-bracelet',
    labelEn: 'Rivet Bracelet',
    labelTh: 'สายแบบ Rivet',
    descriptionEn: 'Faux rivet bracelet (BB only) — rivets are decorative reliefs, NOT structural pins.',
    descriptionTh: 'สาย rivet (เฉพาะ BB) — หมุดเป็นนูนตกแต่ง ไม่ใช่แกนต่อจริง',
    xPct: 50, yPct: 96,
    signalKeywords: ['rivet', 'bracelet', 'faux rivet'],
  },
  {
    id: 'tudor-seal',
    labelEn: 'Tudor Seal Caseback',
    labelTh: 'ตรา Tudor บนฝาหลัง',
    descriptionEn: '5-year manufacturer warranty seal engraved on caseback (post-2017 chronometers).',
    descriptionTh: 'ตราการันตี 5 ปีของผู้ผลิตสลักที่ฝาหลัง (chronometer หลังปี 2017)',
    xPct: 50, yPct: 88,
    signalKeywords: ['tudor seal', 'caseback', '5 year'],
  },
  {
    id: 'bezel',
    labelEn: 'Bezel Insert',
    labelTh: 'ขอบหน้าปัด',
    descriptionEn: 'Aluminum (vintage BB) or ceramic (modern) — colour saturation, edge crisp.',
    descriptionTh: 'Aluminum (BB vintage) หรือ ceramic (รุ่นใหม่) — ความเข้มของสี, ขอบคม',
    xPct: 50, yPct: 8,
    signalKeywords: ['bezel', 'ceramic bezel', 'aluminum', 'pepsi'],
  },
  {
    id: 'movement-marking',
    labelEn: 'MT5xxx Movement',
    labelTh: 'กลไก MT5xxx',
    descriptionEn: 'In-house MT5400/MT5602/MT5612 series — engraving visible through sapphire back.',
    descriptionTh: 'กลไก in-house ซีรีส์ MT5400/MT5602/MT5612 — เห็นสลักผ่านฝาหลัง sapphire',
    xPct: 50, yPct: 70,
    signalKeywords: ['mt5', 'movement', 'calibre', 'in-house'],
  },
  {
    id: 'crown',
    labelEn: 'Tudor Crown',
    labelTh: 'เม็ดมะยม Tudor',
    descriptionEn: 'Engraved Tudor shield on crown — depth + alignment + screw-down mechanism.',
    descriptionTh: 'สลักโล่ Tudor บนเม็ดมะยม — ความลึก + การจัดวาง + กลไกหมุนล็อค',
    xPct: 92, yPct: 50,
    signalKeywords: ['crown', 'tudor crown', 'screw-down'],
  },
];

// ────────────────────────────────────────────────────────────────────
// PATEK PHILIPPE — Nautilus / Aquanaut / Calatrava
// ────────────────────────────────────────────────────────────────────
const PATEK_LANDMARKS: LandmarkPoint[] = [
  {
    id: 'calatrava-cross',
    labelEn: 'Calatrava Cross',
    labelTh: 'ตราไม้กางเขน Calatrava',
    descriptionEn: 'Maison\'s Calatrava cross seal — etched/applied with perfect proportions.',
    descriptionTh: 'ตราประจำ Maison Calatrava — สลัก/applied ด้วยสัดส่วนที่สมบูรณ์',
    xPct: 50, yPct: 22,
    signalKeywords: ['calatrava', 'cross', 'patek seal'],
  },
  {
    id: 'horizontal-embossed',
    labelEn: 'Horizontal Embossed Dial',
    labelTh: 'ลายปั๊มแนวนอน',
    descriptionEn: 'Nautilus signature horizontal lines — perfectly parallel, embossed not printed.',
    descriptionTh: 'เส้นแนวนอนเอกลักษณ์ Nautilus — ขนานสมบูรณ์ ปั๊มไม่ใช่พิมพ์',
    xPct: 50, yPct: 50,
    signalKeywords: ['embossed', 'horizontal', 'nautilus pattern', 'dial pattern'],
  },
  {
    id: 'patek-signature',
    labelEn: 'Patek Philippe Signature',
    labelTh: 'ลายเซ็น Patek Philippe',
    descriptionEn: '"PATEK PHILIPPE GENEVE" applied at 12 — kerning + depth + reflection.',
    descriptionTh: '"PATEK PHILIPPE GENEVE" applied ที่ 12 — kerning + ความลึก + การสะท้อน',
    xPct: 50, yPct: 30,
    signalKeywords: ['patek signature', 'patek philippe', 'geneve'],
  },
  {
    id: 'integrated-bracelet',
    labelEn: 'Integrated Bracelet',
    labelTh: 'สายแบบฝังตัวเรือน',
    descriptionEn: 'Tapered links + polished/brushed alternation, signature double-fold clasp.',
    descriptionTh: 'ข้อต่อเรียวลง + สลับขัดเงา/ขัดด้าน, กลไกพับ 2 ชั้นเอกลักษณ์',
    xPct: 50, yPct: 96,
    signalKeywords: ['integrated', 'bracelet', 'tapered', 'fold clasp'],
  },
  {
    id: 'hands',
    labelEn: 'Baton Hands',
    labelTh: 'เข็มแบบ Baton',
    descriptionEn: 'White-gold baton hour/minute hands — uniform luminous coating.',
    descriptionTh: 'เข็มชั่วโมง/นาที baton ทองคำขาว — เคลือบเรืองแสงสม่ำเสมอ',
    xPct: 50, yPct: 50,
    signalKeywords: ['baton', 'hands', 'white gold hands'],
  },
  {
    id: 'caseback',
    labelEn: 'Sapphire Caseback',
    labelTh: 'ฝาหลัง Sapphire',
    descriptionEn: 'Movement visible — Geneva seal, perlage on bridges, gold rotor markings.',
    descriptionTh: 'เห็นกลไก — ตรา Geneva, perlage บนแผ่นยก, ตราสลักทองบน rotor',
    xPct: 50, yPct: 88,
    signalKeywords: ['caseback', 'geneva seal', 'rotor', 'perlage'],
  },
  {
    id: 'crown',
    labelEn: 'Crown',
    labelTh: 'เม็ดมะยม',
    descriptionEn: 'Cross-embossed crown — Nautilus has 4-3 button at 4, Aquanaut has plain crown.',
    descriptionTh: 'เม็ดมะยมลายไม้กางเขน — Nautilus มีปุ่ม 4-3 ที่ 4, Aquanaut เม็ดมะยมเรียบ',
    xPct: 92, yPct: 50,
    signalKeywords: ['crown', 'patek crown'],
  },
];

// ────────────────────────────────────────────────────────────────────
// OMEGA — Speedmaster / Seamaster
// ────────────────────────────────────────────────────────────────────
const OMEGA_LANDMARKS: LandmarkPoint[] = [
  {
    id: 'omega-logo',
    labelEn: 'Omega Ω Logo',
    labelTh: 'โลโก้ Omega Ω',
    descriptionEn: 'Applied Ω at 12 — gold/silver sharp 3D relief, base alignment perfect.',
    descriptionTh: 'Ω applied ที่ 12 — ทอง/เงิน นูน 3D คม, ฐานเรียงตรง',
    xPct: 50, yPct: 22,
    signalKeywords: ['omega logo', 'omega symbol', 'ω', 'applied'],
  },
  {
    id: 'subdials',
    labelEn: 'Subdial Layout',
    labelTh: 'หน้าปัดย่อย',
    descriptionEn: '3-6-9 layout (Speedy) or asymmetric (Seamaster GMT) — perfect center alignment.',
    descriptionTh: 'รูปแบบ 3-6-9 (Speedy) หรือไม่สมมาตร (Seamaster GMT) — ตำแหน่งศูนย์ถูกต้อง',
    xPct: 50, yPct: 50,
    signalKeywords: ['subdial', 'sub-dial', 'chrono', 'three register'],
  },
  {
    id: 'tachymeter',
    labelEn: 'Tachymeter Bezel',
    labelTh: 'มาตรา Tachymeter',
    descriptionEn: 'Aluminum or ceramic bezel — "TACHYMETRE BASE 1000" precise font + spacing.',
    descriptionTh: 'ขอบหน้าปัด aluminum หรือ ceramic — "TACHYMETRE BASE 1000" ฟอนต์/ช่องว่างแม่นยำ',
    xPct: 50, yPct: 8,
    signalKeywords: ['tachymeter', 'tachymetre', 'bezel font'],
  },
  {
    id: 'caseback',
    labelEn: 'Caseback Engraving',
    labelTh: 'ลายฝาหลัง',
    descriptionEn: 'Moonwatch Apollo/seahorse — depth of engraving, ring uniformity.',
    descriptionTh: 'Moonwatch Apollo/ม้าน้ำ — ความลึกของลายแกะ, ความสม่ำเสมอของวงแหวน',
    xPct: 50, yPct: 88,
    signalKeywords: ['caseback', 'seahorse', 'moonwatch', 'apollo'],
  },
  {
    id: 'crown-pushers',
    labelEn: 'Crown + Pushers',
    labelTh: 'เม็ดมะยม + ปุ่มจับเวลา',
    descriptionEn: 'Ω-stamped crown + pump-style pushers (Speedy) — proportions + click feel.',
    descriptionTh: 'เม็ดมะยมตรา Ω + ปุ่มจับเวลาแบบ pump (Speedy) — สัดส่วน + ความรู้สึก click',
    xPct: 92, yPct: 50,
    signalKeywords: ['crown', 'pusher', 'omega crown'],
  },
  {
    id: 'hands',
    labelEn: 'Speedy Hands',
    labelTh: 'เข็ม Speedy',
    descriptionEn: 'White baton hour/minute, central seconds with Speedy arrow tip.',
    descriptionTh: 'เข็มชั่วโมง/นาที baton ขาว, เข็มวินาทีกลางพร้อมปลายลูกศร Speedy',
    xPct: 50, yPct: 50,
    signalKeywords: ['hands', 'baton', 'arrow tip'],
  },
  {
    id: 'bracelet',
    labelEn: 'Bracelet/Strap',
    labelTh: 'สาย/สายรัด',
    descriptionEn: 'Brushed/polished alternation links or NATO/leather strap with Ω-stamped buckle.',
    descriptionTh: 'สายขัด/เงาสลับ หรือ NATO/หนัง พร้อมหัวเข็มขัดตรา Ω',
    xPct: 50, yPct: 96,
    signalKeywords: ['bracelet', 'strap', 'buckle'],
  },
];

// ────────────────────────────────────────────────────────────────────
// GENERIC FALLBACK — 5 brand-agnostic landmarks
// ────────────────────────────────────────────────────────────────────
const GENERIC_LANDMARKS: LandmarkPoint[] = [
  {
    id: 'logo',
    labelEn: 'Brand Logo / Signature',
    labelTh: 'โลโก้/ลายเซ็นแบรนด์',
    descriptionEn: 'Applied or printed brand mark at 12 — typography quality + reflection.',
    descriptionTh: 'ตราแบรนด์ applied หรือพิมพ์ที่ 12 — คุณภาพตัวอักษร + การสะท้อน',
    xPct: 50, yPct: 22,
    signalKeywords: ['logo', 'signature', 'brand', 'typography'],
  },
  {
    id: 'dial',
    labelEn: 'Dial Finishing',
    labelTh: 'ผิวหน้าปัด',
    descriptionEn: 'Surface finish, indices application, sub-dial alignment, lume uniformity.',
    descriptionTh: 'ผิวหน้าปัด, การติดหลักชั่วโมง, การจัดตำแหน่งหน้าปัดย่อย, ความสม่ำเสมอของ lume',
    xPct: 50, yPct: 50,
    signalKeywords: ['dial', 'indices', 'sub-dial', 'lume'],
  },
  {
    id: 'hands',
    labelEn: 'Hands',
    labelTh: 'เข็ม',
    descriptionEn: 'Hand proportions + center pinion finishing + lume application.',
    descriptionTh: 'สัดส่วนเข็ม + การ finishing จุดศูนย์กลาง + การลง lume',
    xPct: 60, yPct: 45,
    signalKeywords: ['hands', 'pinion', 'lume', 'hour hand', 'minute hand'],
  },
  {
    id: 'case',
    labelEn: 'Case + Bezel',
    labelTh: 'ตัวเรือน + ขอบหน้าปัด',
    descriptionEn: 'Case proportions, bezel finish, lug bevels + brushing.',
    descriptionTh: 'สัดส่วนตัวเรือน, ผิว bezel, ขอบขา + การขัด',
    xPct: 50, yPct: 8,
    signalKeywords: ['case', 'bezel', 'lug', 'flank'],
  },
  {
    id: 'strap',
    labelEn: 'Bracelet/Strap + Clasp',
    labelTh: 'สาย + กลไกล็อค',
    descriptionEn: 'Link finishing or strap quality + clasp brand engraving + safety mechanism.',
    descriptionTh: 'การ finishing ข้อต่อหรือคุณภาพสาย + ตราสลักบนกลไกล็อค + กลไกความปลอดภัย',
    xPct: 50, yPct: 96,
    signalKeywords: ['bracelet', 'strap', 'clasp', 'links'],
  },
];

// ────────────────────────────────────────────────────────────────────
// Brand resolver
// ────────────────────────────────────────────────────────────────────
const BRAND_LANDMARKS: Record<string, LandmarkPoint[]> = {
  rolex: ROLEX_LANDMARKS,
  'audemars piguet': AP_LANDMARKS,
  ap: AP_LANDMARKS,
  tudor: TUDOR_LANDMARKS,
  'patek philippe': PATEK_LANDMARKS,
  patek: PATEK_LANDMARKS,
  omega: OMEGA_LANDMARKS,
};

/**
 * Resolve the landmark map for a watch by brand name. Falls back to a
 * 5-point generic map for any brand not explicitly registered.
 */
export function getLandmarksForBrand(brand: string | undefined): LandmarkPoint[] {
  if (!brand) return GENERIC_LANDMARKS;
  const key = brand.toLowerCase().trim();
  if (BRAND_LANDMARKS[key]) return BRAND_LANDMARKS[key];
  // Substring fallback — handles "Officine Panerai" → no match, but
  // covers brand variants without needing every alias in the table.
  for (const k of Object.keys(BRAND_LANDMARKS)) {
    if (key.includes(k) || k.includes(key)) return BRAND_LANDMARKS[k];
  }
  return GENERIC_LANDMARKS;
}

/**
 * Pairing helper — given a landmark and the Gemini auth signals array,
 * find the BEST matching signal by keyword overlap. Returns null when
 * no signal mentions any of the landmark's keywords.
 *
 * Returned weight ('positive' | 'negative' | 'neutral') drives the pin
 * colour: positive→green, negative→red, neutral→amber, none→gray.
 */
export type LandmarkSignalMatch = {
  signal: string;
  weight: 'positive' | 'negative' | 'neutral';
};

export function matchSignalToLandmark(
  landmark: LandmarkPoint,
  signals: Array<{ signal: string; weight: 'positive' | 'negative' | 'neutral' }>
): LandmarkSignalMatch | null {
  if (!signals?.length) return null;
  const lowerKeywords = landmark.signalKeywords.map((k) => k.toLowerCase());
  for (const s of signals) {
    const sl = (s.signal || '').toLowerCase();
    if (lowerKeywords.some((kw) => sl.includes(kw))) {
      return { signal: s.signal, weight: s.weight };
    }
  }
  return null;
}
