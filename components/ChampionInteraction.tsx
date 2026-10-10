"use client";
// Shared champion interaction: hover or keyboard focus shows a quick ChampionHoverCard, click or tap opens the
// full ChampionDrawer. A page opts in by wrapping its content in <ChampionProvider>; without one, every
// InteractiveChampion renders its children unchanged, so shared pieces (Chip, Duo) stay static elsewhere.
//
// `focus` is the champion the page is about (the selected First Pick champion): the card then says how the hovered
// champion relates to it, one line per layer (Synergy / Pro / Logic), never merged.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChampionDrawer, compLinks, poolTier, useDrawerIndex, type CompContext, type DrawerIndex, type DrawerTarget } from "@/components/ChampionDrawer";
import { ChampIcon } from "@/components/ChampIcon";
import { ChampionCtx } from "@/components/InteractiveChampion";
import { proLinks, savedLinks, type Slots } from "@/lib/comp-links";
import type { DrawerData } from "@/lib/data";
import { fresher, shortDate } from "@/lib/evidence";
import { TIERS, listsRole, type ProGame, type Tier } from "@/lib/pool-stats";
import { proposedLink } from "@/lib/proposed";
import { synergyParts } from "@/lib/recommend";
import { ROLES, type Attr, type Role } from "@/lib/schema";
export { InteractiveChampion } from "@/components/InteractiveChampion";

type Focus = { id: string; role: Role };

// Open after a short pause so sweeping the pointer across a row doesn't flash cards; once a card is up, moving to
// another champion switches a little sooner. Closing waits a moment so the pointer can travel into the card.
const SHOW_MS = 180, SWITCH_MS = 110, HIDE_MS = 120;

/** Hover intent for the quick card, shared by the provider and by pages that run their own drawer (Comp Library). */
export function useHoverIntent() {
  const [card, setCard] = useState<{ t: DrawerTarget; el: HTMLElement }>();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const shown = useRef(false);
  shown.current = !!card;
  const clear = useCallback(() => clearTimeout(timer.current), []);
  const hover = useCallback((t: DrawerTarget, el: HTMLElement) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCard({ t, el }), shown.current ? SWITCH_MS : SHOW_MS);
  }, []);
  const unhover = useCallback(() => { clearTimeout(timer.current); timer.current = setTimeout(() => setCard(undefined), HIDE_MS); }, []);
  const hide = useCallback(() => { clearTimeout(timer.current); setCard(undefined); }, []);
  useEffect(() => () => clearTimeout(timer.current), []);
  // Escape and scrolling dismiss the quick card; the drawer handles its own Escape.
  useEffect(() => {
    if (!card) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") hide(); };
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", hide, { capture: true, passive: true });
    return () => { document.removeEventListener("keydown", onKey); window.removeEventListener("scroll", hide, { capture: true }); };
  }, [card, hide]);
  return { card, hover, unhover, hide, keep: clear };
}

export function ChampionProvider({ data, focus, children }: { data: DrawerData; focus?: Focus; children: React.ReactNode }) {
  const index = useDrawerIndex(data);
  const [drawer, setDrawer] = useState<DrawerTarget>();
  const { card, hover, unhover, hide, keep } = useHoverIntent();
  const openDrawer = useCallback((t: DrawerTarget) => { hide(); setDrawer(t); }, [hide]);
  const ctx = useMemo(() => ({ openDrawer, hover, unhover }), [openDrawer, hover, unhover]);
  return (
    <ChampionCtx.Provider value={ctx}>
      {children}
      {card && !drawer && (
        <ChampionHoverCard key={`${card.t.id}-${card.t.role}`} target={card.t} anchor={card.el} data={data} index={index} focus={focus} onEnter={keep} onLeave={unhover} />
      )}
      {drawer && <ChampionDrawer target={drawer} data={data} index={index} onClose={() => setDrawer(undefined)} onSelect={setDrawer} />}
    </ChampionCtx.Provider>
  );
}

const TIER_LABEL = Object.fromEntries(TIERS) as Record<Tier, string>;
const TRAITS: [Attr, string][] = [["engage", "Engage"], ["peel", "Peel"], ["frontline", "Frontline"], ["poke", "Poke"], ["scaling", "Scaling"],
  ["sustainedDps", "DPS"], ["burst", "Burst"], ["lanePressure", "Lane"]];
