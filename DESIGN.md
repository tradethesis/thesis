# Thesis visual system

## Direction

The brand established in public/brand is the reference: a three-piece T, vermilion cut-paper forms, warm ivory, and charcoal. The scene is a person opening an investment idea on their phone in daylight. Public surfaces intentionally use a light theme in both OS modes.

## Color

Use OKLCH tokens in landing.css. Warm paper is the primary canvas; slightly lighter paper is the working surface. Deep ink carries text. Vermilion carries the brand art; its darker companion carries accessible button backgrounds and links. Pine, clay, and slate distinguish holdings with visible text labels. Loss and caution must not depend on color alone.

## Typography

Retain Geist Sans as the established family. Large, tight headlines on the homepage; a consistent, quieter scale on research pages. Body text around 16 px, line-height 1.6, reading width below 70 characters. Geist Mono is limited to aligned financial quantities, never used as decoration.

## Layout

Content width 1200 px including responsive gutters. Homepage: a centered headline above a panoramic miniature paper city, with a working allocation preview on the right. The artwork extends to 1440 px; mobile places it above the preview. Follow with short ownership facts, a compact worked example, the three-step journey, expandable practical details, and a vermilion closing composition. Explore: list-based thesis comparison with distinct abstract art, holdings and source counts. Thesis: readable research column with a sticky allocation preview on desktop, stacked on mobile.

## Components

Shared three-piece SVG brand mark. Rounded rectangular buttons, clear link affordances, native details/summary disclosures, labeled allocation sliders, a segmented allocation bar with a textual equivalent, purposeful empty/error states. No simulated purchase buttons where execution is not implemented.

## Motion

Short color, opacity and transform transitions, 160–220 ms with ease-out. No entrance choreography or looping motion. Disable nonessential transitions for reduced motion.

## Imagery

The conviction workshop is the homepage's visual world: tactile architectural paper models, research sheets, and vermilion ribbons connecting ideas to businesses. Use the original locally hosted conviction-workshop.webp; no reference-site artwork is copied. Reuse the approved abstract vermilion banner for the closing section. Use small code-native abstract compositions for thesis categories. No external image dependency or fabricated market charts.

## Mobile reading

Keep catalogue artwork short (88–112 px) so ideas and holdings appear sooner. Use 44 px slider targets with larger thumbs and readable amounts. On thesis detail, a bottom allocation shortcut respects device safe areas and hides whenever the editor intersects the viewport. Preserve an inline anchor as the no-JavaScript fallback. Reserve footer space so the shortcut never hides the last links.

## App feed refinement (2026-09-15)

Keep the separate `/app` and vertical feed. On desktop, the idea and short explanation take roughly two-thirds of a row, with the basket alongside. Follow and Share live with the idea. The original source quotation stays readable; short posts are never clipped before their key sentence. On phones, stack these surfaces with readable asset names and 44 px actions.

Read the argument expands inline into the case, strongest objection and holding-by-holding rationale. Model performance is a compact disclosure below the argument with explicit observations and benchmark figures. Do not use independently normalized bars that exaggerate tiny differences. Following shows actual published updates and the call's state, including honest empty states.

The buy dialog is a compact desktop panel and a bottom sheet on mobile. Lead with amount and an allocation summary; reveal sliders through Customize allocation. A native dialog provides focus containment and Escape dismissal. Preserve normal links to the dedicated purchase page.
