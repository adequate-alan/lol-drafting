"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { picksOf, profile, RULES, warnings, type Draft, type DraftWarning } from "@/lib/evaluate";
import { recommend, teamNeeds, winConditions, type Need, type Recommendation } from "@/lib/recommend";
import { ROLES, type Attr, type Role, type Source } from "@/lib/schema";
import { describeLine } from "@/lib/evidence";
import { counterPicks, describeEvidence, describePro, enemyParam, tierLabel, type Counter, type EnemyDraft, type RoleCounters } from "@/lib/counters";
import { proSuggestions, similarProDrafts, similarShells, type ProSuggestion, type SuggestData } from "@/lib/suggest";
import type { DraftData, DrawerData } from "@/lib/data";
import { ChampionDrawer, useDrawerIndex, type DrawerTarget } from "./ChampionDrawer";
import { ChampionHoverCard, useHoverIntent } from "./ChampionInteraction";
import { GenRang } from "./GenRang";
import { PairingCard, type CardRecord } from "./PairingCard";
import { ChampIcon, ChampionRow, SourceBadge, WarningBadge, type Severity } from "./ui";

const ROLE_LABEL: Record<Role, string> = { TOP: "Top", JUNGLE: "Jungle", MID: "Mid", BOT: "Bot", SUPPORT: "Support" };
// Lane partner: with Bot locked, Support is the natural next pick (and the other way round).
const PARTNER: Partial<Record<Role, Role>> = { BOT: "SUPPORT", SUPPORT: "BOT", MID: "JUNGLE", JUNGLE: "MID" };
// Whom an open role plays against: its lane opponent, or both enemy bot laners.
const LANE: Record<Role, Role[]> = { TOP: ["TOP"], JUNGLE: ["JUNGLE"], MID: ["MID"], BOT: ["BOT", "SUPPORT"], SUPPORT: ["BOT", "SUPPORT"] };

// Display grouping only: which rule warnings read as a structural hole versus something to keep an eye on.
// The rules themselves (lib/evaluate.ts) are unchanged.
const CRITICAL = new Set(["no-engage", "needs-fight-starter", "no-frontline", "insufficient-peel", "vulnerable-hard-engage"]);
const severityOf = (w: DraftWarning): Severity => (CRITICAL.has(w.id) ? "critical" : "caution");

