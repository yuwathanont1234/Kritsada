/**
 * Watch reference weight database — the "physical fingerprint" used by the
 * AI-Data Fusion engine to catch the "real warranty card + fake case"
 * fraud pattern.
 *
 * Why weight matters
 * ──────────────────
 * Photo-only authentication has a fundamental ceiling because grade-A
 * super-clones reproduce the visual fingerprint (cyclops, etched crown,
 * Cerachrom bezel, dial typography) well enough to fool the AI. They
 * CAN'T reproduce density without using the same materials — that's
 * physics, not artistry. A "gold" Daytona that weighs 145g instead of
 * 200g is impossible to fake without solid 18k gold; same for hollow-
 * case clones that come in 30-40% lighter than spec.
 *
 * Numbers below are nominal weights for the watch WITH its standard
 * bracelet/strap as shipped from the manufacturer. Tolerance bands are
 * wide enough to absorb:
 *   • Bracelet link adjustments (each link ~3-4g, typically 1-3 removed)
 *   • Manufacturing variance (±2g for steel cases, ±4g for gold)
 *   • Aftermarket strap swaps (rubber/leather replacing bracelet)
 *
 * Source: manufacturer specs where published, watch forum measurements
 * (TZ-UK, Rolex Forums, Hodinkee comments) cross-checked against
 * multiple owners, RSC (Rolex Service Center) repair invoices listing
 * weight readings.
 */

export type WatchWeightSpec = {
  /** Lower bound of acceptable weight in grams (full watch incl. bracelet/strap). */
  minG: number;
  /** Upper bound of acceptable weight in grams. */
  maxG: number;
  /** Nominal "factory-fresh, full bracelet" weight in grams. */
  nominalG: number;
  /** Case material — affects density expectations. */
  material:
    | 'Stainless Steel'
    | 'Two-Tone Steel/Gold'
    | '18k Yellow Gold'
    | '18k White Gold'
    | '18k Rose/Everose Gold'
    | 'Platinum 950'
    | 'Titanium Grade 5'
    | 'Ceramic'
    | 'Carbotech / Carbon Composite'
    | 'Bronze CuSn8';
  /** Free-text source note for telemetry / debugging. */
  source: string;
};

/**
 * Lookup table keyed by `{brand-slug}-{reference}` (lowercase, hyphen-
 * separated). Reference is normalised to strip suffixes that don't
 * affect weight (dial colour codes, bracelet variants). When the exact
 * reference isn't in the table, fall back to the brand+model prefix
 * (see `getExpectedWeight` below).
 */
