import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import { countsTowardValue } from './authVerdictColor';
import { ScanResult, SavedWatch } from './types';

const STORAGE_KEY = '@luxuryauthenticator/collection';
const IMAGE_DIR = `${FileSystem.documentDirectory}watches/`;

// Permanent-storage size cap.
const SAVED_IMAGE_MAX_DIM = 1280;
const SAVED_IMAGE_QUALITY = 0.7;

async function ensureImageDir(): Promise<void> {
  const info = await FileSystem.getInfoAsync(IMAGE_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(IMAGE_DIR, { intermediates: true });
  }
}

async function copyImageToPermanent(srcUri: string, id: string, side: 'front' | 'back'): Promise<string> {
  if (!srcUri) {
    throw new Error('Image URI is required for collection permanent copy');
  }
  await ensureImageDir();
  const destUri = `${IMAGE_DIR}${id}_${side}.jpg`;

  if (srcUri.startsWith('http://') || srcUri.startsWith('https://')) {
    try {
      await FileSystem.downloadAsync(srcUri, destUri);
      return destUri;
    } catch (e) {
      console.warn('[Collection] Remote download failed (fail-soft with fallback):', e);
    }
  }

  try {
    const out = await ImageManipulator.manipulateAsync(
      srcUri,
      [{ resize: { width: SAVED_IMAGE_MAX_DIM } }],
      { compress: SAVED_IMAGE_QUALITY, format: ImageManipulator.SaveFormat.JPEG }
    );
    await FileSystem.copyAsync({ from: out.uri, to: destUri });
  } catch {
    try {
      await FileSystem.copyAsync({ from: srcUri, to: destUri });
    } catch (copyErr) {
      console.warn('[Collection] Local copy failed:', copyErr);
    }
  }
  return destUri;
}

async function deleteImageFile(uri: string): Promise<void> {
  if (!uri.startsWith(FileSystem.documentDirectory ?? '')) return;
  try {
    await FileSystem.deleteAsync(uri, { idempotent: true });
  } catch {}
}

export type SaveOptions = {
  processedFrontUri?: string;
  bgColor?: string;
  categoryId?: string;
};

export async function checkCollectionLimit(
  collectionLimit: number | 'unlimited'
): Promise<{ allowed: boolean; current: number; limit: number | 'unlimited' }> {
  if (collectionLimit === 'unlimited') {
    return { allowed: true, current: 0, limit: 'unlimited' };
  }
  const all = await getAllWatches();
  const active = all.filter((w) => !isSold(w));
  return {
    allowed: active.length < collectionLimit,
    current: active.length,
    limit: collectionLimit,
  };
}

export function isSold(w: SavedWatch): boolean {
  return !!w.soldAt;
}

export async function markWatchAsSold(
  id: string,
  sale: { soldPrice: number; soldTo?: string; soldNotes?: string; soldAt?: string }
): Promise<void> {
  const all = await getAllWatches();
  const idx = all.findIndex((w) => w.id === id);
  if (idx < 0) return;
  all[idx] = {
    ...all[idx],
    soldAt: sale.soldAt ?? new Date().toISOString(),
    soldPrice: sale.soldPrice,
    soldTo: sale.soldTo?.trim() || undefined,
    soldNotes: sale.soldNotes?.trim() || undefined,
  };
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}

export async function unmarkWatchAsSold(id: string): Promise<void> {
  const all = await getAllWatches();
  const idx = all.findIndex((w) => w.id === id);
  if (idx < 0) return;
  const { soldAt, soldPrice, soldTo, soldNotes, ...rest } = all[idx];
  void soldAt; void soldPrice; void soldTo; void soldNotes;
  all[idx] = rest;
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}

export async function getActiveWatches(): Promise<SavedWatch[]> {
  const all = await getAllWatches();
  return all.filter((w) => !isSold(w));
}

export async function getSoldWatches(): Promise<SavedWatch[]> {
  const all = await getAllWatches();
  return all.filter((w) => isSold(w));
}

