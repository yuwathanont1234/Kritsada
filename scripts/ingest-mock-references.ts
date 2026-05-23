import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment!');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Helper to generate a random number with Gaussian-like distribution
function randomNormal(mean = 0, stdDev = 1) {
  const u1 = Math.random();
  const u2 = Math.random();
  const randStdNormal = Math.sqrt(-2.0 * Math.log(u1)) * Math.sin(2.0 * Math.PI * u2);
  return mean + stdDev * randStdNormal;
}

// Generate a normalized vector of specified dimension
function generateNormalizedVector(dim: number, baseVector?: number[], variance = 0.15): number[] {
  let vec = new Array(dim).fill(0);
  if (baseVector && baseVector.length === dim) {
    // Add small random noise to the base family vector to simulate visual variations
    for (let i = 0; i < dim; i++) {
      vec[i] = baseVector[i] + randomNormal(0, variance);
    }
  } else {
    // Generate completely random vector
    for (let i = 0; i < dim; i++) {
      vec[i] = randomNormal(0, 1.0);
    }
  }
  
  // Normalize vector
  let sumSq = 0;
  for (const val of vec) sumSq += val * val;
  const norm = Math.sqrt(sumSq);
  return norm > 0 ? vec.map(v => v / norm) : vec;
}

// Watch families configuration
interface Family {
  brand: string;
  category: 'rolex' | 'patek' | 'ap' | 'omega' | 'cartier' | 'tag-heuer' | 'tudor' | 'others';
  modelLine: string;
  movements: string[];
  materials: string[];
  dials: string[];
  years: string[];
  referenceFormat: string;
  difficulty: 'easy' | 'medium' | 'hard' | 'expert-only';
  baseEmbedding1024: number[]; // Base vector for 1024-d
  baseEmbedding256: number[];  // Base vector for 256-d
  checkpoints: { name: string; desc: string; imp: number }[];
  fakeIndicators: string[];
}

