> **The feature this documents was removed on 22 September 2026.** Thesis no longer launches a
> paired token per thesis. Nothing was ever launched, so no pool, fee or attribution was lost.
>
> This file stays because the measurements in it are real and were expensive to get — particularly
> that Meteora had already badged the xStock mints, which contradicted the assumption the work
> started from. Read it as a record of what is true on chain, not as a description of the product.

# Thesis tokens on Meteora DBC — what was measured

Everything below was read from mainnet or from the program's own code on **19 September 2026**.
Nothing here is from documentation. Where a claim turned out to be wrong, the wrong version is
left in place with the correction, because the wrong version is the one somebody will arrive at
again by reading the same source.

## 1. An xStock can be a quote asset. It nearly could not.

Meteora refuses arbitrary quote mints. `is_supported_quote_mint` accepts classic SPL, and
Token-2022 only when the mint carries nothing beyond metadata; anything else needs a `TokenBadge`
account, and `create_token_badge` lists an `operator` signer we are not.

**Every xStock fails the extension test.** COINx's mint carries eight extensions, six of them
outside the allowed set:

```
MetadataPointer  TokenMetadata          ← allowed
PermanentDelegate  DefaultAccountState  ScaledUiAmountConfig
PausableConfig     ConfidentialTransferMint  TransferHook   ← not allowed
```

CRCLx, HOODx, SPYx, NVDAx and MSTRx are identical.

**And every one of them works anyway, because Meteora badged them first.** Read from chain:

| mint | TokenBadge PDA | owner | mint at offset 8 |
|---|---|---|---|
| COINx | `CN4FRzbvAYKCFeQPvoBKtrkEUxSgJG4iWzNsSKyYiQyL` | `dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN` | matches |
| SPYx | `D2THzeQLHaDeKBzzmTNuWEWw23WPM8vVhLvUmSPEpNeL` | `dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN` | matches |

168 bytes each, owned by the DBC program. The stock-paired thesis token is buildable today.

PreStocks (OPENAI, ANTHROPIC, …) have **no** badge and charge 50bps on transfer. They are
excluded twice, and `pickQuoteAsset` rejects them on both counts independently.

**The lesson worth keeping:** badge existence is a fact about the chain on a day, not a property
of a symbol. Meteora can badge a mint we have not seen, and we cannot badge one ourselves. So
nothing in the running app decides eligibility — `scripts/dbc-config.ts` reads the badge before
creating a config, and `pickQuoteAsset` is only allowed to trust that a config exists.

## 2. The creator's share is not the number you set

`getFeeOnAmount` takes the protocol's cut first and unconditionally:

```js
const protocolFee = mulDiv(tradingFee, new BN(PROTOCOL_FEE_PERCENT), new BN(100), Down); // 20
const updatedTradingFee = SafeMath.sub(tradingFee, protocolFee);                          // 80
```

`creatorTradingFeePercentage` splits that remaining **80%**, not the fee. So
`creatorTradingFeePercentage: 50` pays the author **40%** of trading fees, not 50%.

Half the fee needs `62.5`, and the field is a `u8`. We use **63**, which pays the author **50.4%**
and rounds in their favour, because the promise is theirs and the rounding error is ours.

```
Meteora 20%   ·   author 50.4%   ·   Thesis 29.6%
```

`CREATOR_SHARE_OF_PARTNER_FEE` (63) is the on-chain number and must never appear in copy.
`CREATOR_SHARE_OF_TRADING_FEE` (50.4) is the one a person is told.

## 3. Measured shapes

- `createConfig` serialises to **629 bytes** unsigned — comfortably inside the 1232-byte legacy
  ceiling. Every SDK builder returns a legacy `Transaction`; there are no versioned transactions
  and no lookup tables anywhere in this SDK.
- `initializeVirtualPoolWithSplToken` takes **17 accounts**, so its floor is 2 signatures (129)
  + header (3) + keys (544) + blockhash (32) = **708 bytes**, and the instruction data is a
  discriminator plus the name, symbol and URI. Roughly 850 bytes for our values, which leaves
  real headroom. Building one against a live config is still unmeasured — see §4.
- `claimCreatorTradingFee` takes 15 accounts, one signer: a ~580-byte floor.
- `createConfig` needs two signers: the operator and a throwaway `config` keypair.
- `createPool` needs the creator and a throwaway `baseMint` keypair. The base mint is generated
  in the browser, so the server can build the transaction without being able to send it.
- `claimCreatorTradingFee` requires the **creator** to sign. Fees cannot be swept on an author's
  behalf, with or without their permission.
- `deriveDbcPoolAddress(quoteMint, baseMint, config)` — three public keys, in that order.
- `collectFeeMode: QuoteToken` accrues fees in the quote asset, so an author earns in the
  tokenized stock their thesis is about.

## 4. Still open

- **No launch transaction has been built against a real config.** The arithmetic above bounds
  the size, but the SDK reads the config account from chain, and on 19 September the primary
  Helius endpoint answered 403 to every method while the public endpoint refused
  `getProgramAccounts` with "You have used your data allowance". The first thing to do with a
  working RPC is build one and print its byte count.

- **A launch costs SOL**, from the creator's wallet: config rent, pool rent, mint rent, two
  vaults and metadata. This product was built so that buyers need no SOL — Jupiter's gasless RFQ
  pays rent and bills it back in USDC. A Privy user who signed up with an email has none, and the
  flow would dead-end at the last step. Unresolved.
- **Privy cannot sign transactions yet.** `src/lib/wallet/privy-signer.ts` bridges `signMessage`
  only. Until `useSignTransaction` is wired through `PrivyBridge`, launching and claiming are
  Phantom-only.
- **An xStock quote reserve is not beyond its issuer's reach.** `PermanentDelegate` and
  `PausableConfig` are live on every xStock mint, which is already disclosed in
  `src/server/assets/allowlist.ts`. A pool quoted in one can in principle be frozen or drained by
  Backed, and `ScaledUiAmountConfig` rebases for dividends and splits while the curve prices raw
  units and never learns. Both need saying on the token panel, not just here.
