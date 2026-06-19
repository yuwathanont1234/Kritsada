# Luxury Authenticator — Project Context for AI Agents

## What you're working on

React Native + Expo app (TypeScript strict, SDK 54, RN 0.81) that lets users photograph luxury watches (Rolex, AP, Patek, Omega) and brand-name bags (Hermès, Chanel, LV) then returns:
- **Identification** — brand, model, reference, year
- **Authenticity verdict** — REAL / SUSPICIOUS / LIKELY FAKE + confidence %
- **Heatmap** — visual regions supporting/contradicting the verdict
- **Market price** — resale band via grounded web search

**Owner:** Kritsada Yuwathanont (solo founder)  
**Stack:** React Native 0.81 + Expo SDK 54 + Supabase (Postgres + pgvector) + Replicate (DINOv3) + Gemini 2.5 + EAS  
**Tiers:** Free / Standard (990฿) / Pro (1990฿) / Premium (4990฿)  
**Languages:** Thai + English (both always required)

---

## Hard Constraints (never violate)

1. **No secrets in code.** Never touch `.env`, never commit credentials, never touch git history.
2. **TypeScript strict stays on.** Fix types — never relax `tsconfig.json`.
3. **Localization is symmetric.** Every user-facing string needs TH + EN in `src/lib/localization.ts`. Use `useLanguage()` — no hardcoded strings in screens.
4. **Tier model is fixed.** Free / Standard / Pro / Premium. No "unlimited" paths. Every quota has a hard cap.
5. **Read tier via `effectiveCaps()`** — never read raw `tier` field (trial users get Premium caps while `tier === 'free'`).
6. **No new tests** unless a task explicitly requires it.
7. **Leave `src/lib/geminiAi.ts` alone** unless a task specifically targets it.

---

## UI/UX Design Rules (enforced on all screen work)

> Full reference: `UIUX_SKILLS.md` — read it before touching any screen or component.

### Spacing (8px grid)
- All spacing must be a multiple of 8: `8, 16, 24, 32, 48, 64`
- Section spacing ≥ 2× item spacing (e.g. section = 32px, item = 16px)
- Card padding: `16px` all sides, consistent across every card

### Typography Scale
| Role | Size | Weight | Line Height |
|------|------|--------|------------|
| Display | 32px | 700 | 40px |
| H1 | 24px | 700 | 32px |
| H2 | 20px | 600 | 28px |
| Body | **16px min** | 400 | 24px |
| Caption | 12px | 400 | 18px |
| Tab label | 11px | 500 | 16px |

- Body text **never below 16px**
- WCAG contrast: normal text ≥ 4.5:1, large text ≥ 3:1
- No font weight 100–300 on light backgrounds

### Color Palette
| Use | Hex | Contrast on #FFF |
|-----|-----|-----------------|
| Primary text | `#1A1A1A` | 17.8:1 ✅ |
| Secondary text | `#555555` | 7.4:1 ✅ |
| Muted (large text only) | `#888888` | 3.5:1 ⚠️ |
| Brand Gold | `#B8860B` | 4.7:1 ✅ |
| Error Red | `#D32F2F` | 5.9:1 ✅ |

### Card Rules
- Border radius: `12–16px`
- Shadow: `elevation: 2` / `shadowOpacity: 0.08, shadowRadius: 8`
- 1 concept per card, text ≤ 3 lines / ~100 characters
- Primary CTA (filled) on right, secondary (outline) on left

### Visual Hierarchy
- Values/numbers (e.g. 97% confidence, ฿1,250,000) must be **larger and bolder** than their labels
- Cancel button LEFT, Confirm button RIGHT — always
- Icon style must be consistent across the whole app (outlined or filled, never mixed)
- Active tab: ≥ 2 changes (color + icon style)

### Bottom Navigation
- 3–5 tabs only
- Icon: 24px, Label: 10–12px, Touch target: ≥ 44×44px
- Active tint: `#B8860B` (Brand Gold)
- Respect iOS safe area (`insets.bottom`)

### Interaction & Feedback
- Animation duration: 100–300ms for user-triggered, max 500ms for complex
- Use `Haptics.notificationAsync(Success/Error/Warning)` for scan results
- Use skeleton screens (not spinners) while AI processes
- Progressive disclosure: show scan result first, specs on tap, premium features gated

### Micro-copy (Thai/English)
- Button labels: verb + noun, short ("สแกนนาฬิกา" not "คลิกเพื่อเริ่มต้นสแกน")
- Error messages: state the problem + solution ("ภาพไม่ชัด — ถ่ายในที่มีแสงสว่าง")
- Empty states: explain + CTA ("ยังไม่มีรายการ — เริ่มสแกนนาฬิกาเรือนแรก")

### Paywall (MembershipScreen)
- Use trial timeline (Today → Day 5 → Day 7) not feature list
- Show exact charge date in timeline
- CTA: "เริ่มทดลองฟรี 7 วัน" — never "Subscribe"
- Subtext: "ยกเลิกได้ทุกเมื่อ ไม่มีค่าธรรมเนียมซ่อน"

### Luxury App Aesthetic
- Generous spacing = luxury (never cramped)
- Font weight 600–700 for brand/model names
- Neutral/cool color palette — no loud saturated colors
- Confidence % and verdict badge = maximum visual priority

---

## Key Files

| File | Purpose |
|------|---------|
| `UIUX_SKILLS.md` | Full UI/UX design skills & guidelines (13 skills) |
| `ANTIGRAVITY_HANDOFF.md` | 12 refactor tasks with acceptance criteria |
| `luxury-authenticator-blueprint.md` | Full architecture spec |
| `src/lib/localization.ts` | All TH/EN strings |
| `src/lib/tier.ts` | Tier capability matrix |
| `src/lib/userProfile.ts` | User segmentation |
| `src/lib/geminiAi.ts` | AI pipeline — touch only if task says so |

---

## Before writing any UI code

1. Read `UIUX_SKILLS.md` for the relevant section
2. Check spacing is on 8px grid
3. Check text uses the typography scale above
4. Check WCAG contrast
5. Add both TH + EN localization keys
6. Check touch targets ≥ 44×44px
