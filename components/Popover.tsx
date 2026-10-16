"use client";
// The one popover foundation for the site (alan, 2026-10-11): every tooltip, hover card and contextual popover shares
// the `.popover` surface (Gen.G tokens, both themes), the placement below and the hover-intent timings.
//
//   PopoverSurface - a portal positioned against an anchor, measured before paint, kept inside the viewport (flips
//                    below/above or right/left, caps its height and scrolls inside), repositioned on scroll and resize.
//   Popover        - a trigger button plus rich, interactive content: hover opens it, the pointer can travel into it,
//                    click pins it, keyboard Enter pins it and moves focus in, Escape closes and returns focus, touch
//                    opens it as a bottom sheet. Used for Pro evidence and other cards that hold links.
//   TipLayer       - (components/TipLayer.tsx) renders every plain `title` hint on the site in the same surface.
//
// Zero layout shift: nothing here changes the trigger's box; surfaces are fixed-position portals.
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLeave } from "./useLeave";

// Open after a short pause so sweeping the pointer across a row doesn't flash cards; closing waits a moment so the
// pointer can travel from the trigger into the card.
export const SHOW_MS = 180, SWITCH_MS = 110, HIDE_MS = 160;
const M = 8, GAP = 6;

export type Placement = "below" | "beside";
export interface Place { top: number; left: number; maxHeight?: number }

/**
 * Where a w × h surface goes next to anchor `a`, always inside the viewport and never over the anchor.
 * "beside": right, else left, else below, else above. "below": below, else above, else the roomier of the two with
 * the height capped to it (the surface scrolls inside).
 */
export function place(a: DOMRect, w: number, h: number, side: Placement = "beside", align: "start" | "center" = "start"): Place {
  const vw = window.innerWidth, vh = window.innerHeight;
  const clampY = (y: number) => Math.min(Math.max(M, y), vh - h - M);
  const clampX = (x: number) => Math.min(Math.max(M, x), vw - w - M);
  if (side === "beside") {
    if (a.right + GAP + w + M <= vw) return { left: a.right + GAP, top: clampY(a.top - 4) };
    if (a.left - GAP - w >= M) return { left: a.left - GAP - w, top: clampY(a.top - 4) };
  }
  const left = clampX(align === "center" ? a.left + a.width / 2 - w / 2 : a.left);
  const below = vh - a.bottom - GAP - M, above = a.top - GAP - M;
  if (h <= below) return { left, top: a.bottom + GAP };
  if (h <= above) return { left, top: a.top - GAP - h };
  return below >= above ? { left, top: a.bottom + GAP, maxHeight: below } : { left, top: M, maxHeight: above };
}

/** True on touch-first devices (no hover): popovers open as a bottom sheet there. */
export function useNoHover() {
  const [v, setV] = useState(false);
  useEffect(() => {
    const q = window.matchMedia("(hover: none)");
    setV(q.matches);
    const on = () => setV(q.matches);
    q.addEventListener("change", on);
    return () => q.removeEventListener("change", on);
  }, []);
  return v;
}

/** A fixed-position surface placed against `anchor`. `sheet` renders it as a bottom sheet instead (phones). */
export function PopoverSurface({ anchor, children, className = "", side = "below", align, sheet, onEnter, onLeave, onAway, id, role = "dialog", label, surfaceRef, leaving, onGone }: {
  anchor: HTMLElement; children: React.ReactNode; className?: string; side?: Placement; align?: "start" | "center"; sheet?: boolean;
  onEnter?: () => void; onLeave?: () => void; onAway?: () => void; id?: string; role?: "dialog" | "tooltip"; label?: string;
  surfaceRef?: React.RefObject<HTMLDivElement | null>;
  /** Playing its exit (components/useLeave.ts): no pointer, no focus, out of the accessibility tree; `onGone` ends it. */
  leaving?: boolean; onGone?: (e: React.AnimationEvent) => void;
}) {
  const own = useRef<HTMLDivElement>(null);
  const ref = surfaceRef ?? own;
  const [pos, setPos] = useState<Place>();
  const away = useRef(onAway);
  away.current = onAway;

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el || sheet || leaving) return;
    const a = anchor.getBoundingClientRect();
    // The anchor scrolled out of view (or left the page): close rather than float over unrelated content.
    if (!anchor.isConnected || a.bottom < 0 || a.top > window.innerHeight) { away.current?.(); return; }
    // scrollHeight is the content's full height whatever the current cap, so capping never feeds back into placement.
    setPos(place(a, el.offsetWidth, el.scrollHeight + 2, side, align));
  }, [anchor, side, align, sheet, ref, leaving]);

  useLayoutEffect(measure, [measure]);
  useEffect(() => {
    if (sheet) return;
    const el = ref.current;
    const ro = new ResizeObserver(() => measure());
    if (el) for (const c of Array.from(el.children)) ro.observe(c);
    // Scrolling inside the surface itself is not a reason to move it.
    const onScroll = (e: Event) => { if (!(e.target instanceof Node && el?.contains(e.target))) measure(); };
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", onScroll, { capture: true, passive: true });
    return () => { ro.disconnect(); window.removeEventListener("resize", measure); window.removeEventListener("scroll", onScroll, { capture: true }); };
  }, [measure, sheet, ref]);

  const style: React.CSSProperties | undefined = sheet ? undefined
    : pos ? { top: pos.top, left: pos.left, maxHeight: pos.maxHeight } : { top: 0, left: 0, visibility: "hidden" };
  return createPortal(
    <>
      {sheet && <div className={`popover-scrim ${leaving ? "leaving" : ""}`.trim()} onClick={leaving ? undefined : onAway} aria-hidden="true" />}
      <div ref={ref} id={leaving ? undefined : id} role={role} tabIndex={role === "dialog" && !leaving ? -1 : undefined} aria-label={label} aria-modal={sheet && !leaving ? true : undefined}
        aria-hidden={leaving || undefined} inert={leaving || undefined} className={`popover ${sheet ? "sheet" : ""} ${className} ${leaving ? "leaving" : ""}`.replace(/ +/g, " ").trim()}
        style={style} onPointerEnter={leaving ? undefined : onEnter} onPointerLeave={leaving ? undefined : onLeave} onAnimationEnd={onGone}>
        {children}
      </div>
    </>,
    document.body,
  );
}

