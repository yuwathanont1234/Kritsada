/**
 * Authenticity Classifier — Binary "real vs fake" head over DINOv3 1024-d.
 *
 * Architecture:
 *   Linear(1024 → 128) → ReLU → Linear(128 → 1) → Sigmoid
 *
 * Output: P(real | image) ∈ [0, 1]
 *   ≥ 0.85 → very likely real
 *   0.5-0.85 → ambiguous
 *   < 0.30 → very likely fake
 */

import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system/legacy';

type ClassifierWeights = {
  inputDim: number;
  hiddenDim: number;
  outputDim: number;
  fc1Weight: Float32Array;
  fc1Bias: Float32Array;
  fc2Weight: Float32Array;
  fc2Bias: Float32Array;
};

let _weights: ClassifierWeights | null = null;
let _pending: Promise<ClassifierWeights> | null = null;

async function fetchAssetUri(): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const moduleId = require('./data/authenticity-classifier-weights.bin');
  const asset = Asset.fromModule(moduleId);
  await asset.downloadAsync();
  if (!asset.localUri) {
    throw new Error('authClassifier: asset.localUri missing after download');
  }
  return asset.localUri;
}

function parseWeights(buffer: ArrayBuffer): ClassifierWeights {
  const view = new DataView(buffer);
  const magic = String.fromCharCode(
    view.getUint8(0),
    view.getUint8(1),
    view.getUint8(2),
    view.getUint8(3)
  );
  if (magic !== 'SPAC') {
    throw new Error(`authClassifier: bad magic ${magic} (expected SPAC)`);
  }
  const version = view.getUint32(4, true);
  if (version !== 1) {
    throw new Error(`authClassifier: unsupported version ${version}`);
  }
  const inputDim = view.getUint32(8, true);
  const hiddenDim = view.getUint32(12, true);
  const outputDim = view.getUint32(16, true);
  const numArrays = view.getUint32(20, true);
  if (numArrays !== 4) {
    throw new Error(`authClassifier: expected 4 arrays, got ${numArrays}`);
  }

  let offset = 32;

  const readArray = (): Float32Array => {
    const rows = view.getUint32(offset, true);
    const cols = view.getUint32(offset + 4, true);
    offset += 8;
    const count = rows * cols;
    const arr = new Float32Array(buffer, offset, count);
    offset += count * 4;
    return arr;
  };

  const fc1Weight = readArray();
  const fc1Bias = readArray();
  const fc2Weight = readArray();
  const fc2Bias = readArray();

  if (fc1Weight.length !== hiddenDim * inputDim) {
    throw new Error('authClassifier: fc1.weight size mismatch');
  }
  if (fc2Weight.length !== outputDim * hiddenDim) {
    throw new Error('authClassifier: fc2.weight size mismatch');
  }

  return {
    inputDim,
    hiddenDim,
    outputDim,
    fc1Weight,
    fc1Bias,
    fc2Weight,
    fc2Bias,
  };
}

async function loadWeights(): Promise<ClassifierWeights> {
  if (_weights) return _weights;
  if (_pending) return _pending;
  _pending = (async () => {
    const uri = await fetchAssetUri();
    const b64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const binStr = atob(b64);
    const bytes = new Uint8Array(binStr.length);
    for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i);
    const parsed = parseWeights(bytes.buffer);
    _weights = parsed;
    _pending = null;
    return parsed;
  })();
  return _pending;
}

function dot(
  a: number[] | Float32Array,
  b: Float32Array,
  bOffset: number,
  bLen: number
): number {
  let s = 0;
  for (let i = 0; i < bLen; i++) s += a[i] * b[bOffset + i];
  return s;
}

function denseForward(
  x: number[] | Float32Array,
  weight: Float32Array,
  bias: Float32Array,
  rows: number,
  cols: number
): Float32Array {
  const out = new Float32Array(rows);
  for (let i = 0; i < rows; i++) {
    out[i] = dot(x, weight, i * cols, cols) + bias[i];
  }
  return out;
}

function relu(x: Float32Array): Float32Array {
  for (let i = 0; i < x.length; i++) if (x[i] < 0) x[i] = 0;
  return x;
}

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

export async function predictAuthenticity(
  embedding: number[] | Float32Array
): Promise<number | null> {
  const w = await loadWeights();
  if (embedding.length !== w.inputDim) {
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.warn(
        `[authClassifier] input dim ${embedding.length} ≠ expected ${w.inputDim}`
      );
    }
    return null;
  }
  let h = denseForward(embedding, w.fc1Weight, w.fc1Bias, w.hiddenDim, w.inputDim);
  h = relu(h);
  const logits = denseForward(h, w.fc2Weight, w.fc2Bias, w.outputDim, w.hiddenDim);
  return sigmoid(logits[0]);
}

export async function predictAuthenticityMulti(
  embeddings: Array<number[] | Float32Array>
): Promise<{ pReal: number | null; perPhoto: number[]; n: number }> {
  const perPhoto: number[] = [];
  for (const emb of embeddings) {
    const p = await predictAuthenticity(emb);
    if (p !== null && !Number.isNaN(p)) perPhoto.push(p);
  }
  if (perPhoto.length === 0) {
    return { pReal: null, perPhoto: [], n: 0 };
  }
  const pReal = perPhoto.reduce((a, b) => a + b, 0) / perPhoto.length;
  return { pReal, perPhoto, n: perPhoto.length };
}

export type AuthVerdictBucket =
  | 'real_strong'
  | 'real_weak'
  | 'fake_weak'
  | 'fake_strong';

export function bucketAuthVerdict(pReal: number): AuthVerdictBucket {
  if (pReal >= 0.85) return 'real_strong';
  if (pReal >= 0.5) return 'real_weak';
  if (pReal >= 0.3) return 'fake_weak';
  return 'fake_strong';
}

export async function ensureAuthClassifierLoaded(): Promise<void> {
  await loadWeights();
}

export async function getAuthClassifierInfo(): Promise<{
  inputDim: number;
  hiddenDim: number;
}> {
  const w = await loadWeights();
  return {
    inputDim: w.inputDim,
    hiddenDim: w.hiddenDim,
  };
}

declare const __DEV__: boolean;
