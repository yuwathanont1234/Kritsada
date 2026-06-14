# Store Listing & Submission Content — Luxury Authenticator

Ready-to-paste copy for App Store Connect + Google Play Console, plus the
reviewer demo-account setup and the Data-Safety / App-Privacy mapping.

> **Positioning guardrail (important for review):** describe the app as an
> **AI-assisted pre-screening / second opinion**, never as a definitive
> authentication, appraisal, or guarantee. Avoid "100%", "guaranteed genuine",
> "certified authentic". This keeps the listing truthful (the app's own tiers
> cap screening accuracy at 70/85/~95%) and avoids Guideline 2.3 / misleading-
> claim rejections. Do **not** mention "Android"/"Google Play" anywhere in the
> iOS metadata, or "App Store"/"iOS" in the Play listing.

---

## 1. Names & short fields

| Field | Value |
|---|---|
| App name | **Luxury Authenticator** |
| iOS subtitle (≤30) | `AI watch pre-screening` |
| iOS subtitle TH (≤30) | `สแกนนาฬิกาหรูด้วย AI` |
| Android short desc (≤80, EN) | `AI-assisted pre-screening & market price estimates for luxury watches.` |
| Android short desc (≤80, TH) | `สแกนนาฬิกาหรูด้วย AI — ช่วยคัดกรองความแท้และประเมินราคาตลาดเบื้องต้น` |
| Primary category | Lifestyle (alt: Utilities) |
| Price | Free (auto-renewable subscriptions inside) |

### iOS promotional text (≤170, editable anytime)
- EN: `Photograph your watch and get an AI second opinion in under a minute — hallmark analysis, a 59-brand visual reference, and an AI market-price estimate.`
- TH: `ถ่ายรูปนาฬิกาของคุณ รับความเห็นที่สองจาก AI ในเวลาไม่ถึงนาที — วิเคราะห์จุดสังเกต อ้างอิง 59 แบรนด์ พร้อมประเมินราคาตลาดด้วย AI`

