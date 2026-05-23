/**
 * Luxury Authenticator — Premium Landing Page Interactive Controller
 * Driven by Vanilla JavaScript & Aesthetic Design Principles
 */

document.addEventListener('DOMContentLoaded', () => {
  // ==========================================================================
  // 1. Language Toggle & Translation Dictionary
  // ==========================================================================
  let currentLang = 'en'; // Default language

  const langBtn = document.getElementById('lang-btn');

  const translationMap = {
    // Navigation
    '.nav-links a[href="#features"]': { en: 'Features', th: 'คุณสมบัติ' },
    '.nav-links a[href="#simulator"]': { en: 'AI Simulator', th: 'ระบบจำลอง AI' },
    '.nav-links a[href="#pricing"]': { en: 'Pricing', th: 'ราคาและแพ็กเกจ' },
    '.nav-links a[href="#faq"]': { en: 'FAQ', th: 'คำถามที่พบบ่อย' },
    '.btn-primary-sm': { en: 'Launch App', th: 'เปิดใช้งานแอป' },
    
    // Hero
    '.hero-badge': { en: 'Independent AI Utility', th: 'เครื่องมือ AI อิสระ' },
    '#hero-title': { en: 'Independent AI Verification for Luxury Timepieces.', th: 'ระบบ AI อิสระ ตรวจสอบนาฬิกาหรูอัจฉริยะ' },
    '#hero-desc': { en: 'Verify authenticity, spot counterfeit anomalies, and estimate Dual-Currency resale values in under 60 seconds using state-of-the-art DINOv3 neural networks.', th: 'ตรวจสอบความแท้ วิเคราะห์จุดปลอมแปลง และประเมินราคาตลาด 2 สกุลเงิน (บาท/ดอลลาร์) ใน 60 วินาที ด้วยโครงข่ายประสาทเทียม DINOv3 ระดับแนวหน้า' },
    '#hero-cta-main': { en: 'Try Web Pre-Screening', th: 'ทดลองสแกนจำลองบนเว็บ' },
    '#hero-cta-sub': { en: 'View Premium Plans', th: 'ดูแพ็กเกจสมาชิกพรีเมียม' },
    '.hero-stats .stat-item:nth-child(1) .stat-label': { en: 'Scan Capture', th: 'เวลาสแกนภาพ' },
    '.hero-stats .stat-item:nth-child(3) .stat-label': { en: 'Auction Feeds', th: 'ฐานข้อมูลการประมูล' },
    '.hero-stats .stat-item:nth-child(5) .stat-label': { en: 'Confidential', th: 'ปลอดภัยเป็นความลับ' },
    
    // Features Header
    '#features-title': { en: 'Engineered for Absolute Verification', th: 'พัฒนาเพื่อความแม่นยำและเป็นกลางสูงสุด' },
    '#features-subtitle': { en: 'We do not sell watches, and we are not owned by any manufacturer or marketplace. Our neural models evaluate purely on optical truth.', th: 'เราไม่ได้ขายนายหน้า หรือมีบริษัทนาฬิกาเป็นเจ้าของ ระบบประสาทเทียมตรวจประเมินอ้างอิงจากหลักฐานทางสายตาและความเป็นจริงเท่านั้น' },
    
    // Features Grid
    '.features-grid .feature-card:nth-child(1) .feature-card-title': { en: 'Landmark Heatmaps', th: 'แผนความร้อนวิเคราะห์จุดสัดส่วน' },
    '.features-grid .feature-card:nth-child(1) .feature-card-desc': { en: 'AI maps fine details such as sub-dial spacings, crown-guards, bezel engravings, and case polishing to cross-reference authenticity indicators.', th: 'AI ตรวจจับตำแหน่งหน้าปัด วงจับเวลาย่อย ตัวเรือน และการแกะสลักขอบเพื่อเปรียบเทียบหาความเบี่ยงเบนอย่างแม่นยำ' },
    '.features-grid .feature-card:nth-child(2) .feature-card-title': { en: 'Dual-Currency Resale Estimates', th: 'ประเมินราคาตลาด 2 สกุลเงิน' },
    '.features-grid .feature-card:nth-child(2) .feature-card-desc': { en: 'Grounded market valuations integrated directly with Chrono24 and regional trends. Displays prices instantly in USD & Thai Baht (฿).', th: 'ข้อมูลราคาตลาดอ้างอิงและประเมินร่วมกับ Chrono24 และเทรนด์ซื้อขายในภูมิภาค แสดงผลลัพธ์ทันทีทั้ง USD และบาทไทย (฿)' },
    '.features-grid .feature-card:nth-child(3) .feature-card-title': { en: '100% Brand Neutrality', th: 'เป็นกลางและเป็นส่วนตัว 100%' },
    '.features-grid .feature-card:nth-child(3) .feature-card-desc': { en: 'Enjoy full confidence. Our platform does not share data with brands, marketplaces, or insurance firms. Purely confidential consumer utility.', th: 'มั่นใจสูงสุด ข้อมูลสแกนทั้งหมดจะถูกเก็บเป็นความลับ ไม่ถูกส่งต่อให้ผู้ผลิต ตัวแทน หรือบริษัทประกันภัยใดๆ' },
    
    // Simulator Section
    '.simulator-section .section-title': { en: 'Interactive AI Scan Simulator', th: 'เครื่องสแกน AI จำลองการตรวจ' },
    '.simulator-section .section-subtitle': { en: 'Experience how our neural network visualizes physical features of luxury references in real-time.', th: 'ทดสอบการทำงานของระบบประสาทเทียมอัจฉริยะในการตรวจสัดส่วนนาฬิกาเรียลไทม์' },
    '.sim-sidebar-title': { en: 'Select Timepiece Reference', th: 'เลือกรุ่นนาฬิกาเพื่อทดลองสแกน' },
    '#run-sim-btn': { en: 'Initialize Optical Scan', th: 'เริ่มต้นการสแกนด้วยแสง' },
    '.sim-status-panel .status-line:nth-child(1) .status-label': { en: 'Optical Stream:', th: 'สัญญาณการสแกนภาพ:' },
    '.sim-status-panel .status-line:nth-child(2) .status-label': { en: 'Model Resolution:', th: 'ความละเอียดของโมเดล:' },
    '.sim-status-panel .status-line:nth-child(2) .status-val': { en: 'DINOv3 High-Fidelity', th: 'DINOv3 ความแม่นยำสูง' },
    '.sim-status-panel .status-line:nth-child(3) .status-label': { en: 'Confidence Index:', th: 'ดัชนีระดับความมั่นใจ:' },
    '.sim-screen-card .screen-title': { en: 'AI Analyzer Engine v3.2', th: 'เอนจิ้นวิเคราะห์ AI v3.2' },

    // Pricing Section Header
    '#pricing-title': { en: 'Flexible Luxury Structure', th: 'แพ็กเกจสำหรับคนรักนาฬิกาหรู' },
    '#pricing-subtitle': { en: 'Select Pay-Per-Scan Credit packs for one-off transactions, or Subscribe for high-volume dealer access.', th: 'เลือกซื้อเครดิตรายครั้งสำหรับผู้ใช้ทั่วไป หรือสมัครสมาชิกรายเดือนเพื่อการใช้งานระดับดีลเลอร์มืออาชีพ' },
    '#btn-sub': { en: 'Monthly Subscription', th: 'สมาชิกรายเดือน' },
    '#btn-credit': { en: 'On-Demand Credits', th: 'ซื้อโควต้ารายครั้ง' },
    
    // Pricing Monthly
    '#grid-sub .pricing-card:nth-child(1) .plan-name': { en: 'Standard Collector', th: 'สะสมระดับมาตรฐาน' },
    '#grid-sub .pricing-card:nth-child(1) .price-period': { en: '/ month', th: '/ เดือน' },
    '#grid-sub .pricing-card:nth-child(1) .price-thai': { en: 'ประมาณ ฿990 / เดือน', th: 'ประมาณ ฿990 / เดือน' },
    '#grid-sub .pricing-card:nth-child(1) .plan-features': {
      en: `
        <li><span>✓</span> 30 AI Authenticity Scans / Mo</li>
        <li><span>✓</span> Dual-Currency Valuation (USD/THB)</li>
        <li><span>✓</span> Basic optical anomaly checks</li>
        <li><span>✓</span> 2 Photo Capture Slots</li>
        <li><span>✗</span> Priority processing queue</li>
      `,
      th: `
        <li><span>✓</span> สแกนตรวจสอบ AI 30 ครั้ง/เดือน</li>
        <li><span>✓</span> ประเมินราคา 2 สกุลเงิน (USD/THB)</li>
        <li><span>✓</span> ตรวจสอบจุดเบี่ยงเบนเบื้องต้น</li>
        <li><span>✓</span> ถ่ายภาพสแกน 2 มุมตัวเรือน</li>
        <li><span>✗</span> ลำดับคิววิเคราะห์แบบเร่งด่วน</li>
      `
    },
    '#grid-sub .pricing-card:nth-child(1) .btn-card-primary': { en: 'Subscribe Collector', th: 'สมัครแพ็กเกจ Collector' },

    '#grid-sub .pricing-card:nth-child(2) .plan-name': { en: 'Pro Dealer', th: 'ดีลเลอร์ระดับโปร' },
    '#grid-sub .pricing-card:nth-child(2) .best-value-badge': { en: 'BEST VALUE', th: 'คุ้มค่าที่สุด ⭐' },
    '#grid-sub .pricing-card:nth-child(2) .price-period': { en: '/ month', th: '/ เดือน' },
    '#grid-sub .pricing-card:nth-child(2) .price-thai': { en: 'ประมาณ ฿1,990 / เดือน', th: 'ประมาณ ฿1,990 / เดือน' },
    '#grid-sub .pricing-card:nth-child(2) .plan-features': {
      en: `
        <li><span>✓</span> 80 AI Authenticity Scans / Mo</li>
        <li><span>✓</span> Live Chrono24 Price Updates</li>
        <li><span>✓</span> Background Removal (BG removal)</li>
        <li><span>✓</span> 3 Photo Capture Slots</li>
        <li><span>✓</span> PDF report export sharing</li>
      `,
      th: `
        <li><span>✓</span> สแกนตรวจสอบ AI 80 ครั้ง/เดือน</li>
        <li><span>✓</span> อัปเดตราคาสดเรียลไทม์ (Chrono24)</li>
        <li><span>✓</span> ระบบตัดพื้นหลัง AI อัจฉริยะ</li>
        <li><span>✓</span> ถ่ายภาพสแกน 3 มุมตัวเรือน</li>
        <li><span>✓</span> ส่งออกรายงานสรุปเป็น PDF</li>
      `
    },
    '#grid-sub .pricing-card:nth-child(2) .btn-card-gold': { en: 'Subscribe Pro Dealer', th: 'สมัครแพ็กเกจ Pro Dealer' },

    '#grid-sub .pricing-card:nth-child(3) .plan-name': { en: 'Premium Executive', th: 'ดีลเลอร์ระดับสูง' },
    '#grid-sub .pricing-card:nth-child(3) .price-period': { en: '/ month', th: '/ เดือน' },
    '#grid-sub .pricing-card:nth-child(3) .price-thai': { en: 'ประมาณ ฿4,990 / เดือน', th: 'ประมาณ ฿4,990 / เดือน' },
    '#grid-sub .pricing-card:nth-child(3) .plan-features': {
      en: `
        <li><span>✓</span> 200 AI Authenticity Scans / Mo</li>
        <li><span>✓</span> Full Landmark Heatmap Overlays</li>
        <li><span>✓</span> White-label PDF exports (no watermarks)</li>
        <li><span>✓</span> 4 Photo Capture Slots (inc. movements)</li>
        <li><span>✓</span> Unlimited Collector Portfolio items</li>
      `,
      th: `
        <li><span>✓</span> สแกนตรวจสอบ AI 200 ครั้ง/เดือน</li>
        <li><span>✓</span> แผนความร้อนวิเคราะห์ตำแหน่งละเอียด</li>
        <li><span>✓</span> ใบรายงาน PDF ไม่มีลายน้ำแบรนด์</li>
        <li><span>✓</span> ถ่ายภาพสแกนจัดเต็ม 4 มุม (รวมเครื่อง)</li>
        <li><span>✓</span> คลังเก็บสะสมประวัติไม่จำกัดจำนวน</li>
      `
    },
    '#grid-sub .pricing-card:nth-child(3) .btn-card-primary': { en: 'Subscribe Executive', th: 'สมัครแพ็กเกจ Executive' },

    // Pricing Credits
    '#grid-credit .pricing-card:nth-child(1) .plan-name': { en: 'Single Credit', th: 'ตรวจรายครั้ง 1 เครดิต' },
    '#grid-credit .pricing-card:nth-child(1) .price-period': { en: '/ scan', th: '/ ครั้ง' },
    '#grid-credit .pricing-card:nth-child(1) .price-thai': { en: 'ประมาณ ฿550 / ครั้ง', th: 'ประมาณ ฿550 / ครั้ง' },
    '#grid-credit .pricing-card:nth-child(1) .plan-features': {
      en: `
        <li><span>✓</span> 1 High-Accuracy AI Scan</li>
        <li><span>✓</span> Full checklist report</li>
        <li><span>✓</span> Dual-Currency Valuation</li>
        <li><span>✓</span> 100% confidential check</li>
        <li><span>✓</span> Valid for 12 months</li>
      `,
      th: `
        <li><span>✓</span> สแกนตรวจสอบความแม่นยำสูง 1 ครั้ง</li>
        <li><span>✓</span> รายงานเช็คลิสต์ประเมินสเปกฉบับเต็ม</li>
        <li><span>✓</span> ประเมินราคาตลาดคู่อัตราแลกเปลี่ยน</li>
        <li><span>✓</span> ตรวจสอบข้อมูลลับเฉพาะบุคคล 100%</li>
        <li><span>✓</span> เครดิตมีอายุใช้งาน 12 เดือน</li>
      `
    },
    '#grid-credit .pricing-card:nth-child(1) .btn-card-primary': { en: 'Purchase 1 Credit', th: 'ซื้อเครดิต 1 ครั้ง' },

    '#grid-credit .pricing-card:nth-child(2) .plan-name': { en: '3-Scan Credit Pack', th: 'แพ็กเกจสุดฮิต 3 เครดิต' },
    '#grid-credit .pricing-card:nth-child(2) .best-value-badge': { en: 'POPULAR PACK', th: 'แพ็กเกจแนะนำ 🔥' },
    '#grid-credit .pricing-card:nth-child(2) .price-period': { en: '/ package', th: '/ แพ็กเกจ' },
    '#grid-credit .pricing-card:nth-child(2) .price-thai': { en: 'ประมาณ ฿1,400 | Save 13%', th: 'ประมาณ ฿1,400 | ประหยัด 13%' },
    '#grid-credit .pricing-card:nth-child(2) .plan-features': {
      en: `
        <li><span>✓</span> 3 High-Accuracy AI Scans</li>
        <li><span>✓</span> $13.00 (฿466) average per scan</li>
        <li><span>✓</span> Full checklist reports</li>
        <li><span>✓</span> Dual-Currency Valuation</li>
        <li><span>✓</span> No expiration date</li>
      `,
      th: `
        <li><span>✓</span> สแกนตรวจสอบความแม่นยำสูง 3 ครั้ง</li>
        <li><span>✓</span> เฉลี่ยสแกนละ $13.00 (฿466)</li>
        <li><span>✓</span> รายงานเช็คลิสต์ประเมินสเปกฉบับเต็ม</li>
        <li><span>✓</span> ประเมินราคาตลาดคู่อัตราแลกเปลี่ยน</li>
        <li><span>✓</span> เครดิตไม่มีวันหมดอายุ</li>
      `
    },
    '#grid-credit .pricing-card:nth-child(2) .btn-card-gold': { en: 'Purchase 3 Credits', th: 'ซื้อแพ็กเกจ 3 เครดิต' },

    '#grid-credit .pricing-card:nth-child(3) .plan-name': { en: '10-Scan Credit Pack', th: 'แพ็กเกจร้านค้า 10 เครดิต' },
    '#grid-credit .pricing-card:nth-child(3) .price-period': { en: '/ package', th: '/ แพ็กเกจ' },
    '#grid-credit .pricing-card:nth-child(3) .price-thai': { en: 'ประมาณ ฿3,600 | Save 34%', th: 'ประมาณ ฿3,600 | ประหยัด 34%' },
    '#grid-credit .pricing-card:nth-child(3) .plan-features': {
      en: `
        <li><span>✓</span> 10 High-Accuracy AI Scans</li>
        <li><span>✓</span> $9.90 (฿360) average per scan</li>
        <li><span>✓</span> Full checklist reports</li>
        <li><span>✓</span> Ideal for collectors and stores</li>
        <li><span>✓</span> Unlimited storage sharing</li>
      `,
      th: `
        <li><span>✓</span> สแกนตรวจสอบความแม่นยำสูง 10 ครั้ง</li>
        <li><span>✓</span> เฉลี่ยสแกนละ $9.90 (฿360) ประหยัดสุด</li>
        <li><span>✓</span> รายงานเช็คลิสต์ประเมินสเปกฉบับเต็ม</li>
        <li><span>✓</span> เหมาะอย่างยิ่งสำหรับร้านค้าและสะสม</li>
        <li><span>✓</span> ประวัติจัดเก็บถาวรและแชร์ไม่จำกัด</li>
      `
    },
    '#grid-credit .pricing-card:nth-child(3) .btn-card-primary': { en: 'Purchase 10 Credits', th: 'ซื้อแพ็กเกจ 10 เครดิต' },

    // FAQ Section
    '.faq-section .section-title': { en: 'Frequently Asked Questions', th: 'คำถามที่พบบ่อย' },
    '.faq-section .section-subtitle': { en: 'Frequently asked inquiries regarding our independent watch verification infrastructure.', th: 'คำชี้แจงและข้อมูลตอบข้อซักถามเกี่ยวกับระบบตรวจวิเคราะห์นาฬิกาที่เป็นกลางของเรา' },

    // FAQ Items
    '.faq-item:nth-child(1) .faq-trigger span:first-child': { en: 'How does the AI verify luxury watches?', th: 'ระบบ AI สามารถตรวจสอบนาฬิกาหรูได้อย่างไร?' },
    '.faq-item:nth-child(1) .faq-content p': {
      en: 'Our custom-trained DINOv3 vision classifier and ResNet feature extractor map high-resolution details of watch faces, bezel alignments, typography, and metal finishings. These visual signals are cross-referenced with a DINOv3 feature embedding index in our pgvector database to isolate micrometric anomalies common to high-end replicas.',
      th: 'โมเดล DINOv3 และ ResNet ที่เราฝึกฝนแบบ Custom จะทำการแผนผังพิกเซลความละเอียดสูงบนหน้าปัด ขอบ ข้อต่อตัวเรือน ตัวอักษร และสัมผัสผิวโลหะ แล้วนำค่าเวกเตอร์คุณลักษณะนี้ไปเปรียบเทียบในฐานข้อมูล pgvector เพื่อค้นหาจุดเบี่ยงเบนระดับไมโครเมตรที่มักพบในนาฬิกาเลียนแบบเกรดสูง'
    },

    '.faq-item:nth-child(2) .faq-trigger span:first-child': { en: 'Is this service affiliated with the luxury watch brands?', th: 'แอปพลิเคชันนี้ได้รับการแต่งตั้งหรือเป็นทางการร่วมกับแบรนด์นาฬิกาหรือไม่?' },
    '.faq-item:nth-child(2) .faq-content p': {
      en: 'No. Luxury Authenticator is completely independent. We are not officially affiliated with, endorsed by, or partnered with Rolex, Audemars Piguet, Patek Philippe, or any luxury watch manufacturer. This independent posture ensures we provide completely objective, unbiased assessments free of brand policy controls.',
      th: 'ไม่ใช่ครับ Luxury Authenticator เป็นเครื่องมือวิเคราะห์ทางสายตาแบบอิสระ 100% เราไม่มีความเกี่ยวข้อง สัญญาพันธมิตร หรือได้รับการสนับสนุนอย่างเป็นทางการจากแบรนด์ Rolex, Audemars Piguet, Patek Philippe หรือผู้ผลิตใดๆ ความเป็นอิสระนี้ช่วยรับประกันว่าการรายงานผลจะเป็นกลาง ถูกต้องตามภาพถ่าย และปราศจากการควบคุมนโยบายของแบรนด์'
    },

    '.faq-item:nth-child(3) .faq-trigger span:first-child': { en: 'What watch models are supported?', th: 'นาฬิการุ่นใดบ้างที่แอปพลิเคชันรองรับการสแกน?' },
    '.faq-item:nth-child(3) .faq-content p': {
      en: 'We support major luxury sports and dress watch families, including Rolex Submariner, Daytona, GMT-Master II, Datejust, Audemars Piguet Royal Oak series, Patek Philippe Nautilus and Aquanaut, Cartier Santos and Tank, and Omega Speedmaster and Seamaster references.',
      th: 'เราครอบคลุมตระกูลนาฬิกาหรูสปอร์ตและเดรสยอดนิยม ได้แก่ Rolex Submariner, Daytona, GMT-Master II, Datejust, Audemars Piguet Royal Oak, Patek Philippe Nautilus และ Aquanaut, Cartier Santos และ Tank รวมทั้ง Omega Speedmaster และ Seamaster'
    },

    '.faq-item:nth-child(4) .faq-trigger span:first-child': { en: 'Is my watch data private?', th: 'ข้อมูลรูปภาพของนาฬิกาผมจะถูกเก็บเป็นส่วนตัวหรือไม่?' },
    '.faq-item:nth-child(4) .faq-content p': {
      en: 'Yes. Data privacy is our highest priority. All photos and scan metadata remain strictly confidential. We do not sell or share data with resale platforms, insurance groups, or luxury brands. You maintain full ownership of your records.',
      th: 'ใช่ครับ ความเป็นส่วนตัวเป็นสิ่งที่เราให้ความสำคัญที่สุด รูปภาพและผลสแกนนาฬิกาทั้งหมดจะถูกเก็บเป็นความลับระดับสูงสุด โดยไม่มีการแชร์หรือขายข้อมูลให้กลุ่มตลาดมือสอง บริษัทประกันภัย หรือแบรนด์นาฬิกาใดๆ คุณคือเจ้าของข้อมูลรายงานของคุณอย่างแท้จริง'
    },

    // Download App Section
    '.download-title': { en: 'Secure Your Premium Access', th: 'ดาวน์โหลดและปลดล็อกระบบระดับพรีเมียม' },
    '.download-subtitle': { en: 'Download the Luxury Authenticator App for iOS and Android, or configure your premium membership today.', th: 'ดาวน์โหลดแอป Luxury Authenticator สำหรับระบบ iOS และ Android เพื่อจัดการพอร์ตโฟลิโอและตรวจเช็คทันทีวันนี้' },
    '.apple-store': { en: 'Download on App Store', th: 'ดาวน์โหลดจาก App Store' },
    '.google-play': { en: 'Get it on Google Play', th: 'ดาวน์โหลดจาก Google Play' },

    // Footer & Disclaimer
    '.footer-desc': { en: 'Professional AI-powered instant optical watch analysis and dual-currency valuation index.', th: 'ระบบ AI วิเคราะห์ความแท้ทางสายตา และแสดงดัชนีประเมินราคาตลาดคู่สกุลเงินระดับมืออาชีพ' },
    '.neutrality-disclaimer': {
      en: '<strong>LEGAL DISCLAIMER:</strong> Luxury Authenticator is a fully independent visual analysis utility. We are not an authorized dealer, partner, or official representative of Rolex, Patek Philippe, Audemars Piguet, Omega, Cartier, or any watch manufacturer. All brand names, logos, trademarks, and references shown on this page are properties of their respective owners, used solely for description and reference purposes. All evaluations are powered by optical AI models and are intended as preliminary secondary guidance.',
      th: '<strong>ข้อปฏิเสธความรับผิดชอบทางกฎหมาย:</strong> Luxury Authenticator เป็นเครื่องมืออำนวยความสะดวกในการตรวจวิเคราะห์ลักษณะทางสายตาที่เป็นอิสระอย่างสิ้นเชิง เราไม่ใช่ตัวแทนจำหน่ายอย่างเป็นทางการ พันธมิตร หรือผู้แทนของ Rolex, Patek Philippe, Audemars Piguet, Omega, Cartier หรือผู้ผลิตรายใด ชื่อสินค้า โลโก้ และเครื่องหมายการค้าทั้งหมดที่ปรากฏบนเว็บไซต์นี้เป็นสิทธิ์ของเจ้าของแบรนด์เหล่านั้น ใช้เพียงเพื่อเป็นข้อมูลอธิบายอ้างอิงเท่านั้น ผลลัพธ์จากการสแกน AI เป็นเพียงข้อมูลนำเสนอในระดับประเมินความสอดคล้องทางกายภาพเบื้องต้น ไม่เทียบเท่าใบรับรองมาตรฐานเป็นทางการ'
    },
    '.copyright': {
      en: '&copy; 2026 Luxury Authenticator. Developed by Kritsada Yuwathanont. All rights reserved.',
      th: '&copy; 2026 Luxury Authenticator. พัฒนาโดย กฤษฎา ยุวถาวรนันท์. สงวนลิขสิทธิ์ทั้งหมด.'
    }
  };

  function setLanguage(lang) {
    currentLang = lang;
    
    // Toggle language button text
    if (lang === 'en') {
      langBtn.textContent = 'TH';
    } else {
      langBtn.textContent = 'EN';
    }

    // Apply translations
    Object.keys(translationMap).forEach((selector) => {
      const element = document.querySelector(selector);
      if (element) {
        const trans = translationMap[selector][lang];
        if (trans.trim().startsWith('<li>')) {
          element.innerHTML = trans;
        } else {
          element.textContent = trans;
        }
      }
    });

    // Update dynamic text in interactive simulator
    updateSimulatorLanguage();
  }

  langBtn.addEventListener('click', () => {
    const nextLang = currentLang === 'en' ? 'th' : 'en';
    setLanguage(nextLang);
  });


  // ==========================================================================
  // 2. Subscription vs. Credits Switcher
  // ==========================================================================
  const btnSub = document.getElementById('btn-sub');
  const btnCredit = document.getElementById('btn-credit');
  const gridSub = document.getElementById('grid-sub');
  const gridCredit = document.getElementById('grid-credit');

  function togglePricingGrid(showCredits) {
    if (showCredits) {
      btnCredit.classList.add('active');
      btnSub.classList.remove('active');
      gridCredit.classList.add('active');
      gridSub.classList.remove('active');
    } else {
      btnSub.classList.add('active');
      btnCredit.classList.remove('active');
      gridSub.classList.add('active');
      gridCredit.classList.remove('active');
    }
  }

  btnSub.addEventListener('click', () => togglePricingGrid(false));
  btnCredit.addEventListener('click', () => togglePricingGrid(true));


  // ==========================================================================
  // 3. FAQ Accordion Handling
  // ==========================================================================
  const faqTriggers = document.querySelectorAll('.faq-trigger');

  faqTriggers.forEach((trigger) => {
    trigger.addEventListener('click', () => {
      const content = trigger.nextElementSibling;
      const icon = trigger.querySelector('.faq-icon');
      
      const isExpanded = !content.hasAttribute('hidden');

      // Close all other FAQs for cleaner UX accordion
      faqTriggers.forEach((otherTrigger) => {
        if (otherTrigger !== trigger) {
          otherTrigger.nextElementSibling.setAttribute('hidden', 'until-found');
          otherTrigger.querySelector('.faq-icon').textContent = '+';
        }
      });

      if (isExpanded) {
        content.setAttribute('hidden', 'until-found');
        icon.textContent = '+';
      } else {
        content.removeAttribute('hidden');
        icon.textContent = '−';
      }
    });
  });


  // ==========================================================================
  // 4. AI Scanner Simulator
  // ==========================================================================
  const refBtns = document.querySelectorAll('.ref-btn');
  const runSimBtn = document.getElementById('run-sim-btn');
  const simRadar = document.getElementById('sim-radar');
  const simScanLine = document.getElementById('sim-scan-line');
  const streamStatus = document.getElementById('stream-status');
  const confidenceVal = document.getElementById('confidence-val');
  const hotspots = document.querySelectorAll('.hotspot');

  // Simulator Data per Reference
  const simData = {
    'royal-oak': {
      confidence: '99.4%',
      hotspots: [
        { top: '15%', left: '50%', en: 'Bezel Symmetry: Match 99.8%', th: 'สมมาตรขอบบาเซิล: ตรงกัน 99.8%' },
        { top: '48%', left: '40%', en: 'AP Logo: Alignment Correct', th: 'โลโก้ AP: การวางตำแหน่งถูกต้อง' },
        { top: '75%', left: '68%', en: 'Bracelet Integration: Correct tolerances', th: 'ข้อต่อสายนาฬิกา: ช่องว่างถูกต้อง' }
      ]
    },
    'daytona': {
      confidence: '99.2%',
      hotspots: [
        { top: '30%', left: '50%', en: 'Chronograph Subdials: Spacing Correct', th: 'วงจับเวลาหลัก: ระยะห่างถูกต้อง' },
        { top: '18%', left: '50%', en: 'Rolex Coronet Logo: 100% Symmetry', th: 'โลโก้มงกุฎโรเล็กซ์: สมมาตร 100%' },
        { top: '55%', left: '50%', en: 'Laser-Etched Coronet (6 o\'clock): Detected', th: 'โลโก้เลเซอร์กระจก 6 นาฬิกา: ตรวจพบ' }
      ]
    },
    'nautilus': {
      confidence: '98.9%',
      hotspots: [
        { top: '40%', left: '50%', en: 'Horizontal Embossed Dial: Spacing Correct', th: 'ลายลอนแนวนอนหน้าปัด: ระยะห่างถูกต้อง' },
        { top: '48%', left: '48%', en: 'Patek Philippe Typography: Sharp print', th: 'ฟอนต์อักษร Patek Philippe: คมชัดระดับไมครอน' },
        { top: '50%', left: '82%', en: 'Crown Guard Proportions: Original specs', th: 'สัดส่วนการ์ดมะยม: ตรงตามสเปกออริจินัล' }
      ]
    }
  };

  let activeRef = 'royal-oak';
  let isScanning = false;
  let hasScanned = false;

  function updateHotspots() {
    const data = simData[activeRef];
    hotspots.forEach((hs, idx) => {
      const config = data.hotspots[idx];
      if (config) {
        hs.style.top = config.top;
        hs.style.left = config.left;
        const tooltipText = config[currentLang];
        hs.setAttribute('data-tooltip', tooltipText);
      }
    });
  }

  function updateSimulatorLanguage() {
    // If scanning is complete, update stream status or hotspots text
    if (hasScanned && !isScanning) {
      streamStatus.textContent = currentLang === 'en' ? 'VERIFIED (CONFIDENTIAL)' : 'ตรวจสอบแล้ว (ข้อมูลเป็นความลับ)';
      runSimBtn.textContent = currentLang === 'en' ? 'Scan Complete — Reset' : 'สแกนสำเร็จ — เริ่มใหม่';
    } else if (!isScanning) {
      streamStatus.textContent = currentLang === 'en' ? 'READY' : 'พร้อมทำงาน';
      runSimBtn.textContent = currentLang === 'en' ? 'Initialize Optical Scan' : 'เริ่มต้นการสแกนด้วยแสง';
    }

    updateHotspots();
  }

  // Handle reference select
  refBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      if (isScanning) return; // Prevent changing reference mid-scan
      
      refBtns.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      activeRef = btn.getAttribute('data-ref');

      // Reset scan state on watch change
      resetSimulator();
      updateHotspots();
    });
  });

  function resetSimulator() {
    hasScanned = false;
    isScanning = false;
    confidenceVal.textContent = '--';
    streamStatus.textContent = currentLang === 'en' ? 'READY' : 'พร้อมทำงาน';
    streamStatus.className = 'status-val'; // Remove colors
    runSimBtn.textContent = currentLang === 'en' ? 'Initialize Optical Scan' : 'เริ่มต้นการสแกนด้วยแสง';
    runSimBtn.disabled = false;
    
    // Hide hotspots
    hotspots.forEach((hs) => hs.classList.remove('visible'));
    
    // Hide scanning visuals
    simRadar.classList.remove('scanning');
    simScanLine.classList.remove('scanning');
  }

  function runOpticalScan() {
    isScanning = true;
    runSimBtn.disabled = true;
    
    // Hide old hotspots during active scan
    hotspots.forEach((hs) => hs.classList.remove('visible'));

    // Trigger visual FX
    simRadar.classList.add('scanning');
    simScanLine.classList.add('scanning');

    // Simulate multi-stage neural network analysis steps
    const steps = [
      { delay: 0, textEn: 'CONNECTING OPTICAL STREAM...', textTh: 'กำลังเชื่อมโยงสัญญาณสแกนภาพ...' },
      { delay: 800, textEn: 'ANALYZING PHYSICAL LANDMARKS...', textTh: 'กำลังตรวจวัดสัดส่วนทางกายภาพ...' },
      { delay: 1600, textEn: 'MATCHING DINOv3 EMBEDDINGS...', textTh: 'กำลังเปรียบเทียบในฐานข้อมูลเวกเตอร์...' },
      { delay: 2400, textEn: 'VERIFICATION COMPLETE', textTh: 'การตรวจสอบสัดส่วนเสร็จสิ้น' }
    ];

    steps.forEach((step) => {
      setTimeout(() => {
        if (!isScanning) return;
        streamStatus.textContent = currentLang === 'en' ? step.textEn : step.textTh;
        streamStatus.className = 'status-val font-gold';
      }, step.delay);
    });

    // Complete scan and display results
    setTimeout(() => {
      if (!isScanning) return;
      isScanning = false;
      hasScanned = true;

      // Disable visual FX
      simRadar.classList.remove('scanning');
      simScanLine.classList.remove('scanning');

      // Display confidence rate
      const data = simData[activeRef];
      confidenceVal.textContent = data.confidence;

      // Reveal hotspots with custom animation
      hotspots.forEach((hs) => hs.classList.add('visible'));

      // Adjust CTA labels
      streamStatus.textContent = currentLang === 'en' ? 'VERIFIED (CONFIDENTIAL)' : 'ตรวจสอบแล้ว (ข้อมูลเป็นความลับ)';
      streamStatus.className = 'status-val green-text';
      runSimBtn.disabled = false;
      runSimBtn.textContent = currentLang === 'en' ? 'Scan Complete — Reset' : 'สแกนสำเร็จ — เริ่มใหม่';
    }, 2800);
  }

  runSimBtn.addEventListener('click', () => {
    if (hasScanned) {
      resetSimulator();
    } else {
      runOpticalScan();
    }
  });

  // Initialize page configuration
  setLanguage('en');
});
