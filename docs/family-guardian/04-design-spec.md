# Family Guardian — Design Spec ฉบับสมบูรณ์
## ทิศทาง A "อบอุ่น-ครอบครัวไทย"

จัดทำโดย มุก — AI Solution UI/UX

---

## PHASE 0 — Design Tokens (ยึดทุกหน้า)

```
COLOR TOKENS
─────────────────────────────────────────
color-primary          #2E7D52   (เขียวมรกต — trust, nature, ไทย)
color-primary-light    #4CAF50   (hover / active state)
color-primary-subtle   #E8F5E9   (background tint บนการ์ด)

color-accent           #FF8C42   (ส้ม — CTA, badge, warmth)
color-accent-light     #FFE0CC   (tint)

color-bg               #FFF8F0   (ครีมนวล — screen background)
color-surface          #FFFFFF   (การ์ด, modal)
color-surface-warm     #FFF3E8   (การ์ดอ่อน สำหรับ elder section)

color-alert-red        #D32F2F   (ฉุกเฉิน tier 1)
color-alert-red-bg     #FFEBEE
color-alert-orange     #FF8C42   (ต้องดูแล tier 2 = accent)
color-alert-orange-bg  #FFF3E8
color-alert-green      #2E7D52   (ปกติ tier 3 = primary)
color-alert-green-bg   #E8F5E9

color-text-primary     #1A1A1A
color-text-secondary   #5C5C5C
color-text-muted       #9E9E9E
color-text-onDark      #FFFFFF

color-border           #E0D8D0
color-shadow           rgba(0,0,0,0.08)

SPACING SCALE (8-point grid)
─────────────────────────────────────────
sp-2 = 2px · sp-4 = 4px · sp-8 = 8px · sp-12 = 12px · sp-16 = 16px
sp-20 = 20px · sp-24 = 24px · sp-32 = 32px · sp-40 = 40px · sp-48 = 48px · sp-64 = 64px

BORDER RADIUS
─────────────────────────────────────────
radius-sm = 8px · radius-md = 12px · radius-lg = 16px
radius-xl = 20px · radius-2xl = 28px · radius-full = 9999px

SHADOW
─────────────────────────────────────────
shadow-card   : 0 2px 12px rgba(0,0,0,0.08)
shadow-modal  : 0 8px 32px rgba(0,0,0,0.16)
shadow-button : 0 4px 16px rgba(46,125,82,0.30)

TYPOGRAPHY SCALE
─────────────────────────────────────────
[ผู้ดูแล / เด็ก mode] — font-family: Sarabun
text-xs 12sp · text-sm 14sp · text-base 16sp (base ผู้ดูแล)
text-lg 18sp · text-xl 20sp · text-2xl 24sp · text-3xl 28sp

[ผู้สูงอายุ mode — ทุก element ขยาย]
elder-body 28sp · elder-title 36sp · elder-button 32sp · elder-label 24sp

LINE HEIGHT   : 1.5x font-size (Thai script)
LETTER SPACING: 0 (ไม่ขยาย — ภาษาไทยอ่านยาก)

BOTTOM TAB HEIGHT : 64px + safe area
SCREEN PADDING H  : 16px ซ้าย-ขวา · CARD GAP : 12px
```

---

## หน้า 1 — Family Dashboard (ผู้ดูแล)

**บทบาท:** Dashboard หลักที่ผู้ดูแลเปิดมาแล้วเข้าใจสถานการณ์ทั้งบ้านภายใน 3 วินาที ไม่ต้อง scroll

```
┌─────────────────────────────────────┐
│  TOP BAR  [ไอคอนบ้าน] "บ้านสุขใจ" [🔔2]│
├─────────────────────────────────────┤
│  ALERT BANNER (conditional)          │
│  ⚠ "น้องใบบัวออกนอก zone โรงเรียน"   │
│  "2 นาทีที่แล้ว"  ► "ดูรายละเอียด"   │
├─────────────────────────────────────┤
│  "เด็กๆ ในบ้าน" (scroll นอน)         │
│  ┌────────────┐  ┌────────────┐      │
│  │ ใบบัว 8ป   │  │ มิ้ม 12ป   │      │
│  │ ● โรงเรียน │  │ ● บ้าน      │      │
│  │ ✓ zone ปกติ│  │ ✓ ปลอดภัย  │      │
│  │ 10น.ที่แล้ว│  │ 5น.ที่แล้ว │      │
│  └────────────┘  └────────────┘      │
├─────────────────────────────────────┤
│  "ผู้สูงอายุ"                         │
│  ┌─────────────────────────────┐     │
│  │ ยายสมจิต  อายุ 72 ปี        │     │
│  │ เช็กอิน ✓ "เมื่อ 3 ชม."     │     │
│  │ ยาถัดไป 💊 14:30 อีก 45น.   │     │
│  │ [แถบ health: ปกติ 🟢]        │     │
│  └─────────────────────────────┘     │
├─────────────────────────────────────┤
│ [🏠ภาพรวม][👶เด็ก][👴ผู้สูงอายุ][⚙ตั้งค่า]│
└─────────────────────────────────────┘
```