const KIND_LABEL: Record<string, string> = { saved: "Saved", synergy: "Synergy", need: "Need", matchup: "Matchup", counter: "Counter", risk: "Risk" };
const STATUS = { default: "Default", alt: "Alt", fits: "Fits" } as const;
const REC_LIMIT = 8;

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
  const enemyPicks = enemyIds.map((id) => data.champions.find((c) => c.id === id)!).filter(Boolean);
  const prof = profile(draft, data.champions);
  const warns = warnings(draft, data.champions);
  const needs = picks.length ? teamNeeds(picks) : [];
  const plans = winConditions(picks);
  const enemyPlans = winConditions(enemyPicks);
  const enemyDraft = enemyDraftOf(enemy);
  // The full draft-fit list, so a counter can say where it ranks overall. The visible list is its top REC_LIMIT.
  const fits = recommend(draft, enemyIds, data, Infinity);
  const recs = Object.fromEntries(Object.entries(fits).map(([r, list]) => [r, list!.slice(0, REC_LIMIT)])) as typeof fits;
  const counters = counterPicks(draft, enemyDraft, data, fits);
  const proAll = proSuggestions(draft, data.proDrafts, { botPairings: data.botPairings, events: data.events, sources }, Infinity);
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
  const activeRecs = active ? recs[active] ?? [] : [];
  const activePro = active ? proAll[active] ?? [] : [];
  const proByChamp = new Map(activePro.map((s) => [s.champion, s]));
  const proOnly = activePro.filter((s) => !activeRecs.some((r) => r.champion === s.champion)).slice(0, 6);
  const activeCounters: RoleCounters | undefined = active ? counters[active] : undefined;
  const counterByChamp = new Map((activeCounters?.counters ?? []).map((c) => [c.champion, c]));
  const counterOnly = (activeCounters?.counters ?? []).filter((c) => !activeRecs.some((r) => r.champion === c.champion));
  const laneFoes = active ? LANE[active].map((r) => enemy[ROLES.indexOf(r)]).filter((e): e is string => !!e) : [];

  const cards: CardRecord[] = ROLES.flatMap((role): CardRecord[] => {
    const id = draft[role];
    if (!id) return [];
    if (role === "BOT") { const r = data.botPairings.find((b) => b.champion === id); return r ? [{ kind: "bot", record: r }] : []; }
    if (role === "MID" || role === "JUNGLE") { const r = data.midJungle.find((m) => m.anchor === id && m.role === role); return r ? [{ kind: "mid-jungle", record: r }] : []; }
    if (role === "TOP") { const r = data.topPicks.find((t) => t.champion === id); return r ? [{ kind: "top", record: r, stats: metaPicks[id] }] : []; }
    return [];
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
          <button className="btn sm" title="Unlock every pick on both teams" onClick={() => { setFocus(undefined); update({}, ROLES.map(() => undefined)); }} disabled={!started}>Clear draft</button>
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
                    const top = recs[r]?.[0];
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
                      {laneFoes.length
                        ? <span className="vs">vs {laneFoes.map((id, i) => <span key={id}>{i > 0 && " + "}<b>{names[id]}</b></span>)}</span>
                        : enemyIds.length ? <span className="vs muted">vs {enemyIds.map((id) => names[id]).join(" · ")}</span> : null}
                      <span className="sig-key" title="Pro games are shown as evidence only and never change the order. Matchups use champion attributes, not lane stats.">
                        <span className="k-saved">Synergy</span><span className="k-counter">Counters</span><span className="k-pro">Pro</span><span className="k-need">Logic</span>
                      </span>
                    </div>
                    {!started ? <div className="rec-empty start"><GenRang size={44} /><span>Lock a pick to start. Recommendations for the open role appear here.</span></div>
                      : activeRecs.length
                        ? activeRecs.map((r) => (
                          <FitRow key={r.champion} rec={r} pro={proByChamp.get(r.champion)} counter={counterByChamp.get(r.champion)} names={names} hovered={hover === r.champion}
                            onHover={(h) => setHover(h ? r.champion : undefined)} onPick={() => lock(active, r.champion)} onOpen={() => setDrawer({ id: r.champion, role: active })} />
                        ))
                        : <p className="rec-empty">Nothing stands out yet.</p>}
                  </div>
                )}
              </>
            )}
          </section>

          {active && activeCounters && (
            <section className="rec-group counters" aria-label="Counters">
              <header><h3>Counters</h3><span className="xs faint">vs {vsNames(activeCounters.vs, names)}{activeCounters.scope === "duo" ? " (duo)" : ""}</span></header>
              {!activeCounters.counters.length && <p className="empty">No reliable counter data for {vsNames(activeCounters.vs, names)}.</p>}
              {activeCounters.counters.length > 0 && !counterOnly.length && <p className="empty">Every counter for this role is in the list above.</p>}
              {counterOnly.map((c) => <CounterRow key={c.champion} c={c} names={names} onOpen={() => setDrawer({ id: c.champion, role: active })} />)}
              {activeCounters.note && <p className="empty">{activeCounters.note}</p>}
            </section>
          )}

          {started && active && (
            <section className="rec-group pro" aria-label="Pro Pairings">
              <header><h3>Pro Pairings</h3><span className="xs faint">{ROLE_LABEL[active]}</span>
                <span className="xs faint src-line" title="Recorded Gol.gg games. Evidence only, never part of the score.">
                  Gol.gg · {(data.events ?? []).map((e) => `${e.short} ${e.patch}${e.status === "ongoing" ? " (ongoing)" : ""}`).join(" · ")}
                </span></header>
              {!activePro.length && <p className="empty">{lockedCount ? "No recorded pro game uses these picks." : "Lock a pick to start."}</p>}
              {activePro.length > 0 && !proOnly.length && <p className="empty">Every pro pairing for this role is in the list above.</p>}
              {proOnly.map((s) => <ProRow key={s.champion} s={s} role={active} names={names} onPick={() => lock(active, s.champion)} />)}
            </section>
          )}

          {cards.length > 0 && (
            <section className="draft-section">
              <div className="section-header"><h2>Locked picks</h2></div>
              <div className="grid cols-auto">{cards.map((c) => (
                <PairingCard key={c.kind + ("champion" in c.record ? c.record.champion : c.record.anchor)} item={c} names={names} sources={sources} events={eventMap} compact draftLabels={draftLabels} />
              ))}</div>
            </section>
          )}

          <section className="draft-section">
            <div className="section-header pro-head-line"><h2>Similar pro drafts</h2></div>
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
          </section>
          <section className="draft-section">
            <div className="section-header"><h2>Similar comps</h2></div>
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
          </section>
        </div>

        <aside className="comp-check" aria-label="Comp Check">
          <div className="cc-head"><h2>Comp Check</h2><SourceBadge layer="logic" /></div>
          <Indicators prof={prof} needs={needs} picks={picks.length} />
          {picks.some((c) => c.rosterOnly) && (
            <p className="xs muted">
              {picks.filter((c) => c.rosterOnly).map((c) => c.name).join(", ")}: attributes not reviewed yet, so Comp Check counts
              nothing from {picks.filter((c) => c.rosterOnly).length === 1 ? "this pick" : "these picks"}.
            </p>
          )}

          <div className="cc-section">
            <div className="cc-label">Warnings</div>
            {!warns.length && (lockedCount < 2 ? <p className="xs muted">Needs two picks.</p> : <p className="cc-ok">No warnings.</p>)}
            {[...warns].sort((a, b) => Number(severityOf(b) === "critical") - Number(severityOf(a) === "critical")).map((w) => (
              <details key={w.id} className={`warning-item ${severityOf(w)}`} open={severityOf(w) === "critical"}>
                <summary><WarningBadge severity={severityOf(w)} />{w.label}</summary>
                <p>{w.why}</p>
                <p className="xs muted">Rule: {w.rule}.</p>
              </details>
            ))}
          </div>

          <div className="cc-section">
            <div className="cc-label">Win condition</div>
            {!plans.length
              ? <p className="xs muted">{picks.length < 2 ? "Needs two picks." : "No clear plan yet."}</p>
              : plans.slice(0, 3).map((w, i) => <div key={w.id} className={`plan ${i === 0 ? "lead" : ""}`}><b>{w.title}</b>{i === 0 && <p>{w.text}</p>}</div>)}
            {enemyPlans.length > 0 && <div className="plan enemy"><span className="cc-label inline">Enemy</span><b>{enemyPlans[0].title}</b></div>}
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
        </aside>
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

