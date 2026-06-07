/**
 * Curated, READ-ONLY example scan results — shown to users who have not paid,
 * REPLACING a free AI tier. Tapping an example opens ResultScreen in example
 * mode (no AI call, no Save) so a prospect can experience the full result UI at
 * ZERO marginal cost. Data is realistic (brand/ref/price from the same catalog
 * the DB holds); the hero images are bundled so they always load offline.
 *
 * Not persisted, not scanned, not editable. Each carries a "ตัวอย่าง" badge and
 * an upgrade CTA in ResultScreen (see route param `isExample`).
 */
import { ScanResult, AuthenticitySignal } from '../types';

export type ExampleScan = {
  id: string;
  image: any; // bundled require() — passed to ResultScreen as `exampleImage`
  result: ScanResult;
};

function sig(
  signal: string,
  signalTh: string,
  score: number,
  weight: AuthenticitySignal['weight'] = 'positive',
): AuthenticitySignal {
  return { signal, signalTh, weight, score };
}

// Fields shared by every example (all curated "likely-authentic" showcases).
const BASE = {
  identified: true,
  priceDataFreshness: 'training' as const,
  priceSources: [] as ScanResult['priceSources'],
  priceFromCache: false,
  warningFlags: [] as string[],
  authenticityVerdict: 'likely-authentic' as const,
};

