"""Convert a trained MLP probe (.npz with W1/b1/W2/b2) to the SPLP binary
format the mobile app expects (src/lib/data/linear-probe-weights.bin).

The SPLP format is defined in src/lib/linearProbe.ts parseWeights():

  bytes  0-3   "SPLP" magic
  4-7    version (uint32 LE) = 1
  8-11   inputDim (uint32 LE)
  12-15  hiddenDim (uint32 LE)
  16-19  outputDim (uint32 LE)
  20-23  numArrays (uint32 LE) = 4
  24-31  padding (zeroed)
  32+    4 weight arrays, each prefixed with (rows, cols) as uint32 LE

  Array order: layer1Weight (W1), layer1Bias (b1), layer2Weight (W2), layer2Bias (b2)

Usage:
  python scripts/npz_to_splp.py \
    --in  scripts/output/probe_v4_weights.npz \
    --out src/lib/data/linear-probe-weights.bin
"""
from __future__ import annotations
import argparse
import struct
import sys
from pathlib import Path

import numpy as np


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--in", dest="in_path", type=Path, required=True)
    ap.add_argument("--out", dest="out_path", type=Path, required=True)
    args = ap.parse_args()

    d = np.load(args.in_path, allow_pickle=True)
    keys = list(d.files)
    print(f"Input file keys: {keys}")

    # Expect MLP architecture with W1, b1, W2, b2
    required = {"W1", "b1", "W2", "b2"}
    if not required.issubset(keys):
        sys.exit(f"Missing required keys. Found {keys}, need {required}")

    W1 = np.ascontiguousarray(d["W1"], dtype=np.float32)
    b1 = np.ascontiguousarray(d["b1"], dtype=np.float32).reshape(1, -1)
    W2 = np.ascontiguousarray(d["W2"], dtype=np.float32)
    b2 = np.ascontiguousarray(d["b2"], dtype=np.float32).reshape(1, -1)

    # W1 shape is (hidden, input), b1 is (1, hidden)
    hidden_dim, input_dim = W1.shape
    output_dim_a, _hidden_check = W2.shape
    output_dim = output_dim_a

    if W2.shape[1] != hidden_dim:
        sys.exit(f"W2.cols ({W2.shape[1]}) != hidden_dim ({hidden_dim})")
    if b1.shape[1] != hidden_dim:
        sys.exit(f"b1.cols ({b1.shape[1]}) != hidden_dim ({hidden_dim})")
    if b2.shape[1] != output_dim:
        sys.exit(f"b2.cols ({b2.shape[1]}) != output_dim ({output_dim})")

    print(f"inputDim:  {input_dim}")
    print(f"hiddenDim: {hidden_dim}")
    print(f"outputDim: {output_dim}")
    print(f"W1 shape: {W1.shape}, b1 shape: {b1.shape}")
    print(f"W2 shape: {W2.shape}, b2 shape: {b2.shape}")

    # Sanity: check that the projected output is finite
    rng = np.random.default_rng(42)
    x = rng.standard_normal(input_dim).astype(np.float32)
    # GELU activation matching mobile (approximate)
    z1 = x @ W1.T + b1[0]
    h = 0.5 * z1 * (1 + np.tanh(np.sqrt(2 / np.pi) * (z1 + 0.044715 * z1**3)))
    y = h @ W2.T + b2[0]
    norm = np.linalg.norm(y)
    print(f"Test projection norm: {norm:.4f}  (any NaN: {np.isnan(y).any()}, any Inf: {np.isinf(y).any()})")
    if np.isnan(y).any() or np.isinf(y).any():
        sys.exit("Test projection has NaN/Inf — refusing to write bad weights")

    # Build the SPLP binary
    buf = bytearray()
    # Header
    buf.extend(b"SPLP")
    buf.extend(struct.pack("<I", 1))           # version
    buf.extend(struct.pack("<I", input_dim))
    buf.extend(struct.pack("<I", hidden_dim))
    buf.extend(struct.pack("<I", output_dim))
    buf.extend(struct.pack("<I", 4))           # numArrays
    buf.extend(b"\x00" * 8)                    # padding to 32 bytes

    # Each array: (rows, cols) u32 LE + float32 data
    for name, arr in [("W1", W1), ("b1", b1), ("W2", W2), ("b2", b2)]:
        rows, cols = arr.shape
        buf.extend(struct.pack("<I", rows))
        buf.extend(struct.pack("<I", cols))
        buf.extend(arr.tobytes(order="C"))
        print(f"  wrote {name}: rows={rows} cols={cols} bytes={rows*cols*4}")

    args.out_path.write_bytes(buf)
    print(f"\n✅ Wrote {len(buf):,} bytes to {args.out_path}")


if __name__ == "__main__":
    main()
