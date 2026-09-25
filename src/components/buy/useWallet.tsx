"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { getPhantom, PHANTOM_INSTALL_URL, type PhantomProvider } from "@/lib/wallet/phantom";
import { usePrivySigner } from "@/lib/wallet/privy-signer";

/**
 * Connect a wallet and hold a session.
 *
 * Two steps, and they are different things: connecting tells the page which address the
 * wallet holds, signing in proves the visitor controls it. Only the second lets the server
 * write anything (TH-06).
 *
 * Two ways in, one proof. Phantom signs if it is installed; otherwise Privy issues an
 * embedded Solana wallet against an email or a social login and that signs instead. Both
 * paths sign the same server-issued challenge and both are verified the same way, because
 * the signature is the only thing the server ever trusts. Privy is a signer, not an
 * identity — being logged into Privy grants nothing on its own.
 *
 * This matters more than it looks. Before it, every action behind a wallet required one
 * specific browser extension, so a visitor without Phantom could reach the amount slider
 * and no further.
 */

export type ExecutionMode = "live" | "simulation";

export type WalletState = {
  wallet: string | null;
  /** False until the session has been checked. `wallet` is meaningless before this is true. */
  ready: boolean;
  executionMode: ExecutionMode;
  connecting: boolean;
  signingIn: boolean;
  error: string | null;
  hasPhantom: boolean;
  /** Whether the no-extension path is configured at all. */
  hasEmailSignIn: boolean;
  /** Phantom if present, otherwise the embedded wallet. */
  connect: () => Promise<void>;
  /** Always the embedded wallet, even when Phantom is installed. */
  connectWithEmail: () => Promise<void>;
  signOut: () => Promise<void>;
  installUrl: string;
};

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error?.message ?? `request failed (${res.status})`);
  return body as T;
}

const HAS_PRIVY = Boolean(process.env.NEXT_PUBLIC_PRIVY_APP_ID);

