import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  ScrollView,
  Text,
  Pressable,
  Image,
  Alert,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { colors, spacing } from '../lib/theme';
import { SavedWatch } from '../lib/types';
import { getAllWatches, deleteWatch } from '../lib/collection';
import { getExchangeRate } from '../lib/currency';
import { useLanguage } from '../lib/localization';
import { styles } from './AppStyles';
import WatchWinder from './collection/WatchWinder';

const getSavedWatches = getAllWatches;
const deleteSavedWatch = deleteWatch;

type BrandBucket = {
  brand: string;
  watches: SavedWatch[];
};

/**
 * BrandTray — single brand's "vault tray".
 *
 * Visual: dark surface with gold border (luxury watch equivalent of the
 * Songphra red amulet tray), 2×2 thumbnail grid showing up to four pieces
 * from the brand. Slots beyond the 4th become a "+N" overlay so the user
 * sees there's more behind the tap. Tray-level tap expands the brand inline
 * (handled by parent via onSelectBrand).
 *
 * The 2×2 layout intentionally keeps trays uniform regardless of how many
 * pieces are inside — a brand with 1 watch still occupies a full tray with
 * 3 empty cream-coloured slots, so the grid reads as a "case display" not
 * a ragged list. This is the same trick Songphra uses to make tiny
 * collections still feel like an organised vault.
 */
function BrandTray({
  bucket,
  onPressBrand,
  onPressWatch,
  isSelected,
  lang,
}: {
  bucket: BrandBucket;
  onPressBrand: (brand: string) => void;
  onPressWatch: (w: SavedWatch) => void;
  isSelected: boolean;
  lang: 'th' | 'en';
}) {
  const slotsRaw = bucket.watches.slice(0, 4);
  const extra = bucket.watches.length - slotsRaw.length;
  // Pad to exactly 4 slots for uniform 2×2 grid.
  const padded: (SavedWatch | null)[] = [...slotsRaw];
  while (padded.length < 4) padded.push(null);

  return (
    <Pressable
      onPress={() => onPressBrand(bucket.brand)}
      style={{
        flex: 1,
        borderRadius: 16,
        borderWidth: isSelected ? 1.8 : 1,
        borderColor: isSelected ? '#ECC87A' : 'rgba(236, 200, 122, 0.30)',
        overflow: 'hidden',
        aspectRatio: 1,
        shadowColor: isSelected ? '#ECC87A' : '#000',
        shadowOffset: { width: 0, height: isSelected ? 4 : 2 },
        shadowOpacity: isSelected ? 0.4 : 0.25,
        shadowRadius: 8,
        elevation: 3,
      }}
    >
      <LinearGradient
        colors={['rgba(30, 24, 20, 0.95)', 'rgba(12, 10, 8, 0.98)']}
        style={StyleSheet.absoluteFillObject}
      />

      {/* 2x2 thumbnail grid — takes most of the tray surface */}
      <View style={{ flex: 1, padding: 8 }}>
        <View style={{ flex: 1, flexDirection: 'row', gap: 6, marginBottom: 6 }}>
          <ThumbSlot watch={padded[0]} onPress={onPressWatch} />
          <ThumbSlot watch={padded[1]} onPress={onPressWatch} />
        </View>
        <View style={{ flex: 1, flexDirection: 'row', gap: 6 }}>
          <ThumbSlot watch={padded[2]} onPress={onPressWatch} />
          <ThumbSlot
            watch={padded[3]}
            onPress={onPressWatch}
            extraCount={extra > 0 ? extra : 0}
          />
        </View>
      </View>

      {/* Tray footer — brand label + count */}
      <View
        style={{
          paddingHorizontal: 10,
          paddingVertical: 8,
          borderTopWidth: 1,
          borderTopColor: 'rgba(236, 200, 122, 0.18)',
          backgroundColor: 'rgba(10, 8, 5, 0.55)',
        }}
      >
        <Text
          numberOfLines={1}
          style={{
            color: colors.textCream,
            fontSize: 12,
            fontWeight: '800',
            letterSpacing: 0.4,
          }}
        >
          {bucket.brand}
        </Text>
        <Text style={{ color: colors.amber, fontSize: 10, marginTop: 1, fontWeight: '600' }}>
          {bucket.watches.length} {lang === 'th' ? 'เรือน' : bucket.watches.length === 1 ? 'piece' : 'pieces'}
        </Text>
      </View>
    </Pressable>
  );
}

