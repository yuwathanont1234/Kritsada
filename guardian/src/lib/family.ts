import { supabase } from './supabase';
import type { FamilyLink } from './types';

/** 8-char invite code; omits ambiguous 0/O/1/I for easy reading aloud.
 *  32^8 ≈ 1.1 trillion combinations — brute-force infeasible at sane request rates. */
function genCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 8; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
  return s;
}

/** Guardian (child) creates a pending invite to share with the protected
 *  (parent). Retries on the rare code collision. */
export async function createInvite(): Promise<FamilyLink> {
  const { data: sess } = await supabase.auth.getSession();
  const uid = sess.session?.user?.id;
  if (!uid) throw new Error('not_authenticated');

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = genCode();
    const { data, error } = await supabase
      .from('guardian_family_links')
      .insert({ guardian_user_id: uid, invite_code: code, status: 'pending' })
      .select()
      .single();
    if (!error && data) return data as FamilyLink;
    if (error && !(error?.message ?? '').toLowerCase().includes('duplicate')) throw error;
  }
  throw new Error('could_not_generate_code');
}

/** Protected (parent) redeems the code the guardian shared. */
export async function redeemInvite(code: string): Promise<void> {
  const { data, error } = await supabase.rpc('guardian_redeem_invite', {
    p_code: code.trim().toUpperCase(),
  });
  if (error) throw error;
  const res = data as { ok: boolean; error?: string };
  if (!res?.ok) throw new Error(res?.error || 'redeem_failed');
}

/** All links the current user is a party to (either side). */
export async function listFamilyLinks(): Promise<FamilyLink[]> {
  const { data, error } = await supabase
    .from('guardian_family_links')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as FamilyLink[];
}

export async function setNotifyOn(linkId: string, notifyOn: string[]): Promise<void> {
  const { error } = await supabase
    .from('guardian_family_links')
    .update({ notify_on: notifyOn })
    .eq('id', linkId);
  if (error) throw error;
}

export async function removeLink(linkId: string): Promise<void> {
  const { error } = await supabase.from('guardian_family_links').delete().eq('id', linkId);
  if (error) throw error;
}
