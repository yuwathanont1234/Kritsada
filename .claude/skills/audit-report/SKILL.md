---
name: audit-report
description: รูปแบบรายงานผลตรวจสอบแอปและแผนการแก้ไขของ AI Solution. Make sure to use this skill whenever producing an audit report, fix plan, security/PDPA/QA findings, or any list of issues found in an app — even if the user just says "ตรวจแอป", "หาช่องโหว่", or "สรุปปัญหา". Provides severity levels (Critical/High/Medium/Low), inspector-to-fixer mapping, and status tracking.
---

# Audit Report Format (AI Solution)

ใช้รูปแบบนี้ทุกครั้งที่ออกผลตรวจสอบ ทั้งโหมด AUDIT และ AUDIT & FIX

## ระดับความรุนแรง
- **Critical** : ช่องโหว่ความปลอดภัย/ข้อมูลรั่ว/แอปพัง/ผิดกฎหมาย → แก้ทันที ห้ามปล่อย
- **High** : กระทบผู้ใช้/รายได้ หรือจะโดน reject → แก้ก่อนรอบปล่อยถัดไป
- **Medium** : ควรแก้ ไม่เร่งด่วน
- **Low** : ปรับปรุงได้ถ้ามีเวลา

## ผู้ตรวจ → ผู้แก้ (โหมด FIX)
| ผู้ตรวจ | ผู้แก้ |
|---|---|
| oat-security-audit (security) | ake / non แก้ — oat ตรวจซ้ำ |
| non (schema/RLS) | non + migration |
| ake (โครงสร้าง/โค้ด) | ake |
| tarn (ต้นทุน/perf) | ake/non ตามคำแนะนำ |
| ploy (บั๊ก) | ake แก้ → ploy re-test |
| beam/nan (store/PDPA) | แก้ตาม + ตรวจซ้ำ |

## เทมเพลตรายงาน

```markdown
# Audit Report — [ชื่อแอป]
วันที่: [YYYY-MM-DD] · ขอบเขต: [...] · โหมด: AUDIT / AUDIT & FIX

## สรุปผู้บริหาร
[2-3 บรรทัด: สุขภาพรวม + จำนวน finding แต่ละระดับ]

| ระดับ | จำนวน |
|-------|-------|
| Critical | 0 |
| High | 0 |
| Medium | 0 |
| Low | 0 |

## Findings + Fix Plan
| # | ระดับ | ผู้ตรวจ | ปัญหา | ความเสี่ยง | คำแนะนำแก้ | ผู้แก้ | สถานะ |
|---|-------|--------|-------|-----------|-----------|-------|-------|
| 1 | Critical | โอ๊ต | ... | ... | ... | เอก | รอตัดสินใจ |

> สถานะ: รอตัดสินใจ → อนุมัติแก้ / รับความเสี่ยงไว้ก่อน → แก้แล้ว → verify ผ่าน

## สิ่งที่เจ้าของต้องตัดสินใจ
- [...]

## ผลหลังแก้ (โหมด AUDIT & FIX)
- finding ที่แก้แล้ว: [...]
- ผล VERIFY (พลอย): [ผ่าน/ไม่ผ่าน]
- พร้อมปล่อย: [ใช่/ไม่ + เหตุผล]
```

กฎ: GATE ก่อนแก้เสมอ · ผู้ตรวจ ≠ ผู้แก้ · Critical security/data แก้ก่อนปล่อยเสมอ
