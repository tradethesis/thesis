"use client";

import { PrivyProvider } from "@privy-io/react-auth";
import { createSolanaRpc, createSolanaRpcSubscriptions } from "@solana/kit";

import { PrivyBridge } from "./PrivyBridge";

/**
 * The Privy provider, in its own module so it can be a separate chunk.
 *
 * Kept apart from providers.tsx on purpose: a `next/dynamic` import only splits the bundle
 * if the heavy import lives behind the boundary. Putting `PrivyProvider` in the same file
 * as the loader would pull it straight back into the entry graph and the split would look
 * like it worked while changing nothing.
 *
 * It wraps nothing but the bridge. An earlier version wrapped the whole app, and because
 * the loader is `ssr: false`, that silently turned off server rendering for every page on
 * the site — the feed's HTML arrived with no cards in it. Nothing outside this file calls
 * Privy's hooks, so the provider does not need to be an ancestor of anything; its modal
 * renders itself.
 */
/**
 * Privy's Solana signing hooks throw "No RPC configuration found for chain solana:mainnet" on mount
 * without this, which takes the whole page down. Public endpoints on purpose: the keyed RPC URL
 * stays on the server, and Privy only uses these for its own confirmation screen.
 */
const SOLANA_RPCS = {
  "solana:mainnet": {
    rpc: createSolanaRpc("https://api.mainnet-beta.solana.com"),
    rpcSubscriptions: createSolanaRpcSubscriptions("wss://api.mainnet-beta.solana.com"),
    blockExplorerUrl: "https://explorer.solana.com",
  },
} as const;

export function PrivyAuth({ appId }: { appId: string }) {
  return (
    <PrivyProvider
      appId={appId}
      config={{
        // Solana only. Offering an Ethereum wallet here would create an address this
        // product can do nothing with, on a screen about buying Solana tokens.
        loginMethods: ["email", "google", "twitter"],
        embeddedWallets: {
          solana: { createOnLogin: "users-without-wallets" },
          ethereum: { createOnLogin: "off" },
        },
        solana: { rpcs: SOLANA_RPCS },
        appearance: {
          walletChainType: "solana-only",
          theme: "light",
          accentColor: "#c2410c",
          logo: "/icon-192.png",
        },
      }}
    >
      <PrivyBridge />
    </PrivyProvider>
  );
}
