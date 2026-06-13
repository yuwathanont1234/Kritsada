import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

/**
 * delete-account — irreversibly deletes the calling user's account + all
 * server-side data they own. This is the server half of the in-app
 * "Delete Account & All Data" button, and is REQUIRED by Google Play's
 * account-deletion policy (a local-only wipe is non-compliant).
 *
 * Auth: the caller's own JWT (attached automatically by
 * supabase.functions.invoke when a session exists). We resolve the user id
 * from that token — a caller can therefore only ever delete THEIR OWN
 * account, never someone else's.
 *
 * What it removes:
 *   • user_scan_ledger, user_membership  (explicit, belt-and-suspenders —
 *     both also ON DELETE CASCADE from auth.users)
 *   • the auth.users row itself, via the admin API (cascades any remaining
 *     FK-linked rows)
 * NOTE: user_profile + scan_events are keyed on the ANONYMOUS cohort_hash,
 * not the user id, so the client deletes those separately via eraseMyData().
 * The local Vault/collection lives only in on-device storage (cleared by the
 * client's AsyncStorage.clear()).
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method not allowed' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    const url = Deno.env.get('SUPABASE_URL')
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!url || !serviceKey) {
      return new Response(JSON.stringify({ error: 'server misconfigured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const jwt = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim()
    if (!jwt) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2')
    const admin = createClient(url, serviceKey)

    // Resolve the caller from THEIR token. A service/anon key or an expired
    // session yields no user → refuse (never delete an unauthenticated id).
    const { data: u, error: uErr } = await admin.auth.getUser(jwt)
    const userId = u?.user?.id
    if (uErr || !userId) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Explicit per-table cleanup first (tolerant — a missing table or zero
    // rows must not abort the account deletion).
    for (const table of ['user_scan_ledger', 'user_membership']) {
      try {
        const { error } = await admin.from(table).delete().eq('user_id', userId)
        if (error) console.warn(`[delete-account] ${table} delete: ${error.message}`)
      } catch (e: any) {
        console.warn(`[delete-account] ${table} delete threw: ${e?.message}`)
      }
    }

    // Delete the auth user itself (cascades any remaining FK-linked rows).
    const { error: delErr } = await admin.auth.admin.deleteUser(userId)
    if (delErr) {
      console.error(`[delete-account] deleteUser failed user=${userId.slice(0, 8)}: ${delErr.message}`)
      return new Response(JSON.stringify({ error: delErr.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    console.log(`[delete-account] deleted user=${userId.slice(0, 8)}`)
    return new Response(JSON.stringify({ ok: true }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e: any) {
    console.error('[delete-account] uncaught:', e?.message)
    return new Response(JSON.stringify({ error: e?.message ?? 'bad request' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
