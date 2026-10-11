"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { picksOf, profile, RULES, warnings, type Draft, type DraftWarning } from "@/lib/evaluate";
import { teamNeeds, type Need, type Recommendation } from "@/lib/recommend";
import { draftCandidates, hasSignal, type Candidate, type Filter } from "@/lib/candidates";
import { ROLES, type Attr, type Role, type Source } from "@/lib/schema";
import { describeLine } from "@/lib/evidence";
import { describeEvidence, describePro, enemyParam, tierLabel, type Counter, type EnemyDraft, type RoleCounters } from "@/lib/counters";
import { similarProDrafts, similarShells, type ProSuggestion, type SuggestData } from "@/lib/suggest";
import type { DraftData, DrawerData } from "@/lib/data";
import { ChampionDrawer, useDrawerIndex, type DrawerTarget } from "./ChampionDrawer";
import { CompCheck, type SiegeCell } from "./CompCheck";
import { ChampionHoverCard, useHoverIntent } from "./ChampionInteraction";
import { GenRang } from "./GenRang";
import { PairingCard, type CardRecord } from "./PairingCard";
import { proposedCard } from "@/lib/proposed";
import { Disclosure } from "./Disclosure";
import { ChampIcon, ChampionRow, WarningBadge, type Severity } from "./ui";

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
];
const ORDER_NOTE = "Order: your preferred pairing first, then comp fit (synergy with your picks, team needs, matchups and risks). "
  + "Synergy, Pro and Counter are labels on each row; pro game counts and counters never move a row. Ties go to the row with more signals.";

