"""Build the self-contained investor/partner deck. Screenshots are local previews."""
from pathlib import Path
from base64 import b64encode
ROOT = Path(__file__).resolve().parent

def data(name, mime):
    return f'data:{mime};base64,' + b64encode((ROOT / 'assets' / name).read_bytes()).decode()

font = data('geist-latin.woff2', 'font/woff2')
packs = data('gift-packs.png', 'image/png')
collection = data('gift-collection.png', 'image/png')
recipient = data('gift-recipient.png', 'image/png')
reveal = data('gift-reveal.png', 'image/png')
slides = []
logo = '<div class="logo"><svg viewBox="0 0 40 40"><path fill="currentColor" d="M5 7h14l.5.6v7.8l-.5.6H2L5 7Zm16 0h14l3 9H21l-.5-.6V7.6L21 7ZM16 17h8l1 1v15l-1 1h-8l-1-1V18l1-1Z"/></svg>thesis</div>'

def slide(label, body, theme=''):
    n = len(slides) + 1
    slides.append(f'<section class="slide {theme}"><header>{logo}<span>{label}</span></header><main>{body}</main><footer><a href="https://tradethesis.xyz">tradethesis.xyz</a><span>Investor & partner brief · 23 September 2026</span><b>{n:02}</b></footer></section>')

slide('AN INVESTMENT WORTH GIVING', f'''
<div class="split cover"><div><p class="eyebrow">A future they recognize. A friend they trust.</p><h1>Give someone<br>their first<br><em>investment.</em></h1><p class="lead">Themed stock-token gifts.<br>A personal note. A pack to open.</p><p class="small">Kayle · Builder<br>Built on Solana</p></div><div class="cover-art"><img src="{packs}" alt="Two themed Thesis gift packs from the local preview"><p class="caption">Current local preview · Funded gifts are next</p></div></div>''')

slide('01 / THE OPENING', '''
<p class="eyebrow">The first investment asks for a lot.</p><h2>Know what to buy.<br>Learn a new app.<br><em>Risk your own money.</em></h2>
<div class="three"><div><span class="tag">FAMILIARITY</span><h3>“I know these companies.”</h3><p>A recognizable future gives the investment context.</p></div><div><span class="tag">TRUST</span><h3>“My friend chose this.”</h3><p>A personal gift creates a reason to take the first step.</p></div><div><span class="tag">START</span><h3>“I already have something.”</h3><p>A small position makes the next decision concrete.</p></div></div>
<p class="note">Product hypothesis to validate. The gift reduces the recipient’s initial funding burden; the assets can still lose value.</p>''')

slide('02 / WHO IT IS FOR', '''
<h2>One investor.<br><em>One friend who hasn’t started.</em></h2>
<div class="split panels"><div><span class="tag">THE SENDER</span><h3>Already invests. Holds USDC.</h3><p>Wants to give something more personal than cash and more lasting than a hot token.</p><blockquote>“You keep talking about AI.<br>Here’s a little exposure to that future.”</blockquote></div><div><span class="tag">THE RECIPIENT</span><h3>Knows the brands. Has an X account.</h3><p>Is curious about investing, but hasn’t learned wallets or built a portfolio.</p><blockquote>“A gift from Alex.<br>Made around something I care about.”</blockquote></div></div>
<p class="note">Initial audience hypothesis: adult senders and recipients in one verified eligible market. An X account alone does not establish eligibility.</p>''')

slide('03 / THE PRODUCT', f'''
<div class="screen-title"><h2>Pick a future.<br><em>Make it personal.</em></h2><p>Choose a pack, a budget,<br>an X handle, and a note.</p></div>
<div class="collection-shot"><img src="{collection}" alt="Current collection of AI, finance and internet themed stock-token gift packs"></div>
<p class="note">Actual local preview. Each pack wraps an existing, versioned allocation. The sender can inspect holdings and weights before proceeding.</p>''')

slide('04 / THE RECEIVING MOMENT', f'''
<div class="recipient-layout"><div><p class="eyebrow">The intended live experience</p><h2>A friend sends it.<br>You sign in with X.<br><em>Open your first position.</em></h2><p class="lead">A familiar identity at the door.<br>A personal note inside.<br>Underlying stock tokens in your wallet.</p><p class="small">The allocation is fixed and disclosed.<br>The surprise is the reveal, not the payout.</p><p class="inline-note">Today: a working, unfunded pack preview.<br>Verified X claims and asset delivery are not live.</p></div><div class="phone"><img src="{recipient}" alt="Actual mobile recipient preview, explicitly marked unfunded"></div></div>''')

