"use client";

import { useEffect, useRef } from "react";
import { getIdentityToken, useLinkAccount, useLogin, usePrivy } from "@privy-io/react-auth";
import { useExportWallet, useSignMessage, useSignTransaction, useWallets } from "@privy-io/react-auth/solana";

import { setPrivySigner } from "@/lib/wallet/privy-signer";

/**
 * Publishes Privy's signer to the rest of the app.
 *
 * Renders nothing. It exists so that exactly one component in the tree calls Privy's hooks,
 * and that component is guaranteed to be inside the provider — the hooks throw otherwise,
 * and the provider is loaded lazily.
 */
export function PrivyBridge() {
  const { ready, authenticated, login, logout, user, linkEmail, linkPasskey } = usePrivy();
  const { wallets } = useWallets();
  const { signMessage } = useSignMessage();
  const { signTransaction } = useSignTransaction();
  const { exportWallet } = useExportWallet();

  /*
   * X sign-in that reports what happened.
   *
   * Privy's `login` and `linkTwitter` return nothing; the outcome arrives through callbacks, and a
   * closed modal arrives as the error code `exited_auth_flow`. The gift page needs to tell
   * "cancelled — your gift is still here" apart from "failed", so the promise below is settled by
   * those callbacks. The ref holds the one outstanding resolver; there is only ever one modal.
   */
  const pending = useRef<((outcome: "ok" | "cancelled" | "failed") => void) | null>(null);
  const settle = (outcome: "ok" | "cancelled" | "failed") => {
    pending.current?.(outcome);
    pending.current = null;
  };
  const { login: loginFlow } = useLogin({
    onComplete: () => settle("ok"),
    onError: (code) => settle(code === "exited_auth_flow" ? "cancelled" : "failed"),
  });
  const { linkTwitter: linkFlow } = useLinkAccount({
    onSuccess: () => settle("ok"),
    onError: (code) => settle(code === "exited_link_flow" || code === "exited_auth_flow" ? "cancelled" : "failed"),
  });

  const embedded = wallets[0] ?? null;
  const address = embedded?.address ?? null;

  useEffect(() => {
    if (!ready) return;

    setPrivySigner({
      authenticated,
      address,
      twitterHandle: user?.twitter?.username ?? null,
      getIdentityToken: async () => (authenticated ? getIdentityToken() : null),
      recoveryMethods: [
        ...(user?.email ? (["email"] as const) : []),
        ...(user?.linkedAccounts?.some((a) => a.type === "passkey") ? (["passkey"] as const) : []),
        ...(user?.google ? (["google"] as const) : []),
      ],
      linkEmail,
      linkPasskey: () => linkPasskey(),
      exportWallet: async () => {
        if (!embedded) throw new Error("No Solana wallet on this account yet.");
        await exportWallet({ address: embedded.address });
      },
      loginWithX: () =>
        new Promise<"ok" | "cancelled" | "failed">((resolve) => {
          if (authenticated && user?.twitter) return resolve("ok");
          pending.current?.("cancelled"); // a stale modal never resolves later over a new one
          pending.current = resolve;
          if (authenticated) linkFlow();
          else loginFlow({ loginMethods: ["twitter"] });
        }),
      login: async () => {
        login();
      },
      logout: async () => {
        await logout();
      },
      signMessage: async (message) => {
        if (!embedded) throw new Error("No Solana wallet on this account yet.");
        // Only ever our own sign-in challenge (establishSession), after the person signed in with X
        // or email. No Privy window: it would be a second tap between "Open it" and the pack.
        const { signature } = await signMessage({ message, wallet: embedded, options: { uiOptions: { showWalletUIs: false } } });
        return signature;
      },
      signTransaction: async (transaction) => {
        if (!embedded) throw new Error("No Solana wallet on this account yet.");
        // No Privy window. The person already approved the amounts on our review screen, and the
        // server checked this exact order (policy.ts) before handing it over. Privy's window also
        // simulates through a public RPC that fails in the browser, which greyed out its Approve
        // button, and it would appear once per holding.
        const { signedTransaction } = await signTransaction({ transaction, wallet: embedded, options: { uiOptions: { showWalletUIs: false } } });
        return signedTransaction;
      },
    });

    return () => setPrivySigner(null);
  }, [ready, authenticated, address, embedded, login, logout, signMessage, signTransaction, user, linkEmail, linkPasskey, exportWallet, loginFlow, linkFlow]);

  return null;
}