- **TopBar:** พื้นครีมนวล, ชื่อบ้าน 20sp Bold color-primary, bell + badge ส้ม
- **Alert Banner:** แสดงเฉพาะ tier 1/2; tier 1 พื้นแดงอ่อน border-left 4px แดง; กดทั้งก้อน → Alert Detail
- **Child Card:** 160×180px, avatar 48px border สีตาม tier, timestamp 12sp muted
- **Elder Card:** พื้น color-surface-warm, countdown ยา สีส้ม, health bar 4px ที่ขอบล่าง
- **Bottom Tab:** active สี primary, inactive สี muted

---

## หน้า 2 — Alert Detail + Action (ผู้ดูแล)

**บทบาท:** ให้ข้อมูลครบ + action ชัด ตัดสินใจเร็ว

```
┌─────────────────────────────────────┐
│ [← กลับ] "แจ้งเตือนฉุกเฉิน" (พื้นแดง) │
├─────────────────────────────────────┤
│  [🔴 ระดับฉุกเฉิน]  (severity pill)   │
├─────────────────────────────────────┤
│  👧 ใบบัว · 8 ปี                      │
│  "ออกนอก zone โรงเรียนบ้านนา"         │
│  ตำแหน่งล่าสุด: ถนนราษฎร์บำรุง ซอย 5   │
│  ห่างจาก zone 320 เมตร                │
│  ⏱ "เกิดเมื่อ 2 นาทีที่แล้ว"          │
│  อัปเดตล่าสุด: 14:23:41               │
├─────────────────────────────────────┤
│  MAP VIEW (220px) pin แดง + zone วงกลม│
├─────────────────────────────────────┤
│  ┌─────────────────────────────┐     │
│  │  📞  โทรหาใบบัว  (primary)   │     │
│  └─────────────────────────────┘     │
│  ┌──────────────┐ ┌──────────────┐   │
│  │ 📢 แจ้งญาติ  │ │ ✓ จัดการแล้ว │   │
│  └──────────────┘ └──────────────┘   │
├─────────────────────────────────────┤
│  ACTIVITY LOG (timeline วันนี้)       │
│  14:10 เข้า zone · 14:21 ออกจาก zone │
└─────────────────────────────────────┘
```

- **Header:** สีตาม tier (1=แดง, 2=ส้ม), ข้อความขาว, back ซ้าย, ไม่มีปุ่มขวา
- **Severity Pill:** tier 1 "🔴 ระดับฉุกเฉิน" / tier 2 "🟠 ต้องดูแล" / tier 3 "🟢 ปกติ"
- **Map:** react-native-maps, zone วงกลมเขียวโปร่ง border dashed, ดูอย่างเดียว, ปุ่ม "เปิดแผนที่เต็มจอ"
- **Action Buttons:** โทร = full width 56px primary shadow; แจ้งญาติ = outlined; จัดการแล้ว = ghost + confirm dialog

---

## หน้า 3 — Elder Check-in (ผู้สูงอายุ)

**บทบาท:** 1 หน้า 1 action ปุ่มใหญ่เต็มจอ ใช้ได้โดยไม่ต้องสอน

```
┌─────────────────────────────────────┐
│  "สวัสดีตอนเช้า"  (28sp)             │
│  "คุณยายสมจิต"  (36sp Bold primary)  │
├─────────────────────────────────────┤
│  "วันนี้ยังไม่ได้เช็กอิน" (28sp ส้ม)  │
├─────────────────────────────────────┤
│  ┌─────────────────────────────┐     │
│  │            ✋ (64px)          │     │
│  │   ฉันปลอดภัยวันนี้  (32sp)   │     │
│  │     (พื้นเขียว 200px)        │     │
│  └─────────────────────────────┘     │
├─────────────────────────────────────┤
│  💊 "ยามื้อเที่ยง" (36sp ส้ม)        │
│  "กินเวลา 12:00 น." (28sp)           │
│  "อีก 45 นาที" (24sp muted)          │
├─────────────────────────────────────┤
│  [🆘 ขอความช่วยเหลือ] (72px แดง fixed)│
└─────────────────────────────────────┘
```

