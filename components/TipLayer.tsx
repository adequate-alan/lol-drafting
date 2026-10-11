"use client";
// Site-wide themed tooltips for plain-text hints. Markup keeps writing `title="…"` (screen readers still read it as the
// element's description); this layer renders it in the shared `.popover.tip` surface instead of the browser's gray
// bubble: after a short hover with a mouse, on keyboard focus, or on a tap of a non-interactive element on touch.
// While the themed tip owns an element, its `title` is parked so the native bubble never shows on top; it is put back
// as soon as the pointer leaves. Rich or interactive content uses <Popover> (components/Popover.tsx) instead.
import { useEffect, useState } from "react";
import { PopoverSurface } from "./Popover";

const SHOW_MS = 350, SWITCH_MS = 60;
const INTERACTIVE = "a[href], button, input, select, textarea, summary, label, [role='button'], [role='tab'], [tabindex]:not([tabindex='-1'])";

export function TipLayer() {
  const [tip, setTip] = useState<{ el: HTMLElement; text: string }>();
  useEffect(() => {
    const parked = new WeakMap<Element, string>();
    let current: HTMLElement | undefined;
    let shown = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const restore = (el: HTMLElement) => {
      const t = parked.get(el);
      parked.delete(el);
      // React may have written a new title meanwhile; keep that one.
      if (t != null && !el.hasAttribute("title")) el.setAttribute("title", t);
    };
    const hide = () => {
      clearTimeout(timer);
      if (current) restore(current);
      current = undefined;
      shown = false;
      setTip(undefined);
    };
    const show = (el: HTMLElement, text: string, park: boolean, delay: number) => {
      if (current && current !== el) restore(current);
      if (park) { parked.set(el, text); el.removeAttribute("title"); }
      current = el;
      clearTimeout(timer);
      timer = setTimeout(() => { shown = true; setTip({ el, text: text.trim() }); }, delay);
    };
    const titled = (t: EventTarget | null) => (t instanceof Element ? t.closest<HTMLElement>("[title]") : null);

    const over = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      if (current?.contains(e.target as Node)) {
        // Inside the current element, a nested title takes over.
        const inner = titled(e.target);
        if (!inner || inner === current || !current.contains(inner)) return;
      }
      const el = titled(e.target);
      if (!el) { if (current) hide(); return; }
      const text = el.getAttribute("title") ?? "";
      if (!text.trim()) return;
      show(el, text, true, shown ? SWITCH_MS : SHOW_MS);
    };
    const out = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" || !current) return;
      const to = e.relatedTarget as Node | null;
      if (!to || !current.contains(to)) hide();
    };
    const focusIn = (e: FocusEvent) => {
      const el = e.target instanceof HTMLElement && e.target.matches(":focus-visible") ? e.target : null;
      const text = el?.getAttribute("title");
      if (el && text?.trim()) show(el, text, false, SWITCH_MS);
    };
    const down = (e: PointerEvent) => {
      const el = titled(e.target);
      // Touch has no hover: a tap on plain text with a hint shows it; a tap on a control does what the control does.
      if (e.pointerType !== "mouse" && el && !el.closest(INTERACTIVE) && el !== current) {
        show(el, el.getAttribute("title") ?? "", false, 0);
        return;
      }
      hide();
    };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape" && current) hide(); };
    document.addEventListener("pointerover", over);
    document.addEventListener("pointerout", out);
    document.addEventListener("focusin", focusIn);
    document.addEventListener("focusout", hide);
    document.addEventListener("pointerdown", down, true);
    document.addEventListener("keydown", key);
    window.addEventListener("scroll", hide, { capture: true, passive: true });
    return () => {
      hide();
      document.removeEventListener("pointerover", over);
      document.removeEventListener("pointerout", out);
      document.removeEventListener("focusin", focusIn);
      document.removeEventListener("focusout", hide);
      document.removeEventListener("pointerdown", down, true);
      document.removeEventListener("keydown", key);
      window.removeEventListener("scroll", hide, { capture: true });
    };
  }, []);
  if (!tip) return null;
  return (
    <PopoverSurface anchor={tip.el} role="tooltip" className="tip" align="center" onAway={() => setTip(undefined)}>
      {tip.text}
    </PopoverSurface>
  );
}
