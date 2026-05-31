/**
 * seed-price-cache.ts — Pre-populate watch_price_cache with top references
 * ============================================================================
 *
 * Why: Every "first scan" of a popular watch triggers a Gemini grounded
 * search costing ~฿0.85 and ~24s of latency. By pre-seeding the cache for
 * the top 100-200 references, we convert "first scan" → "instant cache hit"
 * for the majority of real-world scan traffic.
 *
 * How: Loops through TOP_REFERENCES, calls fetchWatchPricesGemini via the
 * analyze-watch Edge Function (same path the client uses), writes the
 * result to watch_price_cache via service_role.
 *
 * Run:
 *   npx ts-node scripts/seed-price-cache.ts
 *   # Or selective:
 *   npx ts-node scripts/seed-price-cache.ts --brand=Rolex
 *   npx ts-node scripts/seed-price-cache.ts --limit=20
 *   npx ts-node scripts/seed-price-cache.ts --dry-run
 *
 * Idempotent: re-runnable safely. Skips refs already cached and not yet
 * expired. The Edge Function does the actual Gemini call; we don't
 * duplicate prompts here.
 *
 * Cost: ~฿0.85 × N refs once every 30 days. At 200 refs = ฿170/month
 * to seed = saves ฿0.85 × ~3,000 first-time scans/month = ~฿2,550/month
 * net savings (15× ROI on a single seeding run).
 *
 * Privacy: This script runs server-side using SUPABASE_SERVICE_ROLE_KEY.
 * Never commit the key. Never run with EXPO_PUBLIC_ prefix.
 */

import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('❌ Missing EXPO_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ── CLI flags ────────────────────────────────────────────────────────
const args = new Map(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.split('=');
    return [k.replace(/^--/, ''), v ?? 'true'];
  })
);
const DRY_RUN = args.get('dry-run') === 'true';
const BRAND_FILTER = (args.get('brand') ?? '').toLowerCase();
const LIMIT = Number(args.get('limit') ?? '999');

// ── Top references to seed ────────────────────────────────────────────
// Compiled from Watchcharts top-traded / Chrono24 search-volume / Hodinkee
// "most discussed" lists for 2024-2025. Heavy lean toward Rolex/AP/Patek
// because they account for ~70% of scan volume per funnel telemetry.
//
// Add/remove entries here freely — re-running is idempotent and skips
// already-cached rows.
type RefSeed = { brand: string; reference: string; name: string };

