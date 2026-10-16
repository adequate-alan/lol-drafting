"use client";
// Back and Forward between pages return to where you were (alan, 2026-10-16, interaction polish). Most long lists on
// this site scroll inside their own box (`.table-wrap.tall`, the Pro Builds rail), which the browser never restores on
// an in-app Back, so Pro Drafts, the Champion Pool or Meta used to come back at the top. This layer remembers each
// page's scroll positions by URL while you scroll, and puts them back only when Back / Forward lands on another page.
// In-page history steps (a Pro Drafts game, a drawer) keep their own handling; a fresh link always starts at the top.
import { usePathname } from "next/navigation";
import { useEffect } from "react";

// The scroll boxes worth restoring, in document order. Mark any other with data-keep-scroll.
const SCROLLERS = ".table-wrap.tall, .pick-rail ul, [data-keep-scroll]";
// Content can take a few frames to arrive (lazy chunks, data); give up after this many, or as soon as the user scrolls.
const FRAMES = 45;

interface Saved { win: number; boxes: number[] }
const saved = new Map<string, Saved>();
const here = () => window.location.pathname + window.location.search;

export function ScrollKeeper() {
  const path = usePathname();

  // Record while scrolling (one write per frame).
  useEffect(() => {
    let raf = 0;
    const snap = () => {
      raf = 0;
      saved.set(here(), { win: window.scrollY, boxes: Array.from(document.querySelectorAll<HTMLElement>(SCROLLERS), (el) => el.scrollTop) });
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(snap); };
    // In-page history writes (opening a game, a filter) change the URL without a scroll: following a link records the
    // page as it is, under the URL it has now.
    const onClick = (e: MouseEvent) => { if ((e.target as Element | null)?.closest?.("a[href]")) snap(); };
    window.addEventListener("scroll", onScroll, { capture: true, passive: true });
    document.addEventListener("click", onClick, true);
    return () => { window.removeEventListener("scroll", onScroll, { capture: true }); document.removeEventListener("click", onClick, true); cancelAnimationFrame(raf); };
  }, []);

  // Back / Forward: remember which URL the history step landed on; the page change below restores it.
  useEffect(() => {
    const onPop = () => { pending = { url: here(), at: performance.now() }; };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    const p = pending;
    pending = undefined;
    if (!p || p.url !== here() || performance.now() - p.at > 2000) return;
    const want = saved.get(p.url);
    if (!want) return;
    let frame = 0, raf = 0, stopped = false;
    const stop = () => { stopped = true; cancelAnimationFrame(raf); };
    const step = () => {
      if (stopped) return;
      const boxes = Array.from(document.querySelectorAll<HTMLElement>(SCROLLERS));
      let done = boxes.length >= want.boxes.length;
      want.boxes.forEach((top, i) => {
        const el = boxes[i];
        if (!el) return;
        if (Math.abs(el.scrollTop - top) > 1) el.scrollTop = top;
        if (Math.abs(el.scrollTop - top) > 1) done = false; // not tall enough yet
      });
      if (Math.abs(window.scrollY - want.win) > 1) { window.scrollTo(0, want.win); if (Math.abs(window.scrollY - want.win) > 1) done = false; }
      if (!done && ++frame < FRAMES) raf = requestAnimationFrame(step);
    };
    step();
    // The user taking over ends the restore.
    const opts = { capture: true, passive: true } as const;
    for (const t of ["wheel", "touchstart", "keydown", "pointerdown"]) window.addEventListener(t, stop, opts);
    return () => { stop(); for (const t of ["wheel", "touchstart", "keydown", "pointerdown"]) window.removeEventListener(t, stop, opts); };
  }, [path]);

  return null;
}

let pending: { url: string; at: number } | undefined;
