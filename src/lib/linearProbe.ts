/**
 * Linear Probe — Client-side projection from 1024-d to 256-d.
 *
 * Architecture: 2-layer MLP applied to frozen DINOv3 1024-d embeddings.
 *   Linear(1024 → 512) → ReLU → Linear(512 → 256)
 *   Output: L2-normalized 256-d vector
 *
 * Usage:
 *   import { applyLinearProbe } from './linearProbe';
 *   const probed = await applyLinearProbe(dinov3RawEmbedding);  // 1024-d → 256-d
 */

import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system/legacy';

type ProbeWeights = {
  inputDim: number;
  hiddenDim: number;
  outputDim: number;
  layer1Weight: Float32Array; // length = hidden * input, row-major
  layer1Bias: Float32Array;   // length = hidden
  layer2Weight: Float32Array; // length = output * hidden, row-major
  layer2Bias: Float32Array;   // length = output
};

let _weights: ProbeWeights | null = null;
let _pending: Promise<ProbeWeights> | null = null;

async function fetchAssetUri(): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const moduleId = require('./data/linear-probe-weights.bin');
  const asset = Asset.fromModule(moduleId);
  await asset.downloadAsync();
  if (!asset.localUri) {
    throw new Error('linearProbe: asset.localUri missing after download');
  }
  return asset.localUri;
}

function parseWeights(buffer: ArrayBuffer): ProbeWeights {
  const view = new DataView(buffer);
  const magic = String.fromCharCode(
    view.getUint8(0),
    view.getUint8(1),
    view.getUint8(2),
    view.getUint8(3)
  );
  if (magic !== 'SPLP') {
    throw new Error(`linearProbe: bad magic ${magic} (expected SPLP)`);
  }
  const version = view.getUint32(4, true);
  if (version !== 1) {
    throw new Error(`linearProbe: unsupported version ${version}`);
  }
  const inputDim = view.getUint32(8, true);
  const hiddenDim = view.getUint32(12, true);
  const outputDim = view.getUint32(16, true);
  const numArrays = view.getUint32(20, true);
  if (numArrays !== 4) {
    throw new Error(`linearProbe: expected 4 arrays, got ${numArrays}`);
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

  const layer1Weight = readArray();
  const layer1Bias = readArray();
  const layer2Weight = readArray();
  const layer2Bias = readArray();

  if (layer1Weight.length !== hiddenDim * inputDim) {
    throw new Error('linearProbe: layer1.weight size mismatch');
  }
  if (layer2Weight.length !== outputDim * hiddenDim) {
    throw new Error('linearProbe: layer2.weight size mismatch');
  }

  return {
    inputDim,
    hiddenDim,
    outputDim,
    layer1Weight,
    layer1Bias,
    layer2Weight,
    layer2Bias,
  };
}

async function loadWeights(): Promise<ProbeWeights> {
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

function dot(a: number[] | Float32Array, b: Float32Array, bOffset: number, bLen: number): number {
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

function l2Normalize(x: Float32Array): number[] {
  let norm = 0;
  for (let i = 0; i < x.length; i++) norm += x[i] * x[i];
  norm = Math.sqrt(norm) || 1;
  const out = new Array<number>(x.length);
  for (let i = 0; i < x.length; i++) out[i] = x[i] / norm;
  return out;
}

export async function applyLinearProbe(
  embedding: number[] | Float32Array
): Promise<number[]> {
  const w = await loadWeights();
  if (embedding.length !== w.inputDim) {
    throw new Error(
      `linearProbe: input length ${embedding.length} ≠ expected ${w.inputDim}`
    );
  }
  let h = denseForward(
    embedding,
    w.layer1Weight,
    w.layer1Bias,
    w.hiddenDim,
    w.inputDim
  );
  h = relu(h);
  const out = denseForward(
    h,
    w.layer2Weight,
    w.layer2Bias,
    w.outputDim,
    w.hiddenDim
  );
  return l2Normalize(out);
}

export async function ensureLinearProbeLoaded(): Promise<void> {
  await loadWeights();
}

export async function getLinearProbeInfo(): Promise<{
  inputDim: number;
  outputDim: number;
}> {
  const w = await loadWeights();
  return {
    inputDim: w.inputDim,
    outputDim: w.outputDim,
  };
}
