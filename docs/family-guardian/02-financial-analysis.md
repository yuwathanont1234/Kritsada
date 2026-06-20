# การวิเคราะห์การเงิน: แอปผู้พิทักษ์ครอบครัว (Family Guardian)

**วิเคราะห์โดย: เก่ง ฝ่ายการเงิน | วันที่: 20 มิถุนายน 2569**

---

## 1. โมเดลรายได้ที่แนะนำ

### แนะนำ: Freemium Subscription + B2B2C Channel เป็น Layer 2

เหตุผลที่เลือก freemium ก่อน B2B2C:
- Life360 พิสูจน์แล้วว่า freemium family-safety ทำงานได้ (conversion ~2.9% จาก 95.8M MAU)
- ตลาดไทยยังต้องการ "ทดลองฟรี" ก่อนตัดสินใจจ่าย — ความไว้ใจสูงกว่าเมื่อสัมผัสได้จริง
- B2B2C (โรงพยาบาล/ประกัน) ใช้เวลา sales cycle 6-18 เดือน ไม่เหมาะกับ MVP ทีมเล็ก

**โครงสร้าง 3 ช่วง:**

| ช่วง | เวลา | โมเดล | เป้าหมาย |
|------|------|--------|-----------|
| Phase 1 | เดือน 1-6 | Free + ยืนยัน PMF | 5,000 active family ครอบครัว |
| Phase 2 | เดือน 7-18 | Freemium Subscription | 500 paid families, จุดคุ้มทุน |
| Phase 3 | เดือน 19+ | B2B2C กับ รพ./ประกัน | เพิ่ม ARPU, ลด CAC |

---

## 2. โครงสร้างราคา (อิงกำลังซื้อไทย)

**สมมุติฐานกำลังซื้อ:**
- กลุ่มเป้าหมาย Sandwich Gen อายุ 30-50 ปี รายได้ครัวเรือน 35,000-80,000 บาท/เดือน
- ARPU Digital Health ไทยจริง ~42-82 USD/ปี = 1,500-3,000 บาท/ปี
- เทียบ: Netflix ไทย 149-419 บาท/เดือน, Spotify 99 บาท/เดือน (reference point ที่คนไทยรับได้)

| Tier | ราคา | ฟีเจอร์ | เหตุผล |
|------|------|---------|--------|
| **Free** | 0 บาท | ตำแหน่ง GPS (รีเฟรช 30 นาที), SOS ปุ่มเดียว, เช็กอินด้วยตนเอง, สมาชิก 2 คน | เป็น viral loop ให้ครอบครัวดึงกัน |
| **Family Basic** | **99 บาท/เดือน** (990 บาท/ปี) | GPS real-time, geofence 3 จุด, เตือนยา (manual), แจ้งเตือน LINE, สมาชิก 5 คน | จุด sweet spot ไม่แพงกว่า Spotify |
| **Family Plus** | **199 บาท/เดือน** (1,990 บาท/ปี) | ทุกอย่างใน Basic + fall detection (phone-based), รายงานประจำวัน, geofence ไม่จำกัด, สมาชิก 10 คน, export รายงานสุขภาพ | ราคาเดียวกับ YouTube Premium ไทย |
| **B2B2C** (Phase 3) | 50-80 บาท/user/เดือน (bulk) | White-label + รพ./ประกัน bundle | ARPU ต่ำกว่า แต่ CAC = 0 |

**Free vs. Paid Feature Split — หลักการ:**
Free ต้องมีประโยชน์พอที่ครอบครัวใช้จริง แต่ Paid แก้ปัญหา "ความกังวลสูงสุด" (real-time + ยา + fall)

---

## 3. TAM / SAM / SOM ประเมินตลาดไทย

**สมมุติฐานหลัก:**
- ครัวเรือนไทย ~22 ล้านครัวเรือน
- Sandwich Gen (30-50 ปี, มีทั้งลูกและพ่อแม่สูงอายุ) ประมาณ **18-22%** ของครัวเรือน = ~4 ล้านครัวเรือน
- Smartphone penetration กลุ่มนี้ ~85%
- ยินดีจ่ายค่าแอป (WTP > 0): สมมุติ 20% (อิงจาก benchmark SEA app monetization)

| ระดับ | นิยาม | ตัวเลข | มูลค่า/ปี |
|-------|--------|--------|-----------|
| **TAM** | ครัวเรือน Sandwich Gen ทั้งหมดในไทย | 4,000,000 ครัวเรือน | ~8,000 ล้านบาท (@ 2,000 บาท/ปี avg.) |
| **SAM** | มี smartphone + พร้อมใช้ app digital health | 800,000 ครัวเรือน | ~1,600 ล้านบาท |
| **SOM ปีที่ 1** | ทีมเล็ก, ยัง early stage, เน้น BKK + เมืองใหญ่ | 5,000 ครัวเรือน paid | ~7.5-15 ล้านบาท |
| **SOM ปีที่ 3** | ขยายผ่าน LINE + B2B2C | 50,000 ครัวเรือน paid | ~100-150 ล้านบาท |

