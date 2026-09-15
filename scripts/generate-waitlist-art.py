"""Generate the waitlist backdrop.

Prompts follow the structure from the image-generation skill: subject, composition,
lighting, colour, mood, technical, then an explicit negative list.

The page is one centred column on a full viewport with no scroll, so the artwork has one
job and one constraint: be beautiful at the edges, be quiet in the middle. The first
attempt failed by being busy — a crowd of hard-edged wedges reading as clutter rather than
craft. These go the other way: very few elements, large, calm, and lit.

  python3 scripts/generate-waitlist-art.py <variant> [portrait]

Reads the key from the existing local file. Never logs the key or the response body.
"""
import base64, json, os, re, sys, urllib.request
from pathlib import Path

OUT = Path("/Users/limon/thesis/output/waitlist-art")
MODEL = os.environ.get("ART_MODEL", "google/gemini-3-pro-image")

COMMON_NEGATIVE = """
Do not include: any text, letters, numbers, wordmarks, logos or symbols; charts,
candlesticks, arrows, coins, grids or icons; UI, frames, borders, watermarks; digital
gradients, lens flare, glow, bloom, metallic or glossy plastic rendering; busy clutter,
many small shapes, noisy repetition; drop shadows that look pasted on; 3D render clichés.
Two colours only, warm ivory paper and a single rich vermilion, with natural paper
variation.
"""

CENTRE_RULE = """
Composition: the centre of the frame — the middle 50 percent of the width and 50 percent of
the height — must stay calm, open paper. Text sits there. Everything of interest lives in
the outer band and is cropped by the edges, so the image reads as a close view of something
larger.
"""

VARIANTS = {
    # Restraint. One gesture, beautifully lit, enormous negative space.
    "drape": f"""A single sheet of heavy vermilion paper, one long soft fold curving in from
the lower right corner and lifting slightly away from the surface, casting a soft true
shadow. Beneath and around it, a wide expanse of warm ivory cotton paper with a deckled
torn edge running gently across the lower left.

{CENTRE_RULE}

Lighting: soft directional studio light from the upper left, raking low across the paper so
the fold has a gentle gradient from lit to shadowed and the paper grain is visible. Real
contact shadows, soft-edged, short.

Colour: warm ivory approximately #F5F1E8 and a single rich vermilion approximately #E8452A.
Mood: quiet, expensive, considered. A fine-art paper study photographed from directly above.
Style: overhead photograph of real paper, shallow relief, museum-quality print.

Technical: landscape 3:2. It will be centre-cropped, so keep the fold clear of all four
edges. {COMMON_NEGATIVE}""",

    # Architecture. Two planes, one seam, strong diagonal.
    "seam": f"""Two large planes of paper meeting along one clean diagonal seam that runs
from the lower left toward the upper right: warm ivory on the upper left, deep vermilion on
the lower right, the vermilion sheet lying very slightly above so a fine shadow line
separates them. One narrow sliver of pale sand paper tucked beneath the seam near the lower
left, visible only as a thin edge.

{CENTRE_RULE}
Keep the seam out of the exact centre; let it pass through the lower third.

Lighting: soft even daylight from the upper left, raking enough to show the thickness of
each sheet and a crisp shadow along the seam. No harsh highlights.

Colour: warm ivory approximately #F5F1E8, rich vermilion approximately #E8452A, one pale
sand accent. Mood: calm, architectural, confident. Restraint over decoration.
Style: overhead photograph of real cut paper, shallow relief, editorial art direction.

Technical: landscape 3:2. Centre-cropped later, so nothing essential near the edges.
{COMMON_NEGATIVE}""",
}

PORTRAIT_NOTE = """
Recompose for a tall portrait 3:4 frame seen on a phone: the calm open area becomes a tall
band through the upper middle where text sits, and the vermilion gesture occupies the lower
half and reaches up one side. Keep the top airy but not empty.
"""


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
    variant = sys.argv[1] if len(sys.argv) > 1 else "drape"
    portrait = len(sys.argv) > 2 and sys.argv[2] == "portrait"
    if variant not in VARIANTS:
        raise SystemExit(f"unknown variant {variant!r}; have {', '.join(VARIANTS)}")

    prompt = VARIANTS[variant]
    if portrait:
        prompt = prompt.replace("Technical: landscape 3:2.", f"{PORTRAIT_NOTE}\nTechnical: portrait 3:4.")

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

    raw = base64.b64decode(images[0]["image_url"]["url"].split(",", 1)[1])
    OUT.mkdir(parents=True, exist_ok=True)
    name = f"{variant}{'-portrait' if portrait else ''}.png"
    (OUT / name).write_bytes(raw)
    print(f"  wrote {OUT / name}  {len(raw):,} bytes")


if __name__ == "__main__":
    main()
