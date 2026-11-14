"use client";
// Finals Draft Lab (alan, 2026-11-14): a what-if board for the existing Draft Room. Choose, per role, a champion each
// team has actually played at Worlds; the link opens the Draft Room with Gen.G's choices as your team and BLG's as the
// enemy. Nothing is chosen for the user and nothing here was picked in the final. No analysis of its own: the Draft Room
// does the reading, with its usual scoring.
import Link from "next/link";
import { useState } from "react";
import { ChampIcon } from "@/components/ChampIcon";
import { ROLES, type Role } from "@/lib/schema";

type Pool = Record<Role, { id: string; name: string; n: number }[]>;
type Board = Partial<Record<Role, string>>;

/** The Draft Room link for a what-if board: Gen.G's picks as role slots, BLG's as enemies in the roles they played. */
export function labHref(ally: Board, enemy: Board): string {
  const q = new URLSearchParams();
  for (const r of ROLES) if (ally[r]) q.set(r.toLowerCase(), ally[r]!);
  const vs = ROLES.flatMap((r) => (enemy[r] ? [`${r.toLowerCase()}:${enemy[r]}`] : []));
  if (vs.length) q.set("vs", vs.join(","));
  const s = q.toString().replace(/%3A/g, ":").replace(/%2C/g, ",");
  return s ? `/?${s}` : "/";
}

function Side({ team, games, pool, board, taken, onPick }: { team: string; games: number; pool: Pool; board: Board; taken: Set<string>; onPick: (role: Role, id: string) => void }) {
  return (
    <div className="lab-side">
      <p className="lab-team"><b>{team}</b> <span className="xs muted">champions played at the main event, of {games} games</span></p>
      {ROLES.map((r) => (
        <div key={r} className="lab-role" role="group" aria-label={`${team} ${r.toLowerCase()}`}>
          <span className={`role-tag role-${r}`}>{r}</span>
          <div className="lab-picks">
            {pool[r].map((c) => {
              const on = board[r] === c.id, off = !on && taken.has(c.id);
              return (
                <button key={c.id} type="button" className={`lab-pick ${on ? "on" : ""}`} aria-pressed={on} disabled={off}
                  title={off ? `${c.name} is already on this board` : `${c.name}: ${c.n} of ${games} games`} onClick={() => onPick(r, c.id)}>
                  <ChampIcon id={c.id} name={c.name} role={r} size="xs" /><span>{c.name}</span><span className="tnum faint">{c.n}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

export function FinalsLab({ geng, blg, gengGames, blgGames }: { geng: Pool; blg: Pool; gengGames: number; blgGames: number }) {
  const [ally, setAlly] = useState<Board>({});
  const [enemy, setEnemy] = useState<Board>({});
  const toggle = (set: typeof setAlly) => (role: Role, id: string) => set((b) => {
    const next = { ...b };
    if (next[role] === id) delete next[role];
    else next[role] = id;
    return next;
  });
  const count = Object.keys(ally).length + Object.keys(enemy).length;
  const allyIds = new Set(Object.values(ally)), enemyIds = new Set(Object.values(enemy));
  return (
    <div className="finals-lab">
      <p className="small muted finals-note">Build a hypothetical board from champions both teams have played, then open it in the Draft Room: Gen.G as your team, Bilibili Gaming as the enemy. The Draft Room reads it with its usual recommendations and Comp Check. A scenario is a what-if, not a prediction, and BLG&apos;s champions go in the roles they played them.</p>
      <div className="lab-grid">
        <Side team="Gen.G" games={gengGames} pool={geng} board={ally} taken={new Set([...enemyIds, ...allyIds])} onPick={toggle(setAlly)} />
        <Side team="Bilibili Gaming" games={blgGames} pool={blg} board={enemy} taken={new Set([...allyIds, ...enemyIds])} onPick={toggle(setEnemy)} />
      </div>
      <p className="lab-actions">
        <Link className="btn primary" href={labHref(ally, enemy)}>{count ? `Open this board in the Draft Room (${count})` : "Open the Draft Room"}</Link>
        {count > 0 && <button type="button" className="btn ghost sm" onClick={() => { setAlly({}); setEnemy({}); }}>Clear</button>}
        {count > 0 && <span className="xs muted">Replaces the board the Draft Room is holding.</span>}
      </p>
    </div>
  );
}