const TOP_REFERENCES: RefSeed[] = [
  // ── Rolex (heavy weight, ~50% of scan traffic) ──
  { brand: 'Rolex', reference: '124060',     name: 'Submariner No-Date' },
  { brand: 'Rolex', reference: '126610LN',   name: 'Submariner Date' },
  { brand: 'Rolex', reference: '126610LV',   name: 'Submariner Date Green' },
  { brand: 'Rolex', reference: '116500LN',   name: 'Daytona' },
  { brand: 'Rolex', reference: '126500LN',   name: 'Daytona (new)' },
  { brand: 'Rolex', reference: '116610LN',   name: 'Submariner Date (discontinued)' },
  { brand: 'Rolex', reference: '116610LV',   name: 'Submariner Hulk' },
  { brand: 'Rolex', reference: '116710BLNR', name: 'GMT-Master II Batman' },
  { brand: 'Rolex', reference: '126710BLNR', name: 'GMT-Master II Batman (Jubilee)' },
  { brand: 'Rolex', reference: '126710BLRO', name: 'GMT-Master II Pepsi' },
  { brand: 'Rolex', reference: '126711CHNR', name: 'GMT-Master II Root Beer' },
  { brand: 'Rolex', reference: '116719BLRO', name: 'GMT-Master II Pepsi WG' },
  { brand: 'Rolex', reference: '126300',     name: 'Datejust 41' },
  { brand: 'Rolex', reference: '126233',     name: 'Datejust 36 Two-Tone' },
  { brand: 'Rolex', reference: '124300',     name: 'Oyster Perpetual 41' },
  { brand: 'Rolex', reference: '124200',     name: 'Oyster Perpetual 34' },
  { brand: 'Rolex', reference: '126334',     name: 'Datejust 41 White Gold Bezel' },
  { brand: 'Rolex', reference: '228238',     name: 'Day-Date 40 Yellow Gold' },
  { brand: 'Rolex', reference: '228206',     name: 'Day-Date 40 Platinum' },
  { brand: 'Rolex', reference: '228239',     name: 'Day-Date 40 White Gold' },
  { brand: 'Rolex', reference: '326934',     name: 'Sky-Dweller Steel' },
  { brand: 'Rolex', reference: '326933',     name: 'Sky-Dweller Two-Tone' },
  { brand: 'Rolex', reference: '326935',     name: 'Sky-Dweller Everose' },
  { brand: 'Rolex', reference: '226570',     name: 'Explorer II Polar' },
  { brand: 'Rolex', reference: '226570BLK',  name: 'Explorer II Black' },
  { brand: 'Rolex', reference: '124270',     name: 'Explorer 36' },
  { brand: 'Rolex', reference: '224270',     name: 'Explorer 40' },
  { brand: 'Rolex', reference: '126620',     name: 'Sea-Dweller' },
  { brand: 'Rolex', reference: '116660',     name: 'Sea-Dweller Deepsea' },
  { brand: 'Rolex', reference: '136660',     name: 'Sea-Dweller Deepsea (new)' },
  { brand: 'Rolex', reference: '79320N',     name: 'Yacht-Master 37' },
  { brand: 'Rolex', reference: '126622',     name: 'Yacht-Master 40 Two-Tone' },
  { brand: 'Rolex', reference: '226659',     name: 'Yacht-Master 42 WG' },
  { brand: 'Rolex', reference: '50506',      name: 'Cellini Time' },
  { brand: 'Rolex', reference: '116515LN',   name: 'Daytona Everose Rubber' },
  { brand: 'Rolex', reference: '126506',     name: 'Daytona Platinum' },

  // ── Patek Philippe ──
  { brand: 'Patek Philippe', reference: '5711/1A-010', name: 'Nautilus' },
  { brand: 'Patek Philippe', reference: '5711/1A-014', name: 'Nautilus Olive Green' },
  { brand: 'Patek Philippe', reference: '5740/1G',     name: 'Nautilus Perpetual Calendar' },
  { brand: 'Patek Philippe', reference: '5980/1A',     name: 'Nautilus Chronograph' },
  { brand: 'Patek Philippe', reference: '5990/1A',     name: 'Nautilus Travel Time Chronograph' },
  { brand: 'Patek Philippe', reference: '5167A',       name: 'Aquanaut' },
  { brand: 'Patek Philippe', reference: '5168G',       name: 'Aquanaut 42 White Gold' },
  { brand: 'Patek Philippe', reference: '5968A',       name: 'Aquanaut Chronograph' },
  { brand: 'Patek Philippe', reference: '5227G',       name: 'Calatrava 39mm WG' },
  { brand: 'Patek Philippe', reference: '5235/50R',    name: 'Annual Calendar Regulator' },
  { brand: 'Patek Philippe', reference: '5905P',       name: 'Annual Calendar Chronograph' },
  { brand: 'Patek Philippe', reference: '5396G',       name: 'Annual Calendar Moonphase' },

  // ── Audemars Piguet ──
  { brand: 'Audemars Piguet', reference: '15500ST',   name: 'Royal Oak 41mm' },
  { brand: 'Audemars Piguet', reference: '15510ST',   name: 'Royal Oak 41 (new gen)' },
  { brand: 'Audemars Piguet', reference: '15202ST',   name: 'Royal Oak Jumbo' },
  { brand: 'Audemars Piguet', reference: '16202ST',   name: 'Royal Oak Jumbo 50th Anniversary' },
  { brand: 'Audemars Piguet', reference: '15400ST',   name: 'Royal Oak 41mm (discontinued)' },
  { brand: 'Audemars Piguet', reference: '15407ST',   name: 'Royal Oak Double Balance' },
  { brand: 'Audemars Piguet', reference: '26240ST',   name: 'Royal Oak Chronograph 41mm' },
  { brand: 'Audemars Piguet', reference: '26331ST',   name: 'Royal Oak Chronograph (older)' },
  { brand: 'Audemars Piguet', reference: '26470ST',   name: 'Royal Oak Offshore 42mm' },
  { brand: 'Audemars Piguet', reference: '26420SO',   name: 'Royal Oak Offshore 43mm' },
  { brand: 'Audemars Piguet', reference: '15710ST',   name: 'Royal Oak Offshore Diver' },
  { brand: 'Audemars Piguet', reference: '15720ST',   name: 'Royal Oak Offshore Diver (new)' },

  // ── Omega ──
  { brand: 'Omega', reference: '310.30.42.50.01.001', name: 'Speedmaster Moonwatch Professional' },
  { brand: 'Omega', reference: '311.30.42.30.01.005', name: 'Speedmaster Professional (older)' },
  { brand: 'Omega', reference: '210.30.42.20.01.001', name: 'Seamaster Diver 300M' },
  { brand: 'Omega', reference: '210.30.42.20.03.001', name: 'Seamaster Diver Blue' },
  { brand: 'Omega', reference: '215.30.44.21.01.001', name: 'Seamaster Planet Ocean 600M' },
  { brand: 'Omega', reference: '220.10.41.21.01.001', name: 'Seamaster Aqua Terra 41mm' },
  { brand: 'Omega', reference: '522.30.40.20.04.001', name: 'Seamaster 1948 Limited' },
  { brand: 'Omega', reference: '329.30.42.51.06.001', name: 'Speedmaster X-33 Marstimer' },
  { brand: 'Omega', reference: 'SO33B100',            name: 'MoonSwatch Mission to Mars' },
  { brand: 'Omega', reference: 'SO33L100',            name: 'MoonSwatch Mission to Earth' },
  { brand: 'Omega', reference: 'SO33M100',            name: 'MoonSwatch Mission to Mercury' },

  // ── Tudor ──
  { brand: 'Tudor', reference: '79030N',  name: 'Black Bay Fifty-Eight' },
  { brand: 'Tudor', reference: '79030B',  name: 'Black Bay 58 Blue' },
  { brand: 'Tudor', reference: '79730',   name: 'Black Bay 41' },
  { brand: 'Tudor', reference: 'M79230N', name: 'Black Bay (older)' },
  { brand: 'Tudor', reference: '79363N',  name: 'Black Bay Chrono' },
  { brand: 'Tudor', reference: '25710BB', name: 'Pelagos 39' },
  { brand: 'Tudor', reference: '25600TN', name: 'Pelagos LHD' },
  { brand: 'Tudor', reference: '79220R',  name: 'Heritage Black Bay Red' },

  // ── Cartier ──
  { brand: 'Cartier', reference: 'WSSA0030', name: 'Santos de Cartier Large' },
  { brand: 'Cartier', reference: 'WSSA0029', name: 'Santos de Cartier Medium' },
  { brand: 'Cartier', reference: 'WSSA0018', name: 'Santos Skeleton' },
  { brand: 'Cartier', reference: 'WJTA0007', name: 'Tank Must SolarBeat' },
  { brand: 'Cartier', reference: 'WSTA0029', name: 'Tank Must Large' },
  { brand: 'Cartier', reference: 'WGNM0014', name: 'Pasha de Cartier' },

  // ── IWC ──
  { brand: 'IWC', reference: 'IW328201', name: 'Pilot Mark XX' },
  { brand: 'IWC', reference: 'IW377709', name: 'Pilot Chronograph' },
  { brand: 'IWC', reference: 'IW329301', name: 'Pilot Top Gun' },
  { brand: 'IWC', reference: 'IW358001', name: 'Portugieser Automatic 40' },

  // ── Vacheron Constantin ──
  { brand: 'Vacheron Constantin', reference: '4500V/110A-B128', name: 'Overseas 41mm' },
  { brand: 'Vacheron Constantin', reference: '4520V/210R-B718', name: 'Overseas Chronograph' },

  // ── Panerai ──
  { brand: 'Panerai', reference: 'PAM01312', name: 'Luminor Marina' },
  { brand: 'Panerai', reference: 'PAM01392', name: 'Submersible 42mm' },

  // ── Grand Seiko ──
  { brand: 'Grand Seiko', reference: 'SBGA413', name: 'Spring Drive Snowflake' },
  { brand: 'Grand Seiko', reference: 'SBGJ201', name: 'Hi-Beat GMT' },

  // ── TAG Heuer ──
  { brand: 'TAG Heuer', reference: 'CBN2010.BA0642', name: 'Carrera Chronograph' },
  { brand: 'TAG Heuer', reference: 'WAZ1110.BA0875', name: 'Formula 1 Quartz' },

  // ── 2026-05-27 expansion: 15 brands seeded via scrape_apify.py ──
  // Refs chosen are flagship / most-traded models per brand. Price
  // cache hit rate for these directly correlates with scan cost.

  // ── A. Lange & Söhne ──
  { brand: 'A. Lange & Söhne', reference: '191.039',  name: 'Lange 1' },
  { brand: 'A. Lange & Söhne', reference: '405.035',  name: 'Datograph Up/Down' },
  { brand: 'A. Lange & Söhne', reference: '380.026',  name: 'Saxonia Thin' },
  { brand: 'A. Lange & Söhne', reference: '363.179',  name: 'Odysseus Steel' },
  { brand: 'A. Lange & Söhne', reference: '233.026',  name: '1815 Up/Down' },

  // ── F.P. Journe ──
  { brand: 'F.P. Journe', reference: 'Chronomètre Bleu', name: 'Chronomètre Bleu' },
  { brand: 'F.P. Journe', reference: 'Octa Lune',        name: 'Octa Lune' },
  { brand: 'F.P. Journe', reference: 'Élégante 40',      name: 'Élégante 40mm' },

  // ── Jaeger-LeCoultre ──
  { brand: 'Jaeger-LeCoultre', reference: 'Q3858520', name: 'Reverso Tribute Monoface Small Seconds' },
  { brand: 'Jaeger-LeCoultre', reference: 'Q1338471', name: 'Master Ultra Thin Date' },
  { brand: 'Jaeger-LeCoultre', reference: 'Q9068670', name: 'Polaris Mariner Memovox' },
  { brand: 'Jaeger-LeCoultre', reference: 'Q1548530', name: 'Master Control Date' },
  { brand: 'Jaeger-LeCoultre', reference: 'Q3208420', name: 'Rendez-Vous Night & Day' },

  // ── Hublot ──
  { brand: 'Hublot', reference: '411.NX.1170.RX',     name: 'Big Bang Unico Titanium' },
  { brand: 'Hublot', reference: '441.NX.1171.RX',     name: 'Big Bang Unico Titanium 42mm' },
  { brand: 'Hublot', reference: '521.NX.1170.RX',     name: 'Classic Fusion 45mm Titanium' },
  { brand: 'Hublot', reference: '511.OX.2611.LR',     name: 'Classic Fusion King Gold' },
  { brand: 'Hublot', reference: '601.NX.0173.LR',     name: 'Spirit of Big Bang' },
  { brand: 'Hublot', reference: '821.NX.0170.RX',     name: 'Square Bang Unico' },

  // ── Breitling ──
  { brand: 'Breitling', reference: 'AB0139211B1A1',   name: 'Navitimer B01 Chronograph 43' },
  { brand: 'Breitling', reference: 'A17376211B1A1',   name: 'Superocean Heritage 57' },
  { brand: 'Breitling', reference: 'A32395101B1S1',   name: 'Avenger Automatic 42' },
  { brand: 'Breitling', reference: 'AB2010121B1A1',   name: 'Premier B01 Chronograph 42' },
  { brand: 'Breitling', reference: 'AB0134101G1A1',   name: 'Chronomat B01 42' },
  { brand: 'Breitling', reference: 'A23311241B1X1',   name: 'Top Time B01' },

  // ── Zenith ──
  { brand: 'Zenith', reference: '03.3300.3613/21.M3300', name: 'Chronomaster Open 39.5mm' },
  { brand: 'Zenith', reference: '03.2040.4061/21.C496',   name: 'Chronomaster Sport' },
  { brand: 'Zenith', reference: '95.9000.9004/78.R582',   name: 'Defy 21' },
  { brand: 'Zenith', reference: '03.3100.3600/21.M3100',  name: 'Chronomaster Original' },
  { brand: 'Zenith', reference: '03.2430.4069/21.C800',   name: 'Pilot Type 20 Chronograph' },

  // ── Bvlgari ──
  { brand: 'Bvlgari', reference: '103297', name: 'Octo Finissimo Automatic' },
  { brand: 'Bvlgari', reference: '102912', name: 'Octo Finissimo Chronograph GMT' },
  { brand: 'Bvlgari', reference: '103432', name: 'Serpenti Tubogas' },
  { brand: 'Bvlgari', reference: '103145', name: 'Diagono Magnesium' },
  { brand: 'Bvlgari', reference: '103702', name: 'Aluminium 40mm' },

  // ── Franck Muller ──
  { brand: 'Franck Muller', reference: '8880 SC DT', name: 'Cintrée Curvex Color Dreams' },
  { brand: 'Franck Muller', reference: 'V 45 SC DT', name: 'Vanguard' },
  { brand: 'Franck Muller', reference: '5850 CH',    name: 'Cintrée Curvex Crazy Hours' },
  { brand: 'Franck Muller', reference: '1000 SC',    name: 'Long Island' },

  // ── Girard-Perregaux ──
  { brand: 'Girard-Perregaux', reference: '81005-11-431-11A', name: 'Laureato 42mm' },
  { brand: 'Girard-Perregaux', reference: '81010-11-432-32A', name: 'Laureato Chronograph 42mm' },
  { brand: 'Girard-Perregaux', reference: '49555-11-131-BB60', name: '1966 40mm' },

  // ── MB&F ──
  { brand: 'MB&F', reference: 'HM10 Bulldog', name: 'Horological Machine N°10 Bulldog' },
  { brand: 'MB&F', reference: 'LM101',        name: 'Legacy Machine 101' },
  { brand: 'MB&F', reference: 'LMX',          name: 'Legacy Machine LMX' },

  // ── URWERK ──
  { brand: 'URWERK', reference: 'UR-100V',   name: 'UR-100V Iron' },
  { brand: 'URWERK', reference: 'UR-110',    name: 'UR-110 Torpedo' },
  { brand: 'URWERK', reference: 'UR-220 SL', name: 'UR-220 SL Asimov' },

  // ── Bovet ──
  { brand: 'Bovet', reference: 'Récital 22', name: 'Récital 22 Grand Récital' },
  { brand: 'Bovet', reference: 'Amadeo Fleurier', name: 'Amadeo Fleurier 39' },

  // ── Ulysse Nardin ──
  { brand: 'Ulysse Nardin', reference: '1183-170-3/93', name: 'Marine Chronograph 43mm' },
  { brand: 'Ulysse Nardin', reference: '8163-175-3A/92', name: 'Diver 44mm' },
  { brand: 'Ulysse Nardin', reference: '2505-250',       name: 'Freak X' },
  { brand: 'Ulysse Nardin', reference: '1183-310/40',    name: 'Marine Torpilleur' },

  // ── Parmigiani Fleurier ──
  { brand: 'Parmigiani Fleurier', reference: 'PFC910-1020001', name: 'Tonda PF Micro-Rotor' },
  { brand: 'Parmigiani Fleurier', reference: 'PFC931-1020002', name: 'Tonda PF Automatic 40mm' },
  { brand: 'Parmigiani Fleurier', reference: 'PFC272-1000300', name: 'Kalpa Hebdomadaire' },

  // ── Longines ──
  { brand: 'Longines', reference: 'L2.793.4.92.0',   name: 'Master Collection Annual Calendar' },
  { brand: 'Longines', reference: 'L3.781.4.96.6',   name: 'HydroConquest 41mm' },
  { brand: 'Longines', reference: 'L3.811.4.53.0',   name: 'Spirit Zulu Time' },
  { brand: 'Longines', reference: 'L3.781.4.06.6',   name: 'Conquest Automatic' },
  { brand: 'Longines', reference: 'L2.812.4.53.0',   name: 'Heritage Classic Chronograph' },
  { brand: 'Longines', reference: 'L3.674.4.50.0',   name: 'Legend Diver No Date' },

  // ── Seiko ──
  { brand: 'Seiko', reference: 'SPB143J1',  name: 'Prospex 1965 Diver Modern Re-interpretation' },
  { brand: 'Seiko', reference: 'SPB317J1',  name: 'Prospex Save the Ocean' },
  { brand: 'Seiko', reference: 'SARY153',   name: 'Presage Cocktail Time' },
  { brand: 'Seiko', reference: 'SRPK87K1',  name: 'Seiko 5 Sports GMT' },
  { brand: 'Seiko', reference: 'SSE183',    name: 'Astron GPS Solar' },
  { brand: 'Seiko', reference: 'SRP777K1',  name: 'Prospex Turtle' },
  { brand: 'Seiko', reference: 'SRPB51K1',  name: 'Prospex Samurai' },
];