function useWalletState(): WalletState {
  const [wallet, setWallet] = useState<string | null>(null);
  const [executionMode, setExecutionMode] = useState<ExecutionMode>("simulation");
  const [connecting, setConnecting] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasPhantom, setHasPhantom] = useState(true);
  /*
   * Whether the session has been checked yet.
   *
   * Without it `wallet: null` means two different things — "signed out" and "not asked yet" —
   * and every gated surface flashes its signed-out state on first paint for somebody who is
   * signed in. The entry screen cannot work at all without this distinction: it would bounce a
   * returning visitor to a connect button before their session had loaded.
   */
  const [ready, setReady] = useState(false);
  /** Set while a Privy modal is open, so the effect below knows to finish what it started. */
  const pendingEmail = useRef(false);

  // Read from the bridge, never from Privy's own hooks: those throw outside their
  // provider, and the provider is loaded lazily so it is legitimately absent for the first
  // moments of every visit — and absent for good when no app id is configured.
  const privy = usePrivySigner();

  // Pick up an existing session on load so a refresh does not ask for another signature.
  useEffect(() => {
    setHasPhantom(getPhantom() !== null);
    api<{ wallet: string | null; executionMode: ExecutionMode }>("/api/session")
      .then((s) => {
        setWallet(s.wallet);
        setExecutionMode(s.executionMode);
      })
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);

  /**
   * Exchange a signature over our challenge for a session.
   *
   * The half that is identical for every signer, kept in one place so a second way in can
   * never become a second way to authenticate.
   */
  const establishSession = useCallback(
    async (address: string, sign: (message: string) => Promise<{ signature: string; signedMessage: string }>) => {
      const challenge = await api<{ message: string }>("/api/session/challenge", {
        method: "POST",
        body: JSON.stringify({ wallet: address }),
      });

      const { signature, signedMessage } = await sign(challenge.message);

      const verified = await api<{ wallet: string }>("/api/session/verify", {
        method: "POST",
        body: JSON.stringify({ wallet: address, signature, signedMessage }),
      });
      setWallet(verified.wallet);

      const session = await api<{ executionMode: ExecutionMode }>("/api/session");
      setExecutionMode(session.executionMode);
    },
    [],
  );

  const connectPhantom = useCallback(async () => {
    const provider: PhantomProvider | null = getPhantom();
    if (!provider) {
      setHasPhantom(false);
      throw new Error("Phantom is not installed in this browser.");
    }

    setConnecting(true);
    const { publicKey } = await provider.connect();
    const address = publicKey.toBase58();
    setConnecting(false);
    setSigningIn(true);

    await establishSession(address, async (message) => {
      const bs58 = (await import("bs58")).default;

      // signIn is Phantom's native SIWS and shows a readable prompt. Older builds do not
      // have it, so fall back to signing the same text as a message.
      if (provider.signIn) {
        const result = await provider.signIn({
          domain: window.location.host,
          uri: window.location.origin,
          statement: message.split("\n")[3],
          version: "1",
          chainId: "solana:mainnet",
          nonce: message.match(/^Nonce: (.+)$/m)![1],
          issuedAt: message.match(/^Issued At: (.+)$/m)![1],
          expirationTime: message.match(/^Expiration Time: (.+)$/m)![1],
          address,
        });
        return {
          signature: bs58.encode(result.signature),
          signedMessage: new TextDecoder().decode(result.signedMessage),
        };
      }

      const result = await provider.signMessage(new TextEncoder().encode(message), "utf8");
      return { signature: bs58.encode(result.signature), signedMessage: message };
    });
  }, [establishSession]);

  const connectEmail = useCallback(async () => {
    if (!privy) throw new Error("Email sign-in is still loading. Try again in a moment.");

    setConnecting(true);
    if (!privy.authenticated) {
      // `privy.login()` only opens the modal — it resolves on the next microtask, long before
      // anybody has typed an email. Nothing used to resume afterwards, so the visitor had to tap
      // "Continue with email" a second time once the modal closed. The effect below watches for
      // `authenticated` flipping true and finishes the handshake itself.
      pendingEmail.current = true;
      await privy.login();
      return;
    }

    const address = privy.address;
    if (!address) {
      setConnecting(false);
      throw new Error("No Solana wallet on this account yet. Try again in a moment.");
    }

    setConnecting(false);
    setSigningIn(true);

    await establishSession(address, async (message) => {
      const bs58 = (await import("bs58")).default;
      const signature = await privy.signMessage(new TextEncoder().encode(message));
      return { signature: bs58.encode(signature), signedMessage: message };
    });
  }, [establishSession, privy]);

  /** Finish an email sign-in once Privy's modal has done its half. */
  useEffect(() => {
    if (!pendingEmail.current || wallet || !privy?.authenticated || !privy.address) return;
    pendingEmail.current = false;
    const address = privy.address;
    setConnecting(false);
    setSigningIn(true);
    void establishSession(address, async (message) => {
      const bs58 = (await import("bs58")).default;
      const signature = await privy.signMessage(new TextEncoder().encode(message));
      return { signature: bs58.encode(signature), signedMessage: message };
    })
      .catch((e) => setError((e as Error).message))
      .finally(() => setSigningIn(false));
  }, [privy, wallet, establishSession]);

  const run = useCallback(async (step: () => Promise<void>) => {
    setError(null);
    try {
      await step();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      // A Privy modal that is still open owns the flow; clearing `connecting` here would make
      // the button look idle while the modal is up.
      if (!pendingEmail.current) {
        setConnecting(false);
        setSigningIn(false);
      }
    }
  }, []);

  const connect = useCallback(async () => {
    // Phantom first when it is there: somebody who installed it expects it to be used, and
    // an embedded wallet would strand their tokens in a second address.
    await run(getPhantom() !== null || !HAS_PRIVY ? connectPhantom : connectEmail);
  }, [run, connectPhantom, connectEmail]);

  const connectWithEmail = useCallback(async () => {
    await run(connectEmail);
  }, [run, connectEmail]);

  const signOut = useCallback(async () => {
    await api("/api/session", { method: "DELETE" }).catch(() => {});
    if (privy?.authenticated) await privy.logout().catch(() => {});
    pendingEmail.current = false;
    setWallet(null);
    // Cleared too: a stale "live" badge outliving the session it belonged to is the kind of
    // wrong label somebody acts on.
    setExecutionMode("simulation");
    setError(null);
  }, [privy]);

  return {
    wallet,
    ready,
    executionMode,
    connecting,
    signingIn,
    error,
    hasPhantom,
    hasEmailSignIn: HAS_PRIVY,
    connect,
    connectWithEmail,
    signOut,
    installUrl: PHANTOM_INSTALL_URL,
  };
}

/**
 * One session for the whole page.
 *
 * `useWallet` was a plain hook with four independent callers, each fetching /api/session on
 * mount and holding its own copy of the answer. Signing in through one left the others still
 * showing a signed-out state until a navigation, and signing out of one left the rest believing
 * there was still a wallet. There is one session; there should be one copy of it.
 */
const WalletContext = createContext<WalletState | null>(null);

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const state = useWalletState();
  return <WalletContext.Provider value={state}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletState {
  const shared = useContext(WalletContext);
  if (!shared) throw new Error("useWallet needs a WalletProvider above it");
  return shared;
}