type Mode = "closed" | "hover" | "pinned" | "sheet";
export interface PopoverApi { mode: Exclude<Mode, "closed">; close: () => void; pin: () => void }

/**
 * A trigger with rich, interactive content. `children` renders the content (called only while open).
 * The trigger is a real button, so it is focusable and announces the dialog it opens.
 */
export function Popover({ label, trigger, triggerClass = "", className = "", side = "below", children }: {
  label: string; trigger: React.ReactNode; triggerClass?: string; className?: string; side?: Placement;
  children: (api: PopoverApi) => React.ReactNode;
}) {
  const [mode, setMode] = useState<Mode>("closed");
  const btn = useRef<HTMLButtonElement>(null);
  const surface = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const pointer = useRef<string>("mouse");
  const noHover = useNoHover();
  const id = useId();
  const open = mode !== "closed";

  const clear = () => clearTimeout(timer.current);
  const later = (fn: () => void, ms: number) => { clear(); timer.current = setTimeout(fn, ms); };
  const close = useCallback((refocus = false) => {
    clearTimeout(timer.current);
    setMode("closed");
    if (refocus) btn.current?.focus({ preventScroll: true });
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);

  // Escape closes (and gives focus back when it was inside); a click outside closes a pinned card.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      close(mode !== "hover" || !!surface.current?.contains(document.activeElement));
    };
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (mode !== "hover" && !surface.current?.contains(t) && !btn.current?.contains(t)) close();
    };
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("pointerdown", onDown, true);
    return () => { document.removeEventListener("keydown", onKey, true); document.removeEventListener("pointerdown", onDown, true); };
  }, [open, mode, close]);

  // Pinned by keyboard: focus moves into the card so its links are reachable.
  useEffect(() => {
    if ((mode === "pinned" && pointer.current === "keyboard") || mode === "sheet") {
      // After placement: a surface still hidden for measuring can't take focus.
      const raf = requestAnimationFrame(() => {
        const first = surface.current?.querySelector<HTMLElement>("a[href], button, [tabindex]:not([tabindex='-1'])");
        (first ?? surface.current)?.focus({ preventScroll: true });
      });
      return () => cancelAnimationFrame(raf);
    }
  }, [mode]);

  const leave = () => { if (mode === "hover") later(() => setMode("closed"), HIDE_MS); };
  // The card plays a short exit after closing (its last mode and anchor kept); opening again takes over at once.
  const shownMode = useLeave(open && btn.current ? mode : undefined);
  return (
    <>
      <button ref={btn} type="button" className={`pop-trigger ${triggerClass} ${open ? "is-open" : ""}`.trim()}
        aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? id : undefined}
        onPointerDown={(e) => { pointer.current = e.pointerType; }}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") pointer.current = "keyboard"; }}
        onPointerEnter={(e) => { if (e.pointerType === "mouse" && mode === "closed") later(() => setMode("hover"), SHOW_MS); else clear(); }}
        onPointerLeave={(e) => { if (e.pointerType === "mouse") { if (mode === "closed") clear(); else leave(); } }}
        onFocus={(e) => { if (mode === "closed" && e.currentTarget.matches(":focus-visible")) later(() => setMode("hover"), SHOW_MS); }}
        onBlur={(e) => { if (!surface.current?.contains(e.relatedTarget as Node)) { if (mode === "hover") close(); else if (mode === "closed") clear(); } }}
        onClick={(e) => {
          e.stopPropagation();
          clear();
          if (noHover || pointer.current === "touch" || pointer.current === "pen") { setMode("sheet"); return; }
          setMode((m) => (m === "pinned" ? "closed" : "pinned"));
        }}>
        {trigger}
      </button>
      {shownMode.shown && btn.current && (
        <PopoverSurface anchor={btn.current} id={id} label={label} side={side} sheet={shownMode.shown === "sheet"} surfaceRef={surface}
          className={`${className} ${shownMode.shown}`.trim()} leaving={shownMode.leaving} onGone={shownMode.end}
          onEnter={clear} onLeave={leave} onAway={() => close()}>
          <div className="popover-body"
            // Leaving the card by keyboard closes it, like moving the pointer away.
            onBlur={(e) => { if (mode !== "sheet" && e.relatedTarget && !e.currentTarget.contains(e.relatedTarget as Node) && e.relatedTarget !== btn.current) close(); }}>
            {children({ mode: shownMode.shown as PopoverApi["mode"], close: () => close(true), pin: () => setMode((m) => (m === "hover" ? "pinned" : m)) })}
          </div>
          {shownMode.shown === "sheet" && <button type="button" className="btn sm popover-close" onClick={() => close(true)}>Close</button>}
        </PopoverSurface>
      )}
    </>
  );
}
