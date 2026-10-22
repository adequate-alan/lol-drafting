"use client";
// One quiet line under the board when both sides of a lane are locked: what the DPM.LOL matchup data says about each
// lane (alan, 2026-10-22). Counter evidence only, apart from Synergy and the Comp Check read; never a score or an order.
// Each chip opens its evidence: sample, patch, bracket, source, and whether it was read from the enemy's side.
import { LANE_VERDICT_LABEL, type LaneMatchup } from "@/lib/counters";
import { DPM_MIN_GAMES } from "@/lib/counters";
import type { CounterFreshness } from "@/lib/counter-freshness";
import { patchLabel } from "@/lib/patch";
import { Popover } from "./Popover";

const ROLE_SHORT = { TOP: "Top", JUNGLE: "Jungle", MID: "Mid", BOT: "Bot", SUPPORT: "Support" } as const;
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

export function LaneMatchups({ reads, names, fresh }: { reads: LaneMatchup[]; names: Record<string, string>; fresh?: CounterFreshness }) {
  if (!reads.length) return null;
  const n = (id: string) => names[id] ?? id;
  return (
    <div className="lane-reads" role="group" aria-label="Lane matchups from DPM.LOL">
      <span className="lane-reads-k">Lane matchups</span>
      {reads.map((m) => (
        <Popover key={m.role} label={`${ROLE_SHORT[m.role]} matchup: ${n(m.mine)} vs ${n(m.theirs)}`} triggerClass={`lane-read ${m.verdict}`} className="ce"
          trigger={<><span className="lane-read-role">{ROLE_SHORT[m.role]}</span> {LANE_VERDICT_LABEL[m.verdict]}{m.winRate != null && m.verdict !== "no-data" && m.verdict !== "insufficient" ? <span className="mono"> {pct(m.winRate)}</span> : null}{m.stale ? " · older patch" : ""}</>}>
          {() => (
            <div className="ce-card">
              <header className="pop-head"><span className="pop-title counter">Lane matchup</span><span>{LANE_VERDICT_LABEL[m.verdict]}{m.strong ? " · strong" : ""}</span></header>
              <p className="pop-sub">{n(m.mine)} (yours) against {n(m.theirs)} in {ROLE_SHORT[m.role].toLowerCase()}.</p>
              <dl className="pop-kv">
                {m.verdict === "no-data" ? <><dt>Matchup</dt><dd>No DPM.LOL row for this pair yet. A gap in our data, not a read on the lane.</dd></> : <>
                  <dt>Matchup</dt>
                  <dd><a href={m.url} target="_blank" rel="noopener noreferrer" title={`DPM.LOL, collected ${m.updated}`}>DPM.LOL</a> {n(m.mine)} <span className="mono">{pct(m.winRate!)}</span> over <span className="mono">{m.games!.toLocaleString("en-US")}</span> games · <span className="mono">{patchLabel(m.patch!)}</span>{m.rank ? ` · ${m.rank}` : ""}</dd>
                  {m.verdict === "insufficient" && <><dt>Sample</dt><dd>Under {DPM_MIN_GAMES} games: preliminary, not a verdict.</dd></>}
                  {m.inverted && <><dt>Read from</dt><dd>{n(m.theirs)}&apos;s page, turned round: the same games, not a second source.</dd></>}
                  {m.stale && <><dt>Older patch</dt><dd>Collected on <span className="mono">{patchLabel(m.patch!)}</span>{fresh?.newest ? <> (current <span className="mono">{patchLabel(fresh.newest)}</span>)</> : ""}: may no longer reflect current balance.</dd></>}
                </>}
                {m.note && <><dt>Limits</dt><dd>{m.note}</dd></>}
              </dl>
              <footer className="pop-foot"><span>Ranked matchup data only, apart from Synergy and Comp Check; never part of any score or order. 48–52% reads as even.</span></footer>
            </div>
          )}
        </Popover>
      ))}
    </div>
  );
}
