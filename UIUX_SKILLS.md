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

แหล่งอ้างอิง:
- [Top 3 UX/UI Redesigns That Make You Design Like a Pro — UXPeak](https://www.youtube.com/watch?v=zr37ibqXl1U)
- [Top 5 Advanced UX/UI Design Tips – Part 3 — UXPeak](https://www.youtube.com/watch?v=Xzh8xjimmp8)
- [How to Design a Great Bottom Mobile Navigation Bar – Part 6 — UXPeak](https://www.youtube.com/watch?v=wLJ40GV2XEc)
- [Bottom Navigation Bar Design Tips — UXPeak on Medium](https://medium.com/@uxpeak.com/top-ui-ux-design-tips-how-to-design-a-great-bottom-mobile-navigation-bar-part-6-97acd8b28453)
- [Alignment in Design — UXPin](https://www.uxpin.com/studio/blog/alignment-in-design-making-text-and-visuals-more-appealing/)
- [Typography in UX/UI — Supercharge Design](https://supercharge.design/blog/typography-in-ux-ui-a-complete-guide)
