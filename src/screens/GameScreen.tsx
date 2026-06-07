/**
 * GameScreen — Watch Identification Quiz Game
 *
 * Two-phase UX inspired by Thai amulet expert games:
 *
 *   1. LOBBY — avatar dialogue, level + streak header, Daily Challenge
 *      card, 4 category tabs. User picks a category to start.
 *
 *   2. QUESTION — big watch image + 4-option multiple choice. Timer +
 *      loupe-hint. Immediate feedback after answer.
 *
 *   3. RESULT — score breakdown, accuracy, next-level progress, replay
 *      / return-to-lobby CTAs.
 *
 * Persistence:
 *   • Level (เกจิ rank), XP toward next, streak (consecutive correct)
 *     all stored in AsyncStorage.
 *   • Daily Challenge state (today's 5 questions + completion) cached
 *     so re-opening the app within the same day shows the same set.
 *
 * Data source:
 *   • Questions generated from sandbox_watches table — 4 distinct
 *     brands per question (1 correct + 3 decoys) sampled randomly.
 *   • Falls back to hardcoded sample when DB is empty / offline.
 */
import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import {
  View,
  ScrollView,
  Text,
  Pressable,
  Image,
  StyleSheet,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { useLanguage } from '../lib/localization';

// ── Champagne Gold palette (matches PDF + Onboarding) ─────────
const C = {
  bgTop: '#1F130E',
  bgBot: '#0A0805',
  card: 'rgba(26, 22, 18, 0.65)',
  cardActive: 'rgba(212, 185, 140, 0.10)',
  border: 'rgba(212, 185, 140, 0.28)',
  borderActive: '#ECC87A',
  cream: '#EDE0BD',
  gold: '#ECC87A',
  goldDeep: '#8E7345',
  muted: '#A0978A',
  textPrimary: '#FFFFFF',
  textSecondary: '#B5AFA5',
  success: '#3FB37F',
  danger: '#E27676',
  warning: '#E5BA5D',
};

// ── Persistent game state keys ────────────────────────────────
const STORAGE = {
  xp: '@luxury_game/xp',                  // number — total XP accumulated
  streak: '@luxury_game/streak',          // number — current correct-in-a-row
  bestStreak: '@luxury_game/best_streak', // number — all-time best
  dailyDate: '@luxury_game/daily_date',   // ISO date string (YYYY-MM-DD)
  dailyDone: '@luxury_game/daily_done',   // 'true' if today's 5-quiz set done
};

// ── Rank tiers — XP thresholds ────────────────────────────────
// Names use collector-themed language, ascending by craft prestige.
type Rank = {
  key: string;
  th: string;
  en: string;
  emoji: string;
  minXp: number;
  maxXp: number; // null-like: next rank's minXp
};
const RANKS: Rank[] = [
  { key: 'apprentice', th: 'ผู้ฝึกหัด',      en: 'Apprentice',     emoji: '🐣', minXp: 0,    maxXp: 100  },
  { key: 'novice',     th: 'นักสะสมมือใหม่', en: 'Novice',         emoji: '⌚', minXp: 100,  maxXp: 300  },
  { key: 'collector',  th: 'นักสะสม',        en: 'Collector',      emoji: '🎯', minXp: 300,  maxXp: 700  },
  { key: 'expert',     th: 'ผู้เชี่ยวชาญ',   en: 'Expert',         emoji: '🔍', minXp: 700,  maxXp: 1500 },
  { key: 'master',     th: 'นักประมูล',       en: 'Master',         emoji: '👑', minXp: 1500, maxXp: 3500 },
  { key: 'horologist', th: 'นักเวลามือทอง',   en: 'Master Horologist', emoji: '🏆', minXp: 3500, maxXp: 99999 },
];

function rankForXp(xp: number): { current: Rank; next: Rank | null; progress: number } {
  for (let i = RANKS.length - 1; i >= 0; i -= 1) {
    if (xp >= RANKS[i].minXp) {
      const next = RANKS[i + 1] ?? null;
      const span = (next?.minXp ?? RANKS[i].maxXp) - RANKS[i].minXp;
      const within = xp - RANKS[i].minXp;
      const progress = span > 0 ? Math.min(1, within / span) : 1;
      return { current: RANKS[i], next, progress };
    }
  }
  return { current: RANKS[0], next: RANKS[1], progress: 0 };
}

// ── Question category ──────────────────────────────────────────
type Category = 'brand' | 'model' | 'reference' | 'price';

const CATEGORIES: { key: Category; th: string; en: string; emoji: string }[] = [
  { key: 'brand',     th: 'แบรนด์',    en: 'Brand',     emoji: '🏷️' },
  { key: 'model',     th: 'รุ่น',       en: 'Model',     emoji: '⌚' },
  // 'year' removed — sandbox schema has no year column. Keeping the
  // category enum so future data can re-enable it. UI shows 3 cards.
  { key: 'reference', th: 'รหัสรุ่น',   en: 'Reference', emoji: '🔢' },
  { key: 'price',     th: 'มูลค่าตลาด', en: 'Market Value', emoji: '💎' },
];

// ── Question data shape ───────────────────────────────────────
type Question = {
  imageUrl: string;
  prompt: { th: string; en: string };
  options: { text: string; correct: boolean }[]; // length 4
};

// ── Fallback sample question (used if DB unavailable) ─────────
const FALLBACK_QUESTION: Question = {
  imageUrl:
    'https://content.rolex.com/dam/2024/upright-bba-with-shadow/m126610ln-0001.png',
  prompt: { th: 'นาฬิกาในภาพคือแบรนด์อะไร?', en: 'What brand is this watch?' },
  options: [
    { text: 'Rolex',          correct: true },
    { text: 'Omega',          correct: false },
    { text: 'Tudor',          correct: false },
    { text: 'Audemars Piguet', correct: false },
  ],
};

// ─────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────
export default function GameScreen({ navigation }: any) {
  const { lang } = useLanguage();

  // Persistent state (loaded from AsyncStorage on mount)
  const [xp, setXp] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [dailyDone, setDailyDone] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Game flow state
  const [phase, setPhase] = useState<'lobby' | 'playing' | 'result'>('lobby');
  const [category, setCategory] = useState<Category>('brand');
  const [isDaily, setIsDaily] = useState(false);

  // Per-session question state
  const [question, setQuestion] = useState<Question | null>(null);
  const [questionIdx, setQuestionIdx] = useState(0);
  const [questionCount, setQuestionCount] = useState(1); // 1 for category quick-play, 5 for daily
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const [timeLeft, setTimeLeft] = useState(30);
  const [hintUsed, setHintUsed] = useState(false);
  const [sessionXp, setSessionXp] = useState(0);
  const [sessionCorrect, setSessionCorrect] = useState(0);

  // Watches sample loaded from sandbox_watches (for question generation)
  const watchesRef = useRef<any[]>([]);

  // ── Load persistent state on mount ──────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const [rawXp, rawStreak, rawBest, rawDate, rawDone] = await Promise.all([
          AsyncStorage.getItem(STORAGE.xp),
          AsyncStorage.getItem(STORAGE.streak),
          AsyncStorage.getItem(STORAGE.bestStreak),
          AsyncStorage.getItem(STORAGE.dailyDate),
          AsyncStorage.getItem(STORAGE.dailyDone),
        ]);
        setXp(rawXp ? parseInt(rawXp, 10) || 0 : 0);
        setStreak(rawStreak ? parseInt(rawStreak, 10) || 0 : 0);
        setBestStreak(rawBest ? parseInt(rawBest, 10) || 0 : 0);
        // Daily reset — if stored date != today, clear the dailyDone flag
        const today = new Date().toISOString().slice(0, 10);
        if (rawDate === today && rawDone === 'true') {
          setDailyDone(true);
        } else {
          setDailyDone(false);
        }
      } catch (e: any) {
        console.warn('[GameScreen] load state failed:', e?.message);
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  // ── Pre-fetch watches for question generation ───────────────
  // Tries 2 data sources in order of preference:
  //   1. image_embeddings — 13K+ visual references with verified image_url
  //      from the indexer pipeline. Same source visual RAG uses, so the
  //      URLs are known to load on mobile.
  //   2. sandbox_watches — fallback. source_url field may be brand-site
  //      URLs that block hotlinking, hence preferred only when (1) empty.
  //
  // We DON'T select year_made (column doesn't exist on either table).
  // The 'year' category derives the year from the watch name when shown.
  useEffect(() => {
    (async () => {
      try {
        // Primary: image_embeddings (Has confirmed-loading image_url field)
        const { data: emb, error: e1 } = await supabase
          .from('image_embeddings')
          .select('brand, name, reference, image_url')
          .not('image_url', 'is', null)
          .limit(200);
        if (!e1 && emb && emb.length > 0) {
          watchesRef.current = emb.map((r: any) => ({
            brand: r.brand,
            model: r.reference,         // ref code = model id for game purposes
            name: r.name,
            source_url: r.image_url,
            price_thb: null,
          }));
          console.log('[GameScreen] loaded', emb.length, 'watches from image_embeddings');
          return;
        }

        // Fallback: sandbox_watches
        const { data: sb, error: e2 } = await supabase
          .from('sandbox_watches')
          .select('brand, model, name, price_thb, source_url')
          .neq('source_url', '')
          .limit(200);
        if (!e2 && sb && sb.length > 0) {
          watchesRef.current = sb;
          console.log('[GameScreen] loaded', sb.length, 'watches from sandbox_watches');
        } else {
          console.warn('[GameScreen] no watch data — game will use FALLBACK_QUESTION');
        }
      } catch (e: any) {
        console.warn('[GameScreen] load watches failed:', e?.message);
      }
    })();
  }, []);

  // ── Timer ───────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'playing' || showFeedback) return;
    const t = setInterval(() => {
      setTimeLeft((s) => {
        if (s <= 1) {
          clearInterval(t);
          // timeout = treat as wrong answer
          handleAnswer(-1);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, questionIdx, showFeedback]);

  // ── Helpers ─────────────────────────────────────────────────
  const rankInfo = useMemo(() => rankForXp(xp), [xp]);

  const generateQuestion = useCallback(
    (cat: Category): Question => {
      const pool = watchesRef.current;
      if (pool.length < 4) return FALLBACK_QUESTION;

      // Pick a target + 3 distinct decoys
      const shuffled = [...pool].sort(() => Math.random() - 0.5);
      const target = shuffled[0];
      const decoys: any[] = [];
      for (const w of shuffled.slice(1)) {
        if (decoys.length >= 3) break;
        // Ensure decoys differ from target in the relevant field
        const dup =
          (cat === 'brand' && w.brand === target.brand) ||
          (cat === 'model' && w.model === target.model) ||
          (cat === 'reference' && w.model === target.model) ||
          (cat === 'price' && Math.abs((w.price_thb || 0) - (target.price_thb || 0)) < 50000);
        if (!dup && !decoys.some((d) => d.model === w.model)) {
          decoys.push(w);
        }
      }
      while (decoys.length < 3) decoys.push(pool[decoys.length + 1] ?? pool[0]);

      // Build prompt + options per category
      let prompt: Question['prompt'];
      let getValue: (w: any) => string;
      switch (cat) {
        case 'brand':
          prompt = { th: 'นาฬิกาในภาพคือแบรนด์อะไร?', en: 'What brand is this watch?' };
          getValue = (w) => w.brand ?? 'Unknown';
          break;
        case 'model':
          prompt = { th: 'นาฬิกาเรือนนี้คือรุ่นอะไร?', en: 'Which model is this watch?' };
          getValue = (w) => w.name ?? `${w.brand ?? ''} ${w.model ?? ''}`.trim();
          break;
        case 'reference':
          prompt = { th: 'รหัสรุ่น (Reference) ของนาฬิกาเรือนนี้คือ?', en: 'What\'s the reference code?' };
          getValue = (w) => String(w.model ?? '—');
          break;
        case 'price':
          prompt = { th: 'มูลค่าตลาดของเรือนนี้อยู่ที่ประมาณเท่าใด?', en: 'Estimated market value?' };
          getValue = (w) =>
            w.price_thb
              ? '฿' + Math.round(w.price_thb).toLocaleString()
              : (lang === 'th' ? 'ประเมินตามสภาพ' : 'Collector pricing');
          break;
      }

      const opts = [
        { text: getValue(target), correct: true },
        ...decoys.map((d) => ({ text: getValue(d), correct: false })),
      ];
      // De-dup by text (year/price may collide)
      const seen = new Set<string>();
      const uniqueOpts = opts.filter((o) => {
        if (seen.has(o.text)) return false;
        seen.add(o.text);
        return true;
      });
      while (uniqueOpts.length < 4) {
        uniqueOpts.push({ text: '—', correct: false });
      }
      // Shuffle
      uniqueOpts.sort(() => Math.random() - 0.5);

      return {
        imageUrl: target.source_url,
        prompt,
        options: uniqueOpts.slice(0, 4),
      };
    },
    []
  );

  // ── Lobby actions ───────────────────────────────────────────
  const startCategoryQuiz = (cat: Category) => {
    setCategory(cat);
    setIsDaily(false);
    setQuestionCount(3);
    setQuestionIdx(0);
    setSessionXp(0);
    setSessionCorrect(0);
    setQuestion(generateQuestion(cat));
    setSelectedIdx(null);
    setShowFeedback(false);
    setTimeLeft(30);
    setHintUsed(false);
    setPhase('playing');
  };

  const startDailyChallenge = () => {
    if (dailyDone) {
      Alert.alert(
        lang === 'th' ? 'เล่นแล้ววันนี้' : 'Already Done',
        lang === 'th'
          ? 'คุณเล่น Daily Challenge ของวันนี้เสร็จแล้ว — กลับมาพรุ่งนี้รับชุดใหม่ครับ!'
          : 'You\'ve completed today\'s Daily Challenge. Come back tomorrow for a new set!'
      );
      return;
    }
    setCategory('brand'); // daily mixes categories — pick first as default
    setIsDaily(true);
    setQuestionCount(5);
    setQuestionIdx(0);
    setSessionXp(0);
    setSessionCorrect(0);
    setQuestion(generateQuestion(randomCategory()));
    setSelectedIdx(null);
    setShowFeedback(false);
    setTimeLeft(30);
    setHintUsed(false);
    setPhase('playing');
  };

  const randomCategory = (): Category => {
    const keys = CATEGORIES.map((c) => c.key);
    return keys[Math.floor(Math.random() * keys.length)];
  };

  // ── Question actions ────────────────────────────────────────
  const handleAnswer = (idx: number) => {
    if (showFeedback || !question) return;
    setSelectedIdx(idx);
    setShowFeedback(true);

    const isCorrect = idx >= 0 && question.options[idx]?.correct;
    if (isCorrect) {
      // Base 10 + speed bonus up to 5
      const speedBonus = Math.max(0, Math.floor(timeLeft / 6));
      const earned = 10 + speedBonus;
      setSessionXp((v) => v + earned);
      setSessionCorrect((v) => v + 1);
    }
  };

  const advanceToNextQuestion = () => {
    if (!question) return;
    const nextIdx = questionIdx + 1;
    if (nextIdx >= questionCount) {
      finishSession();
      return;
    }
    setQuestionIdx(nextIdx);
    setQuestion(generateQuestion(isDaily ? randomCategory() : category));
    setSelectedIdx(null);
    setShowFeedback(false);
    setTimeLeft(30);
    setHintUsed(false);
  };

  const useLoupeHint = () => {
    if (hintUsed || !question) return;
    setHintUsed(true);
    // Eliminate 2 wrong options visually — done via render guard below
  };

  // Indices to dim out when loupe hint used (2 wrong, picked deterministically)
  const dimmedIndices = useMemo(() => {
    if (!hintUsed || !question) return new Set<number>();
    const wrongIdxs = question.options
      .map((o, i) => ({ correct: o.correct, i }))
      .filter((o) => !o.correct)
      .map((o) => o.i);
    return new Set(wrongIdxs.slice(0, 2));
  }, [hintUsed, question]);

  // ── Session finalization ────────────────────────────────────
  const finishSession = useCallback(async () => {
    // Update XP + streak based on session perf
    const allCorrect = sessionCorrect === questionCount;
    const newXp = xp + sessionXp;
    const newStreak = allCorrect ? streak + 1 : sessionCorrect > 0 ? streak : 0;
    const newBest = Math.max(bestStreak, newStreak);

    setXp(newXp);
    setStreak(newStreak);
    setBestStreak(newBest);

    try {
      await Promise.all([
        AsyncStorage.setItem(STORAGE.xp, String(newXp)),
        AsyncStorage.setItem(STORAGE.streak, String(newStreak)),
        AsyncStorage.setItem(STORAGE.bestStreak, String(newBest)),
      ]);
      if (isDaily) {
        await Promise.all([
          AsyncStorage.setItem(STORAGE.dailyDate, new Date().toISOString().slice(0, 10)),
          AsyncStorage.setItem(STORAGE.dailyDone, 'true'),
        ]);
        setDailyDone(true);
      }
    } catch (e: any) {
      console.warn('[GameScreen] persist session failed:', e?.message);
    }

    setPhase('result');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionXp, sessionCorrect, questionCount, xp, streak, bestStreak, isDaily]);

  // ─────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────
  if (!loaded) {
    return (
      <View style={[styles.root, { justifyContent: 'center', alignItems: 'center' }]}>
        <LinearGradient colors={[C.bgTop, C.bgBot]} style={StyleSheet.absoluteFillObject} />
        <Text style={{ color: C.muted }}>{lang === 'th' ? 'กำลังโหลด...' : 'Loading…'}</Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <LinearGradient colors={[C.bgTop, C.bgBot]} style={StyleSheet.absoluteFillObject} />
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        {phase === 'lobby' && (
          <LobbyView
            lang={lang}
            xp={xp}
            streak={streak}
            bestStreak={bestStreak}
            rankInfo={rankInfo}
            dailyDone={dailyDone}
            onClose={() => navigation.goBack()}
            onStartDaily={startDailyChallenge}
            onStartCategory={startCategoryQuiz}
          />
        )}

        {phase === 'playing' && question && (
          <QuestionView
            lang={lang}
            question={question}
            questionIdx={questionIdx}
            questionCount={questionCount}
            timeLeft={timeLeft}
            selectedIdx={selectedIdx}
            showFeedback={showFeedback}
            hintUsed={hintUsed}
            dimmedIndices={dimmedIndices}
            sessionXp={sessionXp}
            isDaily={isDaily}
            onClose={() => setPhase('lobby')}
            onAnswer={handleAnswer}
            onNext={advanceToNextQuestion}
            onUseHint={useLoupeHint}
          />
        )}

        {phase === 'result' && (
          <ResultView
            lang={lang}
            sessionXp={sessionXp}
            sessionCorrect={sessionCorrect}
            questionCount={questionCount}
            totalXp={xp}
            rankInfo={rankInfo}
            streak={streak}
            isDaily={isDaily}
            onBackToLobby={() => setPhase('lobby')}
            onClose={() => navigation.goBack()}
          />
        )}
      </SafeAreaView>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────
// LobbyView
// ─────────────────────────────────────────────────────────────────
function LobbyView({
  lang,
  xp,
  streak,
  bestStreak,
  rankInfo,
  dailyDone,
  onClose,
  onStartDaily,
  onStartCategory,
}: {
  lang: 'th' | 'en';
  xp: number;
  streak: number;
  bestStreak: number;
  rankInfo: ReturnType<typeof rankForXp>;
  dailyDone: boolean;
  onClose: () => void;
  onStartDaily: () => void;
  onStartCategory: (c: Category) => void;
}) {
  const xpToNext = rankInfo.next ? rankInfo.next.minXp - xp : 0;
  return (
    <ScrollView contentContainerStyle={styles.lobbyScroll} showsVerticalScrollIndicator={false}>
      {/* Top bar */}
      <View style={styles.topBar}>
        <Pressable onPress={onClose} hitSlop={12}>
          <Feather name="x" size={22} color={C.cream} />
        </Pressable>
        <Text style={styles.topBarTitle}>
          {lang === 'th' ? 'ฝึกฝนสายตานักสะสม' : 'Collector\'s Eye Training'}
        </Text>
        <View style={styles.pointsPill}>
          <Text style={styles.pointsPillText}>{xp} pts</Text>
        </View>
      </View>

      {/* Rank + streak */}
      <View style={styles.rankRow}>
        <View style={styles.rankCard}>
          <Text style={styles.rankEmoji}>{rankInfo.current.emoji}</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.rankName}>
              {lang === 'th' ? rankInfo.current.th : rankInfo.current.en}
            </Text>
            {rankInfo.next && (
              <Text style={styles.rankToNext}>
                {lang === 'th'
                  ? `ถึง ${rankInfo.next.th} อีก ${xpToNext} pts`
                  : `${xpToNext} pts to ${rankInfo.next.en}`}
              </Text>
            )}
          </View>
        </View>
        <View style={styles.streakBadge}>
          <Text style={styles.streakEmoji}>🔥</Text>
          <Text style={styles.streakNumber}>{streak}</Text>
        </View>
      </View>

      {/* Progress bar */}
      {rankInfo.next && (
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${rankInfo.progress * 100}%` }]} />
        </View>
      )}

      {/* Daily Challenge card */}
      <Pressable onPress={onStartDaily} style={styles.dailyCard}>
        <LinearGradient
          colors={
            dailyDone
              ? ['rgba(160, 151, 138, 0.10)', 'rgba(0, 0, 0, 0.40)']
              : ['rgba(212, 185, 140, 0.18)', 'rgba(142, 115, 69, 0.12)']
          }
          style={StyleSheet.absoluteFillObject}
        />
        <View style={styles.dailyIconWrap}>
          <Text style={{ fontSize: 24 }}>{dailyDone ? '✅' : '🏆'}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.dailyTitle}>
            {lang === 'th' ? 'Daily Challenge' : 'Daily Challenge'}
          </Text>
          <Text style={styles.dailySub}>
            {dailyDone
              ? (lang === 'th' ? 'เสร็จแล้ววันนี้ · กลับมาพรุ่งนี้' : 'Done for today — back tomorrow')
              : (lang === 'th' ? '5 ข้อชุดเดียวกันทุกวัน · กดเพื่อเริ่ม' : '5 questions, same for everyone · tap to start')}
          </Text>
        </View>
        {!dailyDone && <Feather name="play-circle" size={28} color={C.gold} />}
      </Pressable>

      {/* Category chips */}
      <Text style={styles.categoryHeader}>
        {lang === 'th' ? 'เลือกหมวดทดสอบ' : 'Choose a category'}
      </Text>

      <View style={styles.categoryGrid}>
        {CATEGORIES.map((cat) => (
          <Pressable
            key={cat.key}
            onPress={() => onStartCategory(cat.key)}
            style={({ pressed }) => [
              styles.categoryCard,
              pressed && { opacity: 0.85 },
            ]}
          >
            <Text style={{ fontSize: 28 }}>{cat.emoji}</Text>
            <Text style={styles.categoryLabel}>
              {lang === 'th' ? cat.th : cat.en}
            </Text>
            <Feather name="chevron-right" size={16} color={C.muted} style={{ position: 'absolute', right: 12, top: 14 }} />
          </Pressable>
        ))}
      </View>

      {/* Avatar dialogue (bottom — like a guide) */}
      <View style={styles.dialogueRow}>
        <View style={styles.avatarCircle}>
          <Feather name="user" size={22} color={C.gold} />
        </View>
        <View style={styles.dialogueBubble}>
          <Text style={styles.dialogueText}>
            {lang === 'th'
              ? `สวัสดีครับ${streak > 0 ? ` คุณกำลังต่อสตรีค ${streak} ครั้ง!` : ''} พร้อมฝึกสายตาวันนี้?`
              : `Hi there!${streak > 0 ? ` You're on a ${streak}-streak!` : ''} Ready to train?`}
          </Text>
        </View>
      </View>

      {/* Best streak footer */}
      {bestStreak > 0 && (
        <Text style={styles.bestStreakFooter}>
          {lang === 'th'
            ? `สถิติสตรีคดีที่สุด: ${bestStreak} ครั้ง`
            : `Best streak: ${bestStreak}`}
        </Text>
      )}
    </ScrollView>
  );
}

// ─────────────────────────────────────────────────────────────────
// QuestionView
// ─────────────────────────────────────────────────────────────────
function QuestionView({
  lang,
  question,
  questionIdx,
  questionCount,
  timeLeft,
  selectedIdx,
  showFeedback,
  hintUsed,
  dimmedIndices,
  sessionXp,
  isDaily,
  onClose,
  onAnswer,
  onNext,
  onUseHint,
}: {
  lang: 'th' | 'en';
  question: Question;
  questionIdx: number;
  questionCount: number;
  timeLeft: number;
  selectedIdx: number | null;
  showFeedback: boolean;
  hintUsed: boolean;
  dimmedIndices: Set<number>;
  sessionXp: number;
  isDaily: boolean;
  onClose: () => void;
  onAnswer: (idx: number) => void;
  onNext: () => void;
  onUseHint: () => void;
}) {
  const correctIdx = question.options.findIndex((o) => o.correct);
  return (
    <ScrollView contentContainerStyle={styles.questionScroll} showsVerticalScrollIndicator={false}>
      {/* Top bar — close + progress + timer */}
      <View style={styles.topBar}>
        <Pressable onPress={onClose} hitSlop={12}>
          <Feather name="x" size={22} color={C.cream} />
        </Pressable>
        <Text style={styles.topBarTitle}>
          {isDaily
            ? (lang === 'th' ? 'Daily Challenge' : 'Daily Challenge')
            : (lang === 'th' ? 'ฝึกฝนสายตา' : 'Eye Training')}
        </Text>
        <View style={styles.pointsPill}>
          <Text style={styles.pointsPillText}>+{sessionXp}</Text>
        </View>
      </View>

      {/* Progress + timer */}
      <View style={styles.progressRow}>
        <Text style={styles.progressLabel}>
          {lang === 'th' ? `ข้อ ${questionIdx + 1}/${questionCount}` : `Q ${questionIdx + 1}/${questionCount}`}
        </Text>
        <View style={[styles.timerPill, timeLeft <= 10 && { borderColor: C.danger }]}>
          <Feather name="clock" size={12} color={timeLeft <= 10 ? C.danger : C.gold} />
          <Text style={[styles.timerText, timeLeft <= 10 && { color: C.danger }]}>{timeLeft}s</Text>
        </View>
      </View>

      {/* Watch image — with error fallback (placeholder icon shown if
          URL fails to load on the device, e.g. CDN hotlink block or
          slow network). Sets imgError state to swap content. */}
      <View style={styles.watchImageWrap}>
        <View style={styles.watchImageBorder}>
          <WatchImage url={question.imageUrl} />
        </View>
      </View>

      {/* Loupe hint button (1 per question) */}
      <Pressable
        onPress={onUseHint}
        disabled={hintUsed || showFeedback}
        style={[
          styles.hintBtn,
          (hintUsed || showFeedback) && { opacity: 0.45 },
        ]}
      >
        <Feather name="search" size={14} color={C.gold} />
        <Text style={styles.hintBtnText}>
          {lang === 'th'
            ? (hintUsed ? 'ใช้ Loupe แล้ว' : 'ใช้แว่นขยายตัดตัวเลือกผิด 2 ข้อ')
            : (hintUsed ? 'Loupe used' : 'Loupe Hint — remove 2 wrong')}
        </Text>
      </Pressable>

      {/* Prompt */}
      <Text style={styles.prompt}>
        {lang === 'th' ? question.prompt.th : question.prompt.en}
      </Text>

      {/* 4 options */}
      <View style={styles.optionsList}>
        {question.options.map((opt, i) => {
          const isSelected = selectedIdx === i;
          const isCorrect = i === correctIdx;
          const showCorrect = showFeedback && isCorrect;
          const showWrong = showFeedback && isSelected && !isCorrect;
          const isDimmed = dimmedIndices.has(i);

          return (
            <Pressable
              key={i}
              onPress={() => onAnswer(i)}
              disabled={showFeedback || isDimmed}
              style={({ pressed }) => [
                styles.optionCard,
                isSelected && styles.optionCardSelected,
                showCorrect && styles.optionCardCorrect,
                showWrong && styles.optionCardWrong,
                isDimmed && { opacity: 0.3 },
                pressed && !showFeedback && { opacity: 0.85 },
              ]}
            >
              <View style={styles.optionLetterCircle}>
                <Text style={styles.optionLetter}>{String.fromCharCode(65 + i)}</Text>
              </View>
              <Text style={styles.optionText}>{opt.text}</Text>
              {showCorrect && <Feather name="check-circle" size={20} color={C.success} />}
              {showWrong && <Feather name="x-circle" size={20} color={C.danger} />}
            </Pressable>
          );
        })}
      </View>

      {/* Feedback + Next button */}
      {showFeedback && (
        <View style={styles.feedbackBlock}>
          <Text
            style={[
              styles.feedbackText,
              { color: selectedIdx === correctIdx ? C.success : C.danger },
            ]}
          >
            {selectedIdx === correctIdx
              ? (lang === 'th' ? '🎉 ถูกต้อง!' : '🎉 Correct!')
              : selectedIdx === -1
              ? (lang === 'th' ? '⏰ หมดเวลา' : '⏰ Time\'s up')
              : (lang === 'th' ? '❌ ผิด — คำตอบที่ถูกคือ ' + question.options[correctIdx].text : '❌ Wrong — correct: ' + question.options[correctIdx].text)}
          </Text>
          <Pressable onPress={onNext} style={styles.nextBtn}>
            <Text style={styles.nextBtnText}>
              {questionIdx + 1 >= questionCount
                ? (lang === 'th' ? 'ดูสรุปผล' : 'See Results')
                : (lang === 'th' ? 'ข้อถัดไป →' : 'Next →')}
            </Text>
          </Pressable>
        </View>
      )}
    </ScrollView>
  );
}

// ─────────────────────────────────────────────────────────────────
// ResultView
// ─────────────────────────────────────────────────────────────────
function ResultView({
  lang,
  sessionXp,
  sessionCorrect,
  questionCount,
  totalXp,
  rankInfo,
  streak,
  isDaily,
  onBackToLobby,
  onClose,
}: {
  lang: 'th' | 'en';
  sessionXp: number;
  sessionCorrect: number;
  questionCount: number;
  totalXp: number;
  rankInfo: ReturnType<typeof rankForXp>;
  streak: number;
  isDaily: boolean;
  onBackToLobby: () => void;
  onClose: () => void;
}) {
  const accuracy = Math.round((sessionCorrect / questionCount) * 100);
  return (
    <ScrollView contentContainerStyle={styles.resultScroll} showsVerticalScrollIndicator={false}>
      <View style={styles.topBar}>
        <Pressable onPress={onClose} hitSlop={12}>
          <Feather name="x" size={22} color={C.cream} />
        </Pressable>
        <Text style={styles.topBarTitle}>
          {lang === 'th' ? 'สรุปผล' : 'Results'}
        </Text>
        <View style={{ width: 22 }} />
      </View>

      <View style={{ alignItems: 'center', marginTop: 16, marginBottom: 24 }}>
        <Text style={{ fontSize: 60 }}>{accuracy === 100 ? '🏆' : accuracy >= 60 ? '🎯' : '📚'}</Text>
      </View>

      <View style={styles.resultStatsCard}>
        <View style={{ alignItems: 'center', paddingVertical: 16 }}>
          <Text style={styles.resultXpBig}>+{sessionXp}</Text>
          <Text style={styles.resultXpLabel}>
            {lang === 'th' ? 'แต้มประสบการณ์ที่ได้รับ' : 'XP earned'}
          </Text>
        </View>
        <View style={styles.resultStatsDivider} />
        <View style={styles.resultStatsRow}>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={styles.resultStatNumber}>{sessionCorrect}/{questionCount}</Text>
            <Text style={styles.resultStatLabel}>
              {lang === 'th' ? 'ตอบถูก' : 'Correct'}
            </Text>
          </View>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={styles.resultStatNumber}>{accuracy}%</Text>
            <Text style={styles.resultStatLabel}>
              {lang === 'th' ? 'ความแม่นยำ' : 'Accuracy'}
            </Text>
          </View>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={styles.resultStatNumber}>{streak}🔥</Text>
            <Text style={styles.resultStatLabel}>
              {lang === 'th' ? 'สตรีค' : 'Streak'}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.resultRankCard}>
        <Text style={styles.resultRankEmoji}>{rankInfo.current.emoji}</Text>
        <Text style={styles.resultRankName}>
          {lang === 'th' ? rankInfo.current.th : rankInfo.current.en}
        </Text>
        <Text style={styles.resultRankXp}>
          {totalXp} XP {rankInfo.next ? `· ${rankInfo.next.minXp - totalXp} ${lang === 'th' ? 'จน Up' : 'to next'}` : ''}
        </Text>
        {rankInfo.next && (
          <View style={[styles.progressTrack, { marginTop: 8, width: '100%' }]}>
            <View style={[styles.progressFill, { width: `${rankInfo.progress * 100}%` }]} />
          </View>
        )}
      </View>

      <Pressable onPress={onBackToLobby} style={styles.primaryCta}>
        <Text style={styles.primaryCtaText}>
          {lang === 'th' ? 'กลับสู่หน้าหลัก' : 'Back to Lobby'}
        </Text>
      </Pressable>

      {isDaily && (
        <Text style={styles.dailyDoneFooter}>
          {lang === 'th'
            ? '🎉 Daily Challenge วันนี้เสร็จแล้ว — กลับมาพรุ่งนี้รับชุดใหม่!'
            : '🎉 Today\'s Daily Challenge complete — new set tomorrow!'}
        </Text>
      )}
    </ScrollView>
  );
}

// ─────────────────────────────────────────────────────────────────
// WatchImage — round-clipped image with loading + error fallback.
// Many of our reference URLs are brand CDNs (Rolex, Patek, etc.) that
// sometimes block hotlinking or are slow. Without this fallback the
// user sees an empty circle and can't tell whether the question loaded.
// ─────────────────────────────────────────────────────────────────
function WatchImage({ url }: { url: string }) {
  const [errored, setErrored] = useState(false);
  const [loaded, setLoaded] = useState(false);

  if (!url || errored) {
    return (
      <View style={[styles.watchImage, { justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(212, 185, 140, 0.08)' }]}>
        <Feather name="image" size={48} color={C.muted} />
        <Text style={{ color: C.muted, fontSize: 10, marginTop: 8, letterSpacing: 1 }}>
          {errored ? 'IMAGE UNAVAILABLE' : 'NO IMAGE'}
        </Text>
      </View>
    );
  }

  return (
    <View style={{ width: '100%', height: '100%' }}>
      <Image
        source={{ uri: url }}
        style={styles.watchImage}
        resizeMode="cover"
        onLoad={() => setLoaded(true)}
        onError={(e) => {
          console.warn('[GameScreen] image failed:', url.slice(0, 80), e.nativeEvent?.error);
          setErrored(true);
        }}
      />
      {!loaded && (
        <View style={[StyleSheet.absoluteFillObject, { justifyContent: 'center', alignItems: 'center' }]}>
          <Feather name="loader" size={32} color={C.muted} />
        </View>
      )}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bgBot },

  // Top bar — shared across phases
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 12,
  },
  topBarTitle: {
    color: C.cream,
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  pointsPill: {
    backgroundColor: 'rgba(212, 185, 140, 0.18)',
    borderWidth: 1,
    borderColor: C.gold,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    minWidth: 56,
    alignItems: 'center',
  },
  pointsPillText: {
    color: C.gold,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
  },

  // ── Lobby ──
  lobbyScroll: { padding: 20, paddingBottom: 40, gap: 14 },
  rankRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 8 },
  rankCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  rankEmoji: { fontSize: 30 },
  rankName: { color: C.cream, fontSize: 16, fontWeight: '700' },
  rankToNext: { color: C.muted, fontSize: 11, marginTop: 2 },
  streakBadge: {
    backgroundColor: 'rgba(226, 118, 118, 0.10)',
    borderWidth: 1,
    borderColor: 'rgba(229, 186, 93, 0.50)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    alignItems: 'center',
    minWidth: 56,
  },
  streakEmoji: { fontSize: 18 },
  streakNumber: { color: C.warning, fontSize: 16, fontWeight: '800', marginTop: 2 },
  progressTrack: {
    height: 6,
    backgroundColor: 'rgba(212, 185, 140, 0.15)',
    borderRadius: 3,
    overflow: 'hidden',
    marginTop: 8,
  },
  progressFill: { height: '100%', backgroundColor: C.gold, borderRadius: 3 },

  dailyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: 'rgba(212, 185, 140, 0.40)',
    overflow: 'hidden',
    marginTop: 6,
  },
  dailyIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(212, 185, 140, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(212, 185, 140, 0.40)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dailyTitle: { color: C.cream, fontSize: 16, fontWeight: '700' },
  dailySub: { color: C.muted, fontSize: 12, marginTop: 2 },

  categoryHeader: {
    color: C.gold,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 2.5,
    textTransform: 'uppercase',
    marginTop: 18,
    marginBottom: 4,
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  categoryCard: {
    width: '48%',
    flexGrow: 0,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 14,
    paddingVertical: 18,
    paddingHorizontal: 14,
    gap: 6,
  },
  categoryLabel: { color: C.cream, fontSize: 15, fontWeight: '600' },

  dialogueRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 24 },
  avatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(212, 185, 140, 0.12)',
    borderWidth: 1.5,
    borderColor: C.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dialogueBubble: {
    flex: 1,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  dialogueText: { color: C.cream, fontSize: 13.5, lineHeight: 19 },
  bestStreakFooter: {
    color: C.muted,
    fontSize: 11,
    textAlign: 'center',
    marginTop: 20,
    letterSpacing: 0.5,
  },

  // ── Question ──
  questionScroll: { padding: 20, paddingBottom: 40, gap: 12 },
  progressRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  progressLabel: { color: C.muted, fontSize: 12, fontWeight: '600', letterSpacing: 1 },
  timerPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderWidth: 1, borderColor: C.gold, borderRadius: 12,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  timerText: { color: C.gold, fontSize: 12, fontWeight: '800' },

  watchImageWrap: { alignItems: 'center', marginVertical: 6 },
  watchImageBorder: {
    width: 260, height: 260, borderRadius: 130,
    borderWidth: 2, borderColor: C.gold,
    padding: 6,
    backgroundColor: 'rgba(0, 0, 0, 0.50)',
  },
  watchImage: { width: '100%', height: '100%', borderRadius: 130 },

  hintBtn: {
    alignSelf: 'center',
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(212, 185, 140, 0.10)',
    borderWidth: 1, borderColor: C.border,
    paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: 14,
    marginTop: 4, marginBottom: 8,
  },
  hintBtnText: { color: C.gold, fontSize: 11.5, fontWeight: '600', letterSpacing: 0.5 },

  prompt: {
    color: C.cream,
    fontSize: 18, fontWeight: '700',
    textAlign: 'center',
    marginTop: 6, marginBottom: 8,
    lineHeight: 25,
  },

  optionsList: { gap: 10 },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14, paddingHorizontal: 14,
    backgroundColor: C.card,
    borderWidth: 1, borderColor: C.border,
    borderRadius: 14,
  },
  optionCardSelected: { borderColor: C.gold, backgroundColor: C.cardActive },
  optionCardCorrect: { borderColor: C.success, backgroundColor: 'rgba(63, 179, 127, 0.10)' },
  optionCardWrong: { borderColor: C.danger, backgroundColor: 'rgba(226, 118, 118, 0.10)' },
  optionLetterCircle: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: 'rgba(212, 185, 140, 0.15)',
    borderWidth: 1, borderColor: C.gold,
    alignItems: 'center', justifyContent: 'center',
  },
  optionLetter: { color: C.gold, fontSize: 13, fontWeight: '800' },
  optionText: { flex: 1, color: C.textPrimary, fontSize: 14, fontWeight: '500', lineHeight: 19 },

  feedbackBlock: { marginTop: 10, gap: 12, alignItems: 'center' },
  feedbackText: { fontSize: 15, fontWeight: '700', textAlign: 'center' },
  nextBtn: {
    backgroundColor: C.gold,
    paddingHorizontal: 28, paddingVertical: 12,
    borderRadius: 12,
  },
  nextBtnText: { color: '#0A0805', fontSize: 14, fontWeight: '800', letterSpacing: 1 },

  // ── Result ──
  resultScroll: { padding: 20, paddingBottom: 40, gap: 16 },
  resultStatsCard: {
    backgroundColor: C.card,
    borderWidth: 1, borderColor: C.border,
    borderRadius: 16,
    paddingVertical: 8,
  },
  resultXpBig: { color: C.gold, fontSize: 44, fontWeight: '900', letterSpacing: -1 },
  resultXpLabel: { color: C.muted, fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', marginTop: 4 },
  resultStatsDivider: { height: 1, backgroundColor: C.border, marginVertical: 6, marginHorizontal: 16 },
  resultStatsRow: { flexDirection: 'row', paddingVertical: 14 },
  resultStatNumber: { color: C.cream, fontSize: 22, fontWeight: '800' },
  resultStatLabel: { color: C.muted, fontSize: 10, marginTop: 4, letterSpacing: 0.8, textTransform: 'uppercase' },

  resultRankCard: {
    alignItems: 'center',
    backgroundColor: C.card,
    borderWidth: 1, borderColor: C.gold,
    borderRadius: 16,
    paddingVertical: 18, paddingHorizontal: 18,
  },
  resultRankEmoji: { fontSize: 40 },
  resultRankName: { color: C.cream, fontSize: 18, fontWeight: '800', marginTop: 8, letterSpacing: 0.5 },
  resultRankXp: { color: C.muted, fontSize: 12, marginTop: 4 },

  primaryCta: {
    marginTop: 4,
    backgroundColor: C.gold,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  primaryCtaText: { color: '#0A0805', fontSize: 15, fontWeight: '800', letterSpacing: 1.5, textTransform: 'uppercase' },
  dailyDoneFooter: { color: C.muted, fontSize: 12, textAlign: 'center', marginTop: 10, lineHeight: 17 },
});
