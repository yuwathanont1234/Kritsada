import React, { useEffect, useState } from 'react';
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
import { colors } from '../lib/theme';
import { SavedWatch } from '../lib/types';
import { getAllWatches, deleteWatch } from '../lib/collection';
import { getExchangeRate } from '../lib/currency';
import { useLanguage } from '../lib/localization';
import { styles } from './AppStyles';

const getSavedWatches = getAllWatches;
const deleteSavedWatch = deleteWatch;

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
  const { t, lang } = useLanguage();
  const [watches, setWatches] = useState<SavedWatch[]>([]);
  const [metrics, setMetrics] = useState({ totalCount: 0, totalValue: 0 });
  const [filter, setFilter] = useState<'all' | 'active' | 'sold'>('all');
  const [exchangeRate, setExchangeRate] = useState<number>(36.5);

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

  const filteredWatches = watches.filter((w) => {
    if (filter === 'active') return !w.soldAt;
    if (filter === 'sold') return !!w.soldAt;
    return true;
  });

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

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <LinearGradient
        colors={['#1C130E', '#0A0805']}
        style={StyleSheet.absoluteFillObject}
      />
      <StatusBar style="light" />
      <SafeAreaView style={styles.safeAreaZero} edges={['top']}>
        {/* Collection Summary Header */}
        <View style={[styles.colHeaderCard, { overflow: 'hidden', borderBottomWidth: 1.5, borderBottomColor: 'rgba(212, 175, 55, 0.25)' }]}>
          <LinearGradient
            colors={['rgba(28, 22, 17, 0.9)', 'rgba(18, 14, 10, 0.95)']}
            style={StyleSheet.absoluteFillObject}
          />
          <Text style={styles.colHeaderTitle}>
            {lang === 'th' ? 'ตู้นิรภัยสะสมของฉัน' : 'MY VAULT COLLECTION'}
          </Text>
          <View style={styles.colSummaryRow}>
            <View>
              <Text style={styles.colSummaryLabel}>
                {lang === 'th' ? 'ทรัพย์สินสะสมทั้งหมด' : 'TOTAL ASSETS'}
              </Text>
              <Text style={styles.colSummaryValue}>
                {metrics.totalCount} {lang === 'th' ? 'เรือน' : 'Timepieces'}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.colSummaryLabel}>
                {lang === 'th' ? 'ประเมินมูลค่ารวมตลาดรอง' : 'TOTAL ESTIMATED VALUE'}
              </Text>
              <Text style={[styles.colSummaryValue, { color: colors.amber }]}>
                ฿{Math.round(metrics.totalValue * exchangeRate).toLocaleString()}
              </Text>
            </View>
          </View>
        </View>

        {/* Segmented Filter Tabs */}
        <View style={styles.filterTabsRow}>
          {(['all', 'active', 'sold'] as const).map((tab) => (
            <Pressable
              key={tab}
              style={[styles.filterTab, filter === tab && styles.filterTabActive, { overflow: 'hidden' }]}
              onPress={() => setFilter(tab)}
            >
              {filter === tab && (
                <LinearGradient
                  colors={['#ECC87A', '#A37C2F']}
                  style={StyleSheet.absoluteFillObject}
                />
              )}
              <Text style={[styles.filterTabText, filter === tab && styles.filterTabTextActive]}>
                {tab === 'all' ? (lang === 'th' ? 'ทั้งหมด' : 'ALL') : tab === 'active' ? (lang === 'th' ? 'ตู้สะสม' : 'VAULTED') : (lang === 'th' ? 'ขายแล้ว' : 'SOLD')}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Saved List */}
        {filteredWatches.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Feather name="folder-minus" size={48} color={colors.textMuted} />
            <Text style={styles.emptyText}>
              {lang === 'th' ? 'ไม่มีนาฬิกาในตู้นิรภัยกลุ่มนี้' : 'No timepieces in this category'}
            </Text>
            <Pressable style={styles.emptyBtn} onPress={() => navigation.navigate('Scan')}>
              <Text style={styles.emptyBtnText}>
                {lang === 'th' ? 'เริ่มต้นการสแกนนาฬิกา' : 'START SCANNING'}
              </Text>
            </Pressable>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.colListScroll}>
            {filteredWatches.map((w) => {
              const verdict = w.result.authenticityVerdict || 'cannot-assess';
              const name = w.customName || w.result.name;
              
              // Color indicator for authenticity
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
                  key={w.id}
                  style={[styles.watchItemCard, { overflow: 'hidden', borderColor: 'rgba(212, 175, 55, 0.25)', borderWidth: 1 }]}
                  onPress={() =>
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
                    })
                  }
                >
                  <LinearGradient
                    colors={['rgba(28, 22, 17, 0.75)', 'rgba(18, 14, 10, 0.85)']}
                    style={StyleSheet.absoluteFillObject}
                  />
                  <Image source={{ uri: w.frontUri }} style={[styles.watchItemImg, { borderWidth: 1.5, borderColor: '#ECC87A', borderRadius: 40 }]} />
                  
                  <View style={{ flex: 1, gap: 4 }}>
                    <View style={styles.watchItemRow}>
                      <Text style={styles.watchItemBrand}>{w.result.brand?.toUpperCase()}</Text>
                      {w.soldAt && <View style={styles.soldBadge}><Text style={styles.soldBadgeText}>{lang === 'th' ? 'ขายแล้ว' : 'SOLD'}</Text></View>}
                    </View>
                    <Text style={styles.watchItemName} numberOfLines={1}>{name}</Text>
                    <Text style={styles.watchItemReference}>Ref. {w.result.year || 'N/A'}</Text>
                    
                    <View style={styles.watchItemFooter}>
                      <View style={{
                        paddingHorizontal: 8,
                        paddingVertical: 3,
                        borderRadius: 12,
                        borderWidth: 1,
                        borderColor: verdictColor,
                        backgroundColor: verdictColor === colors.success ? 'rgba(46, 204, 113, 0.12)' : verdictColor === colors.warning ? 'rgba(236, 200, 122, 0.12)' : verdictColor === colors.danger ? 'rgba(231, 76, 60, 0.12)' : 'rgba(255, 255, 255, 0.05)',
                        shadowColor: verdictColor,
                        shadowOffset: { width: 0, height: 0 },
                        shadowOpacity: 0.35,
                        shadowRadius: 5,
                      }}>
                        <Text style={[styles.verdictBadgeText, { color: verdictColor, fontSize: 10, fontWeight: '800' }]}>
                          ● {verdictText} ({w.result.authenticityProbability || 0}%)
                        </Text>
                      </View>
                      <Text style={[styles.watchItemPrice, { color: verdict === 'likely-reproduction' ? colors.danger : colors.amber }]}>
                        {verdict === 'likely-reproduction' ? 'N/A' : `฿${Math.round((w.customPrice || w.result.marketPrice || 0) * exchangeRate).toLocaleString()}`}
                      </Text>
                    </View>
                  </View>

                  <Pressable style={styles.deleteItemBtn} onPress={() => handleDelete(w.id, name)}>
                    <Feather name="trash-2" size={15} color={colors.danger} />
                  </Pressable>
                </Pressable>
              );
            })}
          </ScrollView>
        )}
      </SafeAreaView>
    </View>
  );
}
