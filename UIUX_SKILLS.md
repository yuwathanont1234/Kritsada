# UI/UX Skills — ทีมออกแบบ Luxury Authenticator

> แหล่งความรู้จาก UXPeak YouTube Channel — อัปเดต: 2026-06-19

แหล่งอ้างอิงวิดีโอ:
1. [Top 3 UX/UI Redesigns That Make You Design Like a Pro](https://youtu.be/zr37ibqXl1U?si=xbtOJbHWIFrjW_Si)
2. [Top 5 Advanced UX/UI Design Tips and Tricks – Part 3](https://youtu.be/Xzh8xjimmp8?si=Q7XCdH9uhOs2sSor)
3. [How to Design a Great Bottom Mobile Navigation Bar – Part 6](https://youtu.be/wLJ40GV2XEc?si=XodxbmUJL0is1P71)

---

## ส่วนที่ 1 — จาก "Top 3 UX/UI Redesigns That Make You Design Like a Pro"

วิดีโอนี้แสดงการ Redesign แอป UI/UX จริง 3 กรณี แบบ Before → After เพื่อสอนหลักการออกแบบที่ทำให้ UI ดูเป็นมืออาชีพ เนื้อหาหลักครอบคลุม 3 ทักษะสำคัญ:

1. **Spacing & Whitespace** — การจัดระยะห่างที่ถูกต้อง
2. **Visual Hierarchy** — ลำดับความสำคัญของข้อมูลผ่านสายตา
3. **Typography & Contrast** — ตัวอักษรและความเปรียบต่างสี

### Case Study — Paywall Redesign (Screen A → Screen B)

> กรณีศึกษาจากวิดีโอ: การ redesign หน้า subscription paywall ของแอปเกม

#### Screen A (Before) — ปัญหาที่พบ

| จุดอ่อน | รายละเอียด |
|--------|-----------|
| ขายฟีเจอร์ ไม่ขาย "ผลลัพธ์" | แสดง features list แต่ผู้ใช้ไม่รู้ว่าทดลองใช้แล้วจะเกิดอะไรขึ้น |
| ไม่มี trial timeline | ผู้ใช้กังวลว่าจะถูกเก็บเงินเมื่อไหร่ ทำให้กด subscribe ไม่ลง |
| CTA กำกวม | "Subscribe and start 7 days for free" — ยาวเกินไป, focus ที่ "Subscribe" (น่ากลัว) |
| ไม่มีวันที่ชัดเจน | ไม่รู้ว่า free trial สิ้นสุดวันไหน ความไม่แน่นอนเพิ่ม anxiety |

#### Screen B (After) — สิ่งที่แก้ไข

| การปรับปรุง | เหตุผล |
|-----------|------|
| เปลี่ยน heading เป็น "How your free trial works" | บอกชัดว่ากำลังอธิบาย trial ไม่ใช่ขาย subscription |
| แสดง Timeline (Today → Day 5 → Day 7) | ผู้ใช้รู้ว่าจะเกิดอะไรขึ้น ลด anxiety เพราะ "ไม่มีอะไรซ่อน" |
| ระบุวันที่ตัดเงินจริง ("03 Mar 2026") | ความโปร่งใส = ความเชื่อถือ |
| CTA: "Start my free trial" | focus ที่ "free" และ "trial" — ไม่น่ากลัว |
| Subtext: "Start in 2 taps, cancel anytime." | ลด friction และตอบคำถามก่อนผู้ใช้จะถาม |

#### บทเรียนสำคัญ: Reduce Anxiety = Increase Conversion

> **"ผู้ใช้ไม่ได้กลัวจ่ายเงิน — พวกเขากลัวเรื่อง surprise charge"**

แทนที่จะขาย features → **ขาย clarity** (ความชัดเจนในสิ่งที่จะเกิดขึ้น)

#### การนำไปใช้กับ MembershipScreen ของ Luxury Authenticator

```tsx
// ✅ แนะนำ — แสดง "What happens next" timeline แทน features list เปล่าๆ

// แทนที่:
<Text>• Unlimited scan</Text>
<Text>• PDF Export</Text>
<Text>• Priority support</Text>

// ใช้:
<TimelineStep
  icon="today"
  title="วันนี้"
  description="สแกนนาฬิกาได้ทันที ไม่จำกัดจำนวน ใช้ Pro ฟรี 7 วัน"
/>
<TimelineStep
  icon="bell"
  title="วันที่ 5"
  description="เราจะส่ง reminder ก่อนสิ้นสุด trial"
/>
<TimelineStep
  icon="calendar"
  title={`วันที่ 7 — ${trialEndDate}`}
  description="ถ้าไม่ยกเลิก จะเริ่มเก็บ ฿1,990/เดือน ยกเลิกได้ทุกเมื่อ"
/>

// CTA:
<Button label="เริ่มทดลองฟรี 7 วัน" />
<Text style={styles.subtext}>ยกเลิกได้ทุกเมื่อ ไม่มีค่าธรรมเนียมซ่อน</Text>
```

---

## ทักษะที่ 1 — Spacing & Whitespace (การจัดระยะห่าง)

### หลักการ
- ใช้ระบบ 8px grid: ระยะห่างทุกอย่างเป็นทวีคูณของ 8 (8, 16, 24, 32, 48, 64)
- Whitespace ไม่ใช่พื้นที่ว่าง แต่คือ "room to breathe" ที่ช่วยให้สายตาโฟกัสได้

### ปัญหาที่พบบ่อย (Before)
- องค์ประกอบชิดกันเกินไป ทำให้อ่านยากและดูรก
- Padding ภายในการ์ดไม่สม่ำเสมอ บางทีซ้าย 12px ขวา 8px
- ระยะห่างระหว่าง section เท่ากับระยะห่างภายใน section (ไม่มี rhythm)

### วิธีแก้ (After)
- Section spacing ควรใหญ่กว่า item spacing เสมอ (เช่น section = 32px, item = 16px)
- ใช้ `padding: 16` หรือ `padding: 24` ภายในการ์ดอย่างสม่ำเสมอทุกที่
- เพิ่ม whitespace รอบ CTA button อย่างน้อย 16px ทุกด้าน

### การใช้งานใน Luxury Authenticator
```tsx
// ✅ ดี — ใช้ spacing token สม่ำเสมอ
const styles = StyleSheet.create({
  card: { padding: 16, marginBottom: 12 },
  section: { marginBottom: 32 },
  buttonWrapper: { paddingHorizontal: 16, paddingVertical: 12 },
});

// ❌ ไม่ดี — spacing แบบ ad-hoc
const styles = StyleSheet.create({
  card: { padding: 13, marginBottom: 9 },
});
```

---

## ทักษะที่ 2 — Visual Hierarchy (ลำดับชั้นภาพ)

### หลักการ
- สายตาผู้ใช้ต้องรู้ทันทีว่า "อะไรสำคัญที่สุดในหน้านี้"
- ใช้ขนาด น้ำหนัก สี และตำแหน่งเพื่อสร้าง F-pattern หรือ Z-pattern ตามธรรมชาติ

### ปัญหาที่พบบ่อย (Before)
- ข้อความหลายบรรทัดใช้ขนาดเดียวกัน ทำให้ทุกอย่างดูเท่าๆ กัน
- ปุ่มหลักและปุ่มรองดูเหมือนกัน (ไม่มี primary vs secondary distinction)
- Icon และ label ไม่มีน้ำหนักต่างกัน

### วิธีแก้ (After)
- กำหนด Typography Scale ที่ชัดเจน:

| Role     | Size | Weight | Color             |
|----------|------|--------|-------------------|
| Heading  | 24px | 700    | `#1A1A1A`         |
| Subhead  | 18px | 600    | `#1A1A1A`         |
| Body     | 16px | 400    | `#333333`         |
| Caption  | 13px | 400    | `#666666`         |
| Label    | 12px | 500    | `#888888`         |

- Primary button: solid fill, strong contrast
- Secondary button: outline หรือ ghost style
- Destructive: สีแดง `#D32F2F`

### การใช้งานใน Luxury Authenticator
```tsx
// ✅ ตัวอย่าง hierarchy ที่ชัดเจนในหน้า ResultScreen
<Text style={styles.heading}>Rolex Daytona</Text>       // H1
<Text style={styles.subhead}>Ref. 116500LN • 2021</Text> // H2
<Text style={styles.body}>ผลการตรวจสอบ: น่าจะแท้</Text> // Body
<Text style={styles.caption}>วิเคราะห์เมื่อ 5 นาทีที่แล้ว</Text> // Caption
```

---

## ทักษะที่ 3 — Typography & Contrast (ตัวอักษรและความเปรียบต่าง)

### หลักการ
- Body text ต้องอย่างน้อย **16px** บนมือถือ (ต่ำกว่านี้อ่านยากบนหน้าจอเล็ก)
- Contrast ratio ต้องผ่านมาตรฐาน WCAG 2.1:
  - Normal text (< 18px): **4.5:1** ขึ้นไป
  - Large text (≥ 18px หรือ Bold ≥ 14px): **3:1** ขึ้นไป
- หลีกเลี่ยง font weight 300 (thin) บนพื้นหลังสีอ่อน

### ปัญหาที่พบบ่อย (Before)
- ใช้สีเทาอ่อน `#BBBBBB` บนพื้นขาว → contrast เพียง 1.6:1 (ไม่ผ่าน WCAG)
- ใช้ font size 13px สำหรับ body text → อ่านยากบน phone จริง
- Line height ต่ำเกินไป (1.0) ทำให้บรรทัดชิดกัน

### วิธีแก้ (After)
- เปลี่ยนสีข้อความรอง เป็น `#666666` (contrast 5.7:1 ✅)
- Body ขั้นต่ำ 16px, line height 1.5
- Heading ใช้ `fontWeight: '700'` ให้ชัดเจน

### Color Palette แนะนำ (Light Mode)

| ประเภท          | Hex       | Contrast บน #FFF |
|----------------|-----------|-----------------|
| Primary text   | `#1A1A1A` | 17.8:1 ✅        |
| Secondary text | `#555555` | 7.4:1 ✅         |
| Muted text     | `#888888` | 3.5:1 ⚠️ (ใช้กับ large text เท่านั้น) |
| Disabled text  | `#AAAAAA` | 2.3:1 ❌ (ไม่ควรมีเนื้อหาสำคัญ) |
| Brand Gold     | `#B8860B` | 4.7:1 ✅         |
| Error Red      | `#D32F2F` | 5.9:1 ✅         |

---

---

## ส่วนที่ 2 — จาก "Top 5 Advanced UX/UI Design Tips – Part 3"

วิดีโอนี้สอน 5 เทคนิคขั้นสูง เน้นการลด Cognitive Load และช่วยให้ผู้ใช้หาข้อมูลได้เร็วขึ้น

### ทักษะที่ 4 — Prioritize Important Information (โดดเด่นสิ่งสำคัญ)

**หลักการ:** ใช้ สี ขนาด ตำแหน่ง และ contrast เพื่อดึงสายตาไปยังค่าที่สำคัญที่สุดก่อน

**ปัญหาที่พบบ่อย (Before):**
- แสดง label ของ metric ("ราคาตลาด", "ความน่าเชื่อถือ") โดดเด่นกว่าตัวเลขจริง
- ข้อมูลสำคัญอยู่ปะปนกับข้อมูลรอง ไม่มีน้ำหนักต่างกัน

**วิธีแก้ (After):**
- แสดงตัวเลข/ค่าหลักให้ใหญ่และเข้มกว่า label เสมอ
- ใช้ขนาดที่ต่างกันอย่างชัดเจน เช่น ค่า = 32px Bold, label = 12px Regular

**การใช้งานใน Luxury Authenticator:**
```tsx
// ✅ ผลการตรวจสอบ: ตัวเลข confidence โดดเด่น
<Text style={{ fontSize: 48, fontWeight: '700', color: '#1A1A1A' }}>97%</Text>
<Text style={{ fontSize: 12, fontWeight: '400', color: '#888888' }}>ความน่าเชื่อถือ</Text>

// ✅ ราคาตลาด: ราคาใหญ่กว่า label
<Text style={{ fontSize: 28, fontWeight: '700' }}>฿1,250,000</Text>
<Text style={{ fontSize: 12, color: '#888888' }}>ราคาตลาดปัจจุบัน</Text>
```

---

### ทักษะที่ 5 — Expose Content Early (แสดงคุณค่าทันที)

**หลักการ:** แทนที่จะซ่อนเนื้อหาหลังแบนเนอร์หรือ CTA ให้แสดงรายการ/ผลลัพธ์ที่ผู้ใช้สนใจทันทีที่เปิดแอป

**ทำไมถึงสำคัญ:**
- ลด friction — ผู้ใช้ไม่ต้องกด tap ซ้ำเพื่อดูสิ่งที่ต้องการ
- เพิ่ม perceived value — แอปดูมีประโยชน์ตั้งแต่วินาทีแรก
- ลด bounce rate — ผู้ใช้ไม่ออกจากแอปเพราะ "ไม่รู้ว่าแอปทำอะไร"

**การใช้งานใน Luxury Authenticator:**
- HomeScreen ควรแสดง collection ล่าสุดหรือผลการ scan ล่าสุดทันที แทนที่จะแสดงแค่ปุ่ม "เริ่มสแกน"
- แสดง 2-3 รายการ collection ของผู้ใช้บน home แทนการซ่อนทั้งหมดไว้ใน tab "Portfolio"

---

### ทักษะที่ 6 — Match Field Design to Input Type (ออกแบบ Input ให้ตรงประเภทข้อมูล)

**หลักการ:** รูปแบบ input field ต้องสอดคล้องกับประเภทของข้อมูลที่ผู้ใช้จะกรอก

| ประเภทข้อมูล | การออกแบบที่เหมาะสม |
|------------|-------------------|
| เลข Serial (8-12 ตัว) | Field กว้าง, keyboard number pad |
| OTP / PIN 6 หลัก | 6 กล่องแยก (separated boxes) |
| ชื่อนาฬิกา | Field กว้างปกติ, keyboard text |
| ราคา (ตัวเลข) | Field กว้างปานกลาง, currency prefix, number keyboard |
| หมายเหตุ (multiline) | TextArea สูง 3-4 บรรทัด |

**ตัวอย่างที่ควรหลีกเลี่ยง:**
- ใช้ field ขนาดเต็มสำหรับ PIN 4 ตัว → ดูไม่ proportional
- ใช้ keyboard ตัวอักษรสำหรับกรอก serial number → ผู้ใช้ต้องสลับ keyboard

---

### ทักษะที่ 7 — Button Order & Icon Consistency (ลำดับปุ่มและความสม่ำเสมอของ Icon)

**หลักการปุ่ม:**
- ผู้ใช้อ่านซ้าย → ขวา: วาง **ปุ่มยกเลิก (secondary) ทางซ้าย** และ **ปุ่มยืนยัน (primary) ทางขวา** เสมอ
- ปุ่ม primary ต้องมี visual weight หนักกว่า secondary เสมอ (filled vs. outline)

```tsx
// ✅ ลำดับที่ถูกต้อง
<View style={{ flexDirection: 'row', gap: 12 }}>
  <Button variant="outline" label="ยกเลิก" onPress={onCancel} />   // ซ้าย
  <Button variant="filled" label="บันทึก" onPress={onConfirm} />   // ขวา
</View>
```

**หลักการ Icon:**
- ใช้ icon style เดียวกันทั้งแอป (เช่น Outlined ทั้งหมด หรือ Filled ทั้งหมด — ห้ามผสม)
- Active state เท่านั้นที่เปลี่ยนจาก Outlined → Filled (หรือเปลี่ยนสี)
- ความซับซ้อนของ icon ต้องใกล้เคียงกันทั้ง set (อย่าใช้ icon เรียบง่ายปนกับ icon ซับซ้อน)

---

## ส่วนที่ 3 — จาก "How to Design a Great Bottom Mobile Navigation Bar – Part 6"

วิดีโอนี้เจาะลึกการออกแบบ Bottom Tab Bar ซึ่งเป็น UI component ที่ผู้ใช้โต้ตอบมากที่สุดในแอป

### ทักษะที่ 8 — Bottom Navigation Bar Specs

#### ขนาดมาตรฐาน

| องค์ประกอบ | ขนาดแนะนำ |
|-----------|----------|
| Icon | **24px** (สมดุลระหว่างชัดเจนและไม่ใหญ่เกินไป) |
| Label | **10–12px** |
| Tap area (touch target) | **≥ 44×44px** (มาตรฐาน Apple HIG) |
| Home Indicator (iOS) | ~34px (ต้องมี safe area padding) |
| Tab bar height | ~49px + safe area |

#### จำนวน Tab

- **3–5 tabs เท่านั้น** — เลือกเฉพาะ core functions ของแอป
- น้อยกว่า 3: ใช้ other navigation pattern แทน (hamburger, drawer)
- มากกว่า 5: ผู้ใช้ล้นหลาม, หาของไม่เจอ

#### Active State — ต้องมีอย่างน้อย 2 การเปลี่ยนแปลง

| # | การเปลี่ยนแปลง | ตัวอย่าง |
|---|------------|--------|
| 1 | เปลี่ยนสี | สีเทา → สีทอง (Brand Gold) |
| 2 | เปลี่ยน style | Outlined → Filled icon |
| 3 (optional) | เปลี่ยน label weight | Regular → SemiBold |

#### การใช้งานใน Luxury Authenticator
```tsx
// ✅ Tab bar ที่ถูกต้อง — แยก safe area, icon 24px, label 11px
<Tab.Navigator
  screenOptions={({ route }) => ({
    tabBarIcon: ({ focused, color }) => {
      const iconName = focused ? `${route.name}-filled` : route.name;
      return <Icon name={iconName} size={24} color={color} />;
    },
    tabBarActiveTintColor: '#B8860B',   // Brand Gold
    tabBarInactiveTintColor: '#888888',
    tabBarLabelStyle: { fontSize: 11, fontWeight: focused ? '600' : '400' },
    tabBarStyle: { paddingBottom: insets.bottom, height: 49 + insets.bottom },
  })}
>
  <Tab.Screen name="home" options={{ title: 'หน้าหลัก' }} />
  <Tab.Screen name="scan" options={{ title: 'สแกน' }} />
  <Tab.Screen name="portfolio" options={{ title: 'คอลเลคชัน' }} />
  <Tab.Screen name="learn" options={{ title: 'เรียนรู้' }} />
  <Tab.Screen name="profile" options={{ title: 'โปรไฟล์' }} />
</Tab.Navigator>
```

#### Notification Badge — ใช้อย่างประหยัด
- ใช้เฉพาะ action ที่ต้องการ attention จริงๆ (เช่น มีข้อความใหม่)
- **ห้ามใช้ badge กับทุก tab** — ผู้ใช้จะ "ชา" และเพิกเฉยทั้งหมด
- Badge สีแดง: เหตุการณ์เร่งด่วน / Badge สีเทา: ข้อมูลอ้างอิง

---

## Checklist สำหรับทุก Screen ก่อน Handoff

**Spacing & Layout**
- [ ] ระยะห่างทุกอย่างเป็นทวีคูณของ 8 (8, 16, 24, 32…)
- [ ] Card padding สม่ำเสมอ (ใช้ค่าเดิมทุกการ์ด)
- [ ] Section spacing ≥ 2× item spacing

**Typography & Contrast**
- [ ] มี visual hierarchy ที่ชัดเจน: Heading → Subhead → Body → Caption
- [ ] Body text ≥ 16px, contrast ≥ 4.5:1
- [ ] ข้อความรองผ่าน WCAG contrast ≥ 3:1 (ถ้า ≥ 18px)
- [ ] ไม่มี font weight 100–300 บนพื้นหลังสีอ่อน

**Visual Priority**
- [ ] ค่า/ตัวเลขสำคัญโดดเด่นกว่า label (ขนาดใหญ่กว่า, weight มากกว่า)
- [ ] Primary action (CTA) โดดเด่นกว่า secondary action อย่างเห็นได้ชัด
- [ ] ลำดับปุ่ม: Cancel ซ้าย, Confirm ขวา
- [ ] Icon style สม่ำเสมอทั้งแอป (ไม่ผสม style)

**Input Fields**
- [ ] ขนาด field สอดคล้องกับประเภทข้อมูล (Serial, OTP, ชื่อ, ราคา)
- [ ] Keyboard type ตรงกับประเภทข้อมูล

**Bottom Navigation (ถ้ามี)**
- [ ] Tab จำนวน 3–5 เท่านั้น
- [ ] Icon size 24px, Label 10–12px
- [ ] Touch target ≥ 44×44px
- [ ] Safe area padding ถูกต้องบน iOS (home indicator)
- [ ] Active state เปลี่ยนอย่างน้อย 2 จุด (สี + style)
- [ ] Notification badge ใช้เฉพาะเมื่อจำเป็นจริงๆ

---

## เครื่องมือแนะนำ

| เครื่องมือ | วัตถุประสงค์ |
|-----------|------------|
| [Mobbin](https://mobbin.com/) | ดู UI reference จากแอปจริงระดับโลก |
| [uxpeak+](https://www.uxpeak.com/) | คอร์ส UI/UX redesign แบบ before/after |
| Figma Contrast Plugin | เช็ค contrast ratio ขณะออกแบบ |
| [WebAIM Contrast Checker](https://webaim.org/resources/contrastchecker/) | ตรวจ WCAG compliance |

---

## บริบทเฉพาะของ Luxury Authenticator

เนื่องจากแอปนี้เน้น **ความน่าเชื่อถือ** และ **ความหรูหรา** สำหรับผู้ใช้ที่ซื้อขายนาฬิกาและกระเป๋าราคาสูง:

- ใช้ **spacing เยอะ** — ความโล่งบ่งบอก luxury ไม่ใช่ความถี่ขององค์ประกอบ
- **Typography weight 600–700** สำหรับชื่อแบรนด์/รุ่น — แสดงถึงความชัดเจนและน่าเชื่อถือ
- **Color palette เย็น/neutral** (ไม่ใช่สีสดใส) — ดู premium และมืออาชีพ
- Verdict badge (แท้/ปลอม) ต้องมี contrast สูงสุด — ข้อมูลนี้คือ core value ของแอป
- **Confidence % (เช่น 97%)** ต้องแสดงด้วย font ใหญ่สุดในหน้า — ใช้ Tip ทักษะที่ 4
- **Bottom tab** ควรมี 4–5 tabs: หน้าหลัก / สแกน / คอลเลคชัน / เรียนรู้ / โปรไฟล์

---

## ส่วนที่ 4 — ความรู้จากคลัง eBooks (Reference Library Applied)

> สกัดจากหนังสือใน [justinhartman/ui-ux-design-library](https://github.com/justinhartman/ui-ux-design-library) มาเป็น actionable skills

---

### ทักษะที่ 9 — Card UI Design (จาก Mobile Card Interfaces)

#### หลักการออกแบบ Card

Cards = containers ที่รวม 1 concept ต่อ 1 card เสมอ — ห้ามใส่เนื้อหาหลายหัวข้อในการ์ดเดียว

**โครงสร้าง Card ที่ดี:**

```
┌──────────────────────────────┐
│  [Image / Hero Area]         │  ← Media (optional, 16:9 หรือ 4:3)
│──────────────────────────────│
│  Header Text       (18px 700)│  ← ชื่อหลัก
│  Subheading        (14px 400)│  ← ข้อมูลรอง
│                              │
│  Body text max 3 lines ~100  │  ← Supporting text (ไม่เกิน 100 ตัวอักษร)
│  characters                  │
│──────────────────────────────│
│  [Secondary]  [PRIMARY CTA]  │  ← Actions: secondary ซ้าย, primary ขวา
└──────────────────────────────┘
```

**Spacing & Visual Rules:**

| Element | ค่าแนะนำ |
|---------|---------|
| Padding ภายใน card | 16px ทุกด้าน |
| Border radius | 12–16px (soft, modern) |
| Shadow | `elevation: 2` (Android) / `shadowOffset: {0,2}, shadowOpacity: 0.1` (iOS) |
| Gap ระหว่าง card | 12px |
| Image ratio | 16:9 หรือ 4:3 (crop consistent) |

**Dos & Don'ts:**

| ✅ ทำ | ❌ อย่าทำ |
|------|---------|
| 1 concept ต่อ 1 card | ใส่เนื้อหาหลายหัวข้อในการ์ดเดียว |
| Text ≤ 3 บรรทัด / ~100 ตัวอักษร | ข้อความยาวจนล้น card |
| Primary filled + Secondary outline | ปุ่มทั้งคู่ใช้ style เดียวกัน |
| Swipe gesture 1 ทิศทางต่อ card | Swipe หลายทิศทางในการ์ดเดียว |
| รักษา hierarchy: Header → Sub → Body | ขนาดข้อความเท่ากันทุก level |

**การใช้งานใน Luxury Authenticator — Collection Card:**
```tsx
// ✅ Watch collection card ที่ถูกต้อง
<TouchableOpacity style={styles.card}>
  <Image style={styles.cardImage} source={...} />   {/* 16:9 ratio */}
  <View style={styles.cardBody}>
    <Text style={styles.cardTitle}>Rolex Daytona</Text>       {/* 18px 700 */}
    <Text style={styles.cardSub}>Ref. 116500LN • 2021</Text>  {/* 14px 400 */}
    <Text style={styles.cardMeta} numberOfLines={2}>          {/* ≤ 2 บรรทัด */}
      ผลตรวจ: แท้ • สแกนเมื่อ 3 วันที่แล้ว
    </Text>
  </View>
</TouchableOpacity>

const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  cardImage: { width: '100%', aspectRatio: 16/9, borderRadius: 8 },
  cardTitle: { fontSize: 18, fontWeight: '700', color: '#1A1A1A', marginTop: 12 },
  cardSub: { fontSize: 14, fontWeight: '400', color: '#555555', marginTop: 4 },
  cardMeta: { fontSize: 13, color: '#888888', marginTop: 8, lineHeight: 18 },
});
```

---

### ทักษะที่ 10 — Mobile Typography System (จาก Meaningful Mobile Typography)

#### Type Scale มาตรฐาน (สำหรับ React Native)

| Role | Size | Line Height | Weight | Letter Spacing | Use Case |
|------|------|-------------|--------|---------------|---------|
| Display | 32px | 40px (1.25) | 700 | -0.5px | Confidence %, ราคา |
| H1 | 24px | 32px (1.33) | 700 | -0.3px | ชื่อแบรนด์/รุ่นใน Result |
| H2 | 20px | 28px (1.4) | 600 | 0 | Section header |
| Body | 16px | 24px (1.5) | 400 | 0 | เนื้อหาทั่วไป (ขั้นต่ำ!) |
| Body SM | 14px | 22px (1.57) | 400 | 0 | รายละเอียดรอง |
| Caption | 12px | 18px (1.5) | 400 | +0.2px | Timestamp, badge label |
| Label | 11px | 16px (1.45) | 500 | +0.3px | Tab label, badge |

> **กฎ:** Body text ต้องไม่ต่ำกว่า **16px** — ต่ำกว่านี้อ่านยากบน iPhone SE / Android compact

#### Line Length (Characters per Line)

| หน้าจอ | ความยาวบรรทัดที่เหมาะสม |
|-------|----------------------|
| มือถือ < 375px | 35–40 ตัวอักษร |
| มือถือ 375–430px | 40–45 ตัวอักษร |
| Tablet | ไม่เกิน 75 ตัวอักษร |

#### Font Pairing แนะนำสำหรับ Luxury App
```
Heading: System font bold (SF Pro Display / Roboto Bold)
Body: System font regular (SF Pro Text / Roboto Regular)
```
ใช้ system font ก่อน — เร็ว, อ่านง่าย, ไม่ต้อง load เพิ่ม

#### Letter Spacing
- **Bold / Heavy (700+):** `-0.3` ถึง `-0.5px` — ช่วยให้ heading ดู cohesive
- **Regular body:** `0` — อย่าแตะ
- **Caption / Label เล็ก:** `+0.2` ถึง `+0.4px` — ช่วยอ่านง่ายขึ้น

---

### ทักษะที่ 11 — Interaction Design: 5 Dimensions (จาก About Face + IxD Best Practices)

#### The 5 Dimensions of IxD

| Dimension | คืออะไร | ตัวอย่างใน Luxury Authenticator |
|-----------|---------|-------------------------------|
| **1D Words** | Text บน UI: button labels, error messages, instructions | "เริ่มสแกน" แทน "Scan" / "ผล: น่าจะแท้" แทน "Authentic: True" |
| **2D Visuals** | Icons, typography, layout, สี | Verdict badge สีเขียว/แดง, confidence ring, heatmap overlay |
| **3D Space** | Physical device + ท่าทาง interact (tap, swipe, pinch) | Shutter button ขนาด 72px ให้กด thumb ได้ง่าย |
| **4D Time** | Animation, transition, loading states | Scan animation ≤ 300ms, skeleton screen ขณะ AI คำนวณ |
| **5D Behavior** | ระบบตอบสนองต่อ action อย่างไร | Toast "บันทึกแล้ว" หลังกด save, error state เมื่อ scan ล้มเหลว |

#### Micro-copy (Words) Best Practices

```
ปุ่ม CTA: กริยา + noun สั้นๆ
  ✅ "สแกนนาฬิกา"     ❌ "คลิกเพื่อเริ่มต้นการสแกน"
  ✅ "บันทึกผล"        ❌ "บันทึกผลการตรวจสอบนี้"
  ✅ "ดูคอลเลคชัน"     ❌ "ไปที่หน้าคอลเลคชันของฉัน"

Error message: ระบุปัญหา + วิธีแก้
  ✅ "ภาพไม่ชัดพอ — ลองถ่ายใหม่ในที่มีแสงสว่าง"
  ❌ "เกิดข้อผิดพลาด กรุณาลองใหม่"

Empty state: อธิบาย + CTA
  ✅ "ยังไม่มีรายการ — เริ่มสแกนนาฬิกาเรือนแรกของคุณ"
  ❌ "ไม่มีข้อมูล"
```

---

### ทักษะที่ 12 — Microinteractions & Delight (จาก Demystifying Delightful Interaction Design)

#### Framework: Trigger → Rules → Feedback → Loops

```
Trigger:  ผู้ใช้กดปุ่ม Shutter
Rules:    ถ่ายภาพ → ส่ง AI → รอ response
Feedback: ภาพ flash ขาว → ripple effect → skeleton loading
Loops:    ถ้า AI ล้มเหลว → แสดง error + retry button
```

#### Animation Timing Guidelines

| ประเภท | Duration | Easing | ตัวอย่าง |
|--------|---------|--------|--------|
| Instant feedback (tap) | 100–150ms | ease-out | ripple บนปุ่ม |
| State transition | 200–300ms | ease-in-out | modal slide up |
| Complex transition | 300–500ms | spring | scan result reveal |
| Loading / progress | — | linear | progress bar |
| ห้ามเกิน | 500ms | — | ทุก interaction ที่ user trigger |

> **กฎทอง:** Animation ที่ดีที่สุดคือ "animation ที่ผู้ใช้ไม่รู้สึกว่ามี" — ทำให้ transition รู้สึก natural

#### Haptic Feedback (React Native)

```tsx
import * as Haptics from 'expo-haptics';

// ✅ ใช้ให้ถูกประเภท
Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);   // tap บนปุ่มทั่วไป
Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);  // confirm action
Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);   // destructive action
Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); // scan สำเร็จ ✅
Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);   // scan ล้มเหลว ❌
Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); // quota ใกล้เต็ม ⚠️
```

#### Delight Moments ที่ควรมีใน Luxury Authenticator

| จุด | Microinteraction |
|-----|----------------|
| Scan สำเร็จ — ผลแท้ | ✅ checkmark animation + Success haptic + สีเขียว pulse |
| Scan สำเร็จ — ผลปลอม | ❌ X animation + Error haptic + สีแดง pulse |
| บันทึกลง Collection | 📌 bookmark fill animation + Light haptic |
| Upgrade tier สำเร็จ | 🎉 confetti / sparkle animation + Success haptic |
| ลบรายการ (swipe) | trash icon reveals progressively + Warning haptic ก่อน confirm |

#### Skeleton Screen (แทน Spinner)

```tsx
// ✅ ใช้ skeleton แทน spinner เมื่อรอ AI result
// Skeleton: แสดงโครงสร้างของ content ที่กำลังจะมา
const SkeletonCard = () => (
  <View style={styles.card}>
    <Animated.View style={[styles.skeletonImage, pulseAnim]} />
    <View style={styles.cardBody}>
      <Animated.View style={[styles.skeletonLine, { width: '70%' }, pulseAnim]} />
      <Animated.View style={[styles.skeletonLine, { width: '50%' }, pulseAnim]} />
    </View>
  </View>
);
// ❌ อย่าแสดงแค่ <ActivityIndicator /> กลางหน้าจอ
```

---

### ทักษะที่ 13 — Progressive Disclosure & Adaptive UI (จาก Mobile UI Design Patterns)

#### Progressive Disclosure

**หลักการ:** แสดงเฉพาะข้อมูลที่จำเป็น ณ ขณะนั้น — ซ่อนความซับซ้อนไว้ก่อน

```
Level 1 (ทุกคนเห็น):   ผลการตรวจ + ราคาตลาด + ปุ่ม "บันทึก"
Level 2 (กด "ดูเพิ่ม"): Spec Sheet, Serial, Year, Movement type
Level 3 (Pro/Premium):  Heatmap overlay, AI Q&A, PDF export
```

**ทำไมสำคัญสำหรับ Luxury Authenticator:**
- ผู้ใช้ใหม่ไม่ถูก overwhelm ด้วย technical specs
- ผู้ใช้ Pro เห็น advanced features ใน context ที่เหมาะสม
- Paywall gate ปรากฏ "เมื่อผู้ใช้อยากใช้จริงๆ" ไม่ใช่แสดงตั้งแต่แรก

#### Adaptive UI

| Condition | การปรับ UI |
|-----------|-----------|
| ไม่มี internet | แสดง offline badge + ปุ่ม "ใช้ผลเดิมจาก cache" |
| Quota ใกล้เต็ม (80%) | แสดง subtle warning bar ใต้ header |
| Quota เต็มแล้ว | Shutter button disabled + tooltip "อัปเกรดเพื่อสแกนต่อ" |
| Dark mode | ปรับ shadow เป็น lighter หรือ border แทน |
| iOS safe area | paddingBottom = insets.bottom บน tab bar + bottom sheets |

#### Thumb Zone — ตำแหน่ง interactive elements

```
┌──────────────────┐
│  ❌ Hard Reach   │  ← ห้ามใส่ action สำคัญ (มุมบน)
│                  │
│  ⚠️ OK w/ Stretch│  ← secondary actions ได้
│                  │
│  ✅ Easy Reach   │  ← Primary CTA, scan button, bottom tab
└──────────────────┘
```
- Primary CTA (เช่น "สแกน") ต้องอยู่ใน lower 40% ของหน้าจอ
- Touch target ≥ **44×44pt** (iOS) / **48×48dp** (Android) ทุก element

---

## ส่วนที่ 5 — คลังหนังสือ UI/UX ฟรี (Reference Library)

> Repository: [justinhartman/ui-ux-design-library](https://github.com/justinhartman/ui-ux-design-library)  
> ⭐ 569 stars — คอลเลกชัน eBooks & PDFs ฟรีกว่า 80+ เล่ม จัดหมวดหมู่ครบ 12 หมวด

### หมวดที่เกี่ยวข้องกับ Luxury Authenticator มากที่สุด

#### 📱 Mobile Design — ตรงประเด็นที่สุด (React Native App)

| ชื่อหนังสือ | ประโยชน์ |
|-----------|--------|
| Mobile UI Design Patterns — A Deeper Look At The Hottest Apps Today | Pattern library สำหรับ mobile UI components |
| Guide to Mobile UX Research | วิธีทำ user research บนมือถือ |
| Mobile Card Interfaces | การออกแบบ card-based UI (เหมาะกับหน้า scan result) |
| Push Notification Best Practices | การออกแบบ notification ที่ไม่รบกวนผู้ใช้ |
| Flat Mobile Design Evolved | แนวทาง flat design บน mobile ยุคใหม่ |
| Mobile Design Book of Trends | ภาพรวม mobile design trends |

#### 🔤 Typography

| ชื่อหนังสือ | ประโยชน์ |
|-----------|--------|
| Mobile UI Trends — Meaningful Mobile Typography | Typography สำหรับหน้าจอมือถือโดยเฉพาะ (อ่านก่อนปรับ font scale) |
| Web UI Trends — Dramatic Typography | ใช้ Typography เพื่อสร้าง visual impact |

#### 🎯 Interaction Design

| ชื่อหนังสือ | ประโยชน์ |
|-----------|--------|
| About Face Ed. 4 — The Essentials of Interaction Design | หนังสือ interaction design ฉบับสมบูรณ์ (ต้องอ่าน) |
| Interaction Design Best Practices — Mastering Words, Visuals, Space | Micro-copy, spacing, และ visual balance |
| Interaction Design Best Practices — Mastering Time, Responsiveness, Behavior | Animation timing, loading states, error states |
| Demystifying Delightful Interaction Design | สร้าง delight moments ในแอป (เช่น scan success animation) |
| The 5 Building Blocks of Interaction Design | Framework พื้นฐาน interaction |

#### 🧪 Usability Testing

| ชื่อหนังสือ | ประโยชน์ |
|-----------|--------|
| Complete Guide to User Testing | วิธีทำ usability testing ตั้งแต่ต้น |
| Lessons Learned from Watching 200,000 User Testing Videos | Insights จากการดู user test จำนวนมาก |
| Practical User Research For Enterprise UX | Research methodology สำหรับ product team |

#### 🎨 Style Guides

| ชื่อหนังสือ | ประโยชน์ |
|-----------|--------|
| Style Guides: An Overview For Modern Designers | เริ่มต้นสร้าง design system |
| The Critical Components Of Web UI Style Guides | Components ที่ต้องมีใน style guide |

#### 📚 Introductory (สำหรับทีมที่เพิ่งเริ่ม)

| ชื่อหนังสือ | ประโยชน์ |
|-----------|--------|
| The Elements of User Experience | หนังสือคลาสสิก Jesse James Garrett — พื้นฐาน UX ที่ทุกคนต้องรู้ |
| Field Guide to Human-Centered Design | กระบวนการ design thinking แบบ IDEO |
| UX Design for Startups | UX สำหรับทีมเล็ก (ตรงกับ context solo founder) |
| Pixel Perfect Precision | คู่มือ precision design จาก ustwo |
| Introduction to Good Usability | Usability basics สำหรับมือใหม่ |

### วิธีเข้าถึง eBooks

1. ไปที่ [github.com/justinhartman/ui-ux-design-library](https://github.com/justinhartman/ui-ux-design-library)
2. คลิกโฟลเดอร์หมวดหมู่ที่ต้องการ
3. ดาวน์โหลด PDF ได้ฟรีทันที

### ลำดับการอ่านแนะนำสำหรับทีม Luxury Authenticator

```
สัปดาห์ 1 (พื้นฐาน):
  ├── The Elements of User Experience
  └── Introduction to Good Usability

สัปดาห์ 2 (Mobile):
  ├── Mobile UI Design Patterns
  ├── Mobile Card Interfaces
  └── Mobile UI Trends — Meaningful Mobile Typography

สัปดาห์ 3 (Interaction):
  ├── Interaction Design Best Practices — Mastering Words, Visuals, Space
  └── Demystifying Delightful Interaction Design

สัปดาห์ 4 (Paywall & Growth):
  └── Field Guide to Human-Centered Design
```

---

## เครื่องมือแนะนำ

| เครื่องมือ | วัตถุประสงค์ |
|-----------|------------|
| [Mobbin](https://mobbin.com/) | ดู UI reference จากแอปจริงระดับโลก |
| [uxpeak+](https://www.uxpeak.com/) | คอร์ส UI/UX redesign แบบ before/after |
| [UI/UX Design Library](https://github.com/justinhartman/ui-ux-design-library) | คลัง eBooks & PDFs ฟรี 80+ เล่ม |
| Figma Contrast Plugin | เช็ค contrast ratio ขณะออกแบบ |
| [WebAIM Contrast Checker](https://webaim.org/resources/contrastchecker/) | ตรวจ WCAG compliance |

---

## บริบทเฉพาะของ Luxury Authenticator

เนื่องจากแอปนี้เน้น **ความน่าเชื่อถือ** และ **ความหรูหรา** สำหรับผู้ใช้ที่ซื้อขายนาฬิกาและกระเป๋าราคาสูง:

- ใช้ **spacing เยอะ** — ความโล่งบ่งบอก luxury ไม่ใช่ความถี่ขององค์ประกอบ
- **Typography weight 600–700** สำหรับชื่อแบรนด์/รุ่น — แสดงถึงความชัดเจนและน่าเชื่อถือ
- **Color palette เย็น/neutral** (ไม่ใช่สีสดใส) — ดู premium และมืออาชีพ
- Verdict badge (แท้/ปลอม) ต้องมี contrast สูงสุด — ข้อมูลนี้คือ core value ของแอป
- **Confidence % (เช่น 97%)** ต้องแสดงด้วย font ใหญ่สุดในหน้า — ใช้ Tip ทักษะที่ 4
- **Bottom tab** ควรมี 4–5 tabs: หน้าหลัก / สแกน / คอลเลคชัน / เรียนรู้ / โปรไฟล์

---

แหล่งอ้างอิง:
- [Top 3 UX/UI Redesigns That Make You Design Like a Pro — UXPeak](https://www.youtube.com/watch?v=zr37ibqXl1U)
- [Top 5 Advanced UX/UI Design Tips – Part 3 — UXPeak](https://www.youtube.com/watch?v=Xzh8xjimmp8)
- [How to Design a Great Bottom Mobile Navigation Bar – Part 6 — UXPeak](https://www.youtube.com/watch?v=wLJ40GV2XEc)
- [Bottom Navigation Bar Design Tips — UXPeak on Medium](https://medium.com/@uxpeak.com/top-ui-ux-design-tips-how-to-design-a-great-bottom-mobile-navigation-bar-part-6-97acd8b28453)
- [UI/UX Design Library — justinhartman/ui-ux-design-library](https://github.com/justinhartman/ui-ux-design-library)
- [Alignment in Design — UXPin](https://www.uxpin.com/studio/blog/alignment-in-design-making-text-and-visuals-more-appealing/)
- [Typography in UX/UI — Supercharge Design](https://supercharge.design/blog/typography-in-ux-ui-a-complete-guide)
