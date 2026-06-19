import { supabase } from './supabase';

/**
 * Passwordless email-OTP auth, reusing the watch app's proven Supabase flow
 * (signInWithOtp → verifyOtp type:'email'). Email OTP is free and needs no SMS
 * provider; it can be swapped for phone OTP later without touching the screens.
 */

/** Step 1: send a 6-digit code to `email`, creating the account if new. */
export async function sendEmailOtp(email: string): Promise<void> {
  const { error } = await supabase.auth.signInWithOtp({
    email: email.trim().toLowerCase(),
    options: { shouldCreateUser: true },
  });
  if (error) throw error;
}

/** Step 2: verify the code; on success the SDK persists the session. */
export async function verifyEmailOtp(email: string, token: string): Promise<void> {
  const { data, error } = await supabase.auth.verifyOtp({
    email: email.trim().toLowerCase(),
    token: token.trim(),
    type: 'email',
  });
  if (error) throw error;
  if (!data.user) throw new Error('verifyOtp returned no user');
}

export async function isAuthenticated(): Promise<boolean> {
  try {
    const { data } = await supabase.auth.getSession();
    return !!data.session?.user;
  } catch {
    return false;
  }
}

export async function getCurrentUserId(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.user?.id ?? null;
  } catch {
    return null;
  }
}

export async function getCurrentEmail(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.user?.email ?? null;
  } catch {
    return null;
  }
}

export async function logout(): Promise<void> {
  try {
    await supabase.auth.signOut();
  } catch {
    // A network/sign-out failure must never trap the user — the UI returns to
    // the login screen regardless.
  }
}
