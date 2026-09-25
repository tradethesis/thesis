/**
 * Two more arguments for an allocation that already exists.
 *
 *   pnpm tsx scripts/seed-basket-arguments.ts          # dry run
 *   pnpm tsx scripts/seed-basket-arguments.ts --apply
 *
 * The basket parent exists so that several people can argue for the same holdings for different
 * reasons. Nothing in the catalogue demonstrated that: all ten published theses happen to hold
 * ten distinct allocations, so a backfill produced ten baskets with one argument each.
 *
 * These two are written to the **exact** allocation of "Enterprise AI Trust" — MSFTx 34 /
 * GOOGLx 33 / AMZNx 33 — and go through `publishSeed` like everything else, which means
 * `classifyAllocation` sees the exact match and attaches them rather than refusing them. That is
 * the feature working, not a fixture pretending it works.
 *
 * Two things they are honest about:
 *
 *   - They are **Thesis editorial**. They are not attributed to any X author, and nobody who
 *     posted about these companies is implied to endorse this allocation or to have written a
 *     word of this.
 *   - They **cite no external sources**. The catalogue's two-source floor is met by a person
 *     checking live URLs, and nobody has checked any for these. Rather than attach links that
 *     look like citations and are not, they carry none and the disclosure says so.
 *
 * They also disagree with each other, which is the point. One says the moat is indemnity; the
 * other says indemnity is a commodity and the moat is distribution. A basket that only carried
 * agreeing arguments would be a basket with one argument and three bylines.
 */

import { EDITORIAL, publishSeed, publishedBaskets } from "../src/server/content/publish";
import type { ThesisSeed } from "../src/server/content/theses";

const APPLY = process.argv.includes("--apply");

const DISCLOSURE =
  "Written by the Thesis team to show several readings of one allocation. It cites no external " +
  "sources and has not been through source verification. The team holds no position in these " +
  "companies or their tokenized shares and is paid nothing by any of them.";

/** The allocation of Enterprise AI Trust, stated exactly. An approximation would make a basket. */
const HOLDINGS: [string, number][] = [
  ["MSFTx", 3400],
  ["GOOGLx", 3300],
  ["AMZNx", 3300],
];

