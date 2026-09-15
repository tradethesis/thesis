#!/usr/bin/env python3
"""Cut the site's icons from the brand mark.

Source is the full-resolution original at output/brand-20260914/ (1024 px) rather
than the 400 px copy in public/, so every size is a downscale and nothing is ever
resampled upward.

The only per-size decision is framing. The avatar's own margin is generous, which
is right at 180 px and leaves the T too small to read in a browser tab, so the
small sizes crop in on the measured bounding box of the mark. Lanczos throughout.
"""

import pathlib

from PIL import Image

SOURCE = "output/brand-20260914/tradethesis-profile-original.png"
FALLBACK = "public/brand/profile-400.png"

SMALL = (16, 32, 48, 64)        # browser tab, bookmark bar, Windows shortcut
SMALL_FILL = 0.76               # how much of the frame the mark occupies
LARGE = {180: "apple-touch-icon.png", 192: "icon-192.png", 512: "icon-512.png"}


def mark_bbox(img: Image.Image) -> tuple[int, int, int, int]:
    """Bounding box of the ivory mark against the vermilion field.

    Measured rather than hardcoded, so regenerating the avatar does not silently
    shift the crop.
    """
    rgb = img.convert("RGB")
    w, h = rgb.size
    px = rgb.load()
    bg = px[2, 2]
    step = max(1, w // 400)
    xs, ys = [], []
    for y in range(0, h, step):
        for x in range(0, w, step):
            if sum(abs(a - b) for a, b in zip(px[x, y], bg)) > 90:
                xs.append(x)
                ys.append(y)
    if not xs:
        raise SystemExit(f"no mark found against background {bg}")
    return min(xs), min(ys), max(xs), max(ys)


def cropped(img: Image.Image, fill: float) -> Image.Image:
    """Square crop centred on the mark, with the mark filling `fill` of the frame."""
    x0, y0, x1, y1 = mark_bbox(img)
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    half = max(x1 - x0, y1 - y0) / 2 / fill
    # Never crop past the edge of the source: clamp, keeping the box square.
    half = min(half, cx, cy, img.width - cx, img.height - cy)
    return img.crop((round(cx - half), round(cy - half), round(cx + half), round(cy + half)))


def main() -> None:
    root = pathlib.Path(__file__).resolve().parent.parent
    pub, app = root / "public", root / "src" / "app"

    path = root / SOURCE
    if not path.exists():
        path = root / FALLBACK
        print(f"  note: {SOURCE} missing, falling back to the 400 px copy")
    src = Image.open(path).convert("RGBA")

    tight = cropped(src, SMALL_FILL)
    ico = app / "favicon.ico"
    tight.resize((64, 64), Image.LANCZOS).save(ico, sizes=[(s, s) for s in SMALL])

    for size, name in LARGE.items():
        out = src.resize((size, size), Image.LANCZOS)
        if name == "apple-touch-icon.png":
            out = out.convert("RGB")     # iOS ignores alpha and composites on black
        # Two flat colours and their antialiased edge: a 64-entry palette is
        # indistinguishable from truecolour here and about a tenth the bytes.
        method = Image.FASTOCTREE if out.mode == "RGBA" else Image.MEDIANCUT
        out = out.quantize(colors=64, method=method, dither=Image.NONE)
        out.save(pub / name, optimize=True)

    for p in [ico] + [pub / n for n in LARGE.values()]:
        print(f"  {p.name:24} {p.stat().st_size:>7,} B")


if __name__ == "__main__":
    main()
