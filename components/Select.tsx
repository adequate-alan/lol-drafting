"use client";
// Shared dropdown for every filter menu (alan, 2026-10-10): replaces native <select> so menus match the site in both
// themes. APG "select-only combobox": focus stays on the trigger, options are tracked with aria-activedescendant.
// The menu is portalled and fixed-positioned so toolbars and tables never clip it; it flips above the trigger when
// there is more room there and scrolls internally.
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";

export type SelectOption = { value: string; label: string };

export type MenuPos = { left: number; width: number; maxHeight: number; top?: number; bottom?: number };

const MENU_MAX = 300;
const ROW = 26;
const GAP = 4;
const EDGE = 8;

/**
 * Where a dropdown menu goes under (or over) its trigger: below when it fits or below is roomier, else above; never
 * narrower than the trigger, kept inside the viewport, scrolling inside past `MENU_MAX`. Shared by every dropdown
 * (Select here, PinPicker in components/PlayerPicker.tsx) so they open, flip and size the same way.
 */
export function menuPlace(r: DOMRect, rows: number, minWidth = 160, maxWidth = Infinity): MenuPos {
  const vw = window.innerWidth, vh = window.innerHeight;
  const natural = Math.min(MENU_MAX, rows * ROW + 6);
  const below = vh - r.bottom - GAP - EDGE, above = r.top - GAP - EDGE;
  const width = Math.min(Math.max(r.width, minWidth), maxWidth, vw - 2 * EDGE);
  const left = Math.min(Math.max(r.left, EDGE), vw - width - EDGE);
  if (below >= natural || below >= above) return { left, width, top: r.bottom + GAP, maxHeight: Math.min(MENU_MAX, below) };
  return { left, width, bottom: vh - r.top + GAP, maxHeight: Math.min(MENU_MAX, above) };
}

export function Select({ label, value, options, onChange, showLabel = false, className = "" }: {
  /** Accessible name; shown above the trigger when showLabel is set. */
  label: string;
  value: string;
  /** The first option is usually the "All …" option with value "". */
  options: SelectOption[];
  onChange: (value: string) => void;
  showLabel?: boolean;
  className?: string;
}) {
  const id = useId();
  const labelId = `${id}-label`, listId = `${id}-list`, optId = (i: number) => `${id}-opt-${i}`;
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState<MenuPos | null>(null);
  const typed = useRef({ text: "", at: 0 });

  const selectedIndex = Math.max(0, options.findIndex((o) => o.value === value));
  const current = options[selectedIndex];

  const place = useCallback(() => {
    const el = trigger.current;
    if (!el) return;
    setPos(menuPlace(el.getBoundingClientRect(), options.length));
  }, [options.length]);

  const openMenu = (index = selectedIndex) => { setActive(index); setOpen(true); };
  const close = (refocus = true) => { setOpen(false); setPos(null); if (refocus) trigger.current?.focus(); };
  const choose = (index: number) => {
    const o = options[index];
    if (o && o.value !== value) onChange(o.value);
    close();
  };

  useLayoutEffect(() => { if (open) place(); }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!trigger.current?.contains(t) && !list.current?.contains(t)) close(false);
    };
    const onScroll = (e: Event) => { if (e.target !== list.current) place(); };
    document.addEventListener("pointerdown", onPointer);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", place);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", place);
    };
  }, [open, place]);

  useEffect(() => {
    if (open && pos) (list.current?.children[active] as HTMLElement | undefined)?.scrollIntoView({ block: "nearest" });
  }, [open, pos, active]);

  const typeahead = (key: string) => {
    const now = Date.now();
    typed.current = { text: now - typed.current.at > 600 ? key : typed.current.text + key, at: now };
    const q = typed.current.text.toLowerCase();
    const start = open ? active : selectedIndex;
    // A repeated single letter cycles to the next match; a longer string refines from the current one.
    const from = q.length > 1 ? start : start + 1;
    for (let k = 0; k < options.length; k++) {
      const j = (from + k) % options.length;
      if (options[j].label.toLowerCase().startsWith(q)) return j;
    }
    return -1;
  };

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    const last = options.length - 1;
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) { e.preventDefault(); openMenu(); }
      else if (e.key === "Home") { e.preventDefault(); openMenu(0); }
      else if (e.key === "End") { e.preventDefault(); openMenu(last); }
      else if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const i = typeahead(e.key);
        if (i >= 0) openMenu(i);
      }
      return;
    }
    const move = (i: number) => { e.preventDefault(); setActive(Math.min(last, Math.max(0, i))); };
    switch (e.key) {
      case "ArrowDown": return move(active + 1);
      case "ArrowUp": return e.altKey ? (e.preventDefault(), choose(active)) : move(active - 1);
      case "Home": return move(0);
      case "End": return move(last);
      case "PageDown": return move(active + 10);
      case "PageUp": return move(active - 10);
      case "Enter": case " ": e.preventDefault(); return choose(active);
      // Escape only closes the menu; stopPropagation keeps an open drawer from closing too.
      case "Escape": e.preventDefault(); e.stopPropagation(); return close();
      case "Tab": return close(false);
      default:
        if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
          const i = typeahead(e.key);
          if (i >= 0) { e.preventDefault(); setActive(i); }
        }
    }
  };

  const isSet = value !== "" && value !== options[0]?.value;
  const button = (
    <button ref={trigger} type="button" role="combobox" className={`select-trigger ${isSet ? "is-set" : ""} ${showLabel ? "" : className}`.trim()}
      aria-haspopup="listbox" aria-expanded={open} aria-controls={listId}
      aria-activedescendant={open ? optId(active) : undefined}
      {...(showLabel ? { "aria-labelledby": labelId } : { "aria-label": label })}
      data-value={value} onClick={() => (open ? close() : openMenu())} onKeyDown={onKeyDown}>
      <span className="select-value">{current?.label ?? ""}</span>
      <svg className="select-chevron" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 3.5 5 6.5 8 3.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
    </button>
  );

  const menu = open && pos && createPortal(
    <ul ref={list} id={listId} role="listbox" className={`select-menu ${pos.bottom != null ? "above" : ""}`.trim()} tabIndex={-1}
      {...(showLabel ? { "aria-labelledby": labelId } : { "aria-label": label })}
      style={{ left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom, maxHeight: pos.maxHeight }}>
      {options.map((o, i) => (
        <li key={o.value} id={optId(i)} role="option" aria-selected={i === selectedIndex} data-value={o.value}
          className={`select-option ${i === active ? "is-active" : ""}`.trim()}
          onMouseDown={(e) => e.preventDefault()} onMouseMove={() => i !== active && setActive(i)} onClick={() => choose(i)}>
          <svg className="select-check" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 5.2 4.2 7.4 8 2.8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
          <span className="select-label">{o.label}</span>
        </li>
      ))}
    </ul>,
    document.body,
  );

  return showLabel ? (
    <div className={`select-field ${className}`.trim()}>
      <span id={labelId}>{label}</span>
      {button}
      {menu}
    </div>
  ) : (
    <>
      {button}
      {menu}
    </>
  );
}
