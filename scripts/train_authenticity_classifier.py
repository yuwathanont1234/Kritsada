"""
Train the watch real-vs-fake authenticity classifier (A1).

A tiny binary head over DINOv3 1024-d:
    Linear(1024 -> 128) -> ReLU -> Dropout(0.2) -> Linear(128 -> 1) -> Sigmoid
Mirrors songphra's authenticity classifier (val AUC 0.967 on amulets). The head
trains in seconds — the cost is EMBEDDING images, done upstream.

INPUT  : data/auth-train/features.jsonl   (one JSON per line)
           {"embedding": [..1024 floats..], "label": 0|1}   (1 = real, 0 = fake)
OUTPUT : src/lib/data/authenticity-classifier-weights.bin   (SPAC binary)
         src/lib/data/authenticity-classifier-weights.json  (human-readable + notes)
         (overwrites the amulet placeholder — back it up first if you care)

Run:
    python scripts/train_authenticity_classifier.py \
        --features data/auth-train/features.jsonl \
        --epochs 200 --hidden 128

The .bin is read verbatim by the ported authenticityClassifier.ts (SPAC v1):
    magic 'SPAC' | u32 version=1 | u32 inputDim | u32 hiddenDim | u32 outputDim |
    u32 numArrays=4 | 8 reserved bytes | then 4 arrays, each:
    u32 rows | u32 cols | rows*cols float32 (LE, row-major)
    order: fc1.weight[h,in], fc1.bias[h], fc2.weight[out,h], fc2.bias[out]
"""
import argparse, json, struct, os
import numpy as np

try:
    import torch
    import torch.nn as nn
except ImportError:
    raise SystemExit("pip install torch numpy  (run in the project venv)")


def load_features(path):
    X, y = [], []
    with open(path) as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            o = json.loads(line)
            emb = o["embedding"]
            if len(emb) != 1024:
                continue
            X.append(emb)
            y.append(int(o["label"]))
    X = np.asarray(X, dtype=np.float32)
    # L2-normalize (DINOv3 embeddings are used normalized everywhere in the app)
    X /= (np.linalg.norm(X, axis=1, keepdims=True) + 1e-8)
    return X, np.asarray(y, dtype=np.float32)


class Head(nn.Module):
    def __init__(self, in_dim=1024, hidden=128, p=0.2):
        super().__init__()
        self.fc1 = nn.Linear(in_dim, hidden)
        self.fc2 = nn.Linear(hidden, 1)
        self.drop = nn.Dropout(p)

    def forward(self, x):
        return self.fc2(self.drop(torch.relu(self.fc1(x)))).squeeze(-1)


def auc(scores, labels):
    # rank-based AUC, no sklearn dependency
    order = np.argsort(scores)
    ranks = np.empty_like(order, dtype=np.float64)
    ranks[order] = np.arange(1, len(scores) + 1)
    n_pos = labels.sum()
    n_neg = len(labels) - n_pos
    if n_pos == 0 or n_neg == 0:
        return float("nan")
    return (ranks[labels == 1].sum() - n_pos * (n_pos + 1) / 2) / (n_pos * n_neg)


def fp_table(scores, labels):
    rows = []
    for t in [0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]:
        pred = scores >= t
        real_tp = float((pred[labels == 1]).mean()) if (labels == 1).any() else 0.0
        fake_fp = float((pred[labels == 0]).mean()) if (labels == 0).any() else 0.0
        rows.append({"threshold": t, "fake_fp": fake_fp, "real_tp": real_tp})
    return rows


