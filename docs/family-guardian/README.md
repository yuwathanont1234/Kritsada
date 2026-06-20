# Family Guardian — เอกสารวางแผนผลิตภัณฑ์

> 📌 เอกสารชุดนี้ถูกสร้างโดย **AI Solution Studio `new-app` pipeline** (เป็นตัวอย่าง/ผลงาน demo)
> ไอเดีย: **แอปผู้พิทักษ์ครอบครัว** — แอปเดียวให้คนวัยทำงานไทยดูแลทั้งลูกเล็กและพ่อแม่สูงอายุ

## ภาพรวมโปรเจกต์

แอปมือถือ (React Native / Expo + Supabase) ที่ให้ผู้ดูแล (Sandwich Generation อายุ 30–50 ปี)
ดูแลคน 2 กลุ่มในครอบครัวพร้อมกันในแอปเดียว:

- **โมดูลเด็ก:** ตำแหน่ง real-time, geofence, ปุ่ม SOS, ประวัติเดินทาง
- **โมดูลผู้สูงอายุ:** เตือนยา, ตรวจจับล้ม (opt-in beta), เช็กอินรายวัน, แจ้งญาติเมื่อผิดปกติ

## สารบัญเอกสาร

| # | เอกสาร | ผู้จัดทำ (subagent) | สรุป |
|---|--------|---------------------|------|
| 1 | [Opportunity Brief](./01-opportunity-brief.md) | poom-market-research | วิจัยตลาดไทย + คู่แข่ง + go/no-go |
| 2 | [Financial Analysis](./02-financial-analysis.md) | keng-financial | โมเดลรายได้ + ราคา + TAM/SAM/SOM + unit economics |
| 3 | [User Flow](./03-user-flow.md) | fah-ux-flow | persona + user journey + navigation + edge case |
| 4 | [Design Spec](./04-design-spec.md) | mook-ui-ux-designer | design tokens + 6 หน้าจอ + component library |

## Decision Log

```
2026-06-20 | VALIDATE | ✅ GO (conditional)
  ตลาด: ไทย Super-Aged (ผู้สูงอายุ 14M / 21.6%), ช่องว่าง "เด็ก+ผู้สูงอายุ" ในแอปเดียว
  เงิน: LTV:CAC ~2.7x, break-even เดือน 8-12, ราคา Free/99/199 บาท/เดือน
  เงื่อนไข: (1) ทดสอบ WTP 30 คนก่อนเขียนโค้ด (2) churn < 4%/เดือน (3) fall detection เป็น beta

2026-06-20 | DESIGN | ✅ เลือกทิศทาง A "อบอุ่น-ครอบครัวไทย"
  สี: เขียวมรกต #2E7D52 + ส้ม #FF8C42 + ครีม #FFF8F0, ฟอนต์ Sarabun
  ส่งมอบ: user flow + 6 screen specs + design tokens (พร้อมส่ง BUILD phase)

ถัดไป (ยังไม่ทำ): Phase 3 BUILD → ake-software-architect → non-database-engineer → tarn-cost-guardian
```

## Pipeline ที่ใช้

สร้างผ่าน BUILD pipeline ของ AI Solution Studio (`.claude/commands/new-app.md`):

1. **VALIDATE** → poom-market-research → keng-financial ✅
2. **DESIGN** → fah-ux-flow → mook-ui-ux-designer ✅
3. BUILD → ake-software-architect → non-database-engineer → tarn-cost-guardian *(ยังไม่ทำ)*
4. COMPLIANCE → beam-appstore-compliance → nan-pdpa-privacy → oat-security-audit *(ยังไม่ทำ)*
5. QUALITY → ploy-qa-testing *(ยังไม่ทำ)*
6. SHIP → kit-devops-release *(ยังไม่ทำ)*
