import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('❌ Environment variables are missing!');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function summarizeDatabase() {
  console.log('📊 Connecting to Supabase to fetch database summary (with pagination)...');
  
  // 1. Get total watch count
  const { count: totalWatches, error: countError } = await supabase
    .from('watches')
    .select('*', { count: 'exact', head: true });

  if (countError) {
    console.error('❌ Error getting watch count:', countError.message);
    process.exit(1);
  }

  // 2. Fetch all watch entries with pagination (1,000 rows per page)
  const watches: any[] = [];
  const pageSize = 1000;
  let page = 0;
  let hasMore = true;

  while (hasMore) {
    const fromRange = page * pageSize;
    const toRange = fromRange + pageSize - 1;

    const { data, error } = await supabase
      .from('watches')
      .select('brand, category, reference, case_material, dial_color, year_created')
      .range(fromRange, toRange);

    if (error) {
      console.error(`❌ Error fetching page ${page}:`, error.message);
      process.exit(1);
    }

    if (!data || data.length === 0) {
      hasMore = false;
    } else {
      watches.push(...data);
      page++;
      if (data.length < pageSize) {
        hasMore = false;
      }
    }
  }

  // 3. Aggregate data
  const brandCounts: Record<string, number> = {};
  const brandFamilies: Record<string, Set<string>> = {};
  const brandMaterials: Record<string, Set<string>> = {};
  const brandDials: Record<string, Set<string>> = {};
  
  for (const w of watches) {
    const brand = w.brand || 'Unknown';
    
    // Total per brand
    brandCounts[brand] = (brandCounts[brand] || 0) + 1;
    
    // Families / Model lines
    if (!brandFamilies[brand]) brandFamilies[brand] = new Set();
    
    let family = 'Other';
    const ref = w.reference || '';
    const nameLower = (w.brand + ' ' + w.reference).toLowerCase();
    
    if (ref.startsWith('116610') || nameLower.includes('submariner')) family = 'Submariner';
    else if (ref.startsWith('116500') || nameLower.includes('daytona')) family = 'Daytona';
    else if (ref.startsWith('5711') || nameLower.includes('nautilus')) family = 'Nautilus';
    else if (ref.startsWith('15400') || nameLower.includes('royal oak')) family = 'Royal Oak';
    else if (ref.startsWith('310.30') || nameLower.includes('speedmaster') || nameLower.includes('moonwatch')) family = 'Speedmaster Moonwatch';
    else if (ref.startsWith('WSSA001') || nameLower.includes('santos')) family = 'Santos';
    else if (ref.startsWith('M79030') || nameLower.includes('black bay')) family = 'Black Bay';
    else if (ref.startsWith('126710') || nameLower.includes('gmt-master') || nameLower.includes('gmt')) family = 'GMT-Master II';
    else if (ref.startsWith('126334') || nameLower.includes('datejust')) family = 'Datejust';
    else if (ref.startsWith('228238') || nameLower.includes('day-date')) family = 'Day-Date';
    else if (ref.startsWith('5167') || nameLower.includes('aquanaut')) family = 'Aquanaut';
    else if (ref.startsWith('5227') || nameLower.includes('calatrava')) family = 'Calatrava';
    else if (ref.toUpperCase().startsWith('PAM01312') || nameLower.includes('luminor')) family = 'Luminor';
    else if (ref.toUpperCase().startsWith('PAM01347') || nameLower.includes('radiomir')) family = 'Radiomir';
    else if (ref.toUpperCase().startsWith('PAM01223') || nameLower.includes('submersible')) family = 'Submersible';
    else if (ref.toUpperCase().startsWith('CBN2A1') || nameLower.includes('carrera')) family = 'Carrera';
    else if (ref.toUpperCase().startsWith('CBL211') || nameLower.includes('monaco')) family = 'Monaco';
    else if (ref.toUpperCase().startsWith('WBP201') || nameLower.includes('aquaracer')) family = 'Aquaracer';
    else if (ref.toUpperCase().startsWith('WAZ111') || nameLower.includes('formula 1')) family = 'Formula 1';
    
    brandFamilies[brand].add(family);

    // Materials
    if (!brandMaterials[brand]) brandMaterials[brand] = new Set();
    if (w.case_material) brandMaterials[brand].add(w.case_material);

    // Dials
    if (!brandDials[brand]) brandDials[brand] = new Set();
    if (w.dial_color) brandDials[brand].add(w.dial_color);
  }

  console.log('\n======================================================');
  console.log('🏆 LUXURY WATCH AUTHENTICATOR DATABASE SUMMARY');
  console.log('======================================================');
  console.log(`✨ Total Registered Watch Variations : ${totalWatches}`);
  console.log(`✨ Total Distinct Luxury Brands       : ${Object.keys(brandCounts).length}`);
  console.log('------------------------------------------------------');

  for (const brand of Object.keys(brandCounts).sort()) {
    console.log(`🔹 BRAND: ${brand.toUpperCase()}`);
    console.log(`   - Total Variations : ${brandCounts[brand]}`);
    console.log(`   - Model Line       : ${Array.from(brandFamilies[brand]).join(', ')}`);
    console.log(`   - Case Materials   : ${Array.from(brandMaterials[brand]).join(', ')}`);
    console.log(`   - Dial Colors      : ${Array.from(brandDials[brand]).join(', ')}`);
    console.log('------------------------------------------------------');
  }
}

summarizeDatabase().catch(console.error);