type Signal = { key: string; label: string; title?: string };

function signalsOf(rec: Recommendation, pro?: ProSuggestion, counter?: Counter, names: Record<string, string> = {}): Signal[] {
  const has = (kind: string) => rec.parts.some((p) => (p.kind as string) === kind && p.points > 0);
  const out: Signal[] = [];
  if (has("synergy")) out.push({ key: "synergy", label: "Synergy" });
  if (counter) out.push({ key: "counter", label: "Counter", title: `${counterLine(counter, names)}. Counter signal only, not part of the score.` });
  if (has("matchup")) out.push({ key: "matchup", label: "Matchup" });
  if (pro) out.push({ key: "pro", label: `Pro ${pro.score}`, title: "Pro games with this champion next to one of your picks. Evidence only, not part of the score." });
  if (rec.parts.some((p) => p.kind === "risk")) out.push({ key: "risk", label: "Risk" });
  return out;
}

function FitRow({ rec, pro, counter, names, hovered, onHover, onPick, onOpen }: {
  rec: Recommendation; pro?: ProSuggestion; counter?: Counter; names: Record<string, string>; hovered: boolean;
  onHover: (on: boolean) => void; onPick: () => void; onOpen: () => void;
}) {
  const [open, setOpen] = useState(false);
  const name = names[rec.champion] ?? rec.champion;
  const lead = rec.parts.find((p) => p.points > 0) ?? rec.parts[0];
  const sigs = signalsOf(rec, pro, counter, names);
  return (
    <div className={`fit-row ${open ? "open" : ""} ${hovered ? "hovered" : ""}`} onMouseEnter={() => onHover(true)} onMouseLeave={() => onHover(false)}>
      <button className="fit-icon" onClick={onOpen} aria-label={`${name} details`} title={`${name}: details`}>
        <ChampIcon id={rec.champion} name={name} role={rec.role} size="md" />
      </button>
      <button className="fit-head" onClick={onPick} onFocus={() => onHover(true)} onBlur={() => onHover(false)}
        title={`Lock ${name} at ${rec.role}\n${rec.parts.map((p) => `${p.points > 0 ? "+" : ""}${p.points}  ${p.text}`).join("\n")}`}>
        <span className="fit-line">
          <span className="name">{name}</span>
          {rec.saved && <span className={`status-tag ${rec.saved}`}>{STATUS[rec.saved]}</span>}
          {sigs.length > 0 && <span className="sig-line">{sigs.map((s) => <span key={s.key} className={`sig ${s.key}`} title={s.title}>{s.label}</span>)}</span>}
        </span>
        <span className="fit-reason truncate">{lead?.text}</span>
      </button>
      <span className={`fit-score ${rec.score < 0 ? "neg" : ""}`} title="Draft-fit score">{rec.score > 0 ? "+" : ""}{rec.score}</span>
      <button className="fit-toggle" aria-expanded={open} aria-label={`Why ${name}`} title={`${rec.parts.length} reasons`} onClick={() => setOpen((o) => !o)}>
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 3.5 5 6.5 8 3.5" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>
      </button>
      <div className="fit-detail">
        <ul className="fit-why">{rec.parts.map((p, i) => (
          <li key={i} className={`k-${p.kind}`}><span className="k">{KIND_LABEL[p.kind] ?? p.kind}</span><span className="t">{p.text}</span><span className="pts">{p.points > 0 ? "+" : ""}{p.points}</span></li>
        ))}</ul>
        {counter && (
          <div className="fit-counter">
            <span className="k">Counter</span>
            <span className="t">{counterLine(counter, names)} · Pool: {tierLabel(counter.tier)}{counter.cautions.length ? ` · ${counter.cautions.join("; ")}` : ""}</span>
          </div>
        )}
        {pro && (
          <div className="fit-pro">
            <span className="k">Pro</span>
            <span className="t">{pro.lines.map((l) => `${describeLine({ ...l, label: l.event })}${l.ongoing ? " · ongoing" : ""}`).join("; ")}</span>
          </div>
        )}
      </div>
    </div>
  );
}

