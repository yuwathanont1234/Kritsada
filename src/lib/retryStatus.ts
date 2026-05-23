/**
 * Tiny global pub-sub for "the AI vendor returned a transient error and
 * we're retrying" notices. Used to surface a friendly Thai banner on the
 * Loading screen while geminiAi.ts is silently backing off + retrying
 * 503/502/504 responses (Gemini Flash periodically overloads).
 *
 * Before this existed, a typical Flash outage spiked scan time from
 * ~17 s to 1 m 52 s and the user just saw the same loading spinner for
 * two minutes — easy to assume the app had crashed or restarted. Now
 * the screen can show "ลองอีกครั้ง 3/4 — Gemini ติดขัด" so the wait
 * feels intentional.
 *
 * Architecture: module-scope singleton with a Set of subscribers.
 * publishRetry() is fire-and-forget; subscribers get the status object
 * synchronously and a follow-up null after the backoff delay so they
 * can clear their banner without manual timeout logic.
 *
 * Why not EventEmitter from 'events'? RN ships its own polyfill but
 * it's heavier than a Set; this module is ~30 lines and zero deps.
 */

export type RetryStatus = {
  /** The call site label (e.g. "identify", "auth", "price"). */
  label: string;
  /** HTTP status that triggered the retry. */
  status: number;
  /** 1-indexed attempt number that just failed; we're about to try (attempt+1). */
  attempt: number;
  /** Maximum attempts the caller will make before giving up. */
  maxAttempts: number;
  /** Model the next attempt will use. */
  nextModel: 'flash' | 'pro';
  /** Backoff in ms until the next attempt fires. */
  delayMs: number;
};

type Subscriber = (status: RetryStatus | null) => void;

const subscribers: Set<Subscriber> = new Set();

/**
 * Fire a retry notice. All current subscribers are called synchronously
 * with the new status, then again with `null` after the backoff window
 * elapses so they can clear their UI.
 */
export function publishRetry(status: RetryStatus): void {
  for (const fn of subscribers) {
    try {
      fn(status);
    } catch {
      // Never let a buggy subscriber take down the retry path.
    }
  }
  // Auto-clear: after the backoff + a small buffer, push null so the
  // subscriber can hide its banner if no follow-up retry arrived. The
  // follow-up retry (if any) will push its own status before this
  // null lands, and we just no-op on already-cleared state.
  const buffer = 750;
  setTimeout(() => {
    for (const fn of subscribers) {
      try {
        fn(null);
      } catch {
        /* ignore */
      }
    }
  }, status.delayMs + buffer);
}

/**
 * Subscribe to retry notices. Returns an unsubscribe function.
 * Use inside a useEffect with an empty deps array.
 */
export function subscribeRetry(fn: Subscriber): () => void {
  subscribers.add(fn);
  return () => {
    subscribers.delete(fn);
  };
}
