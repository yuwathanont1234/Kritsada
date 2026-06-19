# ผู้พิทักษ์ (Guardian)

แอปกันภัยหลอกลวงออนไลน์สำหรับตลาดไทย — ตรวจข้อความ/ภาพที่น่าสงสัยด้วยระบบ 2 ชั้น
(ฐานข้อมูลตัวตน + Claude AI) แล้วสรุปเป็นระดับความเสี่ยง 🔴 🟡 🟢 พร้อมโหมดครอบครัว
และกิ่ง "ช่วยกู้"

แอปนี้เป็น Expo project แยกต่างหาก (sibling) ที่ใช้ Supabase project เดียวกับแอปหลัก
โดยตาราง/ฟังก์ชันทั้งหมดขึ้นต้นด้วย `guardian_`

## สถาปัตยกรรม

```
ผู้ใช้ → วางข้อความ/แนบภาพ
      → Edge Function `guardian-analyze`
          1. regex สกัด เบอร์/บัญชี/URL  → Layer 1 (guardian_identifiers)
          2. Claude (claude-sonnet-4-6)   → Layer 2 (9 หมวดธงแดง)
          3. Decision Matrix (rule-based) → 🔴/🟡/🟢
          4. ถ้า 🔴 + ผู้ใช้เป็น protected → ส่ง push หาผู้ดูแล (Expo Push)
      → Result Card + (ถ้า 🔴) ปุ่มช่วยกู้
```

## การติดตั้ง (Backend)

1. **Migration** — apply `supabase/migrations/0018_guardian_schema.sql`
   ผ่าน Supabase Dashboard → SQL Editor (สร้าง 5 ตาราง + 2 ฟังก์ชัน + seed ทดสอบ)

2. **Secret** — ตั้งคีย์ Claude ให้ Edge Function:
   ```bash
   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
   ```
   (`SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` ถูก inject ให้อัตโนมัติ)

3. **Deploy Edge Function**:
   ```bash
   supabase functions deploy guardian-analyze
   ```

4. **ทดสอบด้วย curl**:
   ```bash
   curl -X POST https://<project-ref>.supabase.co/functions/v1/guardian-analyze \
     -H "Content-Type: application/json" \
     -d '{"content":"รับรองผลตอบแทน 30%/เดือน โอนมาบัญชีส่วนตัว 0812345678","content_type":"text"}'
   ```
   คาดหวัง `risk_level: "RED"` (เบอร์ตรง seed BAD + ธงแดง `guaranteed_returns` + `personal_account_transfer`)

## การติดตั้ง (App)

```bash
cd guardian
npm install
cp .env.example .env     # ใส่ EXPO_PUBLIC_SUPABASE_URL / ANON_KEY (เดียวกับแอปหลัก)
npm start
```

## ขอบเขต MVP

- ✅ ตรวจข้อความ + ภาพ (Claude multimodal)
- ✅ Decision Matrix 2 ชั้น (rule-based, audit ได้)
- ✅ โหมดครอบครัว: email OTP login + ผูกบัญชีด้วย invite code + push เมื่อไฟแดง
- ✅ กิ่งช่วยกู้: สายด่วน 1441, อายัดบัญชี, แจ้งความ, สคริปต์คุยผู้สูงอายุ
- ✅ แคชผล 7 วัน (ลดต้นทุน Claude)

## ยังไม่อยู่ใน MVP

- Share Extension (iOS App Extension)
- การ sync Blacklistseller / ก.ล.ต. ของจริง (รอตรวจ ToS) — ปัจจุบันใช้ seed ทดสอบ
- Langfuse observability, ระบบจ่ายเงิน/tier

## หมายเหตุข้อกฎหมาย

ระบบ **ไม่** ฟันธงว่าบริษัท/บุคคลใดเป็นมิจฉาชีพ — รายงานเป็น "พบในฐานข้อมูลร้องเรียน"
หรือ "แสดงรูปแบบที่สอดคล้องกับกลยุทธ์หลอกลวง" เท่านั้น ทุกผลลัพธ์เก็บ log
(`guardian_analysis_log`) เพื่อ audit ย้อนหลังว่าขึ้นไฟแดงด้วยกฎข้อใด
