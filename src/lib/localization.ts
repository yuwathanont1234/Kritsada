import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type Language = 'en' | 'th';

// Deep translation structure
export const translations = {
  en: {
    common: {
      back: 'Back',
      cancel: 'Cancel',
      save: 'Save',
      loading: 'Loading...',
      genuine: 'GENUINE',
      replica: 'REPLICA',
      inconclusive: 'INCONCLUSIVE',
      share: 'Share Certificate',
      close: 'Close',
      ok: 'OK',
      success: 'Success',
      error: 'Error',
      warning: 'Warning',
      confirm: 'Confirm',
    },
    tabs: {
      home: 'Home',
      collection: 'Vault',
      portfolio: 'Portfolio',
      learn: 'Learn',
      settings: 'Settings',
    },
    home: {
      welcome: 'Welcome, Collector',
      marketIndex: 'Live Market Index',
      supportedBrands: 'Supported Eligible Brands',
      challengeTitle: "Timekeeper's Challenge",
      challengeDesc: 'Inspect high-end watches under time pressure. Train your eyes to spot superfakes!',
      challengeBtn: 'Start Challenge',
      scansList: 'Saved Timepiece Scans',
      emptyScans: 'No timepiece scans saved yet. Tap the button below to secure your first watch.',
      scanBtn: 'Start AI Scan',
    },
    settings: {
      title: 'Settings',
      profile: 'Collector Profile',
      activePlan: 'YOUR ACTIVE PLAN',
      manageSub: 'Manage Subscription',
      faqs: 'Frequently Asked Questions (FAQs)',
      terms: 'Terms & Conditions',
      privacy: 'Privacy Policy',
      wipeData: 'Wipe Vault Records & History',
      logout: 'Log Out',
      language: 'Language / ภาษา',
      english: '🇺🇸 English',
      thai: '🇹🇭 ภาษาไทย',
      devControls: '🛠️ DEVELOPER TESTING CONTROLS',
      devSub: 'Simulate membership changes for Quota Gate & feature testing.',
      startTrial: '💳 Bind Card & Start 7-Day Trial (5 scans)',
      clearTrial: '❌ Clear Trial',
      wipeConfirmTitle: 'Wipe All Data',
      wipeConfirmDesc: 'This will delete all vaulted timepiece scans and reset membership tier to Free. This action is irreversible.',
      wipeSuccess: 'All vault records and scan history have been wiped.',
      trialActivated: 'Credit card bound successfully! Premium 7-day trial (max 5 scans) has been started.',
      trialCleared: 'Trial sandbox session has been cleared.',
    },
    membership: {
      upgradeTitle: 'Upgrade Membership',
      selectPlan: 'SELECT MEMBERSHIP PLAN',
      subTitle: 'Premium AI Watch Verification & High-End Analytics',
      currentPlan: 'CURRENT PLAN',
      estimatedDaily: 'Estimated Daily: ~฿',
      monthly: '/ mo',
      platinumTitle: 'STANDARD',
      goldTitle: 'PRO',
      vipTitle: 'PREMIUM',
      scanCredits: 'Scan Credit Packages',
      payPerScan: 'PAY-PER-SCAN • Flexible scan top-ups for active collectors',
      fortyScansTitle: '40 Scan Credits',
      fortyScansDesc: 'Premium visual pgvector RAG scan top-ups',
      eightyScansTitle: '80 Scan Credits',
      eightyScansDesc: 'The ultimate valuation top-up for active dealers and collectors',
      savePercent: 'SAVE {percent}% 🔥',
      buyFortyScans: 'BUY 40 SCANS',
      buyEightyScans: 'BUY 80 SCANS',
      purchaseSuccess: 'Purchase Successful!',
      creditAdded: '{count} Scan credits have been added to your vault.',
    },
    game: {
      title: "Timekeeper's Challenge",
      timer: 'Time Left',
      score: 'Accuracy Points',
      streak: 'Streak',
      correct: 'CORRECT!',
      incorrect: 'INCORRECT',
      gameOver: 'CHALLENGE COMPLETED',
      gameOverDesc: 'Your watch authenticator training session is complete.',
      finalScore: 'Final Accuracy Score',
      tryAgain: 'Restart Training',
      quit: 'Return to Hub',
      questionText: 'Is this timepiece genuine?',
      genuineBtn: 'Genuine',
      replicaBtn: 'Replica',
      highScore: 'New High Score!',
      level: 'Level',
    },
    scan: {
      instructions: 'Position timepiece inside the gold circle',
      shutter: 'Capture Photo',
      chooseGallery: 'Upload from Gallery',
      frontCoaching: 'Capture Front Dial (Required)',
      backCoaching: 'Capture Caseback & Movement',
      cameraPermission: 'Permission Required',
      cameraDesc: 'We need access to your camera to capture high-resolution timepiece details.',
      cameraBtn: 'Grant Camera Permission',
      galleryPermissionDesc: 'We need access to your photo library to select timepiece images.',
      galleryBtn: 'Grant Photo Permission',
      coachingStep1: '1. Front Dial: Center watch in frame with bright direct lighting',
      coachingStep2: '2. Caseback: Frame clear caliber details and hallmark stamps',
      coachingStep3: '3. Crown: Capture crown engravings and overall casing depth',
      coachingStep4: '4. Clasp: Focus on clasp alignment and bracelet stampings',
      stabilityWarning: 'HOLD STEADY: Detecting camera shake...',
      poorQuality: 'Low lighting or blur detected. Please adjust lighting and try again.',
      frontSideLabel: 'Dial & Bezel',
      backSideLabel: 'Caseback & Movement',
      topSideLabel: 'Crown & Profile',
      bottomSideLabel: 'Bracelet & Clasp',
      scanRequired: 'Front Dial photo is strictly required to start AI analysis.',
      bonusScans: 'Bonus Scans Unlocked!',
      consentsRequired: 'Data & AI Consents required to perform scan.',
    },
    loading: {
      analyzing: 'Neural Tourbillon Operating...',
      step1: 'Scanning dial micro-typography...',
      step2: 'Analyzing bezel alignment and indices geometry...',
      step3: 'Auditing movement components and engravings...',
      step4: 'Comparing RAG reference certificate library...',
      complete: 'Analysis complete. Generating certificate...',
      triviaTitle: 'HOROLOGY ACADEMY FACT',
      tips: [
        'Genuine luxury timepieces exhibit immaculate case finishing with hand-polished, seamlessly beveled edges and no sharp undercuts.',
        'An authentic mechanical movement sweeps smoothly and gracefully. The seconds hand glides across the dial with near-frictionless sweep oscillations.',
        'Authentic dials feature ultra-crisp typography, perfect alignment, and flawless logo transfer printing without any bleeding or micro-fuzziness.',
        'Prestigious manufacturers employ ultra-premium materials: Oystersteel 904L, solid 18K gold, or high-tech scratch-resistant ceramic, giving a reassuringly heavy wrist presence.',
        'Genuine luminescence (Super-LumiNova/Chromalight) displays a uniform, highly intense glow with pristine, even-layered application.',
        'Beware of sophisticated "Super Clones" that mirror exterior details. Absolute authenticity is resolved via caliber engravings and gear train micro-geometry.',
        'Authentic date apertures and cyclops magnification lenses are perfectly aligned, offering clean distortion-free enlargement and crisp font rendering.',
      ],
    },
    result: {
      verdict: 'VERIFICATION VERDICT',
      confidence: 'AI Confidence Rating',
      saveToVault: 'SAVE TIMEPIECE TO VAULT',
      savedSuccess: 'Timepiece secured in your digital vault successfully.',
      marketVal: 'Estimated Secondary Market Value',
      specs: 'Technical Specifications & Verification Analysis',
      brand: 'Brand',
      model: 'Model / Reference',
      finish: 'Case Finishing',
      dialTypography: 'Dial Typography',
      bezelIndices: 'Bezel & Indices Alignment',
      movementSweep: 'Caliber Engravings',
      pass: 'PASS (Immaculate)',
      fail: 'FAIL (Irregular)',
      warning: 'WARNING (Micro-fuzziness detected)',
      modelMatch: 'Reference Database Match',
      matchedModel: 'Matched Model',
      matchedRef: 'Matched Ref',
      detailsTitle: 'In-Depth Authentication Analytics',
      authenticityCertificate: 'CERTIFICATE OF AUTHENTICITY',
      certificateSub: 'OFFICIAL AI SCAN DIGITALLY SIGNED',
      uniquenessHash: 'Secured Caliber Hash',
    },
    learn: {
      title: 'Horology Guides & Academy',
      subtitle: 'Curated Collector Guides & Horological Innovations',
      readTime: 'min read',
      by: 'By',
      readArticle: 'Read Full Article',
      close: 'Close',
      origin: 'History & Heritage',
      innovations: 'Technical Innovations',
      legends: 'Iconic References & Market Secrets',
    },
    a11y: {
      shutter: 'Capture watch scan photo',
      article: 'Article card, {title}',
      tabHome: 'Home screen navigation button',
      tabVault: 'Collection vault screen navigation button',
      tabPortfolio: 'Portfolio analytics screen navigation button',
      tabLearn: 'Educational horology guides screen navigation button',
      tabSettings: 'Settings screen navigation button',
    },
    error: {
      title: 'System Analysis Failure',
      retry: 'Retry Diagnostic',
      cancel: 'Cancel Scan',
      networkFailed: 'Network connectivity lost. Unable to contact verification servers. Please check your internet connection.',
      aiFailed: 'AI analysis engine timed out while verifying case hallmark metadata. Please hold steady and try again.',
      liveRateUnavailable: 'Live exchange rate unavailable — displaying USD values',
    },
    upgradeReason: {
      auth_quota_exhausted: 'You have used {used} of {cap} scans. Your monthly scan quota is exhausted. Scan quota resets in {windowDays} days.',
      feature_locked_heatmap: 'AI Heatmap Target Diagnostics is restricted to Pro and Premium members. Upgrade to unlock.',
      feature_locked_ai_qa: 'AI Chat Q&A with Horology consensus expert is reserved for Premium members.',
      feature_locked_bg_removal: 'Studio Background Removal is reserved for Pro and Premium members.',
      tier_lock_standard: 'Standard features are locked for your active tier.',
      tier_lock_pro: 'Pro features are locked for your active tier.',
      tier_lock_premium: 'Premium features are locked for your active tier.',
    },
  },
  th: {
    common: {
      back: 'ย้อนกลับ',
      cancel: 'ยกเลิก',
      save: 'บันทึก',
      loading: 'กำลังโหลด...',
      genuine: 'ของแท้',
      replica: 'ของเลียนแบบ',
      inconclusive: 'ไม่สามารถระบุได้',
      share: 'แชร์ใบรับรอง',
      close: 'ปิด',
      ok: 'ตกลง',
      success: 'สำเร็จ',
      error: 'เกิดข้อผิดพลาด',
      warning: 'คำเตือน',
      confirm: 'ยืนยัน',
    },
    tabs: {
      home: 'หน้าหลัก',
      collection: 'ตู้สะสม',
      portfolio: 'พอร์ตโฟลิโอ',
      learn: 'เรียนรู้',
      settings: 'ตั้งค่า',
    },
    home: {
      welcome: 'ยินดีต้อนรับ นักสะสม',
      marketIndex: 'ดัชนีราคาตลาดรอง',
      supportedBrands: 'แบรนด์หรูที่รองรับการตรวจสอบ',
      challengeTitle: 'เกมท้าทายเวลาฝึกสายตา',
      challengeDesc: 'สแกนตรวจสอบนาฬิกาหรูภายใต้เวลาที่จำกัด ฝึกฝนสายตาของคุณเพื่อแยกแยะระหว่างของแท้และของเลียนแบบ!',
      challengeBtn: 'เริ่มความท้าทาย',
      scansList: 'นาฬิกาที่ผ่านการตรวจสอบแล้ว',
      emptyScans: 'ยังไม่มีประวัติการสแกนนาฬิกา แตะปุ่มด้านล่างเพื่อบันทึกและสแกนนาฬิกาเรือนแรกของคุณ',
      scanBtn: 'เริ่มสแกนด้วย AI',
    },
    settings: {
      title: 'ตั้งค่า',
      profile: 'ข้อมูลนักสะสม',
      activePlan: 'แผนการใช้งานปัจจุบันของคุณ',
      manageSub: 'จัดการการสมัครสมาชิก',
      faqs: 'คำถามที่พบบ่อย (FAQs)',
      terms: 'ข้อกำหนดและเงื่อนไข',
      privacy: 'นโยบายความเป็นส่วนตัว',
      wipeData: 'ล้างประวัติและข้อมูลทั้งหมดในตู้สะสม',
      logout: 'ออกจากระบบ',
      language: 'Language / ภาษา',
      english: '🇺🇸 English',
      thai: '🇹🇭 ภาษาไทย',
      devControls: '🛠️ เมนูควบคุมการทดสอบของนักพัฒนา',
      devSub: 'จำลองการเปลี่ยนระดับสมาชิกเพื่อทดสอบระบบจำกัดโควต้าและฟังก์ชันต่างๆ',
      startTrial: '💳 ผูกบัตร & เริ่มทดลองใช้ฟรี 7 วัน (5 สแกน)',
      clearTrial: '❌ เคลียร์สถานะทดลองใช้',
      wipeConfirmTitle: 'ล้างข้อมูลทั้งหมด',
      wipeConfirmDesc: 'สิ่งนี้จะลบการสแกนนาฬิกาทั้งหมดในตู้นิรภัย และรีเซ็ตระดับสมาชิกของคุณกลับเป็นระดับฟรี การดำเนินการนี้ไม่สามารถย้อนกลับได้',
      wipeSuccess: 'ข้อมูลทั้งหมดในตู้สะสมและประวัติการสแกนถูกลบเรียบร้อยแล้ว',
      trialActivated: 'ผูกบัตรเครดิตสำเร็จ! เริ่มทดลองใช้ Premium ฟรี 7 วัน (สูงสุด 5 สแกน) ระบบจะตัดยอดอัตโนมัติหากใช้เกินเกณฑ์',
      trialCleared: 'ล้างข้อมูลเซสชันจำลองการทดลองใช้เรียบร้อยแล้ว',
    },
    membership: {
      upgradeTitle: 'อัปเกรดระดับสมาชิก',
      selectPlan: 'เลือกแผนสมาชิกภาพ',
      subTitle: 'บริการตรวจสอบความแท้ด้วยระบบ AI พรีเมียมและวิเคราะห์ข้อมูลระดับสูง',
      currentPlan: 'แผนปัจจุบันของคุณ',
      estimatedDaily: 'เฉลี่ยรายวันโดยประมาณ: ~฿',
      monthly: '/ เดือน',
      platinumTitle: 'สแตนดาร์ด (Standard)',
      goldTitle: 'โปร (Pro)',
      vipTitle: 'พรีเมียม (Premium)',
      scanCredits: 'แพ็คเกจซื้อสิทธิ์สแกนเพิ่มเติม',
      payPerScan: 'PAY-PER-SCAN • เติมสิทธิ์สแกนแบบยืดหยุ่นสำหรับนักสะสมนาฬิกา',
      fortyScansTitle: 'สิทธิ์สแกน 40 ครั้ง',
      fortyScansDesc: 'สแกนตรวจสอบด้วย Visual RAG ลึกถึงโครงสร้างกลไกอ้างอิง',
      eightyScansTitle: 'สิทธิ์สแกน 80 ครั้ง',
      eightyScansDesc: 'แพ็คเกจคุ้มค่าสูงสุดสำหรับดีลเลอร์และนักสะสมนาฬิกามืออาชีพ',
      savePercent: 'ประหยัด {percent}% 🔥',
      buyFortyScans: 'ซื้อสแกน 40 ครั้ง',
      buyEightyScans: 'ซื้อสแกน 80 ครั้ง',
      purchaseSuccess: 'ทำรายการซื้อสิทธิ์สำเร็จ!',
      creditAdded: 'เพิ่มสิทธิ์การสแกน {count} ครั้งลงในตู้นิรภัยของคุณเรียบร้อยแล้ว',
    },
    game: {
      title: 'เกมท้าทายเวลาฝึกสายตา',
      timer: 'เวลาที่เหลือ',
      score: 'คะแนนความแม่นยำ',
      streak: 'คอมโบต่อเนื่อง',
      correct: 'ถูกต้อง!',
      incorrect: 'ไม่ถูกต้อง',
      gameOver: 'การฝึกอบรมเสร็จสมบูรณ์',
      gameOverDesc: 'เซสชันการฝึกฝนสายตานักตรวจสอบความแท้ของนาฬิกาหรูของคุณสิ้นสุดลงแล้ว',
      finalScore: 'คะแนนความแม่นยำสุดท้าย',
      tryAgain: 'เริ่มฝึกซ้อมใหม่',
      quit: 'กลับสู่หน้าหลัก',
      questionText: 'นาฬิกาเรือนนี้เป็นของแท้หรือไม่?',
      genuineBtn: 'ของแท้',
      replicaBtn: 'ของปลอม',
      highScore: 'สร้างคะแนนสูงสุดใหม่!',
      level: 'เลเวล',
    },
    scan: {
      instructions: 'จัดตำแหน่งนาฬิกาให้อยู่ในกรอบวงกลมสีทอง',
      shutter: 'ถ่ายภาพสแกน',
      chooseGallery: 'อัปโหลดจากแกลเลอรี',
      frontCoaching: 'ถ่ายภาพหน้าปัดด้านหน้า (จำเป็นต้องมี)',
      backCoaching: 'ถ่ายภาพฝาหลังและกลไกจักรกล',
      cameraPermission: 'ต้องการการเข้าถึงกล้อง',
      cameraDesc: 'เราจำเป็นต้องขอสิทธิ์เข้าถึงกล้องถ่ายภาพของคุณเพื่อเก็บรายละเอียดนาฬิกาความละเอียดสูง',
      cameraBtn: 'อนุญาตสิทธิ์เข้าถึงกล้อง',
      galleryPermissionDesc: 'เราจำเป็นต้องขอสิทธิ์เข้าถึงคลังรูปภาพของคุณเพื่อทำการเลือกรูปภาพนาฬิกา',
      galleryBtn: 'อนุญาตสิทธิ์เข้าถึงรูปภาพ',
      coachingStep1: '1. หน้าปัดด้านหน้า: วางหน้าปัดตรงกลางกรอบโดยมีแสงสว่างส่องสว่างชัดเจน',
      coachingStep2: '2. ฝาหลัง: เล็งให้เห็นรายละเอียดฟันเฟืองและตราสัญลักษณ์ที่ชัดเจน',
      coachingStep3: '3. เม็ดมะยม: ถ่ายภาพการสลักบนเม็ดมะยมและสัดส่วนความลึกด้านข้างของตัวเรือน',
      coachingStep4: '4. ตัวพับล็อกสาย: โฟกัสไปที่ความสมดุลของการพิมพ์ตรายี่ห้อและรอยเชื่อมสายสเตนเลส',
      stabilityWarning: 'พยายามถือกล้องให้นิ่ง: ตรวจพบการสั่นไหวของกล้อง...',
      poorQuality: 'ตรวจพบภาพเบลอหรือแสงไม่เพียงพอ กรุณาปรับสภาพแสงและถือกล้องให้นิ่งอีกครั้ง',
      frontSideLabel: 'หน้าปัดและขอบ',
      backSideLabel: 'ฝาหลังและกลไก',
      topSideLabel: 'เม็ดมะยมและสัดส่วน',
      bottomSideLabel: 'สายและตัวล็อกสาย',
      scanRequired: 'จำเป็นต้องถ่ายรูปด้านหน้าปัดเพื่อเริ่มวิเคราะห์ความแท้ด้วยระบบ AI',
      bonusScans: 'ปลดล็อกสิทธิ์สแกนโบนัสพิเศษเรียบร้อย!',
      consentsRequired: 'จำเป็นต้องกดยอมรับการคุ้มครองข้อมูลและการใช้ AI เพื่อประมวลผล',
    },
    loading: {
      analyzing: 'ระบบนิวรัลทูร์บิยองกำลังทำงาน...',
      step1: 'กำลังวิเคราะห์ตัวอักษรบนหน้าปัดอย่างละเอียด...',
      step2: 'กำลังตรวจสอบเรขาคณิตการจัดตำแหน่งของขอบและหลักชั่วโมง...',
      step3: 'กำลังตรวจสอบฟันเฟืองจักรกลและการแกะสลักหมายเลขเครื่อง...',
      step4: 'กำลังสืบค้นเปรียบเทียบฐานข้อมูลใบรับรองอ้างอิง RAG ของผู้เชี่ยวชาญ...',
      complete: 'การวิเคราะห์เสร็จสมบูรณ์ กำลังประมวลผลใบรับรองดิจิทัล...',
      triviaTitle: 'เกร็ดความรู้ประวัติศาสตร์นาฬิกาหรู',
      tips: [
        'นาฬิกาแบรนด์หรูของแท้จะมีความประณีตในการเก็บงานขอบมุมสูงมาก ขอบตัวเรือนจะถูกขัดแต่งเงางามไร้รอยตัดคมจากการผลิตราคาถูก',
        'กลไกจักรกลระดับสูงของแท้จะแกว่งอย่างนุ่มนวลเป็นธรรมชาติ เข็มวินาทีจะเคลื่อนที่แบบกวาดเรียบเนียนเกือบไร้รอยสะดุดของล้อเกียร์',
        'การพิมพ์ตัวอักษรบนหน้าปัดของแท้จะมีความคมชัดอย่างขีดสุด ไม่มีรอยหมึกเบลอ เลอะ หรือการบิดเบี้ยวของฟอนต์ยี่ห้อแม้แต่น้อย',
        'ผู้ผลิตระดับสูงจะเลือกใช้วัสดุพรีเมียมเฉพาะตัว เช่น Oystersteel 904L, ทองคำแท้ 18K หรือเซรามิกทนรอยขีดข่วน ทำให้มีน้ำหนักถ่วงข้อมือที่มั่นคง',
        'สารเรืองแสงของแท้ (Super-LumiNova/Chromalight) จะถูกทาอย่างสม่ำเสมอเป็นระเบียบ และให้แสงสว่างที่สว่างจ้าและคงทนเป็นสัดส่วนเท่ากัน',
        'ระวังนาฬิกาปลอมเกรดสูง (Super Clones) ที่ทำหน้าตาภายนอกเหมือนของจริงอย่างมาก ความจริงแท้จะถูกตัดสินจากงานสลักเฟืองลึกในกลไกด้านในเท่านั้น',
        'เลนส์ขยายวันที่และหน้าต่างวันที่ของแท้จะตั้งตรงเป็นแนวสมบูรณ์แบบ ให้กำลังขยายที่คมชัดไม่มีรอยบิดเบี้ยวของตัวเลข',
      ],
    },
    result: {
      verdict: 'ผลการตรวจสอบความแท้',
      confidence: 'ระดับความมั่นใจของ AI',
      saveToVault: 'บันทึกนาฬิกาลงตู้สะสมนิรภัย',
      savedSuccess: 'บันทึกนาฬิกาหรูเข้าสู่ตู้สะสมดิจิทัลเรียบร้อยแล้วอย่างปลอดภัย',
      marketVal: 'ประเมินราคาซื้อขายตลาดรองปัจจุบัน',
      specs: 'รายละเอียดทางเทคนิคและรายงานการวิเคราะห์ชิ้นส่วน',
      brand: 'ยี่ห้อ',
      model: 'รุ่น / รหัสอ้างอิง',
      finish: 'การขัดแต่งตัวเรือน',
      dialTypography: 'รายละเอียดตัวอักษรหน้าปัด',
      bezelIndices: 'การจัดตำแหน่งขอบและหลักชั่วโมง',
      movementSweep: 'งานแกะสลักหมายเลขกลไกเครื่อง',
      pass: 'ผ่านเกณฑ์ (ประณีตสมบูรณ์แบบ)',
      fail: 'ไม่ผ่านเกณฑ์ (พบจุดบกพร่อง)',
      warning: 'คำเตือน (พบความคลาดเคลื่อนทางกายภาพ)',
      modelMatch: 'ผลการจับคู่ฐานข้อมูลรุ่นนาฬิกา',
      matchedModel: 'รุ่นที่ตรวจพบ',
      matchedRef: 'รหัสที่จับคู่',
      detailsTitle: 'รายงานผลการวิเคราะห์ระดับโมเลกุลและการสลักเครื่อง',
      authenticityCertificate: 'ใบรับรองความแท้ของนาฬิกาหรู',
      certificateSub: 'เอกสารดิจิทัลอย่างเป็นทางการลงนามความปลอดภัยด้วย AI',
      uniquenessHash: 'รหัสความปลอดภัยของคาลิเบอร์',
    },
    learn: {
      title: 'แหล่งเรียนรู้และคู่มือนักสะสม',
      subtitle: 'บทความแนวทางการสะสมและเทคโนโลยีด้านการผลิตชั้นสูง',
      readTime: 'นาทีสำหรับการอ่าน',
      by: 'เขียนโดย',
      readArticle: 'อ่านบทความฉบับเต็ม',
      close: 'ปิดหน้าต่าง',
      origin: 'ประวัติศาสตร์และความเป็นมา',
      innovations: 'นวัตกรรมทางวิศวกรรมการผลิต',
      legends: 'รหัสอ้างอิงยอดนิยมและข้อมูลลับทางตลาด',
    },
    a11y: {
      shutter: 'ปุ่มกดถ่ายภาพสแกนนาฬิกา',
      article: 'การ์ดบทความ, {title}',
      tabHome: 'ปุ่มนําทางไปหน้าหลัก',
      tabVault: 'ปุ่มนําทางไปตู้นิรภัยตู้สะสม',
      tabPortfolio: 'ปุ่มนําทางไปหน้าวิเคราะห์พอร์ตโฟลิโอ',
      tabLearn: 'ปุ่มนําทางไปแหล่งเรียนรู้คู่มือนักสะสม',
      tabSettings: 'ปุ่มนําทางไปหน้าตั้งค่า',
    },
    error: {
      title: 'ระบบตรวจวิเคราะห์ล้มเหลว',
      retry: 'ลองใหม่อีกครั้ง',
      cancel: 'ยกเลิกการสแกน',
      networkFailed: 'การเชื่อมต่อเครือข่ายขัดข้อง ไม่สามารถติดต่อเซิร์ฟเวอร์วิเคราะห์ได้ กรุณาตรวจสอบอินเทอร์เน็ตของคุณ',
      aiFailed: 'ระบบวิเคราะห์ AI หมดเวลาในการตรวจสอบข้อมูลเมตาดาต้าของตัวเรือน กรุณาถือนิ่งๆ และลองใหมูอีกครั้ง',
      liveRateUnavailable: 'อัตราแลกเปลี่ยนไม่พร้อมใช้งาน — แสดงราคาเป็นสกุล USD',
    },
    upgradeReason: {
      auth_quota_exhausted: 'คุณใช้สิทธิ์สแกนไปแล้ว {used} จาก {cap} ครั้ง โควต้าการสแกนรายเดือนของคุณหมดแล้ว โควต้าจะเริ่มใหม่ใน {windowDays} วัน',
      feature_locked_heatmap: 'แผนภาพวิเคราะห์ AI Heatmap เปิดให้ใช้งานเฉพาะสมาชิกระดับ Pro และ Premium เท่านั้น อัปเกรดเพื่อปลดล็อก',
      feature_locked_ai_qa: 'การพูดคุยถามตอบเกี่ยวกับนาฬิกากับผู้เชี่ยวชาญ AI สงวนไว้สำหรับสมาชิกระดับ Premium เท่านั้น',
      feature_locked_bg_removal: 'การลบพื้นหลังสตูดิโอแบบพรีเมียมเปิดให้ใช้งานเฉพาะสมาชิกระดับ Pro และ Premium เท่านั้น',
      tier_lock_standard: 'ฟีเจอร์ระดับ Standard ถูกล็อกอยู่สำหรับระดับสมาชิกปัจจุบันของคุณ',
      tier_lock_pro: 'ฟีเจอร์ระดับ Pro ถูกล็อกอยู่สำหรับระดับสมาชิกปัจจุบันของคุณ',
      tier_lock_premium: 'ฟีเจอร์ระดับ Premium ถูกล็อกอยู่สำหรับระดับสมาชิกปัจจุบันของคุณ',
    },
  },
};

