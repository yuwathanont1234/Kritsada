# UI/UX Skills — ทีมออกแบบ Luxury Authenticator

> อ้างอิงจาก: [Top 3 UX/UI Redesigns That Make You Design Like a Pro](https://youtu.be/zr37ibqXl1U?si=xbtOJbHWIFrjW_Si) — UXPeak  
> อัปเดต: 2026-06-19

---

## ภาพรวม

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

## Checklist สำหรับทุก Screen ก่อน Handoff

- [ ] ระยะห่างทุกอย่างเป็นทวีคูณของ 8 (8, 16, 24, 32…)
- [ ] มี visual hierarchy ที่ชัดเจน: Heading → Subhead → Body → Caption
- [ ] Primary action (CTA) โดดเด่นกว่า secondary action อย่างเห็นได้ชัด
- [ ] Body text ≥ 16px, contrast ≥ 4.5:1
- [ ] ข้อความรองผ่าน WCAG contrast ≥ 3:1 (ถ้า ≥ 18px)
- [ ] ไม่มี font weight 100–300 บนพื้นหลังสีอ่อน
- [ ] Card padding สม่ำเสมอ (ใช้ค่าเดิมทุกการ์ด)
- [ ] Section spacing ≥ 2× item spacing

---

## เครื่องมือแนะนำ

| เครื่องมือ | วัตถุประสงค์ |
|-----------|------------|
| [Mobbin](https://mobbin.com/) | ดู UI reference จากแอปจริงระดับโลก (กล่าวถึงในวิดีโอ) |
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

---

แหล่งอ้างอิง:
- [Top 3 UX/UI Redesigns That Make You Design Like a Pro — UXPeak](https://www.youtube.com/watch?v=zr37ibqXl1U)
- [Alignment in Design — UXPin](https://www.uxpin.com/studio/blog/alignment-in-design-making-text-and-visuals-more-appealing/)
- [Typography in UX/UI — Supercharge Design](https://supercharge.design/blog/typography-in-ux-ui-a-complete-guide)
