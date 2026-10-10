"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { picksOf, profile, RULES, warnings, type Draft, type DraftWarning } from "@/lib/evaluate";
import { recommend, teamNeeds, winConditions, type FitKind, type Recommendation } from "@/lib/recommend";
import { ROLES, type Attr, type Counters, type Role, type Source } from "@/lib/schema";
import type { DrawerData } from "@/lib/data";
import { counterPicks, describeEvidence, detectEnemyRoles, enemyParam, tierLabel, type Counter, type EnemyDraft, type RoleCounters } from "@/lib/counters";
import { ChampionDrawer, useDrawerIndex, type DrawerTarget } from "./ChampionDrawer";
import { describeLine } from "@/lib/evidence";
import { proSuggestions, similarProDrafts, similarShells, type ProByRole, type SuggestData } from "@/lib/suggest";
import { PairingCard, type CardRecord } from "./PairingCard";
import { ChampIcon, ChampionRow, SourceBadge, WarningBadge, type Layer, type Severity } from "./ui";

const ATTR_LABEL: Record<Attr, string> = {
  engage: "Engage", frontline: "Frontline", peel: "Peel", sustainedDps: "Sustained DPS", burst: "Burst", poke: "Poke",
  scaling: "Scaling", lanePressure: "Lane pressure", sidePressure: "Side-lane pressure", objectiveControl: "Objective control",
};
const ROLE_LABEL: Record<Role, string> = { TOP: "Top", JUNGLE: "Jungle", MID: "Mid", BOT: "Bot", SUPPORT: "Support" };

// Display grouping only: which rule warnings read as a structural hole versus something to keep an eye on.
// The rules themselves (lib/evaluate.ts) are unchanged.
const CRITICAL = new Set(["no-engage", "needs-fight-starter", "no-frontline", "insufficient-peel", "vulnerable-hard-engage"]);
const severityOf = (w: DraftWarning): Severity => (CRITICAL.has(w.id) ? "critical" : "caution");

const KIND_LABEL: Record<FitKind, string> = { saved: "Saved", synergy: "Synergy", need: "Need", matchup: "Matchup", risk: "Risk" };
const ENEMY_SLOTS = 5;

