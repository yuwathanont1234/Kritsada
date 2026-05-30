"""
Embed a folder of watch images → DINOv3 1024-d features.jsonl  (A1, step 2).

Walks an image folder, sends each image to the deployed `embed-image` edge
(same DINOv3 the app uses → RAW 1024-d), and appends one line per image to a
features manifest that train_authenticity_classifier.py consumes.

Layout (mirror songphra's data/fake-test/):
    data/auth-train/fake/*.jpg     ← counterfeits you collected (label 0)
    data/auth-train/real/*.jpg     ← authentic (sample of the catalog, label 1)

Run (once per class):
    python scripts/embed_folder.py --dir data/auth-train/fake --label 0
    python scripts/embed_folder.py --dir data/auth-train/real --label 1
    # both append to data/auth-train/features.jsonl

Reads EXPO_PUBLIC_SUPABASE_URL + EXPO_PUBLIC_SUPABASE_ANON_KEY from .env.

NOTE on the edge quota: embed-image now enforces ~400 calls/device/day
(migration 0008). This script sends a fixed deviceId; if you embed >400 images
in a day, bump EDGE_DEVICE_DAILY_CAP temporarily (supabase secrets set ...) or
split the run across days. ~300 fakes + ~700 reals fits in two runs.
"""
import argparse, base64, json, os, sys, time, urllib.request, io

try:
    from PIL import Image
except ImportError:
    raise SystemExit("pip install pillow")


def load_env():
    url = key = None
    try:
        for line in open(".env"):
            line = line.strip()
            if line.startswith("EXPO_PUBLIC_SUPABASE_URL="):
                url = line.split("=", 1)[1]
            elif line.startswith("EXPO_PUBLIC_SUPABASE_ANON_KEY="):
                key = line.split("=", 1)[1]
    except FileNotFoundError:
        pass
    if not url or not key:
        raise SystemExit("Missing EXPO_PUBLIC_SUPABASE_URL / _ANON_KEY in .env")
    return url, key


def to_data_url(path, max_w=384):
    im = Image.open(path).convert("RGB")
    if im.width > max_w:
        im = im.resize((max_w, int(im.height * max_w / im.width)))
    buf = io.BytesIO()
    im.save(buf, format="JPEG", quality=85)
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()


def embed(url, key, data_url, device_id):
    body = json.dumps({"image": data_url, "deviceId": device_id}).encode()
    req = urllib.request.Request(
        url + "/functions/v1/embed-image", data=body,
        headers={"Authorization": "Bearer " + key, "apikey": key,
                 "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=90) as r:
        out = json.loads(r.read().decode())
    emb = out.get("embedding")
    if not isinstance(emb, list) or len(emb) != 1024:
        raise ValueError(f"unexpected embedding (len={len(emb) if isinstance(emb,list) else emb})")
    return emb


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", required=True, help="folder of images to embed")
    ap.add_argument("--label", type=int, required=True, help="1=real, 0=fake")
    ap.add_argument("--out", default="data/auth-train/features.jsonl")
    ap.add_argument("--device-id", default="auth-train-embed-script")
    args = ap.parse_args()

    url, key = load_env()
    exts = (".jpg", ".jpeg", ".png", ".webp")
    files = [os.path.join(args.dir, f) for f in sorted(os.listdir(args.dir))
             if f.lower().endswith(exts)]
    if not files:
        raise SystemExit(f"no images in {args.dir}")
    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    print(f"embedding {len(files)} images (label={args.label}) → {args.out}")

    ok = fail = 0
    with open(args.out, "a") as fout:
        for i, path in enumerate(files):
            try:
                emb = embed(url, key, to_data_url(path), args.device_id)
                fout.write(json.dumps({"embedding": emb, "label": args.label}) + "\n")
                fout.flush()
                ok += 1
            except Exception as e:
                fail += 1
                print(f"  [{i+1}/{len(files)}] FAIL {os.path.basename(path)}: {str(e)[:120]}", file=sys.stderr)
                if "429" in str(e):
                    print("  → hit the device daily cap. Bump EDGE_DEVICE_DAILY_CAP or resume tomorrow.", file=sys.stderr)
                    break
            if (i + 1) % 20 == 0:
                print(f"  {i+1}/{len(files)}  ok={ok} fail={fail}")
            time.sleep(0.15)  # gentle on Replicate
    print(f"done: {ok} embedded, {fail} failed → {args.out}")


if __name__ == "__main__":
    main()