slide('05 / AFTER THE REVEAL', f'''
<div class="screen-title"><h2>A gift with<br><em>a reason to hold it.</em></h2><p>Understand the companies,<br>the thesis, and what could go wrong.</p></div>
<div class="reveal-shot"><img src="{reveal}" alt="Actual revealed gift showing three holdings, indicative allocations and thesis"></div>
<p class="note">Actual local preview. Displayed dollar amounts illustrate budget allocation; they are not funded balances or market quotes. Ongoing portfolio ownership is next.</p>''')

slide('06 / DISTRIBUTION', '''
<p class="eyebrow">The sender brings the next investor.</p><h2>Make the invitation<br><em>part of the product.</em></h2>
<div class="flow"><div><span class="tag">01 / GIVE</span><h3>Someone buys a gift.</h3><p>A personal relationship supplies the first introduction.</p></div><b>→</b><div><span class="tag">02 / CLAIM</span><h3>A friend starts investing.</h3><p>The gift becomes a small portfolio with a reason behind it.</p></div><b>→</b><div><span class="tag">03 / CONTINUE</span><h3>They fund the next step.</h3><p>Invest more themselves, or introduce another friend.</p></div></div>
<div class="callout">The proof is a second decision made with their own money.</div>
<p class="note">Proposed acquisition loop, not proven virality. Measure repeat use after the novelty of the reveal has passed.</p>''','dark')

slide('07 / WHY THESE RAILS', '''
<h2>xStocks brings stocks onchain.<br><em>Thesis brings the invitation.</em></h2>
<div class="three"><div><span class="tag">EXPOSURE</span><h3>Recognizable companies.</h3><p>Existing stock tokens supply economic exposure. Thesis does not issue a new basket coin.</p></div><div><span class="tag">DELIVERY</span><h3>Programmable transfers.</h3><p>Solana tokens and USDC let a funded gift connect to a recipient’s wallet.</p></div><div><span class="tag">EXPERIENCE</span><h3>One human reason to start.</h3><p>The thesis, personal message, and claim experience turn infrastructure into an invitation.</p></div></div>
<div class="callout">Start with eligible stock-token packs. Reuse existing assets and execution infrastructure.</div>
<p class="note">Stock tokens are not stablecoins and do not confer direct shareholder rights. Availability and liquidity vary. Sources: <a href="https://www.kraken.com/xstocks">Kraken / xStocks</a> · <a href="https://docs.xstocks.fi/docs/product-legal-overview">xStocks legal overview</a> · <a href="https://developers.jup.ag/docs/swap/order-and-execute">Jupiter execution</a></p>''')

slide('08 / THE EDGE TO EARN', '''
<p class="eyebrow">Stock gifting already exists. The opening is distribution.</p><h2>Personal enough to send.<br><em>Simple enough to receive.</em></h2>
<div class="three"><div><span class="tag">THE WEDGE</span><h3>Give a belief.</h3><p>A small, intelligible pack around a future the recipient already cares about.</p></div><div><span class="tag">THE CHANNEL</span><h3>Reach someone by X identity.</h3><p>An invitation with a known sender and a path into investing without a wallet extension.</p></div><div><span class="tag">THE ADVANTAGE TO BUILD</span><h3>A trusted path to a first position.</h3><p>Reliable claims, useful packs, repeat senders, and an experience people recommend.</p></div></div>
<div class="callout">The pack animation is easy to copy. Repeat distribution has to be earned.</div>
<p class="note">No established moat or exclusive partnership is claimed. Precedent: <a href="https://www.newsfilecorp.com/release/148851">Stockpile’s digital stock-gift offering, 2022</a>. The proposed combination and its demand remain to be validated.</p>''')