- **Greeting:** เปลี่ยนตามเวลา (เช้า/บ่าย/เย็น/กลางคืน)
- **Check-in Button:** tap area ใหญ่รองรับนิ้วสั่น; กดแล้ว overlay เต็มจอ 2 วิ "รับทราบแล้วค่ะ ขอบคุณนะคะ"; ถ้าเช็กอินแล้ว → disabled "ตรวจสอบแล้ว ✓" ป้องกัน double-tap
- **Medicine Reminder:** countdown ทุก 1 นาที; เกินเวลา → "เลยเวลา X นาที" สีแดง
- **Emergency Button:** fixed bottom; กดค้าง 3 วิ → ส่ง SOS (กันกดผิด) + progress ring + beep

---

## หน้า 4 — Child Home + SOS (เด็ก)

**บทบาท:** เห็นสถานะตัวเอง ติดต่อพ่อแม่ง่าย กด SOS 1 tap เรียบ ไม่ overwhelming

```
┌─────────────────────────────────────┐
│  "สวัสดี ใบบัว 👋" (20sp Bold)        │
├─────────────────────────────────────┤
│  📍 ฉันอยู่ที่: "โรงเรียนบ้านนา"      │
│  ● "อยู่ใน zone ✓" (เขียว)           │
│  "ข้อมูลเมื่อ 1 นาทีที่แล้ว"          │
├─────────────────────────────────────┤
│  ┌──────────────┐ ┌──────────────┐   │
│  │ 📞 โทรหาแม่  │ │ 📞 โทรหาพ่อ │   │
│  └──────────────┘ └──────────────┘   │
├─────────────────────────────────────┤
│  [✅ บอกว่าถึงแล้ว!] (พื้นเขียว)     │
├─────────────────────────────────────┤
│            (พื้นที่ว่าง)              │
├─────────────────────────────────────┤
│  [🆘 SOS — กดค้างเพื่อขอความช่วยเหลือ]│
│  (พื้นแดง 80px fixed bottom)          │
└─────────────────────────────────────┘
```

- **Status Card:** ชื่อสถานที่จาก geofence; นอก zone → สีแดง; refresh ทุก 1 นาที
- **Quick Contact:** native call ทันทีไม่ confirm (เด็กต้องการความเร็ว); สูงสุด 2 ปุ่ม
- **Check-in Button:** กดแล้ว notification ไปผู้ดูแล + "แจ้งแล้ว ✓" 3 วิ
- **SOS:** กดค้าง 3 วิ → ส่ง SOS + location ไปทุกคน; tap ธรรมดาไม่เกิดอะไร (กันกดผิด)

---

## หน้า 5 — Onboarding: สร้างครอบครัว + เชิญสมาชิก (ผู้ดูแล)

**บทบาท:** first-time setup แบบ guided ทำทีละขั้น ทำไม่เสร็จออกได้แล้วกลับมาทำต่อ

```
STEP INDICATOR:  [●]──[○]──[○]──[○]   "ขั้นที่ 1 จาก 4"

STEP 1 "สร้างบ้านของคุณ"
  🏠 (80px) · "ตั้งชื่อบ้านของคุณ" (24sp Bold)
  TEXT INPUT placeholder "เช่น บ้านสุขใจ" (56px)
  preview real-time · [ต่อไป →] (primary 56px)

STEP 2 "เพิ่มสมาชิก"
  "คุณต้องการเพิ่มใครก่อน?"
  ┌──────────┐ ┌──────────┐
  │ 👴 ผู้สูงอายุ│ │ 👶 เด็ก  │   (multi-select ได้)
  └──────────┘ └──────────┘
  [+ เพิ่มภายหลัง]

STEP 3 "ข้อมูลสมาชิก"
  ชื่อ [input] · วันเกิด [date picker] · ความสัมพันธ์ [dropdown]
  [AVATAR PICKER วงกลม 80px] · [+ เพิ่มสมาชิกอีกคน]

STEP 4 "เชิญสมาชิกเข้าแอป"
  MEMBER LIST: 👧 ใบบัว [ส่งลิงก์ ✉] · 👴 ตาสม [ส่งลิงก์ ✉]
  INVITE METHODS:
    [LINE  ส่งผ่าน LINE]
    [🔗  คัดลอกลิงก์]
    [📱  แชร์ผ่าน SMS]
  [เสร็จสิ้น — ไปที่หน้าหลัก]
```

