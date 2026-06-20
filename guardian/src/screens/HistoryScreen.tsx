import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  Pressable,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, CompositeScreenProps } from '@react-navigation/native';
import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors, spacing, radius, typography, shadow } from '../lib/theme';
import { getRecentChecks, deleteCheck, clearHistory } from '../lib/analysis';
import { RiskBadge } from '../components/RiskBadge';
import { useLang } from '../i18n/LangContext';
import type { RecentCheck, RiskLevel, RootStackParamList, TabParamList } from '../lib/types';

type Props = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, 'History'>,
  NativeStackScreenProps<RootStackParamList>
>;

type Filter = 'ALL' | RiskLevel;

const FILTERS: Filter[] = ['ALL', 'RED', 'YELLOW', 'GREEN'];
const FILTER_EMOJI: Record<Filter, string> = {
  ALL: '',
  RED: '🔴',
  YELLOW: '🟡',
  GREEN: '🟢',
};

export default function HistoryScreen({ }: Props) {
  const { t, lang } = useLang();
  const [checks, setChecks] = useState<RecentCheck[]>([]);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('ALL');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setChecks(await getRecentChecks());
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handleDelete = (id: string) => {
    Alert.alert('', t('history.deleteItem'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.done'),
        style: 'destructive',
        onPress: async () => {
          await deleteCheck(id);
          setChecks((prev) => prev.filter((c) => c.id !== id));
        },
      },
    ]);
  };

  const handleClearAll = () => {
    if (checks.length === 0) return;
    Alert.alert('', t('history.clearConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('history.clearAll'),
        style: 'destructive',
        onPress: async () => {
          await clearHistory();
          setChecks([]);
        },
      },
    ]);
  };

  const displayed = checks.filter((c) => {
    if (filter !== 'ALL' && c.risk_level !== filter) return false;
    if (query.trim()) {
      return c.content_preview.toLowerCase().includes(query.trim().toLowerCase());
    }
    return true;
  });

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>{t('history.title')}</Text>
        {checks.length > 0 && (
          <Pressable onPress={handleClearAll} hitSlop={8}>
            <Text style={styles.clearAllText}>{t('history.clearAll')}</Text>
          </Pressable>
        )}
      </View>

      {/* Search */}
      <View style={styles.searchBox}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.searchInput}
          placeholder={t('history.searchPlaceholder')}
          placeholderTextColor={colors.textMuted}
          value={query}
          onChangeText={setQuery}
          autoCorrect={false}
        />
        {!!query && (
          <Pressable onPress={() => setQuery('')} hitSlop={8}>
            <Text style={styles.clearSearch}>✕</Text>
          </Pressable>
        )}
      </View>

      {/* Filter chips */}
      <View style={styles.chips}>
        {FILTERS.map((f) => (
          <Pressable
            key={f}
            style={[styles.chip, filter === f && styles.chipActive]}
            onPress={() => setFilter(f)}
          >
            <Text style={[styles.chipText, filter === f && styles.chipTextActive]}>
              {f === 'ALL' ? t('history.filterAll') : FILTER_EMOJI[f]}
            </Text>
          </Pressable>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xl }} />
      ) : displayed.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>📋</Text>
          <Text style={styles.emptyTitle}>{t('history.empty')}</Text>
          <Text style={styles.emptyHint}>{t('history.emptyHint')}</Text>
        </View>
      ) : (
        <FlatList
          data={displayed}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <RiskBadge level={item.risk_level} size="sm" />
              <View style={styles.cardBody}>
                <Text style={styles.preview} numberOfLines={2}>
                  {item.content_preview}
                </Text>
                <Text style={styles.meta}>
                  {new Date(item.created_at).toLocaleDateString(
                    lang === 'th' ? 'th-TH' : 'en-US',
                    { month: 'short', day: 'numeric', year: 'numeric' }
                  )}
                  {item.red_flag_count > 0
                    ? `  ·  ${item.red_flag_count} ${t('history.flagCount')}`
                    : ''}
                </Text>
              </View>
              <Pressable onPress={() => handleDelete(item.id)} hitSlop={8}>
                <Text style={styles.trashIcon}>🗑️</Text>
              </Pressable>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  title: { ...typography.h1 },
  clearAllText: { ...typography.caption, color: colors.red, fontWeight: '600' },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.inputBg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    marginHorizontal: spacing.lg,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
    height: 44,
  },
  searchIcon: { fontSize: 15, marginRight: spacing.sm },
  searchInput: { flex: 1, fontSize: 15, color: colors.text, paddingVertical: 0 },
  clearSearch: { fontSize: 14, color: colors.textMuted, paddingLeft: spacing.sm },
  chips: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.primaryLight, borderColor: colors.primary },
  chipText: { ...typography.small, color: colors.textSecondary, fontWeight: '500' },
  chipTextActive: { color: colors.primary, fontWeight: '700' },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.sm,
  },
  cardBody: { flex: 1, marginHorizontal: spacing.sm },
  preview: { ...typography.body, color: colors.text, marginBottom: 2 },
  meta: { ...typography.small, color: colors.textMuted },
  trashIcon: { fontSize: 18 },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    marginTop: spacing.xxl,
  },
  emptyIcon: { fontSize: 40, marginBottom: spacing.md },
  emptyTitle: { ...typography.bodyBold, color: colors.textSecondary, marginBottom: spacing.xs },
  emptyHint: { ...typography.caption, color: colors.textMuted, textAlign: 'center', lineHeight: 20 },
});
