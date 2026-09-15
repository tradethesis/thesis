"""Generate the waitlist page backdrop.

Brief is shaped by the layout, not the other way round: the page is one centred column on
a full viewport with no scroll, so the artwork has to stay quiet where the words are and
do its work at the edges. It is cover-cropped, so it must survive both a tall phone and a
wide laptop.

Reads the key from the existing local file. Never logs the key or the response body.
"""
import base64, json, os, re, sys, urllib.request
from pathlib import Path

OUT = Path("/Users/limon/thesis/output/waitlist-art")
MODEL = os.environ.get("ART_MODEL", "google/gemini-3-pro-image")

PROMPT = """Use case: ads-marketing. Create a finished abstract backdrop for the Thesis
waitlist page at tradethesis.xyz. It sits behind one centred column of text, so the middle
of the image must stay calm and almost empty.

Warm ivory paper ground, approximately #F5F1E8, with a subtle tactile paper grain. From the
outer edges, large sculptural cut-paper forms in rich vermilion, approximately #F04B32, reach
inward and stop well short of the centre: broad folded ribbons and clean angular planes,
entering from the corners and the lower edge, cropped by the frame so the composition reads
as a close view of something larger. A few slender ivory and pale sand planes layer beneath
them, with precise seams and soft contact shadows, suggesting separate convictions arranged
into one structure.

The centre, roughly the middle 45 percent of the width and the middle 50 percent of the
height, is quiet open paper with at most a faint deckled edge or a single hairline. Nothing
busy there.

Weight the composition toward the bottom third so the lower edge feels grounded and the top
stays airy. Elegant asymmetry, generous negative space, crisp edges, shallow paper relief.
Contemporary art-book jacket, not a corporate diagram.

ABSOLUTELY NO TEXT, letters, numbers, wordmarks or logos. No charts, candlesticks, arrows,
coins, grids, icons, gradients, glows, metallic rendering, heavy drop shadows, frames, UI, or
watermark. Two main colours only, vermilion and warm ivory, with natural paper variation.

Landscape 3:2. It will be centre-cropped to both tall portrait and wide landscape, so keep
everything essential away from all four edges. Artwork only."""

# A phone crops a 3:2 image to a narrow vertical strip, which throws away the forms at the
# left and right edges and leaves the top half as empty paper. Same composition, recomposed
# for the shape it will actually be seen in.
PORTRAIT = PROMPT.replace(
    "Landscape 3:2. It will be centre-cropped to both tall portrait and wide landscape, so keep\neverything essential away from all four edges. Artwork only.",
    "Tall portrait 3:4, composed for a phone screen. The quiet open centre becomes a tall calm\n"
    "band through the upper middle where the text sits. Bring the vermilion forms in from the\n"
    "left and right edges at mid height and from the bottom, so the lower third is rich and the\n"
    "top stays airy but not empty: let one slim vermilion plane reach down from the top corner.\n"
    "Artwork only.",
).replace("Weight the composition toward the bottom third", "Weight the composition toward the lower half")


def key() -> str:
    env = os.environ.get("OPENROUTER_API_KEY", "").strip()
    if env:
        return env
    for line in Path("/Users/limon/.tcg-art.env").read_text().splitlines():
        m = re.match(r"^\s*(?:export\s+)?OPENROUTER_API_KEY\s*=\s*(.*?)\s*$", line)
        if m:
            return m.group(1).strip().strip("\"'")
    raise SystemExit("no OpenRouter key found")


def main() -> None:
    which = sys.argv[1] if len(sys.argv) > 1 else "landscape"
    prompt = PORTRAIT if which == "portrait" else PROMPT
    body = json.dumps({
        "model": MODEL,
        "messages": [{"role": "user", "content": prompt}],
        "modalities": ["image", "text"],
    }).encode()

    req = urllib.request.Request(
        "https://openrouter.ai/api/v1/chat/completions",
        data=body,
        headers={"Authorization": f"Bearer {key()}", "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=300) as res:
        payload = json.load(res)

    images = payload.get("choices", [{}])[0].get("message", {}).get("images") or []
    if not images:
        print("no image returned; finish_reason:", payload.get("choices", [{}])[0].get("finish_reason"))
        sys.exit(1)

    url = images[0]["image_url"]["url"]
    raw = base64.b64decode(url.split(",", 1)[1])
    OUT.mkdir(parents=True, exist_ok=True)
    path = OUT / ("waitlist-backdrop-portrait.png" if which == "portrait" else "waitlist-backdrop.png")
    path.write_bytes(raw)
    print(f"  wrote {path}  {len(raw):,} bytes")


if __name__ == "__main__":
    main()
