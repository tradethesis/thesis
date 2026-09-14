/**
 * Evidence links, kept apart from the editorial copy because they are the part that has to
 * be checked rather than written.
 *
 * PRD §6: a publishable version carries at least two relevant sources, each with a date and
 * a short note on why it is relevant. Nothing goes in here that has not been fetched and
 * confirmed to say what the note claims it says. An unverified link is worse than no link:
 * it looks like a citation.
 */

export type EvidenceLink = {
  url: string;
  title: string;
  source: string;
  /** ISO date, or null when the page carries no clear one. Never guessed. */
  publishedAt: string | null;
  /** What this specific source establishes. */
  relevance: string;
  kind: "primary" | "secondary";
  /** Set when the link is evidence the thesis may be wrong. */
  supportsCounterargument?: boolean;
};

export const EVIDENCE: Record<string, EvidenceLink[]> = {
  "financial-activity-moves-onchain": [],
  "digital-advertising-takes-a-bigger-share": [],
  "ai-spending-keeps-growing": [],
};

export const MIN_EVIDENCE_LINKS = 2;