**ข้อควรระวัง:** SOM ปีที่ 1 ต้องได้ 5,000 paid families ถึงจะมีความหมาย หากได้แค่ 500 ครอบครัว รายได้ยังต่ำกว่า break-even

---

## 4. Unit Economics

### สมมุติฐาน CAC

| ช่องทาง | CAC ประมาณ | หมายเหตุ |
|---------|-----------|---------|
| LINE OA + Facebook organic | 80-150 บาท/install | ต่ำสุด แต่ช้า |
| Facebook/IG paid ads (ไทย) | 200-400 บาท/install | พิสูจน์แล้วใน health category ไทย |
| Referral / family invite | 30-80 บาท/install | ดีที่สุดสำหรับ family app |
| **Blended CAC (install)** | **~150-250 บาท/install** | |
| **Blended CAC (paid user)** | **750-1,500 บาท/paid** | สมมุติ conversion 10-20% free-to-paid |

### LTV และ Payback Period

| เมตริก | ค่าต่ำ | ค่ากลาง | ค่าสูง | สมมุติฐาน |
|--------|--------|---------|--------|-----------|
| ARPU/เดือน | 99 บาท | 140 บาท | 199 บาท | Mix Basic/Plus 70/30 |
| Gross Margin | 70% | 75% | 80% | หักค่า infra, SMS, push |
| Monthly Churn | 5% | 3.5% | 2% | Benchmark family app ไทย |
| Avg. LT (เดือน) | 20 | 29 | 50 | 1/churn |
| **LTV** | **1,386 บาท** | **3,015 บาท** | **7,960 บาท** | ARPU x margin x LT |
| **CAC** | **750 บาท** | **1,125 บาท** | **1,500 บาท** | |
| **LTV:CAC** | **1.8x** | **2.7x** | **5.3x** | เป้าหมาย >3x |
| **Payback Period** | 11 เดือน | 8 เดือน | 6 เดือน | |

**เป้าหมายที่ต้องทำให้ได้:** Scenario กลาง LTV:CAC = 2.7x, Payback 8 เดือน — อยู่ในเกณฑ์พอไปได้แต่ไม่ใช่ดีมาก ต้องกด churn ต่ำกว่า 3%

### โครงสร้างต้นทุน MVP (ทีมเล็ก)

| รายการ | ต้นทุน/เดือน | หมายเหตุ |
|--------|-------------|---------|
| Supabase Pro | 900-2,700 บาท | $25-75/เดือน ที่ scale |
| Expo EAS Build | 650-2,200 บาท | $19-60/เดือน |
| Push notification (Firebase) | ฟรี (ถึง 1M/วัน) | |
| LINE Messaging API | 1,200-3,500 บาท | ถ้าส่ง broadcast |
| SMS (OTP/alert) | 0.5-1.5 บาท/ข้อความ | cost driver ถ้า scale |
| **รวม infra (1,000 users)** | **~5,000-10,000 บาท/เดือน** | |
| **รวม infra (10,000 users)** | **~20,000-40,000 บาท/เดือน** | |

**Cost Driver หลัก:**
1. SMS OTP และ SMS alert (scale ตาม user ชัดเจน — ใช้ LINE แทนได้บางส่วน)
2. Fall detection ถ้า upgrade เป็น wearable-based = ต้นทุนเพิ่ม hardware partner
3. Developer salary/freelance (ถ้าจ้าง outsource ราคา 30,000-80,000 บาท/เดือน/คน)

### จุดคุ้มทุน (Break-Even)

**สมมุติฐาน: Solo dev, infra cost ต่ำ**

| รายการ | ตัวเลข |
|--------|--------|
| Fixed cost/เดือน (infra + เครื่องมือ) | 15,000 บาท |
| ARPU สุทธิหลัง gross margin 75% | 105-149 บาท/user/เดือน |
| **Break-even paid users** | **~100-145 คน** |
| เวลาถึง break-even (ถ้าเติบโต 10-15%/เดือน) | **เดือนที่ 8-12** |

**ถ้าจ้างทีม 2-3 คน (cost 150,000-250,000 บาท/เดือน):**
- Break-even ต้องการ paid users ~1,000-1,700 คน
- เวลาถึง break-even ยืดออกเป็น **เดือนที่ 18-24**

---

## 5. สรุป Go/No-Go เชิงการเงิน

