"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { profile, RULES, warnings, type Draft } from "@/lib/evaluate";
import { ATTRS, ROLES, type Attr, type Role, type Source } from "@/lib/schema";
import { clashSuggestions, logicBlockedRoles, logicSuggestions, proSuggestions, similarProDrafts, similarShells, type ByRole, type SuggestData } from "@/lib/suggest";
import { PairingCard, type CardRecord } from "./PairingCard";
import { EvidenceBadge, type Layer } from "./ui";

const ATTR_LABEL: Record<Attr, string> = {
  engage: "Engage", frontline: "Frontline", peel: "Peel", sustainedDps: "Sustained DPS", burst: "Burst", poke: "Poke",
  scaling: "Scaling", lanePressure: "Lane pressure", sidePressure: "Side-lane pressure", objectiveControl: "Objective control",
};

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

  const cards: CardRecord[] = ROLES.flatMap((role): CardRecord[] => {
    const id = draft[role];
    if (!id) return [];
    if (role === "BOT") { const r = data.botPairings.find((b) => b.champion === id); return r ? [{ kind: "bot", record: r }] : []; }
    if (role === "MID" || role === "JUNGLE") { const r = data.midJungle.find((m) => m.anchor === id && m.role === role); return r ? [{ kind: "mid-jungle", record: r }] : []; }
    if (role === "TOP") { const r = data.topPicks.find((t) => t.champion === id); return r ? [{ kind: "top", record: r, stats: metaPicks[id] }] : []; }
    return [];
  });

  return (
    <>
      <div className="slots">
        {ROLES.map((role) => (
          <Slot key={role} role={role} value={draft[role]} names={names} byName={byName}
            options={data.champions.filter((c) => c.roles.includes(role)).map((c) => c.name)}
            allNames={data.champions.map((c) => c.name)}
            onLock={(id) => lock(role, id)} />
        ))}
      </div>
      <div className="row" style={{ marginBottom: 10 }}>
        <button className="btn" onClick={() => update({})}>Clear draft</button>
        <span className="small muted">{lockedCount}/5 locked. Click any suggestion to lock it. Draft is saved in the URL.</span>
      </div>

      <div className="grid" style={{ gridTemplateColumns: "minmax(280px, 340px) minmax(0, 1fr)", alignItems: "start" }}>
        <div className="grid">
          <div className="card">
            <div className="row" style={{ justifyContent: "space-between" }}>
              <h2 style={{ margin: 0 }}>Comp profile</h2><EvidenceBadge layer="logic" />
            </div>
            <p className="small muted">Best value on the team (0-3); total in grey. Rule-of-thumb attributes, not predictions.</p>
            <div className="meters">
              {prof.meters.map((m) => (
                <MeterRow key={m.attr} label={ATTR_LABEL[m.attr]} best={m.best} total={m.total} by={m.bestBy} empty={!lockedCount} />
              ))}
            </div>
            <div className="section-label">Damage profile</div>
            {prof.damage.physicalShare === null ? <p className="small muted">No damage yet.</p> : (
              <>
                <div className="dmg"><div className="ad" style={{ width: `${prof.damage.physicalShare * 100}%` }} /><div className="ap" style={{ flex: 1 }} /></div>
                <p className="small muted" style={{ marginTop: 3 }}>Physical {Math.round(prof.damage.physicalShare * 100)}% · Magic {Math.round((1 - prof.damage.physicalShare) * 100)}%</p>
              </>
            )}
          </div>
          <div className="card">
            <div className="row" style={{ justifyContent: "space-between" }}>
              <h2 style={{ margin: 0 }}>Warnings</h2><EvidenceBadge layer="logic" />
            </div>
            {!warns.length && <p className="small muted">{lockedCount < 2 ? "Lock picks to start the checks." : "No profile rule is firing."}</p>}
            {warns.map((w) => (
              <details key={w.id} className="warning" open>
                <summary>{w.label}</summary>
                <p className="small">{w.why}</p>
                <p className="small muted">Rule: {w.rule}.</p>
              </details>
            ))}
            {cards.some((c) => (c.kind === "bot" && c.record.logic.warning) || c.kind === "top") && <div className="section-label">Pick notes</div>}
            {cards.flatMap((c) => c.kind === "bot" && c.record.logic.warning ? [
              <p key={c.record.champion} className="small"><b>{names[c.record.champion]}:</b> {c.record.logic.warning}</p>] : c.kind === "top" ? [
              <p key={c.record.champion} className="small"><b>{names[c.record.champion]}:</b> avoid {c.record.logic.avoid}</p>] : [])}
            <details className="small muted" style={{ marginTop: 6 }}>
              <summary>All {RULES.length} rules</summary>
              <ul style={{ margin: "4px 0 0", paddingLeft: 16 }}>{RULES.map((r) => <li key={r.id}><b>{r.label}:</b> {r.rule}</li>)}</ul>
            </details>
          </div>
        </div>

        <div className="grid">
          <div className="grid cols-3">
            <SuggestColumn layer="clash" title="My Clash picks" data={clash} open={open} names={names} onPick={lock}
              empty={lockedCount ? "No Clash record covers these picks yet." : "Lock a pick to see your pairings."} />
            <SuggestColumn layer="pro" title="Played alongside (pro)" data={pro} open={open} names={names} onPick={lock} showCount
              empty={lockedCount ? "No recorded pro game uses these picks." : "Lock a pick to see pro drafts."} />
            <SuggestColumn layer="logic" title="Fixes a warning" data={logic} open={open} names={names} onPick={lock}
              empty={warns.length ? "No pool champion fixes the open warnings." : "Shows up when a warning fires."}
              notes={Object.fromEntries(logicBlocked.map((r) => [r, r === "SUPPORT" ? "No Clash-approved support fixes this warning." : "No Clash-approved bot fixes this warning."]))} />
          </div>

          {cards.length > 0 && <div className="grid cols-auto">{cards.map((c) => (
            <PairingCard key={c.kind + ("champion" in c.record ? c.record.champion : c.record.anchor)} item={c} names={names} sources={sources} compact draftLabels={draftLabels} />
          ))}</div>}

          <div className="grid cols-2">
            <div className="card">
              <div className="row" style={{ justifyContent: "space-between" }}><h2 style={{ margin: 0 }}>Closest pro drafts</h2><EvidenceBadge layer="pro" /></div>
              {!similar.length && <p className="small muted">Nothing recorded shares a champion with this draft.</p>}
              {similar.length > 0 && (
                <table>
                  <thead><tr><th>Game</th><th>Team</th>{ROLES.map((r) => <th key={r}>{r.slice(0, 3)}</th>)}</tr></thead>
                  <tbody>{similar.map(({ draft: d }) => (
                    <tr key={d.id}>
                      <td><Link href={`/pro-drafts?id=${d.id}`}>{d.seriesGame}</Link></td><td>{d.team}</td>
                      {ROLES.map((r) => <td key={r} style={{ fontWeight: draft[r] === d.picks[r] ? 700 : 400 }}>{names[d.picks[r]]}</td>)}
                    </tr>))}</tbody>
                </table>
              )}
            </div>
            <div className="card">
              <div className="row" style={{ justifyContent: "space-between" }}><h2 style={{ margin: 0 }}>Closest comp shells</h2><span className="small muted">exact pick or same-job swap</span></div>
              {!shells.length && <p className="small muted">No shell shares a pick or swap with this draft.</p>}
              {shells.map(({ shell, exact, swap }) => (
                <div key={shell.id} style={{ marginBottom: 6 }}>
                  <div className="row">
                    <Link href={`/comps#${shell.id}`}><b>{shell.name}</b></Link>
                    <EvidenceBadge layer={shell.kind === "observed" ? "pro" : "clash"} />
                    <span className="small muted">{exact} exact, {swap} swap</span>
                  </div>
                  <p className="small muted">{ROLES.map((r) => names[shell.slots[r].champion]).join(" · ")} · {shell.winCondition}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function Slot({ role, value, names, byName, options, allNames, onLock }: {
  role: Role; value?: string; names: Record<string, string>; byName: Map<string, string>;
  options: string[]; allNames: string[]; onLock: (id: string | undefined) => void;
}) {
  const [text, setText] = useState("");
  const listId = `champs-${role}`;
  const commit = () => {
    const id = byName.get(text.trim().toLowerCase());
    if (id) { onLock(id); setText(""); }
  };
  const others = allNames.filter((n) => !options.includes(n));
  return (
    <div className={`slot role-${role}`}>
      <div className="slot-head"><span className="role-tag">{role}</span>
        {value && <button className="btn small" style={{ padding: "0 6px" }} onClick={() => onLock(undefined)} aria-label={`Clear ${role}`}>×</button>}
      </div>
      {value ? <div className="locked">{names[value]}</div> : (
        <>
          <input list={listId} value={text} placeholder="Search champion" aria-label={`${role} champion`}
            onChange={(e) => { setText(e.target.value); if (byName.has(e.target.value.trim().toLowerCase())) { onLock(byName.get(e.target.value.trim().toLowerCase())); setText(""); } }}
            onKeyDown={(e) => e.key === "Enter" && commit()} />
          <datalist id={listId}>{[...options, ...others].map((n) => <option key={n} value={n} />)}</datalist>
        </>
      )}
    </div>
  );
}

function MeterRow({ label, best, total, by, empty }: { label: string; best: number; total: number; by: string | null; empty: boolean }) {
  return (
    <>
      <span title={by ? `Best: ${by}` : undefined}>{label}</span>
      <div className={`bar ${!empty && best < 2 ? "low" : ""}`}><span style={{ width: `${(best / 3) * 100}%` }} /></div>
      <span className="small muted">{best}<span style={{ opacity: .6 }}>/{total}</span></span>
    </>
  );
}

function SuggestColumn({ layer, title, data, open, names, onPick, empty, showCount, notes = {} }: {
  layer: Layer; title: string; data: ByRole; open: Role[]; names: Record<string, string>;
  onPick: (role: Role, id: string) => void; empty: string; showCount?: boolean; notes?: Partial<Record<Role, string>>;
}) {
  const any = open.some((r) => data[r]?.length || notes[r]);
  return (
    <div className={`card layer ${layer}`} style={{ marginTop: 0 }}>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 6 }}><h3 style={{ margin: 0 }}>{title}</h3><EvidenceBadge layer={layer} /></div>
      {!any && <p className="small muted">{empty}</p>}
      {open.map((role) => data[role]?.length ? (
        <div key={role} className={`sugg-role role-${role}`}>
          <span className="role-tag">{role}</span>
          <span className="row">{data[role]!.map((s) => (
            <button key={s.champion} className={`chip role-${role}`} title={s.reasons.join("\n")} onClick={() => onPick(role, s.champion)}>
              <span className="dot" />{names[s.champion] ?? s.champion}{showCount && <small>{s.score}×</small>}
            </button>))}</span>
        </div>
      ) : notes[role] ? (
        <div key={role} className={`sugg-role role-${role}`}>
          <span className="role-tag">{role}</span>
          <span className="small muted">{notes[role]}</span>
        </div>
      ) : null)}
    </div>
  );
}
