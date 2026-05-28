export type AuthenticitySignal = {
  signal: string;
  weight: 'positive' | 'negative' | 'neutral';
};

export type PriceByGrade = {
  excellent: number; // Perfect/Mint condition
  good: number;      // Light wear
  fair: number;      // Moderate wear/Scratches
};

export type PriceSource = {
  url: string;
  title: string;       // Web page title
  priceFound?: string; // Price found on that page (if any)
};

export type ReproductionPrice = {
  typical: number;                  // Most typical price for counterfeits
  range: { min: number; max: number };
  notes: string;                    // e.g., "typical rep street price"
};

export type ScanResult = {
  identified: boolean;
  confidence: number;               // Confidence in "identification" (not authenticity)
  name: string;
  brand: string;
  reference: string;
  movementFamily: string;           // movement / calibre family
  caseMaterial: string;             // case metal/material
  year: string;
  type: string;
  description: string;

  // Resale prices in USD
  marketPrice: number;
  priceRangeUSD: { min: number; max: number };
  priceByGrade: PriceByGrade;
  priceNotes: string;
  priceSources: PriceSource[];
  priceDataFreshness: 'live' | 'training' | 'mixed';

  // Authenticity assessment
  authenticityProbability?: number; // 0-100 — Chance of being authentic
  authenticityVerdict?: 'likely-authentic' | 'uncertain' | 'likely-reproduction' | 'cannot-assess';
  authenticityReasoning?: string;   // Reason for the verdict

  // Set by the macro-coverage gate in aiRouter when the scan had
  // fewer than 4 photos and the raw verdict would otherwise have
  // claimed > 70% confidence. ResultScreen renders a "Limited
  // photo coverage" banner + add-macro-photos CTA when this is
  // true. Not persisted to DB — derived per-scan.
  macroCoverageWarning?: boolean;

  // AI-Data Fusion: weight-discrepancy signal. Populated by aiRouter
  // when the user provided a measured weight AND a spec exists for
  // the identified reference. Drives a red "🚩 น้ำหนักไม่ตรงสเปก"
  // banner on ResultScreen when grade === 'mismatch'.
  weightCheck?: {
    userWeightG: number;
    nominalG: number;
    minG: number;
    maxG: number;
    material: string;
    grade: 'match' | 'slight' | 'mismatch';
    deltaG: number;
    // Bilingual override message — populated only when grade ===
    // 'mismatch' and a verdict override fired. UI renders the lang-
    // appropriate version. Keeping these structured (rather than
    // prepending raw English to authenticityReasoning) lets the
    // localisation system handle them correctly and keeps the
    // Gemini-authored reasoning untouched for downstream consumers
    // (e.g. PDF export).
    overrideMessage?: { th: string; en: string };
  };

  // Reproduction/fake price bands
  reproductionPrice?: ReproductionPrice;

  authenticitySignals: AuthenticitySignal[];
  checklist: string[];
  recommendation: string;
  warningFlags: string[];

  // Price cache provenance
  priceFromCache?: boolean;
  priceFetchedAt?: string; // ISO timestamp of when prices were fetched

  // Alternate guesses
  alternateNames?: string[];

  // Expert certificate exemplar match
  expertCertMatch?: {
    certId: string;
    watchName: string;
    watchReference: string | null;
    brand: string | null;
    certUrl: string;
    distance: number; // cosine — lower = stronger match
  };

  // Google Vision Web Detection — second opinion
  visionWebSuggestions?: {
    bestGuess?: string;
    entities: string[];
    pageTitles: string[];
  };

  // Watch dial bounding box for automatic cropping
  watchBbox?: {
    x: number;       // left edge, 0-1
    y: number;       // top edge, 0-1
    width: number;   // 0-1
    height: number;  // 0-1
  };

  crossValidation?: any;
  heatmap?: any;
};

export type SavedWatch = {
  id: string;
  savedAt: string; // ISO date
  result: ScanResult;
  frontUri: string; // permanent file URI (original)
  backUri?: string;
  notes?: string;
  purchasePrice?: number;
  customName?: string; // user-edited display name; falls back to result.name
  customPrice?: number; // shop/owner asking price
  categoryId?: string;
  processedFrontUri?: string;
  bgColor?: string; // hex
  galleryImages?: string[];
  soldAt?: string;       // ISO date of sale
  soldPrice?: number;    // received from buyer
  soldTo?: string;       // optional buyer name
  soldNotes?: string;
};

export type RootStackParamList = {
  Splash: undefined;
  Login: undefined;
  Onboarding: undefined;
  Main: undefined;
  Home: undefined;
  Scan: undefined;
  Loading: {
    frontUri: string;
    backUri?: string;
    extraImages?: string[];
  };
  Result: {
    result: ScanResult;
    frontUri: string;
    backUri?: string;
    savedId?: string; // present when viewing from Collection
    processedFrontUri?: string;
    bgColor?: string;
    customName?: string;
    customPrice?: number;
    purchasePrice?: number;
    notes?: string;
    categoryId?: string;
    galleryImages?: string[];
    soldAt?: string;
    soldPrice?: number;
    soldTo?: string;
    soldNotes?: string;
  };
  Collection: undefined;
  CollectionGoals: undefined;
  Portfolio: undefined;
  Transactions: undefined;
  TrayDetail: { filter: string }; // category id, '__all__', or '__none__'
  Articles: undefined;
  ArticleDetail: { articleId: string };
  News: undefined;
  Info: { kind: 'faq' | 'terms' | 'privacy' | 'contact' | 'guide' };
  DeviceInfo: undefined;
  PrivacySettings: undefined;
  Settings: undefined;
  ManageAccount: undefined;
  Profile: undefined;
  // `trigger` records WHY the paywall opened — used by MembershipScreen
  // to fire paywall_viewed with attribution. Falls back to 'unknown' if
  // omitted (legacy callers).
  Subscription: { trigger?: string } | undefined;
  Membership: { trigger?: string } | undefined;
  ImageCredits: undefined;
  AIQA: undefined;
  Game: undefined;
  AuthGuide: { watchId: string };
  AuthGuideList: undefined;
  AdminDashboard: undefined;
  ErrorReport: undefined;
  RefCompare: {
    referenceId: string;
    userImageUri: string;
  };
  ResultDetail: {
    section:
      | 'price'
      | 'authenticity'
      | 'reference'
      | 'description'
      | 'signals'
      | 'checklist'
      | 'recommendation';
    result: ScanResult;
    frontUri: string;
    matchedRefId?: string;
  };
  Capture: {
    onCapture: (uri: string) => void;
    title?: string;
  };
};
