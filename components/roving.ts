// Arrow-key movement for the site's tab lists and option strips (WAI-ARIA tabs / listbox pattern): one Tab stop for the
// group (the selected item has tabIndex 0, the rest -1), arrows move and select, Home / End jump to the ends. Selection
// follows focus, which suits these: every target is a cheap, in-page switch.
import type { KeyboardEvent } from "react";

const NEXT = new Set(["ArrowRight", "ArrowDown"]), PREV = new Set(["ArrowLeft", "ArrowUp"]);

/** onKeyDown for the group element; `selector` picks its items. */
export function rovingKeys(e: KeyboardEvent<HTMLElement>, selector = "[role='tab']") {
  if (!NEXT.has(e.key) && !PREV.has(e.key) && e.key !== "Home" && e.key !== "End") return;
  const items = Array.from(e.currentTarget.querySelectorAll<HTMLElement>(selector)).filter((el) => !el.hasAttribute("disabled"));
  const i = items.indexOf(document.activeElement as HTMLElement);
  if (i < 0 || !items.length) return;
  e.preventDefault();
  const n = items.length;
  const to = e.key === "Home" ? 0 : e.key === "End" ? n - 1 : (i + (NEXT.has(e.key) ? 1 : -1) + n) % n;
  items[to].focus();
  items[to].click();
}

/** tabIndex for an item of a roving group. */
export const rovingIndex = (selected: boolean) => (selected ? 0 : -1);
