"""
Art for the entry screen.

Generates candidate backgrounds through OpenRouter (flux.2-pro) into output/entry-art/, which is
in .vercelignore — nothing here ships until a chosen frame is moved into public/ deliberately.

Two constraints drive every prompt:

  1. **No text and no numerals, ever.** This is the front door of a product that sells real
     exposure to real securities. An image model asked for "trading floor" will happily cover
     every surface in invented tickers and prices, and a fake price here is the one thing this
     picture must not contain. The defence is structural rather than a negative clause: most of
     these candidates have no screens in them at all, and the scene is carried by architecture,
     light and people instead.
  2. **The middle of the frame is reserved.** Ivory text and a light button sit centred over
     roughly 420x260 logical pixels. Every prompt asks for that band to stay dark and empty, so
     the scrim can be light-handed instead of a lid — which is what wrecked the drawn version.

    OPENROUTER_API_KEY=... python3 scripts/gen-entry-art.py [name ...]
"""

import base64, json, os, sys, urllib.error, urllib.request

KEY = os.environ.get("OPENROUTER_API_KEY") or next(
    l.strip().split("=", 1)[1]
    for l in open(os.path.expanduser("~/.tcg-art.env"))
    if l.startswith("OPENROUTER_API_KEY=")
)

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "output", "entry-art")

# Held constant across candidates so the differences are the idea, not the grading.
PALETTE = (
    "Colour is almost entirely deep graphite and near-black, with a single warm vermilion accent "
    "light and one cooler emerald accent used very sparingly. Rich blacks, no grey haze, no blue "
    "tint. "
)
COMPOSITION = (
    "Wide cinematic establishing shot, symmetrical, camera at eye level looking straight down the "
    "space. The centre of the frame is deliberately empty, dark and uncluttered negative space "
    "reserved for overlaid text; all detail and light sits in the upper third and the lower third. "
)
CRAFT = (
    "Photographic, shot on a full-frame camera with a 35mm lens, long exposure, volumetric haze, "
    "fine film grain, subtle lens falloff, high dynamic range, moody and restrained. "
)
BAN = (
    "Absolutely no text of any kind, no letters, no words, no numbers, no digits, no tickers, no "
    "price displays, no charts, no graphs, no signage, no logos, no watermark, no signature, no "
    "user interface, no captions, no borders."
)

CANDIDATES = {
    "hall-figures":
        "The interior of a vast modernist exchange hall at night, seen from the rear of the room. "
        "Two tiered balconies of people stand at brass rails facing away from the camera, reduced "
        "to soft silhouettes. A single warm glow rises from beyond the far wall and rims their "
        "shoulders. Thick air, deep shadow, enormous scale. ",
    "colonnade":
        "A long dark stone colonnade of tall arches receding into fog, perfectly symmetrical, "
        "a faint warm light bleeding from the far end and a polished floor holding its reflection. "
        "Nobody present. Monumental, quiet, cathedral-like. ",
    "crowd-backlit":
        "A dense crowd of people photographed from behind as flat overlapping silhouettes, backlit "
        "by a low warm horizon glow far in the distance. The foreground is near-black. Painterly, "
        "grainy, anonymous, a sense of many people facing the same direction. ",
    "light-trails":
        "Abstract long-exposure light trails sweeping through an enormous dark cavernous concrete "
        "interior, thin ribbons of warm vermilion and cool emerald curving through the air and "
        "fading into blackness. No people. Pure light and architecture. ",
    "vault":
        "A grand vaulted concrete hall, brutalist and severe, with one shaft of warm light falling "
        "through a high opening onto the floor. A handful of tiny distant figures give it scale. "
        "Dust suspended in the beam. Overwhelming, still. ",
    # REJECTED. The model covered every monitor in invented tickers, prices and charts despite the
    # ban clause. Kept as a record: once screens are in the scene, asking for them to be blank does
    # not hold. The only reliable defence is a room with no displays in it.
    "floor-night":
        "A historic stock exchange trading floor at night, long after closing and completely empty. "
        "Bare circular trading posts, a coffered ceiling far above, a warm service light left on in "
        "one corner. Every display surface is dark and blank. Deserted, atmospheric, elegiac. ",

    # --- refinements of hall-figures, which won on composition: it carries a tall dark column of
    # --- air up the middle of the frame, and that column is also what survives the phone crop.
    "hall-a":
        "The interior of an enormous modernist exchange hall at night, seen from the back of the "
        "room. Tiered balconies run up both side walls and anonymous people stand along their rails "
        "facing away from the camera, reduced to soft dark silhouettes. A tall empty column of dark "
        "air runs straight up the middle of the frame, uninterrupted. Far below and centre, a low "
        "warm amber glow washes up from an unseen source and rims the nearest shoulders. There are "
        "no screens, monitors, displays or boards anywhere in this room. Ordinary clothing, no "
        "cameras, no press, no photographers. Thick air, deep shadow, enormous scale. ",
    "hall-b":
        "An immense dark auditorium of finance at night viewed straight down its axis, three "
        "shallow balcony tiers stepping up each side wall, sparse anonymous figures leaning on the "
        "rails in silhouette, facing away. The centre of the room is a deep empty void of shadow "
        "and haze from top to bottom. One warm ember-coloured light source sits low and far away on "
        "the axis. No screens, no monitors, no displays, no boards, no furniture. Architecture, "
        "silhouettes and haze only. ",
    "hall-c":
        "A single immense curved balcony rail crossing the lower third of the frame, with a row of "
        "anonymous people standing along it in full silhouette, seen from behind, facing away into "
        "a vast dark hall. Above and beyond them the room falls away into black haze and a faint "
        "warm glow on the horizon line. The upper two thirds of the frame is almost entirely empty "
        "darkness. No screens, no monitors, no displays, no text surfaces of any kind. Minimal, "
        "restrained, enormous negative space. ",
}


