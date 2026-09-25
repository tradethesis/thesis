"use client";

import { ThumbsDown, ThumbsUp } from "lucide-react";

import { crowdSplit, type ConvictionScore } from "@/lib/conviction";
import { useConviction } from "@/lib/use-conviction";

/**
 * Back it, or doubt it.
 *
 * The one thing anybody can do here without a wallet. Everything else in this app needs a
 * SIWS session and Phantom specifically, so for a visitor without that extension this is
 * the entire product — which is why it is a plain POST with an anonymous id and no key.
 *
 * Doubting is not decoration. Every thesis publishes its own strongest counterargument, and
 * being able to take that side is the thing this product can offer that a research note
 * cannot. It sits level with backing rather than tucked away as a lesser option.
 *
 * Tapping the side you already hold clears it, so the control is its own undo.
 *
 * Two shapes. `compact` is two icons in the collapsed card's bottom row, level with the
 * post's own engagement figures, which is where a reader's thumb already is. `full` keeps
 * the labelled buttons for the thesis page, where there is room to say what a side means.
 */
export function TakeASide({
  thesisId,
  claim,
  objection,
  counts,
  variant = "full",
}: {
  thesisId: string;
  claim: string;
  /** The thesis's own strongest objection, in one sentence. Only used by the full shape. */
  objection?: string | null;
  counts?: { backing: number; doubting: number };
  variant?: "full" | "compact";
}) {
  const { mine, busy, error, take } = useConviction();
  const held = mine?.get(thesisId);
  const side = held?.side ?? null;
  const working = busy === thesisId;

  const backing = counts?.backing ?? 0;
  const doubting = counts?.doubting ?? 0;
  const split = crowdSplit(backing, doubting);

  if (variant === "compact") {
    return (
      <div className="tas-compact" role="group" aria-label={`Take a side on: ${claim}`}>
        {/*
          Raw counts, never a percentage. The floor governs the split, which is a claim
          about what people think; a count of two is only a count of two and says so.
          A zero is left off rather than printed, so a catalogue nobody has called yet
          reads as untouched rather than as fifty-nine rejections.
        */}
        <button
          type="button"
          className="tas-icon"
          aria-pressed={side === "backing"}
          disabled={working}
          onClick={() => take(thesisId, "backing")}
        >
          <ThumbsUp size={15} aria-hidden="true" />
          {backing > 0 && <span>{backing}</span>}
          <span className="ln-sr-only">{side === "backing" ? "Backing" : "Back it"}</span>
        </button>

        <button
          type="button"
          className="tas-icon tas-icon--doubt"
          aria-pressed={side === "doubting"}
          disabled={working}
          onClick={() => take(thesisId, "doubting")}
        >
          <ThumbsDown size={15} aria-hidden="true" />
          {doubting > 0 && <span>{doubting}</span>}
          <span className="ln-sr-only">{side === "doubting" ? "Doubting" : "Doubt it"}</span>
        </button>

        {error && (
          <span className="tas-error" role="alert">
            {error}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="tas">
      {/*
        The thesis's own objection, above the two buttons, and only before a side is taken.
        It was written for every thesis and then buried in a sheet nobody opens, which left
        "Doubt it" as a thumbs-down instead of a position a reader could actually hold.
        It goes away once you have decided, because by then it has done its job.
      */}
      {objection && !side && <p className="tas-against">{objection}</p>}

      <div className="tas-row">
        <div className="tas-buttons" role="group" aria-label={`Take a side on: ${claim}`}>
          <button
            type="button"
            className="tas-btn"
            aria-pressed={side === "backing"}
            /* Deliberately not disabled while the saved state loads. A dead button is a
               worse lie than an un-pressed one: on a slow connection the only action a
               visitor without a wallet can take would look broken. Taking a side before
               the load lands still writes, because the write is an upsert. */
            disabled={working}
            onClick={() => take(thesisId, "backing")}
          >
            <ThumbsUp size={14} aria-hidden="true" />
            {side === "backing" ? "Backing" : "Back it"}
          </button>

          <button
            type="button"
            className="tas-btn tas-btn--doubt"
            aria-pressed={side === "doubting"}
            disabled={working}
            onClick={() => take(thesisId, "doubting")}
          >
            <ThumbsDown size={14} aria-hidden="true" />
            {side === "doubting" ? "Doubting" : "Doubt it"}
          </button>
        </div>

        {/*
          Shown only past the floor, and never without the count it rests on. A percentage
          built from three people is invented social proof wearing a number.
        */}
        {split.show && (
          <p className="tas-split">
            <strong>{Math.round(split.backingPct)}%</strong> backing · {split.total} calls
          </p>
        )}
      </div>

      {held && !error && <Verdict score={held.score} />}

      {error && (
        <p className="tas-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * How your call is doing — measured from when you made it.
 *
 * "Too early" is said out loud rather than shown as a zero, because a zero reads as a
 * result and this is the absence of one. The window is named every time: somebody who
 * backed a thesis yesterday should never be shown a number built from last month.
 */
function Verdict({ score }: { score: ConvictionScore }) {
  if (score.status === "closed") {
    return <p className="tas-verdict">Basket changed since you called it. Closed at your entry.</p>;
  }

  if (score.status === "unscored") {
    return <p className="tas-verdict">No call runs on this basket, so your side is recorded but not scored.</p>;
  }

  if (score.status === "too_early") {
    return (
      <p className="tas-verdict">
        Too early to score. Readings land once a day{score.observationsSinceEntry ? "" : ", starting with the next one"}.
      </p>
    );
  }

  const edge = score.edgePercent ?? 0;
  const from = score.fromObservedAt
    ? new Date(score.fromObservedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })
    : null;

  return (
    <p className={`tas-verdict is-${score.status}`}>
      <strong className="ln-num">
        {score.status === "level"
          ? "Level"
          : `${score.status === "ahead" ? "Ahead" : "Behind"} ${Math.abs(edge).toFixed(2)}%`}
      </strong>
      <span> on your call{from ? `, from ${from}` : ""}</span>
    </p>
  );
}

/**
 * Your standing on a card you have called, and nothing at all on one you have not.
 *
 * Separate from the buttons because on a collapsed card the two sit in different places:
 * the thumbs go in the bottom row beside the post's figures, and this earns its own line
 * only once there is a result to put on it.
 */
export function YourCall({ thesisId }: { thesisId: string }) {
  const { mine } = useConviction();
  const held = mine?.get(thesisId);
  if (!held) return null;
  return <Verdict score={held.score} />;
}
