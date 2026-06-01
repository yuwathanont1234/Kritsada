/**
 * READ-ONLY coverage audit: local /official folder vs live image_embeddings table.
 * Answers: which brands (and how densely) are in the 1024-d RAG corpus the app
 * actually queries (match_watches), vs what's on disk. No writes.
 */
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const OFFICIAL = '/Users/kritsada/Desktop/Luxury Watch/official';
const IMG_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif', '.heic']);

// folder -> canonical brand display (superset from index_official.py)
const BRAND_DISPLAY: Record<string, string> = {
  Audemars_Piguet: 'Audemars Piguet', Breitling: 'Breitling', Cartier: 'Cartier',
  Chopard: 'Chopard', Franck_Muller: 'Franck Muller', Longines: 'Longines',
  Omega: 'Omega', Panerai: 'Panerai', Patek_Philippe: 'Patek Philippe', Rolex: 'Rolex',
  Seiko: 'Seiko', 'TAG_Heuer': 'TAG Heuer', 'TAG-Heuer': 'TAG Heuer', Tudor: 'Tudor',
  Zenith: 'Zenith', A_Lange_Soehne: 'A. Lange & Söhne', A_Lange_Sohne: 'A. Lange & Söhne',
  Angelus: 'Angelus', Arnold_Son: 'Arnold & Son', Bell_Ross: 'Bell & Ross',
  Blancpain: 'Blancpain', Bovet: 'Bovet', Breguet: 'Breguet', Bvlgari: 'Bvlgari',
  CVSTOS: 'CVSTOS', Christiaan_van_der_Klaauw: 'Christiaan van der Klaauw', Czapek: 'Czapek',
  De_Bethune: 'De Bethune', Edouard_Koehn: 'Édouard Koehn', F_P_Journe: 'F.P. Journe',
  FP_Journe: 'F.P. Journe', Girard_Perregaux: 'Girard-Perregaux', Gorilla: 'Gorilla',
  Greubel_Forsey: 'Greubel Forsey', HYT: 'HYT', H_Moser: 'H. Moser & Cie', Hublot: 'Hublot',
  IWC: 'IWC', Jacob_Co: 'Jacob & Co.', Jaeger_LeCoultre: 'Jaeger-LeCoultre',
  Lang_Heyne: 'Lang & Heyne', Laurent_Ferrier: 'Laurent Ferrier', Lederer: 'Lederer',
  Louis_Erard: 'Louis Erard', Louis_Moinet: 'Louis Moinet', MB_F: 'MB&F', Montblanc: 'Montblanc',
  Moritz_Grossmann: 'Moritz Grossmann', Nivada_Grenchen: 'Nivada Grenchen', Nomos: 'NOMOS Glashütte',
  Parmigiani_Fleurier: 'Parmigiani Fleurier', Richard_Mille: 'Richard Mille', Tissot: 'Tissot',
  Frederique_Constant: 'Frédérique Constant', Grand_Seiko: 'Grand Seiko',
  Vacheron_Constantin: 'Vacheron Constantin', Hermes: 'Hermès', Piaget: 'Piaget',
  Glashutte_Original: 'Glashütte Original', Oris: 'Oris', Hamilton: 'Hamilton', Mido: 'Mido',
  Maurice_Lacroix: 'Maurice Lacroix', Citizen: 'Citizen', Trilobe: 'Trilobe',
  Ulysse_Nardin: 'Ulysse Nardin', Urwerk: 'URWERK', Swatch_MoonSwatch: 'Swatch',
  Singer_Reimagined: 'Singer Reimagined', Armin_Strom: 'Armin Strom', Faberge: 'Fabergé',
};

function countImgs(dir: string): number {
  let n = 0;
  let entries: fs.Dirent[] = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return 0; }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) n += countImgs(p);
    else if (IMG_EXT.has(path.extname(e.name).toLowerCase())) n++;
  }
  return n;
}