const BRANDS_AND_FAMILIES: Family[] = [
  {
    brand: 'Rolex',
    category: 'rolex',
    modelLine: 'Submariner',
    movements: ['Calibre 3135', 'Calibre 3235'],
    materials: ['Oystersteel', 'Rolesor (Steel & Gold)', '18k Yellow Gold', '18k White Gold'],
    dials: ['Black', 'Royal Blue', 'Green (Hulk/Kermit)'],
    years: ['2010', '2015', '2020', '2022', '2024'],
    referenceFormat: '116610[SUFX]',
    difficulty: 'hard',
    baseEmbedding1024: generateNormalizedVector(1024),
    baseEmbedding256: generateNormalizedVector(256),
    checkpoints: [
      { name: 'Cyclops Magnification', desc: 'Magnification should be exactly 2.5x with anti-reflective coating', imp: 9 },
      { name: 'Laser Crown', desc: 'Micro-etched coronet at 6 o\'clock dial crystal', imp: 8 },
      { name: 'Cerachrom Bezel Platinum Fill', desc: 'Graduations must have clean platinum PVD deposition', imp: 9 },
      { name: 'Rehaut Alignment', desc: 'ROLEX engraving aligned perfectly with dial hour indices', imp: 7 }
    ],
    fakeIndicators: [
      'Cloudy or misaligned date window cyclops',
      'No micro-etched crown at 6 o\'clock or laser engraving too bold',
      'Sandy, grayish paint instead of platinum PVD in bezel numerals',
      'Sloppy rehaut engraving with misaligned lettering'
    ]
  },
  {
    brand: 'Rolex',
    category: 'rolex',
    modelLine: 'Daytona',
    movements: ['Calibre 4130', 'Calibre 4131'],
    materials: ['Oystersteel', 'Everose Gold', 'Yellow Gold', 'Platinum', 'White Gold'],
    dials: ['White Panda', 'Black Chronograph', 'Meteorite Dial', 'Ice Blue', 'Golden Green'],
    years: ['2016', '2018', '2020', '2023', '2025'],
    referenceFormat: '116500LN[SUFX]',
    difficulty: 'expert-only',
    baseEmbedding1024: generateNormalizedVector(1024),
    baseEmbedding256: generateNormalizedVector(256),
    checkpoints: [
      { name: 'Chrono Hand Sweep', desc: 'Perfect sweep at 28,800 vph with zero stutter', imp: 9 },
      { name: 'Case Thickness', desc: 'Super slim profil — under 12.2mm thickness', imp: 10 },
      { name: 'Subdial Outer Rings', desc: 'Crisp concentric snailing texture on subdial tracks', imp: 8 },
      { name: 'Bezel Typography', desc: 'Ultra-crisp tachymeter numbering without bleeding', imp: 8 }
    ],
    fakeIndicators: [
      'Ticker-quartz jump or severe stutter on seconds hand sweep',
      'Thick case profile exceeding 13mm (often using modded 7750 movements)',
      'Flat subdial rings lacking concentric circular ridges',
      'Incorrect tachymeter spacing, specifically near "UNITS PER HOUR"'
    ]
  },
  {
    brand: 'Patek Philippe',
    category: 'patek',
    modelLine: 'Nautilus',
    movements: ['Calibre 324 SC', 'Calibre 26-330 SC'],
    materials: ['Stainless Steel', 'Rose Gold', 'White Gold'],
    dials: ['Blue-Green Gradient', 'Tiffany Blue', 'Olive Green', 'Silvery White', 'Slate Grey'],
    years: ['2006', '2012', '2018', '2021', '2023'],
    referenceFormat: '5711/1A-0[SUFX]',
    difficulty: 'expert-only',
    baseEmbedding1024: generateNormalizedVector(1024),
    baseEmbedding256: generateNormalizedVector(256),
    checkpoints: [
      { name: 'Dial Gradients', desc: 'Smooth, horizontally embossed gradient fading to black at edges', imp: 10 },
      { name: 'Date Font Weight', desc: 'Perfect flat-top date font alignment and padding in window', imp: 9 },
      { name: 'Calibre Finishing', desc: 'Flawless Geneva stripes, anglage, and Patek Philippe Seal gold rotor', imp: 10 },
      { name: 'Bracelet Articulation', desc: 'Perfectly fluid center-link articulation and pins', imp: 8 }
    ],
    fakeIndicators: [
      'Harsh or patchy dial gradient transition',
      'Thick or offset date wheel numerals (specifically 10s and 20s)',
      'Rough movement finishing with machine marks and brassy gold rotors',
      'Stiff bracelet with gaps or protruding screws'
    ]
  },
  {
    brand: 'Audemars Piguet',
    category: 'ap',
    modelLine: 'Royal Oak',
    movements: ['Calibre 3120', 'Calibre 4302'],
    materials: ['Stainless Steel', 'Pink Gold', 'Frosted Gold', 'Black Ceramic'],
    dials: ['Bleu Nuit Nuage 50', 'Silver Tapisserie', 'Grey Tapisserie', 'Green Tapisserie'],
    years: ['2012', '2016', '2020', '2022', '2024'],
    referenceFormat: '15400ST[SUFX]',
    difficulty: 'expert-only',
    baseEmbedding1024: generateNormalizedVector(1024),
    baseEmbedding256: generateNormalizedVector(256),
    checkpoints: [
      { name: 'Grande Tapisserie Dial', desc: 'Squares formed by precise engine-turned cutting (pantograph)', imp: 10 },
      { name: 'Bezel Screw Flushness', desc: 'Hexagonal white gold screws seated perfectly flat with bezel', imp: 9 },
      { name: 'AP Logo Crispness', desc: 'Perfect spacing on printed font and flawless applied AP logo', imp: 8 },
      { name: 'Case Chamfering', desc: 'Mirror-polished bevels matching brushed surfaces with razor sharp seams', imp: 9 }
    ],
    fakeIndicators: [
      'Stamped tapisserie dial where squares lack micro-textured grooves',
      'Bezel screws protruding or misaligned in their hexagons',
      'Blobby, overlapping AP logo print with incorrect font proportions',
      'Dull, rounded case edges lacking sharp polished chamfered lines'
    ]
  },
  {
    brand: 'Omega',
    category: 'omega',
    modelLine: 'Speedmaster Moonwatch',
    movements: ['Calibre 1861', 'Calibre 3861 Co-Axial'],
    materials: ['Stainless Steel', 'Sedna Gold', 'Canopus Gold'],
    dials: ['Matte Black', 'Silver Snoopy', 'Green (Gold)'],
    years: ['2000', '2010', '2021', '2023'],
    referenceFormat: '310.30.42.50.01.00[SUFX]',
    difficulty: 'medium',
    baseEmbedding1024: generateNormalizedVector(1024),
    baseEmbedding256: generateNormalizedVector(256),
    checkpoints: [
      { name: 'Dot Over Ninety (DON)', desc: 'Tachymeter bezel dot positioned above "90" for historical accuracy', imp: 7 },
      { name: 'Subdial Spacing', desc: 'Subdials spaced perfectly near indices without crowding', imp: 8 },
      { name: 'Co-Axial Escapement Check', desc: 'Unique double-roller co-axial heartbeat on timegrapher', imp: 9 },
      { name: 'Hesalite Logo Engraving', desc: 'Microscopic Omega symbol etched in the center of hesalite crystal', imp: 8 }
    ],
    fakeIndicators: [
      'Standard "Dot Next to Ninety" bezel on vintage or 3861 replica configurations',
      'Chronograph hand that ticks like quartz rather than sweeping smoothly',
      'Lack of micro-Omega logo on hesalite model crystals',
      'Subdials positioned too far apart (typical in Miyota chronograph movements)'
    ]
  },
  {
    brand: 'Cartier',
    category: 'cartier',
    modelLine: 'Santos',
    movements: ['Calibre 1847 MC', 'Quartz Movement'],
    materials: ['Stainless Steel', 'Steel & Gold', '18k Pink Gold', 'ADLC Steel'],
    dials: ['Silver Roman', 'Gradient Blue', 'Gradient Green', 'Deep Black'],
    years: ['2018', '2020', '2022', '2024'],
    referenceFormat: 'WSSA001[SUFX]',
    difficulty: 'medium',
    baseEmbedding1024: generateNormalizedVector(1024),
    baseEmbedding256: generateNormalizedVector(256),
    checkpoints: [
      { name: 'Cartier Secret Signature', desc: 'Miniature "CARTIER" text embedded inside the VII or VII Roman numeral', imp: 9 },
      { name: 'Cabochon Cut Crown', desc: 'Synthetic blue spinel or sapphire custom-cut cabochon set securely in crown', imp: 8 },
      { name: 'SmartLink System', desc: 'Self-adjustable sizing push-buttons located under the bracelet links', imp: 8 },
      { name: 'Roman Numeral Crispness', desc: 'Flawless flat-printed Roman numerals without bleeding or fading', imp: 7 }
    ],
    fakeIndicators: [
      'Lack of secret signature in VII/VIII or printed roman numeral bleeding',
      'Sloppy cabochon that is glued or uses plastic instead of gem',
      'Rigid bracelet lacking the fully articulated SmartLink quick-release system',
      'Dial printing that lacks raised, high-gloss paint texture'
    ]
  },
  {
    brand: 'Tudor',
    category: 'tudor',
    modelLine: 'Black Bay',
    movements: ['Calibre MT5402', 'Calibre MT5602'],
    materials: ['Stainless Steel', 'Bronze', '18k Yellow Gold', 'Silver 925'],
    dials: ['Gilt Matte Black', 'Matte Blue', 'Anthracite', 'Burgundy Accent'],
    years: ['2012', '2016', '2020', '2023', '2025'],
    referenceFormat: 'M79030N-000[SUFX]',
    difficulty: 'medium',
    baseEmbedding1024: generateNormalizedVector(1024),
    baseEmbedding256: generateNormalizedVector(256),
    checkpoints: [
      { name: 'Snowflake Hour Hand', desc: 'Perfect geometric proportions on the snowflake square hand corner', imp: 8 },
      { name: 'Tudor Rose / Shield Crown', desc: 'Impeccable engraving of Tudor Shield or vintage Rose logo on crown', imp: 7 },
      { name: 'Coin-Edge Bezel Action', desc: 'Distinct, solid 60-click unidirectional bezel clicks', imp: 8 },
      { name: 'Rivet Bracelet Details', desc: 'Clean rivet clasp details without rough machining edges', imp: 7 }
    ],
    fakeIndicators: [
      'Misproportioned or bloated snowflake hands',
      'Poorly engraved crown logos or stem tubing gaps',
      'Mushy, plastic bezel rotating action with rattling springs',
      'Loose rivet pins or sharp metal edge flashing'
    ]
  },
  {
    brand: 'Rolex',
    category: 'rolex',
    modelLine: 'GMT-Master II',
    movements: ['Calibre 3186', 'Calibre 3285'],
    materials: ['Oystersteel', 'Rolesor (Steel & Gold)', '18k White Gold', '18k Everose Gold'],
    dials: ['Pepsi Black', 'Batman Black', 'Root Beer Black', 'Sprite Left-Handed'],
    years: ['2018', '2020', '2022', '2024'],
    referenceFormat: '126710[SUFX]',
    difficulty: 'expert-only',
    baseEmbedding1024: generateNormalizedVector(1024),
    baseEmbedding256: generateNormalizedVector(256),
    checkpoints: [
      { name: 'GMT Hand Stack Order', desc: 'Correct hands stack: Hour at the bottom, then GMT, Minute, Second at top', imp: 10 },
      { name: 'Bezel Color Seam Transition', desc: 'Perfect seamless division of bi-color Cerachrom ceramic at 6 & 18 indices', imp: 9 },
      { name: 'Laser Crown Crystal', desc: 'Slightly visible micro-etched coronet at 6 o\'clock dial crystal face', imp: 8 }
    ],
    fakeIndicators: [
      'Incorrect stack sequence (GMT hand below Hour hand or directly at the bottom)',
      'Bleeding or fuzzy transitions between bi-color ceramic zones on the bezel',
      'Coarse, overly visible laser-etched crown or lack of crown'
    ]
  },
  {
    brand: 'Rolex',
    category: 'rolex',
    modelLine: 'Datejust',
    movements: ['Calibre 3135', 'Calibre 3235'],
    materials: ['Oystersteel', 'White Rolesor', 'Yellow Rolesor', 'Everose Rolesor'],
    dials: ['Blue Fluted Motif', 'Mint Green Sunray', 'Slate Wimbledon', 'Silver Classic'],
    years: ['2016', '2019', '2021', '2024'],
    referenceFormat: '126334[SUFX]',
    difficulty: 'hard',
    baseEmbedding1024: generateNormalizedVector(1024),
    baseEmbedding256: generateNormalizedVector(256),
    checkpoints: [
      { name: 'Fluted Bezel Reflection', desc: 'Mirror-polished flute peaks reflection without machining grooves', imp: 9 },
      { name: 'Date Wheel Font Weight', desc: 'Date numerals custom flat-top thickness and precise center padding', imp: 8 },
      { name: 'Cyclops Window Coating', desc: 'Crisp anti-reflective cyclops displaying 2.5x window magnifying zoom', imp: 9 }
    ],
    fakeIndicators: [
      'Rounded flute peaks on bezel showing rough milling marks',
      'Thin, blurry, or offset date numerals with incorrect custom fonts',
      'No anti-reflective halo coating on magnification window'
    ]
  },
  {
    brand: 'Rolex',
    category: 'rolex',
    modelLine: 'Day-Date',
    movements: ['Calibre 3155', 'Calibre 3255'],
    materials: ['18k Yellow Gold', '18k Rose Gold', '18k White Gold', 'Platinum'],
    dials: ['Champagne Sunburst', 'Olive Green Roman', 'Ice Blue Diagonal', 'Onyx Plain'],
    years: ['2015', '2018', '2021', '2024'],
    referenceFormat: '228238[SUFX]',
    difficulty: 'expert-only',
    baseEmbedding1024: generateNormalizedVector(1024),
    baseEmbedding256: generateNormalizedVector(256),
    checkpoints: [
      { name: 'Instant Day-Date Switch', desc: 'Day and date windows jump instantaneously at midnight (within 2 minutes)', imp: 9 },
      { name: 'Precious Metal Lugs', desc: 'Crisp hallmark stamp marks under lugs (St. Bernard, 750, or Scale)', imp: 10 },
      { name: 'Hidden President Clasp', desc: 'Seamless fold integration with custom crown lock lever release', imp: 8 }
    ],
    fakeIndicators: [
      'Slow, dragging change of day or date over several hours near midnight',
      'Fuzzy, blurred, or missing laser-stamp hallmarks on the underside of lugs',
      'Stiff, unstable presidential clasp joint or stamped metal folds'
    ]
  },
  {
    brand: 'Patek Philippe',
    category: 'patek',
    modelLine: 'Aquanaut',
    movements: ['Calibre 324 SC', 'Calibre 26-330 SC'],
    materials: ['Stainless Steel', '18k Rose Gold', '18k White Gold'],
    dials: ['Black Structured', 'Khaki Green', 'Brown Gradient'],
    years: ['2014', '2017', '2020', '2023'],
    referenceFormat: '5167A-0[SUFX]',
    difficulty: 'expert-only',
    baseEmbedding1024: generateNormalizedVector(1024),
    baseEmbedding256: generateNormalizedVector(256),
    checkpoints: [
      { name: 'Tropical Strap Profile', desc: 'Precision integrated composite strap with sweet vanilla scent and custom clasp', imp: 9 },
      { name: 'Structured Dial Embossing', desc: 'Subtle, curved embossed grooves matching exact case curvature', imp: 9 },
      { name: 'Bridge Anglage Finishing', desc: 'Flawless hand-bevelled edges, polished sinks, and Patek Philippe Seal', imp: 10 }
    ],
    fakeIndicators: [
      'Stiff rubber strap lacking sweet vanilla smell or showing molding flash',
      'Dial embossing with flat, cheap, machine-stamped checkerboard depth',
      'Coarse machine-milled lines, dull steel coloring, or missing gold rotor seals'
    ]
  },
  {
    brand: 'Patek Philippe',
    category: 'patek',
    modelLine: 'Calatrava',
    movements: ['Calibre 324 S C'],
    materials: ['18k White Gold', '18k Yellow Gold', '18k Rose Gold'],
    dials: ['Ivory Lacquered', 'Ebony Black Lacquered', 'Silver Opaline'],
    years: ['2013', '2016', '2019', '2022'],
    referenceFormat: '5227G-0[SUFX]',
    difficulty: 'expert-only',
    baseEmbedding1024: generateNormalizedVector(1024),
    baseEmbedding256: generateNormalizedVector(256),
    checkpoints: [
      { name: 'Officer\'s Hinge Caseback', desc: 'Totally invisible caseback hinge from front and sides, seating perfectly flush', imp: 10 },
      { name: 'Lacquered Dial Depth', desc: 'Liquid-like enamel gloss finish without bubbles or dust inclusions', imp: 8 },
      { name: 'Gold Hallmark Crispness', desc: 'Extremely clean St. Bernard scales hallmarks stamped deep in gold lugs', imp: 9 }
    ],
    fakeIndicators: [
      'Protruding or visible hinge pin from profile, loose officers back action',
      'Flat, cheap spray-painted dials or visible dust particles under loupe',
      'Shallow, blurred hallmark engravings that appear laser-etched rather than stamped'
    ]
  },
  {
    brand: 'Panerai',
    category: 'others',
    modelLine: 'Luminor',
    movements: ['Calibre P.9010', 'Calibre P.9001'],
    materials: ['AISI 316L Brushed Steel', 'Carbotech', 'Goldtech'],
    dials: ['Sandwich Black', 'Blue Sunbrushed', 'White Classic'],
    years: ['2016', '2018', '2020', '2023'],
    referenceFormat: 'PAM01312[SUFX]',
    difficulty: 'hard',
    baseEmbedding1024: generateNormalizedVector(1024),
    baseEmbedding256: generateNormalizedVector(256),
    checkpoints: [
      { name: 'Crown Protecting Device', desc: 'Luminor trademarked crown lever lock system with tight, crisp snap action', imp: 9 },
      { name: 'Sandwich Dial Stencil', desc: 'Double-layer cutout dials showing solid, deep stencil edges with clean lume layer', imp: 9 },
      { name: 'Super-LumiNova Intensity', desc: 'Highly reactive green C3 Super-LumiNova showing uniform glow and text crispness', imp: 8 }
    ],
    fakeIndicators: [
      'Loose, wobbly crown locking lever that has play or doesn\'t secure crown',
      'Flat printed hour markers or shallow cutout sandwich stencil lines',
      'Dull, splotchy green lume that dies out quickly or bleeds out of markers'
    ]
  },
  {
    brand: 'Panerai',
    category: 'others',
    modelLine: 'Radiomir',
    movements: ['Calibre P.6000', 'Calibre P.3000'],
    materials: ['AISI 316L Polished Steel', 'Brunito Steel', 'Bronze'],
    dials: ['Degrade Green', 'Brown Gradient', 'Matte Black'],
    years: ['2012', '2015', '2019', '2023'],
    referenceFormat: 'PAM01347[SUFX]',
    difficulty: 'medium',
    baseEmbedding1024: generateNormalizedVector(1024),
    baseEmbedding256: generateNormalizedVector(256),
    checkpoints: [
      { name: 'Wire Loop Attachments', desc: 'Rigid, clean wire loop lugs screwed firmly into the cushion case corners', imp: 8 },
      { name: 'Onion Shaped Crown', desc: 'Precision-grooved onion-shaped screw-down crown seating perfectly flat', imp: 8 },
      { name: 'Vintage Plexiglass Dome', desc: 'High-thickness domed crystal without optical distorting ripples', imp: 7 }
    ],
    fakeIndicators: [
      'Wobbly wire lugs with gaps or stripped screw threads in the case',
      'Cylindrical or loosely grooved crown that doesn\'t screw in flat',
      'Thin flat mineral glass or plastic crystal with severe side distorts'
    ]
  },
  {
    brand: 'Panerai',
    category: 'others',
    modelLine: 'Submersible',
    movements: ['Calibre P.900', 'Calibre OP XXXIV'],
    materials: ['Titanium', 'BMG-TECH', 'Carbotech'],
    dials: ['Nero (Black)', 'Bianco (White)', 'Blue Abisso'],
    years: ['2019', '2021', '2023', '2025'],
    referenceFormat: 'PAM01223[SUFX]',
    difficulty: 'hard',
    baseEmbedding1024: generateNormalizedVector(1024),
    baseEmbedding256: generateNormalizedVector(256),
    checkpoints: [
      { name: 'Bezel Click Action', desc: 'Solid, unidirectional rotating bezel with exactly 120 precise click detents', imp: 9 },
      { name: 'Luminous Bezel Pip', desc: 'Recessed bezel pip at 12 o\'clock with a sapphire window casing overlay', imp: 9 },
      { name: 'BMG/Carbotech Finish', desc: 'Complex layered Carbon fiber Carbotech lines or bulk metallic glass hardness', imp: 8 }
    ],
    fakeIndicators: [
      'Mushy, loose rotating bezel with backward play or standard 60 clicks',
      'Flat or glued luminous bezel dot lacking proper metallic/sapphire frames',
      'Printed horizontal lines instead of authentic Carbotech organic material weave'
    ]
  },
  {
    brand: 'TAG Heuer',
    category: 'tag-heuer',
    modelLine: 'Carrera',
    movements: ['Calibre Heuer 02', 'Calibre 5', 'Calibre 16'],
    materials: ['Fine-Brushed Steel', '18k Rose Gold', 'Titanium', 'Ceramic'],
    dials: ['Chronograph Black', 'Sunray Blue', 'Silver Opaline', 'Green Dial'],
    years: ['2018', '2020', '2022', '2024', '2026'],
    referenceFormat: 'CBN2A1[SUFX]',
    difficulty: 'hard',
    baseEmbedding1024: generateNormalizedVector(1024),
    baseEmbedding256: generateNormalizedVector(256),
    checkpoints: [
      { name: 'Open-Worked Rotor', desc: 'Skeletonized rotor with crisp black-gold engraving and smooth rotation', imp: 9 },
      { name: 'Dual-Gasket Crown', desc: 'Dual-gasket crown sealing system with high-friction engagement', imp: 8 },
      { name: 'Font Alignment', desc: 'Flawless visual alignment and typography of "CARRERA" on dial', imp: 9 }
    ],
    fakeIndicators: [
      'Solid or rough machine-finished back rotors lacking micro-finish details',
      'Single crown gasket system showing moisture seepage under pressure',
      'Misaligned logo printing or uneven subdial spacing under high magnification'
    ]
  },
  {
    brand: 'TAG Heuer',
    category: 'tag-heuer',
    modelLine: 'Monaco',
    movements: ['Calibre Heuer 02', 'Calibre 11', 'Calibre 12'],
    materials: ['Fine-Brushed Steel', 'Titanium Grade 2', '18k Rose Gold'],
    dials: ['Gulf Special Edition', 'Monaco Blue', 'Deep Black', 'Night Driver'],
    years: ['2015', '2019', '2021', '2023', '2025'],
    referenceFormat: 'CBL211[SUFX]',
    difficulty: 'expert-only',
    baseEmbedding1024: generateNormalizedVector(1024),
    baseEmbedding256: generateNormalizedVector(256),
    checkpoints: [
      { name: 'Left-Handed Crown', desc: 'Historical left-handed crown (Calibre 11) with chronograph pushers at 2 and 4', imp: 10 },
      { name: 'High-Dome Sapphire Crystal', desc: 'High-dome bevelled square sapphire crystal showing clean edges', imp: 9 },
      { name: 'Concentric Snailing Subdials', desc: 'Micro-grooved concentric snailing tracks on square subdial displays', imp: 8 }
    ],
    fakeIndicators: [
      'Crown positioned at 3 o\'clock on standard mockup Calibre 11 movements',
      'Flat acrylic or cheap mineral crystal with heavy side optical distortion',
      'Flat subdials lacking micro-ridged texture or radial grooves'
    ]
  },
  {
    brand: 'TAG Heuer',
    category: 'tag-heuer',
    modelLine: 'Aquaracer',
    movements: ['Calibre 5', 'Calibre 7 GMT', 'Quartz'],
    materials: ['Fine-Brushed Steel', 'Titanium Grade 2', 'Bronze'],
    dials: ['Horizontal Striped Black', 'Striped Blue', 'Emerald Green', 'Polar White'],
    years: ['2019', '2021', '2023', '2025'],
    referenceFormat: 'WBP201[SUFX]',
    difficulty: 'medium',
    baseEmbedding1024: generateNormalizedVector(1024),
    baseEmbedding256: generateNormalizedVector(256),
    checkpoints: [
      { name: '12-Sided Bezel Detents', desc: '12-sided unidirectional rotating bezel with crisp, solid 60-click detents', imp: 9 },
      { name: 'Diver Helmet Caseback', desc: 'Caseback deeply engraved with high-detail diving helmet motif', imp: 9 },
      { name: 'Horizontal Dial Grooves', desc: 'Deep, crisp deck-like horizontal line engravings across the dial face', imp: 8 }
    ],
    fakeIndicators: [
      'Rounded 12-sided bezel corners with backwards play or standard clicks',
      'Shallow laser-etched diver helmet engraving lacking deep texture boundaries',
      'Shallow, unevenly spaced or printed dial horizontal deck lines'
    ]
  },
  {
    brand: 'TAG Heuer',
    category: 'tag-heuer',
    modelLine: 'Formula 1',
    movements: ['Quartz Movement', 'Calibre 5', 'Calibre 16'],
    materials: ['Fine-Brushed Steel', 'Steel & Ceramic', 'Titanium Carbide Coating'],
    dials: ['Matte Black', 'Racing Yellow', 'Red Accent', 'Blue Chronograph'],
    years: ['2016', '2019', '2021', '2024'],
    referenceFormat: 'WAZ111[SUFX]',
    difficulty: 'medium',
    baseEmbedding1024: generateNormalizedVector(1024),
    baseEmbedding256: generateNormalizedVector(256),
    checkpoints: [
      { name: 'Checkered Flag Caseback', desc: 'Impeccable checkered flag caseback engraving with clean textured recesses', imp: 8 },
      { name: 'Easy-Grip Carbide Crown', desc: 'High-grip screw-down crown with durable titanium carbide coating', imp: 8 },
      { name: 'Super-LumiNova Contrast', desc: 'High-intensity Super-LumiNova matching exactly across dial and hands', imp: 8 }
    ],
    fakeIndicators: [
      'Flat, cheap laser-printed checkered flag caseback pattern without texture depth',
      'Plastic crown covers, raw steel threads, or loose crown stems',
      'Weak, patchy, or mismatched dial and hands lume colors'
    ]
  },
  {
    brand: 'Chopard',
    category: 'others',
    modelLine: 'Happy Sport',
    movements: ['Calibre 09.01-C', 'Quartz Movement'],
    materials: ['Stainless Steel', 'Rose Gold', 'Lucent Steel A223', 'Steel & Rose Gold'],
    dials: ['White Mother of Pearl', 'Slate Grey', 'Silver Roman', 'Classic Blue'],
    years: ['2018', '2020', '2022', '2024'],
    referenceFormat: '278573[SUFX]',
    difficulty: 'medium',
    baseEmbedding1024: generateNormalizedVector(1024),
    baseEmbedding256: generateNormalizedVector(256),
    checkpoints: [
      { name: 'Floating Diamonds', desc: 'Moving diamonds must slide smoothly between two sapphire crystals without sticking', imp: 9 },
      { name: 'Lucent Steel Lustre', desc: 'Premium brilliance and high scratch resistance of exclusive Lucent Steel', imp: 8 },
      { name: 'Mother of Pearl Shimmer', desc: 'Iridescent, high-depth natural mother of pearl texture without visible scratches', imp: 7 }
    ],
    fakeIndicators: [
      'Sticking, dragging, or rattling floating diamonds',
      'Standard dull stainless steel lacking Lucent Steel brilliance',
      'Flat printed plastic dials instead of authentic Mother of Pearl shimmer'
    ]
  },
  {
    brand: 'Franck Muller',
    category: 'others',
    modelLine: 'Vanguard',
    movements: ['Calibre FM 800', 'Calibre FM 2800'],
    materials: ['Titanium', 'Rose Gold', 'Carbon Fiber', 'Stainless Steel'],
    dials: ['Skeleton Dial', 'Black Yachting', 'White Arabesque', 'Blue Vanguard'],
    years: ['2017', '2020', '2022', '2024'],
    referenceFormat: 'V45SCDT[SUFX]',
    difficulty: 'expert-only',
    baseEmbedding1024: generateNormalizedVector(1024),
    baseEmbedding256: generateNormalizedVector(256),
    checkpoints: [
      { name: 'Curved Tonneau Fit', desc: 'Distinctive curved case fits perfectly flat against the wrist with seamless seams', imp: 9 },
      { name: 'Applique Numeral Hand-polishing', desc: 'Raised numerals perfectly hand-brushed and painted with clean borders', imp: 8 },
      { name: 'Yachting Windrose Detail', desc: 'Ultra-crisp coordinates and windrose logo printing in the dial center', imp: 7 }
    ],
    fakeIndicators: [
      'Flat or sharp tonneau edges, loose rubber-to-leather strap seams',
      'Stamped numerals with messy edges or paint runovers',
      'Uneven, blurry windrose dial lines under high loupe inspection'
    ]
  },
  {
    brand: 'Zenith',
    category: 'others',
    modelLine: 'Chronomaster Sport',
    movements: ['Calibre El Primero 3600'],
    materials: ['Stainless Steel', 'Rose Gold', 'Steel & Rose Gold'],
    dials: ['Matte White', 'Matte Black', 'Yoshi Edition Green'],
    years: ['2021', '2023', '2025'],
    referenceFormat: '03.3100.3600[SUFX]',
    difficulty: 'hard',
    baseEmbedding1024: generateNormalizedVector(1024),
    baseEmbedding256: generateNormalizedVector(256),
    checkpoints: [
      { name: '1/10th Second Sweep', desc: 'Central seconds hand sweeps dynamically around the dial in exactly 10 seconds', imp: 10 },
      { name: 'Tri-color Ceramic Bezel', desc: 'Perfect alignment of the blue, grey, and anthracite bezel segment tracks', imp: 9 },
      { name: 'Star Counterweight Balance', desc: 'Microscopic 5-point star emblem counterweight on the central chronograph hand', imp: 8 }
    ],
    fakeIndicators: [
      'Chronograph hand that takes 60 seconds to sweep, or ticks roughly',
      'Standard monochrome bezel or cheap decal overlays instead of tri-color ceramic',
      'Lack of 5-point star or wobbly hand alignment'
    ]
  }
];

