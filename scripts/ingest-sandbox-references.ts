import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('❌ Environment variables EXPO_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY are missing!');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const DATASET_DIR = '/Users/kritsada/Desktop/Luxury Watch';

const BRAND_DIRECTORIES = [
  { dir: 'AudermarsPiguet', brandName: 'Audemars Piguet' },
  { dir: 'CARTIER', brandName: 'Cartier' },
  { dir: 'Corum', brandName: 'Corum' },
  { dir: 'IWC', brandName: 'IWC' },
  { dir: 'Omega', brandName: 'Omega' },
  { dir: 'Panerai', brandName: 'Panerai' },
  { dir: 'Patek', brandName: 'Patek Philippe' },
  { dir: 'Rolex', brandName: 'Rolex' },
  { dir: 'SevenFriday', brandName: 'SevenFriday' },
  { dir: 'TagHeuer', brandName: 'TAG Heuer' },
  { dir: 'Tudor', brandName: 'Tudor' },
  { dir: 'Others', brandName: 'Others' },
];

// Helper to parse CSV line robustly (handles commas inside quotes)
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

async function ingestSandboxWatches() {
  console.log('🏁 Starting Luxury Watch Sandbox Reference Ingestion Pipeline...');
  console.log(`📂 Source Directory: ${DATASET_DIR}`);
  console.log(`🌐 Target Supabase: ${SUPABASE_URL}\n`);

  if (!fs.existsSync(DATASET_DIR)) {
    console.error(`❌ Source directory does not exist: ${DATASET_DIR}`);
    process.exit(1);
  }

  // Clear existing sandbox watches first to make script fully re-runnable (idempotent)
  console.log('🧹 Clearing existing records in public.sandbox_watches...');
  const { error: clearError } = await supabase
    .from('sandbox_watches')
    .delete()
    .neq('id', 'clear-all');

  if (clearError) {
    console.error('❌ Failed to clear old sandbox_watches:', clearError.message);
    console.error('👉 Have you run the SQL migration schema in supabase/07-sandbox-schema.sql inside Supabase SQL Editor first?');
    process.exit(1);
  }
  console.log('✨ Table successfully cleared.\n');

  const watchesToInsert: any[] = [];
  const processedWatchIds = new Set<string>();

  for (const { dir, brandName } of BRAND_DIRECTORIES) {
    const dirPath = path.join(DATASET_DIR, dir);
    const catalogPath = path.join(dirPath, '_catalog.csv');

    if (!fs.existsSync(dirPath)) {
      console.warn(`⚠️ Brand folder skipped (not found): ${dirPath}`);
      continue;
    }

    if (!fs.existsSync(catalogPath)) {
      console.warn(`⚠️ Catalog CSV skipped (not found): ${catalogPath}`);
      continue;
    }

    console.log(`🔍 Processing brand folder: ${dir} (${brandName})...`);
    
    const fileContent = fs.readFileSync(catalogPath, 'utf-8');
    const lines = fileContent.split('\n').filter(l => l.trim().length > 0);
    
    // Skip header line: "filename,model,name,price_thb,source_url"
    let fileRowsParsed = 0;
    let watchesDiscovered = 0;

    for (let i = 1; i < lines.length; i++) {
      const parts = parseCSVLine(lines[i]);
      if (parts.length < 5) continue;

      const [filename, model, name, priceThbStr, sourceUrl] = parts;
      fileRowsParsed++;

      // Extract watch ID (everything before the underscore, e.g. "6a1027acf16dadcf6782b18e_1.jpeg" -> "6a1027acf16dadcf6782b18e")
      const watchIdMatch = filename.match(/^([^_]+)_(.+)$/);
      if (!watchIdMatch) continue;

      const watchId = `${brandName.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${watchIdMatch[1]}`;

      // Grouping logic: skip if we've already ingested the primary reference image for this watch ID
      if (processedWatchIds.has(watchId)) {
        continue;
      }

      processedWatchIds.add(watchId);
      watchesDiscovered++;

      // Parse price
      let priceThb: number | null = parseInt(priceThbStr.replace(/[^0-9]/g, ''), 10);
      if (isNaN(priceThb)) priceThb = null;

      // Construct path relative to desktop dataset
      const localPath = path.join(dirPath, filename);

      watchesToInsert.push({
        id: watchId,
        brand: brandName,
        model: model || 'N/A',
        name: name || `${brandName} Reference`,
        price_thb: priceThb,
        local_path: localPath,
        source_url: sourceUrl || '',
      });
    }

    console.log(`   └─ Found ${fileRowsParsed} image records, grouped into ${watchesDiscovered} unique timepieces.`);
  }

  console.log(`\n📦 Total unique watches prepared for ingestion: ${watchesToInsert.length}`);

  // Ingest watches in chunks of 500
  const chunkSize = 500;
  let successCount = 0;

  for (let i = 0; i < watchesToInsert.length; i += chunkSize) {
    const chunk = watchesToInsert.slice(i, i + chunkSize);
    const { error } = await supabase.from('sandbox_watches').insert(chunk);

    if (error) {
      console.error(`❌ Failed to upload chunk at offset ${i}:`, error.message);
      process.exit(1);
    }
    
    successCount += chunk.length;
    console.log(`   Uploaded ${successCount}/${watchesToInsert.length} sandbox watches...`);
  }

  console.log('\n🎉 SUCCESS: Isolated Sandbox Watch Reference Database successfully populated!');
  console.log(`🏆 Seeded ${successCount} verified luxury reference models.`);
}

ingestSandboxWatches().catch((err) => {
  console.error('💥 Fatal error in ingestion script:', err);
  process.exit(1);
});
