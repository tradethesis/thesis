#!/usr/bin/env python3
"""Compose the 1200x630 social card.

Built from the same artwork the front door uses, so a link preview and the page it
opens look like the same product. The drape's interest sits lower-right, which is
exactly the half a share card can afford to give away, so the text goes left.

Unlike the page, the card carries the wordmark: a preview in a timeline has no URL
bar next to it and has to say whose it is.

Colours are the site's own, sampled from the rendered page rather than converted from
the oklch source by hand — see scripts/README or the session that added this.
"""

import pathlib

from PIL import Image, ImageDraw, ImageFont

W, H = 1200, 630

INK = (31, 35, 30)
INK_2 = (80, 81, 72)
ACCENT = (244, 66, 22)

ART = "output/waitlist-art/drape.png"
FONT_CANDIDATES = [
    "/Users/limon/Library/Fonts/InterTight-VariableFont_wght.ttf",
    "/System/Library/Fonts/HelveticaNeue.ttc",
    "/System/Library/Fonts/Helvetica.ttc",
]


def load_font(size: int, weight: float) -> ImageFont.FreeTypeFont:
    for path in FONT_CANDIDATES:
        p = pathlib.Path(path)
        if not p.exists():
            continue
        font = ImageFont.truetype(str(p), size)
        try:
            font.set_variation_by_axes([weight])
        except (OSError, AttributeError):
            pass  # static font: whatever weight it ships with
        return font
    raise SystemExit("no usable font found")


def backdrop(root: pathlib.Path) -> Image.Image:
    """The artwork, cropped to the card's aspect from the right edge.

    Anchored right rather than centred: the curl is the subject, and a centre crop of a
    3:2 source into a 1.9:1 card shaves exactly the part worth keeping.
    """
    art = Image.open(root / ART).convert("RGB")
    scale = max(W / art.width, H / art.height)
    art = art.resize((round(art.width * scale), round(art.height * scale)), Image.LANCZOS)
    left = art.width - W          # keep the right edge
    top = (art.height - H) // 2
    return art.crop((left, top, left + W, top + H))


def main() -> None:
    root = pathlib.Path(__file__).resolve().parent.parent
    img = backdrop(root)
    d = ImageDraw.Draw(img)

    x = 84
    wordmark = load_font(30, 640)
    eyebrow = load_font(19, 620)
    headline = load_font(84, 680)
    sub = load_font(24, 450)

    d.text((x, 74), "Thesis", font=wordmark, fill=INK)

    # The block sits high on purpose. The artwork's deckle edge crosses the lower left
    # of the card, and at the obvious vertical centre it runs straight through the
    # second headline line.
    y = 196
    d.text((x, y), "EARLY ACCESS", font=eyebrow, fill=ACCENT)

    # "believe." is set in the accent, the same emphasis the page gives it. It falls on
    # its own line, so the colour change needs no mid-line measuring.
    y += 48
    d.text((x, y), "Buy what you", font=headline, fill=INK)
    y += 92
    d.text((x, y), "believe.", font=headline, fill=ACCENT)

    y += 124
    d.text((x, y), "Turn a belief into a basket of tokenized stocks,", font=sub, fill=INK_2)
    d.text((x, y + 34), "bought with USDC from your own wallet.", font=sub, fill=INK_2)

    # JPEG, not PNG. The card is a photograph of paper, so the palette is continuous
    # and PNG spends about a megabyte on it — enough that some scrapers give up before
    # they finish fetching the preview.
    out = root / "public" / "og.jpg"
    img.save(out, quality=88, optimize=True, progressive=True, subsampling=0)
    print(f"  {out.name:24} {out.stat().st_size:>7,} B  {img.size[0]}x{img.size[1]}")


if __name__ == "__main__":
    main()
