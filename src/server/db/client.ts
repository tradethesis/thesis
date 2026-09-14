import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "../env";
import * as schema from "./schema";

/**
 * postgres.js, not the Neon HTTP driver: the execution state machine needs real
 * interactive transactions (BEGIN … COMMIT), which the HTTP driver cannot do.
 * On Vercel this points at Neon's pooled connection string with max: 1.
 */
declare global {
  // eslint-disable-next-line no-var
  var __thesisSql: ReturnType<typeof postgres> | undefined;
}

function createClient() {
  return postgres(env.databaseUrl(), {
    max: process.env.VERCEL ? 1 : 10,
    idle_timeout: 20,
    connect_timeout: 10,
    onnotice: () => {},
  });
}

export const sql = globalThis.__thesisSql ?? createClient();
if (process.env.NODE_ENV !== "production") globalThis.__thesisSql = sql;

export const db = drizzle(sql, { schema });
export { schema };