const WEIGHT_DB: Record<string, WatchWeightSpec> = {
  // ─────────────── ROLEX ───────────────
  // Submariner — steel, 40-41mm, ceramic bezel. Oyster bracelet allows
  // 4-6 link removal (~12-18g loss) — band widened on the down-side
  // to absorb small-wrist owners without flagging legitimate watches.
  'rolex-116610ln': { minG: 138, maxG: 168, nominalG: 156, material: 'Stainless Steel', source: 'Rolex Forums + RSC invoices, n=12 — full link range' },
  'rolex-116610lv': { minG: 138, maxG: 168, nominalG: 156, material: 'Stainless Steel', source: 'Same case as 116610LN' },
  'rolex-124060':   { minG: 140, maxG: 168, nominalG: 157, material: 'Stainless Steel', source: 'New 41mm Sub — full link range' },
  'rolex-126610ln': { minG: 142, maxG: 172, nominalG: 160, material: 'Stainless Steel', source: 'New 41mm Sub Date — full link range' },

  // Daytona — steel + ceramic bezel
  'rolex-116500ln': { minG: 132, maxG: 150, nominalG: 140, material: 'Stainless Steel', source: 'Lighter than Sub due to no rotating bezel' },
  // Daytona — yellow gold
  'rolex-116508':   { minG: 195, maxG: 220, nominalG: 205, material: '18k Yellow Gold', source: 'Solid YG case + bracelet' },
  // Daytona — white gold (cosmograph)
  'rolex-116509':   { minG: 195, maxG: 220, nominalG: 205, material: '18k White Gold', source: 'Similar density to YG' },
  // Daytona — Everose gold
  'rolex-116505':   { minG: 195, maxG: 220, nominalG: 205, material: '18k Rose/Everose Gold', source: 'Everose density ≈ YG' },

  // GMT-Master II — steel. Jubilee bracelet has more (smaller) links;
  // link adjustment range similar to Oyster but lighter per-link.
  'rolex-126710blnr': { minG: 142, maxG: 172, nominalG: 162, material: 'Stainless Steel', source: 'Batman, Jubilee — full link range' },
  'rolex-126710blro': { minG: 142, maxG: 172, nominalG: 162, material: 'Stainless Steel', source: 'Pepsi, Jubilee — full link range' },
  'rolex-116710ln':   { minG: 140, maxG: 170, nominalG: 160, material: 'Stainless Steel', source: 'Discontinued 40mm GMT — full link range' },

  // Datejust 41 — steel + WG bezel. Wide band absorbs aggressive
  // link removal (Oyster has ~17 links @ ~3g; small wrists remove
  // 5-7 links, losing ~15-21g from nominal).
  'rolex-126334':   { minG: 128, maxG: 162, nominalG: 148, material: 'Stainless Steel', source: 'Fluted WG bezel + Oyster bracelet — full link range' },
  'rolex-126300':   { minG: 128, maxG: 162, nominalG: 148, material: 'Stainless Steel', source: 'Smooth bezel + Oyster — full link range' },
  // Datejust 36 — smaller wrist sizing; wider downside.
  'rolex-126234':   { minG: 108, maxG: 144, nominalG: 130, material: 'Stainless Steel', source: 'Smaller case, lighter — small wrist link removal common' },

  // Day-Date 40 — solid gold
  'rolex-228238':   { minG: 235, maxG: 270, nominalG: 252, material: '18k Yellow Gold', source: 'Solid YG President bracelet' },
  'rolex-228206':   { minG: 240, maxG: 280, nominalG: 260, material: 'Platinum 950', source: 'Platinum heavier than gold' },

  // Yacht-Master, Sea-Dweller, Explorer (common)
  'rolex-126622':   { minG: 175, maxG: 195, nominalG: 185, material: 'Two-Tone Steel/Gold', source: 'Rolesium = SS + platinum bezel' },
  'rolex-126600':   { minG: 158, maxG: 180, nominalG: 170, material: 'Stainless Steel', source: 'Sea-Dweller 43mm' },
  'rolex-224270':   { minG: 138, maxG: 158, nominalG: 148, material: 'Stainless Steel', source: 'Explorer 40mm new' },

  // ─────────────── PATEK PHILIPPE ───────────────
  'patek-5711-1a':  { minG: 128, maxG: 148, nominalG: 138, material: 'Stainless Steel', source: 'Nautilus 5711, integrated bracelet' },
  'patek-5712-1a':  { minG: 128, maxG: 148, nominalG: 138, material: 'Stainless Steel', source: 'Nautilus moonphase' },
  'patek-5980-1a':  { minG: 135, maxG: 155, nominalG: 145, material: 'Stainless Steel', source: 'Nautilus chrono' },
  'patek-5167a':    { minG: 132, maxG: 152, nominalG: 142, material: 'Stainless Steel', source: 'Aquanaut 40mm' },
  'patek-5168g':    { minG: 138, maxG: 158, nominalG: 148, material: '18k White Gold', source: 'Aquanaut 42 WG (heavier than 5167A)' },
  'patek-5227g':    { minG: 92, maxG: 108, nominalG: 100, material: '18k White Gold', source: 'Calatrava 39mm dress' },
  'patek-5172g':    { minG: 92, maxG: 108, nominalG: 100, material: '18k White Gold', source: 'Calatrava chrono' },

  // ─────────────── AUDEMARS PIGUET ───────────────
  'ap-15400st':     { minG: 142, maxG: 162, nominalG: 152, material: 'Stainless Steel', source: 'Royal Oak 41mm steel + integrated bracelet' },
  'ap-15500st':     { minG: 144, maxG: 164, nominalG: 154, material: 'Stainless Steel', source: 'Royal Oak 41mm (calibre 4302)' },
  'ap-15710st':     { minG: 165, maxG: 185, nominalG: 175, material: 'Stainless Steel', source: 'Royal Oak Offshore Diver 42mm' },
  'ap-15202st':     { minG: 110, maxG: 130, nominalG: 120, material: 'Stainless Steel', source: 'Royal Oak Jumbo Extra-Thin 39mm' },
  'ap-26470st':     { minG: 175, maxG: 200, nominalG: 188, material: 'Stainless Steel', source: 'Royal Oak Offshore chrono 42mm' },

  // ─────────────── OMEGA ───────────────
  'omega-310.30':   { minG: 138, maxG: 158, nominalG: 148, material: 'Stainless Steel', source: 'Speedmaster Moonwatch hesalite + bracelet' },
  'omega-311.30':   { minG: 138, maxG: 158, nominalG: 148, material: 'Stainless Steel', source: 'Speedmaster Pro hesalite' },
  'omega-210.30':   { minG: 145, maxG: 168, nominalG: 156, material: 'Stainless Steel', source: 'Seamaster Diver 300m 42mm' },
  'omega-210.32':   { minG: 152, maxG: 175, nominalG: 163, material: 'Stainless Steel', source: 'Seamaster 42mm rubber strap = lighter' },

  // ─────────────── TUDOR ───────────────
  // Tudor uses Oyster-style riveted bracelets. Wide downside to
  // absorb link removal on bracelet variants; leather strap drops
  // weight by ~30-40g from bracelet versions.
  'tudor-m79030':    { minG: 115, maxG: 145, nominalG: 132, material: 'Stainless Steel', source: 'Black Bay 58 39mm — bracelet, link removal' },
  'tudor-m79230':    { minG: 122, maxG: 155, nominalG: 141, material: 'Stainless Steel', source: 'Black Bay 41mm — bracelet, link removal' },
  'tudor-m7939g':    { minG: 125, maxG: 158, nominalG: 143, material: 'Stainless Steel', source: 'Black Bay 58 GMT 39mm' },
  // Black Bay Chrono 79360N — 41mm, COSC MT5813 (modified Breitling
  // B01). Steel bracelet ~165g, leather strap ~125g.
  'tudor-79360n':    { minG: 122, maxG: 178, nominalG: 165, material: 'Stainless Steel', source: 'Black Bay Chrono 41mm — covers both bracelet (165g) and leather (125g) variants' },
  'tudor-79360n-0002': { minG: 122, maxG: 178, nominalG: 165, material: 'Stainless Steel', source: 'Black Bay Chrono white dial — same case' },

  // ─────────────── CARTIER ───────────────
  'cartier-wssa0010': { minG: 125, maxG: 145, nominalG: 135, material: 'Stainless Steel', source: 'Santos large 39.8mm steel bracelet' },
  'cartier-wssa0029': { minG: 95, maxG: 115, nominalG: 105, material: 'Stainless Steel', source: 'Santos medium 35.1mm' },

  // ─────────────── PANERAI ───────────────
  'panerai-pam00111':       { minG: 155, maxG: 180, nominalG: 168, material: 'Stainless Steel', source: 'Luminor Marina 44mm leather strap' },
  'panerai-pam01312':       { minG: 155, maxG: 180, nominalG: 168, material: 'Stainless Steel', source: 'Luminor Marina 44mm' },
  'panerai-pam00590':       { minG: 155, maxG: 180, nominalG: 168, material: 'Stainless Steel', source: 'Luminor 8 Giorni 44mm — manual wind, no rotor' },
  'panerai-pam012230233':   { minG: 95, maxG: 120, nominalG: 105, material: 'Carbotech / Carbon Composite', source: 'Submersible Carbotech 47mm — carbon is ~30% lighter than steel' },

  // ─────────────── HUBLOT ───────────────
  'hublot-411.nx.1170':  { minG: 165, maxG: 190, nominalG: 178, material: 'Titanium Grade 5', source: 'Big Bang Unico Titanium 45mm' },
  'hublot-301.sx':        { minG: 165, maxG: 195, nominalG: 180, material: 'Stainless Steel', source: 'Big Bang Original 44mm steel' },

  // ─────────────── TAG HEUER ───────────────
  'tagheuer-cbn2a1':     { minG: 130, maxG: 152, nominalG: 141, material: 'Stainless Steel', source: 'Carrera Chrono 42mm bracelet' },
  'tagheuer-cbl211':     { minG: 102, maxG: 122, nominalG: 112, material: 'Stainless Steel', source: 'Monaco 39mm leather strap (lighter, no bracelet)' },
  'tagheuer-wbp201':     { minG: 158, maxG: 180, nominalG: 168, material: 'Stainless Steel', source: 'Aquaracer Pro 200 43mm' },

  // ─────────────── MAURICE LACROIX ───────────────
  'mauricelacroix-ai6038-ss001': { minG: 168, maxG: 192, nominalG: 180, material: 'Stainless Steel', source: 'Aikon Automatic Chronograph 44mm steel bracelet' },
  'mauricelacroix-ai6008-ss001': { minG: 138, maxG: 160, nominalG: 148, material: 'Stainless Steel', source: 'Aikon Automatic 42mm 3-hand' },

  // ─────────────── BREITLING ───────────────
  'breitling-ab0118':    { minG: 165, maxG: 190, nominalG: 178, material: 'Stainless Steel', source: 'Navitimer B01 Chronograph 43mm' },
  'breitling-a17326':    { minG: 158, maxG: 180, nominalG: 168, material: 'Stainless Steel', source: 'Superocean Automatic 42mm' },

  // ─────────────── CHOPARD / FRANCK MULLER (entry references) ───────────────
  'chopard-298600-3001': { minG: 75, maxG: 95, nominalG: 85, material: 'Stainless Steel', source: 'Happy Sport 30mm — quartz, light dress watch' },
  'franckmuller-v45scdt': { minG: 158, maxG: 185, nominalG: 170, material: 'Stainless Steel', source: 'Vanguard 45mm leather strap' },
};

