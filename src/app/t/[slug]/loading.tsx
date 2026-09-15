import "../../landing.css";
import "./thesis.css";

/**
 * Shown the instant a thesis link is clicked.
 *
 * Without this, Next renders nothing until the page is ready, so a slow navigation is
 * indistinguishable from a dead link — which is exactly how it was reported. Even now the
 * pages are prerendered, a cold edge or a slow connection should never look like nothing
 * happened.
 */
export default function Loading() {
  return (
    <div className="landing">
      <main className="ln-container td-main">
        <div className="td-skeleton" aria-live="polite" aria-busy="true">
          <span className="ln-sr-only">Loading thesis…</span>
          <div className="td-sk td-sk--meta" />
          <div className="td-sk td-sk--title" />
          <div className="td-sk td-sk--title td-sk--short" />
          <div className="td-sk td-sk--line" />
          <div className="td-sk td-sk--line" />
          <div className="td-sk td-sk--line td-sk--short" />
          <div className="td-sk td-sk--art" />
        </div>
      </main>
    </div>
  );
}