def gen(prompt, ratio="16:9"):
    body = {"model": "black-forest-labs/flux.2-pro", "prompt": prompt, "n": 1, "aspect_ratio": ratio}
    req = urllib.request.Request(
        "https://openrouter.ai/api/v1/images",
        data=json.dumps(body).encode(),
        headers={"Authorization": "Bearer " + KEY, "Content-Type": "application/json"},
    )
    try:
        d = json.loads(urllib.request.urlopen(req, timeout=300).read())
    except urllib.error.HTTPError as e:
        return None, json.loads(e.read()).get("error", {}).get("message", "?")
    return d["data"][0]["b64_json"], d.get("usage", {}).get("cost")


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    wanted = sys.argv[1:] or list(CANDIDATES)
    total = 0.0
    for name in wanted:
        scene = CANDIDATES[name]
        b64, info = gen(COMPOSITION + scene + PALETTE + CRAFT + BAN)
        if not b64:
            print(f"FAIL {name}: {info}")
            continue
        path = os.path.join(OUT, f"{name}.png")
        open(path, "wb").write(base64.b64decode(b64))
        total += info or 0
        print(f"ok   {name}  ${info}  {path}")
    print(f"total ${round(total, 4)}")


# --------------------------------------------------------------------------- preparing the pick

def prepare(name="hall-c", out="public/entry"):
    """
    Turn a chosen candidate into the asset the entry screen ships.

    Two things happen here, both art direction rather than optimisation:

      * **A warm grade.** flux renders this room with a cool teal cast in the mid-shadows. The
        product's palette is graphite and vermilion with one emerald accent, and teal is neither.
        A light channel curve pulls it back rather than a CSS overlay, because the asset should be
        correct on its own — a page-level tint would have to be repeated anywhere else it is used.
      * **A black floor.** The darkest pixels are lifted off pure black by the model's grain, which
        banded visibly once the scrim went light-handed. Crushing the bottom two percent removes
        the banding without touching anything readable.

    Two widths ship. A phone at `cover` sees only the middle quarter of this image, so sending it
    all 1824 pixels is most of a megabyte spent on cropped-away wall.
    """
    from PIL import Image

    src = Image.open(os.path.join(OUT, f"{name}.png")).convert("RGB")
    r, g, b = src.split()
    r = r.point(lambda v: min(255, int(v * 1.045)))
    b = b.point(lambda v: int(v * 0.93))
    graded = Image.merge("RGB", (r, g, b)).point(lambda v: 0 if v < 5 else v)

    os.makedirs(out, exist_ok=True)
    wide = os.path.join(out, "hall.webp")
    graded.save(wide, "WEBP", quality=74, method=6)

    w, h = graded.size
    narrow = graded.crop((int(w * 0.30), 0, int(w * 0.70), h))
    tall = os.path.join(out, "hall-narrow.webp")
    narrow.save(tall, "WEBP", quality=74, method=6)

    for p in (wide, tall):
        print(f"ok   {p}  {Image.open(p).size}  {os.path.getsize(p) // 1024}KB")
