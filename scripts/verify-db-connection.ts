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

async function testConnection() {
  console.log('Connecting to Supabase at:', SUPABASE_URL);
  
  const { data, error } = await supabase
    .from('watches')
    .select('*')
    .limit(1);

  console.log('SELECT * FROM watches response:');
  console.log('data:', data);
  console.log('error:', error);
}

testConnection().catch((err) => {
  console.error('💥 Fatal error in test connection script:', err);
});



