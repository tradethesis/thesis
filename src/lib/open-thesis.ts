"use client";

/**
 * Asking for the thesis drawer, from anywhere.
 *
 * A window event rather than a context, because the things that open the drawer are spread
 * across the layout and both rails while the drawer itself is mounted once at the top. A
 * provider wrapping all of that would have to wrap the whole app, and the last component
 * that wrapped the whole app turned off server rendering for the site.
 */

export const OPEN_THESIS = "thesis:open";

export function openThesis(slug: string): void {
  window.dispatchEvent(new CustomEvent(OPEN_THESIS, { detail: slug }));
}

/**
 * Turns a link to /t/<slug> into a drawer, without breaking the link.
 *
 * The href stays real and the route stays real, so middle-click, copy-link, open-in-new-tab
 * and a visit with no JavaScript all still work. Only a plain left click is intercepted —
 * the same rule the buy modal already uses, and the reason the buy modal is safe to put on
 * a whole tile.
 */
export function drawerLinkProps(slug: string): {
  href: string;
  onClick: (event: React.MouseEvent<HTMLAnchorElement>) => void;
} {
  return {
    href: `/t/${slug}`,
    onClick: (event) => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
      event.preventDefault();
      openThesis(slug);
    },
  };
}
