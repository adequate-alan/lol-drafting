"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { profile, RULES, warnings, type Draft, type DraftWarning } from "@/lib/evaluate";
import { ROLES, type Attr, type Role, type Source } from "@/lib/schema";
import { clashSuggestions, logicBlockedRoles, logicSuggestions, proSuggestions, similarProDrafts, similarShells, type ByRole, type Suggestion, type SuggestData } from "@/lib/suggest";
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

export function DraftRoom({ data, sources, initial, metaPicks }: {
  data: SuggestData;
  sources: Record<string, Source>;
  initial: Draft;
  metaPicks: Record<string, { picks: number; winRate: number; lowSample: boolean }>;
}) {
  const [draft, setDraft] = useState<Draft>(initial);
  const names = useMemo(() => Object.fromEntries(data.champions.map((c) => [c.id, c.name])), [data.champions]);
  const byName = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of data.champions) { m.set(c.name.toLowerCase(), c.id); c.aliases.forEach((a) => m.set(a.toLowerCase(), c.id)); }
    return m;
  }, [data.champions]);
  const draftLabels = useMemo(() => Object.fromEntries(data.proDrafts.map((d) => [d.id, `${d.team} ${d.seriesGame}`])), [data.proDrafts]);

  const update = (next: Draft) => {
    setDraft(next);
    const q = new URLSearchParams();
    ROLES.forEach((r) => next[r] && q.set(r.toLowerCase(), next[r]!));
    // window.location keeps the GitHub Pages base path; usePathname() would drop it.
    window.history.replaceState(null, "", `${window.location.pathname}${q.size ? `?${q}` : ""}`);
  };
  const lock = (role: Role, id: string | undefined) => update({ ...draft, [role]: id });

  const prof = profile(draft, data.champions);
  const warns = warnings(draft, data.champions);
  const clash = clashSuggestions(draft, data);
  const pro = proSuggestions(draft, data.proDrafts);
  const logic = logicSuggestions(draft, data);
  const logicBlocked = logicBlockedRoles(draft, data);
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
      <div className="draft-slots">
        {ROLES.map((role) => (
          <DraftSlot key={role} role={role} value={draft[role]} names={names} byName={byName}
            champions={data.champions} taken={Object.values(draft).filter(Boolean) as string[]}
            onLock={(id) => lock(role, id)} />
        ))}
      </div>
      <div className="draft-bar">
        <button className="btn sm" onClick={() => update({})} disabled={!lockedCount}>Clear draft</button>
        <span className="xs muted tnum">{lockedCount}/5 locked{open.length ? ` · open: ${open.map((r) => ROLE_LABEL[r]).join(", ")}` : ""}</span>
        <span className="xs faint">Click a suggestion to lock it. The draft is saved in the URL.</span>
        <span style={{ marginLeft: "auto" }} className="row tight">
          {lockedCount >= 2 && (warns.length
            ? <>{critical > 0 && <span className="badge danger">{critical} critical</span>}{warns.length - critical > 0 && <span className="badge caution">{warns.length - critical} caution</span>}</>
            : <span className="badge success">No rule firing</span>)}
        </span>
      </div>

      <div className="draft-layout">
        <section className="panel analysis" aria-label="Composition analysis">
          <div className="panel-body">
            <div className="section-label">Comp profile <SourceBadge layer="logic" /><span className="faint" style={{ marginLeft: "auto", fontWeight: 500 }}>best · total</span></div>
            <div className="meter-list">
              {prof.meters.map((m) => <Meter key={m.attr} label={ATTR_LABEL[m.attr]} best={m.best} total={m.total} by={m.bestBy} empty={!lockedCount} />)}
            </div>
            <div className="legend"><span><i className="ok" />2+ covered</span><span><i className="low" />under 2</span><span>0–3 rule-of-thumb attributes</span></div>
            <div className="section-label" style={{ marginTop: 12 }}>Damage profile</div>
            {prof.damage.physicalShare === null ? <p className="xs muted">No damage yet.</p> : (
              <>
                <div className="dmg"><div className="ad" style={{ width: `${prof.damage.physicalShare * 100}%` }} /><div className="ap" style={{ flex: 1 }} /></div>
                <div className="dmg-legend"><span className="ad">Physical {Math.round(prof.damage.physicalShare * 100)}%</span><span className="ap">Magic {Math.round((1 - prof.damage.physicalShare) * 100)}%</span></div>
              </>
            )}
          </div>
          <div className="panel-body">
            <div className="section-label">Warnings <SourceBadge layer="logic" /></div>
            {!warns.length && (lockedCount < 2
              ? <p className="xs muted">Lock two or more picks to start the checks.</p>
              : <div className="healthy"><WarningBadge severity="healthy" /> No profile rule is firing.</div>)}
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
          <section className="panel rec-columns" aria-label="Suggestions">
            <RecommendationGroup layer="clash" title="My Clash picks" data={clash} open={open} names={names} onPick={lock}
              empty={lockedCount ? "No Clash record covers these picks yet." : "Lock a pick to see your pairings."} />
            <RecommendationGroup layer="pro" title="Played alongside (pro)" data={pro} open={open} names={names} onPick={lock}
              empty={lockedCount ? "No recorded pro game uses these picks." : "Lock a pick to see pro drafts."} />
            <RecommendationGroup layer="logic" title="Fixes a warning" data={logic} open={open} names={names} onPick={lock}
              empty={warns.length ? "No pool champion fixes the open warnings." : "Shows up when a warning fires."}
              notes={Object.fromEntries(logicBlocked.map((r) => [r, r === "SUPPORT" ? "No Clash-approved support fixes this warning." : "No Clash-approved bot fixes this warning."]))} />
          </section>

          {cards.length > 0 && <div className="grid cols-auto">{cards.map((c) => (
            <PairingCard key={c.kind + ("champion" in c.record ? c.record.champion : c.record.anchor)} item={c} names={names} sources={sources} compact draftLabels={draftLabels} />
          ))}</div>}

          <div className="stack">
            <section className="panel">
              <div className="panel-head"><h2>Closest pro drafts</h2><div className="end"><SourceBadge layer="pro" /></div></div>
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
              <div className="panel-head"><h2>Closest comp shells</h2><span className="xs muted">exact pick or same-job swap</span></div>
              <div className="panel-body shell-list">
                {!shells.length && <p className="xs muted">No shell shares a pick or swap with this draft.</p>}
                {shells.map(({ shell, exact, swap }) => (
                  <div key={shell.id} style={{ padding: "4px 0" }}>
                    <div className="row">
                      <Link href={`/comps#${shell.id}`}><b>{shell.name}</b></Link>
                      {shell.kind === "observed" ? <SourceBadge layer="pro" label="Observed" /> : <span className="badge outline">Template</span>}
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
    </>
  );
}

function DraftSlot({ role, value, names, byName, champions, taken, onLock }: {
  role: Role; value?: string; names: Record<string, string>; byName: Map<string, string>;
  champions: SuggestData["champions"]; taken: string[]; onLock: (id: string | undefined) => void;
}) {
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = `champs-${role}`;
  const q = text.trim().toLowerCase();
  // Champions who play this role first, then everyone else; already-locked picks are left out.
  const matches = useMemo(() => {
    const hit = (c: (typeof champions)[number]) => !q || c.name.toLowerCase().includes(q) || c.aliases.some((a) => a.toLowerCase().includes(q));
    const pool = champions.filter((c) => !taken.includes(c.id) && hit(c));
    const starts = (c: (typeof champions)[number]) => (q && c.name.toLowerCase().startsWith(q) ? 0 : 1);
    return [...pool].sort((a, b) => Number(!a.roles.includes(role)) - Number(!b.roles.includes(role)) || starts(a) - starts(b) || a.name.localeCompare(b.name)).slice(0, 8);
  }, [champions, taken, q, role]);
  const pick = (id: string | undefined) => { if (id) { onLock(id); setText(""); setOpen(false); setActive(0); } };
  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive((i) => Math.min(i + 1, matches.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); pick(byName.get(q) ?? matches[active]?.id); }
    else if (e.key === "Escape") setOpen(false);
  };
  return (
    <div className={`draft-slot role-${role} ${value ? "locked" : "open"}`}>
      <span className="slot-icon">{value ? <ChampIcon id={value} name={names[value]} role={role} size="xl" /> : <span className="champ xl"><span className="mono">{role.slice(0, 1)}</span></span>}</span>
      <div className="slot-top"><span className="role-tag">{role}</span><span className="status">{value ? "Locked" : "Open"}</span></div>
      <div className="slot-main">
        {value ? <span className="slot-name truncate">{names[value]}</span> : (
          <div className="picker">
            <input value={text} placeholder="Search champion" aria-label={`${role} champion`} role="combobox" aria-autocomplete="list"
              aria-expanded={open && matches.length > 0} aria-controls={listId} aria-activedescendant={open && matches[active] ? `${listId}-${matches[active].id}` : undefined}
              onChange={(e) => { setText(e.target.value); setOpen(true); setActive(0); }}
              onFocus={() => setOpen(true)} onBlur={() => setOpen(false)} onKeyDown={onKey} />
            {open && matches.length > 0 && (
              <ul id={listId} role="listbox" className="picker-list">
                {matches.map((c, i) => (
                  <li key={c.id} id={`${listId}-${c.id}`} role="option" aria-selected={i === active} className={i === active ? "active" : undefined}
                    onMouseDown={(e) => { e.preventDefault(); pick(c.id); }} onMouseEnter={() => setActive(i)}>
                    <ChampIcon id={c.id} name={c.name} role={c.roles.includes(role) ? role : undefined} size="sm" />
                    <span className="name">{c.name}</span>
                    <span className="roles">{c.roles.includes(role) ? c.roles.join(" · ") : `off-role · ${c.roles.join(" · ")}`}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
      <div className="slot-end">{value && <button className="icon-btn" onClick={() => onLock(undefined)} aria-label={`Clear ${role}`} title={`Clear ${role}`}>×</button>}</div>
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

// Clash reasons carry the record tier; read it for display so defaults look stronger than alternatives.
function clashTier(s: Suggestion): "default" | "alt" | "fit" {
  if (s.reasons.some((r) => /Clash default|is its Clash default|Primary pair/.test(r))) return "default";
  if (s.reasons.some((r) => /Clash alternative|Secondary pair/.test(r))) return "alt";
  return "fit";
}
const TIER_LABEL = { default: "Default", alt: "Alt", fit: "Fits" } as const;

function RecommendationGroup({ layer, title, data, open, names, onPick, empty, notes = {} }: {
  layer: Layer; title: string; data: ByRole; open: Role[]; names: Record<string, string>;
  onPick: (role: Role, id: string) => void; empty: string; notes?: Partial<Record<Role, string>>;
}) {
  const roles = open.filter((r) => data[r]?.length || notes[r]);
  return (
    <div className={`rec-group ${layer}`}>
      <header><h3>{title}</h3><span className="end"><SourceBadge layer={layer} /></span></header>
      <div className="rec-body">
        {!roles.length && <p className="empty">{empty}</p>}
        {roles.map((role) => (
          <div key={role} className={`rec-role role-${role}`}>
            <span className="role-tag">{role}</span>
            {data[role]?.length ? data[role]!.map((s) => {
              const tier = layer === "clash" ? clashTier(s) : undefined;
              const why = layer === "pro" ? s.reasons.slice(0, 2).join(", ") + (s.reasons.length > 2 ? ` +${s.reasons.length - 2}` : "") : s.reasons.join(" · ");
              return (
                <button key={s.champion} className={`rec-row ${tier ?? ""}`} title={s.reasons.join("\n")} onClick={() => onPick(role, s.champion)}>
                  <ChampIcon id={s.champion} name={names[s.champion] ?? s.champion} role={role} size="md" />
                  <span className="name">{names[s.champion] ?? s.champion}</span>
                  {tier ? <span className="tier">{TIER_LABEL[tier]}</span> : layer === "pro" ? <span className="count">{s.score}×</span> : <span />}
                  <span className="why truncate">{why}</span>
                </button>
              );
            }) : <p className="rec-note">{notes[role]}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}