export async function saveWatch(
  result: ScanResult,
  frontUri: string,
  backUri?: string,
  options: SaveOptions = {}
): Promise<SavedWatch> {
  const id = `wat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const permFrontUri = await copyImageToPermanent(frontUri, id, 'front');
  const permBackUri = backUri ? await copyImageToPermanent(backUri, id, 'back') : undefined;

  let permProcessedUri: string | undefined;
  if (options.processedFrontUri) {
    await ensureImageDir();
    const destUri = `${IMAGE_DIR}${id}_processed.png`;
    if (options.processedFrontUri.startsWith('http://') || options.processedFrontUri.startsWith('https://')) {
      try {
        await FileSystem.downloadAsync(options.processedFrontUri, destUri);
        permProcessedUri = destUri;
      } catch (e) {
        console.warn('[Collection] Remote download for processedFrontUri failed:', e);
      }
    } else {
      try {
        await FileSystem.copyAsync({ from: options.processedFrontUri, to: destUri });
        permProcessedUri = destUri;
      } catch (e) {
        console.warn('[Collection] Local copy for processedFrontUri failed:', e);
      }
    }
  }

  const saved: SavedWatch = {
    id,
    savedAt: new Date().toISOString(),
    result,
    frontUri: permFrontUri,
    backUri: permBackUri,
    processedFrontUri: permProcessedUri,
    bgColor: options.bgColor,
    categoryId: options.categoryId,
  };

  const all = await getAllWatches();
  all.unshift(saved);
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  return saved;
}

export async function getAllWatches(): Promise<SavedWatch[]> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function getWatchById(id: string): Promise<SavedWatch | null> {
  const all = await getAllWatches();
  return all.find((w) => w.id === id) ?? null;
}

export async function clearAllWatches(): Promise<number> {
  const all = await getAllWatches();
  for (const watch of all) {
    await deleteImageFile(watch.frontUri);
    if (watch.backUri) await deleteImageFile(watch.backUri);
    if (watch.processedFrontUri) await deleteImageFile(watch.processedFrontUri);
  }
  await AsyncStorage.removeItem(STORAGE_KEY);
  return all.length;
}

export async function deleteWatch(id: string): Promise<void> {
  const all = await getAllWatches();
  const target = all.find((w) => w.id === id);
  if (!target) return;

  await deleteImageFile(target.frontUri);
  if (target.backUri) await deleteImageFile(target.backUri);
  if (target.processedFrontUri) await deleteImageFile(target.processedFrontUri);
  if (target.galleryImages) {
    for (const uri of target.galleryImages) {
      await deleteImageFile(uri);
    }
  }

  const filtered = all.filter((w) => w.id !== id);
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
}

export async function addWatchGalleryImage(
  id: string,
  srcUri: string
): Promise<string> {
  const all = await getAllWatches();
  const idx = all.findIndex((w) => w.id === id);
  if (idx < 0) throw new Error('Timepiece not found in collection');

  await ensureImageDir();
  const ext = srcUri.split('.').pop()?.split('?')[0] || 'jpg';
  const seq = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const destUri = `${IMAGE_DIR}${id}_extra_${seq}.${ext}`;
  await FileSystem.copyAsync({ from: srcUri, to: destUri });

  const gallery = all[idx].galleryImages ? [...all[idx].galleryImages!] : [];
  gallery.push(destUri);
  all[idx] = { ...all[idx], galleryImages: gallery };
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  return destUri;
}

export async function replaceWatchGalleryImage(
  id: string,
  imageIndex: number,
  newSrcUri: string
): Promise<string> {
  const all = await getAllWatches();
  const idx = all.findIndex((w) => w.id === id);
  if (idx < 0) throw new Error('Timepiece not found in collection');
  const gallery = all[idx].galleryImages ?? [];
  if (imageIndex < 0 || imageIndex >= gallery.length) {
    throw new Error('Invalid image index');
  }

  await ensureImageDir();
  const seq = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const destUri = `${IMAGE_DIR}${id}_extra_${seq}.png`;
  await FileSystem.copyAsync({ from: newSrcUri, to: destUri });

  const oldUri = gallery[imageIndex];
  const next = [...gallery];
  next[imageIndex] = destUri;
  all[idx] = { ...all[idx], galleryImages: next };
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  await deleteImageFile(oldUri);
  return destUri;
}

export async function removeWatchGalleryImage(
  id: string,
  imageIndex: number
): Promise<void> {
  const all = await getAllWatches();
  const idx = all.findIndex((w) => w.id === id);
  if (idx < 0) return;
  const gallery = all[idx].galleryImages ?? [];
  if (imageIndex < 0 || imageIndex >= gallery.length) return;
  const removedUri = gallery[imageIndex];
  await deleteImageFile(removedUri);
  const next = gallery.filter((_, i) => i !== imageIndex);
  all[idx] = {
    ...all[idx],
    galleryImages: next.length > 0 ? next : undefined,
  };
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}

export async function updateWatchNotes(
  id: string,
  notes: string,
  purchasePrice?: number
): Promise<void> {
  const all = await getAllWatches();
  const idx = all.findIndex((w) => w.id === id);
  if (idx < 0) return;
  all[idx] = { ...all[idx], notes, purchasePrice };
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}

export async function updateWatchBgColor(id: string, bgColor: string): Promise<void> {
  const all = await getAllWatches();
  const idx = all.findIndex((w) => w.id === id);
  if (idx < 0) return;
  all[idx] = { ...all[idx], bgColor };
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}

export async function clearProcessedFront(id: string): Promise<void> {
  const all = await getAllWatches();
  const idx = all.findIndex((w) => w.id === id);
  if (idx < 0) return;
  const target = all[idx];
  if (target.processedFrontUri) {
    await deleteImageFile(target.processedFrontUri);
  }
  all[idx] = {
    ...target,
    processedFrontUri: undefined,
    bgColor: undefined,
  };
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}

export async function updateWatchCategory(
  id: string,
  categoryId: string | undefined
): Promise<void> {
  const all = await getAllWatches();
  const idx = all.findIndex((w) => w.id === id);
  if (idx < 0) return;
  all[idx] = { ...all[idx], categoryId };
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}

export async function reclassifyAllWatches(opts: {
  inferCategory: (name: string, type?: string) => string | undefined;
  trayIdByCategory: Map<string, string>;
  defaultTrayIds: Set<string>;
}): Promise<{
  reclassified: number;
  unchanged: number;
  noInference: number;
  sold: number;
}> {
  const all = await getAllWatches();
  let reclassified = 0;
  let unchanged = 0;
  let noInference = 0;
  let sold = 0;
  let changed = false;

  for (let i = 0; i < all.length; i++) {
    const w = all[i];
    if (w.soldAt) {
      sold++;
      continue;
    }
    if (w.categoryId && !opts.defaultTrayIds.has(w.categoryId)) {
      unchanged++;
      continue;
    }

    const inferred = opts.inferCategory(w.result.name, w.result.type);
    if (!inferred) {
      noInference++;
      continue;
    }
    const trayId = opts.trayIdByCategory.get(inferred);
    if (!trayId) {
      noInference++;
      continue;
    }
    if (w.categoryId === trayId) {
      unchanged++;
      continue;
    }
    all[i] = { ...w, categoryId: trayId };
    reclassified++;
    changed = true;
  }

  if (changed) {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  }
  return { reclassified, unchanged, noInference, sold };
}

export async function clearCategoryFromAllWatches(categoryId: string): Promise<void> {
  const all = await getAllWatches();
  let changed = false;
  for (let i = 0; i < all.length; i++) {
    if (all[i].categoryId === categoryId) {
      all[i] = { ...all[i], categoryId: undefined };
      changed = true;
    }
  }
  if (changed) {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  }
}

export async function updateWatchPurchasePrice(
  id: string,
  purchasePrice: number | undefined
): Promise<void> {
  const all = await getAllWatches();
  const idx = all.findIndex((w) => w.id === id);
  if (idx < 0) return;
  all[idx] = { ...all[idx], purchasePrice };
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}

export async function updateWatchCustomPrice(
  id: string,
  customPrice: number | undefined
): Promise<void> {
  const all = await getAllWatches();
  const idx = all.findIndex((w) => w.id === id);
  if (idx < 0) return;
  all[idx] = {
    ...all[idx],
    customPrice:
      customPrice !== undefined && customPrice >= 0 ? customPrice : undefined,
  };
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}

export function effectivePrice(w: SavedWatch): number {
  return w.customPrice ?? w.result.marketPrice ?? 0;
}

export async function updateWatchName(id: string, customName: string): Promise<void> {
  const all = await getAllWatches();
  const idx = all.findIndex((w) => w.id === id);
  if (idx < 0) return;
  const trimmed = customName.trim();
  all[idx] = {
    ...all[idx],
    customName: trimmed.length > 0 ? trimmed : undefined,
  };
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}

export async function updateWatchPrices(
  id: string,
  prices: Partial<ScanResult>,
  meta: { fromCache: boolean; fetchedAt: string }
): Promise<void> {
  const all = await getAllWatches();
  const idx = all.findIndex((w) => w.id === id);
  if (idx < 0) return;
  all[idx] = {
    ...all[idx],
    result: {
      ...all[idx].result,
      ...prices,
      priceFromCache: meta.fromCache,
      priceFetchedAt: meta.fetchedAt,
    },
  };
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}

export async function updateWatchHeatmap(
  id: string,
  heatmap: any
): Promise<void> {
  const all = await getAllWatches();
  const idx = all.findIndex((w) => w.id === id);
  if (idx < 0) return;
  all[idx] = {
    ...all[idx],
    result: { ...all[idx].result, heatmap },
  };
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}

export type CollectionStats = {
  count: number;
  totalMarketValue: number;
  totalPurchasePrice: number;
  excludedRedCount: number;
  excludedRedValue: number;
};

export async function getCollectionStats(): Promise<CollectionStats> {
  const active = (await getAllWatches()).filter((w) => !isSold(w));
  const counted = active.filter(countsTowardValue);
  const excludedRed = active.filter((w) => !countsTowardValue(w));
  return {
    count: active.length,
    totalMarketValue: counted.reduce((sum, w) => sum + effectivePrice(w), 0),
    totalPurchasePrice: counted.reduce((sum, w) => sum + (w.purchasePrice ?? 0), 0),
    excludedRedCount: excludedRed.length,
    excludedRedValue: excludedRed.reduce((sum, w) => sum + effectivePrice(w), 0),
  };
}

export type WatchPL = {
  watch: SavedWatch;
  currentValue: number;
  purchaseCost: number;
  unrealizedGain: number;
  roi: number;
  hasPurchaseRecord: boolean;
};

export type PortfolioSummary = {
  count: number;
  totalCurrentValue: number;
  totalPurchaseCost: number;
  totalUnrealizedGain: number;
  totalROI: number;
  trackedCount: number;
  untrackedCount: number;
  untrackedCurrentValue: number;

  soldCount: number;
  totalSoldValue: number;
  totalSoldCost: number;
  totalRealizedGain: number;
  realizedROI: number;
  soldTrackedCount: number;
};

export type SoldWatchPL = {
  watch: SavedWatch;
  soldPrice: number;
  purchaseCost: number;
  realizedGain: number;
  roi: number;
  hasPurchaseRecord: boolean;
  soldAt: string;
};

export type DiversificationBucket = {
  key: string;
  label: string;
  count: number;
  value: number;
  percentage: number;
};

export type Diversification = {
  byBrand: DiversificationBucket[];
  byMovement: DiversificationBucket[];
  byEra: DiversificationBucket[];
  byCategory: DiversificationBucket[];
};

export function getWatchPLs(watches: SavedWatch[]): WatchPL[] {
  return watches.filter((w) => !isSold(w)).map((w) => {
    const currentValue = effectivePrice(w);
    const purchaseCost = w.purchasePrice ?? 0;
    const hasPurchaseRecord = w.purchasePrice !== undefined && w.purchasePrice > 0;
    const unrealizedGain = hasPurchaseRecord ? currentValue - purchaseCost : 0;
    const roi = hasPurchaseRecord && purchaseCost > 0
      ? (unrealizedGain / purchaseCost) * 100
      : 0;
    return {
      watch: w,
      currentValue,
      purchaseCost,
      unrealizedGain,
      roi,
      hasPurchaseRecord,
    };
  });
}

export function getSoldWatchPLs(watches: SavedWatch[]): SoldWatchPL[] {
  return watches
    .filter((w) => isSold(w))
    .map((w) => {
      const soldPrice = w.soldPrice ?? 0;
      const purchaseCost = w.purchasePrice ?? 0;
      const hasPurchaseRecord = w.purchasePrice !== undefined && w.purchasePrice > 0;
      const realizedGain = hasPurchaseRecord ? soldPrice - purchaseCost : 0;
      const roi = hasPurchaseRecord && purchaseCost > 0
        ? (realizedGain / purchaseCost) * 100
        : 0;
      return {
        watch: w,
        soldPrice,
        purchaseCost,
        realizedGain,
        roi,
        hasPurchaseRecord,
        soldAt: w.soldAt!,
      };
    })
    .sort((a, b) => (a.soldAt < b.soldAt ? 1 : -1));
}

export function calculatePortfolio(watches: SavedWatch[]): PortfolioSummary {
  const activePLs = getWatchPLs(watches);
  const tracked = activePLs.filter((p) => p.hasPurchaseRecord);
  const untracked = activePLs.filter((p) => !p.hasPurchaseRecord);

  const totalCurrentValue = activePLs.reduce((s, p) => s + p.currentValue, 0);
  const totalPurchaseCost = tracked.reduce((s, p) => s + p.purchaseCost, 0);
  const totalUnrealizedGain = tracked.reduce((s, p) => s + p.unrealizedGain, 0);
  const totalROI = totalPurchaseCost > 0
    ? (totalUnrealizedGain / totalPurchaseCost) * 100
    : 0;

  const soldPLs = getSoldWatchPLs(watches);
  const soldTracked = soldPLs.filter((p) => p.hasPurchaseRecord);
  const totalSoldValue = soldPLs.reduce((s, p) => s + p.soldPrice, 0);
  const totalSoldCost = soldTracked.reduce((s, p) => s + p.purchaseCost, 0);
  const totalRealizedGain = soldTracked.reduce((s, p) => s + p.realizedGain, 0);
  const realizedROI = totalSoldCost > 0
    ? (totalRealizedGain / totalSoldCost) * 100
    : 0;

  return {
    count: activePLs.length,
    totalCurrentValue,
    totalPurchaseCost,
    totalUnrealizedGain,
    totalROI,
    trackedCount: tracked.length,
    untrackedCount: untracked.length,
    untrackedCurrentValue: untracked.reduce((s, p) => s + p.currentValue, 0),
    soldCount: soldPLs.length,
    totalSoldValue,
    totalSoldCost,
    totalRealizedGain,
    realizedROI,
    soldTrackedCount: soldTracked.length,
  };
}

function bucketize(
  watches: SavedWatch[],
  totalValue: number,
  keyOf: (w: SavedWatch) => string,
  labelOf?: (w: SavedWatch) => string
): DiversificationBucket[] {
  const groups = new Map<string, { items: SavedWatch[]; value: number }>();
  for (const w of watches) {
    const k = keyOf(w) || '(Unspecified)';
    const v = effectivePrice(w);
    const cur = groups.get(k) ?? { items: [], value: 0 };
    cur.items.push(w);
    cur.value += v;
    groups.set(k, cur);
  }
  return Array.from(groups.entries())
    .map(([key, { items, value }]) => ({
      key,
      label: labelOf ? labelOf(items[0]) : key,
      count: items.length,
      value,
      percentage: totalValue > 0 ? (value / totalValue) * 100 : 0,
    }))
    .sort((a, b) => b.value - a.value);
}

function yearToEra(year: string): string {
  if (!year) return '(Unspecified Year)';
  const m = year.match(/(\d{4})/);
  if (!m) return year;
  const y = parseInt(m[1], 10);
  if (y < 1970) return 'Vintage (Pre-1970)';
  if (y < 1990) return 'Classic (1970-1989)';
  if (y < 2005) return 'Neo-Vintage (1990-2004)';
  if (y < 2018) return 'Modern (2005-2017)';
  return 'Contemporary (2018+)';
}

export function getDiversification(watches: SavedWatch[]): Diversification {
  const total = watches.reduce((s, w) => s + effectivePrice(w), 0);
  return {
    byBrand: bucketize(watches, total, (w) => w.result.brand ?? ''),
    byMovement: bucketize(watches, total, (w) => w.result.movementFamily ?? ''),
    byEra: bucketize(watches, total, (w) => yearToEra(w.result.year ?? '')),
    byCategory: bucketize(watches, total, (w) => w.categoryId ?? '(Uncategorized)'),
  };
}

export function getTopPerformers(watches: SavedWatch[], n = 5): WatchPL[] {
  return getWatchPLs(watches)
    .filter((p) => p.hasPurchaseRecord)
    .sort((a, b) => b.roi - a.roi)
    .slice(0, n);
}

export function getUnderperformers(watches: SavedWatch[], n = 5): WatchPL[] {
  return getWatchPLs(watches)
    .filter((p) => p.hasPurchaseRecord)
    .sort((a, b) => a.roi - b.roi)
    .slice(0, n)
    .filter((p) => p.roi < 0);
}
