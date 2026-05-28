# IAP Integration — Operator Setup Guide

This document describes the **manual setup** the operator must complete
*outside* the codebase to actually charge users via Apple App Store and
Google Play. The code in `src/lib/iap.ts` is already wired and will use
RevenueCat once the dashboard + store products are configured.

Until the steps below are complete, the app runs in **MOCK mode** — the
subscription UI works but no money changes hands. Mock mode is safe to
keep enabled during development.

---

## Phase A: Apple App Store Connect (iOS)

### A.1 Prerequisites

- Active Apple Developer Program membership ($99/year)
- Tax + banking information completed in App Store Connect → Agreements
- App created in App Store Connect with bundle ID `com.kritsada.luxuryauthenticator`

### A.2 Create the 3 subscription products

App Store Connect → your app → **Subscriptions** → **Create Subscription Group**

1. Group name: `LuxuryAuthenticatorMain`
2. Reference name: `Luxury Authenticator Main`

Then create 3 subscriptions in that group:

| Reference Name | Product ID | Price (THB) | Duration | Localization |
|---|---|---|---|---|
| Standard Monthly | `lux_std_990` | ฿990 | 1 month | EN + TH |
| Pro Monthly | `lux_pro_1990` | ฿1,990 | 1 month | EN + TH |
| Premium Monthly | `lux_premium_4990` | ฿4,990 | 1 month | EN + TH |

Each product needs:
- **Display name** (shown to users): "Standard / Pro / Premium"
- **Description**: scan count + key features (see existing UI for copy)
- **Promotional images** (1024x1024 — only if you run promo offers)
- **Review screenshot**: PNG of paywall UI (Apple requires this)

### A.3 Generate App Store Connect API Key (for RevenueCat)

App Store Connect → **Users and Access** → **Keys** → **+**

- Name: `RevenueCat Integration`
- Access: **App Manager**
- Download the `.p8` file (you can only download ONCE)
- Note the **Key ID** and **Issuer ID**

---

## Phase B: Google Play Console (Android)

### B.1 Prerequisites

- Active Google Play Developer account ($25 one-time)
- App created with package name `com.kritsada.luxuryauthenticator`
- Tax + Merchant account verified
- At least one Internal Track APK uploaded (Google requires this before
  enabling IAP)

### B.2 Create the same 3 subscription products

Play Console → your app → **Monetize** → **Products** → **Subscriptions**

Use the **SAME product IDs** as iOS — RevenueCat expects them to match:

- `lux_std_990` — ฿990 / month
- `lux_pro_1990` — ฿1,990 / month
- `lux_premium_4990` — ฿4,990 / month

### B.3 Generate Service Account JSON (for RevenueCat)

Google Cloud Console → **IAM & Admin** → **Service Accounts** → **Create**

- Name: `RevenueCat Server`
- Grant role: **Pub/Sub Admin** + **Service Account Token Creator**
- Create key → JSON → download

Then in Play Console → **Setup** → **API access** → Link the project →
Grant the service account access to "Financial data" and "Manage orders".

---

## Phase C: RevenueCat Dashboard

### C.1 Sign up

https://app.revenuecat.com (free tier covers up to $10k Monthly Tracked Revenue)

### C.2 Create project

- Project name: `Luxury Authenticator`
- Add the iOS app:
  - Bundle ID: `com.kritsada.luxuryauthenticator`
  - Upload the `.p8` key file from Phase A.3
  - Paste Key ID + Issuer ID
- Add the Android app:
  - Package name: `com.kritsada.luxuryauthenticator`
  - Upload the service account JSON from Phase B.3

### C.3 Create Entitlements

RevenueCat → **Entitlements** → **+ New** (create 3):

- `standard` — display "Standard Tier"
- `pro` — display "Pro Tier"
- `premium` — display "Premium Tier"

These MUST match the strings in `src/lib/iap.ts` → `ENTITLEMENT_FOR_TIER`.

### C.4 Attach Products to Entitlements

RevenueCat → **Products** → for each product:

| Product ID | Entitlement |
|---|---|
| `lux_std_990` | `standard` |
| `lux_pro_1990` | `pro` |
| `lux_premium_4990` | `premium` |

### C.5 Create the Offering

RevenueCat → **Offerings** → **+ New**:

- Identifier: `default`
- Packages: add one package per product (use the "Custom" duration)
- Mark as **Current** ← critical, the app reads `offerings.current`

### C.6 Copy the API Keys

RevenueCat → **Project Settings** → **API Keys**:

- iOS public key: `appl_xxxxxxxxxxxx`
- Android public key: `goog_xxxxxxxxxxxx`

Add to your `.env` file (and to EAS secrets when building):

```bash
EXPO_PUBLIC_REVENUECAT_API_KEY_IOS=appl_xxxxxxxxxxxx
EXPO_PUBLIC_REVENUECAT_API_KEY_ANDROID=goog_xxxxxxxxxxxx
```

---

## Phase D: Sandbox Testing

### D.1 iOS — Sandbox testers

App Store Connect → **Users and Access** → **Sandbox Testers** → **+**:

- Create at least 3 testers (each with a unique email — does NOT need to
  be a real email, but must look real, e.g. `tester1@luxauth-test.com`)
- Note the passwords — you'll need to log in on the device

On the test device:
- iOS Settings → App Store → Sandbox Account → sign in with a tester

### D.2 Android — License testers

Play Console → **Setup** → **License testing**:

- Add the test Gmail account(s)
- Builds installed via Internal Testing track will charge sandbox, not
  real money

### D.3 Build a native app (NOT Expo Go!)

Expo Go does not include react-native-purchases native module. You must
build a development client:

```bash
# iOS — needs a Mac + Xcode
eas build --profile development --platform ios

# Android — works anywhere
eas build --profile development --platform android
```

Then install the build on your test device and run the app from there.

### D.4 Test the paywall flow

1. Open the app → MembershipScreen
2. Tap any tier card → StoreKit / Google Play sheet appears
3. Complete the sandbox purchase (no real money charged)
4. Verify the tier upgrade applies + RevenueCat dashboard shows the event
5. Test **Restore Purchases** — should resync the active entitlement
6. Test cancel via iOS Settings → Subscriptions → verify app downgrades
   to Free within ~5 minutes (or on next foreground)

---

## Phase E: Production Launch Checklist

Before submitting to App Store / Play review:

- [ ] All 3 products approved by Apple (review can take 24-48h)
- [ ] All 3 products published on Google Play
- [ ] RevenueCat dashboard shows products as "Approved"
- [ ] `.env` has real `EXPO_PUBLIC_REVENUECAT_API_KEY_*` keys (NOT empty)
- [ ] Privacy URL works: https://yuwathanont1234.github.io/Kritsada/legal/privacy.html ✅
- [ ] Terms URL works: https://yuwathanont1234.github.io/Kritsada/legal/terms.html ✅
- [ ] Restore Purchases button visible on paywall ✅ (already in code)
- [ ] Trademark disclaimer visible on paywall + settings ✅ (already in code)
- [ ] Sandbox tested at least once per platform ⏳
- [ ] App Store screenshots showing the paywall with prices

---

## Quick Reference: Product / Entitlement Mapping

```
Apple App Store / Google Play
└── lux_std_990, lux_pro_1990, lux_premium_4990
     │
     ▼ purchase
     │
RevenueCat (handles receipt validation + state)
└── Entitlements: standard, pro, premium
     │
     ▼ on entitlement active
     │
App (src/lib/iap.ts)
└── customerInfoToTier() picks highest active entitlement
     │
     ▼ sets local membership
     │
src/lib/auth.ts → setMembership(tier)
     │
     ▼ unlocks features
     │
src/lib/tier.ts → tierCaps(tier)
```

If the user's subscription is cancelled or expires, RevenueCat sends a
real-time event via `listenIapChanges()`, the App.tsx listener picks it
up, and the tier downgrades automatically.

---

## Cost Estimate (Monthly)

- RevenueCat: $0 (free tier up to $10k MTR)
- Apple Developer Program: $99/year (~฿285/month)
- Google Play Developer: $25 one-time (~฿0/month after Y1)
- App Store + Google Play take: 15% of subscription revenue (Small
  Business Program, applies first year + when MTR < $1M)

Total fixed: ~฿285/month + 15% of revenue.

---

## Support

For questions, contact the operator. RevenueCat support is also
excellent: https://www.revenuecat.com/docs/customer-support
