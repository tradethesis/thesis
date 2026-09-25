"""
The track record behind pre-IPO packs, which have no 12-month share-price history.

PreStocks' tokens trade on Solana. Their daily USD closes (GeckoTerminal, the deepest pool per
token) are real market prices for what a holder owns, so a pack holding them gets the same
what-if as every other pack (current holdings at current weights, bought and held, no fees),
over the window where all its tokens have traded. Public holdings use Yahoo daily closes, as in
scripts/pack-history.ts. The window and its label travel with the figure: it is never shown as
"past 12 months".

Writes the pack into src/data/pack-history.json and the basket into src/data/basket-history.json.

    python3 scripts/preipo-history.py
"""

import datetime as dt
import json
import urllib.request

UA = {"user-agent": "ThesisGifts/1.0 (https://tradethesis.xyz)", "accept": "application/json"}

# The pool each token's price is read from: its deepest USD-priced market on Solana.
POOLS = {
    "OPENAI": ("4HTy7aTjPm5PTSEws2yWRDPX6gjWM6sC2dV5mv9u8JsH", "PreweJYECqtQwBtpxHL171nL2K6umo692gTm7Q3rpgF"),
    "ANTHROPIC": ("EZyszDEx1LZDt7TsSFV8xdPi49sDKC3mdfv2MVMEQLtU", "Pren1FvFX6J3E4kXhJuCiAD5aDmGEb7qJRncwA8Lkhw"),
}

# Pack (by thesis slug) -> basket slug, holdings and weights, exactly as published.
PACKS = {
    "the-ai-money-is-private-now": ("private-ai-labs", [("OPENAI", 0.40), ("ANTHROPIC", 0.35), ("NVDA", 0.25)]),
}


def get(url):
    return json.load(urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30))


def token_closes(symbol):
    pool, mint = POOLS[symbol]
    d = get(f"https://api.geckoterminal.com/api/v2/networks/solana/pools/{pool}/ohlcv/day?limit=400&currency=usd&token={mint}")
    return {dt.datetime.fromtimestamp(r[0], dt.UTC).date(): r[4] for r in d["data"]["attributes"]["ohlcv_list"]}


def share_closes(ticker):
    r = get(f"https://query1.finance.yahoo.com/v8/finance/chart/{ticker}?range=1y&interval=1d")["chart"]["result"][0]
    return {dt.datetime.fromtimestamp(ts, dt.UTC).date(): v for ts, v in zip(r["timestamp"], r["indicators"]["adjclose"][0]["adjclose"]) if v}


def at(series, day):
    earlier = [k for k in series if k <= day]
    return series[max(earlier)]


spy = share_closes("SPY")
pack_file = json.load(open("src/data/pack-history.json"))
basket_file = json.load(open("src/data/basket-history.json"))

for slug, (basket, holdings) in PACKS.items():
    series = {s: token_closes(s) if s in POOLS else share_closes(s) for s, _ in holdings}
    # Start on the first trading day on which every holding has a price; end on the last full one.
    first = max(min(s) for s in series.values())
    days = sorted(d for d in spy if d > first and d < dt.datetime.now(dt.UTC).date())
    start, end = days[0], days[-1]
    value = lambda d: sum(w * at(series[s], d) / at(series[s], start) for s, w in holdings)
    bench = lambda d: at(spy, d) / at(spy, start)
    sample = [d for i, d in enumerate(days) if i % 5 == 0 or d == end]
    points = [{"basketPct": round((value(d) - 1) * 100, 2), "benchmarkPct": round((bench(d) - 1) * 100, 2)} for d in sample]
    ret, bm = (value(end) - 1) * 100, (bench(end) - 1) * 100
    label = f"Since the tokens launched · {start.strftime('%b')} {start.day}"
    pack_file["packs"][slug] = {"returnPct": ret, "benchmarkPct": bm, "points": points, "from": start.isoformat(), "asOf": end.isoformat(), "label": label}
    basket_file["baskets"][basket] = {"returnPct": round(ret, 2), "benchmarkPct": round(bm, 2), "from": start.isoformat(), "label": f"since {start.strftime('%b')} {start.day}"}
    print(f"{slug}: {ret:+.1f}% vs S&P 500 {bm:+.1f}% ({start} to {end})")

json.dump(pack_file, open("src/data/pack-history.json", "w"), indent=1)
open("src/data/pack-history.json", "a").write("\n")
json.dump(basket_file, open("src/data/basket-history.json", "w"), indent=1)
open("src/data/basket-history.json", "a").write("\n")
