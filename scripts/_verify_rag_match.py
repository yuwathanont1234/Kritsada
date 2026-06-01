"""READ-ONLY: prove newly-indexed brands actually retrieve via match_watches.
Embed a sample /official image of each test brand, query the live match_watches
RPC (same path the app uses), and report the top hit + how many of the top-10
share the brand (brand agreement = what the app's RAG validation keys on)."""
import os, sys, time, base64, io
from pathlib import Path
import httpx
try:
    from dotenv import load_dotenv; load_dotenv(Path(__file__).resolve().parents[1] / ".env")
except ImportError: pass
from PIL import Image

OFF = Path("/Users/kritsada/Desktop/Luxury Watch/official")
URL = os.environ.get("EXPO_PUBLIC_SUPABASE_URL")
ANON = os.environ.get("EXPO_PUBLIC_SUPABASE_ANON_KEY")

# brand display (= DB brand) -> /official folder
TESTS = {
    "IWC": "IWC", "Tissot": "Tissot", "NOMOS Glashütte": "Nomos",
    "Breguet": "Breguet", "Hermès": "Hermes", "Vacheron Constantin": "Vacheron_Constantin",
}

def first_img(folder):
    for p in sorted((OFF / folder).rglob("*")):
        if p.suffix.lower() in {".jpg", ".jpeg", ".png", ".webp"}:
            return p
    return None

def load_bytes(p):
    raw = p.read_bytes(); ext = p.suffix.lower()
    if len(raw) > 2_000_000 or ext in {".avif", ".heic"}:
        im = Image.open(io.BytesIO(raw)).convert("RGB")
        w, h = im.size; ls = max(w, h)
        if ls > 1024: im = im.resize((int(w * 1024 / ls), int(h * 1024 / ls)))
        buf = io.BytesIO(); im.save(buf, "JPEG", quality=88); return buf.getvalue(), "image/jpeg"
    ct = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp"}.get(ext, "image/jpeg")
    return raw, ct

def embed(p, dev):
    raw, ct = load_bytes(p)
    durl = f"data:{ct};base64," + base64.b64encode(raw).decode()
    for a in range(1, 6):
        r = httpx.post(URL + "/functions/v1/embed-image",
                       headers={"Authorization": "Bearer " + ANON, "apikey": ANON, "Content-Type": "application/json"},
                       json={"image": durl, "deviceId": dev}, timeout=120)
        if r.status_code == 200: return r.json()["embedding"]
        if r.status_code == 429 or 500 <= r.status_code < 600: time.sleep(8); continue
        raise RuntimeError(f"HTTP {r.status_code}: {r.text[:100]}")
    raise RuntimeError("embed failed after retries")

def match(emb):
    r = httpx.post(URL + "/rest/v1/rpc/match_watches",
                   headers={"Authorization": "Bearer " + ANON, "apikey": ANON, "Content-Type": "application/json"},
                   json={"query_embedding": emb, "match_count": 10, "max_distance": 1.0}, timeout=30)
    r.raise_for_status(); return r.json()

print(f"{'':2} {'brand':22} {'top hit':22} {'sim':>6}  same/10")
print("-" * 64)
for brand, folder in TESTS.items():
    img = first_img(folder)
    if not img:
        print(f"❌ {brand:22} (no image on disk)"); continue
    try:
        rows = match(embed(img, f"verify-{folder.lower()}"))
        top = rows[0] if rows else {}
        sim = 1 - float(top.get("distance", 1))
        same = sum(1 for r in rows if r.get("brand", "").lower() == brand.lower())
        mark = "✅" if same >= 6 else ("⚠️" if same >= 3 else "❌")
        print(f"{mark} {brand:22} {top.get('brand', '?')[:22]:22} {sim:6.3f}  {same}/10")
    except Exception as e:
        print(f"❌ {brand:22} {str(e)[:38]}")
