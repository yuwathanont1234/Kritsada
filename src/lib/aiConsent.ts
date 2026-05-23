/**
 * AI Processing Consent — explicit user consent for sending photos to
 * third-party AI processors (Google Gemini + Replicate, both USA).
 *
 * REQUIRED for core scan functionality. Distinct from DataConsentModal
 * which handles OPTIONAL analytics consent for bonus scans.
 *
 * Why this exists:
 *   1. **Apple AI Policy 2025** — apps must obtain explicit user consent
 *      before sending user data to third-party AI services. Failure to do
 *      so risks App Store review rejection.
 *   2. **PDPA มาตรา 19** — consent for personal data processing must be
 *      "freely given, specific, informed, and unambiguous". Mere acceptance
 *      of Privacy Policy in the install flow isn't enough for sensitive
 *      processing like cross-border photo transfer.
 *   3. **PDPA มาตรา 28** — cross-border transfer disclosure requirement.
 *      User must be told photos go to USA before it happens.
 *
 * Storage versioned (v1) so we can re-prompt if vendor/policy materially
 * changes (e.g., adding a new processor, changing data retention).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEYS = {
  aiConsentV1: '@luxauth/ai_consent_v1',
  aiConsentTimestamp: '@luxauth/ai_consent_v1_at',
};

/** Current consent version. Bump when material changes to AI processors. */
export const AI_CONSENT_VERSION = 1;

export type AiConsentStatus = {
  /** True if user has explicitly consented to AI processing of their photos */
  granted: boolean;
  /** ISO timestamp when consent was granted (or null if never) */
  grantedAt: string | null;
  /** Version of consent that was granted — re-prompt if older than current */
  version: number | null;
};

/** Read current AI consent status. */
export async function getAiConsent(): Promise<AiConsentStatus> {
  const granted = (await AsyncStorage.getItem(KEYS.aiConsentV1)) === 'true';
  const grantedAt = await AsyncStorage.getItem(KEYS.aiConsentTimestamp);
  return {
    granted,
    grantedAt,
    version: granted ? AI_CONSENT_VERSION : null,
  };
}

/** Grant AI processing consent. Called from AiProcessingConsentModal. */
export async function grantAiConsent(): Promise<void> {
  await AsyncStorage.multiSet([
    [KEYS.aiConsentV1, 'true'],
    [KEYS.aiConsentTimestamp, new Date().toISOString()],
  ]);
}

/** Revoke AI consent. Called from PrivacySettings → "ถอนความยินยอม".
 *  User can't use scan after this until they grant consent again. */
export async function revokeAiConsent(): Promise<void> {
  await AsyncStorage.multiRemove([
    KEYS.aiConsentV1,
    KEYS.aiConsentTimestamp,
  ]);
}

/** Convenience: is consent currently in force? */
export async function hasValidAiConsent(): Promise<boolean> {
  const status = await getAiConsent();
  return status.granted && status.version === AI_CONSENT_VERSION;
}
