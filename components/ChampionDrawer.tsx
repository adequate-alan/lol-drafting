"use client";
// Champion drawer (redesigned 2026-10-12, alan: "a compact, interactive champion scouting panel"): one champion in one
// role, opened from every page that shows champions, without leaving it. Right-side panel on desktop (400–460px, an
// expand control for deeper research), full-width bottom sheet on phones.
//
//   header   portrait, name, role, pool tier, role switches; sticky while the body scrolls
//   tabs     Overview | Synergies | Pro | Builds | Patch (components/drawer/*), last tab remembered for the next open
//   nested   a saved, pro-derived or proposed partner opens the pairing inside the drawer (PairingView), with Back
//   footer   context-aware links (lib/drawer.ts drawerActions): never "Use in Draft Room" inside the Draft Room
//
// History: opening pushes one same-URL entry, so Back closes the drawer; opening a pairing pushes a second, so Back
// returns to the champion. Links inside the drawer drop those entries first, then navigate (a[data-to]). Elements marked
// data-drawer-trigger switch the drawer in place instead of closing it. The three layers keep separate blocks in every tab.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { ChampIcon } from "@/components/ui";
import { BuildsTab } from "@/components/drawer/BuildsTab";
import { OverviewTab } from "@/components/drawer/OverviewTab";
import { PairingView } from "@/components/drawer/PairingView";
import { PatchTab } from "@/components/drawer/PatchTab";
import { ProTab } from "@/components/drawer/ProTab";
import { SynergiesTab } from "@/components/drawer/SynergiesTab";
import { TIER_LABEL, type DrawerEnv, type Partner } from "@/components/drawer/parts";
import { rovingIndex, rovingKeys } from "@/components/roving";
import { proLinks, savedLinks, type Slots } from "@/lib/comp-links";
import type { DrawerData } from "@/lib/data";
import { buildDrawerIndex, DRAWER_TABS, drawerActions, OTHER, rolesOf, savedPartners, type DrawerContext, type DrawerIndex, type DrawerTab } from "@/lib/drawer";
import { changesFor } from "@/lib/patch-changes";
import { TIERS, type Tier } from "@/lib/pool-stats";
import { gameIdOf } from "@/lib/pro-drafts-game";
import { championHistory } from "@/lib/pro-priority";
import { shownPartners } from "@/lib/proposed";
import { ROLES, type Role } from "@/lib/schema";

export type { DrawerContext, DrawerIndex } from "@/lib/drawer";
export interface DrawerTarget { id: string; role?: Role } // no role: the role the champion was played in most
export interface CompContext {
  name: string;
  slots: Slots;
  jobs?: Partial<Record<Role, string>>;
  swaps?: Partial<Record<Role, string[]>>;
  proDraftId?: string; // the comp's own source game: kept out of the pro link counts, named once instead
}

const WIDE_KEY = "drawer:wide";
// The tab the drawer was on when it closed: reopening (any champion) comes back to it (alan: "closing and reopening
// the drawer preserves appropriate context"). Per page load; nothing is stored.
let lastTab: DrawerTab = "overview";

/** Prepared once per page: the pro games list is the expensive part. */
export function useDrawerIndex(data: DrawerData): DrawerIndex {
  return useMemo(() => buildDrawerIndex(data), [data]);
}

/** Saved and pro links from one slot to its comp-mates, for highlights outside the drawer. */
export function compLinks(target: { id: string; role: Role }, comp: CompContext, data: DrawerData, index: DrawerIndex) {
  const name = (id: string) => index.names[id] ?? id;
  const saved = savedLinks(target.role, comp.slots, data, name);
  const pro = proLinks(target.role, comp.slots, index.games, data, comp.proDraftId);
  return { saved, pro, savedRoles: new Set(saved.map((l) => l.role)), proRoles: new Map(pro.map((l) => [l.role, l])) };
}

export function poolTier(id: string, role: Role, data: DrawerData): { tier: Tier; reason?: string } | undefined {
  const p = data.pool.find((x) => x.role === role);
  if (!p) return undefined;
  for (const [t] of TIERS) if (p[t].includes(id)) return { tier: t, reason: t === "core" ? p.coreReasons[id] : undefined };
  return undefined;
}

