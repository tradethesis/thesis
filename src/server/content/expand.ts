import { ALLOWLIST } from "../assets/allowlist";

/**
 * Turning the short form into a publishable thesis.
 *
 * The creation form asks for four things: the claim, the basket, why it works and why it
 * might not. A publishable thesis needs more than that — a role, a case and a limitation for
 * every holding, a change-my-mind condition, a summary — and asking a person to type thirty
 * fields is how you get nobody writing anything at all.
 *
 * So the model writes the scaffolding and the person owns the argument. The claim, the
 * basket, the weights, the case for and the case against all come from the human and are
 * passed through untouched. What the model produces is the per-holding detail and the
 * falsifier, and every one of those is shown before anything is published.
 *
 * It cannot invent a holding, cannot change a weight, and cannot soften the counterargument:
 * those fields are copied from the input after the model answers, not taken from its reply.
 * The model filling in a weaker objection than the author wrote would be the one failure this
 * whole product cannot survive.
 */

const MODEL = "anthropic/claude-sonnet-4.5";
const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

export type ShortDraft = {
  claim: string;
  category: string;
  why: string;
  against: string;
  holdings: { symbol: string; weightPercent: number }[];
};

export type Expanded = {
  summary: string;
  rationale: string;
  changeMyMind: string;
  weightRationale: string;
  holdings: { symbol: string; role: string; why: string; limitation: string }[];
};

export class ExpandError extends Error {}

function prompt(draft: ShortDraft): string {
  const names = new Map(ALLOWLIST.map((a) => [a.symbol, a.company]));
  const basket = draft.holdings
    .map((h) => `  ${h.symbol} (${names.get(h.symbol) ?? h.symbol}) at ${h.weightPercent}%`)
    .join("\n");

  // The model has no clock and will happily set a deadline in the past — an early draft
  // asked readers to check something "by Q4 2025" in September 2026. A falsifier with a date
  // that has already passed is not a falsifier.
  const today = new Date().toISOString().slice(0, 10);

  return `Today is ${today}.

Somebody has written an investment thesis on Thesis, a site where a belief is expressed
as a basket of tokenized stocks. They gave the claim, the basket and both sides of the argument.
Write the supporting detail the site requires.

CLAIM: ${draft.claim}
CATEGORY: ${draft.category}

BASKET:
${basket}

THEIR CASE FOR:
${draft.why}

THEIR CASE AGAINST:
${draft.against}

Write, in their voice, as the author rather than about them:
- a two-sentence summary a reader sees before the argument
- a rationale that expands their case for, staying strictly within what they argued — do not
  introduce a reason they did not give
- for each holding: a role of three or four words, why that holding expresses this claim, and
  a real limitation of that holding for this thesis
- a change-my-mind condition: one specific, observable, checkable event that would genuinely
  falsify the claim, with a deadline that is in the FUTURE relative to today's date above —
  between six and eighteen months from now. Never name a quarter or year that has passed.
- why these weights rather than equal ones, referring to the actual weights above

Every limitation must be a real weakness, not a hedge. Never claim the basket is guaranteed,
diversified, or low risk. Answer with JSON only:

{
  "summary": "...",
  "rationale": "...",
  "changeMyMind": "...",
  "weightRationale": "...",
  "holdings": [{ "symbol": "...", "role": "...", "why": "...", "limitation": "..." }]
}`;
}