### คำตัดสิน: **GO (แบบ Conditional) — ทำ MVP ได้ แต่มีเงื่อนไขสำคัญ**

**เหตุผลที่ไม่ใช่ No-Go:**
- TAM มีอยู่จริง (4M ครัวเรือน Sandwich Gen)
- Unit economics ที่ scenario กลางยังเป็นบวก (LTV:CAC 2.7x)
- Tech stack ถูกและเร็ว (Expo + Supabase MVP ใน 4-8 สัปดาห์, infra <3,000 บาท/เดือน ช่วงแรก)
- Life360 พิสูจน์ว่า family safety app มี PMF ระดับโลก — แต่ยังไม่มีโมดูลผู้สูงอายุ = ช่องว่างชัดเจน

**เงื่อนไขสำคัญ 3 ข้อที่ต้องผ่านก่อนลงทุนต่อ:**

| # | เงื่อนไข | วิธีวัด | Deadline |
|---|---------|---------|---------|
| 1 | **วัด WTP จริงก่อน build** — สัมภาษณ์ Sandwich Gen 30 ราย ถามราคาที่ยอมจ่าย; ถ้า >50% บอก "จ่ายได้ 99-199 บาท/เดือน" ถือว่าผ่าน | Pre-launch survey + smoke test (landing page + payment link) | ก่อนเขียน code หลัก |
| 2 | **Churn ต้องไม่เกิน 4%/เดือน** — ถ้าเดือน 3-4 หลัง paid launch churn สูงกว่านี้ แปลว่า value proposition ยังไม่แน่น ต้องหยุดและปรับก่อน burn เงินกับ paid acquisition | Monthly cohort retention tracking | เดือนที่ 4-6 |
| 3 | **ห้าม overpromise fall detection** — phone-only fall detection ความแม่นยำจำกัด (~70-80%) ถ้าเปิดฟีเจอร์นี้ใน MVP แล้วผิดพลาด จะเจอ liability + trust damage ที่ฟื้นยาก แนะนำให้ launch ใน Beta เฉพาะ opt-in user ที่เข้าใจข้อจำกัด | Beta flag + disclaimer ชัดเจน | ก่อน public launch |

**ข้อที่ต้องไม่ทำ (เพิ่มเติม):**
- ห้ามลงทุน wearable hardware partnership ก่อนมี 1,000 paid users — เพิ่ม CAC และ complexity โดยไม่จำเป็น
- ห้าม B2B2C pitch โรงพยาบาลก่อนมี track record — ทีม procurement รพ. ต้องการ reference และ compliance ที่ใช้เวลาเตรียม 6-12 เดือน

---

**สรุปตัวเลขที่ต้อง hit ภายใน 12 เดือนเพื่อ justify ลงทุนต่อ:**

| KPI | เป้าหมาย |
|-----|----------|
| Active families (free) | 10,000 |
| Paid families | 1,000 |
| MRR | 100,000-140,000 บาท |
| Churn | < 3.5%/เดือน |
| LTV:CAC | > 2.5x |

ถ้า 12 เดือนแล้วยังไม่ถึง 500 paid families — ให้ pivot หรือ stop ก่อน burn เงินต่อ

---

## Sources

- [Life360 Reports Record Q4 2025 Results](https://investors.life360.com/news-releases/news-release-details/life360-reports-record-q4-2025-results)
- [Life360 Faces Conversion Challenge as Freemium Model Meets Big Tech Resistance](https://www.ainvest.com/news/life360-faces-conversion-challenge-freemium-model-meets-big-tech-resistance-2603/)
- [Thailand Healthcare Consumer Behavior 2025](https://blog.ourgreenfish.com/the-business-mind/thailand-healthcare-consumer-behavior-2025-health-is-the-new-wealth)
- [Digital Health - Thailand | Statista Market Forecast](https://www.statista.com/outlook/dmo/digital-health/thailand)
- [Digital Treatment & Care - Thailand | Market Forecast](https://www.statista.com/outlook/hmo/digital-health/digital-treatment-care/thailand)
- [Thailand's Healthcare and Aging Care Market Opportunities](https://tractus-asia.com/blog/thailand-healthcare-and-aging-care/)
- [Supabase Pricing 2026: Real Costs Exposed](https://www.metacto.com/blogs/the-true-cost-of-supabase-a-comprehensive-guide-to-pricing-integration-and-maintenance)
- [How to Build a React Native Expo App with Supabase and RevenueCat](https://www.buildcamp.io/blogs/how-to-build-a-react-native-expo-app-with-supabase-and-revenuecat)
- [2025 Mobile App Report: LTV, Paywalls & Pricing Benchmarks](https://arpubrothers.com/blog/2025-saas-mobile-apps-trends/)