const KIND_LABEL = { default: "Default", alt: "Alternative", fits: "Fits" } as const;

/** How one champion relates to the page's focus champion, per layer. Empty fields mean no evidence. */
export function relation(t: { id: string; role: Role }, focus: Focus, data: DrawerData, index: DrawerIndex) {
  if (t.role === focus.role) return undefined;
  const slots = Object.fromEntries(ROLES.map((r) => [r, r === t.role ? t.id : r === focus.role ? focus.id : ""])) as Slots;
  const name = (x: string) => index.names[x] ?? x;
  const saved = savedLinks(t.role, slots, data, name).filter((l) => l.role === focus.role);
  const pro = proLinks(t.role, slots, index.games, data).find((l) => l.role === focus.role);
  const me = index.champs[t.id], other = index.champs[focus.id];
  const logic = me && other ? synergyParts(me, t.role, [{ role: focus.role, champ: other }]).map((p) => p.text) : [];
  return { saved, pro, logic };
}

interface Line { layer: "clash" | "pro" | "logic"; label: string; text: string }

/** The card's relation lines: strongest saved link, best pro link, and a logic reason only when nothing is saved. */
function relationLines(t: { id: string; role: Role }, data: DrawerData, index: DrawerIndex, focus?: Focus, comp?: CompContext): Line[] {
  const name = (x: string) => index.names[x] ?? x;
  let saved: { kind: keyof typeof KIND_LABEL; text: string }[] = [];
  let pro: { games: ProGame[]; observed: unknown[]; mate: string }[] = [];
  let logic: string[] = [];
  if (comp) {
    const l = compLinks(t, comp, data, index);
    saved = l.saved;
    pro = l.pro.map((p) => ({ ...p, mate: comp.slots[p.role] }));
  } else if (focus && focus.id !== t.id) {
    const r = relation(t, focus, data, index);
    if (r) { saved = r.saved; pro = r.pro ? [{ ...r.pro, mate: focus.id }] : []; logic = r.logic; }
  }
  const lines: Line[] = [];
  if (saved[0]) lines.push({ layer: "clash", label: `Synergy · ${KIND_LABEL[saved[0].kind]}`, text: saved[0].text.replace(/^Saved (pairing|comp): /, "") });
  // Nothing saved: Claude's proposed link, labelled as a proposal (never as a saved pairing).
  if (!saved.length) {
    const mates = comp ? ROLES.filter((r) => r !== t.role && comp.slots[r]).map((r) => ({ id: comp.slots[r], role: r })) : focus && focus.id !== t.id ? [focus] : [];
    for (const m of mates) {
      // A saved bot's own record decides its supports; no proposed bot ↔ support line beside it.
      const bot = t.role === "BOT" ? t.id : m.role === "BOT" ? m.id : undefined;
      if (bot && (t.role === "SUPPORT" || m.role === "SUPPORT") && data.botPairings.some((b) => b.champion === bot)) continue;
      const p = proposedLink(data.proposed, t.id, t.role, m.id, m.role);
      if (p) { lines.push({ layer: "clash", label: "Proposed synergy", text: `${name(m.id)}: ${p.reason}` }); break; }
    }
  }
  const best = [...pro].sort((a, b) => b.games.length - a.games.length)[0];
  if (best) lines.push({ layer: "pro", label: "Pro", text: best.games.length
    ? `${best.games.length} game${best.games.length > 1 ? "s" : ""} with ${name(best.mate)} · ${[best.games[0].eventName, best.games[0].patch].filter(Boolean).join(" · ")}`
    : `cited with ${name(best.mate)}, no recorded draft` });
  if (!saved.length && !lines.some((l) => l.layer === "clash") && logic[0]) lines.push({ layer: "logic", label: "Logic", text: logic[0] });
  return lines;
}

/** Beside the champion (right, else left), else below or above; always inside the viewport, never over the champion.
 *  `below` (a horizontal lineup) tries under the anchor first, then above, so the card never covers its comp-mates. */
