"""Train a DINOv3 probe (1024 -> 256) from dumped features.

Two architectures:
  linear : single Linear(1024, 256)
  mlp    : Linear(1024, 512) -> GELU -> Linear(512, 256)

Two losses:
  ce     : NormFace / cosine softmax (W classifier head, normalised)
  supcon : Supervised Contrastive (Khosla et al. 2020)

Saves to app/weights/linear_probe.npz with format auto-detected by
app/projection.py:
    linear: { W (256,1024), b (256,) }
    mlp:    { W1 (512,1024), b1 (512,), W2 (256,512), b2 (256,) }

Usage examples:
    # Original recipe (linear + ce):
    python scripts/train_probe.py
    # MLP + SupCon (more capacity, retrieval-tuned loss):
    python scripts/train_probe.py --arch mlp --loss supcon --epochs 100
"""
from __future__ import annotations

import argparse
import json
import logging
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import numpy as np

log = logging.getLogger("train_probe")


def _stratified_split(labels: np.ndarray, val_frac: float, seed: int) -> tuple[np.ndarray, np.ndarray]:
    """Per-class 80/20. Classes with 1 sample go entirely to train."""
    rng = np.random.default_rng(seed)
    train_idx, val_idx = [], []
    for cls in np.unique(labels):
        idx = np.where(labels == cls)[0]
        rng.shuffle(idx)
        if len(idx) < 2:
            train_idx.extend(idx)
            continue
        n_val = max(1, int(round(len(idx) * val_frac)))
        val_idx.extend(idx[:n_val])
        train_idx.extend(idx[n_val:])
    return np.array(sorted(train_idx)), np.array(sorted(val_idx))


# --------------------------------------------------------------------------
# Models
# --------------------------------------------------------------------------
def build_probe(arch: str, hidden: int):
    import torch.nn as nn
    if arch == "linear":
        return nn.Linear(1024, 256, bias=True)
    if arch == "mlp":
        return nn.Sequential(
            nn.Linear(1024, hidden, bias=True),
            nn.GELU(),
            nn.Linear(hidden, 256, bias=True),
        )
    raise ValueError(f"unknown arch: {arch}")


def probe_to_npz(probe, arch: str):
    """Extract weight matrices in a format projection.py can load."""
    if arch == "linear":
        return {
            "W": probe.weight.detach().cpu().numpy().astype(np.float32),
            "b": probe.bias.detach().cpu().numpy().astype(np.float32),
        }
    # mlp
    w1, b1 = probe[0].weight, probe[0].bias
    w2, b2 = probe[2].weight, probe[2].bias
    return {
        "W1": w1.detach().cpu().numpy().astype(np.float32),
        "b1": b1.detach().cpu().numpy().astype(np.float32),
        "W2": w2.detach().cpu().numpy().astype(np.float32),
        "b2": b2.detach().cpu().numpy().astype(np.float32),
    }


# --------------------------------------------------------------------------
# Losses
# --------------------------------------------------------------------------
def supcon_loss(z, y, temperature: float):
    """Supervised contrastive loss (Khosla 2020) — numerically stable variant.

    z: (B, D) L2-normalised features.
    y: (B,)   integer labels.
    """
    import torch
    B = z.shape[0]
    device = z.device

    sims = z @ z.T / temperature                                # (B, B)
    # Subtract per-row max for numerical stability (logsumexp trick).
    sims_max, _ = sims.max(dim=1, keepdim=True)
    sims = sims - sims_max.detach()

    # Self-mask (excludes diagonal from both numerator and denominator).
    self_mask = torch.eye(B, dtype=torch.bool, device=device)
    pos_mask = (y[:, None] == y[None, :]) & ~self_mask           # (B, B)
    # Anchors that have at least one positive in the batch.
    valid = pos_mask.any(dim=1)
    if valid.sum() == 0:
        return torch.zeros((), device=device, requires_grad=True)

    # logits exp, excluding self in the denominator
    exp_sims = torch.exp(sims) * (~self_mask).float()
    denom = exp_sims.sum(dim=1, keepdim=True).clamp_min(1e-12)
    log_prob = sims - torch.log(denom)

    pos_counts = pos_mask.sum(dim=1).clamp_min(1).float()
    mean_log_prob_pos = (log_prob * pos_mask.float()).sum(dim=1) / pos_counts
    return -mean_log_prob_pos[valid].mean()


