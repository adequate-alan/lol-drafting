"use client";
// Typeable filters for the Pro Builds page (alan, 2026-10-12): type to find a player, team or tournament, and pin the
// ones you follow. Pins are a per-browser convenience kept in localStorage (the site has no accounts), one list per kind;
// pinned entries are listed first and marked in the game strip. Reuses the shared dropdown's surface
// (.select-trigger / .select-menu).
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { menuPlace, type MenuPos } from "@/components/Select";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { ChampIcon } from "@/components/ui";
import { isLegacyPin, migratePins, togglePin } from "@/lib/pinned-players";
import type { BuildRow } from "@/lib/pro-builds";

// Players are pinned by Gol.gg player id (names kept beside them for display); teams by name, tournaments by event id.
// Pro Drafts (alan, 2026-10-13) shares the team and tournament pins and adds champions (by id) and series (by name).
export type PinKind = "player" | "team" | "event" | "champion" | "series";
const KEYS: Record<PinKind, string> = {
  player: "pro-builds:pinned-players", team: "pro-builds:pinned-teams", event: "pro-builds:pinned-tournaments",
  champion: "pro-drafts:pinned-champions", series: "pro-drafts:pinned-series",
};
const EVENT = "pro-builds:pins";
const NAMES = "pro-builds:pinned-player-names"; // { id: name } as last seen, to label a pin before the data loads

const readNames = (): Record<string, string> => {
  try { const v = JSON.parse(localStorage.getItem(NAMES) ?? "{}"); return v && typeof v === "object" && !Array.isArray(v) ? v : {}; }
  catch { return {}; }
};
const save = (kind: PinKind, pins: string[], names?: Record<string, string>) => {
  try {
    localStorage.setItem(KEYS[kind], JSON.stringify(pins));
    if (names) localStorage.setItem(NAMES, JSON.stringify(names));
  } catch { /* private mode: pins last for this page only */ }
  window.dispatchEvent(new Event(EVENT));
};

const readPins = (kind: PinKind): string[] => {
  try { const v = JSON.parse(localStorage.getItem(KEYS[kind]) ?? "[]"); return Array.isArray(v) ? v.filter((x) => typeof x === "string") : []; }
  catch { return []; }
};

