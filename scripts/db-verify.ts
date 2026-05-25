import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('❌ Environment variables EXPO_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY are missing!');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function verifyDatabaseReferences() {
  console.log('⚡ Starting Database Reference Catalog Verification...');
  console.log(`Connecting to Supabase at: ${SUPABASE_URL}`);

  // Query image_embeddings for stock or unsplash keywords
  const { data, error } = await supabase
    .from('image_embeddings')
    .select('id, watch_id, image_url')
    .or('image_url.ilike.%unsplash%,image_url.ilike.%stock%');

  if (error) {
    console.error('❌ Database query failed:', error.message);
    process.exit(1);
  }

  const poisonedCount = data?.length || 0;

  if (poisonedCount > 0) {
    console.error(`\n❌ [DATABASE POISON DETECTED] Found ${poisonedCount} invalid stock or Unsplash references!`);
    console.error('------------------------------------------------------------');
    data.forEach((row, index) => {
      console.error(`[${index + 1}] ID: ${row.id} | Watch ID: ${row.watch_id} | URL: ${row.image_url}`);
    });
    console.error('------------------------------------------------------------');
    console.error('🚨 ACTION REQUIRED: Please run a database cleanup script immediately.');
    console.error('Reference watch catalog embeddings MUST only originate from authentic brand sources.');
    process.exit(1);
  }

  console.log('\n✅ [SUCCESS] Reference catalog database is perfectly clean (0 Unsplash/Stock rows).');
  process.exit(0);
}

verifyDatabaseReferences().catch((err) => {
  console.error('💥 Fatal error in verification script:', err);
  process.exit(1);
});