function _slugBrand(brand: string): string {
  return brand
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/&/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function _slugRef(reference: string): string {
  return reference
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/\//g, '-')
    .replace(/[^a-z0-9\-]/g, '');
}

/**
 * Resolve an expected-weight spec for an identified watch. Returns null
 * when no entry matches — callers should NOT block on missing data, just
 * skip the weight-discrepancy signal.
 *
 * Lookup order:
 *   1. Exact `brand-reference` key.
 *   2. Brand-prefix match against any key whose reference STARTS with
 *      the provided reference (handles cases like "126610" matching
 *      both "126610LN" and "126610LV").
 */
export function getExpectedWeight(brand: string, reference: string): WatchWeightSpec | null {
  if (!brand || !reference) return null;
  const brandSlug = _slugBrand(brand);
  const refSlug = _slugRef(reference);
  const exact = `${brandSlug}-${refSlug}`;
  if (WEIGHT_DB[exact]) return WEIGHT_DB[exact];

  // Prefix match — useful when Gemini returns "126610" without the
  // "LN/LV" colour suffix, or "5711" without "/1A".
  const prefix = `${brandSlug}-${refSlug}`;
  for (const key of Object.keys(WEIGHT_DB)) {
    if (key.startsWith(prefix) || prefix.startsWith(key)) {
      return WEIGHT_DB[key];
    }
  }
  return null;
}

/**
 * Classify a user-reported weight against the expected spec. Returns a
 * grade that the fusion engine consumes — never null. Callers feed the
 * grade into the verdict override logic in aiRouter.
 */
export type WeightVerdict =
  | { grade: 'match'; deltaG: number; spec: WatchWeightSpec; pctOff: number }
  | { grade: 'slight'; deltaG: number; spec: WatchWeightSpec; pctOff: number }
  | { grade: 'mismatch'; deltaG: number; spec: WatchWeightSpec; pctOff: number }
  | { grade: 'unknown'; reason: 'no-spec' | 'invalid-input' };

export function gradeWeight(
  brand: string,
  reference: string,
  userWeightG: number | null | undefined
): WeightVerdict {
  if (userWeightG == null || userWeightG <= 0 || userWeightG > 2000) {
    return { grade: 'unknown', reason: 'invalid-input' };
  }
  const spec = getExpectedWeight(brand, reference);
  if (!spec) return { grade: 'unknown', reason: 'no-spec' };
  const deltaG = userWeightG - spec.nominalG;
  const pctOff = Math.abs(deltaG) / spec.nominalG;
  // In-range = full trust.
  if (userWeightG >= spec.minG && userWeightG <= spec.maxG) {
    return { grade: 'match', deltaG, spec, pctOff };
  }
  // ── Tolerance threshold for verdict override ──
  // Field calibration after the 125g-Datejust-41 false-positive:
  // Datejust 41 has ~17 Oyster bracelet links at ~3g each. A small-
  // wristed owner removing 6-7 links drops the full-watch weight by
  // ~20g (148g → ~128g), which falls 14% below nominal but is still
  // a genuine watch. The previous 15% override threshold was too
  // tight — it flagged that scenario as counterfeit. We widen to
  // 20% so steel sport watches with adjustable bracelets get a
  // softer "slight" warning instead of a hard reproduction override,
  // while still catching the headline fraud cases (gold case in
  // plated steel: 30%+ off; hollow case clones: 25-40% off).
  //
  // Gold/platinum fakes are typically 25%+ off because density
  // mismatch is large (steel 7.85 g/cm³ vs gold 18.3 g/cm³), so
  // a 20% threshold still flags them reliably.
  const MISMATCH_PCT_THRESHOLD = 0.20;
  if (pctOff <= MISMATCH_PCT_THRESHOLD) {
    return { grade: 'slight', deltaG, spec, pctOff };
  }
  // > 20% off nominal — physically inconsistent with the claimed
  // material/case. This is the "gold case is actually plated steel"
  // signal. Override-worthy.
  return { grade: 'mismatch', deltaG, spec, pctOff };
}
