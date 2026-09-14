import { publishAll } from "./publish";

async function main() {
  const allowUnsourced = process.env.ALLOW_UNSOURCED_SEED === "1";
  if (allowUnsourced) {
    console.warn("⚠  ALLOW_UNSOURCED_SEED=1 — publishing without the required evidence links.");
    console.warn("   Local development only. Do not deploy a catalogue seeded this way.\n");
  }

  const results = await publishAll({ allowUnsourced });
  for (const r of results) {
    console.log(`  ${r.action.padEnd(12)} v${r.version}  ${r.slug}`);
  }
  process.exit(0);
}

main().catch((error) => {
  console.error(`\n${error instanceof Error ? error.message : error}\n`);
  process.exit(1);
});
