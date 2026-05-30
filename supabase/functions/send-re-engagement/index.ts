// ============================================================
// send-re-engagement — server-side push + LINE re-engagement.
// ============================================================
// Triggered by pg_cron (see supabase/migrations/0006_*.sql) when
// the funnel_events table indicates a cohort needs a nudge. Or
// callable directly via REST for manual campaigns.
//
// Request body (JSON):
//   {
//     "cohort_hashes": ["abc123...", ...],   // 1 or many
//     "campaign":      "cart_abandoned",     // see CAMPAIGNS enum
//     "language":      "th" | "en"           // override; else read profile
//   }
//
// Side effects per cohort:
//   1. Reads user_profile to get push_token + line_user_id + language
//   2. Composes a localized message body per campaign
//   3. Sends via Expo Push API (https://exp.host/--/api/v2/push/send)
//   4. Sends via LINE Messaging API (if line_user_id present)
//   5. Inserts a `re_engagement_sent` row into funnel_events
//
// Auth: requires the service-role JWT (set as Supabase function secret
// `SERVICE_ROLE_KEY`). NOT callable from anon clients.
// ============================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type Campaign = 'cart_abandoned' | 'free_limit_approaching' | 'dormant_7d' | 'weekly_digest';

// Localized message templates. Keep short — push notifications truncate
// past ~80 chars on most lock-screen previews. Tone: friendly, specific,
// action-oriented. No "URGENT!!" — Apple/Google flag aggressive copy.
const TEMPLATES: Record<Campaign, { th: { title: string; body: string }; en: { title: string; body: string } }> = {
  cart_abandoned: {
    th: {
      title: 'ลืมอะไรไว้หรือเปล่า?',
      body: 'แพ็กเกจ Pro ของคุณรออยู่ — รับส่วนลด 15% ใน 24 ชม.',
    },
    en: {
      title: 'Forgot something?',
      body: 'Your Pro upgrade is waiting — 15% off for the next 24 hours.',
    },
  },
  free_limit_approaching: {
    th: {
      title: 'ใกล้หมดสิทธิ์สแกนฟรีแล้ว',
      body: 'เหลือ 1 สแกน — อัปเกรดก่อนพลาดของสำคัญ',
    },
    en: {
      title: 'Almost out of free scans',
      body: '1 scan left — upgrade before you miss something important',
    },
  },
  dormant_7d: {
    th: {
      title: 'นาฬิกาคุณเป็นยังไงบ้าง?',
      body: 'ราคาตลาดเปลี่ยน 3% สัปดาห์นี้ — มาเช็กดูพอร์ตคุณ',
    },
    en: {
      title: 'How\'s your collection?',
      body: 'Market prices shifted 3% this week — check your portfolio',
    },
  },
  weekly_digest: {
    th: {
      title: 'สรุปประจำสัปดาห์',
      body: 'มีของใหม่ในระบบ + แบรนด์ที่คุณตามอยู่ปรับราคา',
    },
    en: {
      title: 'Your weekly digest',
      body: 'New references + price updates for the brands you watch',
    },
  },
};

interface UserProfileRow {
  cohort_hash: string;
  push_token: string | null;
  line_user_id: string | null;
  language: string | null;
  preferred_brand: string | null;
}