function place(a: DOMRect, w: number, h: number, side: "beside" | "below" = "beside") {
  const m = 8, gap = 8, vw = window.innerWidth, vh = window.innerHeight;
  const clampY = (y: number) => Math.min(Math.max(m, y), vh - h - m);
  const clampX = (x: number) => Math.min(Math.max(m, x), vw - w - m);
  if (side === "below") {
    const left = clampX(a.left + a.width / 2 - w / 2);
    if (a.bottom + gap + h + m <= vh) return { left, top: a.bottom + gap };
    if (a.top - gap - h >= m) return { left, top: a.top - gap - h };
  }
  if (a.right + gap + w + m <= vw) return { left: a.right + gap, top: clampY(a.top - 4) };
  if (a.left - gap - w >= m) return { left: a.left - gap - w, top: clampY(a.top - 4) };
  if (a.bottom + gap + h + m <= vh) return { left: clampX(a.left), top: a.bottom + gap };
  return { left: clampX(a.left), top: Math.max(m, a.top - gap - h) };
}

export function ChampionHoverCard({ target, anchor, data, index, focus, comp, side, onEnter, onLeave }: {
  target: DrawerTarget; anchor: HTMLElement; data: DrawerData; index: DrawerIndex; focus?: Focus; comp?: CompContext;
  side?: "beside" | "below"; onEnter: () => void; onLeave: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | undefined>(undefined);
  const champ = index.champs[target.id];
  const role = target.role ?? champ?.roles[0] ?? "MID";
  const name = index.names[target.id] ?? target.id;

  // Measured before paint, so the card never shows in the wrong place.
  useLayoutEffect(() => {
    const c = ref.current!.getBoundingClientRect();
    setPos(place(anchor.getBoundingClientRect(), c.width, c.height, side));
  }, [anchor, target.id, target.role, side]);

  const tier = poolTier(target.id, role, data);
  const games = index.games.filter((g) => g.picks[role] === target.id);
  const stat = index.stats.filter((s) => s.stat.champion === target.id && (listsRole(s, role) || !s.roles.length)).sort((a, b) => fresher(a.event, b.event))[0];
  const traits = champ ? [...TRAITS].filter(([a]) => champ.attrs[a] >= 2).sort((x, y) => champ.attrs[y[0]] - champ.attrs[x[0]]).slice(0, 2) : [];
  const lines = relationLines({ id: target.id, role }, data, index, focus, comp);
  const about = comp ? "this comp" : focus ? index.names[focus.id] ?? focus.id : undefined;
  const job = comp && comp.slots[role] === target.id ? comp.jobs?.[role] : undefined;
  const latest = games[0] ? [games[0].eventName, games[0].patch, shortDate(games[0].date)].filter(Boolean).join(" · ") : "";

  return createPortal(
    <div ref={ref} className="hovercard" role="tooltip" onPointerEnter={onEnter} onPointerLeave={onLeave}
      style={pos ? { top: pos.top, left: pos.left } : { top: 0, left: 0, visibility: "hidden" }}>
      <div className="hc-head">
        <ChampIcon id={target.id} name={name} role={role} size="md" />
        <div className="hc-title">
          <span><b>{name}</b><span className="xs muted"> · {role.charAt(0) + role.slice(1).toLowerCase()}</span></span>
          <span className="xs muted">{tier ? <>Pool <span className={`tier ${tier.tier}`}>{TIER_LABEL[tier.tier]}</span></> : "Not in my pool"}
            {traits.length > 0 && <span className="hc-traits"> · {traits.map(([a, l]) => `${l} ${champ!.attrs[a]}`).join(" · ")}</span>}</span>
        </div>
      </div>
      {job && <p className="hc-job xs"><span className="muted">Job</span> {job}</p>}
      {about && (
        <div className="hc-rel">
          {lines.map((l) => <p key={l.layer} className={`hc-line ${l.layer}`}><span className="ldot" /><b>{l.label}</b> {l.text}</p>)}
          {!lines.length && <p className="xs muted">No recorded link with {about}.</p>}
        </div>
      )}
      <div className="hc-foot xs muted">
        {stat ? <span className="tnum">{stat.event.short} {stat.event.patch} · {stat.stat.picks} picks{stat.stat.lowSample ? "*" : ""}{listsRole(stat, role) && stat.roles.length < 2 ? "" : " (all roles)"} · {stat.stat.winRate != null ? `${Math.round(stat.stat.winRate * 100)}% WR` : "banned only"}</span>
          : games.length ? <span className="tnum">{games.length} pro game{games.length > 1 ? "s" : ""} as {role.toLowerCase()} · {latest}</span> : "No pro data in this role"}
      </div>
    </div>,
    document.body,
  );
}