async function ingestMockWatches() {
  console.log('🏁 Starting mock luxury watch references ingestion (~15.7K items)...');

  // Let's clear any old mock references first to avoid duplicate primary key errors
  console.log('🧹 Purging existing mock data in safe chunks...');
  
  // A helper to delete a table by chunking its keys to prevent statement timeouts
  async function chunkedDelete(tableName: string, idColumn: string) {
    console.log(`   Deleting from ${tableName}...`);
    let hasMore = true;
    let totalDeleted = 0;
    
    while (hasMore) {
      // Fetch a small page of IDs - using 200 for watches to be safe against timeouts
      const limit = tableName === 'watches' || tableName === 'image_embeddings' ? 200 : 500;
      const { data, error } = await supabase
        .from(tableName)
        .select(idColumn)
        .limit(limit);
      
      if (error) {
        console.error(`❌ Error fetching ${idColumn} for ${tableName}:`, error.message, error.details, error.hint);
        throw error;
      }
      
      if (!data || data.length === 0) {
        hasMore = false;
        break;
      }
      
      // Ensure unique IDs in the chunk to optimize the delete in query
      const ids = Array.from(new Set(data.map((row: any) => row[idColumn])));
      
      // Delete this chunk
      const { error: deleteError } = await supabase
        .from(tableName)
        .delete()
        .in(idColumn, ids);
        
      if (deleteError) {
        console.error(`❌ Error deleting chunk from ${tableName}:`);
        console.error('   Message:', deleteError.message);
        console.error('   Code:', (deleteError as any).code);
        console.error('   Details:', deleteError.details);
        console.error('   Hint:', deleteError.hint);
        throw deleteError;
      }
      
      totalDeleted += ids.length;
      console.log(`      Deleted a chunk of ${ids.length} records (Total: ${totalDeleted})...`);
      
      // Safety throttling to prevent database hammering
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    console.log(`   ✅ Finished deleting from ${tableName}.`);
  }

  // Delete in strict dependency order:
  await chunkedDelete('expert_cert_embeddings', 'cert_id');
  await chunkedDelete('expert_cert_exemplars', 'cert_id');
  await chunkedDelete('fake_embeddings', 'image_url');
  await chunkedDelete('heatmap_annotations', 'watch_id');
  await chunkedDelete('image_embeddings', 'image_url');
  await chunkedDelete('watches', 'id');

  const watchesBatch: any[] = [];
  const imageEmbeddingsBatch: any[] = [];
  
  // Total watches to generate (22 families * 715 variations = 15,730 watches)
  const watchesPerFamily = 715;
  
  console.log(`Generating watch entities across ${BRANDS_AND_FAMILIES.length} luxury families...`);

  for (const family of BRANDS_AND_FAMILIES) {
    console.log(`> Spawning ${watchesPerFamily} watches for family: ${family.brand} ${family.modelLine}...`);
    
    for (let i = 0; i < watchesPerFamily; i++) {
      const serialSuffix = i.toString().padStart(4, '0');
      
      // Determine combinations
      const material = family.materials[i % family.materials.length];
      const dial = family.dials[i % family.dials.length];
      const movement = family.movements[i % family.movements.length];
      const year = family.years[i % family.years.length];
      
      // Build unique reference and ID
      const baseRef = family.referenceFormat.replace('[SUFX]', serialSuffix);
      const watchId = `${family.brand.toLowerCase()}-${family.modelLine.toLowerCase()}-${baseRef}-${material.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${dial.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${year}`;
      const name = `${family.brand} ${family.modelLine} ${baseRef} (${material}, ${dial} Dial)`;
      
      // Price matrices based on brand and material
      let baseVal = 10000;
      if (family.brand === 'Patek Philippe') baseVal = 45000;
      else if (family.brand === 'Audemars Piguet') baseVal = 35000;
      else if (family.brand === 'Cartier') baseVal = 6500;
      else if (family.brand === 'Tudor') baseVal = 4200;
      else if (family.brand === 'Panerai') baseVal = 8000;
      else if (family.brand === 'Chopard') baseVal = 9200;
      else if (family.brand === 'Franck Muller') baseVal = 12500;
      else if (family.brand === 'Zenith') baseVal = 11000;
      else if (family.brand === 'TAG Heuer') {
        if (family.modelLine === 'Carrera') baseVal = 5800;
        else if (family.modelLine === 'Monaco') baseVal = 7800;
        else if (family.modelLine === 'Aquaracer') baseVal = 3200;
        else if (family.modelLine === 'Formula 1') baseVal = 1850;
      }
      
      // Gold and platinum premium additions
      if (material.includes('Gold')) baseVal *= 2.2;
      if (material.includes('Platinum')) baseVal *= 3.5;
      if (material.includes('Ceramic')) baseVal *= 1.8;
      
      // Minor random variance in price
      const priceExcellent = Math.round(baseVal * (1.05 + Math.random() * 0.1));
      const priceGood = Math.round(baseVal * (0.90 + Math.random() * 0.08));
      const priceFair = Math.round(baseVal * (0.75 + Math.random() * 0.05));
      const trends: ('rising' | 'stable' | 'declining')[] = ['rising', 'stable', 'declining'];
      const priceTrend = trends[i % 3];

      // Story
      const history = `The ${family.brand} ${family.modelLine} remains a defining cornerstone of high horology. Initially introduced to fulfill specific technical needs, it has transcended its tool-watch origins to become an international emblem of luxury, prestige, and engineering excellence.`;
      const significance = `Featuring the groundbreaking ${movement} and a distinct case in ${material}, this piece is renowned for its collector appeal and robust resale price performance.`;

      // Build watch record
      const watchRow = {
        id: watchId,
        name,
        alt_names: [`${family.brand} ${family.modelLine} ${baseRef}`, `${family.modelLine} ${dial}`],
        brand: family.brand,
        reference: baseRef,
        category: family.category,
        movement_family: movement,
        case_material: material,
        dial_color: dial,
        year_created: year,
        difficulty: family.difficulty,
        popular_references: JSON.stringify([baseRef]),
        auth_checklist: JSON.stringify(family.checkpoints),
        common_fakes: JSON.stringify(family.fakeIndicators),
        price_market_excellent: priceExcellent,
        price_market_good: priceGood,
        price_market_fair: priceFair,
        price_trend: priceTrend,
        price_last_updated: new Date().toISOString().slice(0, 7),
        recent_auctions: JSON.stringify([
          { date: '2026-03', priceUSD: Math.round(priceExcellent * 0.95), house: 'Sotheby\'s' },
          { date: '2026-04', priceUSD: Math.round(priceExcellent * 0.97), house: 'Christie\'s' }
        ]),
        history,
        significance,
        legends: [`The Legendary ${family.modelLine}`],
        data_confidence: 'high',
        data_sources: ['Chrono24', 'WatchCharts', 'Sotheby\'s Archives'],
        reference_image_count: 2,
        reference_images: JSON.stringify([
          `https://luxauth.img.co/ref/${watchId}-front.jpg`,
          `https://luxauth.img.co/ref/${watchId}-back.jpg`
        ]),
        visual_signatures: [`${family.modelLine}-bezel`, `${family.brand}-coronet`],
        unique_identifiers: [`${movement}-engraving`, `${material}-weight`]
      };

      watchesBatch.push(watchRow);

      // Generate 256-d embedding for this watch clustered around family base
      const emb256 = generateNormalizedVector(256, family.baseEmbedding256, 0.08);
      const emb1024 = generateNormalizedVector(1024, family.baseEmbedding1024, 0.08);

      // Add to image_embeddings
      imageEmbeddingsBatch.push({
        watch_id: watchId,
        image_url: `https://luxauth.img.co/ref/${watchId}-front.jpg`,
        image_embedding: emb1024,
        image_embedding_v2: emb256,
        embedding_source: 'ref'
      });
    }
  }

  // Upload watches in chunks of 500
  console.log(`📤 Uploading ${watchesBatch.length} watches to Supabase...`);
  const chunkSize = 500;
  for (let i = 0; i < watchesBatch.length; i += chunkSize) {
    const chunk = watchesBatch.slice(i, i + chunkSize);
    const { error } = await supabase.from('watches').insert(chunk);
    if (error) {
      console.error(`❌ Failed to upload watches chunk at offset ${i}:`, error.message);
      process.exit(1);
    }
    console.log(`   Uploaded ${i + chunk.length}/${watchesBatch.length} watches...`);
  }

  // Upload image embeddings in chunks of 100 to avoid pgvector statement timeouts, running with 5 concurrent workers to speed up
  console.log(`📤 Uploading ${imageEmbeddingsBatch.length} image embeddings to Supabase...`);
  const embeddingChunkSize = 100;
  const chunks: any[][] = [];
  for (let i = 0; i < imageEmbeddingsBatch.length; i += embeddingChunkSize) {
    chunks.push(imageEmbeddingsBatch.slice(i, i + embeddingChunkSize));
  }

  const concurrencyLimit = 5;
  for (let i = 0; i < chunks.length; i += concurrencyLimit) {
    const activeChunks = chunks.slice(i, i + concurrencyLimit);
    
    await Promise.all(activeChunks.map(async (chunk, index) => {
      const chunkOffset = i + index;
      let success = false;
      let attempts = 0;
      while (!success && attempts < 3) {
        const { error } = await supabase.from('image_embeddings').insert(chunk);
        if (error) {
          attempts++;
          console.warn(`⚠️ Attempt ${attempts} failed to upload image embeddings at chunk index ${chunkOffset}: ${error.message}. Retrying in 2s...`);
          await new Promise(r => setTimeout(r, 2000));
        } else {
          success = true;
        }
      }
      
      if (!success) {
        console.error(`❌ Failed to upload image embeddings chunk at index ${chunkOffset} after 3 attempts.`);
        process.exit(1);
      }
    }));
    
    const uploadedCount = Math.min((i + activeChunks.length) * embeddingChunkSize, imageEmbeddingsBatch.length);
    console.log(`   Uploaded ${uploadedCount}/${imageEmbeddingsBatch.length} embeddings...`);
  }

  // Generate ~100 Expert Certs and ~100 Fakes
  console.log('🎖 Seeding Expert Certificates and Counterfeit Vectors...');
  const certExemplars: any[] = [];
  const certEmbeddings: any[] = [];
  const fakeEmbeddings: any[] = [];
  const heatmaps: any[] = [];

  const topWatches = watchesBatch.slice(0, 100);

  for (let idx = 0; idx < topWatches.length; idx++) {
    const targetWatch = topWatches[idx];
    const certId = `cert-lux-${idx.toString().padStart(3, '0')}`;
    
    // Add Expert Cert Exemplar
    certExemplars.push({
      cert_id: certId,
      watch_name: targetWatch.name,
      watch_reference: targetWatch.reference,
      brand: targetWatch.brand,
      case_material: targetWatch.case_material,
      year_made: targetWatch.year_created,
      cert_date: '2026-01-15',
      cert_url: `https://expert-cert.co/archive/${certId}.pdf`,
      matched_watch_id: targetWatch.id,
      image_count: 1,
      source: 'Sotheby\'s'
    });

    // 1024-d Cert Embedding (highly similar to watch reference)
    const family = BRANDS_AND_FAMILIES.find(f => f.brand === targetWatch.brand)!;
    const certVector = generateNormalizedVector(1024, family.baseEmbedding1024, 0.03);
    certEmbeddings.push({
      cert_id: certId,
      image_index: 0,
      embedding: certVector
    });

    // Add Fake Embedding (somewhat distinct vector)
    const fakeVector = generateNormalizedVector(1024, family.baseEmbedding1024, 0.12);
    fakeEmbeddings.push({
      watch_id: targetWatch.id,
      source_url: 'https://reddit.com/r/RepTime/seizure-archive-99812',
      image_url: `https://reddit.com/r/RepTime/images/fake-${idx}.jpg`,
      embedding: fakeVector,
      fake_signal_notes: `Spotted subdial spacing mismatch of 0.8mm on Daytona copy, date magnification too low (2.2x).`
    });

    // Add Basic Heatmap annotations for top-20 watches
    if (idx < 20) {
      // Dial landmark
      heatmaps.push({
        watch_id: targetWatch.id,
        region_name: 'Dial Logo Printing',
        bbox: JSON.stringify({ x: 0.35, y: 0.20, w: 0.30, h: 0.10 }),
        signal_polarity: 'supports_real',
        importance_score: 8,
        notes: 'Check for high raised ink thickness (3D puff printing) and Cartier VII / Rolex coronet alignment.'
      });
      // Bezel alignment
      heatmaps.push({
        watch_id: targetWatch.id,
        region_name: 'Bezel Markers & Screws',
        bbox: JSON.stringify({ x: 0.10, y: 0.10, w: 0.80, h: 0.80 }),
        signal_polarity: 'supports_real',
        importance_score: 9,
        notes: 'Inspect AP hex screws flushness or Cerachrom bezel platinum fill consistency under macro lens.'
      });
    }
  }

  // Upload Certs
  console.log('📤 Uploading expert certificates exemplars...');
  const { error: certExError } = await supabase.from('expert_cert_exemplars').insert(certExemplars);
  if (certExError) console.error('❌ Error seeding cert exemplars:', certExError.message);

  console.log('📤 Uploading expert certificates embeddings...');
  const { error: certEmbError } = await supabase.from('expert_cert_embeddings').insert(certEmbeddings);
  if (certEmbError) console.error('❌ Error seeding cert embeddings:', certEmbError.message);

  // Upload Fakes
  console.log('📤 Uploading counterfeit embeddings...');
  const { error: fakeError } = await supabase.from('fake_embeddings').insert(fakeEmbeddings);
  if (fakeError) console.error('❌ Error seeding fake embeddings:', fakeError.message);

  // Upload Heatmaps
  console.log('📤 Uploading heatmap annotations...');
  const { error: heatError } = await supabase.from('heatmap_annotations').insert(heatmaps);
  if (heatError) console.error('❌ Error seeding heatmaps:', heatError.message);

  console.log('🎉 Mock luxury watch data ingestion successfully completed!');
}

ingestMockWatches().catch((err) => {
  console.error('💥 Ingestion failed catastrophically:', err);
  process.exit(1);
});