function ThumbSlot({
  watch,
  onPress,
  extraCount = 0,
}: {
  watch: SavedWatch | null;
  onPress: (w: SavedWatch) => void;
  extraCount?: number;
}) {
  if (!watch) {
    // Empty slot — soft cream wash so it reads as "future slot" rather than missing data.
    return (
      <View
        style={{
          flex: 1,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: 'rgba(236, 200, 122, 0.12)',
          backgroundColor: 'rgba(245, 233, 204, 0.04)',
        }}
      />
    );
  }
  return (
    <Pressable
      onPress={() => onPress(watch)}
      style={{
        flex: 1,
        borderRadius: 8,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(236, 200, 122, 0.25)',
      }}
    >
      <Image
        source={{ uri: watch.frontUri }}
        style={{ width: '100%', height: '100%', backgroundColor: '#000' }}
        resizeMode="cover"
      />
      {extraCount > 0 && (
        <View
          style={{
            ...StyleSheet.absoluteFillObject,
            backgroundColor: 'rgba(10, 8, 5, 0.78)',
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <Text style={{ color: '#ECC87A', fontSize: 18, fontWeight: '900' }}>
            +{extraCount}
          </Text>
          <Text style={{ color: colors.textCreamDim, fontSize: 9, letterSpacing: 1, marginTop: 2 }}>
            MORE
          </Text>
        </View>
      )}
    </Pressable>
  );
}

async function getPortfolioMetrics() {
  const list = await getAllWatches();
  let totalCount = 0;
  let totalValue = 0;
  for (const w of list) {
    totalCount += 1;
    totalValue += w.customPrice || (w.result && w.result.marketPrice) || 0;
  }
  return {
    totalCount,
    totalValue,
  };
}

export default function CollectionScreen({ navigation }: any) {
  const { lang } = useLanguage();
  const [watches, setWatches] = useState<SavedWatch[]>([]);
  const [metrics, setMetrics] = useState({ totalCount: 0, totalValue: 0 });
  const [filter, setFilter] = useState<'all' | 'active' | 'sold'>('all');
  const [selectedBrand, setSelectedBrand] = useState<string | null>(null);
  const [exchangeRate, setExchangeRate] = useState<number>(36.5);
  // Vault display mode: the automatic winder cabinet (default — the "showcase"
  // look) vs the existing brand-tray list for detailed management.
  const [viewMode, setViewMode] = useState<'winder' | 'list'>('winder');

  const loadData = async () => {
    try {
      const list = await getSavedWatches();
      const sorted = list.sort((a: SavedWatch, b: SavedWatch) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime());
      setWatches(sorted);
      const m = await getPortfolioMetrics();
      setMetrics(m);
      const rate = await getExchangeRate();
      if (rate !== null) {
        setExchangeRate(rate);
      }
    } catch (e) {
      console.warn('[CollectionScreen] Error loading collection data:', e);
    }
  };

  useEffect(() => {
    loadData();
    const timer = setInterval(loadData, 2000);
    return () => clearInterval(timer);
  }, []);

  // Watches after applying status filter (ALL / VAULTED / SOLD).
  const filteredWatches = useMemo(
    () =>
      watches.filter((w) => {
        if (filter === 'active') return !w.soldAt;
        if (filter === 'sold') return !!w.soldAt;
        return true;
      }),
    [watches, filter]
  );

  // Brand buckets derived from the filtered list — empty brands disappear
  // automatically when the filter excludes them, so the trays grid stays
  // consistent with the filter chip the user picked.
  const brandBuckets = useMemo<BrandBucket[]>(() => {
    const map: Record<string, SavedWatch[]> = {};
    for (const w of filteredWatches) {
      const b = w.result?.brand?.trim() || (lang === 'th' ? 'ไม่ทราบแบรนด์' : 'Unknown');
      if (!map[b]) map[b] = [];
      map[b].push(w);
    }
    return Object.keys(map)
      .sort((a, b) => map[b].length - map[a].length || a.localeCompare(b))
      .map((brand) => ({ brand, watches: map[brand] }));
  }, [filteredWatches, lang]);

  // Verified-count is portfolio-wide (not filter-scoped) since it serves
  // as a trust signal in the hero — filter changes shouldn't make it dip.
  const verifiedCount = useMemo(
    () => watches.filter((w) => w.result?.authenticityVerdict === 'likely-authentic').length,
    [watches]
  );

  // Recent carousel mirrors HomeScreen: 8 most recently saved regardless of filter.
  const recentWatches = useMemo(() => watches.slice(0, 8), [watches]);

  // Watches to render in the expanded brand-drilldown list when the user
  // taps a tray. Falls back to "all filteredWatches" when no brand is
  // selected — so the bottom flat list always reflects either the picked
  // brand or the full filtered set, never nothing.
  const drilldownWatches = useMemo(() => {
    if (!selectedBrand) return [];
    const bucket = brandBuckets.find((b) => b.brand === selectedBrand);
    return bucket ? bucket.watches : [];
  }, [selectedBrand, brandBuckets]);

  const openWatch = (w: SavedWatch) => {
    navigation.navigate('Result', {
      result: w.result,
      frontUri: w.frontUri,
      backUri: w.backUri,
      savedId: w.id,
      processedFrontUri: w.processedFrontUri,
      customName: w.customName,
      customPrice: w.customPrice,
      purchasePrice: w.purchasePrice,
      soldAt: w.soldAt,
      soldPrice: w.soldPrice,
      soldTo: w.soldTo,
      soldNotes: w.soldNotes,
      galleryImages: w.galleryImages,
      bgColor: w.bgColor,
    });
  };

  const handleDelete = (id: string, name: string) => {
    Alert.alert(
      lang === 'th' ? 'ยืนยันการลบข้อมูล' : 'Confirm Deletion',
      lang === 'th'
        ? `คุณแน่ใจหรือไม่ว่าต้องการลบ ${name} ออกจากตู้นิรภัยสะสมของคุณ?`
        : `Are you sure you want to remove ${name} from your collector vault?`,
      [
        { text: lang === 'th' ? 'ยกเลิก' : 'Cancel', style: 'cancel' },
        {
          text: lang === 'th' ? 'ลบข้อมูล' : 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteSavedWatch(id);
            loadData();
          },
        },
      ]
    );
  };

  const isEmpty = watches.length === 0;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <LinearGradient
        colors={['#1C130E', '#0A0805']}
        style={StyleSheet.absoluteFillObject}
      />
      <StatusBar style="light" />
      <SafeAreaView style={styles.safeAreaZero} edges={['top']}>
        <ScrollView
          contentContainerStyle={{ padding: spacing.md, paddingBottom: spacing.xl * 2 }}
        >
          {isEmpty ? (
            <View style={[styles.emptyContainer, { paddingTop: spacing.xl * 2 }]}>
              <Feather name="folder-minus" size={48} color={colors.textMuted} />
              <Text style={styles.emptyText}>
                {lang === 'th' ? 'ยังไม่มีนาฬิกาในตู้นิรภัย' : 'No timepieces yet'}
              </Text>
              <Pressable style={styles.emptyBtn} onPress={() => navigation.navigate('Scan')}>
                <Text style={styles.emptyBtnText}>
                  {lang === 'th' ? 'เริ่มต้นการสแกนนาฬิกา' : 'START SCANNING'}
                </Text>
              </Pressable>
            </View>
          ) : (
            <>
              {/* ─── Hero card — portfolio value + stat pills ─── */}
              <View
                style={{
                  borderRadius: 22,
                  borderWidth: 1,
                  borderColor: 'rgba(236, 200, 122, 0.35)',
                  overflow: 'hidden',
                  marginBottom: spacing.md,
                  padding: spacing.lg,
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 6 },
                  shadowOpacity: 0.35,
                  shadowRadius: 12,
                  elevation: 4,
                }}
              >
                <LinearGradient
                  colors={['rgba(28, 22, 17, 0.95)', 'rgba(18, 14, 10, 0.98)']}
                  style={StyleSheet.absoluteFillObject}
                />
                {/* Subtle gold radial accent in the corner — mirrors HomeScreen hero */}
                <View
                  style={{
                    position: 'absolute',
                    right: -50,
                    top: -50,
                    width: 180,
                    height: 180,
                    borderRadius: 90,
                    backgroundColor: 'rgba(236, 200, 122, 0.08)',
                  }}
                />

                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm }}>
                  <Feather name="award" size={18} color={colors.amber} style={{ marginRight: 8 }} />
                  <Text style={{ color: colors.amber, fontSize: 13, fontWeight: '700', letterSpacing: 1.4 }}>
                    {lang === 'th' ? 'มูลค่าคอลเลกชันรวม' : 'PORTFOLIO VALUE'}
                  </Text>
                </View>

                <View style={{ flexDirection: 'row', alignItems: 'baseline', marginBottom: spacing.md }}>
                  <Text style={{ color: colors.textCream, fontSize: 16, fontWeight: '700', marginRight: 6 }}>฿</Text>
                  <Text style={{ color: '#FFFFFF', fontSize: 32, fontWeight: '800', letterSpacing: -0.5, lineHeight: 36 }}>
                    {Math.round(metrics.totalValue * exchangeRate).toLocaleString()}
                  </Text>
                </View>

                {/* 3 stat pills */}
                <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                  <StatPill
                    icon="layers"
                    iconColor={colors.amber}
                    text={`${metrics.totalCount} ${lang === 'th' ? 'เรือน' : 'pcs'}`}
                  />
                  <StatPill
                    icon="grid"
                    iconColor={colors.amber}
                    text={`${brandBuckets.length} ${lang === 'th' ? 'แบรนด์' : 'brands'}`}
                  />
                  <StatPill
                    icon="check-circle"
                    iconColor="#2ECC71"
                    text={`${verifiedCount} ${lang === 'th' ? 'ระบุได้' : 'verified'}`}
                    accent="green"
                  />
                </View>
              </View>

              {/* View-mode toggle: automatic winder cabinet ⇄ brand list */}
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: spacing.md }}>
                {(['winder', 'list'] as const).map((mode) => {
                  const active = viewMode === mode;
                  return (
                    <Pressable
                      key={mode}
                      onPress={() => setViewMode(mode)}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 6,
                        paddingVertical: 8,
                        paddingHorizontal: 14,
                        borderRadius: 999,
                        borderWidth: 1,
                        borderColor: active ? colors.amber : 'rgba(236,200,122,0.25)',
                        backgroundColor: active ? 'rgba(236,200,122,0.14)' : 'transparent',
                      }}
                    >
                      <Feather
                        name={mode === 'winder' ? 'refresh-cw' : 'grid'}
                        size={13}
                        color={active ? colors.amber : colors.textMuted}
                      />
                      <Text style={{ color: active ? colors.amber : colors.textMuted, fontSize: 12, fontWeight: '700' }}>
                        {mode === 'winder'
                          ? (lang === 'th' ? 'ตู้หมุน' : 'Winder')
                          : (lang === 'th' ? 'รายการ' : 'List')}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {viewMode === 'winder' ? (
                <WatchWinder watches={filteredWatches} onOpen={openWatch} lang={lang} />
              ) : (
              <>
              {/* ─── Recent Added carousel ─── */}
              {recentWatches.length > 0 && (
                <View style={{ marginBottom: spacing.md }}>
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: spacing.sm,
                    }}
                  >
                    <Text style={{ color: colors.textGold, fontSize: 14, fontWeight: '700', letterSpacing: 0.5 }}>
                      {lang === 'th' ? 'เพิ่มล่าสุด' : 'Recently Added'}
                    </Text>
                    <Pressable
                      onPress={() => {
                        setSelectedBrand(null);
                        setFilter('all');
                      }}
                    >
                      <Text style={{ color: colors.amber, fontSize: 12, fontWeight: '600' }}>
                        {lang === 'th' ? 'ดูทั้งหมด ›' : 'View all ›'}
                      </Text>
                    </Pressable>
                  </View>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ gap: spacing.sm }}
                  >
                    {recentWatches.map((w) => (
                      <Pressable
                        key={w.id}
                        onPress={() => openWatch(w)}
                        style={{
                          width: 96,
                          height: 96,
                          borderRadius: 12,
                          overflow: 'hidden',
                          borderWidth: 1,
                          borderColor: 'rgba(236, 200, 122, 0.30)',
                        }}
                      >
                        <Image
                          source={{ uri: w.frontUri }}
                          style={{ width: '100%', height: '100%', backgroundColor: '#000' }}
                          resizeMode="cover"
                        />
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>
              )}

              {/* ─── Status filter tabs (compact) ─── */}
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: spacing.md }}>
                {(['all', 'active', 'sold'] as const).map((tab) => {
                  const active = filter === tab;
                  return (
                    <Pressable
                      key={tab}
                      onPress={() => {
                        setFilter(tab);
                        setSelectedBrand(null);
                      }}
                      style={{
                        flex: 1,
                        paddingVertical: 8,
                        borderRadius: 18,
                        borderWidth: 1,
                        borderColor: active ? '#ECC87A' : 'rgba(236, 200, 122, 0.2)',
                        backgroundColor: active ? 'rgba(236, 200, 122, 0.16)' : 'rgba(28, 22, 17, 0.5)',
                        alignItems: 'center',
                      }}
                    >
                      <Text
                        style={{
                          color: active ? colors.textCream : '#A89E8A',
                          fontSize: 11,
                          fontWeight: '800',
                          letterSpacing: 1,
                        }}
                      >
                        {tab === 'all'
                          ? lang === 'th'
                            ? 'ทั้งหมด'
                            : 'ALL'
                          : tab === 'active'
                          ? lang === 'th'
                            ? 'ตู้สะสม'
                            : 'VAULTED'
                          : lang === 'th'
                          ? 'ขายแล้ว'
                          : 'SOLD'}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {/* ─── Section header for brand trays ─── */}
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  marginBottom: spacing.sm,
                }}
              >
                <View
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: 'rgba(236, 200, 122, 0.4)',
                    backgroundColor: 'rgba(28, 22, 17, 0.7)',
                    justifyContent: 'center',
                    alignItems: 'center',
                    marginRight: 10,
                  }}
                >
                  <Feather name="archive" size={14} color={colors.amber} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.textCream, fontSize: 16, fontWeight: '700' }}>
                    {lang === 'th' ? 'ตู้นาฬิกาของคุณ' : 'Your Watch Vault'}
                  </Text>
                  <Text style={{ color: '#8A8278', fontSize: 11, marginTop: 1 }}>
                    {brandBuckets.length}{' '}
                    {lang === 'th' ? 'แบรนด์ · จัดหมวดหมู่อัตโนมัติ' : 'brands · auto-grouped'}
                  </Text>
                </View>
                {selectedBrand && (
                  <Pressable
                    onPress={() => setSelectedBrand(null)}
                    style={{
                      paddingHorizontal: 10,
                      paddingVertical: 6,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: 'rgba(236, 200, 122, 0.4)',
                    }}
                  >
                    <Text style={{ color: colors.amber, fontSize: 11, fontWeight: '700' }}>
                      ✕ {lang === 'th' ? 'ล้างตัวกรอง' : 'CLEAR'}
                    </Text>
                  </Pressable>
                )}
              </View>

              {/* ─── Brand trays grid (2 per row) ─── */}
              {brandBuckets.length === 0 ? (
                <View
                  style={{
                    borderRadius: 12,
                    padding: spacing.md,
                    borderWidth: 1,
                    borderColor: 'rgba(236, 200, 122, 0.15)',
                    backgroundColor: 'rgba(28, 22, 17, 0.5)',
                    alignItems: 'center',
                  }}
                >
                  <Text style={{ color: colors.textMuted, fontSize: 13 }}>
                    {lang === 'th'
                      ? 'ไม่มีนาฬิกาในตัวกรองนี้'
                      : 'No timepieces in this filter'}
                  </Text>
                </View>
              ) : (
                <View
                  style={{
                    flexDirection: 'row',
                    flexWrap: 'wrap',
                    gap: spacing.sm,
                    marginBottom: spacing.md,
                  }}
                >
                  {brandBuckets.map((bucket) => (
                    <View
                      key={bucket.brand}
                      style={{
                        // Two-up grid — each tray takes ~half the row width.
                        // We use width calc instead of flexBasis because RN
                        // gap doesn't subtract from percentage widths.
                        width: '48.5%',
                      }}
                    >
                      <BrandTray
                        bucket={bucket}
                        onPressBrand={(b) =>
                          setSelectedBrand((prev) => (prev === b ? null : b))
                        }
                        onPressWatch={openWatch}
                        isSelected={selectedBrand === bucket.brand}
                        lang={lang}
                      />
                    </View>
                  ))}
                </View>
              )}

              {/* ─── Drill-down list ─── shown only when a brand is selected.
                  Renders the same rich watch row card as before (with verdict
                  badge + price + delete). Keeps existing affordances intact
                  for users who actually want the linear list view. */}
              {selectedBrand && drilldownWatches.length > 0 && (
                <View style={{ marginTop: spacing.xs }}>
                  <Text
                    style={{
                      color: colors.amber,
                      fontSize: 11,
                      fontWeight: '800',
                      letterSpacing: 1.2,
                      marginBottom: spacing.sm,
                    }}
                  >
                    {selectedBrand.toUpperCase()} —{' '}
                    {drilldownWatches.length}{' '}
                    {lang === 'th'
                      ? 'เรือน'
                      : drilldownWatches.length === 1
                      ? 'piece'
                      : 'pieces'}
                  </Text>
                  {drilldownWatches.map((w) => (
                    <WatchRow
                      key={w.id}
                      w={w}
                      lang={lang}
                      exchangeRate={exchangeRate}
                      onPress={() => openWatch(w)}
                      onDelete={() => handleDelete(w.id, w.customName || w.result.name)}
                    />
                  ))}
                </View>
              )}
              </>
              )}
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