console.log(`📊 Total references in seed list: ${TOP_REFERENCES.length}`);

// ── Filter & cap ────────────────────────────────────────────────────
let queue = TOP_REFERENCES;
if (BRAND_FILTER) {
  queue = queue.filter((r) => r.brand.toLowerCase().includes(BRAND_FILTER));
  console.log(`🔍 Brand filter "${BRAND_FILTER}" → ${queue.length} refs`);
}
queue = queue.slice(0, LIMIT);
console.log(`▶  Queue size: ${queue.length} refs (limit=${LIMIT})`);

if (DRY_RUN) {
  console.log('\n🛠️  DRY RUN — would process the following:');
  for (const r of queue) {
    console.log(`   - ${r.brand.padEnd(20)} ${r.reference.padEnd(28)} ${r.name}`);
  }
  process.exit(0);
}

// ── Cache check ─────────────────────────────────────────────────────
async function isAlreadyCached(brand: string, reference: string): Promise<boolean> {
  const brandKey = brand.trim().toLowerCase();
  const refKey = reference.trim().toLowerCase();
  const { data } = await supabase
    .from('watch_price_cache')
    .select('expires_at')
    .eq('brand_key', brandKey)
    .eq('ref_key', refKey)
    .maybeSingle();
  if (!data) return false;
  return new Date(data.expires_at).getTime() > Date.now();
}

