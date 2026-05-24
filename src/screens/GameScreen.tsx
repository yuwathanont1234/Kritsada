import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  ScrollView,
  Text,
  Pressable,
  Image,
  Dimensions,
  StyleSheet,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path, Circle, Defs, LinearGradient as SvgLinearGradient, Stop, G, Line, Rect, Text as SvgText } from 'react-native-svg';
import { Feather } from '@expo/vector-icons';
import { colors, radius, spacing } from '../lib/theme';
import { supabase } from '../lib/supabase';
import { useLanguage } from '../lib/localization';
import { styles } from './AppStyles';

export default function GameScreen({ navigation }: any) {
  const { t, lang } = useLanguage();
  const [score, setScore] = useState(0);
  const [level, setLevel] = useState(1);
  const [busy, setBusy] = useState(false);
  const [timeLeft, setTimeLeft] = useState(30);
  const [hintsRemaining, setHintsRemaining] = useState(1);
  const [hintVisible, setHintVisible] = useState(false);
  const [gamePhase, setGamePhase] = useState<'playing' | 'result' | 'scoreboard'>('playing');
  const [resultType, setResultType] = useState<'correct' | 'incorrect' | 'timeout'>('correct');
  const [speedBonusEarned, setSpeedBonusEarned] = useState(false);

  const [dynamicLevels, setDynamicLevels] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function initGame() {
      try {
        // Query target watches from sandbox_watches database
        const { data: allWatches, error } = await supabase
          .from('sandbox_watches')
          .select('brand, model, name, price_thb, source_url')
          .neq('source_url', '');

        if (error) throw error;

        if (allWatches && allWatches.length >= 3) {
          // Shuffle list
          const shuffled = [...allWatches].sort(() => 0.5 - Math.random());
          
          // Select 3 targets with distinct brands to maximize visual variety
          const targets: any[] = [];
          for (const w of shuffled) {
            if (targets.length >= 3) break;
            if (!targets.some(t => t.brand === w.brand)) {
              targets.push(w);
            }
          }

          // If less than 3 distinct brands, fill with others
          if (targets.length < 3) {
            for (const w of shuffled) {
              if (targets.length >= 3) break;
              if (!targets.some(t => t.model === w.model)) {
                targets.push(w);
              }
            }
          }

          // Build final mixed levels (Level 1, 2, 3)
          const levels: any[] = [];
          for (let i = 0; i < 3; i++) {
            const target = targets[i];
            
            // Search a decoy watch of the SAME brand but different model
            let decoy = shuffled.find(w => w.brand === target.brand && w.model !== target.model);
            
            // Fallback decoy if not found
            if (!decoy) {
              decoy = shuffled.find(w => w.model !== target.model);
            }

            // If still no decoy, use a fallback mock watch
            if (!decoy) {
              decoy = {
                brand: target.brand,
                model: 'Heritage Chronograph',
                name: `${target.brand} Special Edition`,
                price_thb: (target.price_thb || 450000) * 1.15,
                source_url: 'https://images.unsplash.com/photo-1522312346375-d1a52e2b99b3?auto=format&fit=crop&w=400&q=80'
              };
            }

            // Randomize correct answer choice: Option A or Option B
            const correctChoice = Math.random() > 0.5 ? 'A' : 'B';

            // Level 1: Style 1 (Given Image, guess Model Name)
            // Level 2: Style 2 (Given Model Name, choose Image A/B)
            // Level 3: Style 1 (Given Image, guess Model Name)
            const style = i === 1 ? 'choose_picture' : 'choose_model';

            levels.push({
              target,
              decoy,
              correctChoice,
              style,
            });
          }

          setDynamicLevels(levels);
        }
      } catch (err) {
        console.warn('[GameScreen] Error loading dynamic watches:', err);
      } finally {
        setLoading(false);
      }
    }

    initGame();
  }, []);

  useEffect(() => {
    if (gamePhase !== 'playing') return;

    const timer = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          clearInterval(timer);
          handleTimeout();
          return 0;
        }
        return t - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [level, gamePhase]);

  const handleGuess = (choice: 'A' | 'B') => {
    if (busy || gamePhase !== 'playing') return;
    setBusy(true);

    const details = getCaliberDetails();
    const correct = choice === details.correctCaliber;
    
    const isSpeedy = timeLeft > 20; // Answered within 10 seconds
    const ptsEarned = correct ? (10 + (isSpeedy ? 5 : 0)) : 0;
    
    setScore((s) => s + ptsEarned);
    setSpeedBonusEarned(isSpeedy);
    setResultType(correct ? 'correct' : 'incorrect');
    setGamePhase('result');
    setBusy(false);
  };

  const handleTimeout = () => {
    setSpeedBonusEarned(false);
    setResultType('timeout');
    setGamePhase('result');
  };

  // Get active caliber details
  const getCaliberDetails = () => {
    // If dynamic levels loaded successfully
    if (dynamicLevels.length >= 3) {
      const currentLevel = dynamicLevels[level - 1];
      const { target, decoy, correctChoice, style } = currentLevel;

      const isA = correctChoice === 'A';
      const optionA = isA ? target : decoy;
      const optionB = isA ? decoy : target;

      if (style === 'choose_model') {
        // Style 1: Guess the Model from Picture
        return {
          style: 'choose_model' as const,
          title: `${target.brand.toUpperCase()} MODEL TEST`,
          subtitle: lang === 'th' 
            ? 'ทายชื่อรุ่นนาฬิกาหรูที่ถูกต้องจากภาพซูมหน้าปัดด้านบน' 
            : 'Identify the correct watch model matching the dial scan',
          imageUrl: target.source_url,
          correctCaliber: correctChoice,
          hint: lang === 'th'
            ? `สังเกตรายละเอียดบนหน้าปัด หน้าปัดย่อย เข็ม และกรอบตัวเรือน เอกลักษณ์เฉพาะของรุ่น ${target.model} จะมีความต่างจาก ${decoy.model} อย่างชัดเจน`
            : `Examine the dial layouts, subdials, and hands configuration. The authentic traits of ${target.model} distinguish it from the ${decoy.model} model.`,
          insight: lang === 'th'
            ? `ถูกต้องแล้ว! นาฬิกาเรือนนี้คือ ${target.brand} รุ่น ${target.model} (${target.name}) ของแท้เลอค่า มีมูลค่าตลาดประมาณ ${target.price_thb ? target.price_thb.toLocaleString() + ' บาท' : 'ประเมินตามสภาพเรือน'}`
            : `Correct! This timepiece is an authentic ${target.brand} ${target.model} (${target.name}) with an estimated market valuation of ${target.price_thb ? target.price_thb.toLocaleString() + ' THB' : 'Collector value'}.`,
          calA: {
            title: `OPTION A: ${optionA.model.toUpperCase()}`,
            desc: [
              `• Brand: ${optionA.brand}`,
              `• Model: ${optionA.model}`,
              `• Reference: ${optionA.name}`,
              `• Market Value: ${optionA.price_thb ? optionA.price_thb.toLocaleString() + ' THB' : 'Collector Pricing'}`
            ]
          },
          calB: {
            title: `OPTION B: ${optionB.model.toUpperCase()}`,
            desc: [
              `• Brand: ${optionB.brand}`,
              `• Model: ${optionB.model}`,
              `• Reference: ${optionB.name}`,
              `• Market Value: ${optionB.price_thb ? optionB.price_thb.toLocaleString() + ' THB' : 'Collector Pricing'}`
            ]
          }
        };
      } else {
        // Style 2: Guess the Picture from Model Title
        return {
          style: 'choose_picture' as const,
          title: lang === 'th' ? `ค้นหาภาพ: ${target.brand.toUpperCase()} ${target.model.toUpperCase()}` : `IDENTIFY: ${target.brand.toUpperCase()} ${target.model.toUpperCase()}`,
          subtitle: lang === 'th'
            ? `เปรียบเทียบภาพ A และ B ด้านล่าง แล้วเลือกภาพที่เป็นรุ่นนี้จริง`
            : `Compare photo A and B below, and select the correct timepiece of this model`,
          imageUrl: null, // mystery icon
          correctCaliber: correctChoice,
          hint: lang === 'th'
            ? `สังเกตโครงสร้างรูปปุ่มกดมะยม กรอบขอบตัวเรือน และรายละเอียดหน้าปัดของรุ่น ${target.model} รูปหนึ่งคือรุ่นนี้ อีกรูปคือรุ่นอื่นของแบรนด์เดียวกัน`
            : `Inspect the chronograph pushers, bezel patterns, and dials of ${target.model}. One option shows the target model, the other displays a decoy from the same brand.`,
          insight: lang === 'th'
            ? `ถูกต้องแล้ว! ภาพที่เป็นคำตอบคือรูปภาพรุ่น ${target.model} (${target.name}) ของแท้ ส่วนอีกรูปคือรุ่น ${decoy.model} ซึ่งเป็นอีกสไตล์ยอดนิยม`
            : `Correct! The selected option displays the authentic ${target.brand} ${target.model} (${target.name}) photo. The decoy was the ${decoy.brand} ${decoy.model}.`,
          calA: {
            title: `PHOTO OPTION A`,
            imageUrl: optionA.source_url,
            desc: [
              `• Model Option A`,
              `• Brand: ${optionA.brand}`,
              `• Reference Name: ${optionA.name}`,
              `• Estimated Valuation: ${optionA.price_thb ? optionA.price_thb.toLocaleString() + ' THB' : 'Collector Pricing'}`
            ]
          },
          calB: {
            title: `PHOTO OPTION B`,
            imageUrl: optionB.source_url,
            desc: [
              `• Model Option B`,
              `• Brand: ${optionB.brand}`,
              `• Reference Name: ${optionB.name}`,
              `• Estimated Valuation: ${optionB.price_thb ? optionB.price_thb.toLocaleString() + ' THB' : 'Collector Pricing'}`
            ]
          }
        };
      }
    }

    // Graceful offline fallback
    switch (level) {
      case 1:
        return {
          style: 'choose_model' as const,
          title: 'ROLEX SUBMARINER REF. 126610LN',
          subtitle: 'Caliber 3235 Verification',
          imageUrl: 'https://images.unsplash.com/photo-1547996160-81dfa63595aa?auto=format&fit=crop&w=400&q=80',
          correctCaliber: 'A' as const,
          hint: 'Examine the hairspring. Genuine Rolex Caliber 3235 utilizes a blue Parachrom hairspring, whereas reproductions use standard steel.',
          insight: 'Rolex Caliber 3235 is highly anti-magnetic due to the patented blue Parachrom hairspring. It features flawlessly mirror-polished and chamfered bridge bevels, and gold Microstella regulating nuts. Reproductions exhibit coarse stamped bridges, standard steel hairsprings, and shallow gold-plating bleed.',
          calA: {
            title: 'CALIBER A (GENUINE)',
            desc: [
              '• Anti-magnetic blue Parachrom hairspring',
              '• High-performance Paraflex shock absorbers',
              '• Meticulously mirror-polished and chamfered bridge bevels',
              '• Four gold Microstella regulating nuts on the balance wheel',
              '• Deeply engraved, perfectly filled gold-gilt inscriptions'
            ]
          },
          calB: {
            title: 'CALIBER B (REPRODUCTION)',
            desc: [
              '• Standard silver alloy hairspring sensitive to magnetic fields',
              '• Generic shock absorber mimicking standard Incabloc design',
              '• Coarse, stamped bridges showing prominent tooling marks',
              '• Exposed regulator pin adjusting lever for rate calibration',
              '• Shallow, unevenly painted inscriptions with gold-plating bleed'
            ]
          }
        };
      case 2:
        return {
          style: 'choose_model' as const,
          title: 'AUDEMARS PIGUET ROYAL OAK 15500ST',
          subtitle: 'Caliber 4302 Verification',
          imageUrl: 'https://images.unsplash.com/photo-1522312346375-d1a52e2b99b3?auto=format&fit=crop&w=400&q=80',
          correctCaliber: 'B' as const,
          hint: 'Look closely at the rotor ball bearings. Genuine Audemars Piguet Caliber 4302 has silent, premium ceramic ball bearings.',
          insight: 'Audemars Piguet Caliber 4302 is equipped with an integrated 22k gold hand-skeletonized oscillating weight and rotates silently on specialized high-grade ceramic ball bearings. Replicas use cheap steel ball bearings (creating loud mechanical noise) and gold-plated brass rotors with shallow, machine-chattered lines.',
          calA: {
            title: 'CALIBER A (REPRODUCTION)',
            desc: [
              '• Gold-plated brass oscillating weight with insufficient heft',
              '• Rounded AP logo with soft, indistinct edge profiles',
              '• Coarse, shallow Côtes de Genève stripes with machine chatter',
              '• Regulator pin tail visible above the balance wheel jewel',
              '• Rough steel ball bearings generating noisy rotor oscillation'
            ]
          },
          calB: {
            title: 'CALIBER B (GENUINE)',
            desc: [
              '• Hand-skeletonized 22K gold oscillating weight with pristine finish',
              '• Pristine, razor-sharp anglage and hand-polished bevel edges',
              '• Deep, vivid Côtes de Genève reflecting light in silk-like waves',
              '• Free-sprung balance wheel with variable inertia blocks',
              '• High-grade ceramic ball bearing assembly offering silent rotation'
            ]
          }
        };
      case 3:
      default:
        return {
          style: 'choose_model' as const,
          title: 'PATEK PHILIPPE NAUTILUS 5711/1A',
          subtitle: 'Caliber 324 S C Verification',
          imageUrl: 'https://images.unsplash.com/photo-1614162692292-7ac56d7f7f1e?auto=format&fit=crop&w=400&q=80',
          correctCaliber: 'A' as const,
          hint: 'Spot the Hallmark seal. Patek Philippe Nautilus has a hand-finished Geneva or PP seal with pristine anglage on beveled flanks.',
          insight: 'Patek Philippe Caliber 324 S C bears the prestigious PP Seal, showcasing hand-polished anglage, concentric circular graining (perlage), and a black silicon Spiromax balance spring. Replicas are usually based on cheap modified Miyota 9015 movements with rough, decorative overlay plates glued together.',
          calA: {
            title: 'CALIBER A (GENUINE)',
            desc: [
              '• Deeply stamped Patek Philippe (PP) Seal with hand-polished anglage',
              '• Spiromax balance spring with black silicon surface protection',
              '• Concentric Circular Graining (perlage) on the main plate base',
              '• Gyromax balance wheel with adjustable gold inertia blocks',
              '• Ultra-thin caliber profile with mirror-polished beveled flanks'
            ]
          },
          calB: {
            title: 'CALIBER B (REPRODUCTION)',
            desc: [
              '• Modified Miyota 9015 movement with decorative overlay plates',
              '• Weakly stamped brand markings with glue residue on plastic ring',
              '• Synthetic bright pink jewel bearings without proper lubrication',
              '• Faux PP Seal plate held by adhesive, slightly misaligned',
              '• Oscillating weight with raw, unchamfered interior cutouts'
            ]
          }
        };
    }
  };

  const details = getCaliberDetails();
  const accuracy = Math.round((score / 45) * 100);
  
  const getRank = () => {
    if (score >= 40) {
      return { 
        title: lang === 'th' ? '👑 แกรนด์มาสเตอร์ผู้เชี่ยวชาญการผลิต' : '👑 GRANDMASTER HOROLOGIST', 
        desc: lang === 'th' 
          ? 'ความแม่นยำไร้ที่ติ สายตาของคุณในการสแกนตรวจสอบตราประทับ รายละเอียดการขัดแต่ง และโครงสร้างกลไกมีความแม่นยำเทียบเท่าปรมาจารย์ช่างนาฬิกาสวิสในเจนีวา' 
          : 'Flawless precision. Your eye for micro-hallmarks, finishing anomalies, and caliber balance configurations matches the top Swiss master watchmakers in Geneva.' 
      };
    }
    if (score >= 30) {
      return { 
        title: lang === 'th' ? '💎 ช่างทำนาฬิกาขั้นปรมาจารย์' : '💎 MASTER WATCHMAKER', 
        desc: lang === 'th'
          ? 'ความแม่นยำยอดเยี่ยม คุณมีสายตาที่เฉียบคมอย่างมาก สามารถแยกแยะความก้าวหน้าวัสดุใยสปริงและตลับลูกปืนเซรามิกของ AP ได้อย่างง่ายดาย'
          : 'Superb precision. You have an extremely sharp horological eye, noticing hairspring composition and AP ceramic bearing alignments with ease.' 
      };
    }
    if (score >= 20) {
      return { 
        title: lang === 'th' ? '🔍 นักประเมินอาวุโส' : '🔍 SENIOR APPRAISER', 
        desc: lang === 'th'
          ? 'ทักษะการตรวจสอบความแท้ดีมาก คุณสามารถระบุความผิดปกติพื้นฐานของการลอกเลียนแบบเครื่องนาฬิกาได้ดี แต่อาจพลาดในบางจังหวะที่เวลาจำกัด'
          : 'Skilled visual assessment. You easily identify basic movement reproduction anomalies but missed a few speedy judgments.' 
      };
    }
    if (score >= 10) {
      return { 
        title: lang === 'th' ? '🗃️ ผู้เชี่ยวชาญตู้นิรภัยสะสม' : '🗃️ VAULT SPECIALIST', 
        desc: lang === 'th'
          ? 'การตรวจสอบผ่านเกณฑ์ดี คุณเข้าใจการทำงานของฟันเฟืองจักรกลนาฬิกาหรู แต่อาจมีรายละเอียดตราประทับบางจุดที่เล็ดลอดสายตาไป'
          : 'Adequate assessment. You have a solid grasp of luxury watch movements, though some subtle stamp and engraving flaws slipped past.' 
      };
    }
    return { 
      title: lang === 'th' ? '🪵 นักสะสมมือสมัครเล่น' : '🪵 APPRENTICE COLLECTOR', 
      desc: lang === 'th'
        ? 'เพิ่งเริ่มต้นการเดินทางสู่โลกนาฬิกาหรู แนะนำให้ศึกษาลักษณะของใยสปริง Parachrom และความต่างของกลไก Miyota ในตู้เก็บข้อมูลเพิ่มเติมครับ'
        : 'Beginning your journey. Take some time to study standard Parachrom hairsprings and Miyota mod plate layouts in the Vault archives.' 
    };
  };

  const rank = getRank();

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <LinearGradient
        colors={['#1E120A', '#0A0805']}
        style={StyleSheet.absoluteFillObject}
      />
      
      {/* SCOREBOARD PHASE OVERLAY */}
      {gamePhase === 'scoreboard' ? (
        <View style={styles.scoreboardContainer}>
          <LinearGradient
            colors={['#1F130B', '#080604']}
            style={StyleSheet.absoluteFillObject}
          />
          <ScrollView contentContainerStyle={{ padding: spacing.lg, alignItems: 'center', gap: spacing.md, paddingBottom: spacing.xxl }}>
            <Feather name="award" size={48} color={colors.amber} style={{ marginTop: 40 }} />
            <Text style={styles.scoreboardHeaderTitle}>
              {lang === 'th' ? 'รายงานผลการวิเคราะห์สายตา' : 'CALIBRATION REPORT'}
            </Text>
            <Text style={styles.scoreboardHeaderSubtitle}>
              {lang === 'th' ? 'รายงานผลการประเมินจากผู้เชี่ยวชาญสากล' : 'OFFICIAL APPRAISER ASSESSMENT'}
            </Text>

            {/* Metrics Ring Card */}
            <View style={styles.scoreboardMetricsCard}>
              <LinearGradient
                colors={['rgba(236, 200, 122, 0.08)', 'rgba(0, 0, 0, 0.4)']}
                style={StyleSheet.absoluteFillObject}
              />
              <View style={{ alignItems: 'center', marginVertical: 12 }}>
                <Text style={{ fontSize: 42, fontWeight: '900', color: colors.amber }}>{score}</Text>
                <Text style={{ fontSize: 10, color: colors.textMuted, fontWeight: '800', letterSpacing: 1.5 }}>
                  {lang === 'th' ? 'คะแนนความน่าเชื่อถือรวม' : 'TOTAL CREDIBILITY SCORE'}
                </Text>
              </View>
              <View style={{ height: 1, backgroundColor: 'rgba(236, 200, 122, 0.15)', width: '100%', marginVertical: 8 }} />
              <View style={{ flexDirection: 'row', justifyContent: 'space-around', width: '100%', paddingVertical: 4 }}>
                <View style={{ alignItems: 'center' }}>
                  <Text style={{ fontSize: 18, fontWeight: '800', color: '#fff' }}>{accuracy}%</Text>
                  <Text style={{ fontSize: 9, color: colors.textSecondary }}>
                    {lang === 'th' ? 'อัตราความเที่ยงตรง' : 'ACCURACY RATE'}
                  </Text>
                </View>
                <View style={{ alignItems: 'center' }}>
                  <Text style={{ fontSize: 18, fontWeight: '800', color: '#fff' }}>{score >= 35 ? '3 / 3' : score >= 20 ? '2 / 3' : score >= 10 ? '1 / 3' : '0 / 3'}</Text>
                  <Text style={{ fontSize: 9, color: colors.textSecondary }}>
                    {lang === 'th' ? 'การทดสอบที่ผ่าน' : 'DIAGNOSTICS PASSED'}
                  </Text>
                </View>
              </View>
            </View>

            {/* Rank Card */}
            <View style={styles.rankCard}>
              <LinearGradient
                colors={['rgba(30, 22, 17, 0.95)', 'rgba(18, 14, 10, 0.98)']}
                style={StyleSheet.absoluteFillObject}
              />
              <Text style={styles.rankTitle}>{rank.title}</Text>
              <Text style={styles.rankDesc}>{rank.desc}</Text>
            </View>

            {/* Action Row */}
            <View style={{ width: '100%', gap: spacing.md, marginTop: spacing.md }}>
              <Pressable 
                style={styles.gameContinueBtn} 
                onPress={() => {
                  setScore(0);
                  setLevel(1);
                  setTimeLeft(30);
                  setHintsRemaining(1);
                  setHintVisible(false);
                  setGamePhase('playing');
                }}
              >
                <LinearGradient
                  colors={['#ECC87A', '#C59A45', '#9A7326']}
                  style={StyleSheet.absoluteFillObject}
                />
                <Text style={styles.gameContinueBtnText}>
                  {lang === 'th' ? 'ปรับจูนใหม่ / เล่นอีกครั้ง' : 'RE-CALIBRATE / PLAY AGAIN'}
                </Text>
              </Pressable>

              <Pressable 
                style={styles.returnVaultBtn} 
                onPress={() => navigation.goBack()}
              >
                <Text style={styles.returnVaultBtnText}>
                  {lang === 'th' ? 'กลับสู่ตู้สะสมนิรภัย' : 'RETURN TO VAULT'}
                </Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      ) : (
        <ScrollView style={styles.gameContainer} contentContainerStyle={styles.gameContent}>
          <StatusBar style="light" />
          <SafeAreaView style={styles.safeAreaZero} edges={['top']}>
            {/* Header Bar */}
            <View style={styles.gameHeaderRow}>
              <Pressable style={styles.gameCloseBtn} onPress={() => navigation.goBack()}>
                <Feather name="arrow-left" size={24} color="#fff" />
              </Pressable>
              <View style={{ flex: 1, alignItems: 'center', marginRight: 40 }}>
                <Text style={styles.gameHeaderTitle}>
                  {lang === 'th' ? 'ฝึกฝนสายตานักสะสม' : 'Horological Eye Calibration'}
                </Text>
                <Text style={styles.gameHeaderSubtitle}>
                  {lang === 'th' ? 'เกมประเมินความแม่นยำ' : 'COLLECTOR CALIBRATION GAME'}
                </Text>
              </View>
            </View>

            {/* Visual Circular Watch Photo Header (magnifying view) */}
            <View style={styles.gameWatchHeaderSection}>
              <View style={[styles.watchDialOuterRing, { borderColor: '#ECC87A', borderWidth: 2, overflow: 'hidden' }]}>
                {details.imageUrl ? (
                  <Image
                    source={{ uri: details.imageUrl }}
                    style={StyleSheet.absoluteFillObject}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={[StyleSheet.absoluteFillObject, { backgroundColor: '#13100C', justifyContent: 'center', alignItems: 'center' }]}>
                    <Feather name="search" size={40} color="#ECC87A" />
                  </View>
                )}
                {/* Thin gold inner overlay to resemble loupe glass lens */}
                <View style={{
                  position: 'absolute',
                  top: 4, left: 4, right: 4, bottom: 4,
                  borderRadius: 120,
                  borderWidth: 0.75,
                  borderColor: 'rgba(236, 200, 122, 0.35)',
                  backgroundColor: 'transparent'
                }} />
              </View>
              <View style={styles.gameProgressRow}>
                <Text style={styles.gameProgressText}>
                  {lang === 'th' ? 'ระดับนักสะสม: ' : 'Calibration Tier: '}
                  {score >= 35 ? (lang === 'th' ? 'ช่างทำนาฬิกาขั้นปรมาจารย์' : 'MASTER WATCHMAKER') : score >= 20 ? (lang === 'th' ? 'ผู้เชี่ยวชาญตู้สะสม' : 'VAULT SPECIALIST') : (lang === 'th' ? 'นักสะสมมือสมัครเล่น' : 'APPRENTICE COLLECTOR')}
                </Text>
                <Text style={styles.gameProgressCounter}>
                  {lang === 'th' ? 'ด่านที่ ' : 'Diagnostic '}{level} / 3
                </Text>
              </View>
              {/* Step markers */}
              <View style={styles.gameStepIndicatorRow}>
                {[1, 2, 3].map((step) => (
                  <View 
                    key={step} 
                    style={[
                      styles.gameStepDot, 
                      level === step && styles.gameStepDotActive,
                      level > step && styles.gameStepDotCompleted
                    ]} 
                  />
                ))}
              </View>
            </View>

            {/* Target Watch Card (Text-only now for clean minimalist look) */}
            <View style={[styles.gameWatchInfoCard, { borderColor: 'rgba(236, 200, 122, 0.35)', borderWidth: 1, padding: 14, alignItems: 'center' }]}>
              <LinearGradient
                colors={['rgba(28, 22, 17, 0.95)', 'rgba(18, 14, 10, 0.98)']}
                style={StyleSheet.absoluteFillObject}
              />
              <View style={{ width: '100%', alignItems: 'center' }}>
                <View style={styles.gameWatchInfoHead}>
                  <Feather name="crosshair" size={14} color={colors.amber} style={{ marginRight: 6 }} />
                  <Text style={styles.gameWatchTitle} numberOfLines={1}>{details.title}</Text>
                </View>
                <Text style={[styles.gameWatchSubtitle, { textAlign: 'center', marginTop: 4 }]}>{details.subtitle}</Text>
              </View>
            </View>

            {/* Accuracy Points & Timer HUD Bar at the Bottom */}
            <View style={[styles.gameStatsHudRow, { borderColor: 'rgba(236, 200, 122, 0.25)', borderWidth: 1 }]}>
              <LinearGradient
                colors={['rgba(30, 24, 20, 0.9)', 'rgba(12, 10, 8, 0.95)']}
                style={StyleSheet.absoluteFillObject}
              />
              
              {/* Accuracy Points Dial */}
              <View style={styles.hudStatBox}>
                <Feather name="award" size={14} color={colors.amber} style={{ marginRight: 6 }} />
                <Text style={styles.hudStatLabel}>
                  {lang === 'th' ? 'ความเที่ยงตรง:' : 'ACCURACY:'}
                </Text>
                <Text style={styles.hudStatValue}>{score} PTS</Text>
              </View>

              {/* Elegant Divider */}
              <View style={{ width: 1, height: 14, backgroundColor: 'rgba(236, 200, 122, 0.2)' }} />

              {/* Ticking Timer */}
              <View style={styles.hudStatBox}>
                <Feather 
                  name="clock" 
                  size={13} 
                  color={timeLeft <= 10 ? '#E03E3E' : colors.amber} 
                  style={{ marginRight: 6 }} 
                />
                <Text style={styles.hudStatLabel}>
                  {lang === 'th' ? 'เวลาที่เหลือ:' : 'TIME LEFT:'}
                </Text>
                <Text style={[
                  styles.hudStatValue,
                  timeLeft <= 10 && { color: '#E03E3E' }
                ]}>
                  {timeLeft}s
                </Text>
              </View>
            </View>

            {/* Loupe Hint Activator */}
            {hintsRemaining > 0 && !hintVisible && gamePhase === 'playing' && (
              <Pressable style={styles.hintBtn} onPress={() => {
                setHintsRemaining(0);
                setHintVisible(true);
              }}>
                <Feather name="search" size={14} color="#000" style={{ marginRight: 6 }} />
                <Text style={styles.hintBtnText}>🔍 ACTIVATE LOUPE INSPECTION HINT (1 Left)</Text>
              </Pressable>
            )}

            {/* Loupe Hint Content Card */}
            {hintVisible && gamePhase === 'playing' && (
              <View style={styles.hintCard}>
                <LinearGradient
                  colors={['rgba(236, 200, 122, 0.15)', 'rgba(236, 200, 122, 0.05)']}
                  style={StyleSheet.absoluteFillObject}
                />
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                  <Feather name="zoom-in" size={14} color={colors.amber} style={{ marginRight: 6 }} />
                  <Text style={{ fontSize: 12, fontWeight: '800', color: colors.amber, letterSpacing: 0.5 }}>
                    {lang === 'th' ? 'เปิดใช้งานคำใบ้กล้องส่อง Loupe สำเร็จ' : 'LOUPE HALLMARK HINT ACTIVATED'}
                  </Text>
                </View>
                <Text style={styles.hintText}>{details.hint}</Text>
              </View>
            )}

            {/* Dynamic Comparison specs or Custom Inline Result Overlay Card */}
            {gamePhase === 'result' ? (
              <View style={styles.resultOverlayCard}>
                <LinearGradient
                  colors={['#1E1611', '#0A0806']}
                  style={StyleSheet.absoluteFillObject}
                />
                
                {/* Status Header */}
                <View style={[
                  styles.resultCardHeader,
                  resultType === 'correct' ? { borderColor: colors.success } : resultType === 'timeout' ? { borderColor: '#E07A2F' } : { borderColor: '#E03E3E' }
                ]}>
                  <Feather 
                    name={resultType === 'correct' ? 'check-circle' : resultType === 'timeout' ? 'clock' : 'alert-circle'} 
                    size={36} 
                    color={resultType === 'correct' ? colors.success : resultType === 'timeout' ? '#E07A2F' : '#E03E3E'} 
                    style={{ marginBottom: 10 }} 
                  />
                  <Text style={[
                    styles.resultCardTitle,
                    { color: resultType === 'correct' ? colors.success : resultType === 'timeout' ? '#E07A2F' : '#E03E3E' }
                  ]}>
                    {resultType === 'correct' 
                      ? (lang === 'th' ? 'การวินิจฉัยถูกต้อง! 🎉' : 'CORRECT DIAGNOSIS! 🎉') 
                      : resultType === 'timeout' 
                      ? (lang === 'th' ? 'หมดเวลาการวินิจฉัย ⚠️' : 'DIAGNOSTIC TIMEOUT ⚠️') 
                      : (lang === 'th' ? 'วิเคราะห์ตรวจพบของปลอม! 😢' : 'REPLICA DETECTED 😢')}
                  </Text>
                  <Text style={styles.resultCardSub}>
                    {resultType === 'correct' 
                      ? (lang === 'th' ? 'เทียบจูนระดับสำเร็จ คุณแยกแยะงานขัดและจุดเด่น of เครื่องแท้ได้สมบูรณ์!' : 'Successfully calibrated. You identified the genuine caliber finishing details!')
                      : resultType === 'timeout'
                      ? (lang === 'th' ? 'ระยะเวลาการวิเคราะห์สิ้นสุดลงแล้ว! ยอดช่างต้องประเมินด้วยความรวดเร็ว' : "Assessment period expired! Switzerland's elite watchmakers must act with speed.")
                      : (lang === 'th' ? 'คุณมองข้ามรอยสลักตัวอักษรกลไกที่ไม่สมบูรณ์หรือการขัดแต่งขอบเฟืองราคาถูกไป' : 'Faux caliber markings or coarse mechanical bevelings were overlooked.')}
                  </Text>
                </View>

                {/* Points Card */}
                <View style={styles.resultScoreContainer}>
                  <Text style={[styles.resultScoreValue, resultType !== 'correct' && { color: colors.textSecondary }]}>
                    {resultType === 'correct' ? (lang === 'th' ? '+10 คะแนนความแม่นยำ' : '+10 Accuracy Pts') : '+0 Pts'}
                  </Text>
                  {resultType === 'correct' && speedBonusEarned && (
                    <View style={styles.speedBonusBadge}>
                      <LinearGradient
                        colors={['#ECC87A', '#C59A45']}
                        style={StyleSheet.absoluteFillObject}
                      />
                      <Feather name="zap" size={10} color="#000" style={{ marginRight: 4 }} />
                      <Text style={styles.speedBonusText}>
                        {lang === 'th' ? '+5 คะแนนโบนัสตอบเร็ว' : '+5 SPEED RUN BONUS'}
                      </Text>
                    </View>
                  )}
                </View>

                {/* Educational Insight Panel */}
                <View style={styles.explanationSection}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                    <Feather name="book-open" size={13} color={colors.amber} style={{ marginRight: 6 }} />
                    <Text style={styles.explanationTitle}>
                      {lang === 'th' ? 'รายงานผลการประเมินจากผู้เชี่ยวชาญ' : 'HOROLOGICAL INSIGHT ANALYSIS'}
                    </Text>
                  </View>
                  <Text style={styles.explanationText}>{details.insight}</Text>
                </View>

                {/* Continue Action */}
                <Pressable 
                  style={styles.gameContinueBtn} 
                  onPress={() => {
                    if (level < 3) {
                      setLevel(level + 1);
                      setTimeLeft(30);
                      setHintVisible(false);
                      setGamePhase('playing');
                    } else {
                      setGamePhase('scoreboard');
                    }
                  }}
                >
                  <LinearGradient
                    colors={['#ECC87A', '#C59A45', '#9A7326']}
                    style={StyleSheet.absoluteFillObject}
                  />
                  <Text style={styles.gameContinueBtnText}>
                    {level < 3 
                      ? (lang === 'th' ? 'ด่านถัดไป ➔' : 'PROCEED TO NEXT DIAGNOSTIC ➔') 
                      : (lang === 'th' ? 'ดูรายงานผลประเมินรวม ➔' : 'VIEW CALIBRATION REPORT ➔')}
                  </Text>
                </Pressable>
              </View>
            ) : (
              /* Split-Screen Model Option layout */
              <View style={styles.comparisonGridRow}>
                {/* Option A Card */}
                <View style={[styles.caliberHalfCard, { borderColor: 'rgba(236, 200, 122, 0.15)', borderWidth: 1 }]}>
                  <LinearGradient
                    colors={['rgba(30, 24, 20, 0.8)', 'rgba(18, 14, 12, 0.95)']}
                    style={StyleSheet.absoluteFillObject}
                  />
                  <View style={styles.caliberCardHeader}>
                    <Feather name="tag" size={13} color={colors.amber} style={{ marginRight: 5 }} />
                    <Text style={styles.caliberCardTitle}>{details.calA.title}</Text>
                  </View>
                  
                  {/* Render watch model scan image if available for choose_picture style */}
                  {(details as any).calA.imageUrl ? (
                    <Image
                      source={{ uri: (details as any).calA.imageUrl }}
                      style={{ width: '100%', height: 110, borderRadius: 8, marginBottom: 8, borderColor: 'rgba(236, 200, 122, 0.25)', borderWidth: 1 }}
                      resizeMode="cover"
                    />
                  ) : null}

                  <View style={styles.caliberSpecList}>
                    {details.calA.desc.map((bullet, idx) => (
                      <Text key={idx} style={styles.caliberBulletText}>{bullet}</Text>
                    ))}
                  </View>
                  <Pressable 
                    style={({ pressed }) => [
                      styles.caliberSelectBtn,
                      pressed && { opacity: 0.8 }
                    ]}
                    onPress={() => handleGuess('A')}
                  >
                    <LinearGradient
                      colors={['#ECC87A', '#C59A45', '#9A7326']}
                      style={StyleSheet.absoluteFillObject}
                    />
                    <Text style={styles.caliberSelectBtnText}>
                      {lang === 'th' ? 'เลือกตัวเลือก A' : 'SELECT OPTION A'}
                    </Text>
                  </Pressable>
                </View>

                {/* Option B Card */}
                <View style={[styles.caliberHalfCard, { borderColor: 'rgba(236, 200, 122, 0.15)', borderWidth: 1 }]}>
                  <LinearGradient
                    colors={['rgba(30, 24, 20, 0.8)', 'rgba(18, 14, 12, 0.95)']}
                    style={StyleSheet.absoluteFillObject}
                  />
                  <View style={styles.caliberCardHeader}>
                    <Feather name="tag" size={13} color={colors.amber} style={{ marginRight: 5 }} />
                    <Text style={styles.caliberCardTitle}>{details.calB.title}</Text>
                  </View>
                  
                  {/* Render watch model scan image if available for choose_picture style */}
                  {(details as any).calB.imageUrl ? (
                    <Image
                      source={{ uri: (details as any).calB.imageUrl }}
                      style={{ width: '100%', height: 110, borderRadius: 8, marginBottom: 8, borderColor: 'rgba(236, 200, 122, 0.25)', borderWidth: 1 }}
                      resizeMode="cover"
                    />
                  ) : null}

                  <View style={styles.caliberSpecList}>
                    {details.calB.desc.map((bullet, idx) => (
                      <Text key={idx} style={styles.caliberBulletText}>{bullet}</Text>
                    ))}
                  </View>
                  <Pressable 
                    style={({ pressed }) => [
                      styles.caliberSelectBtn,
                      pressed && { opacity: 0.8 }
                    ]}
                    onPress={() => handleGuess('B')}
                  >
                    <LinearGradient
                      colors={['#ECC87A', '#C59A45', '#9A7326']}
                      style={StyleSheet.absoluteFillObject}
                    />
                    <Text style={styles.caliberSelectBtnText}>
                      {lang === 'th' ? 'เลือกตัวเลือก B' : 'SELECT OPTION B'}
                    </Text>
                  </Pressable>
                </View>
              </View>
            )}

            {/* Bottom helper notice */}
            <View style={styles.gameHelperCard}>
              <Feather name="info" size={14} color={colors.amber} style={{ marginTop: 2, marginRight: 6 }} />
              <Text style={styles.gameHelperText}>
                Carefully inspect movement anglage, Côtes de Genève finishing, magnetic shielding, and hallmark engravings to differentiate authentic movements at a 1:1 level.
              </Text>
            </View>
          </SafeAreaView>
        </ScrollView>
      )}
    </View>
  );
}