/**
 * StatPill — small flexible stat capsule used inside the hero card.
 * Mirrors the styling on HomeScreen's portfolio block so the two screens
 * feel like one cohesive vault, not separate visual systems.
 */
function StatPill({
  icon,
  iconColor,
  text,
  accent,
}: {
  icon: any;
  iconColor: string;
  text: string;
  accent?: 'green';
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 18,
        borderWidth: 1,
        borderColor:
          accent === 'green'
            ? 'rgba(46, 204, 113, 0.3)'
            : 'rgba(236, 200, 122, 0.3)',
        backgroundColor:
          accent === 'green'
            ? 'rgba(46, 204, 113, 0.06)'
            : 'rgba(236, 200, 122, 0.05)',
      }}
    >
      <Feather name={icon} size={12} color={iconColor} style={{ marginRight: 5 }} />
      <Text style={{ color: accent === 'green' ? '#D0E8D7' : colors.textGold, fontSize: 12, fontWeight: '700' }}>
        {text}
      </Text>
    </View>
  );
}

/**
 * WatchRow — single watch row used inside the brand drill-down list.
 *
 * Carries forward the original CollectionScreen row design (verdict badge,
 * price, delete action) so the data the user sees is identical — the
 * brand-grouping change is purely organisational, not informational.
 */