// ── Fetch via Edge Function ─────────────────────────────────────────
// We call analyze-watch directly with the price prompt — same code path
// the client uses, so we share the grounded-search prompt + parsing logic.
//
// Retries: 503 / 500 "empty content" are transient (Gemini load spikes,
// grounded-search occasional empty completions). Retry up to 3× with
// exponential backoff. After 3 retries we move on — the row just won't
// be cached this run and the next live scan will populate it.
async function fetchPriceFromGemini(seed: RefSeed): Promise<any | null> {
  const prompt =
    `You are a luxury-watch market analyst. Use Google Search to find current secondary-market prices for:\n` +
    `Brand: ${seed.brand}\nReference: ${seed.reference}\nModel: ${seed.name}\n\n` +
    `Return a JSON object matching this shape (no markdown, no commentary, JUST the JSON object):\n` +
    `{\n` +
    `  "marketPrice": <USD median number>,\n` +
    `  "priceRangeUSD": { "min": <number>, "max": <number>, "median": <number> },\n` +
    `  "priceByGrade": { "nos": <number>, "mint": <number>, "good": <number>, "fair": <number> },\n` +
    `  "priceNotes": "<1-2 sentence summary>",\n` +
    `  "priceSources": [{ "url": "<url>", "title": "<page title>", "priceFound": <number> }],\n` +
    `  "priceDataFreshness": "fresh"\n` +
    `}\n` +
    `Cite at least 2 sources (chrono24, watchcharts, hodinkee, bobs, sothebys). If a grade is unavailable, omit it. RESPOND WITH ONLY THE JSON OBJECT — no preamble, no markdown fences, no trailing text.`;

  const url = `${SUPABASE_URL}/functions/v1/analyze-watch`;
  const MAX_RETRIES = 3;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        apikey: SERVICE_ROLE_KEY!,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        systemInstruction:
          'You are a precise watch-market analyst. Always return JSON ONLY in the requested shape. Ground every number in cited web sources. Never wrap output in markdown code fences.',
        parts: [{ text: prompt }],
        enableWebSearch: true,
        disableThinking: true,
        maxOutputTokens: 4000,
        label: 'price',
      }),
    });

    const status = resp.status;
    const bodyText = await resp.text();

    // Try to parse as JSON regardless of status — Edge wraps errors in JSON
    let body: any = null;
    try { body = JSON.parse(bodyText); } catch { /* keep null */ }

    // Transient: retry with backoff
    const isTransient =
      status === 503 ||
      status === 504 ||
      status === 500 ||
      (status === 502) ||
      (body?.error && /empty content|high demand|currently experiencing|timeout/i.test(body.error));

    if (isTransient && attempt < MAX_RETRIES) {
      const delay = 3000 * attempt; // 3s, 6s, 9s
      console.warn(`   ↻ transient HTTP ${status} (attempt ${attempt}/${MAX_RETRIES}) — retrying in ${delay / 1000}s...`);
      await new Promise((r) => setTimeout(r, delay));
      continue;
    }

    if (!resp.ok) {
      console.warn(`   ⚠️  HTTP ${status}: ${bodyText.slice(0, 200)}`);
      return null;
    }
    if (body?.error) {
      console.warn(`   ⚠️  Edge error: ${body.error}`);
      return null;
    }

    // ── Robust payload extraction ──
    // The edge function may return:
    //   (a) Parsed JSON directly (price object)        ← happy path
    //   (b) { text: "..." } when JSON.parse failed     ← grounded responses
    //   (c) Object with extra nesting from Gemini      ← rare
    //
    // Walk the body to find a price object. Citation markers like
    // "[1]" / "【1】" can appear inside number strings — strip them out.
    const candidate = extractPricePayload(body);
    return candidate;
  }

  return null;
}