/** Pinned players (or teams, or tournament ids), saved in this browser and shared by every picker on the page. */
export function usePins(kind: PinKind = "player") {
  const [pins, setPins] = useState<string[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  useEffect(() => {
    const sync = () => { setPins(readPins(kind)); if (kind === "player") setNames(readNames()); };
    sync();
    window.addEventListener("storage", sync);
    window.addEventListener(EVENT, sync);
    return () => { window.removeEventListener("storage", sync); window.removeEventListener(EVENT, sync); };
  }, [kind]);
  /** Pin or unpin; `label` (a player's name) is kept so the pin can be named before the build data loads. */
  const toggle = (value: string, label?: string) => {
    const next = togglePin(readPins(kind), value);
    const n = kind === "player" ? { ...readNames(), ...(label ? { [value]: label } : {}) } : undefined;
    if (n && !next.includes(value)) delete n[value];
    setPins(next);
    save(kind, next, n);
  };
  return { pins, names, isPinned: (value: string) => pins.includes(value), toggle };
}

/** Moves player pins saved by name (before ids) to player ids once the build rows are loaded. */
export function useMigratePlayerPins(rows: BuildRow[] | undefined) {
  useEffect(() => {
    if (!rows) return;
    const stored = readPins("player");
    if (!stored.some(isLegacyPin)) return;
    const next = migratePins(stored, rows);
    const names = readNames();
    for (const id of next) if (!names[id]) { const r = rows.find((x) => String(x.build.playerId) === id); if (r) names[id] = r.build.player; }
    save("player", next, names);
  }, [rows]);
}

export function PinIcon({ on }: { on: boolean }) {
  return (
    <svg className={`pin-icon ${on ? "on" : ""}`} viewBox="0 0 12 12" aria-hidden="true">
      <path d="M6 1.2 7.45 4.2 10.7 4.6 8.3 6.85 8.9 10.1 6 8.5 3.1 10.1 3.7 6.85 1.3 4.6 4.55 4.2z" />
    </svg>
  );
}

const NOUN: Record<PinKind, [string, string]> = {
  player: ["Player", "players"], team: ["Team", "teams"], event: ["Tournament", "tournaments"], champion: ["Champion", "champions"], series: ["Series", "series"],
};

/**
 * A typeable, pinnable filter: "" means all. `options` are [value, label] in the current scope (a tournament is pinned
 * by its event id and shown by its name).
 */
export function PinPicker({ kind, value, options: entries, onChange, placeholder }: {
  kind: PinKind; value: string; options: [string, string][]; onChange: (v: string) => void; placeholder?: string;
}) {
  // Players show their portrait (or initials) and champions their icon beside the name; the rest show text only.
  const avatar = (v: string) => (!v ? null : kind === "player" ? <PlayerAvatar id={v} name={labelOf.get(v) ?? v} size="xs" />
    : kind === "champion" ? <ChampIcon id={v} name={labelOf.get(v) ?? v} size="xs" /> : null);
  const id = useId();
  const { isPinned, toggle } = usePins(kind);
  const [noun, plural] = NOUN[kind];
  const labelOf = new Map(entries);
  const label = (v: string) => (v ? labelOf.get(v) ?? v : `All ${plural}`);
  const players = entries.map(([v]) => v);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [pinnedOnly, setPinnedOnly] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<MenuPos | null>(null);

  const q = query.trim().toLowerCase();
  // Pinned first, in the order they had when the menu opened: pinning a row never moves it out from under the pointer.
  const [orderPins, setOrderPins] = useState<string[]>();
  useEffect(() => { setOrderPins(open ? players.filter(isPinned) : undefined); }, [open]);
  const first = (p: string) => (orderPins ? orderPins.includes(p) : isPinned(p));
  const sorted = [...players].filter((p) => !pinnedOnly || isPinned(p) || p === value).sort((a, b) => Number(first(b)) - Number(first(a)) || label(a).localeCompare(label(b)));
  const shown = q ? sorted.filter((p) => label(p).toLowerCase().includes(q)) : sorted;
  const options = q ? shown : ["", ...shown]; // "" = all

  // The menu is the shared dropdown's: portalled, fixed, placed by menuPlace (flips above when below is short), so a
  // toolbar or table never clips it. The side is chosen when it opens and kept while typing narrows the list.
  const side = useRef<"below" | "above">(undefined);
  const placeMenu = useCallback(() => {
    const r = box.current?.querySelector(".select-trigger")?.getBoundingClientRect();
    if (!r) return;
    const next = menuPlace(r, Math.max(options.length, 6) + 1, 150, 280);
    const now = next.top != null ? "below" : "above";
    side.current ??= now;
    if (side.current === now) return setPos(next);
    const room = side.current === "below" ? window.innerHeight - r.bottom - 12 : r.top - 12;
    setPos(side.current === "below" ? { ...next, top: r.bottom + 4, bottom: undefined, maxHeight: Math.min(300, room) }
      : { ...next, top: undefined, bottom: window.innerHeight - r.top + 4, maxHeight: Math.min(300, room) });
  }, [options.length]);
  useLayoutEffect(() => { if (open) placeMenu(); else { setPos(null); side.current = undefined; } }, [open, placeMenu]);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { const t = e.target as Node; if (!box.current?.contains(t) && !menu.current?.contains(t)) close(); };
    const onScroll = (e: Event) => { if (!menu.current?.contains(e.target as Node)) placeMenu(); };
    document.addEventListener("pointerdown", away);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", placeMenu);
    return () => { document.removeEventListener("pointerdown", away); window.removeEventListener("scroll", onScroll, true); window.removeEventListener("resize", placeMenu); };
  }, [open, placeMenu]);
  useEffect(() => { (list.current?.children[active] as HTMLElement | undefined)?.scrollIntoView({ block: "nearest" }); }, [active, open]);

  const close = () => { setOpen(false); setQuery(""); };
  const pick = (v: string) => { if (v !== value) onChange(v); close(); input.current?.blur(); };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive((i) => Math.min(options.length - 1, i + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); if (open && options[active] !== undefined) pick(options[active]); else setOpen(true); }
    // Escape closes an open menu (and stops there, like Select); with the menu closed it leaves the field.
    else if (e.key === "Escape") { if (open) { e.preventDefault(); e.stopPropagation(); close(); } else input.current?.blur(); }
    else if (e.key === "Tab") close();
  };

  const listId = `${id}-list`;
  return (
    <div ref={box} className="player-picker">
      <div className={`select-trigger ${value ? "is-set" : ""}`} aria-expanded={open || undefined} onClick={() => { setOpen(true); input.current?.focus(); }}>
        {value && !query && avatar(value)}
        {value && !query && isPinned(value) && <PinIcon on />}
        <input ref={input} type="text" role="combobox" aria-label={noun} aria-autocomplete="list" aria-expanded={open} aria-controls={listId}
          aria-activedescendant={open && options.length ? `${id}-${active}` : undefined}
          placeholder={!value && placeholder ? placeholder : label(value)} value={query} spellCheck={false} autoComplete="off"
          // Focus alone never opens the menu (Tab passes through the filter row quietly, like the shared dropdown);
          // a click, typing or ArrowDown does.
          onFocus={() => setActive(Math.max(0, options.indexOf(value)))}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); setActive(0); }} onKeyDown={onKey} />
        {/* The chevron opens and closes the menu, like the shared dropdown's trigger; the text field keeps it open for typing. */}
        <svg className="select-chevron" viewBox="0 0 10 10" aria-hidden="true" onMouseDown={(e) => { e.preventDefault(); }} onClick={(e) => { if (open) { e.stopPropagation(); close(); } }}><path d="M2 3.5 5 6.5 8 3.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </div>
      {open && pos && createPortal(
        <div ref={menu} className={`select-menu player-menu ${pos.bottom != null ? "above" : ""}`.trim()}
          style={{ left: pos.left, minWidth: pos.width, top: pos.top, bottom: pos.bottom, maxHeight: pos.maxHeight }}>
        <button type="button" className={`pinned-only ${pinnedOnly ? "on" : ""}`} aria-pressed={pinnedOnly}
          onMouseDown={(e) => e.preventDefault()} onClick={() => { setPinnedOnly((x) => !x); setActive(0); }}>
          <PinIcon on={pinnedOnly} /> Pinned only
        </button>
        <ul ref={list} id={listId} role="listbox" aria-label={plural} className="player-options">
          {options.map((p, i) => (
            <li key={p || "all"} id={`${id}-${i}`} role="option" aria-selected={p === value} data-value={p}
              className={`select-option ${i === active ? "is-active" : ""} ${p && first(p) && !first(options[i + 1] ?? "") && options[i + 1] ? "last-pinned" : ""}`.trim()}
              onMouseDown={(e) => e.preventDefault()} onMouseMove={() => i !== active && setActive(i)} onClick={() => pick(p)}>
              <span className="select-label player-chip">{avatar(p)}{label(p)}</span>
              {p && (
                <button type="button" className="pin-btn" aria-pressed={isPinned(p)} aria-label={`${isPinned(p) ? "Unpin" : "Pin"} ${label(p)}`}
                  title={isPinned(p) ? "Pinned: listed first, saved in this browser" : `Pin this ${noun.toLowerCase()}`}
                  onMouseDown={(e) => e.preventDefault()} onClick={(e) => { e.stopPropagation(); toggle(p, label(p)); }}>
                  <PinIcon on={isPinned(p)} />
                </button>
              )}
            </li>
          ))}
          {!options.length && <li className="select-option empty">{pinnedOnly && !q ? `No pinned ${plural} here` : `No ${noun.toLowerCase()} matches “${query}”`}</li>}
        </ul>
        </div>,
        document.body,
      )}
    </div>
  );
}

