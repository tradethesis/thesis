"use client";

import { useCallback, useState } from "react";
import { getPhantom, PHANTOM_INSTALL_URL } from "@/lib/wallet/phantom";
import { signWithPhantom } from "@/lib/wallet/transaction";

type OrderResponse = {
  asset: { symbol: string; company: string; mint: string };
  input: { usd: number; amountRaw: string };
  order: Record<string, unknown>;
  verdict: { outcome: string; [k: string]: unknown };
  signers: { index: number; address: string; isUser: boolean; empty: boolean }[];
  messageHash: string | null;
  unsignedB64: string | null;
  error?: string;
};

type Verdict = { ok: boolean; [k: string]: unknown };

const SYMBOLS = ["NVDAx", "MSFTx", "AMZNx", "COINx", "CRCLx", "HOODx", "METAx", "GOOGLx"];

export default function DebugPage() {
  const [wallet, setWallet] = useState<string | null>(null);
  const [symbol, setSymbol] = useState("NVDAx");
  const [usd, setUsd] = useState(25);
  const [order, setOrder] = useState<OrderResponse | null>(null);
  const [signedB64, setSignedB64] = useState<string | null>(null);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const connect = useCallback(async () => {
    setError(null);
    const provider = getPhantom();
    if (!provider) {
      setError(`Phantom not found. Install it at ${PHANTOM_INSTALL_URL} and reload.`);
      return;
    }
    setBusy("connecting");
    try {
      const { publicKey } = await provider.connect();
      setWallet(publicKey.toBase58());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }, []);

  const fetchOrder = useCallback(async () => {
    if (!wallet) return;
    setBusy("ordering");
    setError(null);
    setOrder(null);
    setSignedB64(null);
    setVerdict(null);
    try {
      const res = await fetch(`/api/debug/order?wallet=${wallet}&symbol=${symbol}&usd=${usd}`);
      const data = (await res.json()) as OrderResponse;
      if (!res.ok) throw new Error(data.error ?? "order failed");
      setOrder(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }, [wallet, symbol, usd]);

  const sign = useCallback(async () => {
    const provider = getPhantom();
    if (!provider || !order?.unsignedB64 || !wallet) return;
    setBusy("signing");
    setError(null);
    try {
      const signed = await signWithPhantom(order.unsignedB64, provider);
      setSignedB64(signed);
      const res = await fetch("/api/debug/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ unsignedB64: order.unsignedB64, signedB64: signed, wallet }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "verify failed");
      setVerdict(data.verdict as Verdict);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }, [order, wallet]);

  return (
    <main style={S.page}>
      <header style={S.header}>
        <h1 style={S.h1}>Signing path check</h1>
        <p style={S.lede}>
          Assembles a real mainnet Jupiter order for your wallet and asks Phantom to sign it, then verifies the
          signature server-side. <strong>Nothing is broadcast.</strong> There is no code path from this page to
          Jupiter&rsquo;s execute endpoint, and an empty wallet is enough.
        </p>
      </header>

      <section style={S.step}>
        <div style={S.stepNo}>1</div>
        <div style={S.stepBody}>
          {wallet ? (
            <p style={S.mono}>{wallet}</p>
          ) : (
            <button style={S.button} onClick={connect} disabled={busy !== null}>
              {busy === "connecting" ? "Connecting…" : "Connect Phantom"}
            </button>
          )}
        </div>
      </section>

      <section style={{ ...S.step, opacity: wallet ? 1 : 0.4 }}>
        <div style={S.stepNo}>2</div>
        <div style={S.stepBody}>
          <div style={S.row}>
            <select style={S.input} value={symbol} onChange={(e) => setSymbol(e.target.value)}>
              {SYMBOLS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <input
              style={{ ...S.input, width: 90 }}
              type="number"
              min={5}
              step={5}
              value={usd}
              onChange={(e) => setUsd(Number(e.target.value))}
            />
            <button style={S.button} onClick={fetchOrder} disabled={!wallet || busy !== null}>
              {busy === "ordering" ? "Fetching…" : "Get a real order"}
            </button>
          </div>

          {order && (
            <div style={S.card}>
              <Row label="router" value={`${order.order.router} / ${order.order.swapType}`} />
              <Row label="gasless" value={String(order.order.gasless)} />
              <Row label="fee" value={`${order.order.feeBps} bps`} />
              <Row label="guard" value={order.verdict.outcome} accent={order.verdict.outcome !== "ok"} />
              {order.verdict.outcome !== "ok" && (
                <Row label="reason" value={String(order.verdict.message ?? order.verdict.code)} accent />
              )}
              <Row label="message sha256" value={order.messageHash ?? "—"} />
              {order.signers.length > 0 && (
                <div style={{ marginTop: 10 }}>
                  {order.signers.map((s) => (
                    <div key={s.index} style={S.signer}>
                      <span style={S.slot}>slot {s.index}</span>
                      <span style={S.mono}>{s.address}</span>
                      <span style={s.isUser ? S.you : S.them}>{s.isUser ? "you" : "jupiter"}</span>
                      <span style={S.them}>{s.empty ? "empty" : "signed"}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      <section style={{ ...S.step, opacity: order?.unsignedB64 ? 1 : 0.4 }}>
        <div style={S.stepNo}>3</div>
        <div style={S.stepBody}>
          <button style={S.button} onClick={sign} disabled={!order?.unsignedB64 || busy !== null}>
            {busy === "signing" ? "Waiting for Phantom…" : "Sign (and stop)"}
          </button>

          {verdict && (
            <div style={{ ...S.card, borderColor: verdict.ok ? "#1a7f4b" : "#b42318" }}>
              <Row label="verified" value={verdict.ok ? "yes" : "no"} accent={!verdict.ok} />
              {verdict.ok ? (
                <>
                  <Row label="you signed slot" value={String(verdict.signerIndex)} />
                  <Row label="message unchanged" value="yes — same sha256 as issued" />
                  <Row label="txid derivable now" value={verdict.signatureDerivable ? "yes (Case A)" : "no (Case B)"} />
                  <Row label="your signature" value={String(verdict.takerSignature)} />
                </>
              ) : (
                <Row label="reason" value={String(verdict.message)} accent />
              )}
            </div>
          )}

          {signedB64 && <p style={S.note}>Signed transaction held in memory only. Not sent anywhere.</p>}
        </div>
      </section>

      {error && <p style={S.error}>{error}</p>}
    </main>
  );
}

function Row({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div style={S.kv}>
      <span style={S.k}>{label}</span>
      <span style={{ ...S.v, color: accent ? "#b42318" : "#1c1c1c" }}>{value}</span>
    </div>
  );
}

const mono = "ui-monospace, SFMono-Regular, Menlo, monospace";

const S: Record<string, React.CSSProperties> = {
  page: { maxWidth: 760, margin: "0 auto", padding: "48px 20px 96px", fontFamily: "system-ui, sans-serif", color: "#1c1c1c" },
  header: { marginBottom: 36 },
  h1: { fontSize: 24, fontWeight: 600, margin: "0 0 10px" },
  lede: { fontSize: 15, lineHeight: 1.6, color: "#555", margin: 0 },
  step: { display: "flex", gap: 16, marginBottom: 28, transition: "opacity .2s" },
  stepNo: {
    width: 26, height: 26, borderRadius: 13, background: "#1c1c1c", color: "#fff",
    display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, flexShrink: 0,
  },
  stepBody: { flex: 1, minWidth: 0 },
  row: { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" },
  button: {
    padding: "9px 16px", borderRadius: 8, border: "1px solid #1c1c1c", background: "#1c1c1c",
    color: "#fff", fontSize: 14, cursor: "pointer", minHeight: 44,
  },
  input: { padding: "9px 10px", borderRadius: 8, border: "1px solid #d4d4d4", fontSize: 14, minHeight: 44 },
  card: { marginTop: 14, border: "1px solid #e4e4e4", borderRadius: 10, padding: 14, background: "#fafafa" },
  kv: { display: "flex", gap: 12, padding: "3px 0", fontSize: 13 },
  k: { width: 150, color: "#777", flexShrink: 0 },
  v: { fontFamily: mono, wordBreak: "break-all" },
  signer: { display: "flex", gap: 10, alignItems: "center", fontSize: 12, padding: "3px 0", flexWrap: "wrap" },
  slot: { color: "#777", width: 52, flexShrink: 0 },
  mono: { fontFamily: mono, fontSize: 12, wordBreak: "break-all" },
  you: { color: "#1a7f4b", fontWeight: 600 },
  them: { color: "#999" },
  note: { fontSize: 13, color: "#777", marginTop: 10 },
  error: { color: "#b42318", fontSize: 14, marginTop: 20 },
};
