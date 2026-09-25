/**
 * Stop the page behind a dialog from scrolling, without losing where the reader was.
 *
 * `document.body.style.overflow = "hidden"` is the obvious version and it silently throws
 * away the scroll position: a body that stops being scrollable has nowhere to be scrolled
 * to, so the browser snaps it to the top. Opening "See why" on the fortieth card and
 * closing it put the reader back at the first — which, in a feed, is the whole session.
 *
 * Pinning the body with `position: fixed` and a negative `top` keeps the same pixels on
 * screen, and the position is restored explicitly on release.
 */

let depth = 0;
let saved = 0;

export function lockScroll(): void {
  // Nested dialogs must not each try to save and restore; only the outermost owns it.
  if (depth++ > 0) return;

  saved = window.scrollY;
  const body = document.body;
  body.style.position = "fixed";
  body.style.top = `-${saved}px`;
  body.style.left = "0";
  body.style.right = "0";
  body.style.width = "100%";
}

export function unlockScroll(): void {
  if (depth === 0) return;
  if (--depth > 0) return;

  const body = document.body;
  body.style.position = "";
  body.style.top = "";
  body.style.left = "";
  body.style.right = "";
  body.style.width = "";
  // Twice, and the second one matters. Closing a <dialog> hands focus back to the button
  // that opened it, and the browser scrolls that button into view — after this handler
  // runs. Restoring again on the next frame lands after that and wins.
  // Instant, not smooth: this is a restoration, not a movement the reader asked for.
  const to = saved;
  window.scrollTo({ top: to, behavior: "instant" as ScrollBehavior });
  requestAnimationFrame(() => window.scrollTo({ top: to, behavior: "instant" as ScrollBehavior }));
}