- **Step Indicator:** dot active เขียว, complete มี checkmark, inactive เทา
- **Invite:** LINE ผ่าน Deep Link Share; ลิงก์มีอายุ 7 วัน + unique token ต่อ family; รับลิงก์ → install → join อัตโนมัติ (ไม่ต้องกรอกโค้ด)
- **Progress Persistence:** บันทึก state ลง AsyncStorage ทุก step; ออกกลางคันกลับมาทำต่อได้; มีปุ่ม "ทำทีหลัง"

---

## หน้า 6 — Geofence Setup (ผู้ดูแล)

**บทบาท:** วาด zone ปลอดภัยบนแผนที่ tap-to-draw ไม่ต้องรู้เรื่อง GIS

```
┌─────────────────────────────────────┐
│ [← กลับ] "ตั้ง Zone ปลอดภัย" [💾บันทึก]│
├─────────────────────────────────────┤
│ [🏠 บ้าน] [🏫 โรงเรียน] [+ เพิ่ม]    │
├─────────────────────────────────────┤
│  MAP FULL-AREA (~65%)                 │
│   - แตะจุดเพื่อสร้าง polygon          │
│   - แตะจุดแรกซ้ำเพื่อปิด zone        │
│   - พื้น zone เขียวโปร่ง border dashed │
│   TOOLBAR (ขวาบน): ↺ undo · 🗑 ลบ · 📍│
├─────────────────────────────────────┤
│ [✏️ วาด polygon] [⭕ วาดวงกลม]        │
├─────────────────────────────────────┤
│  ZONE SETTINGS PANEL (collapsible)    │
│   Zone สำหรับ: [dropdown ใบบัว/ตาสม]  │
│   แจ้งเตือนเมื่อ: ○เข้า ●ออก ●ทั้งสอง │
│   เวลาใช้งาน: [ตลอดเวลา / 07:00-18:00]│
├─────────────────────────────────────┤
│ [บันทึก Zone "โรงเรียนบ้านนา"]        │
└─────────────────────────────────────┘
```

- **Zone Chips:** preset บ้าน/โรงเรียน/ที่ทำงาน/วัด/รพ. + "เพิ่ม" ตั้งชื่อเอง
- **Polygon Mode:** tap → vertex; tap จุดแรกซ้ำ → ปิด; drag ปรับตำแหน่ง; min 3 vertex; instruction overlay
- **Radius Mode:** tap center → drag ขยาย; แสดงเมตรที่กึ่งกลาง; default 200m
- **Save:** disabled ถ้ายังไม่วาด/ไม่เลือก member; กด → บันทึก polygon ลง Supabase → toast สำเร็จ

---

## Design Spec สรุป — ส่งต่อ ake-software-architect

### Color Token Map (React Native / Expo)

```javascript
// theme/colors.ts
export const Colors = {
  primary:         '#2E7D52',
  primaryLight:    '#4CAF50',
  primarySubtle:   '#E8F5E9',
  accent:          '#FF8C42',
  accentLight:     '#FFE0CC',
  bg:              '#FFF8F0',
  surface:         '#FFFFFF',
  surfaceWarm:     '#FFF3E8',
  alertRed:        '#D32F2F',
  alertRedBg:      '#FFEBEE',
  alertOrange:     '#FF8C42',
  alertOrangeBg:   '#FFF3E8',
  alertGreen:      '#2E7D52',
  alertGreenBg:    '#E8F5E9',
  textPrimary:     '#1A1A1A',
  textSecondary:   '#5C5C5C',
  textMuted:       '#9E9E9E',
  textOnDark:      '#FFFFFF',
  border:          '#E0D8D0',
  shadow:          'rgba(0,0,0,0.08)',
  shadowButton:    'rgba(46,125,82,0.30)',
  shadowSOS:       'rgba(211,47,47,0.40)',
}
```

### Spacing & Radius Token

```javascript
// theme/spacing.ts
export const Space = { 2:2, 4:4, 8:8, 12:12, 16:16, 20:20, 24:24, 32:32, 40:40, 48:48, 64:64 }
export const Radius = { sm:8, md:12, lg:16, xl:20, xxl:28, full:9999 }
```

### Typography Token

```javascript
// theme/typography.ts
export const Type = {
  xs:   { fontSize: 12, lineHeight: 18 },
  sm:   { fontSize: 14, lineHeight: 21 },
  base: { fontSize: 16, lineHeight: 24 },
  lg:   { fontSize: 18, lineHeight: 27 },
  xl:   { fontSize: 20, lineHeight: 30 },
  xxl:  { fontSize: 24, lineHeight: 36 },
  xxxl: { fontSize: 28, lineHeight: 42 },
  elderBody:   { fontSize: 28, lineHeight: 42 },
  elderTitle:  { fontSize: 36, lineHeight: 54 },
  elderButton: { fontSize: 32, lineHeight: 48 },
  elderLabel:  { fontSize: 24, lineHeight: 36 },
  regular: '400', medium: '500', semibold: '600', bold: '700',
  family: 'Sarabun',   // ต้องติดตั้ง via expo-font
}
```

