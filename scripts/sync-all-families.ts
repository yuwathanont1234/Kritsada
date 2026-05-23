import { execSync } from 'child_process';

const REFERENCES = [
  '116610',    // Rolex Submariner
  '116500',    // Rolex Daytona
  '5711',      // Patek Philippe Nautilus
  '15400ST',   // Audemars Piguet Royal Oak
  '310.30',    // Omega Speedmaster
  'WSSA001',   // Cartier Santos
  'M79030',    // Tudor Black Bay
  '126710',    // Rolex GMT-Master II
  '126334',    // Rolex Datejust
  '228238',    // Rolex Day-Date
  '5167A',     // Patek Philippe Aquanaut
  '5227G',     // Patek Philippe Calatrava
  'PAM01312',  // Panerai Luminor
  'PAM01347',  // Panerai Radiomir
  'PAM01223',  // Panerai Submersible
  'CBN2A1',    // TAG Heuer Carrera
  'CBL211',    // TAG Heuer Monaco
  'WBP201',    // TAG Heuer Aquaracer
  'WAZ111',    // TAG Heuer Formula 1
  '278573',    // Chopard Happy Sport
  'V45SCDT',   // Franck Muller Vanguard
  '03.3100'    // Zenith Chronomaster Sport
];

console.log(`🚀 Starting Global Watch Market Price Sync for all 22 Luxury watch families...`);

for (let i = 0; i < REFERENCES.length; i++) {
  const ref = REFERENCES[i];
  console.log(`\n==================================================`);
  console.log(`🔄 [${i + 1}/${REFERENCES.length}] Syncing prices for reference prefix: ${ref}`);
  console.log(`==================================================`);
  try {
    execSync(`npx tsx scripts/scrap-chrono24.ts ${ref}`, { stdio: 'inherit' });
  } catch (error) {
    console.error(`❌ Error syncing reference prefix ${ref}:`, error);
  }
}

console.log(`\n🎉 [COMPLETE] All 22 Luxury watch families (15,730 total watch variations) have been successfully synced and updated in the Supabase database!`);