slide('09 / BUSINESS & FIRST PROOF', '''
<h2>A paid gift.<br><em>A measurable next step.</em></h2>
<div class="split panels"><div><span class="tag">BUSINESS HYPOTHESIS</span><h3>A transparent sender-paid fee.</h3><p>Show the gift budget, service fee, and estimated execution costs separately before funding.</p><p>Validate contribution after execution, gas, identity, support, and failed-claim costs.</p></div><div><span class="tag">FIRST PILOT · PROPOSED</span><h3>20 senders. Their own money.</h3><p>Begin in one verified eligible market with three reviewed packs and personal invitations.</p><p>Track completed claims, cost per claimed gift, self-funded follow-on purchases, and repeat gifting.</p></div></div>
<p class="note">Pilot design, not traction. No fee rate, revenue, conversion, or market-size claim. No automatic reinvestment or recipient referral subsidy assumed.</p>''','dark')

slide('10 / BUILD STATUS', '''
<h2>The gift experience works.<br><em>The funded claim is next.</em></h2>
<div class="split status"><div><span class="tag">BUILT AND TESTED LOCALLY</span><h3>Choose → fund → open</h3><ul><li>Three packs, $10–$1,000, handle and note; unfunded preview</li><li>3D foil-tear reveal, confetti and sound, over confirmed holdings</li><li>Gift lifecycle: X-account binding, chain-verified funding</li><li>Race-safe claim, delivery via the existing buy engine</li><li>Recovery and export wired; no-refund terms stated</li></ul></div><div><span class="tag">REQUIRED BEFORE FUNDED PILOT</span><h3>Connect → exercise → decide</h3><ul><li>X account lookup (API token); provisioning is on</li><li>A location check — open to anyone for the hackathon</li><li>One real gift end to end, including X sign-in</li><li>Recovery exercised on a real recipient account</li><li>A sell path — not in Thesis yet</li></ul></div></div>
<p class="note">Reviewed 23 September 2026. Funded gifting is switched on for beta except X lookup. Screenshots show a local, unfunded build. No live gifts, funded claims, traction, or deployment status are implied.</p>''')

slide('BUILD WITH US', '''
<p class="eyebrow">Trade Thesis</p><h1>The next investor<br>could start with<br><em>a gift from a friend.</em></h1>
<p class="lead">Seeking early backers and partners for eligible<br>stock-token distribution, onboarding, and execution.</p>
<div class="contact"><div><strong>Kayle</strong><span>Builder</span></div><a href="https://t.me/kayle_build">@kayle_build ↗</a><a href="https://tradethesis.xyz">tradethesis.xyz ↗</a></div>
<p class="small">Technical materials available on request.</p>''','red')

