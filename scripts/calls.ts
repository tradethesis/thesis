import { readFile } from "node:fs/promises";
import { sql } from "../src/server/db/client";
import { refreshCalls, startEditorialCalls } from "../src/server/calls/service";

async function main() {
  const action = process.argv[2];
  if (action === "migrate") {
    await sql.unsafe(await readFile("src/server/calls/schema.sql", "utf8"));
    console.log("Call table and immutable-record guard installed.");
  } else if (action === "start") console.log(await startEditorialCalls());
  else if (action === "refresh") console.log(await refreshCalls());
  else throw new Error("Usage: tsx scripts/calls.ts migrate|start|refresh");
}
main().catch(e => { console.error(e.message); process.exitCode = 1; }).finally(() => sql.end());
