import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('❌ Missing credentials!');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function runDetailedDiagnostics() {
  console.log('🔍 Fetching first watch...');
  const { data: watch, error: fetchErr } = await supabase
    .from('watches')
    .select('id')
    .limit(1)
    .single();

  if (fetchErr) {
    console.error('❌ Failed to fetch a watch:', fetchErr.message);
    process.exit(1);
  }

  if (!watch) {
    console.log('❓ No watches found in database.');
    process.exit(0);
  }

  console.log(`🔍 Attempting to delete watch with ID: "${watch.id}"...`);
  const { error: deleteErr } = await supabase
    .from('watches')
    .delete()
    .eq('id', watch.id);

  if (deleteErr) {
    console.error('❌ Delete Failed!');
    console.error('Error Object:', JSON.stringify(deleteErr, null, 2));
  } else {
    console.log('✅ Deleted successfully!');
  }
}

runDetailedDiagnostics().catch(console.error);
