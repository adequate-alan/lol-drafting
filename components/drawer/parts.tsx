"use client";
// Shared pieces of the champion drawer's tabs (components/ChampionDrawer.tsx): the environment every tab reads, section
// labels per layer, partner rows that open a pairing, and recorded-game rows that expand into a compact game detail.
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { ChampIcon, SourceLinks } from "@/components/ui";
import type { CompContext, DrawerTarget } from "@/components/ChampionDrawer";
import type { DrawerData } from "@/lib/data";
import { gameDetail, proDraftHref, type DrawerContext, type DrawerIndex, type DrawerTab, type SavedGroup } from "@/lib/drawer";
import { shortDate } from "@/lib/evidence";
import { patchLabel } from "@/lib/patch";
import { PARTNER_ROLE, TIERS, type ProGame, type Tier } from "@/lib/pool-stats";
import { buildsHref, type ChampionBuilds } from "@/lib/pro-builds";
import type { HistoryPoint } from "@/lib/pro-priority";
import type { ProposedLink } from "@/lib/proposed";
import type { Change } from "@/lib/patch-changes";
import { ROLES, type Attr, type Champion, type ProDraft, type Role } from "@/lib/schema";

export const TIER_LABEL = Object.fromEntries(TIERS) as Record<Tier, string>;
export interface Partner { id: string; role: Role }

/** What every tab gets from the drawer shell. */
export interface DrawerEnv {
  id: string; role: Role; name: (id: string) => string;
  data: DrawerData; index: DrawerIndex; comp?: CompContext; context: DrawerContext;
  games: ProGame[]; // recorded games with the champion in this role, newest first
  saved: SavedGroup[]; proposed: ProposedLink[];
  history: HistoryPoint[]; changes: Change[]; builds?: ChampionBuilds;
  patch?: string; setPatch: (p: string | undefined) => void;
  setTab: (t: DrawerTab) => void;
  inspect: (p: Partner, from?: HTMLElement | null) => void; // open a pairing inside the drawer
  select: (t: DrawerTarget, remember?: boolean) => void; // switch the drawer to another champion
  canSelect: boolean;
}

export type Layer = "clash" | "pro" | "logic";

/** A titled block of one layer; `end` sits at the right of the label (a count, a link). */
export function Section({ layer, title, end, children, className = "", tip }: { layer: Layer; title: ReactNode; end?: ReactNode; children: ReactNode; className?: string; tip?: string }) {
  return (
    <section className={`dw-section layer ${layer} ${className}`.trim()}>
      <div className="layer-label" title={tip}><span className="ldot" />{title}{end != null && <span className="push">{end}</span>}</div>
      {children}
    </section>
  );
}

export const roleName = (r: Role) => r.charAt(0) + r.slice(1).toLowerCase();

const TRAITS: [Attr, string][] = [["engage", "Engage"], ["peel", "Peel"], ["frontline", "Frontline"], ["poke", "Poke"], ["lanePressure", "Lane"],
  ["scaling", "Scaling"], ["sustainedDps", "DPS"], ["burst", "Burst"]];
/** The two strongest traits of a champion, "Engage 3 · Peel 2" (General Draft Logic, from champion attributes). */
export function traitsOf(c: Champion | undefined, n = 2): string {
  if (!c) return "";
  return [...TRAITS].filter(([a]) => c.attrs[a] >= 2).sort((x, y) => c.attrs[y[0]] - c.attrs[x[0]]).slice(0, n).map(([a, l]) => `${l} ${c.attrs[a]}`).join(" · ");
}

/** A partner row: portrait, name, a short descriptor, the recorded game count with the champion, and a chevron. Clicking
 *  opens the pairing inside the drawer. */
export function PartnerRow({ env, id, role, note, tag, kind }: { env: DrawerEnv; id: string; role: Role; note?: string; tag?: ReactNode; kind?: "proposed" | "pro" }) {
  const games = env.games.filter((g) => g.picks[role] === id).length;
  const desc = note ?? traitsOf(env.index.champs[id]);
  return (
    <button type="button" className={`dw-row dw-partner ${kind ?? ""}`.trim()} onClick={(e) => env.inspect({ id, role }, e.currentTarget)}
      aria-label={`${env.name(env.id)} + ${env.name(id)}: inspect pairing`}>
      <ChampIcon id={id} name={env.name(id)} role={role} size="sm" />
      <span className="dw-row-main">
        <span className="dw-row-name">{env.name(id)}{tag}</span>
        {desc && <span className="dw-row-sub">{desc}</span>}
      </span>
      <span className="dw-row-end xs muted tnum">{games ? `${games} game${games > 1 ? "s" : ""}` : ""}</span>
      <span className="dw-chevron" aria-hidden="true">›</span>
    </button>
  );
}

