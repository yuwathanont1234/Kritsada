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

async function main() {
  console.log('📡 Fetching logged cost events from live Supabase instance...');
  
  const { data: events, error } = await supabase
    .from('cost_events')
    .select('*');

  if (error) {
    console.error('❌ Error fetching cost events:', error.message);
    process.exit(1);
  }

  if (!events || events.length === 0) {
    console.log('\n=======================================');
    console.log('📉 ACTUAL PIPELINE COST METRICS (LIVE)');
    console.log('=======================================');
    console.log('ℹ️ No cost events logged in the cost_events table yet.');
    console.log('👉 Tip: Once scans are executed, costs are logged in real-time!');
    console.log('=======================================');
    return;
  }

  console.log(`📊 Total cost events logged: ${events.length}`);

  let totalCostUsd = 0;
  let scanCount = 0;
  let cacheHitCount = 0;
  const otherCounts: Record<string, number> = {};
  const otherCosts: Record<string, number> = {};

  for (const e of events) {
    const cost = Number(e.cost_usd) || 0;
    totalCostUsd += cost;
    const type = e.event_type || 'unknown';
    otherCounts[type] = (otherCounts[type] || 0) + 1;
    otherCosts[type] = (otherCosts[type] || 0) + cost;

    if (type === 'scan') {
      scanCount++;
      if (e.cache_hit) cacheHitCount++;
    }
  }

  console.log('\n=======================================');
  console.log('📉 ACTUAL PIPELINE COST METRICS (LIVE)');
  console.log('=======================================');
  console.log(`✨ Total Logged Spend : $${totalCostUsd.toFixed(4)} USD (${(totalCostUsd * 33.3).toFixed(2)} THB)`);
  console.log('---------------------------------------');
  
  for (const type of Object.keys(otherCounts).sort()) {
    const count = otherCounts[type];
    const cost = otherCosts[type];
    const avg = count > 0 ? cost / count : 0;
    console.log(`🔹 EVENT: ${type.toUpperCase()}`);
    console.log(`   - Count          : ${count}`);
    console.log(`   - Total Cost     : $${cost.toFixed(4)} USD (${(cost * 33.3).toFixed(2)} THB)`);
    console.log(`   - Avg Cost/Event : $${avg.toFixed(6)} USD (${(avg * 33.3).toFixed(4)} THB)`);
    console.log('---------------------------------------');
  }

  if (scanCount > 0) {
    const scanCost = otherCosts['scan'] || 0;
    const avgScanCost = scanCost / scanCount;
    const cacheRate = (cacheHitCount / scanCount) * 100;
    console.log('🏆 SCAN AGGREGATE METRICS:');
    console.log(`   - Total Scans    : ${scanCount}`);
    console.log(`   - Cache Hits     : ${cacheHitCount} (${cacheRate.toFixed(1)}%)`);
    console.log(`   - Avg Cost/Scan  : $${avgScanCost.toFixed(6)} USD (${(avgScanCost * 33.3).toFixed(4)} THB)`);
    console.log('=======================================');
  }
}

main().catch(console.error);
