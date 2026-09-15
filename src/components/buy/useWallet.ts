"use client";

import { useCallback, useEffect, useState } from "react";
import { getPhantom, PHANTOM_INSTALL_URL, type PhantomProvider } from "@/lib/wallet/phantom";

/**
 * Connect a wallet and hold a session.
 *
 * Two steps, and they are different things: connecting tells the page which address the
 * wallet holds, signing in proves the visitor controls it. Only the second lets the server
 * write anything (TH-06).
 */

export type ExecutionMode = "live" | "simulation";

export type WalletState = {
  wallet: string | null;
  executionMode: ExecutionMode;
  connecting: boolean;
  signingIn: boolean;
  error: string | null;
  hasPhantom: boolean;
  connect: () => Promise<void>;
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

export function useWallet(): WalletState {
  const [wallet, setWallet] = useState<string | null>(null);
  const [executionMode, setExecutionMode] = useState<ExecutionMode>("simulation");
  const [connecting, setConnecting] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasPhantom, setHasPhantom] = useState(true);

  // Pick up an existing session on load so a refresh does not ask for another signature.
  useEffect(() => {
    setHasPhantom(getPhantom() !== null);
    api<{ wallet: string | null; executionMode: ExecutionMode }>("/api/session")
      .then((s) => {
        setWallet(s.wallet);
        setExecutionMode(s.executionMode);
      })
      .catch(() => {});
  }, []);

  const connect = useCallback(async () => {
    setError(null);
    const provider: PhantomProvider | null = getPhantom();
    if (!provider) {
      setHasPhantom(false);
      setError("Phantom is not installed in this browser.");
      return;
    }

    setConnecting(true);
    try {
      const { publicKey } = await provider.connect();
      const address = publicKey.toBase58();
      setConnecting(false);
      setSigningIn(true);

      const challenge = await api<{ message: string }>("/api/session/challenge", {
        method: "POST",
        body: JSON.stringify({ wallet: address }),
      });

      // signIn is Phantom's native SIWS and shows a readable prompt. Older builds do not
      // have it, so fall back to signing the same text as a message.
      let signature: string;
      let signedMessage: string;
      const bs58 = (await import("bs58")).default;

      if (provider.signIn) {
        const result = await provider.signIn({
          domain: window.location.host,
          uri: window.location.origin,
          statement: challenge.message.split("\n")[3],
          version: "1",
          chainId: "solana:mainnet",
          nonce: challenge.message.match(/^Nonce: (.+)$/m)![1],
          issuedAt: challenge.message.match(/^Issued At: (.+)$/m)![1],
          expirationTime: challenge.message.match(/^Expiration Time: (.+)$/m)![1],
          address,
        });
        signature = bs58.encode(result.signature);
        signedMessage = new TextDecoder().decode(result.signedMessage);
      } else {
        const result = await provider.signMessage(new TextEncoder().encode(challenge.message), "utf8");
        signature = bs58.encode(result.signature);
        signedMessage = challenge.message;
      }

      const verified = await api<{ wallet: string }>("/api/session/verify", {
        method: "POST",
        body: JSON.stringify({ wallet: address, signature, signedMessage }),
      });
      setWallet(verified.wallet);

      const session = await api<{ executionMode: ExecutionMode }>("/api/session");
      setExecutionMode(session.executionMode);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setConnecting(false);
      setSigningIn(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    await api("/api/session", { method: "DELETE" }).catch(() => {});
    setWallet(null);
  }, []);

  return {
    wallet,
    executionMode,
    connecting,
    signingIn,
    error,
    hasPhantom,
    connect,
    signOut,
    installUrl: PHANTOM_INSTALL_URL,
  };
}