type LanguageContextProps = {
  lang: Language;
  setLang: (lang: Language) => void;
  t: (keyPath: string, replacements?: Record<string, string | number>) => string;
};

const LanguageContext = createContext<LanguageContextProps | undefined>(undefined);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Language>('en');

  // Load language preference from AsyncStorage
  useEffect(() => {
    AsyncStorage.getItem('user_language').then((savedLang) => {
      if (savedLang === 'th' || savedLang === 'en') {
        setLangState(savedLang as Language);
      }
    });
  }, []);

  const setLang = async (newLang: Language) => {
    setLangState(newLang);
    await AsyncStorage.setItem('user_language', newLang);
  };

  // Translation resolver supporting nested path string e.g. "home.welcome"
  const t = (keyPath: string, replacements?: Record<string, string | number>): string => {
    const keys = keyPath.split('.');
    let translationObj: any = translations[lang];

    for (const key of keys) {
      if (translationObj && translationObj[key] !== undefined) {
        translationObj = translationObj[key];
      } else {
        // Fallback to English dictionary if key not found in Thai
        let fallbackObj: any = translations['en'];
        for (const fallbackKey of keys) {
          if (fallbackObj && fallbackObj[fallbackKey] !== undefined) {
            fallbackObj = fallbackObj[fallbackKey];
          } else {
            return keyPath; // Ultimate fallback is raw key path
          }
        }
        translationObj = fallbackObj;
        break;
      }
    }

    if (typeof translationObj !== 'string') {
      return keyPath;
    }

    // Handle string replacements
    let result = translationObj;
    if (replacements) {
      Object.entries(replacements).forEach(([placeholder, value]) => {
        result = result.replace(`{${placeholder}}`, String(value));
      });
    }

    return result;
  };

  return React.createElement(
    LanguageContext.Provider,
    { value: { lang, setLang, t } },
    children
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}