export function DraftRoom({ data, sources, drawerData, initial, initialEnemy, metaPicks }: {
  data: SuggestData & { counters: Counters };
  drawerData: DrawerData;
  sources: Record<string, Source>;
  initial: Draft;
  initialEnemy: EnemyDraft; // roles from ?vs=top:aatrox, or detected for bare ids
  metaPicks: Record<string, { picks: number; winRate: number; lowSample: boolean }>;
}) {
  const [draft, setDraft] = useState<Draft>(initial);
  const [enemy, setEnemy] = useState<(string | undefined)[]>(() => {
    const ids = ROLES.map((r) => initialEnemy[r]).filter(Boolean);
    return Array.from({ length: ENEMY_SLOTS }, (_, i) => ids[i]);
  });
  // Roles given in the URL stick to their champion; everything else is placed by detectEnemyRoles.
  const [enemyHints] = useState(() => new Map(ROLES.flatMap((r) => (initialEnemy[r] ? [[initialEnemy[r]!, r] as const] : []))));
  const [drawer, setDrawer] = useState<DrawerTarget>();
  const drawerIndex = useDrawerIndex(drawerData);
  const names = useMemo(() => Object.fromEntries(data.champions.map((c) => [c.id, c.name])), [data.champions]);
  const byName = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of data.champions) { m.set(c.name.toLowerCase(), c.id); c.aliases.forEach((a) => m.set(a.toLowerCase(), c.id)); }
    return m;
  }, [data.champions]);
  const eventMap = useMemo(() => Object.fromEntries((data.events ?? []).map((e) => [e.id, e])), [data.events]);
  const draftLabels = useMemo(() => Object.fromEntries(data.proDrafts.map((d) => [d.id, `${d.team} ${d.seriesGame}`])), [data.proDrafts]);

  const update = (next: Draft, nextEnemy = enemy) => {
    setDraft(next);
    setEnemy(nextEnemy);
    const q = new URLSearchParams();
    ROLES.forEach((r) => next[r] && q.set(r.toLowerCase(), next[r]!));
    const placed = enemyRolesOf(nextEnemy);
    const vs = [enemyParam(placed), ...nextEnemy.filter((id) => id && !Object.values(placed).includes(id))].filter(Boolean);
    if (vs.length) q.set("vs", vs.join(","));
    // window.location keeps the GitHub Pages base path; usePathname() would drop it.
    window.history.replaceState(null, "", `${window.location.pathname}${q.size ? `?${q.toString().replace(/%2C/g, ",")}` : ""}`);
  };
  function enemyRolesOf(list: (string | undefined)[]): EnemyDraft {
    const ids = list.filter((e): e is string => !!e);
    const fixed: EnemyDraft = {};
    for (const id of ids) { const r = enemyHints.get(id); if (r && !fixed[r]) fixed[r] = id; }
    return detectEnemyRoles(ids, data.champions, fixed);
  }
  const lock = (role: Role, id: string | undefined) => update({ ...draft, [role]: id });
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
  const enemyDraft = enemyRolesOf(enemy);
  const enemyRoleOf = new Map(ROLES.flatMap((r) => (enemyDraft[r] ? [[enemyDraft[r]!, r] as const] : [])));
  // The full draft-fit list, so a counter can say where it ranks overall. The visible list is its top five.
  const fits = recommend(draft, enemyIds, data, Infinity);
  const recs = Object.fromEntries(Object.entries(fits).map(([r, list]) => [r, list!.slice(0, 5)])) as typeof fits;
  const counters = counterPicks(draft, enemyDraft, data, fits);
  const counterOf = (role: Role, id: string) => counters[role]?.counters.find((c) => c.champion === id);
  const proAll = proSuggestions(draft, data.proDrafts, { botPairings: data.botPairings, events: data.events, sources }, Infinity);
  const pro: ProByRole = Object.fromEntries(Object.entries(proAll).map(([r, list]) => [r, list!.slice(0, 6)]));
  const proCount = (role: Role, id: string) => proAll[role]?.find((p) => p.champion === id)?.score ?? 0;
  const similar = similarProDrafts(draft, data.proDrafts);
  const shells = similarShells(draft, data.shells);
  const open = ROLES.filter((r) => !draft[r]);
  const lockedCount = ROLES.length - open.length;
  const critical = warns.filter((w) => severityOf(w) === "critical").length;

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

  return (
    <>
      <div className="team-label">Your team</div>
      <div className="draft-slots">
        {ROLES.map((role) => (
          <DraftSlot key={role} role={role} label={role} value={draft[role]} names={names} byName={byName}
            champions={data.champions} taken={taken} onLock={(id) => lock(role, id)} suggested={recs[role]} />
        ))}
      </div>
      <div className="team-label enemy">Enemy</div>
      <div className="draft-slots enemy-slots">
        {enemy.map((id, i) => (
          <DraftSlot key={i} label={id && enemyRoleOf.has(id) ? `Enemy ${enemyRoleOf.get(id)}` : `Enemy ${i + 1}`} ariaLabel={`Enemy ${i + 1} champion`} listKey={`enemy-${i}`} value={id} names={names} byName={byName}
            champions={data.champions} taken={taken} onLock={(v) => lockEnemy(i, v)} compact />
        ))}
      </div>
      <div className="draft-bar">
        <button className="btn sm" onClick={() => update({}, enemy.map(() => undefined))} disabled={!lockedCount && !enemyIds.length}>Clear draft</button>
        <span className="xs muted tnum">{lockedCount}/5 locked{enemyIds.length ? ` · ${enemyIds.length} enemy` : ""}{open.length ? ` · open: ${open.map((r) => ROLE_LABEL[r]).join(", ")}` : ""}</span>
        <span style={{ marginLeft: "auto" }} className="row tight">
          {lockedCount >= 2 && (warns.length
            ? <>{critical > 0 && <span className="badge danger">{critical} critical</span>}{warns.length - critical > 0 && <span className="badge caution">{warns.length - critical} caution</span>}</>
            : <span className="badge success">No warnings</span>)}
        </span>
      </div>

      <div className="draft-layout">
        <section className="panel analysis" aria-label="Comp Check">
          <div className="panel-head"><h2>Comp Check</h2><div className="end"><SourceBadge layer="logic" /></div></div>
          <div className="panel-body">
            <div className="section-label">Profile<span className="faint" style={{ marginLeft: "auto", fontWeight: 500 }}>best · total</span></div>
            <div className="meter-list">
              {prof.meters.map((m) => <Meter key={m.attr} label={ATTR_LABEL[m.attr]} best={m.best} total={m.total} by={m.bestBy} empty={!lockedCount} />)}
            </div>
            <div className="section-label" style={{ marginTop: 10 }}>Damage</div>
            {prof.damage.physicalShare === null ? <p className="xs muted">No damage yet.</p> : (
              <>
                <div className="dmg"><div className="ad" style={{ width: `${prof.damage.physicalShare * 100}%` }} /><div className="ap" style={{ flex: 1 }} /></div>
                <div className="dmg-legend"><span className="ad">Physical {Math.round(prof.damage.physicalShare * 100)}%</span><span className="ap">Magic {Math.round((1 - prof.damage.physicalShare) * 100)}%</span></div>
              </>
            )}
          </div>
          <div className="panel-body">
            <div className="section-label">Win condition</div>
            {!plans.length
              ? <p className="xs muted">{picks.length < 2 ? "Needs two picks." : "No clear plan yet."}</p>
              : plans.slice(0, 3).map((w, i) => <div key={w.id} className={`plan ${i === 0 ? "main" : ""}`}><b>{w.title}</b><p>{w.text}</p></div>)}
            {needs.length > 0 && (
              <>
                <div className="section-label" style={{ marginTop: 10 }}>Missing</div>
                <ul className="needs">{needs.map((n) => <li key={n.id}><b>{n.label[0].toUpperCase() + n.label.slice(1)}</b>: {n.text}</li>)}</ul>
              </>
            )}
            {enemyPlans.length > 0 && (
              <>
                <div className="section-label" style={{ marginTop: 10 }}>Enemy plan</div>
                <div className="plan"><b>{enemyPlans[0].title}</b><p>{enemyPlans[0].text}</p></div>
              </>
            )}
          </div>
          <div className="panel-body">
            <div className="section-label">Warnings</div>
            {!warns.length && (lockedCount < 2
              ? <p className="xs muted">Needs two picks.</p>
              : <div className="healthy">No warnings.</div>)}
            {[...warns].sort((a, b) => Number(severityOf(b) === "critical") - Number(severityOf(a) === "critical")).map((w) => (
              <details key={w.id} className={`warning-item ${severityOf(w)}`} open>
                <summary><WarningBadge severity={severityOf(w)} />{w.label}</summary>
                <p>{w.why}</p>
                <p className="xs muted">Rule: {w.rule}.</p>
              </details>
            ))}
            {pickNotes.length > 0 && (
              <div className="notes" style={{ marginTop: 10 }}>
                <div className="section-label">Pick notes</div>
                {pickNotes.map((n) => <p key={n.id}><b>{names[n.id]}:</b> {n.text}</p>)}
              </div>
            )}
            <details className="rules" style={{ marginTop: 8 }}>
              <summary>All {RULES.length} rules</summary>
              <ul>{RULES.map((r) => <li key={r.id}><b>{r.label}:</b> {r.rule}</li>)}</ul>
            </details>
          </div>
        </section>

        <div className="stack">
          <section className="panel recs" aria-label="Recommended Picks">
            <div className="panel-head">
              <h2>Recommended Picks</h2>
              <span className="xs faint">by draft fit</span>
            </div>
            {!lockedCount && !enemyIds.length ? <div className="panel-body"><p className="xs muted">Lock a pick to start.</p></div> : (
              <div className="fit-grid">
                {open.map((role) => (
                  <div key={role} className={`fit-role role-${role}`}>
                    <div className="fit-role-head"><span className="role-tag">{role}</span></div>
                    {recs[role]?.length
                      ? recs[role]!.map((r, i) => <FitRow key={r.champion} rec={r} rank={i} proGames={proCount(role, r.champion)} counter={counterOf(role, r.champion)} names={names} onPick={() => lock(role, r.champion)} />)
                      : <p className="rec-note">Nothing stands out yet.</p>}
                  </div>
                ))}
                {!open.length && <p className="xs muted" style={{ padding: "var(--s4) var(--s5)" }}>All five roles are locked.</p>}
              </div>
            )}
            <div className="panel-foot xs faint">Matchups use champion attributes, not lane stats. Pro games never add to the score.</div>
          </section>

          {enemyIds.length > 0 && <CountersPanel counters={counters} open={open} enemy={enemyDraft} names={names} dpm={data.counters.dpm.length + data.counters.dpmDuos.length > 0}
            onOpen={(id, role) => setDrawer({ id, role })} />}

          <section className="panel rec-columns single" aria-label="Pro Pairings">
            <RecommendationGroup layer="pro" title="Pro Pairings" data={pro} open={open} names={names} onPick={lock}
              empty={lockedCount ? "No recorded pro game uses these picks." : "Lock a pick to start."} />
          </section>

          {cards.length > 0 && <div className="grid cols-auto">{cards.map((c) => (
            <PairingCard key={c.kind + ("champion" in c.record ? c.record.champion : c.record.anchor)} item={c} names={names} sources={sources} events={eventMap} compact draftLabels={draftLabels} />
          ))}</div>}

          <div className="stack">
            <section className="panel">
              <div className="panel-head pro-head"><h2>Similar pro drafts</h2></div>
              {!similar.length ? <div className="panel-body"><p className="xs muted">Nothing recorded shares a champion with this draft.</p></div> : (
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Game</th><th>Team</th>{ROLES.map((r) => <th key={r}>{ROLE_LABEL[r]}</th>)}</tr></thead>
                    <tbody>{similar.map(({ draft: d }) => (
                      <tr key={d.id}>
                        <td><Link className="cell-link" style={{ whiteSpace: "nowrap" }} href={`/pro-drafts?id=${d.id}`}>{d.seriesGame}</Link></td><td className="muted" style={{ whiteSpace: "nowrap" }}>{d.team}</td>
                        {ROLES.map((r) => <td key={r}><ChampionRow id={d.picks[r]} name={names[d.picks[r]] ?? d.picks[r]} role={r} hit={draft[r] === d.picks[r]} /></td>)}
                      </tr>))}</tbody>
                  </table>
                </div>
              )}
            </section>
            <section className="panel">
              <div className="panel-head"><h2>Similar comps</h2></div>
              <div className="panel-body shell-list">
                {!shells.length && <p className="xs muted">No shell shares a pick or swap with this draft.</p>}
                {shells.map(({ shell, exact, swap }) => (
                  <div key={shell.id} style={{ padding: "4px 0" }}>
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
        </div>
      </div>
      {drawer && <ChampionDrawer target={drawer} data={drawerData} index={drawerIndex} onClose={() => setDrawer(undefined)} onSelect={setDrawer} />}
    </>
  );
}

const STATUS = { default: "Default", alt: "Alt", fits: "Fits" } as const;

function FitRow({ rec, rank, proGames, counter, names, onPick }: { rec: Recommendation; rank: number; proGames: number; counter?: Counter; names: Record<string, string>; onPick: () => void }) {
  const [open, setOpen] = useState(false);
  const name = names[rec.champion] ?? rec.champion;
  const lead = rec.parts.find((p) => p.points > 0) ?? rec.parts[0];
  const risk = rec.parts.some((p) => p.kind === "risk");
  return (
    <div className={`fit-row ${rank === 0 ? "top" : ""} ${open ? "open" : ""}`}>
      <button className="fit-head" onClick={onPick} title={`Lock ${name} at ${rec.role}\n${rec.parts.map((p) => `${p.points > 0 ? "+" : ""}${p.points}  ${p.text}`).join("\n")}`}>
        <ChampIcon id={rec.champion} name={name} role={rec.role} size="md" />
        <span className="fit-line">
          <span className="name">{name}</span>
          {rec.saved && <span className={`status-tag ${rec.saved}`} title="Saved pairing">{STATUS[rec.saved]}</span>}
          {proGames > 0 && <span className="badge pro" title="Pro games with this champion next to one of your picks. Evidence only, not part of the score.">Pro {proGames}</span>}
          {counter && <span className="status-tag counter" title={`${counterLine(counter, names)}. Counter signal only, not part of the score.`}>Counter</span>}
          {risk && <span className="status-tag risk">Risk</span>}
        </span>
        <span className="fit-reason truncate">{lead?.text}</span>
        <span className={`fit-score ${rec.score < 0 ? "neg" : ""}`} title="Draft-fit score">{rec.score > 0 ? "+" : ""}{rec.score}</span>
      </button>
      <button className="fit-toggle" aria-expanded={open} aria-label={`Why ${name}`} title={`${rec.parts.length} reasons`} onClick={() => setOpen((o) => !o)}>
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 3.5 5 6.5 8 3.5" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>
      </button>
      <ul className="fit-why">{rec.parts.map((p, i) => (
        <li key={i} className={`k-${p.kind}`}><span className="k">{KIND_LABEL[p.kind]}</span><span className="t">{p.text}</span><span className="pts">{p.points > 0 ? "+" : ""}{p.points}</span></li>
      ))}</ul>
    </div>
  );
}

function DraftSlot({ role, label, ariaLabel, listKey, value, names, byName, champions, taken, onLock, compact = false, suggested = [] }: {
  role?: Role; label: string; ariaLabel?: string; listKey?: string; value?: string; names: Record<string, string>; byName: Map<string, string>;
  champions: SuggestData["champions"]; taken: string[]; onLock: (id: string | undefined) => void; compact?: boolean; suggested?: Recommendation[];
}) {
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = `champs-${listKey ?? role}`;
  const q = text.trim().toLowerCase();
  // With no query: the best draft fits first, then the role alphabetically. With a query: names that start with it,
  // champions who play the role, then everyone else. Locked picks (both teams) are left out.
  const fit = useMemo(() => new Map(suggested.map((s) => [s.champion, s.score])), [suggested]);
  const matches = useMemo(() => {
    const hit = (c: (typeof champions)[number]) => !q || c.name.toLowerCase().includes(q) || c.aliases.some((a) => a.toLowerCase().includes(q));
    const pool = champions.filter((c) => !taken.includes(c.id) && hit(c) && (q || !role || c.roles.includes(role)));
    const starts = (c: (typeof champions)[number]) => (q && c.name.toLowerCase().startsWith(q) ? 0 : 1);
    const off = (c: (typeof champions)[number]) => Number(!!role && !c.roles.includes(role));
    const rank = (c: (typeof champions)[number]) => (q ? 0 : -(fit.get(c.id) ?? -99));
    return [...pool].sort((a, b) => off(a) - off(b) || starts(a) - starts(b) || rank(a) - rank(b) || a.name.localeCompare(b.name)).slice(0, q ? 8 : 10);
  }, [champions, taken, q, role, fit]);
  const mark = (name: string) => {
    const i = q ? name.toLowerCase().indexOf(q) : -1;
    return i < 0 ? name : <>{name.slice(0, i)}<mark>{name.slice(i, i + q.length)}</mark>{name.slice(i + q.length)}</>;
  };
  const pick = (id: string | undefined) => { if (id) { onLock(id); setText(""); setOpen(false); setActive(0); } };
  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive((i) => Math.min(i + 1, matches.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); pick(byName.get(q) ?? matches[active]?.id); }
    else if (e.key === "Escape") setOpen(false);
  };
  return (
    <div className={`draft-slot ${role ? `role-${role}` : "enemy"} ${compact ? "compact" : ""} ${value ? "locked" : "open"}`}>
      <span className="slot-icon">{value ? <ChampIcon id={value} name={names[value]} role={role} size={compact ? "md" : "xl"} /> : <span className={`champ ${compact ? "md" : "xl"}`}><span className="mono">{label.slice(0, 1)}</span></span>}</span>
      <div className="slot-top"><span className="role-tag">{label}</span></div>
      <div className="slot-main">
        {value ? <span className="slot-name truncate">{names[value]}</span> : (
          <div className="picker">
            <input value={text} placeholder={compact ? "Champion" : "Pick champion"} aria-label={ariaLabel ?? `${role} champion`} role="combobox" aria-autocomplete="list"
              aria-expanded={open && matches.length > 0} aria-controls={listId} aria-activedescendant={open && matches[active] ? `${listId}-${matches[active].id}` : undefined}
              onChange={(e) => { setText(e.target.value); setOpen(true); setActive(0); }}
              onFocus={() => setOpen(true)} onBlur={() => setOpen(false)} onKeyDown={onKey} />
            {open && matches.length > 0 && (
              <ul id={listId} role="listbox" className="picker-list">
                {matches.map((c, i) => (
                  <li key={c.id} id={`${listId}-${c.id}`} role="option" aria-selected={i === active} className={i === active ? "active" : undefined}
                    onMouseDown={(e) => { e.preventDefault(); pick(c.id); }} onMouseEnter={() => setActive(i)}>
                    <ChampIcon id={c.id} name={c.name} role={role && c.roles.includes(role) ? role : undefined} size="sm" />
                    <span className="name">{mark(c.name)}</span>
                    {fit.has(c.id)
                      ? <span className="fit tnum">+{fit.get(c.id)}</span>
                      : <span className="roles">{!role || c.roles.includes(role) ? c.roles.join(" · ") : `off-role · ${c.roles.join(" · ")}`}</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
      <div className="slot-end">{value && <button className="icon-btn" onClick={() => onLock(undefined)} aria-label={`Clear ${label}`} title={`Clear ${label}`}>×</button>}</div>
    </div>
  );
}

function Meter({ label, best, total, by, empty }: { label: string; best: number; total: number; by: string | null; empty: boolean }) {
  const state = empty ? "" : best >= 2 ? "ok" : "low";
  return (
    <div className={`meter ${state}`} title={by ? `Best: ${by}` : undefined}>
      <span className="label">{label}</span>
      <span className="segs" aria-hidden="true">{[1, 2, 3].map((n) => <i key={n} className={best >= n ? "on" : ""} />)}</span>
      <span className="val"><b>{best}</b>/{total}</span>
    </div>
  );
}

function RecommendationGroup({ layer, title, data, open, names, onPick, empty, note }: {
  layer: Layer; title: string; data: ProByRole; open: Role[]; names: Record<string, string>;
  onPick: (role: Role, id: string) => void; empty: string; note?: string;
}) {
  const roles = open.filter((r) => data[r]?.length);
  return (
    <div className={`rec-group ${layer}`}>
      <header><h3>{title}</h3></header>
      {note && <p className="rec-lede">{note}</p>}
      <div className="rec-body">
        {!roles.length && <p className="empty">{empty}</p>}
        {roles.map((role) => (
          <div key={role} className={`rec-role role-${role}`}>
            <span className="role-tag">{role}</span>
            {data[role]!.map((s) => {
              const [latest, ...older] = s.lines;
              return (
                <button key={s.champion} className="rec-row ev" title={s.reasons.join("\n")} onClick={() => onPick(role, s.champion)}>
                  <ChampIcon id={s.champion} name={names[s.champion] ?? s.champion} role={role} size="sm" />
                  <span className="name">{names[s.champion] ?? s.champion}</span>
                  <span className="ev-lines">
                    <span className="latest">{describeLine({ ...latest, label: latest.event })}{latest.ongoing ? " · ongoing" : ""}</span>
                    {older.length > 0 && <span className="older truncate">+ older: {older.map((l) => describeLine({ ...l, label: l.event })).join("; ")}</span>}
                  </span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

const STRENGTH = { strong: "Strong", favorable: "Favorable" } as const;
const vsNames = (ids: string[], names: Record<string, string>) => ids.map((v) => names[v] ?? v).join(" + ");
const counterLine = (c: Counter, names: Record<string, string>) =>
  `${STRENGTH[c.evidence.strength]} vs ${vsNames(c.evidence.vs, names)}${c.evidence.with ? ` with ${names[c.evidence.with] ?? c.evidence.with}` : ""} · ${describeEvidence(c.evidence)}`;

// Counters: favourable into an enemy pick. A separate signal: never scored, never merged into Synergy, Pro Pairings or
// Logic. Each row says where the champion ranks on overall draft fit, so a counter never reads as the best pick by itself.
function CountersPanel({ counters, open, enemy, names, dpm, onOpen }: {
  counters: Partial<Record<Role, RoleCounters>>; open: Role[]; enemy: EnemyDraft; names: Record<string, string>; dpm: boolean;
  onOpen: (id: string, role: Role) => void;
}) {
  const roles = open.filter((r) => counters[r]);
  return (
    <section className="panel counters" aria-label="Counters">
      <div className="panel-head"><h2>Counters</h2><span className="xs faint">into the enemy lane · pool first</span></div>
      <div className="rec-body">
        {!roles.length && <p className="empty">No enemy lane opponent for an open role yet.</p>}
        {roles.map((role) => {
          const rc = counters[role]!;
          return (
            <div key={role} className={`rec-role role-${role}`}>
              <div className="counter-head"><span className="role-tag">{role}</span><span className="xs muted">vs {vsNames(rc.vs, names)}{rc.scope === "duo" ? " (duo)" : ""}</span></div>
              {!rc.counters.length && <p className="empty">No reliable counter data for {vsNames(rc.vs, names)}.</p>}
              {rc.counters.map((c) => {
                const e = c.evidence;
                const why = [counterLine(c, names), e.note, `Pool: ${tierLabel(c.tier)}`,
                  c.fitRank === 1 ? "Also the best overall draft fit" : c.fitRank ? `Overall draft fit: #${c.fitRank} (${c.fit!.score > 0 ? "+" : ""}${c.fit!.score})` : "No draft-fit reasons yet",
                  ...c.cautions].filter(Boolean).join("\n");
                return (
                  <button key={c.champion} className={`rec-row counter-row ${c.tier ? "" : "ref"}`} title={why} onClick={() => onOpen(c.champion, role)}>
                    <ChampIcon id={c.champion} name={names[c.champion] ?? c.champion} role={role} size="sm" />
                    <span className="name">{names[c.champion] ?? c.champion}</span>
                    <span className="strength">{STRENGTH[e.strength]}</span>
                    <span className={`badge ${e.source === "pro" ? "pro" : "outline"}`}>{e.source === "pro" ? "Pro" : "DPM"}</span>
                    <span className="ev truncate">{describeEvidence(e).replace(/^(Pro|DPM) · /, "")}{e.with ? ` · with ${names[e.with] ?? e.with}` : ""}</span>
                    <span className={`tier ${c.tier ?? "none"}`}>{tierLabel(c.tier)}</span>
                    <span className={`fit-rank ${c.fitRank === 1 ? "best" : ""}`}>{c.fitRank === 1 ? "Best fit" : c.fitRank ? `Fit #${c.fitRank}` : "Unranked"}</span>
                  </button>
                );
              })}
              {rc.note && <p className="rec-note">{rc.note}</p>}
            </div>
          );
        })}
      </div>
      <div className="panel-foot xs faint">Counters never change the draft-fit ranking. Pro needs {"\u2265"}3 recorded games with results; {dpm ? "DPM is SoloQ data." : "DPM.LOL data is not loaded yet."}</div>
    </section>
  );
}