/** Five picks of a recorded draft as small portraits; each switches the drawer to that champion in its role. */
export function MiniDraft({ env, picks, label, side, won, mark }: { env: DrawerEnv; picks: Partial<Record<Role, string>>; label?: string; side?: "blue" | "red" | "none"; won?: boolean; mark?: string[] }) {
  return (
    <div className={`dw-draft side-${side ?? "none"}`}>
      {label && <span className="dw-draft-team xs">{label}{won != null && <span className={`res ${won ? "win" : "loss"}`}>{won ? "W" : "L"}</span>}</span>}
      <span className="dw-draft-picks">
        {ROLES.filter((r) => picks[r]).map((r) => (
          <button key={r} type="button" className={`dw-pick ${mark?.includes(picks[r]!) ? "mark" : ""} ${picks[r] === env.id ? "me" : ""}`.trim()} data-drawer-trigger
            title={`${env.name(picks[r]!)} · ${roleName(r)}`} aria-label={`${env.name(picks[r]!)}, ${roleName(r)}`} disabled={!env.canSelect}
            onClick={() => env.select({ id: picks[r]!, role: r }, true)}>
            <ChampIcon id={picks[r]} name={env.name(picks[r]!)} role={r} size="sm" />
          </button>
        ))}
      </span>
    </div>
  );
}

/** One recorded game: a row that expands in place into the compact game detail (both drafts when recorded, side,
 *  result, bans, the pairing, the Gol.gg source, Pro Drafts and the player's build). `with` marks the partner. */
export function GameRow({ env, g, open, onToggle, partner }: { env: DrawerEnv; g: ProGame; open: boolean; onToggle: () => void; partner?: Partner }) {
  const d = gameDetail(g, env.data);
  const p = partner?.id ?? g.picks[PARTNER_ROLE[env.role]];
  const pRole = partner?.role ?? PARTNER_ROLE[env.role];
  const when = [g.eventName, g.patch && patchLabel(g.patch), shortDate(g.date)].filter(Boolean).join(" · ");
  const shared = env.comp ? ROLES.filter((r) => r !== env.role && g.picks[r] === env.comp!.slots[r]).length : 0;
  return (
    <div className={`dw-game ${open ? "open" : ""} side-${d.side ?? "none"}`.trim()}>
      <button type="button" className="dw-row dw-game-row" aria-expanded={open} onClick={onToggle}>
        <span className="dw-row-main">
          <span className="dw-row-name">{g.label}{d.won != null && <span className={`res ${d.won ? "win" : "loss"}`}>{d.won ? "W" : "L"}</span>}{g.pending && <span className="badge plain"> pending refresh</span>}</span>
          <span className="dw-row-sub tnum">{when}{p && <> · with {env.name(p)}</>}{shared > 0 && <span className="faint"> · +{shared} from this comp</span>}</span>
        </span>
        <span className="dw-chevron" aria-hidden="true">{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <div className="dw-detail">
          {d.draft ? (
            <>
              <MiniDraft env={env} picks={d.draft.picks} label={d.draft.team} side={d.side} won={d.won} mark={p ? [p] : []} />
              {d.other ? <MiniDraft env={env} picks={d.other.picks} label={d.other.team} side={d.other.side} won={d.other.won} />
                : <p className="xs muted">Opponent {d.draft.opponent}: draft not recorded.</p>}
              <dl className="dw-kv">
                {d.side && <><dt>Side</dt><dd>{d.side === "blue" ? "Blue" : "Red"} side{d.won != null && <>, {d.won ? "won" : "lost"}</>}</dd></>}
                {d.draft.bans?.length ? <><dt>Bans</dt><dd>{d.draft.bans.map(env.name).join(", ")}</dd></> : null}
                {p && <><dt>Pairing</dt><dd>{env.name(env.id)} + {env.name(p)} ({roleName(env.role).toLowerCase()} / {roleName(pRole).toLowerCase()})</dd></>}
                {d.draft.read && <><dt>Read</dt><dd>{d.draft.read}</dd></>}
              </dl>
            </>
          ) : (
            <p className="xs muted">Game page supplied for this pairing; the full draft is not recorded.</p>
          )}
          <p className="dw-actions xs">
            {d.draft && <Link href={proDraftHref(d.draft.id)} data-to={proDraftHref(d.draft.id)}>Inspect in Pro Drafts</Link>}
            {d.draft && d.hasBuilds && <Link href={buildsHref(env.id, env.role, d.gameId)} data-to={buildsHref(env.id, env.role, d.gameId)}>Player build</Link>}
            <SourceLinks ids={g.sources} sources={env.data.sources} />
          </p>
        </div>
      )}
    </div>
  );
}

/** A list of recorded games, newest first, one open at a time, the first `limit` shown with "Show all". */
export function GameList({ env, games, limit = 5, partner }: { env: DrawerEnv; games: ProGame[]; limit?: number; partner?: Partner }) {
  const [open, setOpen] = useState<string>();
  const [all, setAll] = useState(false);
  const shown = all ? games : games.slice(0, limit);
  return (
    <div className="dw-games">
      {shown.map((g) => <GameRow key={g.key} env={env} g={g} partner={partner} open={open === g.key} onToggle={() => setOpen((o) => (o === g.key ? undefined : g.key))} />)}
      {games.length > shown.length && <button type="button" className="btn sm ghost dw-more" onClick={() => setAll(true)}>Show all {games.length} games</button>}
    </div>
  );
}

/** Both sides of a stored draft list, for the Overview's latest-game line. */
export const draftOf = (env: DrawerEnv, g: ProGame): ProDraft | undefined => (g.draftId ? env.data.proDrafts.find((d) => d.id === g.draftId) : undefined);