const ARGUMENTS: ThesisSeed[] = [
  {
    slug: "distribution-decides-who-sells-the-model",
    title: "Distribution decides who sells the model",
    claim: "Distribution decides who sells the model",
    category: "Technology",
    summary:
      "The model layer is converging and the indemnity everyone is paying for is becoming table stakes. What is left is who already has the customer, the contract and the billing relationship.",
    rationale:
      "A frontier model is a component, and components commoditise. What does not commoditise is a signed enterprise agreement, an existing security review, a procurement process somebody has already been through, and a bill the customer is already paying. All three of these companies sell software to the same buyer they would sell inference to, through a channel that exists. That is why the same three keep appearing under different arguments about AI: the argument changes and the distribution does not.",
    counterargument:
      "Distribution is exactly what a genuinely better model routes around. Buyers moved to the cloud in the first place by going around incumbent vendors, and a development team that wants a specific model will expense it without asking procurement. If capability gaps widen rather than close, the customer relationship is worth less than the thing the customer actually wants, and these three become resellers of somebody else's advantage at a reseller's margin.",
    changeMyMind:
      "A frontier lab reaching material enterprise revenue by March 2028 without going through a hyperscaler's marketplace or reselling agreement.",
    horizonLabel: "18 months",
    reviewDate: "2027-03-21",
    weightRationale:
      "Held at the allocation's existing weights. This argument is about which companies, not about which of them leans hardest.",
    constituents: HOLDINGS.map(([symbol, weightBps], position) => ({
      symbol,
      position,
      weightBps,
      role:
        position === 0 ? "Enterprise channel" : position === 1 ? "Consumer reach" : "Developer default",
      why:
        position === 0
          ? "It already bills most large enterprises monthly, which is the relationship an inference invoice arrives through."
          : position === 1
            ? "It reaches consumers directly and does not need anybody's procurement process to ship a model to them."
            : "It is where a large share of new applications are built, so its default is the one most teams never change.",
      limitation:
        position === 0
          ? "Enterprise relationships are slow to lose and also slow to expand; a strong channel does not guarantee a growing one."
          : position === 1
            ? "Consumer reach monetises through advertising, which is cyclical and answers to a different question than AI spending."
            : "Being the default for building is not the same as capturing what gets built, and margins on undifferentiated capacity are thin.",
    })),
  },
  {
    slug: "the-depreciation-schedule-is-the-real-story",
    title: "The depreciation schedule is the real story",
    claim: "The depreciation schedule is the real story",
    category: "Technology",
    summary:
      "These three are buying assets that lose value on a fixed schedule whether or not demand arrives. The question is not who wins AI; it is whose existing profits can absorb the write-down if it disappoints.",
    rationale:
      "Datacenter hardware depreciates on a schedule set at purchase, and that schedule runs regardless of utilisation. A company funding it out of a large, dull, existing profit pool can carry a disappointing year as a smaller margin. A company funding it out of a narrative cannot. Owning these three is less a bet that AI revenue arrives on time and more a bet that if it does not, these are the balance sheets that absorb it without a financing event.",
    counterargument:
      "This reasoning would have talked somebody out of every genuine platform shift on record, because the early years of one always look like overspending. Treating durability as the deciding factor systematically underweights whoever is actually winning, and a basket chosen for its ability to survive a disappointment is a basket that will lag badly if there is no disappointment. It also assumes the depreciation schedules are honest, and useful lives get extended precisely when the write-down would be inconvenient.",
    changeMyMind:
      "Any of the three extending the stated useful life of its datacenter hardware, or taking an impairment on it, in a filing before March 2028.",
    horizonLabel: "18 months",
    reviewDate: "2027-03-21",
    weightRationale:
      "Held at the allocation's existing weights. This argument is about the risk being carried, not about re-ranking the three.",
    constituents: HOLDINGS.map(([symbol, weightBps], position) => ({
      symbol,
      position,
      weightBps,
      role: position === 0 ? "Deepest absorber" : position === 1 ? "Advertising cushion" : "Retail cushion",
      why:
        position === 0
          ? "Its software margins are large and recurring enough to carry several disappointing quarters of capacity spending."
          : position === 1
            ? "Advertising throws off cash that is unrelated to whether this year's capacity gets used."
            : "Retail and logistics profits are unglamorous and durable, which is exactly what absorbing a write-down needs.",
      limitation:
        position === 0
          ? "A deep profit pool makes overspending survivable, which also makes it easier to keep doing."
          : position === 1
            ? "Advertising is cyclical, so the cushion is thinnest in precisely the downturn that would expose the spending."
            : "Retail margins are thin, so the cushion is wide rather than deep and a sustained write-down still shows.",
    })),
  },
];

async function main() {
  const attribution = { ...EDITORIAL, disclosure: DISCLOSURE };

  if (!APPLY) {
    const existing = await publishedBaskets();
    console.log(`${ARGUMENTS.length} arguments to publish against ${HOLDINGS.map(([s, w]) => `${s} ${w / 100}%`).join(" / ")}\n`);
    for (const a of ARGUMENTS) console.log(`  ${a.slug}\n    ${a.claim}`);
    console.log(`\n${existing.length} baskets already published. Nothing written. Re-run with --apply.`);
    process.exit(0);
  }

  for (const seed of ARGUMENTS) {
    // allowUnsourced because these carry no citations and say so. Every other gate — the weight
    // rules, the counterargument, the change-my-mind condition, the per-holding limitation —
    // applies exactly as it does to the rest of the catalogue.
    const result = await publishSeed(seed, [], { attribution, allowUnsourced: true });
    console.log(`  ${result.action.padEnd(12)} ${result.slug}`);
  }
  process.exit(0);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
