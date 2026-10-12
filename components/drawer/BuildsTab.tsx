"use client";
// Builds: a gateway to Pro Builds, never a second build renderer (alan, 2026-10-12). How many builds, the newest patch,
// who played it last (each game opens that exact build) and a prominent View Pro Builds action.
import Link from "next/link";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { Section, roleName, type DrawerEnv } from "@/components/drawer/parts";
import { buildsLink, proDraftHref } from "@/lib/drawer";
import { shortDate } from "@/lib/evidence";
import { patchLabel } from "@/lib/patch";
import { gameIdOf } from "@/lib/pro-drafts-game";

export function BuildsTab({ env }: { env: DrawerEnv }) {
  const { id, role, name, builds, context, data } = env;
  const from = context.from;
  const all = buildsLink(id, role, undefined, from);
  const gameDraft = context.game ? data.proDrafts.find((d) => gameIdOf(d) === context.game && d.picks[role] === id) : undefined;
  const thisGame = context.game && data.buildGames.includes(context.game) ? (gameDraft ? proDraftHref(gameDraft.id, role) : buildsLink(id, role, context.game, from)) : undefined;
  if (!builds) {
    return (
      <Section layer="pro" title="Pro builds">
        <p className="xs muted">No recorded pro builds for {name(id)} as {roleName(role).toLowerCase()}. Builds come from the recorded games of the tracked tournaments.</p>
        <p className="dw-actions"><Link className="btn sm" href="/pro-builds/" data-to="/pro-builds/">Browse Pro Builds</Link></p>
      </Section>
    );
  }
  return (
    <>
      <Section layer="pro" title="Pro builds">
        <dl className="dw-kv stats">
          <dt>Recorded</dt><dd className="tnum">{builds.games} build{builds.games > 1 ? "s" : ""} · {builds.players} player{builds.players > 1 ? "s" : ""}</dd>
          <dt>Latest patch</dt><dd className="tnum">{patchLabel(builds.latest)}</dd>
          <dt>Last played</dt><dd className="tnum">{shortDate(builds.lastPlayed) ?? builds.lastPlayed}</dd>
        </dl>
        <p className="dw-actions">
          {thisGame && <Link className="btn sm primary" href={thisGame} data-to={thisGame}>Inspect this game&apos;s build</Link>}
          <Link className={`btn sm ${thisGame ? "" : "primary"}`.trim()} href={all} data-to={all}>View Pro Builds →</Link>
        </p>
      </Section>
      <Section layer="pro" title="Most recent games" tip="The newest recorded games with a build for this champion and role; each opens that player's exact setup">
        <div className="dw-rows">
          {builds.recent.map((g) => {
            const href = `${buildsLink(id, role, g.game, from)}&player=${g.playerId}`;
            return (
              <Link key={`${g.game}-${g.playerId}`} className="dw-row dw-build" href={href} data-to={href}>
                <PlayerAvatar id={g.playerId} name={g.player} size="sm" />
                <span className="dw-row-main">
                  <span className="dw-row-name">{g.player}{g.team && <span className="muted xs"> {g.team}</span>}{g.won != null && <span className={`dw-result ${g.won ? "win" : "loss"}`}>{g.won ? "W" : "L"}</span>}</span>
                  <span className="dw-row-sub tnum">{patchLabel(g.patch)} · {shortDate(g.date)} · game {g.game}</span>
                </span>
                <span className="dw-chevron" aria-hidden="true">›</span>
              </Link>
            );
          })}
        </div>
        {builds.names.length > builds.recent.length && <p className="xs muted dw-note">Also {builds.names.filter((n) => !builds.recent.some((g) => g.player === n)).join(", ")}.</p>}
      </Section>
    </>
  );
}
