/**
 * AiProcessingConsentModal — explicit consent gate before camera/scan.
 *
 * Apple AI Policy 2025 + PDPA ม.19 + ม.28 require explicit consent before
 * sending user photos to third-party AI (Google Gemini USA, Replicate USA).
 *
 * This modal is shown ONCE on first scan attempt — once consented, it's
 * stored in AsyncStorage and the user can scan freely until they revoke
 * consent via Settings → Privacy.
 *
 * Distinct from DataConsentModal:
 *   - AiProcessingConsentModal = REQUIRED for scan (this file)
 *   - DataConsentModal         = OPTIONAL for bonus scans (analytics)
 */
import { Feather } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { grantAiConsent } from '../lib/aiConsent';
import { colors, radius, spacing } from '../lib/theme';

type Props = {
  visible: boolean;
  /** Called with the user's decision. true = granted, false = declined. */
  onDecided: (granted: boolean) => void;
};

export function AiProcessingConsentModal({ visible, onDecided }: Props) {
  const [submitting, setSubmitting] = useState(false);

  async function handleAccept() {
    setSubmitting(true);
    try {
      await grantAiConsent();
      onDecided(true);
    } finally {
      setSubmitting(false);
    }
  }

  function handleDecline() {
    onDecided(false);
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleDecline}
    >
      <View style={s.backdrop}>
        <View style={s.card}>
          {/* Header */}
          <View style={s.headerRow}>
            <View style={s.iconWrap}>
              <Feather name="shield" size={20} color={colors.amber} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.title}>AI Watch Diagnostics Consent</Text>
              <Text style={s.subtitle}>
                Consent for Data Processing (Compliance & Apple AI Policy 2025)
              </Text>
            </View>
          </View>
 
          <ScrollView style={s.body} showsVerticalScrollIndicator={false}>
            {/* What happens */}
            <Section title="📤 Data Routing & Destination">
              <Text style={s.bodyText}>
                When initiating a watch scan, your timepiece photographs will be processed securely via:
              </Text>
              <Bullet text="Google Gemini AI — Premium secure servers in the US (Cross-Border Transfer)" />
              <Bullet text="Replicate AI — Advanced visual feature vector extraction in the US" />
              <Text style={s.bodyText}>
                Both providers adhere to rigid Data Processing Addendums containing Standard Contractual Clauses (SCCs) to ensure absolute data safety.
              </Text>
            </Section>
 
            {/* What for */}
            <Section title="🎯 Intended Use & AI Diagnostics">
              <Bullet text="Optical analysis of timepiece brand, reference, and production era" />
              <Bullet text="Deep-learning evaluation of optical hallmarks and micro-anomalies" />
              <Bullet text="Generation of visual RAG landmark heatmaps (Premium feature)" />
            </Section>
 
            {/* What's protected */}
            <Section title="🔒 Privacy Safeguards & Assurances">
              <BulletGood text="Transient Processing — Captured photos are deleted instantly after diagnosis" />
              <BulletGood text="Zero Training Use — Your private watch images will never be used to train AI models" />
              <BulletGood text="Anonymized Ingestion — Zero personal identifiers (Name, Email, GPS) are attached" />
              <BulletGood text="Secure Hashing — Unique random cohort hashes prevent technical overlaps and errors" />
            </Section>
 
            {/* Withdrawal */}
            <View style={s.trustNote}>
              <Feather name="info" size={14} color={colors.textMuted} />
              <Text style={s.trustText}>
                You may withdraw this consent at any time in Settings → Privacy & Security.
                Please note that revoking consent disables optical scanning features, as the luxury diagnostic engine requires real-time cloud computing.
              </Text>
            </View>
 
            {/* Privacy policy link */}
            <Pressable
              onPress={() =>
                Linking.openURL('https://luxauth.img.co/privacy').catch(() => {})
              }
              style={s.policyLink}
            >
              <Text style={s.policyLinkText}>
                Read our Complete Privacy Policy →
              </Text>
            </Pressable>
          </ScrollView>
 
          {/* Footer — accept primary, decline secondary but visually equal */}
          <View style={s.footer}>
            <Pressable
              style={({ pressed }) => [s.btnAccept, pressed && { opacity: 0.88 }]}
              onPress={handleAccept}
              disabled={submitting}
            >
              <Text style={s.btnAcceptText}>
                {submitting ? 'Saving...' : 'Accept & Initialize Scan'}
              </Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [s.btnDecline, pressed && { opacity: 0.6 }]}
              onPress={handleDecline}
              disabled={submitting}
            >
              <Text style={s.btnDeclineText}>Decline</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={s.section}>
      <Text style={s.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Bullet({ text }: { text: string }) {
  return (
    <View style={s.bulletRow}>
      <Feather name="chevron-right" size={14} color={colors.amber} style={{ marginTop: 2 }} />
      <Text style={s.bulletText}>{text}</Text>
    </View>
  );
}

function BulletGood({ text }: { text: string }) {
  return (
    <View style={s.bulletRow}>
      <Feather name="check" size={14} color="#81C784" style={{ marginTop: 2 }} />
      <Text style={s.bulletText}>{text}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    maxHeight: '88%',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.amberGlow,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.amberGlow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 17, fontWeight: '700', color: colors.text },
  subtitle: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  body: { padding: spacing.lg, gap: spacing.md },
  section: { marginBottom: spacing.md, gap: spacing.xs },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 4,
  },
  bodyText: { fontSize: 13, color: colors.textSecondary, lineHeight: 20 },
  bulletRow: {
    flexDirection: 'row',
    gap: 6,
    paddingLeft: spacing.xs,
  },
  bulletText: { flex: 1, fontSize: 12, color: colors.textSecondary, lineHeight: 18 },
  trustNote: {
    flexDirection: 'row',
    gap: 6,
    backgroundColor: colors.surfaceMuted,
    padding: spacing.sm,
    borderRadius: radius.sm,
    marginTop: spacing.sm,
  },
  trustText: { flex: 1, fontSize: 11, color: colors.textMuted, lineHeight: 16 },
  policyLink: { marginTop: spacing.sm, marginBottom: spacing.sm },
  policyLinkText: {
    fontSize: 12,
    color: colors.amber,
    textAlign: 'center',
    textDecorationLine: 'underline',
  },
  footer: {
    padding: spacing.lg,
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  btnAccept: {
    backgroundColor: colors.amber,
    paddingVertical: spacing.md,
    borderRadius: radius.full,
    alignItems: 'center',
  },
  btnAcceptText: { fontSize: 15, fontWeight: '700', color: '#000' },
  btnDecline: {
    paddingVertical: spacing.md,
    borderRadius: radius.full,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  btnDeclineText: { fontSize: 14, fontWeight: '600', color: colors.textSecondary },
});
