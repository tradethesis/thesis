/**
 * The accounts the catalogue sources from.
 *
 * Named, not discovered. A thesis should start from somebody whose judgement was chosen,
 * and a follower count is not judgement — every handle here is one a person decided to
 * read, and removing one is as deliberate as adding it.
 *
 * Each was confirmed to exist and to be the account it claims through the public mirror on
 * 18 September 2026, with the follower count recorded at that moment so a later swap to a
 * lookalike handle is visible as a discontinuity rather than invisible.
 */

export type Source = {
  handle: string;
  name: string;
  /** Why this account is worth sourcing from, in one line. */
  beat: string;
  /** Followers when the handle was verified. A record, never a ranking input. */
  followersAtCheck: number;
};

export const SOURCES: Source[] = [
  { handle: "@rajgokal", name: "Raj Gokal", beat: "Solana co-founder; network throughput and ecosystem direction", followersAtCheck: 2_310_133 },
  { handle: "@weremeow", name: "meow", beat: "Jupiter; onchain trading, routing and market structure", followersAtCheck: 716_842 },
  { handle: "@SOLBigBrain", name: "SOL Big Brain", beat: "Solana venture; balanced reads on the state of the market", followersAtCheck: 308_425 },
  { handle: "@Austin_Federa", name: "Austin Federa", beat: "Solana infrastructure and protocol economics", followersAtCheck: 187_214 },
  { handle: "@blknoiz06", name: "Ansem", beat: "Onchain trading and crypto market narrative", followersAtCheck: 1_413_065 },
  { handle: "@RyanWatkins_", name: "Ryan Watkins", beat: "Syncracy; crypto and equities research", followersAtCheck: 88_952 },
  { handle: "@kylascan", name: "Kyla Scanlon", beat: "Macro and markets, written for people rather than desks", followersAtCheck: 204_812 },
  { handle: "@nikitabier", name: "Nikita Bier", beat: "Consumer product and distribution", followersAtCheck: 1_335_511 },

  // Already in the catalogue, and the reason the sourced cards read better than the rest.
  { handle: "@EpochAIResearch", name: "Epoch AI", beat: "Measured AI compute and capital spending", followersAtCheck: 0 },
  { handle: "@amitisinvesting", name: "amit", beat: "Equities, AI capex and the bubble argument", followersAtCheck: 0 },
  { handle: "@naval", name: "Naval", beat: "First-principles questions that turn into theses", followersAtCheck: 0 },
];
