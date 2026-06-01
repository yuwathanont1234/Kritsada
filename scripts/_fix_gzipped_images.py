"""One-off: fix gzip-wrapped images in the /official dataset.

The `pendulum` scraper saved HTTP responses that still had Content-Encoding:
gzip applied — so the .webp/.jpg files on disk are gzip streams whose payload
is the real image. The embed pipeline can't read them (UnidentifiedImageError).

Fix: for every image file that starts with the gzip magic (1f 8b), gunzip it,
verify the OUTPUT is a real image by magic bytes, then atomically replace the
original. Lossless and safe — only replaces when the decompressed bytes are a
valid WEBP/JPEG/PNG/AVIF. Run again any time; already-fixed files are skipped.
"""
from __future__ import annotations
import gzip
import sys
from pathlib import Path

ROOT = Path("/Users/kritsada/Desktop/Luxury Watch/official")
EXTS = {".webp", ".jpg", ".jpeg", ".png", ".avif"}


def is_image(b: bytes) -> bool:
    return (
        (b[:4] == b"RIFF" and b[8:12] == b"WEBP")     # WEBP
        or b[:3] == b"\xff\xd8\xff"                     # JPEG
        or b[:8] == b"\x89PNG\r\n\x1a\n"               # PNG
        or b[4:12] in (b"ftypavif", b"ftypmif1", b"ftypheic")  # AVIF/HEIC
    )


def main() -> None:
    only = sys.argv[1:]  # optional list of brand folders to limit to
    roots = [ROOT / b for b in only] if only else [ROOT]
    fixed = skipped = failed = 0
    bad: list[str] = []
    for root in roots:
        if not root.exists():
            continue
        for f in root.rglob("*"):
            if not f.is_file() or f.suffix.lower() not in EXTS:
                continue
            try:
                with open(f, "rb") as fh:
                    if fh.read(2) != b"\x1f\x8b":   # not gzip → leave alone
                        skipped += 1
                        continue
                raw = gzip.decompress(f.read_bytes())
                if not is_image(raw):
                    failed += 1
                    bad.append(f"{f.name}: gunzip OK but not an image")
                    continue
                tmp = f.with_suffix(f.suffix + ".ungz.tmp")
                tmp.write_bytes(raw)
                tmp.replace(f)               # atomic
                fixed += 1
            except Exception as exc:  # noqa: BLE001
                failed += 1
                bad.append(f"{f.name}: {exc}")
    print(f"\nfixed={fixed}  skipped(not-gzip)={skipped}  failed={failed}")
    if bad:
        print("problems (first 15):")
        for line in bad[:15]:
            print("  " + line)


if __name__ == "__main__":
    main()