### Component Library ย่อ

```
ATOMS
  Button     : variant (primary|outlined|ghost|danger), size (sm|md|lg|elder)
  Card       : variant (default|warm), shadow-card เสมอ
  AlertBadge : tier (1|2|3) → สี + border-left 4px
  Pill       : tier + label, radius-full
  Avatar     : size (sm32|md48|lg80), border สีตาม tier
  StatusDot  : tier, size (8|10px)
  TimestampLabel : "X นาทีที่แล้ว", update ทุก 60s

MOLECULES
  MemberCard      : Avatar + ชื่อ + StatusDot + zone + Timestamp (child/elder variant)
  AlertBanner     : AlertBadge + description + timestamp + CTA (null ถ้าไม่มี alert)
  MedicineReminder: 💊 + name + time + countdown
  SOSButton       : long-press 3s + progress ring + haptic (caregiver/child 80px, elder 72px)
  ZoneChip        : emoji + label, selectable
  StepIndicator   : dot + connector line

ORGANISMS
  FamilyDashboard  = TopBar + AlertBanner? + ChildSection + ElderSection + BottomTab
  AlertDetailScreen= AlertHeader + SeverityPill + AlertInfoCard + MapView + ActionButtons + ActivityLog
  ElderCheckInScreen = GreetingHeader + StatusRow + CheckInButton + MedicineReminder + SOSButton
  ChildHomeScreen  = ChildTopBar + StatusCard + QuickContact + CheckInButton + SOSButton
  OnboardingFlow   = StepIndicator + [Step1..4] + NextButton
  GeofenceSetup    = Header + ZoneChipRow + FullMapView + DrawModeToggle + ZoneSettingsPanel + SaveButton
```

### Navigation Structure

```
Root
├── Onboarding Stack (first-time only)
│   └── Step1 → Step2 → Step3 → Step4Invite
└── Main Tab Navigator (Bottom Tab 4 items)
    ├── ภาพรวม → FamilyDashboardScreen → AlertDetailScreen (push)
    ├── เด็ก → ChildHomeScreen → ChildProfileScreen (push, caregiver view)
    ├── ผู้สูงอายุ → ElderCheckInScreen → ElderProfileScreen (push, caregiver view)
    └── ตั้งค่า → SettingsScreen → GeofenceSetupScreen (push)

USER MODE SWITCH (Supabase auth role):
  caregiver → full bottom tab + full dashboard
  child     → ChildHomeScreen only, limited nav
  elder     → ElderCheckInScreen only, enlarged UI
```

### Interaction Patterns

```
HAPTIC: check-in = light · SOS = heavy ทุก 1s · alert = notification · save = success
ANIMATION: button press scale 0.95/100ms · card mount fade+translateY 200ms ·
           alert banner slideDown 300ms · check-in success overlay 200/1500/200ms · SOS countdown 3000ms linear
EMPTY STATE: ไม่มี alert → banner ซ่อน · ไม่มีสมาชิก → placeholder + ปุ่มเพิ่ม · ไม่มี zone → แจ้งบน card
LOADING: skeleton loader ขนาดเท่า component จริง (ไม่ใช้ spinner กลางจอ)
OFFLINE: top banner เทา "ไม่มีอินเทอร์เน็ต · ข้อมูลล่าสุดเมื่อ X นาที" — SOS/โทร ยังใช้ได้ (native)
```

### Package Dependencies ที่แนะนำ

```
react-native-maps              → Map + geofence visualization
expo-location                  → GPS tracking (background)
expo-haptics                   → Haptic feedback
expo-font (Sarabun)            → Thai typography
expo-sharing / expo-clipboard  → Share / copy invite link
@react-navigation/bottom-tabs  → Bottom tab nav
react-native-reanimated        → Smooth animations
react-native-gesture-handler   → Long press / drag gesture
@supabase/supabase-js          → Auth + realtime + DB
```

---

## Sources

- [Sarabun — Google Fonts](https://fonts.google.com/specimen/Sarabun)
- [react-native-maps](https://github.com/react-native-maps/react-native-maps)
- [expo-location Background Tracking](https://docs.expo.dev/versions/latest/sdk/location/)
- [expo-haptics](https://docs.expo.dev/versions/latest/sdk/haptics/)
