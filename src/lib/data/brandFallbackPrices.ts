export type BrandFallbackEntry = { match: string; price: number };

/**
 * Rough USD secondary-market ballparks used ONLY as the no-live-price
 * fallback (Free/Standard skip the grounded price fetch; live grounded
 * pricing always supersedes these). Each brand list is ordered
 * most-specific first and ends with a `{ match: '' }` brand default
 * (matches anything).
 *
 * Why model-level entries matter: the previous version returned a single
 * $15,000 catch-all for EVERY Rolex that wasn't a Daytona / Submariner /
 * Datejust, so an Oyster Perpetual 36 and a GMT-Master II both displayed
 * the IDENTICAL ฿487,750 — which reads as a broken estimate when two
 * obviously different watches show the same number. Model keys spread the
 * common references apart so the fallback is at least directionally right.
 */
export const BRAND_FALLBACK_PRICES: Record<string, BrandFallbackEntry[]> = {
  rolex: [
    { match: 'day-date', price: 36000 },
    { match: 'president', price: 36000 },
    { match: 'daytona', price: 32000 },
    { match: 'gmt-master', price: 19000 },
    { match: 'sky-dweller', price: 16000 },
    { match: 'deepsea', price: 14000 },
    { match: 'submariner', price: 13500 },
    { match: 'sea-dweller', price: 12500 },
    { match: 'yacht-master', price: 13000 },
    { match: 'datejust', price: 9800 },
    { match: 'milgauss', price: 8500 },
    { match: 'explorer', price: 7500 },
    { match: 'air-king', price: 6800 },
    { match: 'oyster perpetual', price: 6000 },
    { match: '', price: 12000 },
  ],
  patek: [
    { match: 'grand complication', price: 120000 },
    { match: 'perpetual calendar', price: 95000 },
    { match: 'nautilus', price: 95000 },
    { match: 'aquanaut', price: 52000 },
    { match: 'calatrava', price: 26000 },
    { match: '', price: 45000 },
  ],
  audemars: [
    { match: 'royal oak offshore', price: 38000 },
    { match: 'royal oak', price: 42000 },
    { match: '', price: 40000 },
  ],
  omega: [
    { match: 'speedmaster', price: 6500 },
    { match: 'seamaster', price: 5200 },
    { match: 'constellation', price: 4200 },
    { match: 'de ville', price: 3600 },
    { match: '', price: 5500 },
  ],
  cartier: [
    { match: 'santos', price: 7200 },
    { match: 'ballon', price: 6800 },
    { match: 'tank', price: 4800 },
    { match: '', price: 6500 },
  ],
  tudor: [
    { match: 'pelagos', price: 4600 },
    { match: 'black bay', price: 4200 },
    { match: '', price: 4100 },
  ],
};

/**
 * Flat brand defaults for brands without a model-keyword table above.
 * Checked only when no table bucket matched.
 */
const BRAND_DEFAULTS: Array<{ match: string; price: number }> = [
  { match: 'piguet', price: 40000 }, // "Audemars Piguet" already caught above; bare "AP" lands here
  { match: 'chopard', price: 9200 },
  { match: 'franck', price: 12500 },
  { match: 'muller', price: 12500 },
  { match: 'zenith', price: 11000 },
  { match: 'breitling', price: 6800 },
  { match: 'tag heuer', price: 3200 },
  { match: 'tagheuer', price: 3200 },
  { match: 'heuer', price: 3200 },
  { match: 'longines', price: 2800 },
  { match: 'seiko', price: 450 },
];

export function getBrandFallbackPrice(brand?: string, name?: string): number {
  if (!brand) return 2500;
  const b = brand.toLowerCase().trim();
  const n = (name || '').toLowerCase();

  // 1. Brand has a model-keyword table → most-specific model match,
  //    else the brand default (the trailing `{ match: '' }` entry).
  const tableKey = Object.keys(BRAND_FALLBACK_PRICES).find((k) => b.includes(k));
  if (tableKey) {
    const entries = BRAND_FALLBACK_PRICES[tableKey];
    const modelHit = entries.find((e) => e.match !== '' && n.includes(e.match));
    if (modelHit) return modelHit.price;
    const brandDefault = entries.find((e) => e.match === '');
    if (brandDefault) return brandDefault.price;
  }

  // 2. Flat brand default for everything else.
  const flat = BRAND_DEFAULTS.find((e) => b.includes(e.match));
  if (flat) return flat.price;

  // 3. Unknown brand.
  return 2500;
}