export function DraftRoom({ data, sources, drawerData, initial, initialEnemy, metaPicks }: {
  data: DraftData;
  sources: Record<string, Source>;
  drawerData: DrawerData;
  initial: Draft;
  initialEnemy: EnemyDraft; // roles from ?vs=top:aatrox, or detected for bare ids
  metaPicks: Record<string, { picks: number; winRate: number; lowSample: boolean }>;
}) {
  const [draft, setDraft] = useState<Draft>(initial);
  // One enemy slot per role, in ROLES order.
  const [enemy, setEnemy] = useState<(string | undefined)[]>(() => ROLES.map((r) => initialEnemy[r]));
  const [focus, setFocus] = useState<Role>();
  const [hover, setHover] = useState<string>();
  const [drawer, setDrawer] = useState<DrawerTarget>();
  const [pinned, setPinned] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
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

  const enemyDraftOf = (list: (string | undefined)[]): EnemyDraft => Object.fromEntries(ROLES.flatMap((r, i) => (list[i] ? [[r, list[i]]] : [])));
  const update = (next: Draft, nextEnemy = enemy) => {
    setDraft(next);
    setEnemy(nextEnemy);
    const q = new URLSearchParams();
    ROLES.forEach((r) => next[r] && q.set(r.toLowerCase(), next[r]!));
    const vs = enemyParam(enemyDraftOf(nextEnemy));
    if (vs) q.set("vs", vs);
    // window.location keeps the GitHub Pages base path; usePathname() would drop it.
    window.history.replaceState(null, "", `${window.location.pathname}${q.size ? `?${q.toString().replace(/%2C/g, ",")}` : ""}`);
  };
  const lock = (role: Role, id: string | undefined) => { setHover(undefined); update({ ...draft, [role]: id }); };
  const lockEnemy = (i: number, id: string | undefined) => update(draft, enemy.map((e, j) => (j === i ? id : e)));

  const enemyIds = enemy.filter((e): e is string => !!e);
  const taken = [...(Object.values(draft).filter(Boolean) as string[]), ...enemyIds];
  const picks = picksOf(draft, data.champions);
  const prof = profile(draft, data.champions);
  const warns = warnings(draft, data.champions);
  const needs = picks.length ? teamNeeds(picks) : [];
  const enemyDraft = enemyDraftOf(enemy);
  // Pro pairings first: a support seen next to a locked pick in pro games is read for fit even outside the locked bot's
  // saved supports (eligible: false). `fits` is the eligible draft-fit list (picker hints, counters' fit rank).
  // One candidate list per open role (lib/candidates.ts). `fits` is the eligible draft-fit list: picker hints, tab hints.
  const { pro: proAll, fits, counters, unified } = draftCandidates(draft, enemyDraft, data, sources);
  const recs = Object.fromEntries(Object.entries(fits).map(([r, list]) => [r, list!.slice(0, REC_LIMIT)])) as typeof fits;
  const similar = similarProDrafts(draft, data.proDrafts);
  const shells = similarShells(draft, data.shells);
  const open = ROLES.filter((r) => !draft[r]);
  const lockedCount = ROLES.length - open.length;
  const started = lockedCount > 0 || enemyIds.length > 0;
  const critical = warns.filter((w) => severityOf(w) === "critical").length;

  // The role being picked: the one the user chose, else the open lane partner of a locked pick, else the open role
  // with the strongest fit.
  const topScore = (r: Role) => recs[r]?.[0]?.score ?? -99;
  const partnered = open.filter((r) => PARTNER[r] && draft[PARTNER[r]!]);
  const active: Role | undefined = focus && open.includes(focus) ? focus
    : [...(partnered.length ? partnered : open)].sort((a, b) => topScore(b) - topScore(a))[0];
  const activeRows = active ? unified[active] ?? [] : [];
  // A new role or filter starts collapsed again.
  const listKey = `${active}-${filter}`;
  const [shownFor, setShownFor] = useState(listKey);
  if (shownFor !== listKey) { setShownFor(listKey); setShowAll(false); }
  const activeCounters: RoleCounters | undefined = active ? counters[active] : undefined;
  const shownRows = activeRows.filter((c) => hasSignal(c, filter));
  const visibleRows = filter === "all" && !showAll ? shownRows.slice(0, ROW_LIMIT) : shownRows;
  const proIds = active ? (proAll[active] ?? []).map((s) => s.champion) : [];
  const proSourceLine = `Recorded Gol.gg games next to your picks: ${(data.events ?? []).map((e) => `${e.short} ${e.patch}${e.status === "ongoing" ? " (ongoing)" : ""}`).join(" · ")}. Evidence, never part of the order.`;
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

  const slotProps = { names, byName, champions: data.champions, taken, onOpen: (id: string, role?: Role) => { hoverCard.hide(); setDrawer({ id, role }); },
    onHover: hoverCard.hover, onUnhover: hoverCard.unhover };

  return (
    <div className="draft-room">
      <header className="page-header draft-head">
        <div className="titles"><h1>Draft Room</h1></div>
        <div className="actions">
          <span className="xs muted tnum">{lockedCount}/5 locked{enemyIds.length ? ` · ${enemyIds.length} enemy` : ""}</span>
          {lockedCount >= 2 && (warns.length
            ? <span className="row tight">{critical > 0 && <span className="badge danger">{critical} critical</span>}{warns.length - critical > 0 && <span className="badge caution">{warns.length - critical} caution</span>}</span>
            : <span className="badge success">No warnings</span>)}
          {cleared
            ? <button className="btn sm" onClick={() => { update(cleared.draft, cleared.enemy); setCleared(undefined); }}>Draft cleared · Undo</button>
            : <button className="btn sm" title="Unlock every pick on both teams" onClick={() => { setCleared({ draft, enemy }); setFocus(undefined); update({}, ROLES.map(() => undefined)); }} disabled={!started}>Clear draft</button>}
        </div>
      </header>

      <div className="board" ref={board}>
        <div className="team-row ally">
          <div className="team-label">My team</div>
          <div className="draft-slots">
            {ROLES.map((role) => (
              <DraftSlot key={role} side="ally" role={role} value={draft[role]} active={role === active} preview={role === active ? hover : undefined}
                onActivate={() => setFocus(role)} onLock={(id) => lock(role, id)} suggested={recs[role]} {...slotProps} />
            ))}
          </div>
        </div>
        <div className="team-row enemy">
          <div className="team-label">Enemy</div>
          <div className="draft-slots">
            {ROLES.map((role, i) => (
              <DraftSlot key={role} side="enemy" role={role} value={enemy[i]} onLock={(v) => lockEnemy(i, v)} {...slotProps} />
            ))}
          </div>
        </div>
      </div>

      <MiniBoard show={pinned} draft={draft} enemy={enemy} active={active} names={names} onActivate={setFocus} />

      <div className="draft-layout">
        <div className="draft-main">
          <section className="recs" aria-label="Recommended Picks">
            {!open.length ? <p className="rec-empty">All five roles are locked.</p> : (
              <>
                <div className="role-tabs" role="tablist" aria-label="Role to pick">
                  {open.map((r) => {
                    const top = unified[r]?.[0];
                    return (
                      <button key={r} role="tab" aria-selected={r === active} className={`role-tab role-${r} ${r === active ? "active" : ""}`} onClick={() => setFocus(r)}>
                        <span className="role-name">{ROLE_LABEL[r]}</span>
                        {top && r !== active && <span className="tab-top"><ChampIcon id={top.champion} name={names[top.champion]} size="xs" />{names[top.champion]}</span>}
                      </button>
                    );
                  })}
                </div>
                {active && (
                  <div className={`fit-role role-${active}`} role="tabpanel" aria-label={`${ROLE_LABEL[active]} recommendations`}>
                    <div className="fit-context">
                      {started && (
                        <div className="seg fit-filters" role="group" aria-label="Show recommendations by signal">
                          {FILTERS.map((f) => {
                            const n = f.key === "all" ? activeRows.length : activeRows.filter((c) => hasSignal(c, f.key)).length;
                            const off = f.key === "counter" && !activeCounters;
                            return (
                              <button key={f.key} type="button" className={filter === f.key ? "active" : undefined} aria-pressed={filter === f.key} disabled={off}
                                title={off ? "Add the enemy lane opponent to read counters" : f.key === "pro" ? proSourceLine : undefined} onClick={() => setFilter(f.key)}>
                                {f.label}{!off && <span className="n tnum">{n}</span>}
                              </button>
                            );
                          })}
                        </div>
                      )}
                      {laneFoes.length
                        ? <span className="vs">vs {laneFoes.map((id, i) => <span key={id}>{i > 0 && " + "}<b>{names[id]}</b></span>)}</span>
                        : enemyIds.length ? <span className="vs muted">vs {enemyIds.map((id) => names[id]).join(" · ")}</span> : null}
                      {started && <span className="order-note xs faint" title={ORDER_NOTE}>Preferred, then comp fit</span>}
                    </div>
                    {activeCounters && (filter === "counter" || activeCounters.note) && (
                      <p className="fit-note xs muted">
                        {activeCounters.counters.length ? `Counters vs ${vsNames(activeCounters.vs, names)}${activeCounters.scope === "duo" ? " (duo)" : ""}.` : `No reliable counter data for ${vsNames(activeCounters.vs, names)}.`}
                        {activeCounters.note ? ` ${activeCounters.note}` : ""}
                      </p>
                    )}
                    {!started ? <div className="rec-empty start"><GenRang size={44} /><span>Lock a pick to start. Recommendations for the open role appear here.</span></div>
                      : visibleRows.length
                        ? visibleRows.map((c) => (
                          <FitRow key={c.champion} c={c} bot={draft.BOT ? names[draft.BOT] ?? draft.BOT : undefined} names={names} hovered={hover === c.champion}
                            onHover={(h) => setHover(h ? c.champion : undefined)} onPick={() => lock(active, c.champion)} onOpen={() => setDrawer({ id: c.champion, role: active })} />
                        ))
                        : <p className="rec-empty">{filter === "all" ? "Nothing stands out yet." : filter === "counter" && activeCounters?.counters.length === 0 ? "No counters to show." : "No candidate has this signal yet."}</p>}
                    {visibleRows.length < shownRows.length && (
                      <button type="button" className="btn sm fit-more" onClick={() => setShowAll(true)}>Show all {shownRows.length}</button>
                    )}
                  </div>
                )}
              </>
            )}
          </section>

        </div>

        <CompCheck draft={draft} enemyIds={enemyIds} champions={data.champions} botPairings={data.botPairings} active={active}
          bestOverall={activeRows.find((c) => !c.theoretical)?.champion} bestFixId={active ? fits[active]?.find((r) => r.bestFix)?.champion : undefined} proIds={proIds} names={names} grid={(siege, disengage) => <Indicators prof={prof} needs={needs} picks={picks.length} siege={siege} disengage={disengage} />}>
          <div className="cc-section">
            <div className="cc-label">Rule checks</div>
            {!warns.length && (lockedCount < 2 ? <p className="xs muted">Needs two picks.</p> : <p className="cc-ok">No warnings.</p>)}
            {[...warns].sort((a, b) => Number(severityOf(b) === "critical") - Number(severityOf(a) === "critical")).map((w) => (
              <details key={w.id} className={`warning-item ${severityOf(w)}`}>
                <summary><WarningBadge severity={severityOf(w)} />{w.label}</summary>
                <p>{w.why}</p>
                <p className="xs muted">Rule: {w.rule}.</p>
              </details>
            ))}
          </div>
          {pickNotes.length > 0 && (
            <div className="cc-section notes">
              <div className="cc-label">Pick notes</div>
              {pickNotes.map((n) => <p key={n.id}><b>{names[n.id]}:</b> {n.text}</p>)}
            </div>
          )}
          <details className="rules cc-section">
            <summary>All {RULES.length} rules</summary>
            <ul>{RULES.map((r) => <li key={r.id}><b>{r.label}:</b> {r.rule}</li>)}</ul>
          </details>
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
        <Disclosure section lazy summary="Similar pro drafts" meta={similar.length ? `${similar.length}` : "none"}>
          {!similar.length ? <p className="xs muted">Nothing recorded shares a champion with this draft.</p> : (
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
        </Disclosure>
        <Disclosure section lazy summary="Similar comps" meta={shells.length ? `${shells.length}` : "none"}>
          <div className="shell-list">
            {!shells.length && <p className="xs muted">No shell shares a pick or swap with this draft.</p>}
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
        </Disclosure>
      </div>

      {hoverCard.card && !drawer && (
        <ChampionHoverCard key={`${hoverCard.card.t.id}-${hoverCard.card.t.role}`} target={hoverCard.card.t} anchor={hoverCard.card.el} data={drawerData} index={drawerIndex}
          onEnter={hoverCard.keep} onLeave={hoverCard.unhover} />
      )}
      {drawer && <ChampionDrawer target={drawer} data={drawerData} index={drawerIndex} onClose={() => setDrawer(undefined)} onSelect={setDrawer} />}
    </div>
  );
}

// ---------- recommendation rows ----------

type Chip = { key: string; label: string; title?: string };

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
const proLine = (pro: ProSuggestion) => pro.lines.map((l) => `${describeLine({ ...l, label: l.event })}${l.ongoing ? " · ongoing" : ""}`).join("; ");
const BONUS = new Set(["saved", "proposed"]);

// The row's labels, one per independent signal, each in its own layer colour. Nothing here changes the order.
function chipsOf(c: Candidate, names: Record<string, string>, bot?: string): Chip[] {
  const r = c.fit;
  const out: Chip[] = [];
  if (r.eligible && r.saved) {
    out.push(r.savedFromPro
      ? { key: "syn alt", label: "Synergy · Alt (pro)", title: "Alternative from pro games, not hand-saved" }
      : { key: `syn ${r.saved}`, label: `Synergy · ${STATUS[r.saved]}`, title: "Your saved pairing with a locked pick" });
  } else if (r.eligible && r.proposed) {
    out.push({ key: "syn proposed", label: "Proposed", title: "Proposed synergy with a locked pick: kit-based synergy that hasn't been added to your saved pairings." });
  }
  if (c.pro) out.push({ key: "pro", label: `Pro · ${plural(c.pro.score, "game")}`, title: `${plural(c.pro.score, "recorded pro game")} with ${c.pro.with.map((id) => names[id] ?? id).join(" or ")}: ${proLine(c.pro)}\nEvidence, never part of the order.` });
  if (r.bestFix) out.push({ key: "fix", label: "Best fix", title: "Covers the most of this role's needs" });
  if (c.bestFit) out.push({ key: "fit", label: "Best fit", title: "Top three on comp fit: synergy with your picks, team needs, matchups and risks" });
  if (c.counter) out.push({ key: "counter", label: "Counter", title: `${counterLine(c.counter, names)}. Counter signal only, never part of the order.` });
  if (c.theoretical) out.push({ key: "theory", label: "Theoretical", title: `Not one of ${bot ?? "the bot"}'s saved supports: theoretical, not recommended` });
  if (r.parts.some((p) => p.kind === "risk")) out.push({ key: "risk", label: "Risk" });
  return out;
}

/** Main benefit and potential drawback, one line. */
function reasonOf(c: Candidate): { benefit: string; drawback?: string } {
  const r = c.fit;
  const lead = r.parts.find((p) => p.points > 0 && !BONUS.has(p.kind));
  const benefit = r.fixes.length ? `Fixes ${r.fixes.join(", ").toLowerCase()}`
    : lead?.text ?? (c.pro ? proLine(c.pro) : r.parts.find((p) => BONUS.has(p.kind))?.text ?? (c.counter ? `Counter: ${describeEvidence(c.counter.evidence)}` : "No comp reasons yet"));
  const risk = r.parts.find((p) => p.kind === "risk" && !p.text.startsWith("Tradeoff"));
  return { benefit, drawback: r.tradeoffs[0] ?? risk?.text };
}

function FitRow({ c, bot, names, hovered, onHover, onPick, onOpen }: {
  c: Candidate; bot?: string; names: Record<string, string>; hovered: boolean;
  onHover: (on: boolean) => void; onPick: () => void; onOpen: () => void;
}) {
  const [open, setOpen] = useState(false);
  const rec = c.fit;
  const name = names[c.champion] ?? c.champion;
  const chips = chipsOf(c, names, bot);
  const { benefit, drawback } = reasonOf(c);
  const counter = c.counter;
  const read = rec.parts.length > 0;
  return (
    <div className={`fit-row ${open ? "open" : ""} ${hovered ? "hovered" : ""} ${c.theoretical ? "ref" : ""}`} onMouseEnter={() => onHover(true)} onMouseLeave={() => onHover(false)}>
      <button className="fit-icon" onClick={onOpen} aria-label={`${name} details`} title={`${name}: details`}>
        <ChampIcon id={c.champion} name={name} role={c.role} size="md" />
      </button>
      <button className="fit-head" onClick={onPick} onFocus={() => onHover(true)} onBlur={() => onHover(false)}
        title={`Lock ${name} at ${c.role}${read ? `\n${rec.parts.map((p) => `${BONUS.has(p.kind) ? "" : `${p.points > 0 ? "+" : ""}${p.points}  `}${p.text}`).join("\n")}` : ""}`}>
        <span className="fit-line">
          <span className="name">{name}</span>
          {chips.length > 0 && <span className="sig-line">{chips.map((s) => <span key={s.key} className={`sig ${s.key}`} title={s.title}>{s.label}</span>)}</span>}
        </span>
        <span className="fit-reason truncate">{benefit}{drawback && <span className="drawback"> · {drawback}</span>}</span>
      </button>
      <span className={`fit-score ${c.compFit < 0 ? "neg" : ""}`} title="Comp fit: synergy with your picks, team needs, matchups and risks. Saved pairings, pro games and counters are labels, not counted.">
        {read ? `${c.compFit > 0 ? "+" : ""}${c.compFit}` : "—"}
      </span>
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
        {!rec.eligible && c.pro && <p className="fit-note xs muted">Not one of {bot ?? "the bot"}&apos;s saved supports: a pro pairing, not a saved one.</p>}
        {!read && <p className="fit-note xs muted">No champion attributes yet, so no comp read.</p>}
      </div>
    </div>
  );
}

const STRENGTH = { confirmed: "Strong · pro agrees", strong: "Strong", favorable: "Favorable" } as const;
const vsNames = (ids: string[], names: Record<string, string>) => ids.map((v) => names[v] ?? v).join(" + ");
const counterLine = (c: Counter, names: Record<string, string>) =>
  `${STRENGTH[c.strength]} vs ${vsNames(c.evidence.vs, names)}${c.evidence.with ? ` with ${names[c.evidence.with] ?? c.evidence.with}` : ""} · ${describeEvidence(c.evidence)}${c.pro ? ` · ${describePro(c.pro)}` : ""}`;

// ---------- draft board ----------

type SlotShared = {
  names: Record<string, string>; byName: Map<string, string>; champions: SuggestData["champions"]; taken: string[];
  onOpen: (id: string, role?: Role) => void;
  onHover: (t: DrawerTarget, el: HTMLElement) => void; onUnhover: () => void;
};

function DraftSlot({ side, role, value, active = false, preview, onActivate, onLock, suggested = [], names, byName, champions, taken, onOpen, onHover, onUnhover }: SlotShared & {
  side: "ally" | "enemy"; role: Role; value?: string; active?: boolean; preview?: string;
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
    if (left < row.scrollLeft || left + el.offsetWidth > row.scrollLeft + row.clientWidth) row.scrollTo({ left: Math.max(0, left - 8), behavior: "smooth" });
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
  const pick = (id: string | undefined) => { if (id) { onLock(id); setText(""); setOpen(false); setHi(0); setEditing(false); } };
  const remove = () => { onLock(undefined); setText(""); setOpen(false); setEditing(false); };
  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") { e.preventDefault(); keyed.current = true; setOpen(true); setHi((i) => Math.min(i + 1, matches.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); keyed.current = true; setHi((i) => Math.max(i - 1, 0)); }
    else if (e.key === "PageDown" || e.key === "PageUp") { e.preventDefault(); keyed.current = true; setHi((i) => Math.max(0, Math.min(matches.length - 1, i + (e.key === "PageDown" ? 7 : -7)))); }
    else if (e.key === "Enter") { e.preventDefault(); pick(byName.get(q) ?? matches[hi]?.id); }
    else if (e.key === "Escape") { setOpen(false); input.current?.blur(); }
    else if (editing && !text && (e.key === "Delete" || e.key === "Backspace")) { e.preventDefault(); remove(); }
  };
  const cls = `draft-slot ${ally ? `role-${role}` : "enemy"} ${value ? "locked" : "open"} ${active ? "active" : ""}`;
  const roleTag = <span className={`role-tag role-${role}`}>{role}</span>;

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
        <button className="slot-change" onClick={() => setEditing(true)} aria-label={`Change ${label} (${name})`} title={`Pick a different ${ROLE_LABEL[role]}, or remove ${name}`}>Change</button>
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
              <ul id={listId} ref={list} role="listbox" className={`picker-list ${up ? "up" : ""}`}>
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

function MiniBoard({ show, draft, enemy, active, names, onActivate }: {
  show: boolean; draft: Draft; enemy: (string | undefined)[]; active?: Role; names: Record<string, string>; onActivate: (r: Role) => void;
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
    </div>
  );
}

// ---------- Comp Check indicators ----------

const scale = (v: number) => (v >= 3 ? "High" : v >= 2 ? "Mid" : "Low");

function Indicators({ prof, needs, picks, siege, disengage }: { prof: ReturnType<typeof profile>; needs: Need[]; picks: number; siege: SiegeCell; disengage: SiegeCell }) {
  const m = Object.fromEntries(prof.meters.map((x) => [x.attr, x])) as Record<Attr, (typeof prof.meters)[number]>;
  // A missing job only reads as a problem once it matters: a need tied to a locked champion, or three picks in.
  const problem = (...ids: Need["id"][]) => needs.find((n) => ids.includes(n.id) && (n.personal || picks >= 3));
  const share = prof.damage.physicalShare;
  const cells: { label: string; value: string; bad?: Need; title?: string }[] = [
    { label: "Engage", value: !picks ? "—" : needs.some((n) => n.id === "engage" || n.id === "setup") ? "None" : "✓", bad: problem("engage", "setup"), title: m.engage.bestBy ? `Best engage: ${m.engage.bestBy}` : undefined },
    { label: "Frontline", value: picks ? String(m.frontline.best) : "—", bad: problem("frontline"), title: `Best ${m.frontline.best} · team ${m.frontline.total}` },
    { label: "Peel", value: picks ? String(m.peel.total) : "—", bad: problem("peel"), title: `Team total · best ${m.peel.best}` },
    { label: "Disengage", value: disengage.value, title: disengage.title },
    { label: "AD / AP", value: share === null ? "—" : `${Math.round(share * 100)} / ${Math.round((1 - share) * 100)}`, bad: problem("magic", "physical"), title: "Damage split, physical / magic" },
    { label: "Sustained", value: picks ? String(m.sustainedDps.best) : "—", bad: problem("dps") },
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
        <div key={c.label} className={`cc-cell ${c.bad ? "bad" : ""}`} title={c.bad ? c.bad.text : c.title}>
          <span className="cc-k">{c.label}</span><span className="cc-v">{c.value}</span>
        </div>
      ))}
    </div>
  );
}
