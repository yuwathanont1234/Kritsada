import { getBrandFallbackPrice } from '../../lib/data/brandFallbackPrices';

export function usePriceFallback() {
  const formatTHB = (val?: number, exchangeRate: number | null = 36.5): string => {
    if (val === undefined || isNaN(val)) return '-';
    if (exchangeRate === null) {
      return '$' + Math.round(val).toLocaleString();
    }
    return '฿' + Math.round(val * exchangeRate).toLocaleString();
  };

  return {
    getBrandFallbackPrice,
    formatTHB,
  };
}
