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

async function listTables() {
  console.log('Connecting to Supabase at:', SUPABASE_URL);
  
  // We can call an RPC or a simple query to see if we get anything, or query pg_tables
  // Since we don't have direct SQL exec, let's see if we can do something with postgrest
  // or query a known amulet table
  const { data: embedData, error: embedError } = await supabase
    .from('fake_embeddings')
    .select('*')
    .limit(1);

  console.log('SELECT * FROM fake_embeddings response:');
  console.log('keys:', embedData ? Object.keys(embedData[0]) : null);
  console.log('data:', embedData);
  console.log('error:', embedError);
}

listTables().catch((err) => {
  console.error('💥 Fatal error:', err);
});
