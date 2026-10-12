"use client";
// Player filter for the Pro Builds page (alan, 2026-10-12): type to find a player, and pin the players you follow.
// Pins are a per-browser convenience kept in localStorage (the site has no accounts); pinned players are listed first
// and marked in the game strip. Reuses the shared dropdown's surface (.select-trigger / .select-menu).
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";

const KEY = "pro-builds:pinned-players";
const EVENT = "pro-builds:pins";

const readPins = (): string[] => {
  try { const v = JSON.parse(localStorage.getItem(KEY) ?? "[]"); return Array.isArray(v) ? v.filter((x) => typeof x === "string") : []; }
  catch { return []; }
};

/** Pinned player names, saved in this browser and shared by every picker on the page. */
export function usePins() {
  const [pins, setPins] = useState<string[]>([]);
  useEffect(() => {
    const sync = () => setPins(readPins());
    sync();
    window.addEventListener("storage", sync);
    window.addEventListener(EVENT, sync);
    return () => { window.removeEventListener("storage", sync); window.removeEventListener(EVENT, sync); };
  }, []);
  const toggle = (name: string) => {
    const next = readPins().includes(name) ? readPins().filter((p) => p !== name) : [...readPins(), name];
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* private mode: pins last for this page only */ }
    setPins(next);
    window.dispatchEvent(new Event(EVENT));
  };
  return { pins, isPinned: (name: string) => pins.includes(name), toggle };
}

export function PinIcon({ on }: { on: boolean }) {
  return (
    <svg className={`pin-icon ${on ? "on" : ""}`} viewBox="0 0 12 12" aria-hidden="true">
      <path d="M6 1.2 7.45 4.2 10.7 4.6 8.3 6.85 8.9 10.1 6 8.5 3.1 10.1 3.7 6.85 1.3 4.6 4.55 4.2z" />
    </svg>
  );
}

/** A typeable player filter: "" means all players. `players` are the names in the current scope. */
export function PlayerPicker({ value, players, onChange }: { value: string; players: string[]; onChange: (v: string) => void }) {
  const id = useId();
  const { isPinned, toggle } = usePins();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);

  const q = query.trim().toLowerCase();
  const sorted = [...players].sort((a, b) => Number(isPinned(b)) - Number(isPinned(a)) || a.localeCompare(b));
  const shown = q ? sorted.filter((p) => p.toLowerCase().includes(q)) : sorted;
  const options = q ? shown : ["", ...shown]; // "" = all players

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) close(); };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);
  useEffect(() => { (list.current?.children[active] as HTMLElement | undefined)?.scrollIntoView({ block: "nearest" }); }, [active, open]);

  const close = () => { setOpen(false); setQuery(""); };
  const pick = (v: string) => { if (v !== value) onChange(v); close(); input.current?.blur(); };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive((i) => Math.min(options.length - 1, i + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); if (open && options[active] !== undefined) pick(options[active]); else setOpen(true); }
    else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); }
    else if (e.key === "Tab") close();
  };

  const listId = `${id}-list`;
  return (
    <div ref={box} className="player-picker">
      <div className={`select-trigger ${value ? "is-set" : ""}`} onClick={() => { setOpen(true); input.current?.focus(); }}>
        {value && !query && isPinned(value) && <PinIcon on />}
        <input ref={input} type="text" role="combobox" aria-label="Player" aria-autocomplete="list" aria-expanded={open} aria-controls={listId}
          aria-activedescendant={open && options.length ? `${id}-${active}` : undefined}
          placeholder={value || "All players"} value={query} spellCheck={false} autoComplete="off"
          onFocus={() => { setOpen(true); setActive(Math.max(0, options.indexOf(value))); }}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); setActive(0); }} onKeyDown={onKey} />
        <svg className="select-chevron" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 3.5 5 6.5 8 3.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </div>
      {open && (
        <ul ref={list} id={listId} role="listbox" aria-label="Players" className="select-menu player-menu">
          {options.map((p, i) => (
            <li key={p || "all"} id={`${id}-${i}`} role="option" aria-selected={p === value} data-value={p}
              className={`select-option ${i === active ? "is-active" : ""} ${p && isPinned(p) && !isPinned(options[i + 1] ?? "") && options[i + 1] ? "last-pinned" : ""}`.trim()}
              onMouseDown={(e) => e.preventDefault()} onMouseMove={() => i !== active && setActive(i)} onClick={() => pick(p)}>
              <span className="select-label">{p || "All players"}</span>
              {p && (
                <button type="button" className="pin-btn" aria-pressed={isPinned(p)} aria-label={`${isPinned(p) ? "Unpin" : "Pin"} ${p}`}
                  title={isPinned(p) ? "Pinned: listed first, saved in this browser" : "Pin this player"}
                  onMouseDown={(e) => e.preventDefault()} onClick={(e) => { e.stopPropagation(); toggle(p); }}>
                  <PinIcon on={isPinned(p)} />
                </button>
              )}
            </li>
          ))}
          {!options.length && <li className="select-option empty">No player matches “{query}”</li>}
        </ul>
      )}
    </div>
  );
}
