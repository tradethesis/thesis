# Thesis investor & partner deck

Final PDF: [Thesis-Pitch-Deck.pdf](../Thesis-Pitch-Deck.pdf)

12 slides, 16:9 landscape. Approximately 2.3 MB. Embedded fonts, selectable text, clickable website/source/Telegram links, tagged PDF, no password or JavaScript. Prepared for manual upload to DocSend; not uploaded by the agent.

Audience: investors and potential partners. Founder contact supplied by Kayle: builder, Telegram @kayle_build.

## Content

1. Buy what you believe
2. The problem
3. The thesis product unit
4. A concrete three-business example
5. Real mobile product screens
6. Why Solana
7. Differentiation
8. First 50 users plan
9. Proposed business model
10. Current build and next release
11. Pilot milestones
12. Founder contact and partnership ask

The deck distinguishes working public research/allocation screens from planned integrated checkout. User acquisition targets, retention thresholds, subscription plans, and partner channels are hypotheses, not achieved traction. No fundraising amount, valuation, or fabricated credentials are included.

## Editable source

`build_deck.py` contains the slide content and design. Run `python3 pitch/build_deck.py` from the repository root to regenerate the self-contained `deck.html`. Fonts and screenshots are embedded into that HTML; it can be opened locally and printed to PDF.

For exact export, Chromium/Playwright prints at 1280 × 720 CSS px, with background graphics, no page margins, CSS page size, and no browser headers/footers. The resulting PDF is 960 × 540 points per page.

Original artwork and real mobile screenshots are in `assets/`. Preview renders and validation results are under the ignored `output/pitch-review/` folder. The repository is described as private, with access available on request through Telegram. No direct repository URL is embedded in the deck. Source links to xStocks and Jupiter appear on the Solana slide. Deck prepared September 15, 2026.