const STRENGTH = { confirmed: "Strong · pro agrees", strong: "Strong", favorable: "Favorable" } as const;
const vsNames = (ids: string[], names: Record<string, string>) => ids.map((v) => names[v] ?? v).join(" + ");
const counterLine = (c: Counter, names: Record<string, string>) =>
  `${STRENGTH[c.strength]} vs ${vsNames(c.evidence.vs, names)}${c.evidence.with ? ` with ${names[c.evidence.with] ?? c.evidence.with}` : ""} · ${describeEvidence(c.evidence)}${c.pro ? ` · ${describePro(c.pro)}` : ""}`;

// A counter outside the visible fit list: never scored, so it says where it ranks on overall draft fit.
function CounterRow({ c, names, onOpen }: { c: Counter; names: Record<string, string>; onOpen: () => void }) {
  const e = c.evidence;
  const name = names[c.champion] ?? c.champion;
  const why = [counterLine(c, names), e.note, `Pool: ${tierLabel(c.tier)}`,
    c.fitRank ? `Overall draft fit: #${c.fitRank} (${c.fit!.score > 0 ? "+" : ""}${c.fit!.score})` : "No draft-fit reasons yet", ...c.cautions].filter(Boolean).join("\n");
  return (
    <button className={`rec-row counter-row ${c.tier && !c.theoretical ? "" : "ref"}`} title={why} onClick={onOpen}>
      <ChampIcon id={c.champion} name={name} role={c.role} size="sm" />
      <span className="name">{name}</span>
      <span className="strength">{STRENGTH[c.strength]}</span>
      <span className="badge outline">DPM</span>
      <span className="ev truncate">{describeEvidence(e).replace(/^DPM · /, "")}{e.with ? ` · with ${names[e.with] ?? e.with}` : ""}{c.pro && <span className="pro-sample"> · {describePro(c.pro)}</span>}</span>
      <span className={`tier ${c.tier ?? "none"}`}>{tierLabel(c.tier)}</span>
      <span className="fit-rank">{c.theoretical ? "Theoretical" : c.fitRank ? `Fit #${c.fitRank}` : "Unranked"}</span>
    </button>
  );
}

