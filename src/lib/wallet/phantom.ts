/**
 * Phantom's injected provider, typed by hand.
 *
 * No wallet SDK. @phantom/react-sdk is the embedded/connect product and drags in an auth
 * provider surface we do not want, and @solana/wallet-adapter is twenty-odd packages to
 * support one wallet. The interface below is already on the page.
 *
 * signTransaction, never signAndSendTransaction: Jupiter broadcasts, we must not.
 */

export type SolanaSignInData = {
  domain: string;
  address?: string;
  statement: string;
  uri: string;
  version: "1";
  chainId: string;
  nonce: string;
  issuedAt: string;
  expirationTime?: string;
};

export type PhantomProvider = {
  isPhantom?: boolean;
  publicKey?: { toBase58(): string } | null;
  connect(options?: { onlyIfTrusted?: boolean }): Promise<{ publicKey: { toBase58(): string } }>;
  disconnect(): Promise<void>;
  signIn?(data: SolanaSignInData): Promise<{
    address: { toBase58(): string } | string;
    signature: Uint8Array;
    signedMessage: Uint8Array;
  }>;
  signMessage(message: Uint8Array, encoding?: string): Promise<{ signature: Uint8Array }>;
  signTransaction<T>(transaction: T): Promise<T>;
  on(event: "connect" | "disconnect" | "accountChanged", handler: (arg: unknown) => void): void;
  off?(event: string, handler: (arg: unknown) => void): void;
};

declare global {
  interface Window {
    phantom?: { solana?: PhantomProvider };
    solana?: PhantomProvider;
  }
}

export function getPhantom(): PhantomProvider | null {
  if (typeof window === "undefined") return null;
  const provider = window.phantom?.solana ?? (window.solana?.isPhantom ? window.solana : undefined);
  return provider ?? null;
}

export const PHANTOM_INSTALL_URL = "https://phantom.app/download";
