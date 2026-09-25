import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { GiftPack } from "@/lib/gifts";

import { ClaimScreen } from "./GiftInvitation";

/*
 * Every claim outcome gets its own screen and its own next step.
 *
 * Rendered as markup rather than driven through a browser because reaching these screens for real
 * needs a completed X OAuth sign-in, which cannot be automated honestly. What is proved here is the
 * mapping from the server's answer to what the recipient reads and can do.
 */

const view = { giftId: "g", state: "funded", packId: "ai", amountUsd: 100, senderName: "Ana", note: "hi", intendedHandle: "kayle_build", expired: false };
const pack = {
  id: "ai", versionId: "v", name: "The AI optimist", subtitle: "", forWhom: "", color: "blue", motif: "orbit", edition: "01",
  basketName: "AI Spending Chain", thesisSlug: "ai-spending-keeps-growing", buySlug: "ai-spending-keeps-growing", claim: "c", counterargument: "x",
  holdings: [{ symbol: "NVDAx", company: "NVIDIA", weightBps: 10000, why: null }],
} as GiftPack;
const H = (t: string) => <h2>{t}</h2>;
const render = (claim: Parameters<typeof ClaimScreen>[0]["claim"]) =>
  renderToStaticMarkup(<ClaimScreen claim={claim} view={view} pack={pack} token="tok" H={H} onSwitch={() => {}} onRetry={() => {}} />);

describe("claim screens", () => {
  it("reserved: confirms identity and opens the pack in place, with no checkout page", () => {
    const html = render({ status: "reserved" });
    expect(html).toContain("It’s yours");
    expect(html).toContain("Open the pack");
    expect(html).not.toContain("/buy/");
  });

  it("wrong account: names both accounts and offers to switch, and explains renames", () => {
    const html = render({ status: "wrong_x_account", signedInAs: "impostor", intended: "kayle_build" });
    expect(html).toContain("@impostor");
    expect(html).toContain("@kayle_build");
    expect(html).toContain("Sign in with another X account");
    expect(html).toMatch(/renamed/);
  });

  it("no X account: asks to link X", () => {
    expect(render({ status: "no_x_account" })).toContain("Link X");
  });

  it("wallet mismatch: refuses to deliver elsewhere and routes to support", () => {
    const html = render({ status: "wallet_mismatch" });
    expect(html).toContain("won’t send it anywhere else");
  });

  it("opening switched off: the USDC is already theirs", () => {
    expect(render({ status: "eligibility_unavailable" })).toContain("$100 USDC is already in your wallet");
  });

  it("already claimed, allocation unavailable, not funded, provider missing: each says what is true", () => {
    expect(render({ status: "already_claimed" })).toContain("already been opened");
    expect(render({ status: "allocation_unavailable" })).toContain("isn’t tradable");
    expect(render({ status: "not_funded", state: "funding_pending" })).toContain("isn’t ready yet");
    expect(render({ status: "unavailable", missing: [] })).toContain("isn’t switched on here yet");
  });

  /* After opening: confirmed holdings, the aim shown separately, and an exit that does not pretend. */
  const opened = {
    status: "opened" as const, partial: true, claimedAt: null, destinationWallet: "W",
    holdings: [{ mint: "m", symbol: "NVDAx", company: "NVIDIA", amount: "0.52", signature: "SIG123" }],
  };

  /* The tear plays over confirmed holdings, and until it has, they are not on the page at all. */
  it("opened: tears the pack first, before showing what is inside", () => {
    // The tear stage takes the whole screen through a portal once mounted in the browser, so the
    // server render has nothing on the page — and, above all, no holdings before the tear.
    const html = render(opened);
    expect(html).not.toContain("0.52 NVDAx");
    expect(html).not.toContain("Opened");
  });

  it("opened: shows confirmed holdings with proof and a disabled, explained exit", () => {
    const html = renderToStaticMarkup(
      <ClaimScreen claim={opened} view={view} pack={null} token="tok" H={H} onSwitch={() => {}} onRetry={() => {}} />,
    );
    expect(html).toContain("<strong>0.52</strong><span>NVDAx held</span>");
    expect(html).toContain("https://solscan.io/tx/SIG123");
    expect(html).toContain("Opened — partly");
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Sell for USDC/);
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Withdraw to a bank/);
    expect(html).toContain("Selling gives you USDC, not money in a bank");
    // Never modelled performance presented as their result.
    expect(html).not.toMatch(/P&amp;L|profit|return of/i);
  });
});
