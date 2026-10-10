"use client";
// Right-side champion drawer: my pool tier (Synergy layer) kept apart from pro evidence (stats, pairings, recent games,
// patch history). Built on lib/meta-hub so any page with the hub data can open it.
import Link from "next/link";
import { useEffect } from "react";
import { describeLine, shortDate } from "@/lib/evidence";
import { pairings, type HubData } from "@/lib/meta-hub";
import { PARTNER_ROLE, TIERS, type Tier } from "@/lib/pool-stats";
import type { PoolEntry, Role, Source } from "@/lib/schema";
import { ChampIcon, LayerBlock, SourceLinks, pct } from "./ui";

const TIER_LABEL = Object.fromEntries(TIERS) as Record<Tier, string>;

export function ChampionDrawer({ id, role, hub, pool, names, sources, onClose }: {
  id: string; role?: Role; hub: HubData; pool: PoolEntry[]; names: Record<string, string>; sources: Record<string, Source>;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const name = names[id] ?? id;
  const games = hub.games.filter((g) => Object.values(g.picks).includes(id));
  const rolesPlayed = [...new Set(games.map((g) => (Object.entries(g.picks) as [Role, string][]).find(([, c]) => c === id)![0]))];
  const stats = hub.stats.filter((s) => s.stat.champion === id).sort((a, b) => b.event.patch.localeCompare(a.event.patch, undefined, { numeric: true }));
  const roles = [...new Set([...(role ? [role] : []), ...stats.map((s) => s.stat.role), ...rolesPlayed])];
  const tiers = pool.flatMap((p) => TIERS.filter(([t]) => p[t].includes(id)).map(([t]) => ({ role: p.role, tier: t, reason: t === "core" ? p.coreReasons[id] : undefined })));
  const mainRole = role ?? roles[0];
  const partners = mainRole ? pairings(hub, mainRole, PARTNER_ROLE[mainRole]).filter((p) => p.a === id)
    .concat(pairings(hub, PARTNER_ROLE[mainRole], mainRole).filter((p) => p.b === id).map((p) => ({ ...p, a: p.b, b: p.a }))) : [];
  const seen = new Set<string>();
  const uniquePartners = partners.filter((p) => !seen.has(p.b) && seen.add(p.b)).sort((x, y) => y.games.length - x.games.length).slice(0, 6);
  const patches = new Map<string, number>();
  for (const g of games) if (g.patch) patches.set(g.patch, (patches.get(g.patch) ?? 0) + 1);
  const poolHref = `/pool?q=${encodeURIComponent(name)}${mainRole ? `&role=${mainRole}` : ""}`;
  const draftHref = mainRole ? `/?${mainRole.toLowerCase()}=${id}` : "/";

  return (
    <>
      <div className="drawer-scrim" onClick={onClose} aria-hidden="true" />
      <aside className="drawer" role="dialog" aria-label={`${name} details`}>
        <header className="drawer-head">
          <ChampIcon id={id} name={name} role={mainRole} size="lg" />
          <div>
            <h2>{name}</h2>
            <span className="xs muted">{roles.join(" · ") || "No recorded role"}</span>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">×</button>
        </header>
        <div className="drawer-actions">
          <Link className="btn sm" href={poolHref}>View in Champion Pool</Link>
          <Link className="btn sm" href={draftHref}>Use in Draft Room</Link>
        </div>
        <div className="drawer-body">
          <LayerBlock layer="clash" title="My pool">
            {tiers.length ? tiers.map((t) => (
              <p key={t.role} className="small"><span className="role-tag">{t.role}</span> <span className={`tier ${t.tier}`}>{TIER_LABEL[t.tier]}</span>{t.reason && <span className="muted"> · {t.reason}</span>}</p>
            )) : <p className="xs muted">Not in my pool.</p>}
          </LayerBlock>
          <LayerBlock layer="pro" title="Pro evidence">
            {!stats.length && !games.length && <p className="xs muted">No verified data.</p>}
            {stats.length > 0 && (
              <table className="mini">
                <thead><tr><th>Tournament</th><th>Role</th><th className="num">Picks</th><th className="num">Bans</th><th className="num">Pres.</th><th className="num">WR</th></tr></thead>
                <tbody>{stats.map((s) => (
                  <tr key={s.event.id + s.stat.role}>
                    <td className="nowrap">{s.event.short} <span className="xs faint">{s.event.patch}</span>{s.event.status === "ongoing" && <span className="badge pro ongoing">Ongoing</span>}</td>
                    <td className="xs">{s.stat.role}</td>
                    <td className="num">{s.stat.picks}{s.stat.lowSample && <span className="low" title="Fewer than 5 picks">*</span>}</td>
                    <td className="num">{s.stat.bans ?? "—"}</td>
                    <td className="num">{s.stat.presence != null ? pct(s.stat.presence) : "—"}</td>
                    <td className="num">{pct(s.stat.winRate)}</td>
                  </tr>
                ))}</tbody>
              </table>
            )}
            {uniquePartners.length > 0 && <>
              <div className="xs muted detail-label">Observed {PARTNER_ROLE[mainRole!].toLowerCase()} partners</div>
              {uniquePartners.map((p) => (
                <div key={p.b} className="obs-row">
                  <span className="small nowrap"><b>{names[p.b] ?? p.b}</b></span>
                  <span className="badge pro tnum">{describeLine({ games: p.games.length, label: p.latest.eventName, patch: p.latest.patch, date: p.latest.date })}</span>
                </div>
              ))}
            </>}
            {games.length > 0 && <>
              <div className="xs muted detail-label">Recent games</div>
              {games.slice(0, 6).map((g) => (
                <div key={g.key} className="obs-row">
                  <span className="small nowrap">{g.label}</span>
                  <span className="ctx">{[g.eventName, g.patch, shortDate(g.date)].filter(Boolean).join(" · ")}</span>
                  {g.pending && <span className="badge plain">pending refresh</span>}
                  <SourceLinks ids={g.sources} sources={sources} />
                </div>
              ))}
              {games.length > 6 && <p className="xs faint">+{games.length - 6} older</p>}
            </>}
            {patches.size > 0 && <>
              <div className="xs muted detail-label">Patch history</div>
              <p className="small tnum">{[...patches.entries()].sort((a, b) => b[0].localeCompare(a[0], undefined, { numeric: true })).map(([p, n]) => `${p}: ${n} game${n > 1 ? "s" : ""}`).join(" · ")}</p>
            </>}
          </LayerBlock>
        </div>
      </aside>
    </>
  );
}