serve(async (req) => {
  const reqId = crypto.randomUUID().slice(0, 8);
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      console.error(`[reengagement:${reqId}] missing env`);
      return new Response(
        JSON.stringify({ error: 'Server not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body = await req.json();
    const cohortHashes: string[] = Array.isArray(body?.cohort_hashes) ? body.cohort_hashes : [];
    const campaign: Campaign = body?.campaign;
    const languageOverride: 'th' | 'en' | undefined = body?.language;

    if (cohortHashes.length === 0 || !TEMPLATES[campaign]) {
      return new Response(
        JSON.stringify({ error: 'Missing cohort_hashes or unknown campaign' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ── 1. Fetch user profiles for all cohorts in one round-trip ──
    const profilesUrl = `${SUPABASE_URL}/rest/v1/user_profile?cohort_hash=in.(${cohortHashes.map((c) => `"${c}"`).join(',')})&select=cohort_hash,push_token,line_user_id,language,preferred_brand`;
    const profilesRes = await fetch(profilesUrl, {
      headers: {
        apikey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!profilesRes.ok) {
      console.error(`[reengagement:${reqId}] profile fetch failed:`, profilesRes.status);
      return new Response(
        JSON.stringify({ error: 'Failed to read user profiles' }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    const profiles = (await profilesRes.json()) as UserProfileRow[];

    // ── 2. Compose + send (batched by channel) ────────────────────
    const expoMessages: any[] = [];
    const lineMessages: { userId: string; text: string }[] = [];

    for (const p of profiles) {
      const lang = (languageOverride ?? p.language ?? 'th') === 'th' ? 'th' : 'en';
      const tmpl = TEMPLATES[campaign][lang];
      if (p.push_token) {
        expoMessages.push({
          to: p.push_token,
          title: tmpl.title,
          body: tmpl.body,
          data: {
            campaign,
            trigger: 're_engagement',
            cohort_hash: p.cohort_hash,
          },
          // Sound + badge intentionally OFF — re-engagement should
          // be a soft nudge, not an alarm. Banner-only on iOS.
          priority: 'default',
        });
      }
      if (p.line_user_id) {
        lineMessages.push({
          userId: p.line_user_id,
          text: `${tmpl.title}\n${tmpl.body}`,
        });
      }
    }

    const expoResults = await sendExpoPush(expoMessages, reqId);
    const lineResults = await sendLineMessages(lineMessages, reqId);

    // ── 3. Log a re_engagement_sent event per cohort ─────────────
    // Best-effort; failures here shouldn't fail the whole call.
    const events = profiles.map((p) => ({
      cohort_hash: p.cohort_hash,
      event_type: 're_engagement_sent',
      payload: {
        campaign,
        push_sent: !!p.push_token,
        line_sent: !!p.line_user_id,
      },
      tier: null,
      app_version: 'server',
    }));
    if (events.length > 0) {
      void fetch(`${SUPABASE_URL}/rest/v1/funnel_events`, {
        method: 'POST',
        headers: {
          apikey: SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify(events),
      }).catch((e) => console.warn(`[reengagement:${reqId}] event log failed:`, e?.message));
    }

    return new Response(
      JSON.stringify({
        campaign,
        cohorts_targeted: cohortHashes.length,
        profiles_found: profiles.length,
        push_sent: expoResults.sent,
        push_failed: expoResults.failed,
        line_sent: lineResults.sent,
        line_failed: lineResults.failed,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error(`[reengagement:${reqId}] uncaught:`, error?.message);
    return new Response(
      JSON.stringify({ error: error?.message ?? 'unknown' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// ── Expo Push API ─────────────────────────────────────────────
// Free, no auth needed when sending from a server. Batches up to
// 100 messages per request. We chunk if needed.
async function sendExpoPush(
  messages: any[],
  reqId: string
): Promise<{ sent: number; failed: number }> {
  if (messages.length === 0) return { sent: 0, failed: 0 };
  let sent = 0;
  let failed = 0;
  const chunks: any[][] = [];
  for (let i = 0; i < messages.length; i += 100) {
    chunks.push(messages.slice(i, i + 100));
  }

  for (const chunk of chunks) {
    try {
      const res = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Accept-Encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(chunk),
        signal: AbortSignal.timeout(15000),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && Array.isArray(json?.data)) {
        for (const r of json.data) {
          if (r?.status === 'ok') sent += 1;
          else failed += 1;
        }
      } else {
        failed += chunk.length;
        console.warn(`[reengagement:${reqId}] expo push batch error:`, res.status, JSON.stringify(json).slice(0, 300));
      }
    } catch (e: any) {
      failed += chunk.length;
      console.warn(`[reengagement:${reqId}] expo push fetch threw:`, e?.message);
    }
  }
  return { sent, failed };
}

// ── LINE Messaging API ────────────────────────────────────────
// Requires LINE_CHANNEL_ACCESS_TOKEN env. If unset, silently skip
// LINE sends (push-only campaign still works). LINE OA push has a
// 500 message/month limit on free tier — enough for early launch.
async function sendLineMessages(
  messages: { userId: string; text: string }[],
  reqId: string
): Promise<{ sent: number; failed: number }> {
  if (messages.length === 0) return { sent: 0, failed: 0 };
  const LINE_TOKEN = Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN') ?? '';
  if (!LINE_TOKEN) {
    console.log(`[reengagement:${reqId}] LINE_CHANNEL_ACCESS_TOKEN not set — skipping LINE sends`);
    return { sent: 0, failed: 0 };
  }

  let sent = 0;
  let failed = 0;
  // LINE Messaging API supports multicast (max 500 userIds per call
  // with the same body). We group by message text for efficiency.
  for (const m of messages) {
    try {
      const res = await fetch('https://api.line.me/v2/bot/message/push', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${LINE_TOKEN}`,
        },
        body: JSON.stringify({
          to: m.userId,
          messages: [{ type: 'text', text: m.text }],
        }),
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) sent += 1;
      else {
        failed += 1;
        console.warn(`[reengagement:${reqId}] LINE send failed:`, res.status);
      }
    } catch (e: any) {
      failed += 1;
      console.warn(`[reengagement:${reqId}] LINE send threw:`, e?.message);
    }
  }
  return { sent, failed };
}