async function main() {
  const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

  // 1. watches: id -> brand
  const id2brand = new Map<string, string>();
  const watchBrandCount: Record<string, number> = {};
  for (let page = 0; ; page++) {
    const { data, error } = await sb.from('watches').select('id, brand').range(page * 1000, page * 1000 + 999);
    if (error) { console.error('watches err', error.message); process.exit(1); }
    if (!data || data.length === 0) break;
    for (const w of data) { id2brand.set(w.id, w.brand || 'Unknown'); watchBrandCount[w.brand || 'Unknown'] = (watchBrandCount[w.brand || 'Unknown'] || 0) + 1; }
    if (data.length < 1000) break;
  }

  // 2. image_embeddings: watch_id -> brand tally
  const embBrandCount: Record<string, number> = {};
  let embTotal = 0;
  for (let page = 0; ; page++) {
    const { data, error } = await sb.from('image_embeddings').select('watch_id').range(page * 1000, page * 1000 + 999);
    if (error) { console.error('image_embeddings err', error.message); process.exit(1); }
    if (!data || data.length === 0) break;
    for (const r of data) { const b = id2brand.get(r.watch_id) || 'ORPHAN'; embBrandCount[b] = (embBrandCount[b] || 0) + 1; embTotal++; }
    if (data.length < 1000) break;
  }

  // 3. folder counts (live)
  const folder: Record<string, number> = {}; // display -> imgs (merging dup dirs)
  for (const dir of fs.readdirSync(OFFICIAL)) {
    if (dir.startsWith('_') || dir.startsWith('.')) continue;
    const full = path.join(OFFICIAL, dir);
    if (!fs.statSync(full).isDirectory()) continue;
    const disp = BRAND_DISPLAY[dir] || dir;
    folder[disp] = (folder[disp] || 0) + countImgs(full);
  }

  console.log('\n================ LIVE RAG CORPUS (image_embeddings, 1024-d match_watches) ================');
  console.log(`Total image_embeddings rows : ${embTotal}`);
  console.log(`Total watches rows          : ${id2brand.size}`);
  console.log(`Distinct brands in watches  : ${Object.keys(watchBrandCount).length}`);

  const allBrands = Array.from(new Set([...Object.keys(folder), ...Object.keys(embBrandCount)])).sort();
  console.log('\nBRAND'.padEnd(28) + 'FOLDER'.padStart(8) + 'DB_EMB'.padStart(8) + 'DB_WATCH'.padStart(9) + '  STATUS');
  console.log('-'.repeat(70));
  const missing: string[] = [], partial: string[] = [];
  for (const b of allBrands) {
    if (b === 'ORPHAN') continue;
    const f = folder[b] || 0, e = embBrandCount[b] || 0, w = watchBrandCount[b] || 0;
    let status = '✅ ok';
    if (f > 0 && e === 0) { status = '❌ NOT in RAG'; missing.push(`${b} (${f} imgs)`); }
    else if (f > 0 && e < f * 0.5 && f >= 10) { status = '⚠️ partial'; partial.push(`${b} (folder ${f} / db ${e})`); }
    console.log(b.padEnd(28) + String(f).padStart(8) + String(e).padStart(8) + String(w).padStart(9) + '  ' + status);
  }
  if (embBrandCount['ORPHAN']) console.log(`\n⚠️ ORPHAN image_embeddings (watch_id not in watches): ${embBrandCount['ORPHAN']}`);
  console.log('\n❌ ON DISK BUT NOT IN RAG (need indexing):');
  console.log(missing.length ? missing.map(m => '   - ' + m).join('\n') : '   (none)');
  console.log('\n⚠️ UNDER-INDEXED (<50% of folder, folder>=10):');
  console.log(partial.length ? partial.map(m => '   - ' + m).join('\n') : '   (none)');
}
main().catch(e => { console.error(e); process.exit(1); });
