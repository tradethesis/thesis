import { env } from "../env";

/**
 * Solana JSON-RPC client.
 *
 * Two rules carried over from ~/copy-desk/desk.py, both of which were written after an
 * incident rather than before one:
 *
 *  1. A failed read returns null, never zero. An RPC outage and an empty wallet look
 *     identical to a caller that cannot tell them apart, and treating the first as the
 *     second is how a desk decides it has diverged.
 *  2. The public fallback serves reads only. `sendTransaction` is deliberately absent
 *     from the allowlist — a write that silently lands on a different endpoint is a
 *     duplicate waiting to happen.
 */

const FALLBACK_OK = new Set([
  "getSignaturesForAddress",
  "getTransaction",
  "getAccountInfo",
  "getMultipleAccounts",
  "getTokenAccountsByOwner",
  "getTokenAccountBalance",
  "getBalance",
  "getSlot",
  "getBlockHeight",
  "getSignatureStatuses",
  "getLatestBlockhash",
  "isBlockhashValid",
]);

const TRANSIENT_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

export class RpcError extends Error {
  constructor(
    message: string,
    readonly transient: boolean,
  ) {
    super(message);
    this.name = "RpcError";
  }
}

type RpcOptions = { retries?: number; timeoutMs?: number; allowFallback?: boolean };

let requestId = 0;

async function callOnce(url: string, method: string, params: unknown[], timeoutMs: number): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: (requestId += 1), method, params }),
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) {
      throw new RpcError(`${method} http ${res.status}`, TRANSIENT_STATUS.has(res.status));
    }
    const body = (await res.json()) as { result?: unknown; error?: { code: number; message: string } };
    if (body.error) {
      // -32602 invalid params and friends are our bug, not the network's.
      const transient = body.error.code <= -32000 && body.error.code > -32100;
      throw new RpcError(`${method} rpc error ${body.error.code}: ${body.error.message}`, transient);
    }
    return body.result ?? null;
  } finally {
    clearTimeout(timer);
  }
}

export async function rpc<T>(method: string, params: unknown[] = [], options: RpcOptions = {}): Promise<T> {
  const retries = options.retries ?? 4;
  const timeoutMs = options.timeoutMs ?? 12_000;
  const allowFallback = (options.allowFallback ?? true) && FALLBACK_OK.has(method);

  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const useFallback = allowFallback && attempt === retries && retries > 0;
    const url = useFallback ? env.rpcFallbackUrl() : env.rpcUrl();
    try {
      return (await callOnce(url, method, params, timeoutMs)) as T;
    } catch (error) {
      lastError = error;
      const transient = error instanceof RpcError ? error.transient : true;
      if (!transient || attempt === retries) break;
      await new Promise((resolve) => setTimeout(resolve, Math.min(2_000, 150 * 2 ** attempt)));
    }
  }
  throw lastError;
}

/** Reads that must distinguish "we could not tell" from "the answer is zero". */
export async function tryRpc<T>(method: string, params: unknown[] = [], options: RpcOptions = {}): Promise<T | null> {
  try {
    return await rpc<T>(method, params, options);
  } catch {
    return null;
  }
}

export type ParsedMintExtension = { extension: string; state?: Record<string, unknown> };

export type ParsedMint = {
  owner: string;
  decimals: number;
  supply: string;
  extensions: ParsedMintExtension[];
};

export async function getParsedMint(mint: string): Promise<ParsedMint | null> {
  const result = await rpc<{
    value: {
      owner: string;
      data: { parsed: { info: { decimals: number; supply: string; extensions?: ParsedMintExtension[] } } };
    } | null;
  }>("getAccountInfo", [mint, { encoding: "jsonParsed" }]);

  const value = result?.value;
  if (!value || !value.data?.parsed?.info) return null;
  const info = value.data.parsed.info;
  return {
    owner: value.owner,
    decimals: info.decimals,
    supply: info.supply,
    extensions: info.extensions ?? [],
  };
}

export async function getSlot(): Promise<number> {
  return rpc<number>("getSlot");
}
