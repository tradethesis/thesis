# Gifting surface · 22 September 2026

`gifts.css` defines the new public product. A warm paper canvas, charcoal type, restrained vermilion controls and code-native foil pack compositions express a personal gift. The collection and composer are the work, with no wallet gate. Desktop uses a large editorial heading and a pair of physical-looking packs, then compact selection, an inline composer and recipient reveal. Mobile stacks composition and form, uses horizontal pack rows and never squeezes a desktop grid.

The recipient opens a clearly labeled unfunded preview (muted banner) or a funded invitation (sealed ink "A real gift" banner) — the two never share a treatment. Packs open with a foil-style tear: drag across the crimped seal or press the button; two clipped copies, transform and opacity only, reduced motion skips it. The tear only reveals what already exists — the disclosed allocation, or chain-confirmed holdings — and never plays over an in-flight purchase. Holding cards reveal once with transform/opacity transitions. X authentication is secondary in the preview and grants no claim. No fake money, random rarity, auto-playing reveal, financial-value count-up or decorative price charts. Pack SVG art and seal textures are generated in code. All investment data comes from reviewed catalogue versions.

The existing graphite terminal and matching page retain their styles. Historical guidance below is superseded for `/` and `/gift/preview`.

---

# Thesis visual system

## Direction

The brand established in public/brand is the reference: a three-piece T, vermilion cut-paper forms, warm ivory, and charcoal. Public surfaces — `/about`, `/t/<slug>`, `/buy/<slug>` — keep the warm reading treatment. **The workspace does not.** It is a graphite instrument: near-black surfaces, warm off-white ink, quiet 1px rules, vermilion retained as the accent, restrained green and red for signed results. The two are deliberately different because one is for reading an argument and the other is for comparing ten at once.

## Color

Use OKLCH tokens in landing.css. Warm paper is the primary canvas; slightly lighter paper is the working surface. Deep ink carries text. Vermilion carries the brand art; its darker companion carries accessible button backgrounds and links. Pine, clay, and slate distinguish holdings with visible text labels. Loss and caution must not depend on color alone.

## Typography

Retain Geist Sans as the established family. Large, tight headlines on the homepage; a consistent, quieter scale on research pages. Body text around 16 px, line-height 1.6, reading width below 70 characters. Geist Mono is limited to aligned financial quantities, never used as decoration.

## Layout

Content width 1200 px including responsive gutters. Homepage: a centered headline above a panoramic miniature paper city, with a working allocation preview on the right. The artwork extends to 1440 px; mobile places it above the preview. Follow with short ownership facts, a compact worked example, the three-step journey, expandable practical details, and a vermilion closing composition. Explore: list-based thesis comparison with distinct abstract art, holdings and source counts. Thesis: readable research column with a sticky allocation preview on desktop, stacked on mobile.

## Components

Shared three-piece SVG brand mark. Rounded rectangular buttons, clear link affordances, native details/summary disclosures, labeled allocation sliders, a segmented allocation bar with a textual equivalent, purposeful empty/error states. No simulated purchase buttons where execution is not implemented.

## Motion

Short color, opacity and transform transitions, 160–220 ms with ease-out. Disable nonessential transitions for reduced motion.

**The entry screen is the one exception, added 21 September 2026.** Its illustration carries slow
looping motion — 9–60 s, transform and opacity only — because a still drawing behind a single
button reads as a placeholder. It is `pointer-events: none`, holds nothing focusable, pauses on
`visibilitychange`, and is replaced by a still composition under reduced motion. Its display boards
carry abstract bars and **never numerals**: a number on a board reads as a price, and a fake price
on the front door of a product selling real exposure is the one thing that illustration must not
do. Inside the workspace the rule is unchanged — motion is state feedback only.

## Imagery

The conviction workshop is the homepage's visual world: tactile architectural paper models, research sheets, and vermilion ribbons connecting ideas to businesses. Use the original locally hosted conviction-workshop.webp; no reference-site artwork is copied. Reuse the approved abstract vermilion banner for the closing section. Use small code-native abstract compositions for thesis categories. No external image dependency or fabricated market charts.