function ProRow({ s, role, names, onPick }: { s: ProSuggestion; role: Role; names: Record<string, string>; onPick: () => void }) {
  const [latest, ...older] = s.lines;
  const name = names[s.champion] ?? s.champion;
  return (
    <button className="rec-row ev" title={s.reasons.join("\n")} onClick={onPick}>
      <ChampIcon id={s.champion} name={name} role={role} size="sm" />
      <span className="name">{name}</span>
      <span className="ev-lines">
        <span className="latest">{describeLine({ ...latest, label: latest.event })}{latest.ongoing ? " · ongoing" : ""}</span>
        {older.length > 0 && <span className="older truncate">+ older: {older.map((l) => describeLine({ ...l, label: l.event })).join("; ")}</span>}
      </span>
    </button>
  );
}

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

function Indicators({ prof, needs, picks }: { prof: ReturnType<typeof profile>; needs: Need[]; picks: number }) {
  const m = Object.fromEntries(prof.meters.map((x) => [x.attr, x])) as Record<Attr, (typeof prof.meters)[number]>;
  // A missing job only reads as a problem once it matters: a need tied to a locked champion, or three picks in.
  const problem = (...ids: Need["id"][]) => needs.find((n) => ids.includes(n.id) && (n.personal || picks >= 3));
  const share = prof.damage.physicalShare;
  const cells: { label: string; value: string; bad?: Need; title?: string }[] = [
    { label: "Fight start", value: !picks ? "—" : needs.some((n) => n.id === "engage" || n.id === "setup") ? "None" : "✓", bad: problem("engage", "setup"), title: m.engage.bestBy ? `Best engage: ${m.engage.bestBy}` : undefined },
    { label: "Frontline", value: picks ? String(m.frontline.best) : "—", bad: problem("frontline"), title: `Best ${m.frontline.best} · team ${m.frontline.total}` },
    { label: "Peel", value: picks ? String(m.peel.total) : "—", bad: problem("peel"), title: `Team total · best ${m.peel.best}` },
    { label: "Damage", value: share === null ? "—" : `AD ${Math.round(share * 100)} / AP ${Math.round((1 - share) * 100)}`, bad: problem("magic", "physical") },
    { label: "Sustained", value: picks ? String(m.sustainedDps.best) : "—", bad: problem("dps") },
    { label: "Scaling", value: picks ? scale(m.scaling.best) : "—" },
    { label: "Burst", value: picks ? String(m.burst.best) : "—" },
    { label: "Poke", value: picks ? String(m.poke.best) : "—" },
    { label: "Objectives", value: picks ? scale(m.objectiveControl.best) : "—" },
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