### iOS keywords (≤100 chars, comma-separated, NO spaces, don't repeat the title)
```
watch,luxury,authenticate,rolex,patek,appraisal,collector,timepiece,นาฬิกา,ของแท้,ตรวจนาฬิกา,หรู,สะสม
```
*(verify it's ≤100 characters in ASC before saving; trim trailing terms if over.)*

---

## 2. Full description

### English (<4000 chars)
```
Luxury Authenticator is an AI-assisted pre-screening tool for luxury watches. Photograph your timepiece and, in under a minute, get a structured second opinion — not a guarantee, but a fast, data-driven starting point before you buy, sell, or insure.

WHAT YOU GET
• AI authenticity screening — multiple AI engines inspect dial typography, case finishing, bezel and index alignment, and caliber/engraving cues, returning a confidence read with the reasoning behind it.
• Hallmark Diagnostic Map — brand-specific landmarks highlighted on your own photos (Premium).
• Visual reference matching — your watch compared against a curated reference set spanning ~59 luxury brands.
• AI market-price estimate — an AI-grounded secondary-market value range in Thai Baht and USD.
• Collection vault & portfolio — save your watches, track estimated value and gains over time.
• Premium PDF report — export a shareable diagnostic summary.

HONEST BY DESIGN
Screening accuracy is bounded and shown per tier (up to ~70% / 85% / 95% by photo coverage). When the AI can't reach a confident read, the app says "uncertain" and asks you to rescan — it never fabricates a verdict. Results are an aid to your own due diligence and to professional authentication, not a replacement for them.

MEMBERSHIP
• Standard — 20 scans/month, 3-engine analysis, 2-angle screening
• Pro — 50 scans/month, 4-engine analysis, 3-angle screening, AI market valuation, PDF export
• Premium — 100 scans/month, full 6-engine analysis, 4-angle screening, Hallmark Diagnostic Map, serial-format validation, 100-watch vault

PRIVACY
Watch photos are sent securely to our AI partners only to produce your result and are not stored by us afterward. No names, emails, or GPS are attached to analysis data. You can withdraw consent and delete your account and data from inside the app at any time.

Subscriptions auto-renew unless cancelled at least 24 hours before the period ends; manage or cancel in your account settings. Terms and Privacy Policy links are in the app and below.
```

### ภาษาไทย (<4000 ตัวอักษร)
```
Luxury Authenticator คือเครื่องมือช่วย "คัดกรองเบื้องต้น" ความแท้ของนาฬิกาหรูด้วย AI เพียงถ่ายรูปนาฬิกาของคุณ ภายในเวลาไม่ถึงนาทีคุณจะได้ความเห็นที่สองอย่างเป็นระบบ — ไม่ใช่การรับประกัน แต่เป็นจุดเริ่มต้นที่รวดเร็วและอิงข้อมูล ก่อนตัดสินใจซื้อ ขาย หรือทำประกัน

สิ่งที่คุณจะได้รับ
• คัดกรองความแท้ด้วย AI — หลายเอนจินวิเคราะห์ตัวอักษรบนหน้าปัด งานเก็บขอบตัวเรือน การวางหลักชั่วโมง/ขอบตลับ และรายละเอียดกลไก พร้อมคะแนนความเชื่อมั่นและเหตุผลประกอบ
• แผนผังวินิจฉัยจุดสังเกต (Hallmark Diagnostic Map) — ชี้จุดเฉพาะแบรนด์บนรูปของคุณเอง (Premium)
• เทียบฐานอ้างอิงเชิงภาพ — เทียบนาฬิกาของคุณกับชุดอ้างอิงครอบคลุมประมาณ 59 แบรนด์หรู
• ประเมินราคาตลาดด้วย AI — ช่วงราคาตลาดรองโดยประมาณ ทั้งสกุลบาทและดอลลาร์
• ตู้เซฟสะสม & พอร์ตโฟลิโอ — บันทึกนาฬิกา ติดตามมูลค่าและกำไรโดยประมาณ
• รายงาน PDF ระดับพรีเมียม — ส่งออกสรุปผลเพื่อแชร์

ซื่อสัตย์ตั้งแต่การออกแบบ
ความแม่นยำของการคัดกรองมีเพดานและแสดงตามระดับสมาชิก (สูงสุดราว 70% / 85% / 95% ตามจำนวนมุมภาพ) เมื่อ AI สรุปไม่ได้อย่างมั่นใจ แอปจะแสดงว่า "ไม่สามารถสรุปได้" และให้สแกนใหม่ — ไม่กุผลลัพธ์ ผลที่ได้เป็นเพียงตัวช่วยประกอบการตรวจสอบของคุณเองและของผู้เชี่ยวชาญ ไม่ใช่สิ่งทดแทน

แพ็กเกจสมาชิก
• Standard — 20 สแกน/เดือน, วิเคราะห์ 3 เอนจิน, คัดกรอง 2 มุม
• Pro — 50 สแกน/เดือน, 4 เอนจิน, 3 มุม, ประเมินราคาด้วย AI, ส่งออก PDF
• Premium — 100 สแกน/เดือน, ครบ 6 เอนจิน, 4 มุม, Hallmark Diagnostic Map, ตรวจรูปแบบหมายเลขซีเรียล, ตู้เซฟ 100 เรือน

ความเป็นส่วนตัว
รูปนาฬิกาถูกส่งอย่างปลอดภัยไปยังพาร์ทเนอร์ AI เพื่อประมวลผลผลลัพธ์เท่านั้น และเราไม่เก็บไว้หลังจากนั้น ไม่มีการแนบชื่อ อีเมล หรือพิกัด GPS กับข้อมูลการวิเคราะห์ คุณถอนความยินยอมและลบบัญชี/ข้อมูลได้จากในแอปทุกเมื่อ

สมาชิกจะต่ออายุอัตโนมัติ เว้นแต่ยกเลิกอย่างน้อย 24 ชั่วโมงก่อนสิ้นรอบ จัดการหรือยกเลิกได้ในการตั้งค่าบัญชี ลิงก์ข้อกำหนดและนโยบายความเป็นส่วนตัวอยู่ในแอปและด้านล่าง
```

---

## 3. Reviewer demo account + review notes

### Operator setup (one time, ~3 min)
1. Supabase → **Authentication → Users → Add user**: email `reviewer@luxuryauthenticator.app`, set a password, tick **Auto confirm**.
2. Grant the reviewer full features so they can test every screen — run in the SQL editor (replace the id with the new user's UUID from step 1):
   ```sql
   insert into public.user_membership (user_id, tier, expires_at, source, last_event)
   values ('<REVIEWER_USER_UUID>', 'premium', now() + interval '5 years', 'manual', 'reviewer-grant')
   on conflict (user_id) do update
     set tier = 'premium', expires_at = excluded.expires_at, last_event = 'reviewer-grant';
   ```
3. Make sure the auto-renewable subscriptions are attached to the build and in
   "Ready to Submit" (Apple) / active (Play) so the paywall's purchase works in
   the review sandbox.

### Review notes (paste into ASC "App Review Information" / Play "Testing instructions")
```
This app requires sign-in. The app is passwordless by default (email OTP), but
for review we provide a password account:

  Email:    reviewer@luxuryauthenticator.app
  Password: <the password you set>

How to sign in: on the login screen tap "Sign in with a password" (under the
"Send sign-in code" button), enter the email + password above, then "Sign in
with a password".

The reviewer account has a Premium membership so all features are available.
Core flow to test: Home → Start Scanning → grant camera → take a dial photo →
Analyze → view the AI screening result, Hallmark Diagnostic Map, and AI market-
price estimate. Subscriptions can be tested from the Membership screen.

Note: this is an AI-assisted pre-screening / second-opinion tool, not a
definitive authentication or appraisal service.
```

---

## 4. Data Safety (Play) / App Privacy (Apple) — accurate mapping

Fill the console forms to match this (mismatch = removal):

| Data | Collected? | Linked to user | Used for | Notes |
|---|---|---|---|---|
| Email address | Yes | Yes | Account / authentication | Supabase Auth |
| Photos (watch images) | Yes, processed | No (anonymized) | App functionality (AI analysis) | Sent to Google Gemini + Replicate (US) for processing; not retained by us after the result; not used to train models |
| Purchase history | Yes | Yes | App functionality (entitlements) | RevenueCat / store |
| Product interaction / analytics | Yes | No (cohort hash) | Analytics, product improvement | PostHog; opt-in consent surface in app |
| Crash logs / diagnostics | Yes | No | App stability | Sentry |
| Approximate location | No | — | — | Not collected (city-level via IP only if ever enabled; currently off) |
| Precise location / contacts / health | No | — | — | Not collected |

- **Account deletion:** in-app (Settings → Delete Account & All Data) — deletes the server account + data via the `delete-account` function. Also provide this as the Play "account deletion URL" if a web path is required.
- **Permissions:** Camera (capture watch photos), Photo Library (pick watch photos). No microphone, location, or contacts.
- **Age rating:** no objectionable content → 4+ (Apple) / Everyone (Play). Answer the questionnaires truthfully; the watch-ID game contains no gambling/violence.

---

## 5. Pre-submit reminders (tie-in with PRE_LAUNCH_AUDIT.md)
- RevenueCat live + sandbox purchase verified, else the paywall fails review.
- EAS production env has SUPABASE + REVENUECAT + SENTRY keys (app hard-fails on placeholder Supabase env).
- iOS build on the iOS 26 SDK image; Android 16 KB check passes; Play closed-testing requirement met for new accounts.
- Screenshots: iOS 6.9" (required) + Android phone 2+; Android feature graphic 1024×500.
- Confirm the github.io Privacy/Terms URLs are live.