// Extract a price payload from various response shapes Gemini may emit
// when grounded search is enabled.
function extractPricePayload(body: any): any | null {
  if (!body) return null;

  // (a) Already shaped correctly
  if (typeof body.marketPrice === 'number') return body;

  // (b) Wrapped in { text } — try to JSON-parse the text
  if (typeof body.text === 'string') {
    const cleaned = body.text
      .replace(/```(?:json)?/gi, '')
      .replace(/【\d+†?[^】]*】/g, '') // citation markers like 【1†source】
      .replace(/\[\d+\]/g, '')        // citation markers like [1]
      .trim();

    // Find the JSON object boundaries
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      try {
        const slice = cleaned.slice(firstBrace, lastBrace + 1);
        const parsed = JSON.parse(slice);
        if (typeof parsed.marketPrice === 'number') return parsed;
        // Try extracting median from priceRangeUSD if marketPrice missing
        if (typeof parsed.priceRangeUSD?.median === 'number') {
          return { ...parsed, marketPrice: parsed.priceRangeUSD.median };
        }
      } catch {
        // fall through
      }
    }

    // Last resort — regex-extract a number near the word "median" or "marketPrice"
    const m = cleaned.match(/"?marketPrice"?\s*:\s*\$?([\d,]+)/i)
          || cleaned.match(/"?median"?\s*:\s*\$?([\d,]+)/i)
          || cleaned.match(/\$\s*([\d,]+(?:\.\d+)?)\s*(?:USD|usd)?/);
    if (m) {
      const num = parseFloat(m[1].replace(/,/g, ''));
      if (num > 100 && num < 5_000_000) {
        return {
          marketPrice: num,
          priceRangeUSD: { min: num * 0.85, max: num * 1.15, median: num },
          priceNotes: 'Extracted from text (heuristic fallback)',
          priceDataFreshness: 'mixed',
        };
      }
    }
  }

  // (c) marketPrice nested somewhere
  if (typeof body.priceRangeUSD?.median === 'number') {
    return { ...body, marketPrice: body.priceRangeUSD.median };
  }

  return null;
}

// ── Upsert cache row ────────────────────────────────────────────────
async function upsertCacheRow(seed: RefSeed, payload: any): Promise<boolean> {
  const brandKey = seed.brand.trim().toLowerCase();
  const refKey = seed.reference.trim().toLowerCase();
  const now = new Date();
  const expires = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // +30 days

  const { error } = await supabase.from('watch_price_cache').upsert(
    {
      brand_key: brandKey,
      ref_key: refKey,
      brand: seed.brand,
      ref: seed.reference,
      market_price_usd: payload?.marketPrice ?? null,
      price_payload: payload,
      source: 'gemini-grounded-seed',
      cached_at: now.toISOString(),
      expires_at: expires.toISOString(),
    },
    { onConflict: 'brand_key,ref_key' }
  );
  if (error) {
    console.warn(`   ⚠️  upsert failed: ${error.message}`);
    return false;
  }
  return true;
}

// ── Main loop ──────────────────────────────────────────────────────
(async () => {
  let fetched = 0;
  let failed = 0;
  let skipped = 0;

  const t0 = Date.now();

  for (let i = 0; i < queue.length; i++) {
    const seed = queue[i];
    const tag = `[${i + 1}/${queue.length}] ${seed.brand} ${seed.reference}`;

    try {
      if (await isAlreadyCached(seed.brand, seed.reference)) {
        console.log(`${tag} ✓ already cached, skipping`);
        skipped++;
        continue;
      }

      console.log(`${tag} → calling Gemini grounded...`);
      const payload = await fetchPriceFromGemini(seed);
      if (!payload || typeof payload.marketPrice !== 'number' || payload.marketPrice <= 0) {
        console.warn(`${tag} ✗ no usable price returned`);
        failed++;
        continue;
      }
      const ok = await upsertCacheRow(seed, payload);
      if (ok) {
        console.log(`${tag} ✓ cached (median $${payload.marketPrice.toLocaleString()})`);
        fetched++;
      } else {
        failed++;
      }
    } catch (e: any) {
      console.warn(`${tag} ✗ exception: ${e?.message ?? e}`);
      failed++;
    }

    // Throttle: Gemini grounded has rate limits; sleep 2s between calls.
    if (i < queue.length - 1) {
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  const dt = ((Date.now() - t0) / 1000).toFixed(1);
  console.log('');
  console.log('═══════════════════════════════════════════');
  console.log(`  Seed run complete in ${dt}s`);
  console.log(`  ✓ Fetched & cached: ${fetched}`);
  console.log(`  ✓ Already cached (skipped): ${skipped}`);
  console.log(`  ✗ Failed: ${failed}`);
  console.log(`  Total processed: ${queue.length}`);
  console.log('═══════════════════════════════════════════');
  console.log('');
  console.log(`  Estimated cost: ~$${(fetched * 0.025).toFixed(2)} ≈ ฿${(fetched * 0.85).toFixed(0)}`);
  console.log(`  Estimated future savings: ~฿${(fetched * 0.85 * 15).toFixed(0)} (15× ROI vs uncached scans)`);
  console.log('');
})();
