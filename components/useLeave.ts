"use client";
// Exits for surfaces that arrive (alan, 2026-10-16, interaction polish): closing should feel as natural as opening, so a
// hover card, popover, tip or dropdown menu keeps its last content mounted for its short exit (`.leaving`, the
// --dur-pop-out token in app/globals.css) instead of vanishing. Re-opening during the exit takes over at once.
import { useEffect, useState } from "react";

// Only a safety net: the surface's own animationend normally ends the exit first (sheets run --dur-panel-out).
const FALLBACK = 240;

/**
 * `value` is what the surface shows while open (undefined when closed). Returns what to render: the live value, or the
 * last one while `leaving`; call `end` from the surface's onAnimationEnd.
 */
export function useLeave<T>(value: T | undefined) {
  const [kept, setKept] = useState<T | undefined>(value);
  const [leaving, setLeaving] = useState(false);
  // Adjusted during render, so the surface never misses a frame between open and leaving.
  if (value !== undefined && (kept !== value || leaving)) { setKept(value); setLeaving(false); }
  if (value === undefined && kept !== undefined && !leaving) setLeaving(true);
  useEffect(() => {
    if (!leaving) return;
    const t = setTimeout(() => { setKept(undefined); setLeaving(false); }, FALLBACK);
    return () => clearTimeout(t);
  }, [leaving]);
  // Ignores the entrance's animationend and any child's, which bubble to the surface too.
  const end = (e?: { target: EventTarget; currentTarget: EventTarget }) => {
    if (leaving && (!e || e.target === e.currentTarget)) { setKept(undefined); setLeaving(false); }
  };
  return { shown: value ?? (leaving ? kept : undefined), leaving: value === undefined && leaving, end };
}