export const EXAMPLE_SCANS: ExampleScan[] = [
  {
    id: 'example-rolex-submariner',
    image: require('../../../assets/examples/submariner.jpg'),
    result: {
      ...BASE,
      confidence: 96,
      name: 'Submariner Date',
      brand: 'Rolex',
      reference: '126610LN',
      movementFamily: 'Calibre 3235 · อัตโนมัติ',
      caseMaterial: 'Oystersteel (สเตนเลส 904L)',
      year: '2020–ปัจจุบัน',
      type: 'นาฬิกาดำน้ำ (Diver)',
      description:
        'นาฬิกาดำน้ำในตำนานของ Rolex ขนาด 41 มม. ขอบ Cerachrom กันรอย กันน้ำ 300 เมตร — หนึ่งในรุ่นที่นิยมและถูกปลอมมากที่สุดในโลก',
      marketPrice: 10500,
      priceRangeUSD: { min: 9500, max: 13000 },
      priceByGrade: { excellent: 13000, good: 10500, fair: 9000 },
      priceNotes: 'ราคาตลาดรอง (อ้างอิงข้อมูลฝึก) — รุ่นยอดนิยม ราคาค่อนข้างนิ่ง',
      authenticityProbability: 94,
      authenticityReasoning:
        'ตราประทับ ฟอนต์ และสัดส่วนตรงกับตัวอย่างของแท้ในฐานข้อมูลอ้างอิง · ตำแหน่ง Cyclops / rehaut / มงกุฎ ได้มาตรฐานโรงงาน',
      authenticitySignals: [
        sig('Coronet crown engraving sharp & centered', 'มงกุฎ Rolex คมชัด เว้นระยะถูกต้อง', 9),
        sig('Rehaut laser-etched serial aligned', 'ตัวอักษร rehaut เลเซอร์ตรงตำแหน่ง', 9),
        sig('Cyclops 2.5× magnification correct', 'เลนส์ Cyclops ขยาย 2.5 เท่าถูกต้อง', 8),
        sig('Dial printing crisp, no bleeding', 'งานพิมพ์หน้าปัดคมไม่เลอะ', 9),
        sig('Cerachrom bezel font & lume pip', 'ฟอนต์ขอบ Cerachrom + pip เรืองแสง', 8),
        sig('Glidelock clasp engineering', 'บานพับ Glidelock งานประณีต', 8),
      ],
      checklist: ['มงกุฎ Triplock', 'rehaut เลเซอร์', 'Cyclops 2.5×', 'งานพิมพ์หน้าปัด', 'ขอบ Cerachrom', 'สาย Oyster'],
      recommendation:
        'นี่คือตัวอย่างผลตรวจของเรือนที่ผ่านเกณฑ์คัดกรอง — สแกนนาฬิกาของคุณเองเพื่อรับผลเฉพาะเรือนนั้น',
    },
  },
  {
    id: 'example-patek-nautilus',
    image: require('../../../assets/examples/nautilus.jpg'),
    result: {
      ...BASE,
      confidence: 95,
      name: 'Nautilus',
      brand: 'Patek Philippe',
      reference: '5711/1A-010',
      movementFamily: 'Calibre 26-330 S C · อัตโนมัติ',
      caseMaterial: 'สเตนเลสสตีล',
      year: '2006–2021 (เลิกผลิต)',
      type: 'Luxury Sports',
      description:
        'ไอคอนดีไซน์ของ Gérald Genta หน้าปัดลายนูนแนวนอน ขอบทรงเหลี่ยมมน — รุ่นเลิกผลิตที่มูลค่าตลาดรองพุ่งสูงและมีของปลอมเกรดสูงจำนวนมาก',
      marketPrice: 95000,
      priceRangeUSD: { min: 80000, max: 140000 },
      priceByGrade: { excellent: 140000, good: 95000, fair: 78000 },
      priceNotes: 'ราคาตลาดรอง (อ้างอิงข้อมูลฝึก) — เลิกผลิตปี 2021 มูลค่าผันผวนสูง',
      authenticityProbability: 93,
      authenticityReasoning:
        'ลายหน้าปัด (embossed) ระยะร่อง ฟอนต์ และงานเก็บขอบ bezel ตรงกับตัวอย่างของแท้ · โลโก้และตัวเลขได้สัดส่วนโรงงาน',
      authenticitySignals: [
        sig('Horizontally-embossed dial relief depth', 'ลายนูนหน้าปัดแนวนอน ความลึกถูกต้อง', 9),
        sig('Applied logo & markers alignment', 'โลโก้/หลักชั่วโมงติดตรงระดับ', 8),
        sig('Bezel "ears" symmetry & finishing', 'หูขอบทรงเหลี่ยม สมมาตร งานเงา-ด้านคม', 9),
        sig('Date wheel font matches caliber', 'ฟอนต์วันที่ตรงกับกลไก', 8),
        sig('Bracelet taper & polished centre links', 'สายเรียวสวย ข้อกลางขัดเงาถูกแบบ', 8),
        sig('Caseback "Patek Philippe Geneve" engraving', 'สลักฝาหลังคมตามมาตรฐาน', 8),
      ],
      checklist: ['ลายหน้าปัดนูน', 'โลโก้ติด', 'หูขอบ bezel', 'ฟอนต์วันที่', 'สาย', 'สลักฝาหลัง'],
      recommendation:
        'นี่คือตัวอย่างผลตรวจของเรือนที่ผ่านเกณฑ์คัดกรอง — สแกนนาฬิกาของคุณเองเพื่อรับผลเฉพาะเรือนนั้น',
    },
  },
  {
    id: 'example-ap-royaloak',
    image: require('../../../assets/examples/royaloak.png'),
    result: {
      ...BASE,
      confidence: 94,
      name: 'Royal Oak Selfwinding',
      brand: 'Audemars Piguet',
      reference: '15500ST.OO.1220ST.01',
      movementFamily: 'Calibre 4302 · อัตโนมัติ',
      caseMaterial: 'สเตนเลสสตีล',
      year: '2019–ปัจจุบัน',
      type: 'Luxury Sports',
      description:
        'รอยัล โอ๊ค 41 มม. ขอบแปดเหลี่ยมหมุดหกเหลี่ยม หน้าปัดลาย "Grande Tapisserie" — ดีไซน์ Genta อีกหนึ่งตำนานที่ถูกเลียนแบบสูง',
      marketPrice: 38000,
      priceRangeUSD: { min: 30000, max: 48000 },
      priceByGrade: { excellent: 48000, good: 38000, fair: 29000 },
      priceNotes: 'ราคาตลาดรอง (อ้างอิงข้อมูลฝึก) — ดีมานด์สูงต่อเนื่อง',
      authenticityProbability: 92,
      authenticityReasoning:
        'ลาย Tapisserie ความคมของพีระมิด หมุดหกเหลี่ยมตรงแนว และงานขัด zaratsu ตรงกับตัวอย่างของแท้ · ลายเซ็น AP ได้สัดส่วน',
      authenticitySignals: [
        sig('Grande Tapisserie pyramid sharpness', 'ลาย Tapisserie คมเป็นพีระมิด', 9),
        sig('Octagonal bezel & 8 hex screws aligned', 'ขอบแปดเหลี่ยม หมุด 6 เหลี่ยม 8 ตัวตรงแนว', 9),
        sig('"AP" combined logo proportions', 'โลโก้ AP ได้สัดส่วน', 8),
        sig('Zaratsu polished bevels distortion-free', 'งานขัด zaratsu เงาไม่บิดเบี้ยว', 8),
        sig('Integrated bracelet links finishing', 'สายอินทิเกรต งานเก็บข้อสวย', 8),
        sig('Dial text & date alignment', 'ตัวอักษรหน้าปัด/ช่องวันที่ตรงระดับ', 8),
      ],
      checklist: ['ลาย Tapisserie', 'ขอบ+หมุด', 'โลโก้ AP', 'งานขัด zaratsu', 'สายอินทิเกรต', 'หน้าปัด/วันที่'],
      recommendation:
        'นี่คือตัวอย่างผลตรวจของเรือนที่ผ่านเกณฑ์คัดกรอง — สแกนนาฬิกาของคุณเองเพื่อรับผลเฉพาะเรือนนั้น',
    },
  },
];
