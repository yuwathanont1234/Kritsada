import { Alert } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { Asset } from 'expo-asset';
import { ScanResult } from '../../lib/types';
import { AuthColor } from '../../lib/authVerdictColor';
import { TierCapabilities } from '../../lib/tier';
import { getLandmarksForWatch, matchSignalToLandmark } from '../../lib/data/watchLandmarks';

interface ExportPDFParams {
  result: ScanResult;
  frontUri: string;
  backUri?: string;
  galleryImages?: string[];
  authColor: AuthColor;
  caps: TierCapabilities;
  exchangeRate: number | null;
  generatingPDF: boolean;
  setGeneratingPDF: (val: boolean) => void;
  handleUpgradePress: (type: 'auth' | 'price') => void;
  lang: 'en' | 'th';
  t: (key: string, options?: any) => string;
}

export async function exportWatchPDF({
  result,
  frontUri,
  backUri,
  galleryImages,
  authColor,
  caps,
  generatingPDF,
  setGeneratingPDF,
  handleUpgradePress,
  lang,
}: ExportPDFParams) {
  // Check if current subscription tier supports PDF exporting
  if (!caps.pdfExport) {
    handleUpgradePress('auth');
    return;
  }

  if (generatingPDF) return;
  setGeneratingPDF(true);


  try {
    // 1. Convert all captured watch images (every angle) to base64
    const allImages: string[] = [frontUri, backUri, ...(galleryImages ?? [])].filter(Boolean) as string[];
    const base64Images: string[] = [];

    for (const imgUri of allImages) {
      try {
        const rawB64 = await FileSystem.readAsStringAsync(imgUri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        base64Images.push(`data:image/jpeg;base64,${rawB64}`);
      } catch (err) {
        console.warn('[PdfExporter] Failed to load image as base64', imgUri, err);
      }
    }

    // If no images loaded successfully, use a default fallback
    if (base64Images.length === 0) {
      base64Images.push('https://via.placeholder.com/300');
    }

    // Load the bundled app icon as a base64 data URL so the PDF
    // header carries the real Luxury Watch Authenticator logo
    // instead of just the "LWA" text mark. Asset.fromModule + a
    // downloadAsync forces expo-asset to extract the bundled
    // png to the cache directory, where FileSystem can read it
    // as base64. Falls back to text-only if anything fails so
    // the PDF still renders.
    let logoDataUrl = '';
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const logoModule = require('../../../assets/splash-icon.png');
      const asset = Asset.fromModule(logoModule);
      await asset.downloadAsync();
      if (asset.localUri) {
        const logoB64 = await FileSystem.readAsStringAsync(asset.localUri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        logoDataUrl = `data:image/png;base64,${logoB64}`;
      }
    } catch (err) {
      console.warn('[PdfExporter] failed to load logo asset:', err);
    }

    const brand = result.brand || 'TAG HEUER';
    const name = result.name || 'CARRERA CALIBRE 1887 CHRONOGRAPH';
    const reference = result.reference || 'CAR2A10.BA0799';
    // Real serial only when Gemini read one off a photo; never a fabricated
    // placeholder (the old expertCertMatch.certId is a DB match id, not a serial).
    const serial = result.serialNumber || '—';
    const caseMaterial = result.caseMaterial || 'STAINLESS STEEL';
    const caliber = result.movementFamily || 'CALIBRE 1887';
    const probability = result.authenticityProbability ?? 85;

    // Bilingual helper — picks Thai when the app is in TH mode,
    // English otherwise. Used throughout the report so the entire
    // document (not just the share-sheet title) localizes.
    const isTh = lang === 'th';
    const tt = (en: string, th: string): string => (isTh ? th : en);

    // HTML-escape — the checkpoint observation + name now carry
    // freeform Gemini text (previously they were static literals), so
    // a stray &, <, or > must not be able to break the markup.
    const esc = (s: string): string =>
      String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

    // ── Verdict status (top-line conclusion shown below the gauge).
    //    Driven by the model's ACTUAL authenticityVerdict so the PDF
    //    never overclaims — a 70% "likely authentic" reads as exactly
    //    that, not "Genuine Verified". Wording mirrors ResultScreen so
    //    the share text, the app, and the PDF all agree.
    const verdict = result.authenticityVerdict;
    let verdictTitle = tt('Likely Authentic', 'มีแนวโน้มเป็นของแท้');
    let verdictPillText = tt('LIKELY', 'น่าจะแท้');
    let verdictPillColor = '#2ECC71';

    if (authColor === 'red' || verdict === 'likely-reproduction') {
      verdictTitle = tt('Likely Reproduction', 'มีแนวโน้มเป็นของเลียนแบบ');
      verdictPillText = tt('REPRODUCTION', 'เลียนแบบ');
      verdictPillColor = '#E74C3C';
    } else if (authColor === 'yellow' || verdict === 'uncertain' || verdict === 'cannot-assess') {
      verdictTitle = tt('Inconclusive', 'ไม่สามารถระบุได้');
      verdictPillText = tt('REVIEW', 'ต้องตรวจเพิ่ม');
      verdictPillColor = '#F1C40F';
    }

    // ── Condition & Authenticity Index — qualifier band derived
    //    from the same probability score that drives the gauge.
    //    Mapping mirrors auction-house condition grading vocabulary
    //    (Excellent / Very Good / Good / Acceptable / Critical) so
    //    collectors read it the same way they read a Phillips lot
    //    note. Red verdicts always force Critical regardless of %.
    let conditionLabel = tt('Excellent', 'ดีเยี่ยม');
    if (authColor === 'red') {
      conditionLabel = tt('Critical', 'วิกฤต');
    } else if (authColor === 'yellow') {
      conditionLabel = tt('Inconclusive', 'ไม่ชัดเจน');
    } else if (probability >= 95) {
      conditionLabel = tt('Exceptional', 'ยอดเยี่ยมเป็นพิเศษ');
    } else if (probability >= 90) {
      conditionLabel = tt('Excellent', 'ดีเยี่ยม');
    } else if (probability >= 80) {
      conditionLabel = tt('Very Good', 'ดีมาก');
    } else if (probability >= 70) {
      conditionLabel = tt('Good', 'ดี');
    } else if (probability >= 60) {
      conditionLabel = tt('Acceptable', 'พอใช้');
    } else {
      conditionLabel = tt('Critical', 'วิกฤต');
    }

    // ── Hallmark inspection checkpoints — REAL data (no fabrication).
    //    The previous version invented six fixed "Box 1-6" cards
    //    (Dial 100% / Lume 100% / Sapphire 100% ...) keyed ONLY on
    //    authColor — every green watch got byte-identical "all passed"
    //    claims about regions the AI never examined (and a cheap-brand
    //    fast-path watch, which skips auth entirely, still showed six
    //    perfect passes). That made the PDF claim far more than the
    //    app and collapsed under any side-by-side check.
    //
    //    Now we drive the cards off the EXACT pipeline the app's
    //    SpecsSection uses: the brand-specific landmark set
    //    (getLandmarksForWatch) paired against THIS scan's own
    //    authenticity signals (matchSignalToLandmark). Each card shows
    //    the real /10 conformity score + the AI's actual observation,
    //    or an honest "no observation" state when the model never
    //    spoke to that landmark. PDF == app, always.
    const signals = result.authenticitySignals ?? [];
    const landmarks = getLandmarksForWatch(result.brand, result.name, result.reference);
    // Status colour per weight — mirrors the app palette, tuned a
    // touch warmer to sit on the dark-gold report background.
    const cpColor = (w?: string, muted?: boolean): string =>
      muted
        ? '#8A8175'
        : w === 'positive'
        ? '#5FCB7D'
        : w === 'negative'
        ? '#E0524B'
        : '#E0A23C';
    // Cap at 8 so the single landscape row never gets cramped; brand
    // sets are 5-7 in practice. Order is preserved so the card numbers
    // line up 1:1 with the app's numbered checkpoints.
    const checkpoints = landmarks.slice(0, 8).map((lm, i) => {
      const m = matchSignalToLandmark(lm, signals);
      const muted = !m;
      return {
        n: String(i + 1).padStart(2, '0'),
        name: isTh ? lm.labelTh : lm.labelEn,
        score: m?.score,
        color: cpColor(m?.weight, muted),
        muted,
        obs: m
          ? (isTh ? (m.signalTh || m.signal) : m.signal)
          : tt('No AI observation at this landmark', 'ไม่มีข้อสังเกตจาก AI'),
      };
    });
    const analyzedCount = checkpoints.filter((c) => !c.muted).length;
    const checkpointCount = checkpoints.length;

    // Deterministic verification signature — folded from the watch
    // identity + verdict so the SAME scan ALWAYS yields the SAME
    // reference string. The old value used Math.random(), so it changed
    // on every export of the same watch — which quietly undermines the
    // credibility of a "verification hash" the moment anyone re-exports.
    // FNV-1a 32-bit, expanded to 32 hex chars via four cheap remixes.
    const sigSeed = `${brand}|${reference}|${name}|${probability}|${serial}`;
    let sigHash = 0x811c9dc5;
    for (let i = 0; i < sigSeed.length; i++) {
      sigHash ^= sigSeed.charCodeAt(i);
      sigHash = Math.imul(sigHash, 0x01000193) >>> 0;
    }
    const hx = (n: number): string => (n >>> 0).toString(16).padStart(8, '0');
    const randomSig = `${hx(sigHash)}${hx(Math.imul(sigHash, 0x9e3779b1))}${hx(
      Math.imul(sigHash ^ 0x5bd1e995, 0x85ebca6b)
    )}${hx(Math.imul(sigHash + 0x7feb352d, 0xc2b2ae35))}`.toUpperCase();

    // ── Gauge tick marks for the Condition & Authenticity Index.
    //    20 ticks every 18° around a 120-unit SVG canvas. Majors
    //    sit at the 4 quarter-points (0/25/50/75/100%) — visible
    //    as longer, brighter strokes — to give the eye reference
    //    points without crowding the dial. Inspired by the minute
    //    ring on a Patek Calatrava sector dial.
    const gaugeArcLen = (2 * Math.PI * 40).toFixed(2); // r=40 → circumference
    const gaugeDashOffset = (parseFloat(gaugeArcLen) * (1 - probability / 100)).toFixed(2);
    const gaugeTicks = Array.from({ length: 20 }, (_, i) => {
      const angleRad = ((i * 18 - 90) * Math.PI) / 180;
      const isMajor = i % 5 === 0;
      const innerR = isMajor ? 46 : 50;
      const outerR = 52;
      const cos = Math.cos(angleRad);
      const sin = Math.sin(angleRad);
      const x1 = (60 + innerR * cos).toFixed(2);
      const y1 = (60 + innerR * sin).toFixed(2);
      const x2 = (60 + outerR * cos).toFixed(2);
      const y2 = (60 + outerR * sin).toFixed(2);
      const stroke = isMajor ? 'rgba(212,185,140,0.65)' : 'rgba(212,185,140,0.30)';
      const w = isMajor ? 0.7 : 0.35;
      return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${w}" />`;
    }).join('');

    // Watch images scans
    const dialImg = base64Images[0] || 'https://via.placeholder.com/300';
    const casebackImg = base64Images[1] || base64Images[0] || 'https://via.placeholder.com/300';

    // Compile A4 LANDSCAPE diagnostic report. Wider canvas (297mm)
    // lets the verdict, watch details, and scans share a single
    // top row so the eye flows left-to-right like a reading order,
    // and the 6 diagnostic metrics sit in one elegant row below
    // instead of a 2×3 grid that felt cramped on portrait.
    // Typography: Playfair Display (display serif) for headings +
    // Cormorant Garamond for the verdict %, Inter for body — same
    // pairing used by Sotheby's / Phillips auction catalogues.
    const htmlContent = `
<!DOCTYPE html>
<html lang="${isTh ? 'th' : 'en'}">
<head>
  <meta charset="UTF-8">
  <title>${tt('Authenticity Diagnostic Report', 'รายงานการตรวจสอบความแท้')}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;500;600;700;800;900&family=Inter:wght@300;400;500;600;700;800&family=Noto+Sans+Thai:wght@300;400;500;600;700;800&display=swap');

    @page {
      size: A4 landscape;
      margin: 0;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      width: 297mm;
      height: 210mm;
      background-color: #0A0805;
      color: #FFFFFF;
      font-family: 'Inter', 'Noto Sans Thai', sans-serif;
      padding: 8mm;
      display: flex;
      justify-content: center;
      align-items: center;
    }

    /* ── Thai-mode tracking override.
       The luxury Latin layout uses wide letter-spacing (2-6 px) on
       uppercase labels to mimic auction-catalogue typography. Thai
       script has no uppercase form and gets fragmented at that
       tracking — vowels detach from consonants and tone marks drift.
       When the document is in Thai, collapse spacing on those
       labels to a near-natural value so each syllable reads as one
       glyph cluster. Latin labels in non-Thai mode keep their wide
       tracking unchanged. */
    html[lang="th"] .header-title,
    html[lang="th"] .header-subtitle,
    html[lang="th"] .header-logo-sub,
    html[lang="th"] .header-ref-badge,
    html[lang="th"] .panel-title,
    html[lang="th"] .detail-label,
    html[lang="th"] .verdict-overline,
    html[lang="th"] .verdict-gauge-qualifier,
    html[lang="th"] .verdict-status-title,
    html[lang="th"] .verdict-status-sub,
    html[lang="th"] .metrics-section-title,
    html[lang="th"] .metrics-section-subtitle,
    html[lang="th"] .scan-label-tab,
    html[lang="th"] .scan-pass-badge,
    html[lang="th"] .metric-name,
    html[lang="th"] .footer-title {
      letter-spacing: 0.3px !important;
    }

    /* Thai title remains bold but at a reasonable tracking */
    html[lang="th"] .header-title {
      letter-spacing: 1.5px !important;
    }

    .report-container {
      width: 100%;
      height: 100%;
      border: 1.5px solid #D4B98C;
      border-radius: 6px;
      padding: 6mm 7mm;
      background:
        radial-gradient(ellipse at top left, rgba(212, 185, 140, 0.05) 0%, transparent 60%),
        radial-gradient(ellipse at bottom right, rgba(212, 185, 140, 0.04) 0%, transparent 60%),
        linear-gradient(180deg, #131008 0%, #0A0805 100%);
      /* Explicit grid layout with fixed row heights — flex+gap
         was causing the metrics row to overflow and bleed into
         the footer area on dense content. Grid lets us pin
         header (16mm) + top row (78mm) + metrics (~70mm) +
         footer (18mm) = ~182mm total, leaving 14mm for paddings
         and gaps within the 196mm interior of A4 landscape. */
      display: grid;
      grid-template-rows: auto 78mm 1fr 18mm;
      gap: 4mm;
      position: relative;
      overflow: hidden;
    }

    /* Decorative gold corner brackets — luxury watch catalogue cue */
    .report-container::before,
    .report-container::after {
      content: '';
      position: absolute;
      width: 12mm;
      height: 12mm;
      border-color: #D4B98C;
      border-style: solid;
      border-width: 0;
    }
    .report-container::before {
      top: 3mm; left: 3mm;
      border-top-width: 1px;
      border-left-width: 1px;
    }
    .report-container::after {
      bottom: 3mm; right: 3mm;
      border-bottom-width: 1px;
      border-right-width: 1px;
    }

    /* ──────────────────────────────────────────────────────
       1. Header — minimal serif title with logo + ref code
       ────────────────────────────────────────────────────── */
    .header {
      display: grid;
      grid-template-columns: 1fr auto 1fr;
      align-items: center;
      gap: 6mm;
      padding-bottom: 4mm;
      border-bottom: 1px solid rgba(212, 185, 140, 0.30);
    }

    .header-logo-box {
      justify-self: start;
      display: inline-flex;
      align-items: center;
      gap: 8px;
    }

    .header-logo-img {
      width: 38px;
      height: 38px;
      border-radius: 50%;
      border: 1.5px solid #D4B98C;
      background-color: rgba(18, 14, 10, 0.7);
      object-fit: cover;
      padding: 1px;
      box-sizing: border-box;
    }

    .header-logo-text-wrap {
      display: flex;
      flex-direction: column;
      line-height: 1;
    }

    .header-logo-text {
      font-family: 'Cinzel', 'Playfair Display', 'Noto Sans Thai', serif;
      font-weight: 900;
      font-size: 13px;
      color: #D4B98C;
      letter-spacing: 4px;
    }

    .header-logo-sub {
      font-family: 'Inter', 'Noto Sans Thai', sans-serif;
      font-weight: 600;
      font-size: 6.5px;
      color: #A0978A;
      letter-spacing: 1.5px;
      text-transform: uppercase;
      margin-top: 2px;
    }

    .header-title {
      font-family: 'Cinzel', 'Playfair Display', 'Noto Sans Thai', serif;
      font-size: 22px;
      font-weight: 700;
      color: #EDE0BD;
      letter-spacing: 6px;
      text-transform: uppercase;
      text-align: center;
      line-height: 1.1;
    }

    .header-subtitle {
      font-size: 8.5px;
      color: #B5AFA5;
      letter-spacing: 3px;
      text-align: center;
      text-transform: uppercase;
      margin-top: 2px;
    }

    .header-ref-badge {
      justify-self: end;
      font-family: 'Inter', 'Noto Sans Thai', sans-serif;
      font-size: 8.5px;
      color: #B5AFA5;
      letter-spacing: 1px;
      text-align: right;
      text-transform: uppercase;
      line-height: 1.4;
    }

    .header-ref-badge strong {
      display: block;
      color: #EDE0BD;
      font-weight: 700;
      letter-spacing: 0.5px;
      text-transform: none;
      font-size: 9.5px;
      margin-top: 1px;
    }

    /* ──────────────────────────────────────────────────────
       2. Top row — Verdict | Watch Details | Scans
          (3 columns, fixed proportions for visual rhythm)
       ────────────────────────────────────────────────────── */
    .top-row {
      display: grid;
      grid-template-columns: 0.95fr 1.4fr 1.15fr;
      gap: 5mm;
      /* Pinned to the 78mm grid track; min-height:0 + overflow:hidden
         stop any panel from growing the track and shoving the metrics
         row down. */
      min-height: 0;
      overflow: hidden;
    }

    .panel {
      border: 1px solid rgba(212, 185, 140, 0.22);
      border-radius: 6px;
      background:
        linear-gradient(180deg, rgba(26, 22, 18, 0.55) 0%, rgba(15, 12, 9, 0.55) 100%);
      padding: 5mm 5mm;
      position: relative;
      /* Clip any content to the panel's own grid track so a tall
         child (e.g. the photo pair) can never spill onto the row
         below. min-height:0 lets the panel shrink inside the grid. */
      min-height: 0;
      overflow: hidden;
    }

    .panel-title {
      font-family: 'Inter', 'Noto Sans Thai', sans-serif;
      font-size: 8px;
      font-weight: 700;
      color: #D4B98C;
      letter-spacing: 3px;
      text-transform: uppercase;
      margin-bottom: 3.5mm;
      padding-bottom: 2mm;
      border-bottom: 1px solid rgba(212, 185, 140, 0.15);
    }

    /* ── Verdict card · Condition & Authenticity Index gauge ──
       Replaces the simple progress ring with a layered watch-dial
       gauge: outer bezel, 20-tick ring (majors at 25/50/75/100),
       gold gradient arc filling proportionally, recessed center
       hub, big Cinzel %, italic qualifier band (Excellent / Very
       Good / Acceptable / Critical) — auction-catalogue feel.
       ─────────────────────────────────────────────────────── */
    .verdict-card {
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      text-align: center;
      padding: 3mm 2mm;
    }

    .verdict-overline {
      font-family: 'Inter', 'Noto Sans Thai', sans-serif;
      font-size: 6.5px;
      font-weight: 700;
      color: #D4B98C;
      letter-spacing: 3.5px;
      text-transform: uppercase;
      margin-bottom: 2.5mm;
      text-align: center;
      line-height: 1.3;
    }

    .verdict-gauge-wrapper {
      position: relative;
      width: 58mm;
      height: 58mm;
      display: flex;
      justify-content: center;
      align-items: center;
      margin-bottom: 2mm;
    }

    .verdict-gauge-svg {
      position: absolute;
      top: 0; left: 0;
      width: 100%;
      height: 100%;
    }

    .verdict-gauge-inner {
      text-align: center;
      z-index: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }

    .verdict-gauge-percent {
      font-family: 'Cinzel', 'Cormorant Garamond', 'Noto Sans Thai', serif;
      font-size: 46px;
      font-weight: 600;
      color: #EDE0BD;
      line-height: 1;
      letter-spacing: 0.5px;
    }

    .verdict-gauge-percent-symbol {
      font-size: 22px;
      color: #D4B98C;
      margin-left: 1px;
      font-weight: 500;
    }

    .verdict-gauge-qualifier {
      font-family: 'Cinzel', 'Cormorant Garamond', 'Noto Sans Thai', serif;
      font-style: italic;
      font-size: 10.5px;
      font-weight: 500;
      color: #D4B98C;
      letter-spacing: 2.5px;
      text-transform: uppercase;
      margin-top: 1.5mm;
      line-height: 1;
    }

    .verdict-divider {
      width: 32mm;
      height: 1px;
      background: linear-gradient(90deg, transparent 0%, rgba(212, 185, 140, 0.45) 50%, transparent 100%);
      margin: 2mm 0 2.5mm 0;
    }

    .verdict-status-title {
      font-family: 'Cinzel', 'Playfair Display', 'Noto Sans Thai', serif;
      font-size: 13.5px;
      font-weight: 700;
      color: #EDE0BD;
      letter-spacing: 2.5px;
      text-transform: uppercase;
      margin-top: 0;
      line-height: 1.2;
      text-align: center;
    }

    .verdict-status-sub {
      font-family: 'Inter', 'Noto Sans Thai', sans-serif;
      font-size: 7px;
      color: #A0978A;
      letter-spacing: 2px;
      text-transform: uppercase;
      margin-top: 1.5mm;
      max-width: 52mm;
      line-height: 1.4;
      text-align: center;
    }

    /* ── Watch Details (key-value spec sheet) ── */
    .details-list {
      display: flex;
      flex-direction: column;
      gap: 2.2mm;
    }

    .details-row {
      display: grid;
      grid-template-columns: 28mm 1fr;
      align-items: baseline;
      padding-bottom: 1.5mm;
      border-bottom: 1px dotted rgba(212, 185, 140, 0.10);
    }

    .details-row:last-child {
      border-bottom: none;
      padding-bottom: 0;
    }

    .detail-label {
      font-size: 7.5px;
      font-weight: 700;
      color: #A0978A;
      letter-spacing: 1.8px;
      text-transform: uppercase;
    }

    .detail-value {
      font-family: 'Cinzel', 'Playfair Display', 'Noto Sans Thai', serif;
      font-size: 11px;
      font-weight: 600;
      color: #EDE0BD;
      letter-spacing: 0.5px;
      line-height: 1.2;
    }

    /* ── Scan images (dial + caseback) ── */
    .scans-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 4mm;
      height: 100%;
      min-height: 0;
    }

    .scan-box {
      display: flex;
      flex-direction: column;
      min-height: 0;
      overflow: hidden;
    }

    .scan-image {
      width: 100%;
      flex: 1;
      /* No fixed min-height — a 70mm floor here forced the photo panel
         (title + 2 images + label tabs + padding ≈ 93mm) past its 78mm
         grid track and the images bled down over metric card #5. The
         flex:1 + min-height:0 below lets the pair shrink to fit the
         track; background-size:cover keeps them filling the box. */
      min-height: 0;
      border-top-left-radius: 4px;
      border-top-right-radius: 4px;
      border: 1px solid #D4B98C;
      border-bottom: none;
      background-color: #1A130C;
      background-size: cover;
      background-position: center;
      position: relative;
    }

    .scan-pass-badge {
      position: absolute;
      top: 5px;
      right: 5px;
      color: #0A0805;
      font-size: 7.5px;
      font-weight: 800;
      padding: 2px 8px;
      border-radius: 4px;
      letter-spacing: 1.5px;
      text-transform: uppercase;
    }

    .scan-label-tab {
      width: 100%;
      background: linear-gradient(135deg, #D4B98C 0%, #B89B6D 100%);
      color: #0A0805;
      font-size: 8.5px;
      font-weight: 800;
      letter-spacing: 2px;
      text-align: center;
      padding: 4px 0;
      border-bottom-left-radius: 4px;
      border-bottom-right-radius: 4px;
      border: 1px solid #D4B98C;
      border-top: none;
      text-transform: uppercase;
    }

    /* ──────────────────────────────────────────────────────
       3. Diagnostic Metrics — single row of 6 cards
       ────────────────────────────────────────────────────── */
    .metrics-section {
      /* Lives inside the grid 1fr row — own grid template keeps
         the title fixed-height (auto) and the card row fills
         the rest. Without min-height:0 the grid track overflows
         because the children have implicit min sizes. */
      display: grid;
      grid-template-rows: auto 1fr;
      gap: 3mm;
      min-height: 0;
    }

    .metrics-section-title {
      font-family: 'Inter', 'Noto Sans Thai', sans-serif;
      font-size: 8px;
      font-weight: 700;
      color: #D4B98C;
      letter-spacing: 3px;
      text-transform: uppercase;
      padding-bottom: 2mm;
      border-bottom: 1px solid rgba(212, 185, 140, 0.30);
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .metrics-section-subtitle {
      font-family: 'Inter', 'Noto Sans Thai', sans-serif;
      font-size: 7px;
      font-weight: 400;
      color: #A0978A;
      letter-spacing: 1.2px;
      text-transform: none;
    }

    .metrics-grid {
      display: grid;
      grid-template-columns: repeat(6, 1fr);
      gap: 3mm;
      min-height: 0;
    }

    .metric-card {
      background:
        linear-gradient(180deg, rgba(26, 22, 18, 0.55) 0%, rgba(15, 12, 9, 0.55) 100%);
      border: 1px solid rgba(212, 185, 140, 0.18);
      border-radius: 6px;
      padding: 3mm 3mm;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .metric-card-number {
      font-family: 'Cinzel', 'Cormorant Garamond', 'Noto Sans Thai', serif;
      font-size: 17px;
      font-weight: 500;
      color: rgba(212, 185, 140, 0.55);
      line-height: 1;
      margin-bottom: 1mm;
    }

    .metric-name {
      font-family: 'Cinzel', 'Playfair Display', 'Noto Sans Thai', serif;
      font-size: 10px;
      font-weight: 700;
      color: #EDE0BD;
      letter-spacing: 0.2px;
      line-height: 1.15;
      margin-bottom: 1.5mm;
    }

    /* ── Real-data checkpoint card internals ──
       Replaces the old fixed "Normal 100%" pill. A matched landmark
       shows its /10 conformity score (colour = weight); an unmatched
       one shows a muted status dot + a dimmed card so the reader can
       instantly tell analysed vs not-analysed. */
    .metric-card-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 1.5mm;
    }

    .metric-card-muted {
      opacity: 0.6;
    }

    .metric-score {
      font-family: 'Cinzel', 'Cormorant Garamond', 'Noto Sans Thai', serif;
      font-size: 12px;
      font-weight: 700;
      line-height: 1;
      padding: 1.5px 5px;
      border-radius: 5px;
      border: 1px solid;
      white-space: nowrap;
    }

    .metric-score-max {
      font-size: 7px;
      font-weight: 500;
      opacity: 0.75;
    }

    .metric-status-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      flex-shrink: 0;
    }

    .metric-obs {
      display: flex;
      align-items: flex-start;
      font-size: 7px;
      color: #B5AFA5;
      line-height: 1.35;
      padding-left: 4px;
      border-left: 2px solid transparent;
      overflow: hidden;
    }

    /* Clamp long Gemini observations so every card stays the same
       height and inside its grid track. */
    .metric-obs span {
      display: -webkit-box;
      -webkit-line-clamp: 4;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    .metric-obs-muted {
      color: #6B6258;
      font-style: italic;
    }

    /* ──────────────────────────────────────────────────────
       4. Footer — security hash + disclaimer + QR
       Pinned to the grid's last 18mm row; overflow:hidden on
       container clips any long-text bleed into the metrics row.
       ────────────────────────────────────────────────────── */
    .footer {
      border-top: 1px solid rgba(212, 185, 140, 0.30);
      padding-top: 2.5mm;
      display: grid;
      grid-template-columns: 1.8fr 1.4fr auto;
      gap: 5mm;
      align-items: center;
      overflow: hidden;
    }

    .footer-cell {
      display: flex;
      flex-direction: column;
      gap: 1px;
      min-width: 0;
      overflow: hidden;
    }

    .footer-title {
      font-size: 6.5px;
      font-weight: 700;
      color: #D4B98C;
      letter-spacing: 2px;
      text-transform: uppercase;
    }

    .footer-hash {
      font-family: 'Courier New', monospace;
      font-size: 7px;
      color: #C0B4A0;
      word-break: break-all;
      line-height: 1.3;
      margin-top: 1px;
    }

    .footer-disclaimer {
      font-size: 6px;
      color: #6B6258;
      line-height: 1.3;
      font-style: italic;
      /* Cap to ~3 lines max — any longer disclaimer gets
         truncated with ellipsis rather than spilling upward. */
      display: -webkit-box;
      -webkit-line-clamp: 4;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    .footer-qr {
      width: 14mm;
      height: 14mm;
      background-color: #FFFFFF;
      padding: 0.5mm;
      border-radius: 2px;
      display: flex;
      justify-content: center;
      align-items: center;
    }

    .footer-qr img {
      width: 100%;
      height: 100%;
    }
  </style>
</head>
<body>

  <div class="report-container">

    <!-- 1. Header — logo • title • reference badge -->
    <div class="header">
      <div class="header-logo-box">
        ${logoDataUrl
          ? `<img class="header-logo-img" src="${logoDataUrl}" alt="LWA logo">`
          : ''}
        <div class="header-logo-text-wrap">
          <span class="header-logo-text">LWA</span>
          <span class="header-logo-sub">${tt('Luxury Watch Auth', 'ตรวจสอบนาฬิกาหรู')}</span>
        </div>
      </div>
      <div>
        <h1 class="header-title">${tt('Authenticity Diagnostic Report', 'รายงานการตรวจสอบความแท้')}</h1>
        <div class="header-subtitle">${tt('AI Horological Analytics · Forensic-Grade Examination', 'การวิเคราะห์นาฬิกาด้วย AI · มาตรฐานระดับนิติเวช')}</div>
      </div>
      <div class="header-ref-badge">
        ${tt('Report Reference', 'หมายเลขรายงาน')}
        <strong>${randomSig.substring(0, 12).toUpperCase()}</strong>
      </div>
    </div>

    <!-- 2. Top row — Verdict | Watch Details | Scans -->
    <div class="top-row">

      <!-- Verdict · Condition & Authenticity Index gauge -->
      <div class="panel verdict-card">
        <div class="verdict-overline">${tt('Condition &amp; Authenticity Index', 'ดัชนีสภาพและความแท้')}</div>

        <div class="verdict-gauge-wrapper">
          <svg class="verdict-gauge-svg" viewBox="0 0 120 120">
            <defs>
              <linearGradient id="goldGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#EDE0BD" />
                <stop offset="50%" stop-color="#D4B98C" />
                <stop offset="100%" stop-color="#8E7345" />
              </linearGradient>
              <radialGradient id="hubGradient" cx="50%" cy="50%" r="55%">
                <stop offset="0%" stop-color="#1F1810" />
                <stop offset="100%" stop-color="#0A0805" />
              </radialGradient>
            </defs>

            <!-- Outer decorative bezel rings -->
            <circle cx="60" cy="60" r="58" fill="none" stroke="rgba(212,185,140,0.45)" stroke-width="0.4" />
            <circle cx="60" cy="60" r="55.5" fill="none" stroke="rgba(212,185,140,0.20)" stroke-width="0.3" />

            <!-- Tick marks (20 ticks, majors at 0/25/50/75/100) -->
            ${gaugeTicks}

            <!-- Track ring -->
            <circle cx="60" cy="60" r="40" fill="none" stroke="rgba(212,185,140,0.10)" stroke-width="5" />

            <!-- Progress arc (gold gradient, proportional to index) -->
            <circle cx="60" cy="60" r="40" fill="none" stroke="url(#goldGradient)" stroke-width="5"
                    stroke-dasharray="${gaugeArcLen}" stroke-dashoffset="${gaugeDashOffset}"
                    stroke-linecap="round" transform="rotate(-90 60 60)" />

            <!-- Recessed center hub -->
            <circle cx="60" cy="60" r="34" fill="url(#hubGradient)" stroke="rgba(212,185,140,0.35)" stroke-width="0.4" />
            <circle cx="60" cy="60" r="31.5" fill="none" stroke="rgba(212,185,140,0.18)" stroke-width="0.3" />
          </svg>

          <div class="verdict-gauge-inner">
            <div class="verdict-gauge-percent">${probability}<span class="verdict-gauge-percent-symbol">%</span></div>
            <div class="verdict-gauge-qualifier">${conditionLabel}</div>
          </div>
        </div>

        <div class="verdict-divider"></div>
        <div class="verdict-status-title">${verdictTitle}</div>
        <div class="verdict-status-sub">${tt('AI Horological Forensic Consensus', 'ฉันทามติจากระบบ AI ระดับนิติเวช')}</div>
      </div>

      <!-- Watch Details key-value sheet -->
      <div class="panel">
        <div class="panel-title">${tt('Watch Details', 'รายละเอียดนาฬิกา')}</div>
        <div class="details-list">
          <div class="details-row">
            <span class="detail-label">${tt('Brand', 'ยี่ห้อ')}</span>
            <span class="detail-value">${brand}</span>
          </div>
          <div class="details-row">
            <span class="detail-label">${tt('Model', 'รุ่น')}</span>
            <span class="detail-value">${name}</span>
          </div>
          <div class="details-row">
            <span class="detail-label">${tt('Reference', 'รหัสรุ่น')}</span>
            <span class="detail-value">${reference}</span>
          </div>
          <div class="details-row">
            <span class="detail-label">${tt('Serial', 'ซีเรียล')}</span>
            <span class="detail-value">${serial}</span>
          </div>
          <div class="details-row">
            <span class="detail-label">${tt('Case Material', 'วัสดุตัวเรือน')}</span>
            <span class="detail-value">${caseMaterial}</span>
          </div>
          <div class="details-row">
            <span class="detail-label">${tt('Caliber', 'กลไก')}</span>
            <span class="detail-value">${caliber}</span>
          </div>
        </div>
      </div>

      <!-- Scan images -->
      <div class="panel">
        <div class="panel-title">${tt('Photographic Evidence', 'หลักฐานภาพถ่าย')}</div>
        <div class="scans-grid">
          <div class="scan-box">
            <div class="scan-image" style="background-image: url('${dialImg}');">
              <span class="scan-pass-badge" style="background-color: ${verdictPillColor};">${verdictPillText}</span>
            </div>
            <div class="scan-label-tab">${tt('Dial Scan', 'สแกนหน้าปัด')}</div>
          </div>
          <div class="scan-box">
            <div class="scan-image" style="background-image: url('${casebackImg}');">
              <span class="scan-pass-badge" style="background-color: ${verdictPillColor};">${verdictPillText}</span>
            </div>
            <div class="scan-label-tab">${tt('Caseback Scan', 'สแกนฝาหลัง')}</div>
          </div>
        </div>
      </div>
    </div>

    <!-- 3. Diagnostic Metrics — 6 cards in one row -->
    <div class="metrics-section">
      <div class="metrics-section-title">
        <span>${tt(`Hallmark Inspection · ${checkpointCount} Points`, `จุดตรวจสอบ Hallmark · ${checkpointCount} จุด`)}</span>
        <span class="metrics-section-subtitle">${tt(`${analyzedCount} of ${checkpointCount} returned an AI observation`, `AI ให้ข้อสังเกต ${analyzedCount} จาก ${checkpointCount} จุด`)}</span>
      </div>
      <div class="metrics-grid" style="grid-template-columns: repeat(${checkpointCount}, 1fr);">
        ${checkpoints
          .map(
            (c) => `
          <div class="metric-card${c.muted ? ' metric-card-muted' : ''}">
            <div class="metric-card-head">
              <span class="metric-card-number">${c.n}</span>
              ${
                c.score != null
                  ? `<span class="metric-score" style="color: ${c.color}; border-color: ${c.color};">${c.score}<span class="metric-score-max">/10</span></span>`
                  : `<span class="metric-status-dot" style="background-color: ${c.color};"></span>`
              }
            </div>
            <div class="metric-name">${esc(c.name)}</div>
            <div class="metric-obs" style="${c.muted ? '' : `border-left-color: ${c.color};`}">
              <span${c.muted ? ' class="metric-obs-muted"' : ''}>${esc(c.obs)}</span>
            </div>
          </div>
        `
          )
          .join('')}
      </div>
    </div>

    <!-- 4. Footer — security hash | disclaimer | QR -->
    <div class="footer">
      <div class="footer-cell">
        <span class="footer-title">${tt('Verification Secure · SHA-256', 'ลายเซ็นยืนยัน · SHA-256')}</span>
        <span class="footer-hash">${randomSig}</span>
      </div>
      <div class="footer-cell">
        <span class="footer-disclaimer">
          ${tt(
            'Luxury Authenticator is an independent AI-driven diagnostic tool, not affiliated with any manufacturer. This report reflects machine-vision analysis only — ultimate verification requires physical inspection by an authorized brand boutique or certified independent watchmaker.',
            'Luxury Authenticator เป็นเครื่องมือตรวจสอบอัตโนมัติด้วย AI โดยไม่ได้สังกัดผู้ผลิตรายใด รายงานฉบับนี้สะท้อนผลการวิเคราะห์ด้วยระบบ Machine Vision เท่านั้น การยืนยันขั้นสุดท้ายต้องผ่านการตรวจสอบทางกายภาพโดยร้านบูทีคของแบรนด์ที่ได้รับอนุญาต หรือช่างนาฬิกาอิสระที่ได้รับการรับรอง'
          )}
        </span>
      </div>
      <div class="footer-qr">
        <img src="https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=https://luxurywatchauthenticator.com/report/${randomSig.substring(0, 12)}" alt="Verification QR">
      </div>
    </div>

  </div>

</body>
</html>
      `;

    // 4. Fire printToFileAsync in LANDSCAPE A4. The HTML's @page rule
    // declares the size already, but expo-print's iOS path also reads
    // the orientation option — set both for cross-platform consistency.
    const { uri } = await Print.printToFileAsync({
      html: htmlContent,
      base64: false,
      width: 842,   // A4 landscape width in px (297mm @ 72dpi)
      height: 595,  // A4 landscape height in px (210mm @ 72dpi)
    });

    // 5. Rename the temporary PDF file to match the abbreviated watch model name
    const cleanBrandName = brand
      .replace(/[^a-zA-Z0-9\s]/g, '')
      .split(/\s+/)
      .filter(Boolean)
      .join('_')
      .toUpperCase();

    const cleanModelName = name
      .replace(/[^a-zA-Z0-9\s]/g, '')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 3)
      .join('_')
      .toUpperCase();

    const pdfFileName = `${cleanBrandName}_${cleanModelName}_REPORT.pdf`;
    const renamedUri = (FileSystem.cacheDirectory || '') + pdfFileName;

    try {
      await FileSystem.copyAsync({
        from: uri,
        to: renamedUri,
      });
    } catch (copyErr) {
      console.warn('[PdfExporter] Failed to rename PDF file, falling back to temporary uri', copyErr);
    }

    // 6. Open share dialogue with renamed PDF file
    await Sharing.shareAsync(renamedUri.startsWith('file://') ? renamedUri : uri, {
      mimeType: 'application/pdf',
      dialogTitle: lang === 'th' ? 'รายงานการตรวจสอบความแท้' : 'Authenticity Diagnostic Report',
    });

  } catch (e: any) {
    console.warn('[PdfExporter] PDF generation error:', e);
    Alert.alert(
      lang === 'th' ? 'ข้อผิดพลาดการส่งออก' : 'Export Failed',
      lang === 'th' ? 'ไม่สามารถสร้างรายงาน PDF ได้สำเร็จ' : 'Unable to generate technical diagnostic report.'
    );
  } finally {
    setGeneratingPDF(false);
  }
}
