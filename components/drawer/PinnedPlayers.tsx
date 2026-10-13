"use client";
// Pinned players in the champion drawer (alan, 2026-10-13: "personal relevance first, broader professional evidence
// second"). The pinned players (this browser's list, Gol.gg player ids) with recorded games on the champion in the role
// shown; "All roles" adds the other roles. Each player expands into their games on it; each game opens that exact build
// on Pro Builds (champion, role, game and player in the URL). Derived from the Pro Builds rows, which load as their own
// chunk (lib/pro-builds-bundle.ts) only when something is pinned, so a game the daily refresh records appears here on its
// own. Hidden when no pinned player has played the champion. Observed Pro Evidence: it never scores.
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { PinIcon, useMigratePlayerPins, usePins } from "@/components/PlayerPicker";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { Section, roleName, type DrawerEnv } from "@/components/drawer/parts";
import { shortDate } from "@/lib/evidence";
import { patchLabel } from "@/lib/patch";
import { championBuildsHref, gameHref, pinnedOnChampion, profileHref, type PinnedOnChampion } from "@/lib/pinned-players";
import type { BuildRow } from "@/lib/pro-builds";

let loaded: Promise<BuildRow[]> | undefined;
const load = () => (loaded ??= import("@/lib/pro-builds-bundle").then((m) => m.rows));

/** `from` (the Draft Room board) travels with every Pro Builds link, so "Back to Draft Room" still works. */
const withFrom = (href: string, from?: string) => (from ? `${href}&from=${encodeURIComponent(from)}` : href);

/** The build rows, once something is pinned. */
export function usePinnedRows() {
  const { pins } = usePins("player");
  const [rows, setRows] = useState<BuildRow[]>();
  const want = pins.length > 0;
  useEffect(() => {
    if (!want || rows) return;
    let live = true;
    load().then((r) => { if (live) setRows(r); }).catch(() => { /* chunk failed: the section stays hidden */ });
    return () => { live = false; };
  }, [want, rows]);
  useMigratePlayerPins(rows);
  return { pins, rows };
}

export function PinnedPlayers({ env }: { env: DrawerEnv }) {
  const { id, role, name, context } = env;
  const { pins, rows } = usePinnedRows();
  const [allRoles, setAllRoles] = useState(false);
  const [open, setOpen] = useState<string>();
  const everywhere = useMemo(() => (rows ? pinnedOnChampion(rows, pins, id, "all") : []), [rows, pins, id]);
  const here = useMemo(() => (rows ? pinnedOnChampion(rows, pins, id, role) : []), [rows, pins, id, role]);
  if (!everywhere.length) return null;
  const count = (ps: PinnedOnChampion[]) => ps.reduce((n, p) => n + p.rows.length, 0);
  const elsewhere = count(everywhere) - count(here);
  const shown = allRoles ? everywhere : here;
  const champ = name(id);
  const toggle = elsewhere > 0 && (
    <button type="button" className="dw-more-link xs" aria-pressed={allRoles} onClick={() => setAllRoles((a) => !a)}>
      {allRoles ? `${roleName(role)} only` : "All roles"}
    </button>
  );
  return (
    <Section layer="pro" className="dw-pinned" title={<><PinIcon on />Pinned players</>} end={toggle || undefined}>
      {shown.length ? (
        <div className="dw-rows">
          {shown.map((p) => <PinnedRow key={p.id} p={p} champ={champ} env={env} from={context.from}
            open={open === p.id} onToggle={() => setOpen((o) => (o === p.id ? undefined : p.id))} />)}
        </div>
      ) : (
        <p className="xs muted">{elsewhere} pinned-player game{elsewhere > 1 ? "s" : ""} on {champ} in another role.</p>
      )}
    </Section>
  );
}

function PinnedRow({ p, champ, env, from, open, onToggle }: {
  p: PinnedOnChampion; champ: string; env: DrawerEnv; from?: string; open: boolean; onToggle: () => void;
}) {
  const n = p.rows.length;
  const builds = withFrom(championBuildsHref(p.id, env.id, p.last.build.role), from);
  const event = (r: BuildRow) => env.index.events[r.game.event]?.short ?? r.game.tournament;
  return (
    <div className={`dw-game dw-pin ${open ? "open" : ""}`.trim()}>
      <div className="dw-pin-head">
        <button type="button" className="dw-row" aria-expanded={open} onClick={onToggle}>
          <PlayerAvatar id={p.id} name={p.name} size="sm" />
          <span className="dw-row-main">
            <span className="dw-row-name">{p.name}</span>
            <span className="dw-row-sub tnum">
              {[p.team, p.roles.map(roleName).join(" / "), `${n} recorded ${champ} game${n > 1 ? "s" : ""}`, `latest ${patchLabel(p.latestPatch)}`].filter(Boolean).join(" · ")}
            </span>
          </span>
          <span className="dw-chevron" aria-hidden="true">{open ? "▾" : "▸"}</span>
        </button>
        <Link className="dw-pin-link xs" href={builds} data-to={builds} aria-label={`View ${p.name}'s ${champ} builds`}>Builds →</Link>
      </div>
      {open && (
        <div className="dw-detail">
          <div className="dw-rows">
            {p.rows.map((r) => {
              const href = withFrom(gameHref(r), from);
              return (
                <Link key={r.key} className="dw-row dw-build" href={href} data-to={href}>
                  <span className="dw-row-main">
                    <span className="dw-row-name">vs {r.opponentTeam}<span className={`res ${r.won ? "win" : "loss"}`}>{r.won ? "W" : "L"}</span></span>
                    <span className="dw-row-sub tnum">
                      {[event(r), patchLabel(r.game.patch), shortDate(r.game.date), roleName(r.build.role), r.team !== p.team ? `with ${r.team}` : undefined].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  <span className="dw-chevron" aria-hidden="true">›</span>
                </Link>
              );
            })}
          </div>
          <p className="dw-actions xs">
            <Link href={builds} data-to={builds}>View {p.name}&apos;s {champ} builds</Link>
            <Link href={profileHref(p.id)} data-to={profileHref(p.id)}>Open {p.name}&apos;s profile</Link>
          </p>
        </div>
      )}
    </div>
  );
}
