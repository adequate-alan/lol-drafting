"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { picksOf, profile, RULES, warnings, type Draft, type DraftWarning } from "@/lib/evaluate";
import { teamNeeds, type Need, type Recommendation } from "@/lib/recommend";
import { draftCandidates, hasSignal, startingCandidates, type Candidate, type Filter } from "@/lib/candidates";
import { ROLES, type Attr, type Role, type Source } from "@/lib/schema";
import type { Tier } from "@/lib/pool-stats";
import type { PriorityData } from "@/lib/pro-priority";
import { describeLine } from "@/lib/evidence";
import { patchKey, patchLabel, patchesOf, priorityMarks } from "@/lib/pro-priority";
import { blindLabel, defaultPatch, engineReader, rotationLabel, sortForView, startLine, startingPicks, type StartView, type StartingPick } from "@/lib/starting-picks";
import { describeEvidence, describePro, enemyParam, poolTier, tierLabel, type Counter, type EnemyDraft, type RoleCounters } from "@/lib/counters";
import { similarProDrafts, similarShells, type ProSuggestion, type SuggestData } from "@/lib/suggest";
import type { DraftData, DrawerData } from "@/lib/data";
import { ChampionDrawer, useDrawerIndex, type DrawerTarget } from "./ChampionDrawer";
import { CompCheck, CompStatus, CompSummaryLine, planFlags, usePlanRead, type SiegeCell } from "./CompCheck";
import { ChampionHoverCard, useHoverIntent } from "./ChampionInteraction";
import { GenRang } from "./GenRang";
import { PairingCard, type CardRecord } from "./PairingCard";
import { proposedCard } from "@/lib/proposed";
import { Disclosure } from "./Disclosure";
import { CounterTrigger, MetaEvidenceTrigger, ProEvidenceTrigger, type ProCtx } from "./EvidenceCards";
import { Select } from "./Select";
import { Popover } from "./Popover";
import { AUTO_BUILDS_KEY, MY_ROLE_KEY, buildsEntry, draftQuery, markOwnQuery, myBuildsHref, opensBuilds, parseRole } from "@/lib/my-role";
import { noteDraftRole, restoredDraftRole, sessionStore } from "@/lib/synergy-nav";
import { ChampIcon, ChampionRow, WarningBadge, type Severity } from "./ui";
import { scrollBehavior } from "@/lib/motion";
import { rovingIndex, rovingKeys } from "./roving";
import { isLaneRole, PAIR_LABEL, USAGE_LABEL, type MidPair, type TopUsageMark, type TopUsageMarks } from "@/lib/top-draft";
import { boardTraits, TRAIT_LABEL, type CompResponse, type TraitHit } from "@/lib/jungle-context";
import { comparePatch } from "@/lib/patch";
import type { BlindLine } from "@/lib/top-blind";

const ROLE_LABEL: Record<Role, string> = { TOP: "Top", JUNGLE: "Jungle", MID: "Mid", BOT: "Bot", SUPPORT: "Support" };
// Lane partner: with Bot locked, Support is the natural next pick (and the other way round).
const PARTNER: Partial<Record<Role, Role>> = { BOT: "SUPPORT", SUPPORT: "BOT", MID: "JUNGLE", JUNGLE: "MID" };
// Whom an open role plays against: its lane opponent, or both enemy bot laners.
const LANE: Record<Role, Role[]> = { TOP: ["TOP"], JUNGLE: ["JUNGLE"], MID: ["MID"], BOT: ["BOT", "SUPPORT"], SUPPORT: ["BOT", "SUPPORT"] };

// Display grouping only: which rule warnings read as a structural hole versus something to keep an eye on.
// The rules themselves (lib/evaluate.ts) are unchanged.
const CRITICAL = new Set(["no-engage", "needs-fight-starter", "no-frontline", "insufficient-peel", "vulnerable-hard-engage"]);
const severityOf = (w: DraftWarning): Severity => (CRITICAL.has(w.id) ? "critical" : "caution");

const KIND_LABEL: Record<string, string> = { saved: "Saved", proposed: "Proposed", synergy: "Kit synergy", need: "Need", matchup: "Matchup", counter: "Counter", risk: "Risk" };
const STATUS = { default: "Preferred", alt: "Alt", fits: "Fits" } as const;
const REC_LIMIT = 8; // picker and role-tab hints: the top of the draft-fit list
const ROW_LIMIT = 12; // unified list rows shown before "Show all"
const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" }, { key: "synergy", label: "Synergy" }, { key: "pro", label: "Pro" }, { key: "fit", label: "Best fit" }, { key: "counter", label: "Counters" },
  { key: "rotation", label: "First rotation" }, { key: "blind", label: "Blind" }, { key: "priority", label: "Pro priority" },
];
// Before anything is locked: the pro meta starting picks and their own views (lib/starting-picks.ts).
const START_FILTERS: { key: Filter & StartView; label: string }[] = [
  { key: "all", label: "Recommended" }, { key: "rotation", label: "First rotation" }, { key: "blind", label: "Blind picks" }, { key: "priority", label: "Pro priority" },
];
const BLIND_OFF = "No classified blind picks for this role on this patch";
const START_NOTE = "Before any pick: champions with recorded pro picks in this role on the patch. First rotation = picks within the team's first three. Your pool first (Core, Depth, Prepared / flex), "
  + "then everyone else; each by first-rotation picks, then role picks, then presence. Real counts only, no score. "
  + "Once a pick is locked the list orders by your saved pairings and comp fit, and these stay labels.";
const enemyDraftOf = (list: (string | undefined)[]): EnemyDraft => Object.fromEntries(ROLES.flatMap((r, i) => (list[i] ? [[r, list[i]]] : [])));
const ORDER_NOTE = "Order: your preferred pairing first, then comp fit (synergy with your picks, team needs, matchups and risks). "
  + "Synergy, Pro, Counter, First rotation and Pro priority are labels on each row; pro game counts, counters and presence never move a row. Ties go to the row with more signals.";