css = '''
@font-face{font-family:Geist;src:url(FONT) format('woff2');font-weight:100 900;font-display:block}
:root{--paper:#f8f5ed;--ink:#242721;--muted:#65685e;--line:#d7d9ce;--accent:#b23823}
*{box-sizing:border-box}body{margin:0;background:#d8d8d0;color:var(--ink);font-family:Geist,Arial,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}a{color:inherit;text-decoration:none}h1,h2,h3,p,blockquote{margin:0}em{font-style:normal;color:var(--accent)}.slide{width:1280px;height:720px;padding:34px 56px 60px;position:relative;overflow:hidden;background:var(--paper);color:var(--ink);break-after:page}.slide:last-child{break-after:auto}header{display:flex;justify-content:space-between;align-items:center;height:38px;margin-bottom:43px}header>span{font-size:11px;letter-spacing:.1em;color:var(--muted)}.logo{display:flex;align-items:center;font-size:28px;font-weight:650;letter-spacing:-1.2px;gap:7px}.logo svg{width:32px;height:32px;color:var(--accent)}footer{position:absolute;bottom:22px;left:56px;right:56px;display:flex;align-items:center;font-size:11px;color:var(--muted);gap:24px}footer span{margin-left:auto}footer b{font-weight:500;border-left:1px solid var(--line);padding-left:24px}h1{font-size:73px;font-weight:570;letter-spacing:-4.3px;line-height:1.04}h2{font-size:51px;font-weight:570;letter-spacing:-2.5px;line-height:1.1}h3{font-size:25px;font-weight:570;letter-spacing:-.7px;line-height:1.2}.eyebrow{font-size:14px;color:var(--accent);font-weight:550;margin-bottom:22px}.lead{font-size:23px;line-height:1.5;color:var(--muted);margin-top:26px}.small{font-size:16px;line-height:1.55;color:var(--muted);margin-top:27px}.caption{font-size:10px;line-height:1.5;color:var(--muted);text-align:center;margin-top:12px}.note{position:absolute;bottom:55px;left:56px;right:56px;font-size:10.5px;line-height:1.6;color:var(--muted)}.note a{text-decoration:underline;text-underline-offset:2px}.split{display:grid;grid-template-columns:1fr 1fr;gap:60px}.cover{grid-template-columns:1.18fr 1fr;gap:20px}.cover h1{font-size:78px}.cover-art img{width:100%;height:410px;object-fit:contain}.cover-art{padding-top:10px}.three{display:grid;grid-template-columns:repeat(3,1fr);gap:35px;margin-top:40px}.three>div,.panels>div,.status>div{border-top:1px solid var(--line);padding-top:22px}.tag{display:block;font-size:11px;letter-spacing:.07em;color:var(--accent);margin-bottom:18px}.three p,.panels p,.flow p{font-size:20px;line-height:1.45;color:var(--muted);margin-top:17px}.panels{margin-top:42px}.panels h3{font-size:27px}.panels blockquote{font-size:22px;line-height:1.4;letter-spacing:-.4px;margin-top:29px;border-left:2px solid var(--accent);padding-left:20px}.screen-title{display:flex;justify-content:space-between;align-items:end}.screen-title h2{font-size:43px;letter-spacing:-1.9px}.screen-title>p{font-size:19px;line-height:1.5;color:var(--muted);padding-bottom:5px}.collection-shot{margin-top:24px;height:350px;overflow:hidden}.collection-shot img{width:100%;height:100%;object-fit:contain}.recipient-layout{display:grid;grid-template-columns:1fr 270px;gap:70px;align-items:start}.recipient-layout h2{font-size:48px}.phone{height:494px;overflow:hidden;border:1px solid var(--line);border-radius:18px;background:var(--paper);box-shadow:0 12px 28px #27282014}.phone img{width:100%;height:100%;object-fit:contain}.inline-note{font-size:12px;line-height:1.6;color:var(--muted);margin-top:26px;padding-top:15px;border-top:1px solid var(--line);max-width:500px}.reveal-shot{height:352px;margin-top:22px;border:1px solid var(--line);border-radius:8px;overflow:hidden}.reveal-shot img{width:100%;height:100%;object-fit:contain}.flow{display:grid;grid-template-columns:1fr 25px 1fr 25px 1fr;gap:19px;margin-top:43px}.flow>div{border-top:1px solid var(--line);padding-top:23px}.flow>b{font-size:25px;font-weight:400;color:var(--accent);padding-top:62px}.callout{font-size:22px;line-height:1.4;border-top:1px solid var(--line);padding-top:24px;margin-top:35px;letter-spacing:-.3px}.dark{--paper:#252a24;--ink:#f6f4ea;--muted:#c1c7b9;--line:#4d5548;--accent:#f0b398}.status{margin-top:38px}.status ul{margin:20px 0 0;padding:0;list-style:none}.status li{font-size:19px;line-height:1.55;color:var(--muted);padding:6px 0}.status li:before{content:'·';margin-right:10px;color:var(--accent)}.red{--paper:#ad3523;--ink:#fff6eb;--muted:#f4d3c2;--line:#ca7d6e;--accent:#ffdfaa}.red h1{font-size:69px}.red .lead{font-size:22px}.contact{display:flex;align-items:center;gap:42px;margin-top:29px;font-size:20px}.contact>div{display:flex;flex-direction:column;gap:5px;min-width:145px}.contact strong{font-size:25px;font-weight:550}.contact span{font-size:15px;color:var(--muted)}.contact a{border-bottom:1px solid var(--muted);padding-bottom:5px}.red .small{font-size:14px;margin-top:22px}@page{size:1280px 720px;margin:0}@media screen{.slide{margin:20px auto;box-shadow:0 4px 24px #0002}}@media print{body{background:var(--paper)}.slide{margin:0}}
'''.replace('FONT', font)
html = '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Thesis | Give someone their first investment</title><meta name="author" content="Kayle"><style>' + css + '</style></head><body>' + ''.join(slides) + '</body></html>'
(ROOT / 'deck.html').write_text(html)
print(f'Built {len(slides)} slides with embedded fonts and actual local preview screenshots.')
