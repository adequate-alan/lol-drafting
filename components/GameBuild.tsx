"use client";
// One recorded game's build, exactly as Gol.gg gave it: who played it and against whom, where and when, the summoner
// spells, the full rune page, the skill order and the item progression. The same pieces render on the Pro Builds page
// (Games and Compare) and inside an expanded Match History row on Pinned Players (alan, 2026-10-12: "the expanded match
// row and standalone Pro Builds page display identical information"), so an improvement here reaches both.
import Link from "next/link";
import type { ReactNode } from "react";
import { BuildOverview, PurchaseTimeline, RunePage, SkillGrid, SkillNotes, SkillSummaryLine, Spell } from "@/components/BuildParts";
import { InteractiveChampion } from "@/components/InteractiveChampion";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { ChampIcon, Panel } from "@/components/ui";
import { shortDate } from "@/lib/evidence";
import { patchLabel } from "@/lib/patch";
import { profileHref } from "@/lib/pinned-players";
import type { BuildRow } from "@/lib/pro-builds";

export function GameHeader({ r, name, evName, compact, end }: { r: BuildRow; name: (id: string) => string; evName: (r: BuildRow) => string; compact?: boolean; end?: ReactNode }) {
  const b = r.build;
  return (
    <div className={`game-head side-${r.side} ${compact ? "compact" : ""}`}>
      <div className="game-who">
        <span className="game-player"><PlayerAvatar id={b.playerId} name={b.player} size={compact ? "sm" : "lg"} /><Link href={profileHref(String(b.playerId))} title={`${b.player}'s recorded games, champions and builds`}><b>{b.player}</b></Link> <span className="muted">{r.team}</span></span>
        {r.opponent && (
          <span className="small game-vs"><span className="faint">vs</span>
            <InteractiveChampion id={r.opponent.champion} role={b.role}><ChampIcon id={r.opponent.champion} name={name(r.opponent.champion)} size="xs" /> {name(r.opponent.champion)}</InteractiveChampion>
            {r.opponent.player && <span className="muted">{r.opponent.player}</span>}<span className="muted">{r.opponentTeam}</span></span>
        )}
      </div>
      <div className="game-meta xs muted tnum">
        <span>{evName(r)}{r.game.stage ? ` · ${r.game.stage.charAt(0) + r.game.stage.slice(1).toLowerCase().replace(/(\d)/, " $1")}` : ""}</span>
        <span>{r.game.series} · game {r.game.game}</span>
        <span>{patchLabel(r.game.patch)} · {shortDate(r.game.date)}</span>
        <span className="side-tag" title={`${r.team} played on the ${r.side} side in this game`}>{r.side === "blue" ? "Blue" : "Red"} side</span>
        <span className={r.won ? "win" : "loss"}>{r.won ? "Win" : "Loss"}</span>
        <a href={`https://gol.gg/game/stats/${r.game.id}/page-builds/`} target="_blank" rel="noopener noreferrer"
          title={`Gol.gg builds page for this game\nRead ${b.checkedOn}`}>Gol.gg source ↗</a>
        {end}
      </div>
      {b.spells ? (
        <div className="game-spells">{b.spells.map((s, i) => <Spell key={s} a={r.assets} id={s} casts={b.spellCasts?.[i]} size={compact ? "sm" : "md"} />)}</div>
      ) : <span className="xs muted">Summoner spells not recorded</span>}
      {b.missing && <p className="xs caution-text game-missing">Partial record: {b.missing.join(", ")} not given by the source for this game.</p>}
    </div>
  );
}

export function GameDetail({ r, name, evName, end }: { r: BuildRow; name: (id: string) => string; evName: (r: BuildRow) => string; end?: ReactNode }) {
  return (
    <div className="game-detail">
      <GameHeader r={r} name={name} evName={evName} end={end} />
      <div className="builds-cols">
        <Panel title="Runes">{<RunePage r={r} />}</Panel>
        <Panel title="Skill order"><SkillSummaryLine r={r} /><SkillGrid r={r} /><SkillNotes r={r} /></Panel>
      </div>
      <Panel title="Item progression">
        <BuildOverview r={r} />
        <h3 className="build-sub label">Purchase timeline</h3>
        <PurchaseTimeline r={r} />
      </Panel>
    </div>
  );
}
