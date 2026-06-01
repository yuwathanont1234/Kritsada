# คู่มือสถาปัตยกรรม: Image-RAG Authenticity Pipeline

> **ที่มา:** สรุปจากระบบตรวจสอบความแท้ของ **Luxury Watch Authenticator** เพื่อใช้เป็น
> ไกด์ไลน์ให้ทีม **แอปส่องพระ (Buddhist Amulet Authenticator)** นำสถาปัตยกรรมเดียวกันไปปรับใช้
> โดยเฉพาะ **แกนการประเมินความแท้ที่พึ่ง Database หนัก (Visual RAG)** และ **การแก้ Cold-Start ที่ได้ผลจริง**
>
> เอกสารนี้เป็น *เชิงสถาปัตยกรรม* — อ้างอิงไฟล์/ฟังก์ชันจริงของแอปนาฬิกาเป็นตัวอย่าง แล้วชี้วิธี map มาเป็นพระเครื่องท้ายเอกสาร

---

## สารบัญ
1. [หลักการสำคัญ (อ่านก่อน)](#1-หลักการสำคัญ)
2. [ภาพรวม Pipeline](#2-ภาพรวม-pipeline)
3. [แกน DB-heavy: Visual RAG ตรวจความแท้](#3-แกน-db-heavy-visual-rag)
4. [การหลอมหลายสัญญาณ (Multi-signal fusion)](#4-multi-signal-fusion)
5. [⭐ การแก้ Cold-Start ที่ได้ผล](#5-cold-start)
6. [โมเดลต้นทุน (Cost)](#6-cost)
7. [บทเรียน/กับดักที่ต้องรู้](#7-บทเรียน)
8. [การปรับใช้กับแอปส่องพระ](#8-ปรับใช้พระเครื่อง)

---

## 1. หลักการสำคัญ

มี 4 หลักที่ทำให้ระบบนี้ทำงานได้จริง — ถ้าจะ copy ไปทำพระเครื่อง ต้องเข้าใจ 4 ข้อนี้ก่อน:

1. **ใช้ embedding ดิบมิติสูง อย่าใช้ projection ที่ถูกบีบ** — ตัวแยกแยะที่แท้จริงคือเวกเตอร์ดิบ 1024-d จาก DINOv3 ไม่ใช่ linear-probe 256-d (ดู §7 — เคยพลาดเรื่องนี้แล้วเสียเวลาเป็นเดือน)
2. **"ความเห็นตรงกัน" (agreement) สำคัญกว่า "คะแนนความเหมือนสัมบูรณ์"** — ใช้การที่ AI-identify กับ DB-retrieval เห็นตรงกัน (เช่น brand เดียวกัน) เป็นด่านหลัก ส่วน cosine similarity เป็นแค่ floor หลวมๆ
3. **สัญญาณความแท้ต้อง "ไม่สมมาตร" (asymmetric)** — สัญญาณที่ชี้ว่า *ปลอม* ให้หักคะแนน (มีเพดาน ไม่พลิกคำตัดสิน) แต่สัญญาณที่ชี้ว่า *แท้* **ห้ามเพิ่มความมั่นใจ** เพราะของปลอมเกรดสูงเลียนแบบจนหลอก "สัญญาณแท้" ได้ → เชื่อไม่ได้
4. **อย่าจ่ายเงินซื้อ "always-warm" — ออกแบบให้ทน Cold-Start แทน** (ดู §5)

---

## 2. ภาพรวม Pipeline

ออร์เคสเตรชันอยู่ที่ `src/lib/aiRouter.ts` (ฟังก์ชัน `analyzeWatchByTier`) — รันแบบ **ขนาน** เพื่อซ่อน latency:

```
[0] PREWARM        client เรียก prewarmAll() ตั้งแต่เปิดแอป (warm Replicate + HNSW index)
                       │
[1] EMBED (ขนาน)   ──┼── DINOv3 1024-d ของรูป (หน้า+หลัง) ──┐
[1] IDENTIFY (ขนาน)──┘   Gemini Vision: นี่คือรุ่นอะไร      │
                       │                                      ▼
[2] RETRIEVE       Visual RAG: query match_watches() หา watch ที่ embedding ใกล้สุด
                       │   (มี timeout 10s — ถ้าเกิน "SKIP" ไม่บล็อก)
                       ▼
[3] CROSS-VALIDATE brand/model ของ RAG ตรงกับ Gemini ไหม? → dbValidated / visualBrandCorroborated
                       │
[4] GROUNDED RETRY (เฉพาะเมื่อ conf ต่ำ + ไม่มี validation) → Gemini + Google Search
                       │
[5] ENRICH (ขนาน)  authenticity (Gemini + รูป macro)  ‖  price/มูลค่า (Gemini + grounding, cache 30 วัน)
                       │
[6] FUSE SIGNALS   A1 real-vs-fake classifier (asymmetric) + serial check + DB-match salvage
                       │
[7] GUARDRAILS     downgrade ถ้าหลักฐานอ่อน + เพดานความมั่นใจตามจำนวนรูป (coverage gate)
                       ▼
                   ScanResult → UI
```

**กุญแจ:** `[1]` identify กับ embed รันพร้อมกัน (`Promise.all([identifyPromise, ragPromise])`) — ผู้ใช้ไม่ต้องรอต่อคิว

---

## 3. แกน DB-heavy: Visual RAG

นี่คือส่วนที่ "ใช้ Database เยอะ" ที่สุด — เป็นหัวใจการประเมินความแท้

### 3.1 Embedding model
- **DINOv3 ViT-L/16** (self-supervised vision transformer) รันบน **Replicate** ผ่าน Supabase Edge Function `embed-image`
- คืน **เวกเตอร์ดิบ 1024 มิติ** → **L2-normalize** (เพื่อให้ cosine = dot product)
- ก่อนส่ง embed: ย่อรูปเป็น **width 384px, JPEG q0.85** (`imageToDataUrl` ใน `src/lib/visualRag.ts`) → ~50KB ไม่ชน payload cap, embed เร็วขึ้น
- **ทำไม DINOv3 ไม่ใช่ CLIP/ResNet:** DINOv3 จับ *พื้นผิว/รายละเอียดเชิงโครงสร้าง* (texture, micro-detail) ได้ดีมาก — ตรงกับงานความแท้ที่ตัดสินจากรายละเอียดเล็กๆ

### 3.2 Reference DB (pgvector)
- ตาราง `image_embeddings` ใน Supabase Postgres + extension **pgvector**
  - `image_embedding vector(1024)` ← **ตัวที่ใช้จริง**
  - `image_embedding_v2 vector(256)` ← linear-probe projection (**เลิกใช้แล้ว** — ดู §7)
  - `watch_id` (FK → `watches`), `image_url`, `embedding_source`
- **HNSW index** บน column 1024-d (`idx_image_embeddings_1024_hnsw`) → ค้นหา ANN เร็ว (~1-2s สำหรับ 35k แถว)
- ขนาดปัจจุบัน: **~35,000 embeddings / 60 แบรนด์** (ยิ่งมีรูปอ้างอิงต่อรุ่นเยอะ ยิ่งแม่น)

### 3.3 Match RPC
`supabase/migrations/0015_match_watches_1024.sql`:
```sql
CREATE FUNCTION match_watches(query_embedding vector(1024), match_count int, max_distance float)
RETURNS TABLE (watch_id, name, brand, reference, image_url, embedding_source, distance)
-- ORDER BY image_embedding <=> query_embedding   (<=> = cosine distance)
SET statement_timeout = '30s'
```
client เรียกผ่าน REST: `POST /rest/v1/rpc/match_watches` (ดู `findSimilarWatches` ใน `visualRag.ts`)

### 3.4 ⭐ Agreement > absolute similarity (ด่านหลัก)
หลังได้ top-K matches **อย่าตัดสินจากคะแนน similarity ดิบ** — ใช้ "ความเห็นตรงกัน" กับ AI-identify:

| ระดับ | เงื่อนไข | floor (cosine sim) |
|---|---|---|
| `dbValidated` (แข็งสุด) | brand **และ** model ตรงกับ Gemini | ≥ 0.15 |
| `dbValidated` | brand ตรง | ≥ 0.13 |
| `visualBrandCorroborated` (เบา) | brand ตรง (ใช้ salvage/มุมเดียว) | ≥ 0.09 |

**ทำไมไม่ใช้ threshold สัมบูรณ์สูงๆ:** สเกล cosine ของ 1024-d อยู่ราว **0.16-0.23 สำหรับรุ่นใกล้กัน, ~0.76 เมื่อเจอรุ่นเป๊ะ, < 0.13 ข้ามแบรนด์** — ค่าต่ำกว่าที่คนคาด (ไม่ใช่ 0.85). เพื่อนบ้านข้ามแบรนด์ตัวแรกอยู่ที่ rank 49-366 → **การที่ brand ตรงกันมีพลังแยกแยะมากกว่าตัวเลข sim** → ใช้ agreement เป็นด่านหลัก, sim เป็น floor กันขยะ

### 3.5 Reference indexing pipeline
สคริปต์ `scripts/index_to_image_embeddings.py` — เอารูป "ของแท้ที่รู้แหล่ง" เข้า DB:
1. เดินโฟลเดอร์ `official/<Brand>/<Collection>/*.jpg`
2. embed ผ่าน edge → 1024-d
3. upsert แถว `watches` (1 รุ่น) + insert `image_embeddings` (1 รูป)
4. **idempotent** บน `image_url` (รันซ้ำได้ ไม่ซ้ำของเดิม)

**ข้อควรระวังตอน bulk index** (เจอจริง):
- **Rate-limit ของ Replicate = hard ~60 prediction-creates/นาที (burst 5)** — *ไม่ใช่* เรื่องเครดิต → ใช้ concurrency **`-P 2/3`** ห้าม `-P 8` (จะโดน 429 รัวๆ)
- **deviceId rotation** ทุก ~350 รูป เพื่อลอด quota ของ edge function (400/device/วัน)
- **`--shard i/n`** (stride) แตกแบรนด์ใหญ่รันขนานได้ ครอบทุกรุ่น
- **fail-fast รูปเสีย** (UnidentifiedImageError) ไม่ retry

---

## 4. Multi-signal fusion

คำตัดสินสุดท้ายหลอมจากหลายสัญญาณ โดยยึดหลัก **asymmetric caution** (§1.3):

| สัญญาณ | แหล่ง | ผลต่อคะแนน |
|---|---|---|
| **Gemini Vision verdict** | LLM multimodal (รูป + prompt ผู้เชี่ยวชาญ) | **คำตัดสินหลัก** |
| **DB-match (Visual RAG)** | `match_watches` + agreement | corroborate (ยืนยัน brand/รุ่น) |
| **A1 real-vs-fake classifier** | โมเดล train บน embedding ของแท้/ปลอม | **หักคะแนนถ้า P(real)<0.5 เท่านั้น** (cap −20, ไม่พลิก verdict; P สูง→ไม่ทำอะไร) |
| **Expert-cert match** | embedding ใบเซอร์ผู้เชี่ยวชาญ | corroborate |
| **Fake-embeddings match** | embedding ของปลอมที่รู้จัก | flag เตือน |
| **Serial/physical check** | rule-based (format + ยุคผลิต) | **หักคะแนนถ้าผิดเท่านั้น** (asymmetric) |
| **Coverage gate** | จำนวนรูป/มุม | **เพดานความมั่นใจ** (≤2 รูป→70% / 3→85% / 4+→~95%) |

**ตัวอย่าง A1 (asymmetric low-weight)** จาก `aiRouter.ts`:
```ts
if (pReal !== null && pReal < 0.5) {           // ชี้ทาง "ปลอม" เท่านั้น
  const MAX_PENALTY = 20;                       // เพดาน — Gemini ยังเป็นคำตัดสินหลัก
  const penalty = Math.round(MAX_PENALTY * (0.5 - pReal) / 0.5);
  identified.authenticityProbability = Math.max(5, before - penalty);
}
// pReal สูง (ชี้ "แท้") → ไม่ทำอะไรเลย เพราะของปลอมเกรดสูงหลอกสัญญาณแท้ได้
```

> **กฎเหล็กของแอปตรวจความแท้:** ระบบควร *ลำเอียงไปทางระวัง* — สัญญาณบวกเชื่อยาก, สัญญาณลบเชื่อง่าย. และต้องประกาศชัดว่าเป็น **"การคัดกรอง (screening)" ไม่ใช่ "การรับรอง (certification)"**

---

## 5. ⭐ การแก้ Cold-Start ที่ได้ผล

### ปัญหา
embed รันบน Replicate (serverless GPU) ที่ **cold-boot ~60-89 วินาที** หลัง idle. ตอนเปิดแอปครั้งแรก ทุกอย่างเย็นพร้อมกัน →
- RAG รอ embed นานเกิน → timeout → **เสีย DB corroboration** (ทั้งที่ DB มีข้อมูล)
- edge function (Gemini) เย็น → scan แรก **fail ขึ้นจอ error**
- scan รวม 134-155s = ผู้ใช้คิดว่าแอปพัง

### ทางออกที่ "ไม่ต้องจ่ายค่า always-warm GPU" — 5 ชั้นรวมกัน

**(a) Keep-warm เชิงรุก**
- Server: **pg_cron** ยิง `embed-image` แบบ `warmOnly` ทุก ~7 นาที (+ GitHub Actions สำรอง)
- Client: `prewarmAll()` (ใน `visualRag.ts`) ยิงตั้งแต่ HomeScreen mount — warm ทั้ง Replicate (`Prefer: wait`) และ HNSW index ล่วงหน้า

**(b) RAG timeout budget — ไม่บล็อก** (`RAG_TIMEOUT_MS = 10000`)
```ts
const embedding = await Promise.race([
  embedPromise,
  new Promise((_, reject) => setTimeout(() => reject(new Error('RAG timeout')), RAG_TIMEOUT_MS)),
]);
// embed ช้า → RAG "SKIPPED" → ใช้ Gemini verdict ไปก่อน ไม่ค้างจอ
```

**(c) ⭐ DB-match SALVAGE — reuse embed ที่มาช้า (ฟรี)**
หัวใจของการแก้ — ถึง RAG จะ timeout ไปแล้ว แต่ A1 classifier *ก็ต้องใช้ embed เดียวกัน* และมันมาทีหลัง → **เอา embed นั้นมา query DB ซ้ำ** กู้ DB-match ที่จะเสียไป:
```ts
// aiRouter.ts ~บรรทัด 1218
if (!identified.visualDbMatch && classifierEmbedding) {
  const late = await findSimilarWatches(classifierEmbedding, 3, 0.0);
  const top = late.candidates[0];
  // gate ด้วย brand-agreement (≥0.13) → กู้คืนโดยไม่ false-corroborate
  if (top && brandsAgree(identified.brand, top.brand) && top.similarity >= 0.13) {
    identified.visualDbMatch = { ...top };
    console.log('[aiRouter] DB-match SALVAGED (late embed, cold scan)');
  }
}
```
→ พิสูจน์แล้ว: cold scan ของ Rolex GMT ที่เคยเสีย DB-match กลับมา match ได้ที่ sim 0.76

**(d) Classifier-await cap** (`CLASSIFIER_AWAIT_CAP_MS = 15000`)
```ts
const pReal = await Promise.race([authClassifierPromise, sleep(15000).then(()=>null)]);
// embed เย็นเกิน 15s → ไปต่อโดยไม่มี classifier (Gemini verdict ยืน)
```
→ cap เวลา cold scan ไว้ที่ ~50s แทน 155s, degrade สวยๆ

**(e) Edge-call retry + escalating backoff** (`callGeminiJson` ใน `geminiAi.ts`)
```ts
const MAX_EDGE_RETRIES = 3;                                  // เคย 2 → ไม่พอตอน cold-open
// ...
await sleep(attempt === 1 ? 1000 : 3000);                    // 1s แล้ว 3s — ให้ edge boot เสร็จ
// 4xx (bad request) → fast-fail ไม่ retry
```
→ scan แรกหลังเปิดแอป (edge เย็น) ไม่ fail ขึ้นจอ error อีก

### สรุปหลักการ Cold-Start
> **อย่าสู้กับ cold-start ด้วยเงิน (always-warm instance ~฿15-20k/เดือน) — สู้ด้วยการออกแบบให้ทน:**
> warm เชิงรุก → ตั้ง budget timeout → **reuse งานที่มาช้าให้คุ้ม (salvage)** → cap เวลา → retry มี backoff. ผลคือ cold scan ช้าลงนิดเดียวและ degrade graceful แทนที่จะพัง

---

## 6. Cost (ต่อ scan, cache-miss)

| ชั้น | ต้นทุน |
|---|---|
| embed (2 รูป, Replicate DINOv3) | ~฿0.60 |
| identify (Gemini Vision) | ~฿0.20 |
| authenticity (Gemini + macro) | ~฿0.30 |
| price/valuation (Gemini + grounding) | ~฿1.50 |
| heatmap (Gemini, on-demand) | ~฿1.00 |
| match RPC + classifier | ~฿0 (DB query / reuse embed) |

รวม: ฟรี-tier ~฿0.50 · จ่ายเต็ม ~฿2.60-3.60. **Margin 93-98%** — DB/RAG แทบไม่มีต้นทุน marginal (ต้นทุนจริงคือ embed + LLM call)

---

## 7. บทเรียน / กับดักที่ต้องรู้

1. **⚠️ อย่าใช้ linear-probe / projection ที่บีบมิติ** — เคย match บน 256-d probe → `same-brand@10 = 3/10 (≈ สุ่ม)` ทำให้ "หาไม่เจอ" เกือบทุก scan. สลับเป็น **raw 1024-d → 10/10 เป๊ะ**. โมเดล projection ที่ train เพื่อ objective อื่นจะ "ยุบ" คลาสเข้าหากัน — **ใช้เวกเตอร์ดิบเสมอ** เว้นแต่จะ train probe เพื่อ retrieval โดยตรงและวัดแล้ว
2. **Rate-limit ไม่ใช่ credit** — Replicate แจ้ง 429 ว่า "< $10 credit" แต่จริงๆ เป็น hard 60/min. อย่าเชื่อ error message → วัดเองด้วยการ probe
3. **Scraper bug: gzip/brotli ไม่ถูก decompress** — รูปที่ scrape มา "เสีย" (UnidentifiedImageError) จริงๆ คือ HTTP response ที่ยังมี `Content-Encoding: gzip/br` → **แค่ gunzip ก็ได้รูปคืน** (ไม่ต้อง re-download). เช็ค magic byte `1f8b` = gzip; brotli → decompress แล้วถ้าเป็น `<!doctype html>` = หน้า error จริง
4. **Probe edge function ตรงๆ เพื่อแยก latency** — POST payload จิ๋วไป edge แล้วจับเวลา → แยกได้ว่าช้าที่ Gemini/Replicate หรือที่ client code
5. **เพดานความมั่นใจตาม coverage** — ยิ่งรูป/มุมน้อย ยิ่ง cap ความมั่นใจต่ำ (ภาพถ่ายมีขีดจำกัด — ตรวจ movement/น้ำหนัก/เสียงไม่ได้)
6. **คอขวดของ "ตัวจับปลอม" คือ data ของปลอมที่ถ่ายด้วยมือถือจริง** — ไม่ใช่รูป studio. classifier ที่ train บนรูปเว็บจะ false-positive กับของปลอมเกรดสูง

---

## 8. การปรับใช้กับแอปส่องพระ (พระเครื่อง)

สถาปัตยกรรมเดียวกันใช้ได้เลย — แค่ map concept:

| แอปนาฬิกา | → แอปส่องพระ |
|---|---|
| brand (Rolex, Patek) | **พิมพ์/สำนัก/วัด** (สมเด็จวัดระฆัง, นางพญา, หลวงปู่ทวด) |
| model / reference | **รุ่น/พิมพ์ทรง/ปีสร้าง** (พิมพ์ใหญ่/เล็ก, รุ่นปี พ.ศ.) |
| `image_embeddings` corpus | **รูปพระแท้ที่รู้แหล่ง** (จากเซียน/ประมูล/หนังสือพระ) — ยิ่งหลายมุม/หลายองค์ต่อพิมพ์ ยิ่งดี |
| รูป macro (มงกุฎ/rehaut/lume) | **เนื้อมวลสาร, คราบ/รารัก, ผิว, ร่องพิมพ์, ด้านหลัง/ยันต์** |
| serial number check | **ไม่มี** → ใช้หลักฐานกายภาพอื่น (เนื้อหา, ธรรมชาติความเก่า, ตำหนิพิมพ์) |
| A1 real-vs-fake | classifier แท้/เก๊ train บน embedding พระแท้ vs พระเก๊ (เน้นเก็บ**รูปเก๊ถ่ายมือถือจริง**) |
| expert-cert match | **บัตรรับรองสมาคม** (เช่น บัตร G-Pra / สมาคมพระเครื่อง) |

**สิ่งที่เหมือนกัน 100% (เอาไปใช้ได้เลย):**
- DINOv3 1024-d + pgvector + HNSW + match RPC
- agreement > absolute-sim (พิมพ์/สำนักตรงกัน = ด่านหลัก)
- asymmetric caution (สัญญาณ "เก๊" หักคะแนน, สัญญาณ "แท้" ไม่เพิ่ม)
- **ชุด cold-start 5 ชั้น (§5) — ลอกได้ทั้งหมด**
- reference indexing pipeline (idempotent, -P 2/3, shard, gunzip fix)
- coverage gate + คำเตือน "คัดกรอง ไม่ใช่รับรอง"

**สิ่งที่ต้องระวังเป็นพิเศษสำหรับพระ:**
- **ความหลากหลายของพิมพ์สูงกว่านาฬิกามาก** — พระพิมพ์เดียวกันมีหลาย "บล็อก/แม่พิมพ์" → ต้องมีรูปอ้างอิงต่อพิมพ์เยอะกว่า (ตั้งเป้า ≥30-50 องค์/พิมพ์)
- **เนื้อมวลสาร & ความเก่าธรรมชาติ** เป็นตัวตัดสินสำคัญ → รูป macro เนื้อ/คราบจำเป็นมาก (coverage gate ควรบังคับมุม macro)
- **ของปลอมพระทำเลียนแบบเก่ง + ตลาดอ่อนไหว** → ยิ่งต้องลำเอียงไปทางระวัง + disclaimer ชัด ("เป็นเครื่องมือช่วยคัดกรองเบื้องต้น ไม่ใช่การรับรองความแท้ ควรให้ผู้เชี่ยวชาญ/สมาคมตรวจสอบขั้นสุดท้าย")
- **กฎหมาย/ความเชื่อ** — ระวังการเคลมเกินจริง; ใช้ภาษา "ความเป็นไปได้/คัดกรอง" ไม่ใช่ "รับรอง"

---

## ไฟล์อ้างอิง (ในแอปนาฬิกา)
| ไฟล์ | บทบาท |
|---|---|
| `src/lib/aiRouter.ts` | ออร์เคสเตรชัน + fusion + cold-start salvage + gates |
| `src/lib/visualRag.ts` | embed, prewarm, `match_watches`, agreement |
| `src/lib/geminiAi.ts` | edge call + retry (`callGeminiJson`) |
| `supabase/functions/embed-image/` | edge: รูป → DINOv3 1024-d (+ keep-warm `warmOnly`) |
| `supabase/functions/analyze-watch/` | edge: Gemini identify/auth/price/heatmap |
| `supabase/migrations/0015_match_watches_1024.sql` | RPC ค้น 1024-d |
| `scripts/index_to_image_embeddings.py` | bulk index รูปอ้างอิงเข้า DB |
| `scripts/_fix_gzipped_images.py` | กู้รูปที่ scraper ห่อ gzip |
| `scripts/_audit_coverage.ts` | รายงาน coverage โฟลเดอร์ vs DB |

---
*สรุป ณ 2026-06-01 · จาก Luxury Watch Authenticator (feat/supabase-auth) · สำหรับทีมแอปส่องพระ*
