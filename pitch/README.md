# Thesis investor & partner deck

Updated 23 September 2026 for the thesis + stock gift direction.

- PDF: `../Thesis-Pitch-Deck.pdf` — 12 landscape slides, suitable for uploading to DocSend.
- Standalone HTML: `deck.html` — fonts and images embedded.
- Narrative: `PITCH.md`.
- Product continuation prompt: `../docs/claude-gifting-revamp.md`.
- Builder: `build_deck.py`; browser renderer and bounds checks: `render_deck.cjs`.

The screenshots show the actual local **unfunded** gift preview. They do not imply a live deployment, completed X OAuth verification, escrow, gift funding, or token delivery. The deck labels the intended claim journey and outstanding work. No traction, revenue, exclusive partnerships, or fundraising amount is claimed. Technical materials are offered on request; no repository URL is included.

## Rebuild

```sh
python3 pitch/build_deck.py
node pitch/render_deck.cjs
```

Run from the repository root. The renderer requires Playwright and Chromium. Set `PLAYWRIGHT_MODULE` if Playwright is installed elsewhere. Output screenshots and extracted slide text are written to `output/pitch-review/`. Chromium may require local execution permission in a restricted environment.

Current screenshot inputs: `assets/gift-packs.png`, `gift-collection.png`, `gift-recipient.png`, `gift-reveal.png`. These are local product captures, not mockups of funded behavior. Earlier terminal screenshot assets are retained but are not included in this deck.

## Sources and claim boundaries

- [Kraken xStocks](https://www.kraken.com/xstocks): tokenized stock exposure, underlying backing, shareholder-rights and availability distinctions.
- [xStocks product legal overview](https://docs.xstocks.fi/docs/product-legal-overview): structure and distribution constraints. Market eligibility must be checked before a pilot; the deck makes no universal-access claim.
- [Jupiter order and execute](https://developers.jup.ag/docs/swap/order-and-execute): available execution infrastructure; not proof that Thesis gift execution is live.
- [Stockpile digital stock gifting announcement, 2022](https://www.newsfilecorp.com/release/148851): historical precedent for stock gifts. This is not a claim about its current product availability.

All acquisition, retention, pricing and defensibility statements are product hypotheses. The 20-sender pilot is a proposed experiment, not existing traction.