export function ChampionDrawer({ target, comp, data, index, context = OTHER, onClose, onSelect }: {
  target: DrawerTarget; comp?: CompContext; data: DrawerData; index: DrawerIndex; context?: DrawerContext;
  onClose: () => void; onSelect?: (t: DrawerTarget) => void;
}) {
  const { id } = target;
  const { names, champs } = index;
  const roles = rolesOf(id, index);
  const role = target.role ?? roles[0] ?? champs[id]?.roles[0] ?? "MID";
  const name = useCallback((x: string) => names[x] ?? x, [names]);
  const champ = champs[id];
  const ref = useRef<HTMLElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const router = useRouter();
  const routerRef = useRef(router);
  routerRef.current = router;

  // ---- tabs, nested pairing view, the trail back to the champion a partner was opened from, width ----
  const [tab, setTabState] = useState<DrawerTab>(lastTab);
  const setTab = useCallback((t: DrawerTab) => { lastTab = t; setTabState(t); bodyRef.current?.scrollTo({ top: 0 }); }, []);
  const [detail, setDetail] = useState<Partner>();
  const detailRef = useRef(detail);
  detailRef.current = detail;
  const detailOpener = useRef<HTMLElement | null>(null);
  const [trail, setTrail] = useState<{ id: string; role: Role }[]>([]);
  const [wide, setWide] = useState(false);
  useEffect(() => { try { setWide(localStorage.getItem(WIDE_KEY) === "1"); } catch { /* storage blocked: default width */ } }, []);
  const toggleWide = () => setWide((w) => { try { localStorage.setItem(WIDE_KEY, w ? "0" : "1"); } catch { /* see above */ } return !w; });
  // Pro tab: the patch whose statistics are shown; the Overview chart sets it too. Reset when the champion changes.
  const [patch, setPatch] = useState<string>();

  // ---- closing ----
  // Closing plays a short exit (.drawer.closing) and then hands back to the page: focus returns to whatever opened the
  // drawer when it was still inside it, and onClose unmounts it. Every way out (×, Escape, click outside, Back) goes here.
  const [closing, setClosing] = useState(false);
  const opener = useRef<Element | null>(null);
  if (opener.current === null) opener.current = typeof document === "undefined" ? null : document.activeElement;
  const done = useRef(onClose);
  done.current = onClose;
  const finish = useCallback(() => {
    const el = opener.current, active = document.activeElement;
    if (el instanceof HTMLElement && el.isConnected && (!active || active === document.body || ref.current?.contains(active))) el.focus({ preventScroll: true });
    done.current();
  }, []);
  const dismiss = useCallback(() => setClosing(true), []);
  const closeRef = useRef(dismiss);
  // A champion picked while the exit plays (another row, the next slot) keeps the drawer open on that champion.
  useEffect(() => setClosing(false), [id, target.role]);
  // Phones: the drawer is a bottom sheet over the page; the page behind it doesn't scroll while it is open.
  useEffect(() => {
    if (!window.matchMedia("(max-width: 620px)").matches) return;
    const root = document.documentElement, was = root.style.overflow;
    root.style.overflow = "hidden";
    return () => { root.style.overflow = was; };
  }, []);
  // The exit ends on animationend; the timer covers a browser that skips the animation.
  useEffect(() => {
    if (!closing) return;
    const t = setTimeout(finish, 320);
    return () => clearTimeout(t);
  }, [closing, finish]);

  // ---- history ----
  // Escape, click outside, and the browser back button close the drawer (or step out of a pairing) instead of leaving
  // the page. Opening pushes one history entry (same URL); a pairing pushes a second; switching champions in place does not.
  const depth = () => 1 + (detailRef.current ? 1 : 0);
  useEffect(() => {
    let popped = false, leaving: string | undefined;
    window.history.pushState({ ...window.history.state, championDrawer: true }, "");
    // A link inside the drawer first drops the drawer's entries, then navigates, so Back from the next page returns to
    // this page rather than to a stale drawer entry.
    const onPop = (e: PopStateEvent) => {
      if (leaving) { popped = true; routerRef.current.push(leaving); return; }
      if (e.state?.championDrawer) {
        // Still inside the drawer's entries: back out of a pairing (the champion stays, focus returns to the row that
        // opened it). The entry may already have been left by an in-place champion switch; then there is nothing to do.
        if (!e.state.drawerDetail && detailRef.current) {
          setDetail(undefined);
          const el = detailOpener.current;
          requestAnimationFrame(() => { if (el?.isConnected) el.focus({ preventScroll: true }); else ref.current?.focus({ preventScroll: true }); });
        }
        return;
      }
      popped = true;
      closeRef.current();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      if (detailRef.current) window.history.back(); else closeRef.current();
    };
    const onDown = (e: PointerEvent) => {
      const t = e.target as Element | null;
      if (!t || ref.current?.contains(t) || t.closest("[data-drawer-trigger], .popover")) return;
      closeRef.current();
    };
    const onLeave = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest<HTMLAnchorElement>("a[data-to]");
      if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0 || !window.history.state?.championDrawer) return;
      e.preventDefault();
      e.stopPropagation();
      leaving = a.dataset.to;
      window.history.go(-depth());
    };
    window.addEventListener("popstate", onPop);
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    ref.current?.addEventListener("click", onLeave, true);
    const el = ref.current;
    return () => {
      window.removeEventListener("popstate", onPop);
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
      el?.removeEventListener("click", onLeave, true);
      // Drop the entries we pushed, unless back already did or a link inside the drawer is navigating away.
      if (!popped && !leaving && window.history.state?.championDrawer) window.history.go(-depth());
    };
  }, []);

  // A pairing opens as a nested view with its own history entry, so Back (browser or button) returns to the champion.
  const inspect = useCallback((p: Partner, from?: HTMLElement | null) => {
    detailOpener.current = from ?? (document.activeElement as HTMLElement | null);
    if (!detailRef.current) window.history.pushState({ ...window.history.state, championDrawer: true, drawerDetail: true }, "");
    setDetail(p);
    bodyRef.current?.scrollTo({ top: 0 });
  }, []);
  const back = useCallback(() => { if (detailRef.current) window.history.back(); }, []);

  // Switching champion in place (a partner's "View Bard", a role switch, prev / next in a comp) leaves any pairing view
  // and its history entry behind; the champion it came from is kept as a trail so one tap returns to it.
  const select = useCallback((t: DrawerTarget, remember = false) => {
    if (!onSelect) return;
    if (remember) setTrail((tr) => [...tr.filter((x) => x.id !== t.id), { id, role }].slice(-4));
    else setTrail([]);
    onSelect(t);
  }, [onSelect, id, role]);
  useEffect(() => {
    if (detailRef.current) window.history.back();
    setDetail(undefined);
    setPatch(undefined);
  }, [id, role]);

  // Focus moves into the drawer on open and on every in-place switch, so screen readers announce the new champion.
  useEffect(() => { ref.current?.focus({ preventScroll: true }); }, [id, role]);

  // ---- data for the header, the tab counts and the footer ----
  const tier = poolTier(id, role, data);
  const games = useMemo(() => index.games.filter((g) => g.picks[role] === id), [index, id, role]);
  const saved = useMemo(() => savedPartners(id, role, data), [id, role, data]);
  const proposed = useMemo(() => shownPartners(data.proposed, id, role, data.botPairings).filter((l) => !comp || l.tier === "preferred" || Object.values(comp.slots).includes(l.id)), [data, id, role, comp]);
  const history = useMemo(() => championHistory(data.priority, id), [data.priority, id]);
  const changes = useMemo(() => changesFor(data.patches, { kind: "champion", ref: id }), [data.patches, id]);
  const builds = data.builds.find((b) => b.champion === id && b.role === role);
  const gameDraft = context.game ? data.proDrafts.find((d) => gameIdOf(d) === context.game && d.picks[role] === id) : undefined;
  const actions = drawerActions(context, { id, role, inPool: !!tier, builds, gameHasBuilds: !!context.game && data.buildGames.includes(context.game), gameDraft: gameDraft?.id });
  const counts: Record<DrawerTab, number | undefined> = {
    overview: undefined,
    synergies: saved.reduce((n, g) => n + g.ids.length, 0) + proposed.length,
    pro: games.length || (history.some((p) => p.row) ? undefined : 0),
    builds: builds?.games ?? 0,
    patch: changes.length,
  };
  const env: DrawerEnv = { id, role, name, data, index, comp, context, games, saved, proposed, history, changes, builds, patch, setPatch, setTab, inspect, select, canSelect: !!onSelect };
  const step = (d: 1 | -1) => comp && select({ id: comp.slots[ROLES[(ROLES.indexOf(role) + d + 5) % 5]], role: ROLES[(ROLES.indexOf(role) + d + 5) % 5] });
  const prev = trail.at(-1);

  return (
    <>
    <div className={`drawer-scrim ${closing ? "closing" : ""}`.trim()} aria-hidden="true" />
    <aside ref={ref} className={`drawer ${wide ? "wide" : ""} ${closing ? "closing" : ""}`.trim()} onAnimationEnd={(e) => { if (closing && e.target === e.currentTarget) finish(); }}
      role="dialog" aria-modal="false" aria-labelledby={titleId} tabIndex={-1} data-champ={id} data-role={role} data-tab={detail ? "pairing" : tab}>
      <header className="drawer-head">
        {prev && onSelect && (
          <button type="button" className="dw-trail" onClick={() => { setTrail((tr) => tr.slice(0, -1)); onSelect(prev); }} title={`Back to ${name(prev.id)}`}>
            <span aria-hidden="true">←</span> {name(prev.id)}
          </button>
        )}
        <ChampIcon id={id} name={name(id)} role={role} size="lg" />
        <div className="drawer-title">
          <h2 id={titleId}>{name(id)}</h2>
          <span className="xs muted drawer-roles">
            <span className={`role-tag role-${role}`}>{role}</span>
            <span className="dw-tier" title={tier?.reason ?? (tier ? `${TIER_LABEL[tier.tier]} in my ${role.toLowerCase()} pool` : `Not in my ${role.toLowerCase()} pool`)}>
              · {tier ? <span className={`tier ${tier.tier}`}>{TIER_LABEL[tier.tier]}</span> : <span className="faint">Not in pool</span>}
            </span>
            {comp && <> · {comp.name}</>}
            {!comp && onSelect && roles.filter((r) => r !== role).map((r) => (
              <button key={r} type="button" className="role-switch" onClick={() => select({ id, role: r })} title={`${name(id)} ${r.toLowerCase()}`}>{r}</button>
            ))}
          </span>
        </div>
        <div className="drawer-nav">
          {comp && onSelect && <>
            <button className="icon-btn" aria-label="Previous champion" title="Previous" onClick={() => step(-1)}>‹</button>
            <button className="icon-btn" aria-label="Next champion" title="Next" onClick={() => step(1)}>›</button>
          </>}
          <button className="icon-btn dw-expand" aria-pressed={wide} aria-label={wide ? "Narrow the drawer" : "Widen the drawer"} title={wide ? "Narrow" : "Widen for research"} onClick={toggleWide}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true">
              {wide ? <path d="M4.5 1.5v3h-3M7.5 10.5v-3h3M1.5 4.5l3-3M10.5 7.5l-3 3" /> : <path d="M7 1.5h3.5V5M5 10.5H1.5V7M10.5 1.5 7 5M1.5 10.5 5 7" />}
            </svg>
          </button>
          <button className="icon-btn" aria-label="Close" title="Close (Esc)" onClick={dismiss}>×</button>
        </div>
      </header>

      {!detail && (
        <div className="drawer-tabs" role="tablist" aria-label="Champion details" onKeyDown={(e) => rovingKeys(e)}>
          {DRAWER_TABS.map(([t, label]) => (
            <button key={t} type="button" role="tab" id={`${titleId}-tab-${t}`} aria-selected={t === tab} aria-controls={`${titleId}-panel-${t}`} tabIndex={rovingIndex(t === tab)}
              className={`drawer-tab ${t === tab ? "active" : ""}`.trim()} onClick={() => setTab(t)}>
              {label}{counts[t] != null && <span className="count">{counts[t]}</span>}
            </button>
          ))}
        </div>
      )}

      <div ref={bodyRef} className="drawer-body">
        {detail ? (
          <PairingView env={env} partner={detail} onBack={back} />
        ) : (
          <div role="tabpanel" id={`${titleId}-panel-${tab}`} aria-labelledby={`${titleId}-tab-${tab}`} className="drawer-panel">
            {tab === "overview" && <OverviewTab env={env} champ={champ} tier={tier} />}
            {tab === "synergies" && <SynergiesTab env={env} />}
            {tab === "pro" && <ProTab env={env} />}
            {tab === "builds" && <BuildsTab env={env} />}
            {tab === "patch" && <PatchTab env={env} />}
          </div>
        )}
      </div>

      {!detail && actions.length > 0 && (
        <footer className="drawer-foot">
          {actions.map((a) => <Link key={a.label} className={`btn sm ${a.primary ? "primary" : ""}`.trim()} href={a.href} data-to={a.href}>{a.label}</Link>)}
        </footer>
      )}
    </aside>
    </>
  );
}