function WatchRow({
  w,
  lang,
  exchangeRate,
  onPress,
  onDelete,
}: {
  w: SavedWatch;
  lang: 'th' | 'en';
  exchangeRate: number;
  onPress: () => void;
  onDelete: () => void;
}) {
  const verdict = w.result.authenticityVerdict || 'cannot-assess';
  const name = w.customName || w.result.name;

  let verdictColor = colors.textMuted;
  let verdictText = lang === 'th' ? 'ไม่สามารถระบุได้' : 'UNABLE TO VERIFY';
  if (verdict === 'likely-authentic') {
    verdictColor = colors.success;
    verdictText = lang === 'th' ? 'ของแท้ผ่านเกณฑ์' : 'LIKELY AUTHENTIC';
  } else if (verdict === 'uncertain') {
    verdictColor = colors.warning;
    verdictText = lang === 'th' ? 'ไม่แน่นอน' : 'UNCERTAIN';
  } else if (verdict === 'likely-reproduction') {
    verdictColor = colors.danger;
    verdictText = lang === 'th' ? 'ของเลียนแบบ' : 'REPRODUCTION';
  }

  return (
    <Pressable
      style={[
        styles.watchItemCard,
        {
          overflow: 'hidden',
          borderColor: 'rgba(212, 175, 55, 0.25)',
          borderWidth: 1,
        },
      ]}
      onPress={onPress}
    >
      <LinearGradient
        colors={['rgba(28, 22, 17, 0.75)', 'rgba(18, 14, 10, 0.85)']}
        style={StyleSheet.absoluteFillObject}
      />
      <Image
        source={{ uri: w.frontUri }}
        style={[
          styles.watchItemImg,
          { borderWidth: 1.5, borderColor: '#ECC87A', borderRadius: 40 },
        ]}
      />

      <View style={{ flex: 1, gap: 4 }}>
        <View style={styles.watchItemRow}>
          <Text style={styles.watchItemBrand}>{w.result.brand?.toUpperCase()}</Text>
          {w.soldAt && (
            <View style={styles.soldBadge}>
              <Text style={styles.soldBadgeText}>{lang === 'th' ? 'ขายแล้ว' : 'SOLD'}</Text>
            </View>
          )}
        </View>
        <Text style={styles.watchItemName} numberOfLines={1}>
          {name}
        </Text>
        {w.result.year ? (
          <Text style={styles.watchItemReference}>
            {lang === 'th' ? `ปี ${w.result.year}` : `Year ${w.result.year}`}
          </Text>
        ) : null}

        <View style={styles.watchItemFooter}>
          <View
            style={{
              paddingHorizontal: 8,
              paddingVertical: 3,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: verdictColor,
              backgroundColor:
                verdictColor === colors.success
                  ? 'rgba(46, 204, 113, 0.12)'
                  : verdictColor === colors.warning
                  ? 'rgba(236, 200, 122, 0.12)'
                  : verdictColor === colors.danger
                  ? 'rgba(231, 76, 60, 0.12)'
                  : 'rgba(255, 255, 255, 0.05)',
              shadowColor: verdictColor,
              shadowOffset: { width: 0, height: 0 },
              shadowOpacity: 0.35,
              shadowRadius: 5,
            }}
          >
            <Text
              style={[
                styles.verdictBadgeText,
                { color: verdictColor, fontSize: 10, fontWeight: '800' },
              ]}
            >
              ● {verdictText} ({w.result.authenticityProbability || 0}%)
            </Text>
          </View>
          <Text
            style={[
              styles.watchItemPrice,
              {
                color:
                  verdict === 'likely-reproduction' ? colors.danger : colors.amber,
              },
            ]}
          >
            {verdict === 'likely-reproduction'
              ? '—'
              : `฿${Math.round((w.customPrice || w.result.marketPrice || 0) * exchangeRate).toLocaleString()}`}
          </Text>
        </View>
      </View>

      <Pressable style={styles.deleteItemBtn} onPress={onDelete}>
        <Feather name="trash-2" size={15} color={colors.danger} />
      </Pressable>
    </Pressable>
  );
}