export function DraftRoom({ data, sources, drawerData, initial, initialEnemy, initialFocus, initialFilter = "all", initialPatch, metaPicks, legacyCheck = false }: {
  data: DraftData;
  sources: Record<string, Source>;
  drawerData: DrawerData;
  initial: Draft;
  initialEnemy: EnemyDraft; // roles from ?vs=top:aatrox, or detected for bare ids
  initialFocus?: Role; initialFilter?: Filter; // restored on the way back from Pro Builds
  initialPatch?: string; // ?patch=: the pro meta patch, when chosen
  metaPicks: Record<string, { picks: number; winRate: number; lowSample: boolean }>;
  legacyCheck?: boolean; // ?legacy=1: a debugging switch that adds the previous Comp Check rules under Full analysis
}) {
  const [draft, setDraft] = useState<Draft>(initial);
  // One enemy slot per role, in ROLES order.
  const [enemy, setEnemy] = useState<(string | undefined)[]>(() => ROLES.map((r) => initialEnemy[r]));
  const [focus, setFocus] = useState<Role | undefined>(initialFocus);
  const [hover, setHover] = useState<string>();
  // The slot preview follows the row the pointer rests on, not every row it crosses: a short intent delay, and leaving
  // a row waits a moment so moving to the next row swaps the preview instead of blanking it in between.
  const previewTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const preview = (id: string | undefined) => { clearTimeout(previewTimer.current); previewTimer.current = setTimeout(() => setHover(id), id ? 80 : 120); };
  useEffect(() => () => clearTimeout(previewTimer.current), []);
  const [drawer, setDrawer] = useState<DrawerTarget>();
  const [pinned, setPinned] = useState(false);
  const [filter, setFilter] = useState<Filter>(initialFilter);
  // Pro meta patch: the newest with usable pro evidence unless one is chosen (kept in the URL). Never combined.
  const metaPatches = useMemo(() => patchesOf(drawerData.priority), [drawerData.priority]);
  const [chosenPatch, setChosenPatch] = useState<string | undefined>(() => initialPatch && metaPatches.includes(patchKey(initialPatch)) ? patchKey(initialPatch) : undefined);
  const roomPatch = chosenPatch ?? defaultPatch(drawerData.priority);
  // Pick-order engine (lib/top-draft.ts): first overall for every role, blind / response for Top.
  const reader = useMemo(() => engineReader(drawerData.priority.contributions.flatMap((c) => c.records), data.champions), [drawerData.priority, data.champions]);
  // The slot locked last ("ally:BOT", "enemy:MID"): only it plays the lock acknowledgement.
  const [fresh, setFresh] = useState<string>();
  // My Role: the role I play, kept in this browser. Separate from the role being picked below.
  const [myRole, setMyRoleState] = useState<Role>();
  const [autoBuilds, setAutoBuildsState] = useState(false);
  useEffect(() => {
    try { setMyRoleState(parseRole(localStorage.getItem(MY_ROLE_KEY))); setAutoBuildsState(localStorage.getItem(AUTO_BUILDS_KEY) === "1"); }
    catch { /* storage blocked: the preference lasts for this page only */ }
  }, []);
  const store = (k: string, v: string | undefined) => { try { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k); } catch { /* see above */ } };
  const router = useRouter();
  const [showAll, setShowAll] = useState(false);
  // Clear draft keeps the last board for a few seconds so one misclick in champion select is recoverable.
  const [cleared, setCleared] = useState<{ draft: Draft; enemy: (string | undefined)[] }>();
  useEffect(() => {
    if (!cleared) return;
    const t = setTimeout(() => setCleared(undefined), 8000);
    return () => clearTimeout(t);
  }, [cleared]);
  const board = useRef<HTMLDivElement>(null);
  const drawerIndex = useDrawerIndex(drawerData);
  const hoverCard = useHoverIntent();
  const names = useMemo(() => Object.fromEntries(data.champions.map((c) => [c.id, c.name])), [data.champions]);
  const byName = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of data.champions) { m.set(c.name.toLowerCase(), c.id); c.aliases.forEach((a) => m.set(a.toLowerCase(), c.id)); }
    return m;
  }, [data.champions]);
  const eventMap = useMemo(() => Object.fromEntries((data.events ?? []).map((e) => [e.id, e])), [data.events]);
  const draftLabels = useMemo(() => Object.fromEntries(data.proDrafts.map((d) => [d.id, `${d.team} ${d.seriesGame}`])), [data.proDrafts]);

  // The condensed draft bar appears once the full board scrolls out of view.
  useEffect(() => {
    const el = board.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setPinned(!e.isIntersecting && e.boundingClientRect.top < 0), { threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const update = (next: Draft, nextEnemy = enemy, nextPatch = chosenPatch) => {
    setDraft(next);
    setEnemy(nextEnemy);
    writeUrl(next, nextEnemy, nextPatch, focus);
  };
  const writeUrl = (next: Draft, nextEnemy: (string | undefined)[], nextPatch: string | undefined, nextFocus: Role | undefined) => {
    const q = new URLSearchParams();
    ROLES.forEach((r) => next[r] && q.set(r.toLowerCase(), next[r]!));
    const vs = enemyParam(enemyDraftOf(nextEnemy));
    if (vs) q.set("vs", vs);
    if (nextPatch) q.set("patch", patchLabel(nextPatch));
    // The role tab the user chose, so a refresh or Back keeps it (only while that role is open).
    if (nextFocus && !next[nextFocus]) q.set("focus", nextFocus.toLowerCase());
    if (legacyCheck) q.set("legacy", "1");
    // window.location keeps the GitHub Pages base path; usePathname() would drop it. Marked as the room's own write so
    // the page keeps this room (components/views/DraftRoomView.tsx).
    markOwnQuery(q.toString());
    window.history.replaceState(null, "", `${window.location.pathname}${q.size ? `?${q.toString().replace(/%2C/g, ",")}` : ""}`);
  };
  const lock = (role: Role, id: string | undefined) => {
    clearTimeout(previewTimer.current);
    setHover(undefined);
    setFresh(`ally:${role}`);
    const next = { ...draft, [role]: id };
    update(next);
    // Only a confirmed lock of my own role opens Pro Builds, and only with the preference on (alan, 2026-10-12).
    if (opensBuilds({ myRole, auto: autoBuilds, role, champion: id, previous: draft[role], hasBuilds: !!id && !!buildsEntry(drawerData.builds, id, role) }))
      router.push(myBuildsHref(drawerData.builds, id!, role, draftQuery({ draft: next, vs: enemyParam(enemyDraftOf(enemy)), focus, filter })));
  };
  const lockEnemy = (i: number, id: string | undefined) => { setFresh(`enemy:${ROLES[i]}`); update(draft, enemy.map((e, j) => (j === i ? id : e))); };

  // Everything read from the board is derived once per board change. Hovering a row, opening a card, switching the
  // filter or the role tab re-renders the room without re-ranking the roster (they were 70-160ms long tasks).
  const { boardHits, enemyIds, taken, picks, prof, warns, needs, enemyDraft, proAll, fits, counters, unified, starting, recs, similar, shells } = useMemo(() => {
    const enemyIds = enemy.filter((e): e is string => !!e);
    const picks = picksOf(draft, data.champions);
    const enemyDraft = enemyDraftOf(enemy);
    // Pro meta starting picks for every open role on the room's patch: the list before any pick, labels after.
    const taken = [...(Object.values(draft).filter(Boolean) as string[]), ...enemyIds];
    const marks = roomPatch ? priorityMarks(drawerData.priority, roomPatch) : {};
    const starting = Object.fromEntries(ROLES.filter((r) => !draft[r]).map((r) => [r, roomPatch
      ? startingPicks(drawerData.priority, data.pool, r, roomPatch, { reader }).rows.filter((s) => !taken.includes(s.champion)) : []])) as Partial<Record<Role, StartingPick[]>>;
    // One candidate list per open role (lib/candidates.ts). Pro pairings first: a support seen next to a locked pick in
    // pro games is read for fit even outside the locked bot's saved supports (eligible: false). `fits` is the eligible
    // draft-fit list: picker hints, tab hints, counters' fit rank.
    const started = picks.length > 0 || enemyIds.length > 0;
    const res = draftCandidates(draft, enemyDraft, { ...data, priority: marks }, sources, starting);
    const { pro: proAll, fits, counters } = res;
    const unified = started ? res.unified
      : Object.fromEntries(Object.entries(starting).map(([r, rows]) => [r, startingCandidates(rows!, r as Role, marks)])) as typeof res.unified;
    // The enemy board's traits (General Draft Logic from kit facts), for Jungle composition-response labels.
    const boardHits = boardTraits(ROLES.flatMap((r) => (enemyDraft[r] ? [{ champion: enemyDraft[r]!, role: r }] : [])), data.jungleBoard.facts);
    return {
      boardHits, enemyIds, picks, enemyDraft, proAll, fits, counters, unified, starting, taken,
      prof: profile(draft, data.champions),
      warns: warnings(draft, data.champions),
      needs: picks.length ? teamNeeds(picks) : [],
      recs: Object.fromEntries(Object.entries(fits).map(([r, list]) => [r, list!.slice(0, REC_LIMIT)])) as typeof fits,
      similar: similarProDrafts(draft, data.proDrafts),
      shells: similarShells(draft, data.shells),
    };
  }, [draft, enemy, data, sources, roomPatch, drawerData.priority, reader]);
  const proCtx: ProCtx = useMemo(() => ({ drafts: data.proDrafts, sources, enemy: enemyDraft, names }), [data.proDrafts, sources, enemyDraft, names]);
  const open = ROLES.filter((r) => !draft[r]);
  const lockedCount = ROLES.length - open.length;
  const started = lockedCount > 0 || enemyIds.length > 0;
  // One plan read for every Comp Check surface (rail, phone line, header badge). The rule warnings above stay for the
  // ?legacy=1 debugging view only.
  const planRead = usePlanRead(draft, enemyIds, data.champions, data.botPairings);

  // The role being picked: the one the user chose, else the open lane partner of a locked pick, else the open role
  // with the strongest fit.
  const topScore = (r: Role) => recs[r]?.[0]?.score ?? (started ? -99 : -99 - ROLES.indexOf(r)); // nothing locked: Top first
  const partnered = open.filter((r) => PARTNER[r] && draft[PARTNER[r]!]);
  const active: Role | undefined = focus && open.includes(focus) ? focus
    : [...(partnered.length ? partnered : open)].sort((a, b) => topScore(b) - topScore(a))[0];
  const activeRows = active ? unified[active] ?? [] : [];
  // Back on an empty board in this tab (the sidebar's Draft Room link): highlight the role left highlighted (read before
  // the effect below records this render's role).
  useEffect(() => {
    const r = restoredDraftRole(sessionStore(), { urlFocus: initialFocus, emptyBoard: !Object.values(initial).some(Boolean) && !Object.values(initialEnemy).some(Boolean) });
    if (r && r !== initialFocus) setFocus(r);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Synergies navigation follows the highlighted role (lib/synergy-nav.ts), never My Role.
  useEffect(() => { if (active) noteDraftRole(active); }, [active]);
  // A chosen tab goes in the room's URL; the first render already matches it.
  const focusWritten = useRef(focus);
  useEffect(() => {
    if (focusWritten.current === focus) return;
    focusWritten.current = focus;
    writeUrl(draft, enemy, chosenPatch, focus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus]);
  // Nothing locked: only the starting views apply, each in its own order (real counts, lib/starting-picks.ts).
  const startView: StartView = START_FILTERS.some((f) => f.key === filter) ? filter as StartView : "all";
  const viewFilter: Filter = started ? filter : startView;
  // A new role or filter starts collapsed again.
  const listKey = `${active}-${filter}`;
  const [shownFor, setShownFor] = useState(listKey);
  if (shownFor !== listKey) { setShownFor(listKey); setShowAll(false); }
  const activeCounters: RoleCounters | undefined = active ? counters[active] : undefined;
  const shownRows = started ? activeRows.filter((c) => hasSignal(c, filter))
    : active ? startingCandidates(sortForView(starting[active] ?? [], startView), active, roomPatch ? priorityMarks(drawerData.priority, roomPatch) : {}) : [];
  const visibleRows = viewFilter === "all" && !showAll ? shownRows.slice(0, ROW_LIMIT) : shownRows;
  // The first starting pick outside your pool gets a divider in the Recommended order.
  const firstOut = !started && startView === "all" ? visibleRows.find((c) => !c.meta?.tier && visibleRows.some((x) => x.meta?.tier))?.champion : undefined;
  const scope = roomPatch ? patchLabel(roomPatch) : undefined;
  const choosePatch = (p: string) => { const next = p === defaultPatch(drawerData.priority) ? undefined : p; setChosenPatch(next); update(draft, enemy, next); };
  const proIds = active ? (proAll[active] ?? []).map((s) => s.champion) : [];
  const proSourceLine = `Recorded Gol.gg games next to your picks: ${(data.events ?? []).map((e) => `${e.short} ${patchLabel(e.patch)}${e.status === "ongoing" ? " (ongoing)" : ""}`).join(" · ")}. Evidence, never part of the order.`;
  const laneFoes = active ? LANE[active].map((r) => enemy[ROLES.indexOf(r)]).filter((e): e is string => !!e) : [];

  const cards: CardRecord[] = ROLES.flatMap((role): CardRecord[] => {
    const id = draft[role];
    if (!id) return [];
    if (role === "BOT") { const r = data.botPairings.find((b) => b.champion === id); if (r) return [{ kind: "bot", record: r }]; }
    if (role === "MID" || role === "JUNGLE") { const r = data.midJungle.find((m) => m.anchor === id && m.role === role); if (r) return [{ kind: "mid-jungle", record: r }]; }
    if (role === "TOP") { const r = data.topPicks.find((t) => t.champion === id); if (r) return [{ kind: "top", record: r, stats: metaPicks[id] }]; }
    // No saved record in this role: Claude's proposed partners (labelled Proposed), when there are any.
    const card = proposedCard(id, role, data.proposed, data);
    return card.links.length ? [card] : [];
  });
  const pickNotes = cards.flatMap((c) => c.kind === "bot" && c.record.logic.warning
    ? [{ id: c.record.champion, text: c.record.logic.warning }]
    : c.kind === "top" ? [{ id: c.record.champion, text: `avoid ${c.record.logic.avoid}` }] : []);

  // My champion's Pro Builds link carries the whole draft back (lib/my-role.ts).
  const setMyRole = (r: Role | undefined) => { setMyRoleState(r); store(MY_ROLE_KEY, r); if (r && !draft[r]) setFocus(r); };
  const setAutoBuilds = (on: boolean) => { setAutoBuildsState(on); store(AUTO_BUILDS_KEY, on ? "1" : undefined); };
  const mine = myRole ? draft[myRole] : undefined;
  const myEntry = mine && myRole ? buildsEntry(drawerData.builds, mine, myRole) : undefined;
  const myHref = mine && myRole ? myBuildsHref(drawerData.builds, mine, myRole, draftQuery({ draft, vs: enemyParam(enemyDraft), focus, filter })) : undefined;

  const slotProps = { names, byName, champions: data.champions, taken, onOpen: (id: string, role?: Role) => { hoverCard.hide(); setDrawer({ id, role }); },
    onHover: hoverCard.hover, onUnhover: hoverCard.unhover };

  return (
    <div className="draft-room">
      <header className="page-header draft-head">
        <div className="titles"><h1>Draft Room</h1></div>
        <div className="actions">
          <span className="xs muted tnum">{lockedCount}/5 locked{enemyIds.length ? ` · ${enemyIds.length} enemy` : ""}</span>
          {lockedCount >= 2 && <CompStatus read={planRead} />}
          {cleared
            ? <button className="btn sm" onClick={() => { update(cleared.draft, cleared.enemy); setCleared(undefined); }}>Draft cleared · Undo</button>
            : <button className="btn sm" title="Unlock every pick on both teams" onClick={() => { setCleared({ draft, enemy }); setFocus(undefined); update({}, ROLES.map(() => undefined)); }} disabled={!started}>Clear draft</button>}
        </div>
      </header>

      <div className="my-role">
        <span className="label" id="my-role-label">I&apos;m playing</span>
        <div className="seg" role="group" aria-labelledby="my-role-label">
          {ROLES.map((r) => (
            <button key={r} type="button" className={r === myRole ? "active" : undefined} aria-pressed={r === myRole}
              title={r === myRole ? "Your role. Click again to clear it." : `You play ${ROLE_LABEL[r]}: your slot is marked and its champion links to Pro Builds`}
              onClick={() => setMyRole(r === myRole ? undefined : r)}>{ROLE_LABEL[r]}</button>
          ))}
        </div>
        {myRole && (
          <label className="check xs" title="Only a confirmed lock in your own role opens Pro Builds; your draft is kept for the way back">
            <input type="checkbox" checked={autoBuilds} onChange={(e) => setAutoBuilds(e.target.checked)} /> Open Pro Builds when I lock
          </label>
        )}
        {mine && myRole && myHref && (
          <span className="my-builds">
            <ChampIcon id={mine} name={names[mine] ?? mine} role={myRole} size="xs" />
            <span className="xs muted tnum"><b className="my-name">{names[mine] ?? mine}</b> · {myEntry ? `${myEntry.games} recorded build${myEntry.games > 1 ? "s" : ""} · latest ${patchLabel(myEntry.latest)}` : "No recorded builds in this role"}</span>
            <Link className="btn sm" href={myHref}>View Pro Builds →</Link>
          </span>
        )}
      </div>

      <div className="board" ref={board}>
        <div className="team-row ally">
          <div className="team-label">My team</div>
          <div className="draft-slots">
            {ROLES.map((role) => (
              <DraftSlot key={role} side="ally" role={role} value={draft[role]} fresh={fresh === `ally:${role}`} active={role === active} mine={role === myRole} builds={role === myRole ? myHref : undefined} preview={role === active ? hover : undefined}
                onActivate={() => setFocus(role)} onLock={(id) => lock(role, id)} suggested={recs[role]} {...slotProps} />
            ))}
          </div>
        </div>
        <div className="team-row enemy">
          <div className="team-label">Enemy</div>
          <div className="draft-slots">
            {ROLES.map((role, i) => (
              <DraftSlot key={role} side="enemy" role={role} value={enemy[i]} fresh={fresh === `enemy:${role}`} onLock={(v) => lockEnemy(i, v)} {...slotProps} />
            ))}
          </div>
        </div>
      </div>

      {/* Narrow screens put Comp Check below the list: one line says what the draft is missing, here and pinned */}
      <CompSummaryLine read={planRead} active={active} className="cc-summary-board" />
      <MiniBoard show={pinned} draft={draft} enemy={enemy} active={active} names={names} onActivate={setFocus}
        summary={<CompSummaryLine read={planRead} active={active} className="cc-summary-mini" />} />

      <div className="draft-layout">
        <div className="draft-main">
          <section className="recs" aria-label="Recommended Picks">
            {!open.length ? <p className="rec-empty">All five roles are locked.</p> : (
              <>
                <div className="role-tabs" role="tablist" aria-label="Role to pick" onKeyDown={(e) => rovingKeys(e)}>
                  {open.map((r) => {
                    const top = unified[r]?.[0];
                    return (
                      <button key={r} role="tab" aria-selected={r === active} tabIndex={rovingIndex(r === active)} className={`role-tab role-${r} ${r === active ? "active" : ""}`} onClick={() => setFocus(r)}>
                        <span className="role-name">{ROLE_LABEL[r]}</span>
                        {top && r !== active && <span className="tab-top"><ChampIcon id={top.champion} name={names[top.champion]} size="xs" />{names[top.champion]}</span>}
                      </button>
                    );
                  })}
                </div>
                {active && (
                  <div className={`fit-role role-${active}`} role="tabpanel" aria-label={`${ROLE_LABEL[active]} recommendations`}>
                    <div className="fit-context">
                      <div className="seg fit-filters" role="group" aria-label="Show recommendations by signal">
                        {(started ? FILTERS : START_FILTERS).map((f) => {
                          const n = started ? (f.key === "all" ? activeRows.length : activeRows.filter((c) => hasSignal(c, f.key)).length)
                            : sortForView(starting[active] ?? [], f.key as StartView).length;
                          const off = (f.key === "counter" && !activeCounters) || (f.key === "blind" && !n && !(starting[active] ?? []).some((s) => s.blind != null));
                          return (
                            <button key={f.key} type="button" className={viewFilter === f.key ? "active" : undefined} aria-pressed={viewFilter === f.key} disabled={off}
                              title={off ? (f.key === "blind" ? BLIND_OFF : "Add the enemy lane opponent to read counters") : f.key === "pro" ? proSourceLine : undefined} onClick={() => setFilter(f.key)}>
                              {f.label}{!off && <span className="n tnum">{n}</span>}
                            </button>
                          );
                        })}
                      </div>
                      {laneFoes.length
                        ? <span className="vs">vs {laneFoes.map((id, i) => <span key={id}>{i > 0 && " + "}<b>{names[id]}</b></span>)}</span>
                        : enemyIds.length ? <span className="vs muted">vs {enemyIds.map((id) => names[id]).join(" · ")}</span> : null}
                      {started ? <span className="order-note xs faint" title={ORDER_NOTE}>Preferred, then comp fit</span>
                        : <span className="order-note xs faint" title={START_NOTE}>Pro meta starting picks</span>}
                    </div>
                    {scope && (
                      <div className="fit-scope xs muted">
                        <span>Pro meta · {ROLE_LABEL[active]}</span>
                        {metaPatches.length > 1
                          ? <Select label="Pro meta patch" value={roomPatch!} options={metaPatches.map((p) => ({ value: p, label: `Patch ${patchLabel(p)}${p === defaultPatch(drawerData.priority) ? " (latest)" : ""}` }))} onChange={choosePatch} />
                          : <span className="tnum">Patch {scope}</span>}
                        <ScopeLine priority={drawerData.priority} patch={roomPatch!} events={eventMap} />
                      </div>
                    )}
                    {activeCounters && (filter === "counter" || activeCounters.note) && (
                      <p className="fit-note xs muted">
                        {activeCounters.counters.length ? `Counters vs ${vsNames(activeCounters.vs, names)}${activeCounters.scope === "duo" ? " (duo)" : ""}.` : `No reliable counter data for ${vsNames(activeCounters.vs, names)}.`}
                        {activeCounters.note ? ` ${activeCounters.note}` : ""}
                      </p>
                    )}
                    {!started && !visibleRows.length && startView === "all"
                      ? <div className="rec-empty start"><GenRang size={44} /><span>No recorded pro picks for {ROLE_LABEL[active]}{scope ? ` on patch ${scope}` : ""}. Lock a pick and recommendations for the open role appear here.</span></div>
                      : visibleRows.length
                        ? visibleRows.map((c) => (
                          <Fragment key={c.champion}>
                            {c.champion === firstOut && <p className="fit-divider xs faint">Outside your pool</p>}
                            <FitRow c={c} tier={poolTier(data.pool, c.champion, active)} bot={draft.BOT ? names[draft.BOT] ?? draft.BOT : undefined} names={names} proCtx={proCtx} hovered={hover === c.champion}
                              onHover={(h) => preview(h ? c.champion : undefined)} onPick={() => lock(active, c.champion)} onOpen={() => setDrawer({ id: c.champion, role: active })}
                              top={isLaneRole(active) ? laneCtx(data.laneUsage[active], c.champion, enemyDraft, draft, active === "JUNGLE" ? { hits: boardHits, responses: data.jungleBoard.responses[c.champion] ?? [] } : undefined) : undefined} />
                          </Fragment>
                        ))
                        : <p className="rec-empty">{viewFilter === "all" ? "Nothing stands out yet." : viewFilter === "counter" && activeCounters?.counters.length === 0 ? "No counters to show." : "No candidate has this signal yet."}</p>}
                    {visibleRows.length < shownRows.length && (
                      <button type="button" className="btn sm fit-more" onClick={() => setShowAll(true)}>Show all {shownRows.length}</button>
                    )}
                  </div>
                )}
              </>
            )}
          </section>

        </div>

        <CompCheck read={planRead} legacy={legacyCheck} draft={draft} enemyIds={enemyIds} champions={data.champions} botPairings={data.botPairings} active={active}
          bestOverall={activeRows.find((c) => !c.theoretical)?.champion} bestFixId={active ? fits[active]?.find((r) => r.bestFix)?.champion : undefined} proIds={proIds} names={names} grid={(siege, disengage) => <Indicators prof={prof} flags={planFlags(planRead)} picks={picks.length} siege={siege} disengage={disengage} />}>
          {legacyCheck && <div className="cc-section">
            <div className="cc-label">Rule checks (debug, ?legacy=1)</div>
            {!warns.length && (lockedCount < 2 ? <p className="xs muted">Needs two picks.</p> : <p className="cc-ok">No warnings.</p>)}
            {[...warns].sort((a, b) => Number(severityOf(b) === "critical") - Number(severityOf(a) === "critical")).map((w) => (
              <details key={w.id} className={`warning-item ${severityOf(w)}`}>
                <summary><WarningBadge severity={severityOf(w)} />{w.label}</summary>
                <p>{w.why}</p>
                <p className="xs muted">Rule: {w.rule}.</p>
              </details>
            ))}
          </div>}
          {pickNotes.length > 0 && (
            <div className="cc-section notes">
              <div className="cc-label">Pick notes</div>
              {pickNotes.map((n) => <p key={n.id}><b>{names[n.id]}:</b> {n.text}</p>)}
            </div>
          )}
          {legacyCheck && <details className="rules cc-section">
            <summary>All {RULES.length} rules</summary>
            <ul>{RULES.map((r) => <li key={r.id}><b>{r.label}:</b> {r.rule}</li>)}</ul>
          </details>}
        </CompCheck>
      </div>

      <div className="draft-research">
        {cards.length > 0 && (
          <Disclosure section summary="Locked picks" meta={`${cards.length}`}>
            <div className="grid cols-auto">{cards.map((c) => (
              <PairingCard key={c.kind + (c.kind === "proposed" ? c.id + c.role : "champion" in c.record ? c.record.champion : c.record.anchor)} item={c} names={names} sources={sources} events={eventMap} compact draftLabels={draftLabels} />
            ))}</div>
          </Disclosure>
        )}
        {similar.length > 0 && <Disclosure section lazy summary="Similar pro drafts" meta={`${similar.length}`}>
          {(
            <div className="table-wrap">
              <table>
                <thead><tr><th>Game</th><th>Team</th>{ROLES.map((r) => <th key={r}><span className={`role-tag role-${r}`}>{r}</span></th>)}</tr></thead>
                <tbody>{similar.map(({ draft: d }) => (
                  <tr key={d.id}>
                    <td><Link className="cell-link nowrap" href={`/pro-drafts?id=${d.id}`}>{d.seriesGame}</Link></td><td className="muted nowrap">{d.team}</td>
                    {ROLES.map((r) => <td key={r}><ChampionRow id={d.picks[r]} name={names[d.picks[r]] ?? d.picks[r]} role={r} hit={draft[r] === d.picks[r]} /></td>)}
                  </tr>))}</tbody>
              </table>
            </div>
          )}
        </Disclosure>}
        {shells.length > 0 && <Disclosure section lazy summary="Similar comps" meta={`${shells.length}`}>
          <div className="shell-list">
            {shells.map(({ shell, exact, swap }) => (
              <div key={shell.id} className="shell-line">
                <div className="row">
                  <Link href={`/comps#${shell.id}`}><b>{shell.name}</b></Link>
                  <span className="xs faint">{shell.kind === "observed" ? "pro" : "template"}</span>
                  <span className="xs muted tnum">{exact} exact · {swap} swap</span>
                </div>
                <p className="xs muted">{ROLES.map((r) => names[shell.slots[r].champion]).join(" · ")} · {shell.winCondition}</p>
              </div>
            ))}
          </div>
        </Disclosure>}
      </div>

      {hoverCard.card && !drawer && (
        <ChampionHoverCard key={`${hoverCard.card.t.id}-${hoverCard.card.t.role}`} target={hoverCard.card.t} anchor={hoverCard.card.el} swap={hoverCard.card.swap} data={drawerData} index={drawerIndex}
          onEnter={hoverCard.keep} onLeave={hoverCard.unhover} />
      )}
      {drawer && <ChampionDrawer target={drawer} data={drawerData} index={drawerIndex} onClose={() => setDrawer(undefined)} onSelect={setDrawer}
        context={{ page: "draft", locked: [...Object.values(draft), ...enemy].filter((x): x is string => !!x), from: draftQuery({ draft, vs: enemyParam(enemyDraft), focus, filter }) }} />}
    </div>
  );
}

// ---------- recommendation rows ----------

type Chip = { key: string; label: string; title?: string; href?: string };
// Under five classified games the usage word stays neutral: the counts, flagged (alan, 2026-10-13: Nocturne 3/3 on 26.18).
const smallUsage = (m: TopUsageMark) => (m.usage === "blind" ? `Blind ${m.blind}/${m.classified}` : m.usage === "response" ? `Response ${m.response}/${m.classified}` : `Blind ${m.blind} · response ${m.response} of ${m.classified}`) + " · small sample";

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
const proLine = (pro: ProSuggestion) => pro.lines.map((l) => `${describeLine({ ...l, label: l.event })}${l.ongoing ? " · ongoing" : ""}`).join("; ");
const BONUS = new Set(["saved", "proposed"]);

// The row's labels, one per independent signal, each in its own layer colour. Nothing here changes the order.
type TopCtx = {
  mark?: TopUsageMark; patch?: string; enemyTop?: string; enemyDuo?: [string, string]; blind?: BlindLine[];
  allyMid?: string; mid?: MidPair; // JUNGLE with a mid locked: the pair's pro games on every patch
  comp?: (CompResponse & { champions: string[] })[]; // JUNGLE: its composition responses whose trait is on the enemy board now
};

/** The lane usage context for one candidate: its mark, the enemy lane opponent and, for Bot and Support, the whole enemy
 *  bot lane once both are locked. */
const laneCtx = (u: TopUsageMarks, id: string, enemy: Partial<Record<Role, string>>, ally: Partial<Record<Role, string>>, board?: { hits: TraitHit[]; responses: CompResponse[] }): TopCtx => ({
  allyMid: u.role === "JUNGLE" ? ally.MID : undefined,
  mid: u.role === "JUNGLE" && ally.MID ? u.withMid?.[id]?.[ally.MID] : undefined,
  comp: board?.responses.flatMap((r) => { const h = board.hits.find((x) => x.trait === r.trait); return h ? [{ ...r, champions: h.champions }] : []; }),
  mark: u.marks[id], patch: u.patch, enemyTop: u.role ? enemy[u.role] : undefined, blind: u.blind[id],
  enemyDuo: (u.role === "BOT" || u.role === "SUPPORT") && enemy.BOT && enemy.SUPPORT ? [enemy.BOT, enemy.SUPPORT] : undefined,
});
const LANE_WORD: Record<string, string> = { TOP: "top", JUNGLE: "jungle", MID: "mid", BOT: "ADC", SUPPORT: "support" };

// Lane draft usage (lib/top-draft.ts): when pros picked this champion in the role, and what it was picked into. Observed
// Pro Evidence: a label and a detail line, never part of the order or the comp fit.
const topUsageTitle = (c: Candidate, t: TopCtx, names: Record<string, string>) => {
  const m = t.mark!, p = t.patch ? patchLabel(t.patch) : "all patches", lane = LANE_WORD[c.role] ?? c.role.toLowerCase();
  const n = (id: string) => names[id] ?? id;
  const duo = t.enemyDuo ? m.duoInto?.[t.enemyDuo.join("+")] : undefined;
  const into = t.enemyTop ? m.into[t.enemyTop] : undefined;
  const base = `Patch ${p} pro games at ${lane}: blind ${m.blind}/${m.classified}, response ${m.response}/${m.classified}${m.low ? " (small sample)" : ""}.`;
  if (duo) return `${base} Its duo was completed after ${n(t.enemyDuo![0])} + ${n(t.enemyDuo![1])} were both known in ${duo.games} game${duo.games === 1 ? "" : "s"} (${duo.series} series, won ${duo.wins}): ${duo.series >= 2 ? "a repeated response" : "an observed response"}, not a counter. Never part of the order or the fit.`;
  if (into) return `${base} Picked after ${n(t.enemyTop!)} was revealed in ${into.games} game${into.games === 1 ? "" : "s"} (${into.series} series): ${PAIR_LABEL[into.status].toLowerCase()}${into.status === "supported" ? "" : ", not a proven counter"}. Never part of the order or the fit.`;
  return `${base} Being blinded often is not proof it is safe to blind. Never part of the order or the fit.`;
};

// Mid/Jungle pairing (alan, 2026-10-13): pro games with the locked mid on every patch, who was picked first, games per
// patch. Same-turn picks are never ordered; picked after the mid does not mean picked for that mid.
const midTitle = (t: TopCtx, names: Record<string, string>) => {
  const m = t.mid!, mid = names[t.allyMid!] ?? t.allyMid!;
  const order = [`jungler first ${m.jungleFirst}`, `same turn ${m.together}`, `mid first ${m.midFirst}`, ...(m.unknown ? [`no order recorded ${m.unknown}`] : [])].join(", ");
  const patches = Object.entries(m.byPatch).sort(([a], [b]) => comparePatch(b, a)).map(([p, n]) => `${patchLabel(p)}: ${n}`).join(", ");
  return `Every recorded pro game with ${mid} at mid, the LCK archive included: ${m.games} game${m.games === 1 ? "" : "s"} (${m.series} series, won ${m.wins}/${m.games}; ${patches}). The Pro label is narrower: stored drafts with your locked picks only, so it can show fewer. Order: ${order}. ${m.series >= 2 ? "A repeated" : "An observed"} pro pairing, not a saved one; picked after the mid does not mean picked for it. Never part of the order or the fit.`;
};
const compTitle = (r: CompResponse & { champions: string[] }, names: Record<string, string>) =>
  `${TRAIT_LABEL[r.trait]} was on the enemy board in ${r.with} of this jungler's ${r.picks} ordered pro picks (all patches), against ${Math.round((r.base / r.baseOf) * 100)}% of every jungle pick. On your enemy board now: ${r.champions.map((x) => names[x] ?? x).join(", ")}. A potential composition response read from kits (general draft logic): what was visible, not why teams picked, and not a counter. Never part of the order or the fit.`;
const lower1 = (s: string) => s[0].toLowerCase() + s.slice(1);

function chipsOf(c: Candidate, names: Record<string, string>, bot?: string, tier?: Tier | null, top?: TopCtx): Chip[] {
  const r = c.fit;
  const out: Chip[] = [];
  // alan's pool tier in this role, or a clear "Not in pool": never changed by anything here.
  out.push(tier ? { key: `tier ${tier}`, label: tierLabel(tier), title: `Your Champion Pool: ${tierLabel(tier)} (${ROLE_LABEL[c.role]})` }
    : { key: "tier out", label: "Not in pool", title: `Not in your ${ROLE_LABEL[c.role]} pool` });
  if (r.eligible && r.saved) {
    out.push(r.savedFromPro
      ? { key: "syn alt", label: "Synergy · Alt (pro)", title: "Alternative from pro games, not hand-saved" }
      : { key: `syn ${r.saved}`, label: `Synergy · ${STATUS[r.saved]}`, title: "Your saved pairing with a locked pick" });
  } else if (r.eligible && r.proposed) {
    out.push({ key: "syn proposed", label: "Proposed", title: "Proposed synergy with a locked pick: kit-based synergy that hasn't been added to your saved pairings." });
  }
  if (c.pro) out.push({ key: "pro", label: `Pro · ${plural(c.pro.score, "game")}` }); // rendered as the Pro evidence popover
  // One label when a pick is both, so "Best fix · Best fit" never reads as a typo
  const FIX = "Covers the most of this role's needs", FIT = "Top three on comp fit: synergy with your picks, team needs, matchups and risks";
  if (r.bestFix && c.bestFit) out.push({ key: "fix", label: "Best fix and fit", title: `Best fix: ${FIX.toLowerCase()}. Best fit: ${FIT.toLowerCase()}` });
  else if (r.bestFix) out.push({ key: "fix", label: "Best fix", title: FIX });
  else if (c.bestFit) out.push({ key: "fit", label: "Best fit", title: FIT });
  if (c.counter) out.push({ key: "counter", label: "Counter" }); // rendered as the Counter popover
  if (c.priority) out.push({ key: "prio", label: `Pro priority · ${Math.round(c.priority.presence * 100)}%`, title: priorityTitle(c) });
  const tu = top?.mark;
  if (tu) {
    const duo = top.enemyDuo ? tu.duoInto?.[top.enemyDuo.join("+")] : undefined;
    const into = top.enemyTop ? tu.into[top.enemyTop] : undefined;
    if (duo) out.push({ key: "usage", label: `Picked into ${top.enemyDuo!.map((x) => names[x] ?? x).join(" + ")} · ${duo.games}`, title: topUsageTitle(c, top, names) });
    else if (top.enemyTop && into) out.push({ key: "usage", label: `Picked into ${names[top.enemyTop] ?? top.enemyTop} · ${into.games}`, title: topUsageTitle(c, top, names) });
    else if (!top.enemyTop && tu.usage !== "too-few") out.push({ key: "usage", label: tu.low ? smallUsage(tu) : USAGE_LABEL[tu.usage], title: topUsageTitle(c, top, names) });
  }
  if (top?.mid && top.allyMid) out.push({ key: "mate", label: `With ${names[top.allyMid] ?? top.allyMid} · ${plural(top.mid.games, "game")}`, title: midTitle(top, names),
    href: `/synergies/jungle/?champ=${c.champion}&view=mates&mate=${top.allyMid}` });
  for (const r of top?.comp ?? []) out.push({ key: "comp", label: `Picked vs ${lower1(TRAIT_LABEL[r.trait])} · ${r.with}/${r.picks}`, title: compTitle(r, names),
    href: `/synergies/jungle/?champ=${c.champion}&view=matchups` });
  // Pro meta counts: each opens the games behind it (rendered as MetaEvidenceTrigger).
  const rot = c.meta && c.meta.firstRotation > 0 ? rotationLabel(c.meta) : undefined;
  if (rot) out.push({ key: "rot", label: rot });
  // Top already carries the usage label ("Often blinded", "Picked into …"); the count shows on other roles only.
  const blind = c.meta && (c.meta.blind ?? 0) > 0 && !out.some((x) => x.key === "usage") ? blindLabel(c.meta) : undefined;
  if (blind) out.push({ key: "blind", label: blind });
  // Nothing locked and no other label: the role picks themselves open the evidence.
  if (c.meta && !c.priority && !rot && !blind && !out.some((x) => x.key === "usage")) out.push({ key: "meta", label: c.meta.rolePicks != null ? `Pro · ${plural(c.meta.rolePicks, `${ROLE_LABEL[c.role].toLowerCase()} pick`)}` : `Pro · ${plural(c.meta.picks, "pick")}` });
  if (c.theoretical) out.push({ key: "theory", label: "Theoretical", title: `Not one of ${bot ?? "the bot"}'s saved supports: theoretical, not recommended` });
  if (r.parts.some((p) => p.kind === "risk")) out.push({ key: "risk", label: "Risk" });
  return out;
}

// Presence carried by bans (twice the picks or more) says little about pick behaviour (alan, 2026-10-13: Nocturne 46 bans, 3 picks).
const banHeavy = (p: { picks: number; bans: number }) => p.bans >= 2 * p.picks;
const priorityTitle = (c: Candidate) => {
  const p = c.priority!;
  const n = p.rolePicks[c.role] ?? 0;
  return `Patch ${patchLabel(p.patch)}: picked or banned in ${Math.round(p.presence * 100)}% of ${p.games} pro games (${p.picks} picks, ${n} as ${c.role.toLowerCase()}; ${p.bans} bans, champion-wide).${banHeavy(p) ? " Mostly bans: ban priority, not evidence about when or how it is picked." : ""} Pro meta context only: it does not change the order or the fit.`;
};

/** Main benefit and potential drawback, one line. */
function reasonOf(c: Candidate): { benefit: string; drawback?: string } {
  const r = c.fit;
  if (!r.parts.length && c.meta) return { benefit: `Patch ${patchLabel(c.meta.patch)}: ${startLine(c.meta, ROLE_LABEL[c.role], false)}` }; // first rotation is its own label
  const lead = r.parts.find((p) => p.points > 0 && !BONUS.has(p.kind));
  const benefit = r.fixes.length ? `Fixes ${r.fixes.join(", ").toLowerCase()}`
    : lead?.text ?? (c.pro ? proLine(c.pro) : r.parts.find((p) => BONUS.has(p.kind))?.text ?? (c.counter ? `Counter: ${describeEvidence(c.counter.evidence)}` : "No comp reasons yet"));
  const risk = r.parts.find((p) => p.kind === "risk" && !p.text.startsWith("Tradeoff"));
  return { benefit, drawback: r.tradeoffs[0] ?? risk?.text };
}

function FitRow({ c, tier, bot, names, proCtx, hovered, onHover, onPick, onOpen, top }: {
  c: Candidate; tier?: Tier | null; bot?: string; names: Record<string, string>; proCtx: ProCtx; hovered: boolean; top?: TopCtx;
  onHover: (on: boolean) => void; onPick: () => void; onOpen: () => void;
}) {
  const [open, setOpen] = useState(false);
  const rec = c.fit;
  const name = names[c.champion] ?? c.champion;
  const tctx = top?.mark || top?.mid || top?.comp?.length ? top : undefined;
  const chips = chipsOf(c, names, bot, tier, tctx);
  const metaChip = new Set(["prio", "rot", "blind", "meta"]);
  const { benefit, drawback } = reasonOf(c);
  const counter = c.counter;
  const read = rec.parts.length > 0;
  return (
    <div className={`fit-row ${open ? "open" : ""} ${hovered ? "hovered" : ""} ${c.theoretical ? "ref" : ""}`} onMouseEnter={() => onHover(true)} onMouseLeave={() => onHover(false)}>
      <button className="fit-icon" onClick={onOpen} aria-label={`${name} details`} title={`${name}: details`}>
        <ChampIcon id={c.champion} name={name} role={c.role} size="md" />
      </button>
      {/* The lock button covers the whole head (stretched); the evidence labels sit above it so they open their own cards. */}
      <div className="fit-head">
        <span className="fit-line">
          <button type="button" className="name fit-lock" onClick={onPick} onFocus={() => onHover(true)} onBlur={() => onHover(false)}
            aria-label={`Lock ${name} at ${ROLE_LABEL[c.role]}`}>{name}</button>
          {chips.length > 0 && <span className="sig-line">{chips.map((s) => s.key === "pro" && c.pro
            ? <ProEvidenceTrigger key={s.key} pro={c.pro} champion={c.champion} role={c.role} ctx={proCtx}
              mate={tctx?.mid && tctx.allyMid ? { name: names[tctx.allyMid] ?? tctx.allyMid, games: tctx.mid.games } : undefined} />
            : s.key === "counter" && counter ? <CounterTrigger key={s.key} c={counter} names={names} />
              : metaChip.has(s.key) && c.meta ? <MetaEvidenceTrigger key={s.key} s={c.meta} label={s.label} cls={s.key} names={names} />
              : s.href ? <Link key={s.key} className={`sig ${s.key} sig-link`} href={s.href} title={s.title}>{s.label}</Link>
                : <span key={s.key} className={`sig ${s.key}`} title={s.title}>{s.label}</span>)}</span>}
        </span>
        <span className="fit-reason truncate">{benefit}{drawback && <span className="drawback"> · {drawback}</span>}</span>
      </div>
      {read ? <FitScore c={c} />
        : c.meta && !c.fit.parts.length && !c.pro && !c.counter ? <span className="fit-score" aria-hidden="true" />
          : <span className="fit-score" title="No champion attributes yet, so no comp fit">—</span>}
      <button className="fit-toggle" aria-expanded={open} aria-label={`Why ${name}`} title={`${rec.parts.length} reasons`} onClick={() => setOpen((o) => !o)}>
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 3.5 5 6.5 8 3.5" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>
      </button>
      <div className="fit-detail">
        {(rec.fixes.length > 0 || rec.also.length > 0 || rec.tradeoffs.length > 0) && (
          <dl className="fit-read">
            {rec.fixes.length > 0 && <><dt>Fixes</dt><dd>{rec.fixes.join(", ")}</dd></>}
            {rec.also.length > 0 && <><dt>Also</dt><dd>{rec.also.join(", ")}</dd></>}
            {rec.tradeoffs.length > 0 && <><dt>Tradeoff</dt><dd>{rec.tradeoffs.join("; ")}</dd></>}
          </dl>
        )}
        {read && <ul className="fit-why">{rec.parts.map((p, i) => (
          <li key={i} className={`k-${p.kind}`}><span className="k">{KIND_LABEL[p.kind] ?? p.kind}</span><span className="t">{p.text}</span><span className="pts">{BONUS.has(p.kind) ? "" : `${p.points > 0 ? "+" : ""}${p.points}`}</span></li>
        ))}</ul>}
        {c.pro && (
          <div className="fit-pro">
            <span className="k">Pro</span>
            <span className="t">With {c.pro.with.map((id) => names[id] ?? id).join(" or ")} · {proLine(c.pro)}</span>
          </div>
        )}
        {counter && (
          <div className="fit-counter">
            <span className="k">Counter</span>
            <span className="t">{counterLine(counter, names)} · Pool: {tierLabel(counter.tier)}{counter.fitRank ? ` · draft fit #${counter.fitRank}` : ""}{counter.cautions.length ? ` · ${counter.cautions.join("; ")}` : ""}</span>
          </div>
        )}
        {c.priority && (
          <div className="fit-pro">
            <span className="k">Priority</span>
            <span className="t">{priorityTitle(c)}</span>
          </div>
        )}
        {tctx?.mark && (
          <div className="fit-pro">
            <span className="k">Usage</span>
            <span className="t">{topUsageTitle(c, tctx, names)}</span>
          </div>
        )}
        {tctx?.mid && (
          <div className="fit-pro">
            <span className="k">Mid/Jungle</span>
            <span className="t">{midTitle(tctx, names)}</span>
          </div>
        )}
        {tctx?.comp?.map((r) => (
          <div key={r.trait} className="fit-logic">
            <span className="k">Comp response</span>
            <span className="t">{compTitle(r, names)}</span>
          </div>
        ))}
        {tctx && !tctx.enemyTop && tctx.blind && tctx.blind.length > 0 && (
          <div className="fit-logic">
            <span className="k">Blind read</span>
            <span className="t">{tctx.blind.map((l) => `${l.tone === "minus" ? "− " : l.tone === "plus" ? "+ " : ""}${l.text}`).join(" · ")} <span className="faint">(general draft logic)</span></span>
          </div>
        )}
        {!rec.eligible && c.pro && <p className="fit-note xs muted">Not one of {bot ?? "the bot"}&apos;s saved supports: a pro pairing, not a saved one.</p>}
        {c.meta && (
          <div className="fit-pro">
            <span className="k">Pro meta</span>
            <span className="t">Patch {patchLabel(c.meta.patch)}: {startLine(c.meta, ROLE_LABEL[c.role])}{c.meta.blind != null ? ` · ${c.meta.blind} blind, ${c.meta.response} response of ${c.meta.games.length}` : ""}</span>
          </div>
        )}
        {!read && !c.meta && <p className="fit-note xs muted">No champion attributes yet, so no comp read.</p>}
        {!read && c.meta && <p className="fit-note xs muted">No pick locked yet, so no comp read: these are pro counts on one patch, not a score.</p>}
      </div>
    </div>
  );
}

const STRENGTH = { confirmed: "Strong · pro agrees", strong: "Strong", favorable: "Favorable" } as const;
const vsNames = (ids: string[], names: Record<string, string>) => ids.map((v) => names[v] ?? v).join(" + ");
/** The comp-fit number opens its breakdown: every point with its reason. Saved, proposed, pro and counter are labels. */
function FitScore({ c }: { c: Candidate }) {
  const parts = c.fit.parts.filter((p) => !BONUS.has(p.kind));
  const label = `${c.compFit > 0 ? "+" : ""}${c.compFit}`;
  return (
    <Popover label="Comp fit breakdown" triggerClass={`fit-score ${c.compFit < 0 ? "neg" : ""}`} className="fs" side="below" trigger={label}>
      {() => (
        <div>
          <header className="pop-head"><span className="pop-title">Comp fit</span><span className="mono">{label}</span></header>
          <ul className="pop-points">{parts.map((p, i) => (
            <li key={i}><span className="k">{KIND_LABEL[p.kind] ?? p.kind}</span><span className="t">{p.text}</span><span className={`pts ${p.points < 0 ? "neg" : ""}`}>{p.points > 0 ? "+" : ""}{p.points}</span></li>
          ))}</ul>
          <footer className="pop-foot"><span>Synergy with your picks, team needs, matchups and risks. Saved pairings, pro games and counters are labels, never counted.</span></footer>
        </div>
      )}
    </Popover>
  );
}

const counterLine = (c: Counter, names: Record<string, string>) =>
  `${STRENGTH[c.strength]} vs ${vsNames(c.evidence.vs, names)}${c.evidence.with ? ` with ${names[c.evidence.with] ?? c.evidence.with}` : ""} · ${describeEvidence(c.evidence)}${c.pro ? ` · ${describePro(c.pro)}` : ""}`;

// ---------- draft board ----------

type SlotShared = {
  names: Record<string, string>; byName: Map<string, string>; champions: SuggestData["champions"]; taken: string[];
  onOpen: (id: string, role?: Role) => void;
  onHover: (t: DrawerTarget, el: HTMLElement) => void; onUnhover: () => void;
};

function DraftSlot({ side, role, value, fresh = false, active = false, mine = false, builds, preview, onActivate, onLock, suggested = [], names, byName, champions, taken, onOpen, onHover, onUnhover }: SlotShared & {
  side: "ally" | "enemy"; role: Role; value?: string; fresh?: boolean; active?: boolean; mine?: boolean; builds?: string; preview?: string;
  onActivate?: () => void; onLock: (id: string | undefined) => void; suggested?: Recommendation[];
}) {
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const [up, setUp] = useState(false);
  const list = useRef<HTMLUListElement>(null);
  const keyed = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  const slot = useRef<HTMLDivElement>(null);
  // Changing a locked pick keeps it until a replacement is chosen; Escape or clicking away keeps it.
  const [editing, setEditing] = useState(false);
  // On phones each team row scrolls sideways: keep the role being picked in view.
  useEffect(() => {
    const el = slot.current, row = el?.parentElement;
    if (!active || !el || !row || row.scrollWidth <= row.clientWidth) return;
    const left = el.offsetLeft - row.offsetLeft;
    if (left < row.scrollLeft || left + el.offsetWidth > row.scrollLeft + row.clientWidth) row.scrollTo({ left: Math.max(0, left - 8), behavior: scrollBehavior() });
  }, [active]);
  const ally = side === "ally";
  const listId = ally ? `champs-${role}` : `champs-enemy-${role}`;
  const label = ally ? role : `Enemy ${role}`;
  // "Change" clears the slot; focus the picker once it is back.
  useEffect(() => { if (editing) input.current?.focus(); }, [editing]);
  const q = text.trim().toLowerCase();
  // With no query: the best draft fits first, then the role alphabetically. With a query: names that contain it, champions
  // who play the role, then everyone else. Locked picks (both teams) are left out.
  const fit = useMemo(() => new Map(suggested.map((s) => [s.champion, s.score])), [suggested]);
  const matches = useMemo(() => {
    const hit = (c: (typeof champions)[number]) => !q || c.name.toLowerCase().includes(q) || c.aliases.some((a) => a.toLowerCase().includes(q));
    const pool = champions.filter((c) => !taken.includes(c.id) && hit(c) && (q || c.roles.includes(role)));
    const starts = (c: (typeof champions)[number]) => (q && c.name.toLowerCase().startsWith(q) ? 0 : 1);
    const off = (c: (typeof champions)[number]) => Number(!c.roles.includes(role));
    const rank = (c: (typeof champions)[number]) => (q ? 0 : -(fit.get(c.id) ?? -99));
    return [...pool].sort((a, b) => off(a) - off(b) || starts(a) - starts(b) || rank(a) - rank(b) || a.name.localeCompare(b.name));
  }, [champions, taken, q, role, fit]);
  const mark = (name: string) => {
    const i = q ? name.toLowerCase().indexOf(q) : -1;
    return i < 0 ? name : <>{name.slice(0, i)}<mark>{name.slice(i, i + q.length)}</mark>{name.slice(i + q.length)}</>;
  };
  // Keyboard navigation keeps the highlighted option in view; hovering with the mouse never scrolls the list.
  useEffect(() => {
    if (!keyed.current || !list.current) return;
    keyed.current = false;
    (list.current.children[hi + (editing && value ? 1 : 0)] as HTMLElement | undefined)?.scrollIntoView({ block: "nearest" });
  }, [hi, editing, value]);
  // Open below the input, or above it when there is clearly more room there.
  const place = () => {
    const r = input.current?.getBoundingClientRect();
    if (r) { const below = window.innerHeight - r.bottom, above = r.top; setUp(below < 260 && above > below); }
  };
  // A keyboard lock or Escape ends on the slot's champion, so focus never drops to the page (and Tab carries on from here).
  const refocus = useRef(false);
  useEffect(() => {
    if (!refocus.current) return;
    refocus.current = false;
    slot.current?.querySelector<HTMLElement>(value && !editing ? ".slot-body" : "input")?.focus({ preventScroll: true });
  }, [value, editing]);
  const pick = (id: string | undefined) => { if (id) { onLock(id); setText(""); setOpen(false); setHi(0); setEditing(false); } };
  const remove = () => { onLock(undefined); setText(""); setOpen(false); setEditing(false); };
  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") { e.preventDefault(); keyed.current = true; setOpen(true); setHi((i) => Math.min(i + 1, matches.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); keyed.current = true; setHi((i) => Math.max(i - 1, 0)); }
    else if (e.key === "PageDown" || e.key === "PageUp") { e.preventDefault(); keyed.current = true; setHi((i) => Math.max(0, Math.min(matches.length - 1, i + (e.key === "PageDown" ? 7 : -7)))); }
    // An exact name locks that champion only while it is free; a pick already on either team is never locked twice.
    else if (e.key === "Enter") { e.preventDefault(); const exact = byName.get(q), id = exact && !taken.includes(exact) ? exact : matches[hi]?.id; refocus.current = !!id; pick(id); }
    // Escape closes the list first and keeps the field; a second Escape (or the first while changing a pick) leaves it.
    else if (e.key === "Escape") {
      if (open && !editing) { e.preventDefault(); setOpen(false); }
      else if (editing && value) { e.preventDefault(); refocus.current = true; setOpen(false); setEditing(false); setText(""); }
      else input.current?.blur();
    }
    else if (editing && !text && (e.key === "Delete" || e.key === "Backspace")) { e.preventDefault(); remove(); }
  };
  const cls = `draft-slot ${ally ? `role-${role}` : "enemy"} ${value ? "locked" : "open"} ${active ? "active" : ""} ${mine ? "mine" : ""} ${fresh ? "fresh" : ""}`;
  const roleTag = <span className={`role-tag role-${role}`}>{role}{mine && <span className="slot-you">You</span>}</span>;

  if (value && !editing) {
    const name = names[value] ?? value;
    const c = champions.find((x) => x.id === value);
    return (
      <div className={cls} data-role={role} ref={slot}>
        <button className="slot-body" onClick={() => onOpen(value, role)} data-drawer-trigger aria-haspopup="dialog"
          onPointerEnter={(e) => { if (e.pointerType === "mouse") onHover({ id: value, role }, e.currentTarget); }}
          onPointerLeave={(e) => { if (e.pointerType === "mouse") onUnhover(); }}>
          <span className="slot-icon" key={value}><ChampIcon id={value} name={name} role={ally ? role : undefined} size={ally ? "xxl" : "lg"} /></span>
          <span className="slot-text">{roleTag}<span className="slot-name truncate">{name}</span></span>
        </button>
        <button className="slot-change" onClick={() => setEditing(true)} aria-label={`Change ${label} (${name})`} title={`Pick a different ${ROLE_LABEL[role]}, or remove ${name}`}>
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><path d="M7.8 2.2 9.8 4.2 4.3 9.7 1.8 10.2 2.3 7.7Z" /></svg>
          <span className="slot-change-text">Change</span>
        </button>
        {builds && <Link className="slot-builds" href={builds} title={`${name}'s recorded pro builds in this role`}>Pro Builds →</Link>}
      </div>
    );
  }
  const current = editing && value ? names[value] ?? value : undefined;
  const shown = preview ?? (editing ? value : undefined);
  return (
    <div className={`${cls} ${editing ? "editing" : ""}`} data-role={role} ref={slot} onMouseDown={(e) => { if (e.target !== input.current) { e.preventDefault(); input.current?.focus(); } }}>
      <div className="slot-body">
        <span className="slot-icon">
          {shown
            ? <span className="ghost"><ChampIcon id={shown} name={names[shown] ?? shown} role={role} size={ally ? "xxl" : "lg"} /></span>
            : <span className={`champ ${ally ? "xxl" : "lg"} empty`}><span className="mono">{role.slice(0, 1)}</span></span>}
        </span>
        <span className="slot-text">
          {roleTag}
          <span className="picker">
            <input ref={input} value={text} placeholder={preview ? names[preview] : current ? `Replace ${current}` : ally ? "Pick champion" : "Enemy pick"} aria-label={ally ? `${role} champion` : `Enemy ${role} champion`}
              role="combobox" aria-autocomplete="list" aria-expanded={open && matches.length > 0} aria-controls={listId}
              aria-activedescendant={open && matches[hi] ? `${listId}-${matches[hi].id}` : undefined}
              onChange={(e) => { setText(e.target.value); setOpen(true); setHi(0); if (list.current) list.current.scrollTop = 0; }}
              onFocus={() => { place(); setOpen(true); onActivate?.(); }} onBlur={() => { setOpen(false); setEditing(false); setText(""); }} onKeyDown={onKey} />
            {open && (matches.length > 0 || current) && (
              <ul id={listId} ref={list} role="listbox" tabIndex={-1} className={`picker-list ${up ? "up" : ""}`}>
                {current && (
                  <li className="remove" role="presentation" onMouseDown={(e) => { e.preventDefault(); remove(); }}>
                    <span className="x" aria-hidden="true">×</span><span className="name">Remove {current}</span><span className="roles">Delete</span>
                  </li>
                )}
                {matches.map((c, i) => (
                  <li key={c.id} id={`${listId}-${c.id}`} role="option" aria-selected={i === hi} className={i === hi ? "active" : undefined}
                    onMouseDown={(e) => { e.preventDefault(); pick(c.id); }} onMouseEnter={() => setHi(i)}>
                    <ChampIcon id={c.id} name={c.name} role={c.roles.includes(role) ? role : undefined} size="sm" />
                    <span className="name">{mark(c.name)}</span>
                    {fit.has(c.id)
                      ? <span className="fit tnum">+{fit.get(c.id)}</span>
                      : <span className="roles">{c.roles.includes(role) ? c.roles.join(" · ") : `off-role · ${c.roles.join(" · ")}`}</span>}
                  </li>
                ))}
              </ul>
            )}
          </span>
        </span>
      </div>
    </div>
  );
}

function MiniBoard({ show, draft, enemy, active, names, onActivate, summary }: {
  show: boolean; draft: Draft; enemy: (string | undefined)[]; active?: Role; names: Record<string, string>; onActivate: (r: Role) => void; summary?: React.ReactNode;
}) {
  const cell = (id: string | undefined, role: Role, ally: boolean) => {
    const on = ally && role === active;
    const body = id ? <ChampIcon id={id} name={names[id] ?? id} role={ally ? role : undefined} size="md" /> : <span className="mini-empty">{role.slice(0, 1)}</span>;
    const title = `${ally ? "" : "Enemy "}${ROLE_LABEL[role]}${id ? `: ${names[id] ?? id}` : ""}`;
    return ally && !id
      ? <button key={role} className={`mini-slot role-${role} ${on ? "active" : ""}`} title={`Pick ${ROLE_LABEL[role]}`} onClick={() => onActivate(role)}>{body}</button>
      : <span key={role} className={`mini-slot ${ally ? `role-${role}` : "enemy"} ${id ? "locked" : ""}`} title={title}>{body}</span>;
  };
  return (
    <div className={`draft-mini ${show ? "show" : ""}`} inert={!show} aria-label="Draft summary">
      <span className="mini-team">{ROLES.map((r) => cell(draft[r], r, true))}</span>
      <span className="mini-vs">vs</span>
      <span className="mini-team enemy">{ROLES.map((r, i) => cell(enemy[i], r, false))}</span>
      {active && <span className="mini-active">Picking <b>{ROLE_LABEL[active]}</b></span>}
      {summary}
    </div>
  );
}

// ---------- Comp Check indicators ----------

const scale = (v: number) => (v >= 3 ? "High" : v >= 2 ? "Mid" : "Low");

function Indicators({ prof, flags, picks, siege, disengage }: { prof: ReturnType<typeof profile>; flags: Record<string, string>; picks: number; siege: SiegeCell; disengage: SiegeCell }) {
  const m = Object.fromEntries(prof.meters.map((x) => [x.attr, x])) as Record<Attr, (typeof prof.meters)[number]>;
  // The values are kit facts; a cell is marked only when the Comp Check's plan read names that gap (planFlags), so the
  // grid never disagrees with the read above it.
  const share = prof.damage.physicalShare;
  const cells: { label: string; value: string; bad?: string; title?: string }[] = [
    { label: "Engage", value: !picks ? "—" : m.engage.best >= 2 ? "✓" : "None", title: m.engage.bestBy ? `Best engage: ${m.engage.bestBy}` : undefined },
    { label: "Frontline", value: picks ? String(m.frontline.best) : "—", title: `Best ${m.frontline.best} · team ${m.frontline.total}` },
    { label: "Peel", value: picks ? String(m.peel.total) : "—", title: `Team total · best ${m.peel.best}` },
    { label: "Disengage", value: disengage.value, title: disengage.title },
    { label: "AD / AP", value: share === null ? "—" : `${Math.round(share * 100)} / ${Math.round((1 - share) * 100)}`, title: "Damage split, physical / magic" },
    { label: "Sustained", value: picks ? String(m.sustainedDps.best) : "—" },
    { label: "Scaling", value: picks ? scale(m.scaling.best) : "—" },
    { label: "Burst", value: picks ? String(m.burst.best) : "—" },
    { label: "Poke", value: picks ? String(m.poke.best) : "—" },
    { label: "Siege", value: siege.value, title: siege.title },
    { label: "Objective control", value: picks ? scale(m.objectiveControl.best) : "—" },
    { label: "Side lane", value: picks ? scale(m.sidePressure.best) : "—" },
  ];
  return (
    <div className="cc-grid">
      {cells.map((c) => (
        <div key={c.label} className={`cc-cell ${flags[c.label] ? "bad" : ""}`} title={flags[c.label] ?? c.title}>
          <span className="cc-k">{c.label}</span><span className="cc-v">{c.value}</span>
        </div>
      ))}
    </div>
  );
}

// ---------- pro meta scope ----------

/** Which games the pro meta counts come from on the patch: unique games, how many have pick order, which events. */
function ScopeLine({ priority, patch, events }: { priority: PriorityData; patch: string; events: Record<string, { short: string }> }) {
  const { scope } = startingPicks(priority, [], "TOP", patch);
  const names = scope.events.map((e) => events[e]?.short ?? e).join(", ");
  return (
    <span className="tnum" title={scope.tableGames ? "Tournament table only: picks and bans, no pick order or game records" : `${scope.orderGames} of ${scope.recorded} recorded games have both teams' pick order`}>
      {scope.games} games{names ? ` · ${names}` : ""}{scope.tableGames ? " · no pick order" : ""}
    </span>
  );
}
