import * as ImageManipulator from 'expo-image-manipulator';

/**
 * Crop a watch photo to its tight bounding box using normalized 0-1 coords
 * returned by Gemini identify (`watchBbox`). Eliminates the outer background
 * without a Replicate BG-removal call.
 *
 * Adds a small safety padding around the AI-given bbox (default 12%) so the
 * watch body never sits flush against the cropped edge.
 *
 * Returns the cropped image URI, or the original URI on failure / invalid
 * bbox. Fail-soft so the rest of the scan flow is unaffected if crop fails.
 *
 * Pipeline:
 *   1. Read photo dimensions via ImageManipulator (no transform pass)
 *   2. Validate bbox: x/y in [0,1), x+w ≤ 1, y+h ≤ 1, w/h > MIN_BBOX_SIZE
 *   3. Apply padding, clamp to image bounds
 *   4. Crop via ImageManipulator
 */

const PADDING_RATIO = 0.12;
const MIN_BBOX_SIZE = 0.15; // bbox edge must be ≥15% — guards against AI returning a tiny bogus rect

export type WatchBbox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export function isValidBbox(bbox: unknown): bbox is WatchBbox {
  if (!bbox || typeof bbox !== 'object') return false;
  const b = bbox as Partial<WatchBbox>;
  if (
    typeof b.x !== 'number' ||
    typeof b.y !== 'number' ||
    typeof b.width !== 'number' ||
    typeof b.height !== 'number'
  ) {
    return false;
  }
  if (b.x < 0 || b.y < 0) return false;
  if (b.width < MIN_BBOX_SIZE || b.height < MIN_BBOX_SIZE) return false;
  if (b.x + b.width > 1.001 || b.y + b.height > 1.001) return false;
  return true;
}

export async function cropToBbox(
  uri: string,
  bbox: WatchBbox
): Promise<string> {
  if (!isValidBbox(bbox)) return uri;
  try {
    const info = await ImageManipulator.manipulateAsync(uri, [], {
      compress: 1,
    });
    const w = info.width;
    const h = info.height;
    if (!w || !h) return uri;

    const padX = bbox.width * PADDING_RATIO;
    const padY = bbox.height * PADDING_RATIO;
    const x0 = Math.max(0, bbox.x - padX);
    const y0 = Math.max(0, bbox.y - padY);
    const x1 = Math.min(1, bbox.x + bbox.width + padX);
    const y1 = Math.min(1, bbox.y + bbox.height + padY);

    const cropX = Math.round(x0 * w);
    const cropY = Math.round(y0 * h);
    const cropW = Math.round((x1 - x0) * w);
    const cropH = Math.round((y1 - y0) * h);
    if (cropW <= 0 || cropH <= 0) return uri;

    const result = await ImageManipulator.manipulateAsync(
      uri,
      [
        {
          crop: {
            originX: cropX,
            originY: cropY,
            width: cropW,
            height: cropH,
          },
        },
      ],
      { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG }
    );
    return result.uri;
  } catch (e: any) {
    console.warn('[bboxCrop] failed:', e?.message ?? e);
    return uri;
  }
}