def write_spac(path, model, in_dim, hidden):
    sd = model.state_dict()
    arrays = [
        sd["fc1.weight"].cpu().numpy().astype(np.float32),  # [hidden, in]
        sd["fc1.bias"].cpu().numpy().astype(np.float32).reshape(-1, 1),   # [hidden,1]
        sd["fc2.weight"].cpu().numpy().astype(np.float32),  # [1, hidden]
        sd["fc2.bias"].cpu().numpy().astype(np.float32).reshape(-1, 1),   # [1,1]
    ]
    with open(path, "wb") as f:
        f.write(b"SPAC")
        f.write(struct.pack("<IIIII", 1, in_dim, hidden, 1, 4))  # version, dims, numArrays
        f.write(b"\x00" * 8)  # reserved → arrays start at offset 32
        for a in arrays:
            rows, cols = a.shape
            f.write(struct.pack("<II", rows, cols))
            f.write(a.tobytes(order="C"))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--features", default="data/auth-train/features.jsonl")
    ap.add_argument("--out-bin", default="src/lib/data/authenticity-classifier-weights.bin")
    ap.add_argument("--out-json", default="src/lib/data/authenticity-classifier-weights.json")
    ap.add_argument("--epochs", type=int, default=200)
    ap.add_argument("--hidden", type=int, default=128)
    ap.add_argument("--lr", type=float, default=1e-3)
    ap.add_argument("--val-frac", type=float, default=0.15)
    ap.add_argument("--seed", type=int, default=42)
    args = ap.parse_args()

    X, y = load_features(args.features)
    print(f"loaded {len(y)} samples  real={int(y.sum())}  fake={int((y==0).sum())}")
    if (y == 0).sum() < 30 or (y == 1).sum() < 30:
        print("WARNING: very few samples in a class — results will be noisy. Collect more fakes.")

    rng = np.random.default_rng(args.seed)
    idx = rng.permutation(len(y))
    n_val = max(1, int(len(y) * args.val_frac))
    val_idx, tr_idx = idx[:n_val], idx[n_val:]
    Xtr, ytr = torch.tensor(X[tr_idx]), torch.tensor(y[tr_idx])
    Xva, yva = torch.tensor(X[val_idx]), torch.tensor(y[val_idx])

    model = Head(1024, args.hidden)
    # class weight: fakes are rarer → up-weight the positive-for-fake term
    n_real = float((ytr == 1).sum()); n_fake = float((ytr == 0).sum())
    # BCEWithLogitsLoss pos_weight multiplies the POSITIVE (real) term. To balance
    # classes use n_neg/n_pos (down-weights whichever class is the majority).
    pos_weight = torch.tensor([n_fake / max(1.0, n_real)])
    loss_fn = nn.BCEWithLogitsLoss(pos_weight=pos_weight)
    opt = torch.optim.Adam(model.parameters(), lr=args.lr, weight_decay=1e-4)

    best_auc, best_state = -1.0, None
    for ep in range(args.epochs):
        model.train()
        opt.zero_grad()
        loss = loss_fn(model(Xtr), ytr)
        loss.backward(); opt.step()
        model.eval()
        with torch.no_grad():
            va = torch.sigmoid(model(Xva)).numpy()
        a = auc(va, y[val_idx])
        if a > best_auc:
            best_auc, best_state = a, {k: v.clone() for k, v in model.state_dict().items()}
        if ep % 25 == 0 or ep == args.epochs - 1:
            print(f"  epoch {ep:4d}  loss={loss.item():.4f}  val_auc={a:.4f}")

    model.load_state_dict(best_state)
    model.eval()
    with torch.no_grad():
        va = torch.sigmoid(model(Xva)).numpy()
    table = fp_table(va, y[val_idx])
    print(f"\nBEST val AUC = {best_auc:.4f}")
    for r in table:
        print(f"  thr {r['threshold']:.1f}: catches {1-r['fake_fp']:.0%} of fakes, passes {r['real_tp']:.0%} of reals")

    os.makedirs(os.path.dirname(args.out_bin), exist_ok=True)
    write_spac(args.out_bin, model, 1024, args.hidden)
    sd = model.state_dict()
    meta = {
        "input_dim": 1024, "hidden_dim": args.hidden, "output_dim": 1,
        "fc1": {"weight": sd["fc1.weight"].tolist(), "bias": sd["fc1.bias"].tolist()},
        "fc2": {"weight": sd["fc2.weight"].tolist(), "bias": sd["fc2.bias"].tolist()},
        "notes": {
            "domain": "watches", "best_val_auc": best_auc,
            "real_n_total": int((y == 1).sum()), "fake_n_total": int((y == 0).sum()),
            "fp_table": table,
        },
    }
    with open(args.out_json, "w") as f:
        json.dump(meta, f)
    print(f"\nwrote {args.out_bin} + {args.out_json}  (overwrote the amulet placeholder)")


if __name__ == "__main__":
    main()