## Mobile reading

Keep catalogue artwork short (88–112 px) so ideas and holdings appear sooner. Use 44 px slider targets with larger thumbs and readable amounts. On thesis detail, a bottom allocation shortcut respects device safe areas and hides whenever the editor intersects the viewport. Preserve an inline anchor as the no-JavaScript fallback. Reserve footer space so the shortcut never hides the last links.

## App feed refinement (2026-09-15) — superseded 2026-09-21

The vertical feed described below was replaced by the terminal. Kept because its rules about
honest performance disclosure and readable attribution carried forward intact.

### Original

Keep the separate `/app` and vertical feed. On desktop, the idea and short explanation take roughly two-thirds of a row, with the basket alongside. Follow and Share live with the idea. The original source quotation stays readable; short posts are never clipped before their key sentence. On phones, stack these surfaces with readable asset names and 44 px actions.

Read the argument expands inline into the case, strongest objection and holding-by-holding rationale. Model performance is a compact disclosure below the argument with explicit observations and benchmark figures. Do not use independently normalized bars that exaggerate tiny differences. Following shows actual published updates and the call's state, including honest empty states.

The buy dialog is a compact desktop panel and a bottom sheet on mobile. Lead with amount and an allocation summary; reveal sliders through Customize allocation. A native dialog provides focus containment and Escape dismissal. Preserve normal links to the dedicated purchase page.


## App surface (revamp)

The app is denser than the marketing site and shares only its tokens. Warm ivory, charcoal, vermilion, the three-piece T and Geist stay; the structure does not.

- No hero and no section rhythm inside the app. The first thing under the navigation is the work.
- A collapsed feed card is signals, not paragraphs. Roughly 350–450 px at 390 px, achieved by moving the argument into a sheet rather than by shrinking type or cutting attribution.
- Assets read as a logo strip with tickers. Weights, company names, roles and risks live one layer deeper.
- Disclosures are stated once per page, not once per row. Repeated on every card they become furniture.
- Motion: one strong ease-out, staggered card entrance, press feedback on everything pressable, and a sheet that animates its own arrival. Engagement figures never animate — counting them up would make a dated snapshot look live.
- Accessibility: 44 px targets, visible focus on every interactive element, native `<dialog>` for focus containment and focus return, scroll position preserved across a sheet, and reduced motion that keeps fades and drops movement.

### Two traps worth remembering

`--ln-sans: var(--font-geist-sans), …` is an invalid declaration whenever the Geist variable is missing, and an invalid font-family falls back to a serif. The fallback belongs inside the `var()`.

CSS shared by several routes can be folded into one chunk that Next then links on only some of them, leaving a route with no palette at all. Each app route imports a stylesheet no other route imports, which cannot be deduped away.


## Terminal (2026-09-21)

Full-width `minmax(232px, 20fr) minmax(480px, 60fr) minmax(232px, 20fr)`. The old 720px reading
measure is gone; a workspace is not a column of prose.

- **Connected panels, not floating cards.** One surface divided by quiet rules. A bento of twelve
  shadowed cards reads as a dashboard template; the divisions are where the meaning is.
- **Rows are 76–96px.** Dense enough that several choices sit in the first viewport, tall enough
  for a name, a line and the holdings.
- **The chart is 350–440px and dominates its panel.** x is real time, not index, so gaps between
  readings render as gaps. Zero is the call's opening mark, which is also what the ranking measures
  from, so the header figure, the left column and the end of the line are one number. Ranges with
  fewer than two readings are offered disabled rather than drawn.
- **Scope, everywhere.** Every figure names its period and its basis. "Activity through Thesis" is
  never "volume" and never "TVL".
- **Disclosures once per column**, not once per row, exactly as before.
- **`.landing` stays on the shell** for its resets, and terminal rules beat
  `.landing a:not(.ln-btn):not(.ln-wordmark)` by matching its (0,3,1) specificity and arriving
  later — not by escalating, which is how four separate workarounds accumulated in app.css.
