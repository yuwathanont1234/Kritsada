import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

/**
 * cost-alert — hourly spend-anomaly watchdog (called by pg_cron, migration
 * 0017). Reads the TRUSTWORTHY server-side counters (global_scan_daily +
 * edge_quota), compares them to the configured caps, and pushes a message to
 * ALERT_WEBHOOK_URL when usage crosses 75% / 100% of a cap — at most once per
 * day per (metric, level), deduped via cost_alert_log.
 *
 * WHY: the previous "circuit breaker" was fed by CLIENT-side cost_events
 * (a tampered caller simply doesn't send them) and had no sender wired — a
 * runaway spend would have been discovered on the provider invoice.
 *
 * SETUP (operator):
 *   supabase secrets set ALERT_WEBHOOK_URL=<Discord/Slack/Make/LINE-bridge URL>
 * The payload carries content/text/message keys so Discord ("content"),
 * Slack ("text") and most generic webhook bridges accept it unchanged.
 * Without the secret the function still runs and logs — it just can't push.
 *
 * SECURITY: only the service-role caller (pg_cron via vault JWT, or an
 * operator with the service key) is accepted.
 */

serve(async (req) => {
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const jwt = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim()
  if (!serviceKey || jwt !== serviceKey) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  try {
    const url = Deno.env.get('SUPABASE_URL')
    if (!url) throw new Error('SUPABASE_URL missing')
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2')
    const admin = createClient(url, serviceKey)

    const day = new Date().toISOString().slice(0, 10) // UTC day, same bucket as the counters

    // ── Gather the trustworthy counters ──────────────────────────────────
    const SCAN_CAP = Number(Deno.env.get('GLOBAL_DAILY_SCAN_CAP') ?? '2000')
    const CALL_CAP = Number(Deno.env.get('GLOBAL_DAILY_CALL_CAP') ?? '3000')

    const { data: scanRow } = await admin
      .from('global_scan_daily').select('scans_used').eq('day', day).maybeSingle()
    const scansUsed = scanRow?.scans_used ?? 0

    const { data: callRow } = await admin
      .from('edge_quota').select('count')
      .eq('device_id', 'global:billable-calls').eq('window_date', day).maybeSingle()
    const callsUsed = callRow?.count ?? 0

    // Top consumers today — context for the alert message.
    const { data: topRows } = await admin
      .from('edge_quota').select('device_id, count')
      .eq('window_date', day)
      .not('device_id', 'like', 'global:%')
      .order('count', { ascending: false })
      .limit(3)
    const topTxt = (topRows ?? [])
      .map((r: any) => `${String(r.device_id).slice(0, 14)}…=${r.count}`)
      .join(', ')

    // ── Evaluate thresholds ───────────────────────────────────────────────
    type Alert = { metric: string; level: string; msg: string }
    const alerts: Alert[] = []
    const checkMetric = (metric: string, used: number, cap: number) => {
      if (cap <= 0) return
      if (used >= cap) {
        alerts.push({
          metric, level: 'breach',
          msg: `🚨 ${metric} ถึงเพดานแล้ว: ${used}/${cap} (UTC ${day}) — ระบบกำลังบล็อกคำขอเกินเพดาน`,
        })
      } else if (used >= cap * 0.75) {
        alerts.push({
          metric, level: 'warn75',
          msg: `⚠️ ${metric} ใช้ไปแล้ว ${used}/${cap} (≥75% ของเพดานวันนี้, UTC ${day})`,
        })
      }
    }
    checkMetric('global-scans', scansUsed, SCAN_CAP)
    checkMetric('global-billable-calls', callsUsed, CALL_CAP)

    // ── Dedupe + send ─────────────────────────────────────────────────────
    const webhook = Deno.env.get('ALERT_WEBHOOK_URL') ?? ''
    const sent: string[] = []
    for (const a of alerts) {
      // cost_alert_log PK (day, metric, level): the insert succeeds exactly
      // once per day per threshold — duplicates are silently dropped, so the
      // hourly cron can't spam the channel.
      const { data: ins } = await admin
        .from('cost_alert_log')
        .upsert({ day, metric: a.metric, level: a.level }, { onConflict: 'day,metric,level', ignoreDuplicates: true })
        .select()
      const isNew = Array.isArray(ins) && ins.length > 0
      if (!isNew) continue

      const body = `${a.msg}${topTxt ? `\nTop callers: ${topTxt}` : ''}`
      console.warn(`[cost-alert] ${body}`)
      if (webhook) {
        try {
          await fetch(webhook, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: body, text: body, message: body }),
            signal: AbortSignal.timeout(8000),
          })
          sent.push(`${a.metric}:${a.level}`)
        } catch (we: any) {
          console.error(`[cost-alert] webhook push failed: ${we?.message}`)
        }
      }
    }

    const summary = { day, scansUsed, scanCap: SCAN_CAP, callsUsed, callCap: CALL_CAP, alertsRaised: alerts.length, pushed: sent }
    console.log(`[cost-alert] ${JSON.stringify(summary)}`)
    return new Response(JSON.stringify(summary), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (e: any) {
    console.error('[cost-alert] failed:', e?.message)
    return new Response(JSON.stringify({ error: e?.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
