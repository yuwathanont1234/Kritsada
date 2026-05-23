import * as ImageManipulator from 'expo-image-manipulator';

/**
 * Cheap on-device pre-classifier — runs before any AI call to catch the
 * obvious "this clearly isn't a watch photo" cases (selfies, screenshots,
 * food, panoramic landscapes). Uses only image geometry, so it costs $0.
 *
 * Wired into aiRouter for the Free tier only. Paid tiers always run the
 * full pipeline because they pay for accuracy + edge-case tolerance.
 */

// Watch dials and cases are nearly always square, circular, or slightly portrait.
// Anything wider than 1:1.6 (closer to landscape) is almost certainly NOT a watch.
const MAX_LANDSCAPE_RATIO = 1.6; // width/height > 1.6 → reject
// Extreme portrait beyond 1:1.6 is unusual for close-up watch photos.
const MAX_PORTRAIT_RATIO = 1.6; // height/width > 1.6 → reject

// Below 256px on the long side is so low-resolution Gemini can't read detail anyway.
const MIN_LONG_SIDE_PX = 256;

export type PreflightResult =
  | { ok: true }
  | { ok: false; reason: string; userMessage: string };

/**
 * Inspect the image at `uri` and decide whether it's worth burning a
 * Gemini/Visual RAG call on. Returns `ok:true` for anything that might be a watch,
 * `ok:false` with a Thai user-facing message when we can confidently reject.
 */
export async function preflightWatchCheck(
  uri: string
): Promise<PreflightResult> {
  let width: number;
  let height: number;
  try {
    const info = await ImageManipulator.manipulateAsync(uri, [], {
      base64: false,
    });
    width = info.width;
    height = info.height;
  } catch {
    // Couldn't read dimensions — let the AI deal with it rather than blocking the user.
    return { ok: true };
  }

  if (!width || !height) return { ok: true };

  const longSide = Math.max(width, height);
  if (longSide < MIN_LONG_SIDE_PX) {
    return {
      ok: false,
      reason: `low-res:${width}x${height}`,
      userMessage:
        'รูปภาพมีขนาดเล็กเกินสำหรับการระบุนาฬิกา — ถ่ายใหม่ให้นาฬิกาอยู่เต็มกรอบในที่สว่าง แล้วลองอีกครั้ง',
    };
  }

  const ratioWH = width / height;
  if (ratioWH > MAX_LANDSCAPE_RATIO) {
    return {
      ok: false,
      reason: `landscape:${ratioWH.toFixed(2)}`,
      userMessage:
        'ภาพกว้างเกินกว่ารูปนาฬิกาทั่วไป — ถ่ายภาพนาฬิกาโดยเน้นให้เรือนอยู่ในกรอบแบบ 1:1 และอยู่ในแนวระนาบปกติ',
    };
  }

  const ratioHW = height / width;
  if (ratioHW > MAX_PORTRAIT_RATIO) {
    return {
      ok: false,
      reason: `tall:${ratioHW.toFixed(2)}`,
      userMessage:
        'ภาพยาวเกินกว่ารูปนาฬิกาทั่วไป — ซูมหรือถ่ายรูปให้เห็นนาฬิกาเต็มกรอบ โดยไม่มีพื้นหลังด้านบนและด้านล่างมากเกินไป',
    };
  }

  return { ok: true };
}
