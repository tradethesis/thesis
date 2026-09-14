import { config } from "dotenv";

// Next loads .env.local itself; tsx scripts do not. Later files do not override earlier.
config({ path: [".env.local", ".env"] });

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`missing required env var ${name}`);
  return value;
}

export type ExecutionMode = "live" | "simulation";

export const env = {
  databaseUrl: () => required("DATABASE_URL"),
  jupApiKey: () => required("JUP_API_KEY"),
  rpcUrl: () => required("SOLANA_RPC_URL"),
  rpcFallbackUrl: () => process.env.SOLANA_RPC_FALLBACK_URL ?? "https://api.mainnet-beta.solana.com",
  cronSecret: () => required("CRON_SECRET"),

  /**
   * Global kill switch. PRD §10: "If enforcement cannot be verified, live execution
   * stays disabled." Defaults to simulation so a misconfigured deploy cannot spend.
   */
  executionMode: (): ExecutionMode => (process.env.EXECUTION_MODE === "live" ? "live" : "simulation"),

  /**
   * PRD §13: xStocks restricts US, Canada, UK and Australia and puts the obligation on
   * the integrating platform. A public deployment is distribution, so real execution is
   * limited to wallets we have established are eligible. Everyone else gets the same
   * flow, explicitly labelled, with no signature ever requested.
   */
  liveExecutionWallets: (): Set<string> =>
    new Set(
      (process.env.LIVE_EXECUTION_WALLETS ?? "")
        .split(",")
        .map((w) => w.trim())
        .filter(Boolean),
    ),
};

export function executionModeForWallet(wallet: string | null): ExecutionMode {
  if (env.executionMode() !== "live") return "simulation";
  if (!wallet) return "simulation";
  return env.liveExecutionWallets().has(wallet) ? "live" : "simulation";
}