export async function expandDraft(draft: ShortDraft, apiKey: string): Promise<Expanded> {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json", "x-title": "Thesis creation" },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 2000,
      // Low: this expands an argument somebody already made. It is not asked to have ideas.
      temperature: 0.3,
      messages: [{ role: "user", content: prompt(draft) }],
    }),
    signal: AbortSignal.timeout(60_000),
  });

  if (!res.ok) throw new ExpandError(`The drafting service answered ${res.status}. Try again in a moment.`);

  const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const text = body.choices?.[0]?.message?.content ?? "";
  const json = text.match(/\{[\s\S]*\}/);
  if (!json) throw new ExpandError("The drafting service did not answer usefully. Try again.");

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(json[0]);
  } catch {
    throw new ExpandError("The drafting service did not answer usefully. Try again.");
  }

  const str = (key: string, min: number, max: number): string => {
    const v = parsed[key];
    const s = typeof v === "string" ? v.trim() : "";
    if (s.length < min) throw new ExpandError(`The draft came back without a usable ${key}. Try again.`);
    return s.slice(0, max);
  };

  const rows = Array.isArray(parsed.holdings) ? (parsed.holdings as Record<string, unknown>[]) : [];
  const bySymbol = new Map(rows.map((r) => [String(r.symbol ?? "").trim(), r]));

  // Built from the author's basket, never from the model's. A model that dropped a holding or
  // renamed one must not be able to change what is bought.
  const holdings = draft.holdings.map((h) => {
    const row = bySymbol.get(h.symbol);
    const pick = (key: string, min: number, fallback: string): string => {
      const v = row?.[key];
      const s = typeof v === "string" ? v.trim() : "";
      return s.length >= min ? s.slice(0, 600) : fallback;
    };
    return {
      symbol: h.symbol,
      role: pick("role", 3, "Holding in this basket").slice(0, 40),
      why: pick("why", 30, `${h.symbol} is part of how this author expresses the claim.`),
      limitation: pick(
        "limitation",
        30,
        `${h.symbol} can fall for reasons unrelated to this claim, and can be wrong even when the claim is right.`,
      ),
    };
  });

  return {
    summary: str("summary", 40, 400),
    rationale: str("rationale", 80, 2000),
    changeMyMind: str("changeMyMind", 30, 800),
    weightRationale: str("weightRationale", 20, 600),
    holdings,
  };
}

/**
 * The case for and the case against, drafted from a one-line belief and the holdings — used only by
 * the gift pack builder, where asking a sender for two paragraphs was too much to ask of somebody
 * choosing a present. /app/create still asks the author to write both. The case against is asked
 * for plainly and must be substantive: a thesis on Thesis always says what would make it wrong.
 */
export async function draftCase(input: { claim: string; holdings: { symbol: string; weightPercent: number }[] }, apiKey: string): Promise<{ why: string; against: string }> {
  const companies = input.holdings.map((h) => {
    const a = ALLOWLIST.find((x) => x.symbol === h.symbol);
    return `${h.symbol} (${a?.company ?? h.symbol}), ${h.weightPercent}%`;
  });
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json", "x-title": "Thesis gift pack" },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 700,
      temperature: 0.3,
      messages: [{
        role: "user",
        content: `Somebody is giving a friend a small basket of tokenized stocks, with this one-line belief:
"${input.claim}"
Holdings: ${companies.join("; ")}.

Write two short plain-English paragraphs, no hype, no price targets, no advice:
- "why": how each holding gets paid if the belief is right (120-400 characters).
- "against": the most serious way the belief or these holdings could be wrong (100-400 characters).
Answer with JSON only: {"why": "...", "against": "..."}`,
      }],
    }),
    signal: AbortSignal.timeout(45_000),
  });
  if (!res.ok) throw new ExpandError(`The drafting service answered ${res.status}. Try again in a moment.`);
  const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const json = (body.choices?.[0]?.message?.content ?? "").match(/\{[\s\S]*\}/);
  let parsed: Record<string, unknown> = {};
  try {
    parsed = json ? JSON.parse(json[0]) : {};
  } catch {
    /* handled below */
  }
  const why = typeof parsed.why === "string" ? parsed.why.trim().slice(0, 1200) : "";
  const against = typeof parsed.against === "string" ? parsed.against.trim().slice(0, 1200) : "";
  if (why.length < 80 || against.length < 60) throw new ExpandError("The drafting service did not answer usefully. Try again.");
  return { why, against };
}
