import { CALL_RULES, plainStatement, type CallRecord } from "@/lib/calls";
import { CallStatus } from "./CallStatus";

function date(value: string) {
  return new Date(value).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }) + " UTC";
}
export function CallPanel({ call }: { call: CallRecord | null }) {
  return <section className="call-panel" id="prediction" aria-labelledby="prediction-title">
    <div className="call-panel-heading"><p className="ln-eyebrow">The time-bound call</p><span>Fixed at publication</span></div>
    <h2 id="prediction-title">{call ? plainStatement(call.statement) : "A prediction with a finish line."}</h2>
    <CallStatus call={call} />
    {call && <dl className="call-dates"><div><dt>Started</dt><dd><time dateTime={call.startsAt}>{date(call.startsAt)}</time></dd></div><div><dt>Deadline</dt><dd><time dateTime={call.endsAt}>{date(call.endsAt)}</time></dd></div><div><dt>Last updated</dt><dd><time dateTime={call.latest.observedAt}>{date(call.latest.observedAt)}</time></dd></div></dl>}
    <details className="call-rules"><summary>How the call is scored <span aria-hidden="true">+</span></summary><p>{call?.rules ?? CALL_RULES}</p><p>Prices come from live Jupiter quotes and refresh once a day. A price that looks unreliable is skipped rather than guessed.</p><p>The deadline only scores the idea. It never sells your holdings and pays no prize. A new version of the thesis starts a new call.</p><a href="https://developers.jup.ag/api-reference/swap/quote" target="_blank" rel="noopener noreferrer">Quote source: Jupiter ↗</a></details>
  </section>;
}
