export type BrandFallbackEntry = { match: string; price: number };

export const BRAND_FALLBACK_PRICES: Record<string, BrandFallbackEntry[]> = {
  rolex: [
    { match: 'daytona', price: 28400 },
    { match: 'submariner', price: 13500 },
    { match: 'datejust', price: 9800 },
  ],
};

export function getBrandFallbackPrice(brand?: string, name?: string): number {
  if (!brand) return 2500;
  const b = brand.toLowerCase();
  
  if (b.includes('rolex')) {
    const brandLower = name?.toLowerCase() || '';
    if (brandLower.includes('daytona')) return 28400;
    if (brandLower.includes('submariner')) return 13500;
    if (brandLower.includes('datejust')) return 9800;
    return 15000;
  }
  
  if (b.includes('patek')) return 55000;
  if (b.includes('audemars') || b.includes('ap')) return 42000;
  if (b.includes('omega')) return 6200;
  if (b.includes('tag heuer') || b.includes('tagheuer') || b.includes('tag')) return 3200;
  if (b.includes('tudor')) return 4100;
  if (b.includes('cartier')) return 6500;
  if (b.includes('chopard')) return 9200;
  if (b.includes('franck') || b.includes('muller')) return 12500;
  if (b.includes('zenith')) return 11000;
  if (b.includes('breitling')) return 6800;
  if (b.includes('longines')) return 2800;
  if (b.includes('seiko')) return 450;
  
  return 2500;
}
