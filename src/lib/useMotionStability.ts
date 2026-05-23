/**
 * Motion stability detector for scan coaching (Trick C1).
 *
 * Uses Accelerometer (gravity-cancelled magnitude approximation) to
 * detect when the phone is being held steady — the signal we use to
 * (a) tell the user "🟢 พร้อมถ่าย" and (b) optionally auto-trigger the
 * shutter so the user never has to tap during the steady moment.
 *
 * Why accelerometer (not gyroscope):
 *   - Gyroscope measures rotational velocity (deg/s). Good for rotation
 *     detection, but the user's primary motion during framing is small
 *     translations + tiny rotations — accelerometer catches both as a
 *     combined "shakiness" signal.
 *   - On Android, gyroscope is missing on low-end devices but
 *     accelerometer is universal (cheapest MEMS sensor).
 *
 * Stability is measured as: standard deviation of |a| over a sliding
 * 800ms window. Below threshold for STABLE_HOLD_MS → considered stable.
 */

import { useEffect, useRef, useState } from 'react';
import { Accelerometer } from 'expo-sensors';

export type StabilityState = 'unstable' | 'stabilizing' | 'stable';

interface UseMotionStabilityOptions {
  /** Update rate for accelerometer reads (ms). Default 100ms (10 Hz). */
  sampleIntervalMs?: number;
  /** Sliding-window length for std-dev calculation. Default 800ms. */
  windowMs?: number;
  /** Std-dev below this = considered stable. Empirical tuning value. */
  stableThreshold?: number;
  /** Time stability must hold before transitioning STABLE. */
  stableHoldMs?: number;
  /** Whether to track motion at all (turn off when busy/off-screen). */
  enabled?: boolean;
}

/**
 * Hook that returns the current stability state, plus the raw shakiness
 * metric (useful for showing a meter).
 */
export function useMotionStability(opts: UseMotionStabilityOptions = {}) {
  const {
    sampleIntervalMs = 100,
    windowMs = 600,
    // Slightly more permissive than the original 0.025 — field testing
    // on real device showed even careful holds occasionally spike past
    // 0.025 from breathing, making the green state feel out-of-reach.
    stableThreshold = 0.035,
    // Tuning history:
    //   1200ms (initial) → 800ms (felt unresponsive) → 1100ms (current).
    // 800ms made auto-shutter fire faster than the user could confirm
    // they had the right framing — they reported "AUTO เร็วไปนิด". The
    // 1100ms sweet spot keeps the perception of "the system noticed"
    // (sub-1.5s feedback) while giving the user a beat to abort if
    // they're not happy with the aim.
    stableHoldMs = 1100,
    enabled = true,
  } = opts;

  const [state, setState] = useState<StabilityState>('unstable');
  const [shakiness, setShakiness] = useState(1);

  // Sliding window of |a|^2 - 1 samples (gravity cancelled).
  const samples = useRef<number[]>([]);
  const stableSince = useRef<number | null>(null);
  const maxSamples = Math.max(4, Math.floor(windowMs / sampleIntervalMs));

  useEffect(() => {
    if (!enabled) {
      samples.current = [];
      stableSince.current = null;
      setState('unstable');
      setShakiness(1);
      return;
    }

    Accelerometer.setUpdateInterval(sampleIntervalMs);
    const sub = Accelerometer.addListener(({ x, y, z }) => {
      // |a|^2 in g². At rest |a| ≈ 1g, so this hovers around 1.
      // We subtract 1 so the static-gravity baseline is at zero.
      const mag2 = x * x + y * y + z * z - 1;
      samples.current.push(mag2);
      if (samples.current.length > maxSamples) {
        samples.current.shift();
      }
      // Variance of the window — proxy for how shaky the hand is.
      const n = samples.current.length;
      const mean = samples.current.reduce((s, v) => s + v, 0) / n;
      const variance =
        samples.current.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
      const stdDev = Math.sqrt(variance);
      setShakiness(stdDev);

      const now = Date.now();
      if (stdDev < stableThreshold) {
        if (stableSince.current === null) {
          stableSince.current = now;
          setState('stabilizing');
        } else if (now - stableSince.current >= stableHoldMs) {
          setState('stable');
        }
      } else {
        stableSince.current = null;
        if (stdDev > stableThreshold * 2.5) {
          setState('unstable');
        }
      }
    });

    return () => sub.remove();
  }, [enabled, sampleIntervalMs, maxSamples, stableThreshold, stableHoldMs]);

  return { state, shakiness };
}
