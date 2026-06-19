// Shared types for the Guardian client. The analysis shapes mirror the
// guardian-analyze Edge Function's request/response exactly.

export type ContentType = 'text' | 'image';

export type IdType = 'phone' | 'bank_account' | 'promptpay' | 'url' | 'entity_name';

export type IdentifierInput = {
  type: IdType;
  value: string;
};

export type AnalysisRequest = {
  content: string;
  content_type: ContentType;
  identifiers?: IdentifierInput[];
};

export type RedFlagCategory =
  | 'guaranteed_returns'
  | 'honeymoon_phase'
  | 'withdrawal_blocked'
  | 'authority_impersonation'
  | 'group_recruitment'
  | 'urgency_pressure'
  | 'personal_account_transfer'
  | 'work_from_home_advance'
  | 'romance_investment';

export type RedFlag = {
  category: RedFlagCategory | string;
  severity: 'high' | 'medium' | 'low';
  quote: string;
  headline: string;
  why: string;
};

export type RiskLevel = 'RED' | 'YELLOW' | 'GREEN';
export type Layer1Status = 'BAD' | 'LICENSED' | 'UNKNOWN';
export type AIConfidence = 'high' | 'medium' | 'low';

export type AnalysisResponse = {
  risk_level: RiskLevel;
  layer1_status: Layer1Status;
  ai_score: number;
  ai_confidence: AIConfidence;
  red_flags: RedFlag[];
  what_to_do: string;
  summary: string;
  from_cache: boolean;
  disclaimer: string;
};

// Local history (AsyncStorage)
export type RecentCheck = {
  id: string;
  created_at: string;
  content_preview: string;
  risk_level: RiskLevel;
  red_flag_count: number;
};

// Family linking
export type FamilyRole = 'guardian' | 'protected';

export type FamilyLink = {
  id: string;
  guardian_user_id: string;
  protected_user_id: string | null;
  invite_code: string;
  status: 'pending' | 'active' | 'revoked';
  notify_on: string[];
  created_at: string;
  activated_at: string | null;
};

// Navigation
export type RootStackParamList = {
  Splash: undefined;
  Login: undefined;
  Home: undefined;
  Analysis: {
    content: string;
    content_type: ContentType;
    identifiers?: IdentifierInput[];
  };
  Result: {
    response: AnalysisResponse;
    content_preview: string;
  };
  Rescue: undefined;
  Family: undefined;
  Settings: undefined;
};