# --------------------------------------------------------------------------
# Training
# --------------------------------------------------------------------------
def train(args) -> None:
    import torch
    from torch import nn

    z = np.load(args.features, allow_pickle=True)
    X = z["X"].astype(np.float32)
    labels = z["labels"].astype(np.int64)
    classes = z["classes"]
    log.info("loaded X=%s  classes=%d", X.shape, len(classes))

    counts = Counter(labels.tolist())
    keep = {c for c, n in counts.items() if n >= args.min_samples_per_class}
    mask = np.array([int(l) in keep for l in labels])
    log.info("keeping %d/%d rows after min_samples=%d", mask.sum(), len(X), args.min_samples_per_class)
    X = X[mask]
    labels = labels[mask]
    unique_old = np.array(sorted(set(labels.tolist())))
    remap = {old: new for new, old in enumerate(unique_old.tolist())}
    labels = np.array([remap[int(l)] for l in labels], dtype=np.int64)
    classes = classes[unique_old]
    num_classes = len(classes)
    log.info("training on %d classes, %d samples", num_classes, len(X))

    X_t = torch.from_numpy(X)
    X_t = nn.functional.normalize(X_t, dim=-1)

    train_idx, val_idx = _stratified_split(labels, val_frac=0.2, seed=args.seed)
    log.info("split: train=%d  val=%d", len(train_idx), len(val_idx))

    X_train = X_t[train_idx]
    y_train = torch.from_numpy(labels[train_idx])
    X_val = X_t[val_idx]
    y_val = torch.from_numpy(labels[val_idx])

    # Sampling strategy depends on loss:
    #  - ce     : WeightedRandomSampler so big classes don't dominate
    #  - supcon : class-aware sampler — each batch picks N classes x K samples
    #             so every anchor has positive pairs in the batch
    train_counts = Counter(labels[train_idx].tolist())
    train_ds = torch.utils.data.TensorDataset(X_train, y_train)
    if args.loss == "supcon":
        class_to_indices: dict[int, list[int]] = {}
        for i, l in enumerate(labels[train_idx]):
            class_to_indices.setdefault(int(l), []).append(i)
        eligible_classes = [c for c, idxs in class_to_indices.items() if len(idxs) >= 2]
        K = max(2, args.supcon_k)  # samples per class per batch
        N = max(2, args.batch_size // K)  # classes per batch
        log.info("supcon batch sampler: N classes x K samples per class = %d x %d = %d",
                 N, K, N * K)
        steps_per_epoch = max(1, len(X_train) // (N * K))
        def batch_iter():
            rng = np.random.default_rng(args.seed)
            for _ in range(steps_per_epoch):
                cls_pick = rng.choice(eligible_classes, size=N, replace=False)
                batch_idx = []
                for c in cls_pick:
                    pool = class_to_indices[int(c)]
                    pick = rng.choice(pool, size=K, replace=len(pool) < K)
                    batch_idx.extend(pick.tolist())
                xb = X_train[batch_idx]
                yb = y_train[batch_idx]
                yield xb, yb
        loader = batch_iter
    else:
        sample_weights = torch.tensor(
            [1.0 / train_counts[int(l)] for l in labels[train_idx]],
            dtype=torch.double,
        )
        sampler = torch.utils.data.WeightedRandomSampler(
            sample_weights, num_samples=len(sample_weights), replacement=True
        )
        loader = torch.utils.data.DataLoader(train_ds, batch_size=args.batch_size, sampler=sampler)

    torch.manual_seed(args.seed)
    probe = build_probe(args.arch, args.hidden)
    head = nn.Linear(256, num_classes, bias=False) if args.loss == "ce" else None

    # Brand head (auxiliary): maps each (brand,ref) class id to its brand id.
    brand_strs = np.array([c.split("|", 1)[0] for c in classes])
    brand_uniq, class_to_brand_id = np.unique(brand_strs, return_inverse=True)
    num_brands = len(brand_uniq)
    class_to_brand_id_t = torch.from_numpy(class_to_brand_id.astype(np.int64))
    brand_head = (
        nn.Linear(256, num_brands, bias=False)
        if args.brand_weight > 0 else None
    )
    if brand_head is not None:
        log.info("brand head: %d brands, weight=%.2f", num_brands, args.brand_weight)
        nn.init.normal_(brand_head.weight, std=0.02)

    # Init
    for m in probe.modules():
        if isinstance(m, nn.Linear):
            nn.init.normal_(m.weight, std=0.02)
            if m.bias is not None:
                nn.init.zeros_(m.bias)
    if head is not None:
        nn.init.normal_(head.weight, std=0.02)

    params = list(probe.parameters())
    if head is not None:
        params += list(head.parameters())
    if brand_head is not None:
        params += list(brand_head.parameters())
    opt = torch.optim.AdamW(params, lr=args.lr, weight_decay=args.weight_decay)
    sched = torch.optim.lr_scheduler.CosineAnnealingLR(opt, T_max=args.epochs)

    best_val = 0.0
    best_state = None
    for epoch in range(args.epochs):
        probe.train()
        if head is not None:
            head.train()
        total, hit, loss_sum, steps = 0, 0, 0.0, 0
        # supcon: loader is a generator factory; ce: it's an iterable DataLoader
        batches = loader() if args.loss == "supcon" else loader
        for xb, yb in batches:
            z_out = probe(xb)
            z_n = nn.functional.normalize(z_out, dim=-1)

            if args.loss == "ce":
                w = nn.functional.normalize(head.weight, dim=-1)
                logits = (z_n @ w.T) / args.temperature
                loss = nn.functional.cross_entropy(logits, yb)
                with torch.no_grad():
                    hit += (logits.argmax(1) == yb).sum().item()
                    total += yb.numel()
                if brand_head is not None:
                    yb_brand = class_to_brand_id_t[yb]
                    bw = nn.functional.normalize(brand_head.weight, dim=-1)
                    brand_logits = (z_n @ bw.T) / args.temperature
                    loss = loss + args.brand_weight * nn.functional.cross_entropy(brand_logits, yb_brand)
            else:  # supcon
                loss = supcon_loss(z_n, yb, args.temperature)
                # train_acc indicator: top-1 NN within the batch
                with torch.no_grad():
                    if len(yb) > 1:
                        s = z_n @ z_n.T
                        s.fill_diagonal_(-1e9)
                        pred = yb[s.argmax(1)]
                        hit += (pred == yb).sum().item()
                        total += yb.numel()
            opt.zero_grad()
            loss.backward()
            torch.nn.utils.clip_grad_norm_(params, max_norm=5.0)
            opt.step()
            loss_sum += loss.item()
            steps += 1
        sched.step()

        # Validation: retrieval Top-1 over full training set (brand+ref AND brand-only)
        probe.eval()
        with torch.no_grad():
            zv = nn.functional.normalize(probe(X_val), dim=-1)
            zt = nn.functional.normalize(probe(X_train), dim=-1)
            sims = zv @ zt.T
            nn_idx = sims.argmax(1)
            retr_acc = (y_train[nn_idx] == y_val).float().mean().item()
            brand_val = class_to_brand_id_t[y_val]
            brand_pred = class_to_brand_id_t[y_train[nn_idx]]
            brand_acc = (brand_pred == brand_val).float().mean().item()

        log.info(
            "epoch %3d  loss=%.4f  train_acc=%.3f  val_brand=%.3f  val_ref=%.3f",
            epoch + 1, loss_sum / max(steps, 1), hit / max(total, 1), brand_acc, retr_acc,
        )
        if retr_acc > best_val:
            best_val = retr_acc
            best_state = {
                "weights": probe_to_npz(probe, args.arch),
                "val_retrieval_acc": retr_acc,
                "epoch": epoch + 1,
            }

    if best_state is None:
        sys.exit("no best state captured")

    args.out.parent.mkdir(parents=True, exist_ok=True)
    meta = {
        "arch": args.arch,
        "loss": args.loss,
        "val_retrieval_acc": float(best_state["val_retrieval_acc"]),
        "epoch": int(best_state["epoch"]),
        "num_classes": int(num_classes),
        "n_train": int(len(X_train)),
        "n_val": int(len(X_val)),
        "min_samples_per_class": int(args.min_samples_per_class),
        "temperature": float(args.temperature),
        "hidden": int(args.hidden) if args.arch == "mlp" else None,
    }
    np.savez(args.out, meta=np.array(json.dumps(meta)), **best_state["weights"])
    log.info("saved %s  best epoch=%d  val_retrieval=%.3f arch=%s loss=%s",
             args.out, best_state["epoch"], best_state["val_retrieval_acc"], args.arch, args.loss)


def cli() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--features", type=Path,
                        default=Path(__file__).resolve().parent / "output" / "features_v1.npz")
    parser.add_argument("--out", type=Path,
                        default=Path(__file__).resolve().parents[1] / "app" / "weights" / "linear_probe.npz")
    parser.add_argument("--arch", choices=["linear", "mlp"], default="linear")
    parser.add_argument("--hidden", type=int, default=512)
    parser.add_argument("--loss", choices=["ce", "supcon"], default="ce")
    parser.add_argument("--epochs", type=int, default=60)
    parser.add_argument("--batch-size", type=int, default=128)
    parser.add_argument("--lr", type=float, default=1e-2)
    parser.add_argument("--weight-decay", type=float, default=1e-4)
    parser.add_argument("--temperature", type=float, default=0.07)
    parser.add_argument("--min-samples-per-class", type=int, default=3)
    parser.add_argument("--supcon-k", type=int, default=4,
                        help="samples per class per batch (supcon only)")
    parser.add_argument("--brand-weight", type=float, default=0.0,
                        help="auxiliary brand-classification loss weight (0 disables)")
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    train(args)


if __name__ == "__main__":
    cli()
