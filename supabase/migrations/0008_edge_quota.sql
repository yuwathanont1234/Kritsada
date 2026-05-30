-- 0008_edge_quota.sql
-- Server-side per-device abuse cap (defense-in-depth).
--
-- WHY: every free/trial limit in the app is client-side AsyncStorage and the
-- edge functions (analyze-watch, embed-image) accept the anon key with NO
-- server-side quota — so a tampered/replayed client can call Gemini/Replicate
-- an unlimited number of times. This adds a coarse per-device rolling-day
-- ceiling enforced INSIDE the edge functions (via service role) BEFORE the
-- expensive AI call. It is NOT the product quota (the client still enforces the
-- real 5/20/50/100 tiers) — it's a cost circuit-breaker that caps how much any
-- single device identity can burn, even with a hacked client.
--
-- Keyed on the client's cohortHash (anonymous per-install id) with an IP
-- fallback. A scan makes ~5 billable edge calls (2 embed + identify + auth +
-- price), so the per-call cap maps to ~cap/5 scans/device/day. Default 300 ⇒
-- ~60 scans/device/day — far above any legit user (Premium client cap is 50
-- scans/day) yet caps runaway abuse. Tune via the EDGE_DEVICE_DAILY_CAP env.

create table if not exists public.edge_quota (
  device_id   text        not null,
  window_date date        not null default (now() at time zone 'utc')::date,
  count       integer     not null default 0,
  updated_at  timestamptz not null default now(),
  primary key (device_id, window_date)
);

-- Lock the table down: service_role bypasses RLS, anon/authenticated get nothing.
alter table public.edge_quota enable row level security;
revoke all on public.edge_quota from anon, authenticated;

-- Atomic check-and-increment. Increments first, then reports whether the new
-- count is within cap. Denied attempts still count (hammering stays denied).
create or replace function public.consume_edge_quota(p_device_id text, p_cap integer)
returns table(allowed boolean, used integer, cap integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_date  date := (now() at time zone 'utc')::date;
  v_count integer;
begin
  if p_device_id is null or length(p_device_id) = 0 then
    return query select true, 0, p_cap;  -- no id → don't block (caller falls back to IP)
    return;
  end if;

  insert into public.edge_quota (device_id, window_date, count, updated_at)
    values (p_device_id, v_date, 1, now())
  on conflict (device_id, window_date)
    do update set count = public.edge_quota.count + 1, updated_at = now()
  returning count into v_count;

  return query select (v_count <= p_cap), v_count, p_cap;
end;
$$;

-- Only the edge functions (service role) may call it.
revoke all on function public.consume_edge_quota(text, integer) from public, anon, authenticated;
grant execute on function public.consume_edge_quota(text, integer) to service_role;

-- Optional housekeeping: drop windows older than 7 days. Run via pg_cron, or
-- manually. Old rows are tiny so this is non-urgent.
--   SELECT cron.schedule('edge-quota-gc','17 3 * * *',
--     $$DELETE FROM public.edge_quota WHERE window_date < (now() at time zone 'utc')::date - 7$$);
