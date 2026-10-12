"use client";
// Champion drawer: one champion in one role, opened from the Comp Library and the Meta page without leaving it.
// Right-side panel on desktop, bottom sheet on mobile. The three layers keep separate blocks:
//   Synergy (alan's pool tier and saved pairings) · Pro evidence (stats, games, observed pairings) · Logic (attributes).
// Pass `comp` to read the champion inside a five-man shell: saved and pro links to each comp-mate, the slot's job,
// and prev / next through the five slots.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef } from "react";
import { ChampIcon, LayerBlock, SourceLinks, pct } from "@/components/ui";
import { observedFor, proLinks, recordFor, savedLinks, type Slots } from "@/lib/comp-links";
import type { DrawerData } from "@/lib/data";
import { comparePatchDesc, describeLine, fresher, groupObserved, shortDate, type EventMap } from "@/lib/evidence";
import { PARTNER_ROLE, TIERS, eventStats, listsRole, presenceOf, proGames, roleShare, type ProGame, type Tier } from "@/lib/pool-stats";
import { handAlts } from "@/lib/pro-alternatives";
import { shownPartners } from "@/lib/proposed";
import { ProposedGroups, ProposedTag } from "@/components/ProposedSynergy";
import { PatchChanges } from "@/components/ChangedSince";
import { synergyParts, teamNeeds } from "@/lib/recommend";
import { ROLES, type Champion, type Role } from "@/lib/schema";

export interface DrawerTarget { id: string; role?: Role } // no role: the role the champion was played in most
export interface CompContext {
  name: string;
  slots: Slots;
  jobs?: Partial<Record<Role, string>>;
  swaps?: Partial<Record<Role, string[]>>;
  proDraftId?: string; // the comp's own source game: kept out of the pro link counts, named once instead
}

const TIER_LABEL = Object.fromEntries(TIERS) as Record<Tier, string>;
const FLAG_TEXT: Record<Champion["flags"][number], string> = {
  "needs-setup": "Needs setup: someone else has to start fights",
  "needs-peel": "Needs peel: weak when dived",
  disengage: "Has disengage",
};
const DASH = <span className="faint">—</span>;

/** Prepared once per page: the pro games list is the expensive part. */
export function useDrawerIndex(data: DrawerData) {
  return useMemo(() => ({
    names: Object.fromEntries(data.champions.map((c) => [c.id, c.name])) as Record<string, string>,
    champs: Object.fromEntries(data.champions.map((c) => [c.id, c])) as Record<string, Champion>,
    events: Object.fromEntries(data.meta.events.map((e) => [e.id, e])) as EventMap,
    ...(() => {
      const games = proGames({ meta: data.meta, proDrafts: data.proDrafts, botPairings: data.botPairings, sources: data.sources });
      return { games, stats: eventStats(data.meta, games) };
    })(),
  }), [data]);
}
export type DrawerIndex = ReturnType<typeof useDrawerIndex>;

/** Saved and pro links from one slot to its comp-mates, for highlights outside the drawer. */
export function compLinks(target: { id: string; role: Role }, comp: CompContext, data: DrawerData, index: DrawerIndex) {
  const name = (id: string) => index.names[id] ?? id;
  const saved = savedLinks(target.role, comp.slots, data, name);
  const pro = proLinks(target.role, comp.slots, index.games, data, comp.proDraftId);
  return { saved, pro, savedRoles: new Set(saved.map((l) => l.role)), proRoles: new Map(pro.map((l) => [l.role, l])) };
}

export function poolTier(id: string, role: Role, data: DrawerData): { tier: Tier; reason?: string } | undefined {
  const p = data.pool.find((x) => x.role === role);
  if (!p) return undefined;
  for (const [t] of TIERS) if (p[t].includes(id)) return { tier: t, reason: t === "core" ? p.coreReasons[id] : undefined };
  return undefined;
}

export function ChampionDrawer({ target, comp, data, index, onClose, onSelect }: {
  target: DrawerTarget; comp?: CompContext; data: DrawerData; index: DrawerIndex;
  onClose: () => void; onSelect?: (t: DrawerTarget) => void;
}) {
  const { id } = target;
  const { names, champs } = index;
  const roles = rolesOf(id, index);
  const role = target.role ?? roles[0] ?? champs[id]?.roles[0] ?? "MID";
  const name = (x: string) => names[x] ?? x;
  const champ = champs[id];
  const ref = useRef<HTMLElement>(null);
  const titleId = useId();
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const router = useRouter();
  const routerRef = useRef(router);
  routerRef.current = router;

  // Escape, click outside, and the browser back button all close the drawer instead of leaving the page.
  // Opening pushes one history entry (same URL); switching champions in place does not.
  useEffect(() => {
    let popped = false, leaving: string | undefined;
    window.history.pushState({ ...window.history.state, championDrawer: true }, "");
    // A link inside the drawer first drops the drawer's history entry, then navigates, so Back from the next page
    // returns to this page rather than to a stale drawer entry.
    const onPop = () => { popped = true; if (leaving) routerRef.current.push(leaving); else closeRef.current(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); closeRef.current(); } };
    const onDown = (e: PointerEvent) => {
      const t = e.target as Element | null;
      if (!t || ref.current?.contains(t) || t.closest("[data-drawer-trigger]")) return;
      closeRef.current();
    };
    const onLeave = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest<HTMLAnchorElement>("a[data-to]");
      if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0 || !window.history.state?.championDrawer) return;
      e.preventDefault();
      e.stopPropagation();
      leaving = a.dataset.to;
      window.history.back();
    };
    window.addEventListener("popstate", onPop);
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    ref.current?.addEventListener("click", onLeave, true);
    const el = ref.current;
    return () => {
      window.removeEventListener("popstate", onPop);
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
      el?.removeEventListener("click", onLeave, true);
      // Drop the entry we pushed, unless back already did or a link inside the drawer is navigating away.
      if (!popped && !leaving && window.history.state?.championDrawer) window.history.back();
    };
  }, []);

  // Focus moves into the drawer on open and on every in-place switch, so screen readers announce the new champion.
  useEffect(() => { ref.current?.focus({ preventScroll: true }); }, [id, role]);

  const tier = poolTier(id, role, data);
  const draftHref = `/?${role.toLowerCase()}=${id}`;
  const poolHref = `/pool/?role=${role}&champ=${id}`;
  const stats = index.stats.filter((s) => s.stat.champion === id && (listsRole(s, role) || !s.roles.length))
    .sort((a, b) => fresher(a.event, b.event));
  const games = index.games.filter((g) => g.picks[role] === id);
  const observed = groupObserved(observedFor(id, role, data), index.events, data.sources);
  const links = comp ? compLinks({ id, role }, comp, data, index) : undefined;
  const mates = comp ? ROLES.filter((r) => r !== role) : [];
  const ownGame = comp?.proDraftId ? data.proDrafts.find((d) => d.id === comp.proDraftId) : undefined;
  const record = recordFor(id, role, data);
  const saved = savedPartners(id, role, data);
  const proposed = shownPartners(data.proposed, id, role, data.botPairings).filter((l) => !comp || l.tier === "preferred" || Object.values(comp.slots).includes(l.id));
  const patches = new Map<string, number>();
  for (const g of games) if (g.patch) patches.set(g.patch, (patches.get(g.patch) ?? 0) + 1);
  const step = (d: 1 | -1) => comp && onSelect?.({ id: comp.slots[ROLES[(ROLES.indexOf(role) + d + 5) % 5]], role: ROLES[(ROLES.indexOf(role) + d + 5) % 5] });

  // Logic: what the attributes say about this pick next to the other four.
  const others = comp ? mates.map((r) => ({ role: r, champ: champs[comp.slots[r]] })).filter((x) => x.champ) : [];
  const logic = champ && comp ? synergyParts(champ, role, others) : [];
  const fills = champ && comp ? teamNeeds(others.map((x) => x.champ)).filter((n) => n.fills(champ)) : [];

  return (
    <aside ref={ref} className="drawer" role="dialog" aria-modal="false" aria-labelledby={titleId} tabIndex={-1} data-champ={id} data-role={role}>
      <header className="drawer-head">
        <ChampIcon id={id} name={name(id)} role={role} size="xl" />
        <div className="drawer-title">
          <h2 id={titleId}>{name(id)}</h2>
          <span className="xs muted drawer-roles">
            <span className={`role-tag role-${role}`}>{role}</span>{comp && <> · {comp.name}</>}
            {!comp && onSelect && roles.filter((r) => r !== role).map((r) => (
              <button key={r} type="button" className="role-switch" onClick={() => onSelect({ id, role: r })} title={`${name(id)} ${r.toLowerCase()}`}>{r}</button>
            ))}
          </span>
        </div>
        <div className="drawer-nav">
          {comp && onSelect && <>
            <button className="icon-btn" aria-label="Previous champion" title="Previous" onClick={() => step(-1)}>‹</button>
            <button className="icon-btn" aria-label="Next champion" title="Next" onClick={() => step(1)}>›</button>
          </>}
          <button className="icon-btn" aria-label="Close" title="Close (Esc)" onClick={onClose}>×</button>
        </div>
      </header>

      <div className="drawer-body">
        {comp?.jobs?.[role] && (
          <div className="drawer-job">
            <span className="xs faint">Job</span>
            <p className="small">{comp.jobs[role]}</p>
            {!!comp.swaps?.[role]?.length && <p className="xs muted">Swaps: {comp.swaps[role]!.map(name).join(", ")}</p>}
          </div>
        )}

        <LayerBlock layer="clash" title="Synergy">
          <dl className="kv">
            <dt>Pool</dt>
            <dd className="small">{tier ? <><span className={`tier ${tier.tier}`}>{TIER_LABEL[tier.tier]}</span>{tier.reason && <span className="muted"> {tier.reason}</span>}</> : <span className="muted">Not in my {role.toLowerCase()} pool</span>}</dd>
            {saved.filter((s) => s.ids.length || s.label !== "From pro games").map((s) => (
              <FragmentRow key={s.label} label={s.label}>
                {s.ids.length ? <span className="drawer-chips">{s.ids.map((x) => <Mate key={x} id={x} role={s.role} names={names} inComp={comp?.slots[s.role] === x} />)}</span> : <span className="muted small">none saved</span>}
              </FragmentRow>
            ))}
            {!saved.length && !record && <FragmentRow label="Saved"><span className="muted small">No saved pairing record for {role.toLowerCase()}{proposed.length ? "; see Proposed below" : ""}.</span></FragmentRow>}
          </dl>
          {comp && (
            <ul className="drawer-links" aria-label="Saved links in this comp">
              {links!.saved.length ? [...new Set(links!.saved.map((l) => l.role))].map((r) => {
                // One row per comp-mate: its strongest link, the rest in the tooltip.
                const all = links!.saved.filter((l) => l.role === r).map((l) => l.text.replace(/^Saved (pairing|comp): /, ""));
                return (
                  <li key={r} title={all.join("\n")}><Mate id={comp.slots[r]} role={r} names={names} />
                    <span className="small">{all[0]}{all.length > 1 && <span className="xs faint"> +{all.length - 1}</span>}</span></li>
                );
              }) : <li className="xs muted empty">No saved pairing with the rest of this comp.</li>}
            </ul>
          )}
        </LayerBlock>

        {proposed.length > 0 && (
          <section className="layer clash proposed">
            <div className="layer-label"><span className="ldot" />Proposed synergy<span className="push"><ProposedTag /></span></div>
            <ProposedGroups links={proposed} names={names} compact
              proCount={(p, pr) => games.filter((g) => g.picks[pr] === p).length} />
          </section>
        )}

        <LayerBlock layer="pro" title="Pro evidence">
          {comp && (
            <>
              <div className="xs muted detail-label">With this comp</div>
              <ul className="drawer-links">
                {links!.pro.length ? links!.pro.map((l) => (
                  <li key={l.role}>
                    <Mate id={comp.slots[l.role]} role={l.role} names={names} />
                    <span className="small">
                      {l.games.length ? <span className="badge pro tnum">{l.games.length} game{l.games.length > 1 ? "s" : ""} · {freshest(l.games)}</span>
                        : <span className="badge plain">{l.observed.length} cited pairing{l.observed.length > 1 ? "s" : ""}</span>}
                    </span>
                  </li>
                )) : <li className="xs muted empty">No other recorded pro game with these comp-mates.</li>}
              </ul>
              {ownGame && <p className="xs faint">Not counted: this comp's own game, {ownGame.team} {ownGame.seriesGame} vs {ownGame.opponent}.</p>}
            </>
          )}

          <div className="xs muted detail-label" title="Gol.gg tournament totals, not counted from the games stored here. Picks, bans, win rate and presence are champion-wide; presence is computed as (picks + bans) / games.">Tournament stats · all roles</div>
          {stats.length ? (
            <table className="mini">
              <thead><tr><th>Event</th><th className="num">Patch</th><th className="num">Picks</th><th className="num">Bans</th><th className="num">Pres.</th><th className="num">WR</th><th>Roles</th></tr></thead>
              <tbody>
                {stats.map((x) => { const { event: e, stat: s } = x, pres = presenceOf(x); return (
                  <tr key={e.id}>
                    <td className="nowrap">{e.short}{e.status === "ongoing" && <span className="badge pro ongoing" title="Event still running; numbers are not final">Ongoing</span>}</td>
                    <td className="num">{e.patch}</td>
                    <td className="num">{s.picks}{s.lowSample && <span className="low" title="Fewer than 5 picks">*</span>}</td>
                    <td className="num">{s.bans ?? "—"}</td>
                    <td className="num">{pres != null ? pct(pres) : "—"}</td>
                    <td className="num">{s.winRate != null ? pct(s.winRate) : "—"}</td>
                    <td className="xs nowrap">{roleShare(s) ?? (x.roles.join(" / ") || "not shown")}</td>
                  </tr>
                ); })}
              </tbody>
            </table>
          ) : <p className="xs muted">No tournament stats for {name(id)} {role.toLowerCase()}.</p>}

          <div className="xs muted detail-label" title="Drafts and game pages stored in this repo">Recorded games{games.length ? ` · ${games.length}` : ""}</div>
          {games.length ? games.slice(0, 5).map((g) => <GameRow key={g.key} g={g} role={role} names={names} data={data} comp={comp} />)
            : <p className="xs muted">No recorded games in this role.</p>}
          {games.length > 5 && <p className="xs faint">+{games.length - 5} older</p>}
          {patches.size > 1 && <p className="xs muted tnum">Patches: {[...patches.entries()].sort((a, b) => comparePatchDesc(a[0], b[0])).map(([p, n]) => `${p} ×${n}`).join(" · ")}</p>}

          {observed.length > 0 && (
            <>
              <div className="xs muted detail-label">Observed pairings</div>
              {observed.slice(0, 5).map((g) => (
                <div key={g.champion} className={`obs-row ${comp && Object.values(comp.slots).includes(g.champion) ? "in-comp" : ""}`}>
                  <span className="small nowrap"><b>{name(g.champion)}</b></span>
                  {g.lines.slice(0, 2).map((l, i) => <span key={i} className={`badge ${i ? "plain" : "pro"} tnum`}>{describeLine(l)}</span>)}
                </div>
              ))}
            </>
          )}
        </LayerBlock>

        <LayerBlock layer="logic" title="Logic">
          {champ ? (
            <ul className="drawer-logic">
              {champ.flags.map((f) => <li key={f} className="small">{FLAG_TEXT[f]}</li>)}
              {fills.map((n) => <li key={n.id} className="small">Covers {n.label} for the other four</li>)}
              {logic.map((p, i) => <li key={i} className="small">{p.text}</li>)}
              {!champ.flags.length && !fills.length && !logic.length && <li className="xs muted">No draft flags.</li>}
              {!champ.reviewed && <li className="xs faint">Attributes not reviewed yet.</li>}
            </ul>
          ) : <p className="xs muted">No attribute record.</p>}
        </LayerBlock>

        <PatchChanges id={id} index={data.patches} />
      </div>

      <footer className="drawer-foot">
        <Link className="btn sm primary" href={draftHref} data-to={draftHref}>Use in Draft Room</Link>
        {tier ? <Link className="btn sm" href={poolHref} data-to={poolHref}>View in Champion Pool</Link>
          : <span className="btn sm" aria-disabled="true" title={`Not in my ${role.toLowerCase()} pool`}>View in Champion Pool</span>}
      </footer>
    </aside>
  );
}

function FragmentRow({ label, children }: { label: string; children: React.ReactNode }) {
  return <><dt>{label}</dt><dd>{children}</dd></>;
}

function Mate({ id, role, names, inComp }: { id: string; role: Role; names: Record<string, string>; inComp?: boolean }) {
  return <span className={`mate ${inComp ? "in-comp" : ""}`}><ChampIcon id={id} name={names[id] ?? id} role={role} size="xs" />{names[id] ?? id}</span>;
}

function freshest(games: ProGame[]) {
  const g = games[0]; // proGames is newest first
  return [g.eventName, g.patch, shortDate(g.date)].filter(Boolean).join(" · ");
}

function GameRow({ g, role, names, data, comp }: { g: ProGame; role: Role; names: Record<string, string>; data: DrawerData; comp?: CompContext }) {
  const p = g.picks[PARTNER_ROLE[role]];
  const shared = comp ? ROLES.filter((r) => r !== role && g.picks[r] === comp.slots[r]).length : 0;
  return (
    <div className="obs-row">
      <span className="small nowrap">{g.label}</span>
      <span className="badge pro tnum">{[g.eventName, g.patch, shortDate(g.date)].filter(Boolean).join(" · ")}</span>
      {p && <span className="ctx">with {names[p] ?? p}</span>}
      {shared > 0 && <span className="xs muted" title="Comp-mates from this shell in the same game">+{shared} from this comp</span>}
      {g.pending && <span className="badge plain">pending refresh</span>}
      <SourceLinks ids={g.sources} sources={data.sources} />
    </div>
  );
}

/** alan's saved partners for this champion in this role (Synergy layer), as on the Champion Pool row. */
function savedPartners(id: string, role: Role, data: DrawerData): { label: string; ids: string[]; role: Role }[] {
  const partner = PARTNER_ROLE[role];
  if (role === "BOT") {
    const b = data.botPairings.find((x) => x.champion === id);
    return b ? [{ label: "Preferred", ids: b.clashDefault, role: "SUPPORT" }, { label: "Alternatives", ids: handAlts(b), role: "SUPPORT" },
      { label: "From pro games", ids: b.proAlternatives ?? [], role: "SUPPORT" }] : [];
  }
  if (role === "SUPPORT") {
    const pref = data.botPairings.filter((b) => b.clashDefault.includes(id)).map((b) => b.champion);
    const alt = data.botPairings.filter((b) => b.alternatives.includes(id)).map((b) => b.champion);
    return [...(pref.length ? [{ label: "Preferred with", ids: pref, role: "BOT" as Role }] : []), ...(alt.length ? [{ label: "Alternative for", ids: alt, role: "BOT" as Role }] : [])];
  }
  if (role === "TOP") {
    const t = data.topPicks.find((x) => x.champion === id);
    return t ? [{ label: "Jungle", ids: t.surrounding.jungle, role: "JUNGLE" }, { label: "Mid", ids: t.surrounding.mid, role: "MID" }] : [];
  }
  const m = data.midJungle.find((x) => x.anchor === id && x.role === role);
  return m ? [{ label: "Primary", ids: m.clashDefault, role: partner }, { label: "Secondary", ids: handAlts(m), role: partner },
    { label: "From pro games", ids: m.proAlternatives ?? [], role: partner }] : [];
}

/** Roles the champion has pro evidence in, most games first; stats-only roles after. */
function rolesOf(id: string, index: DrawerIndex): Role[] {
  const n = new Map<Role, number>();
  for (const g of index.games) for (const r of ROLES) if (g.picks[r] === id) n.set(r, (n.get(r) ?? 0) + 1);
  for (const s of index.stats) if (s.stat.champion === id) for (const r of s.roles) if (!n.has(r)) n.set(r, 0);
  return [...n.entries()].sort((a, b) => b[1] - a[1] || ROLES.indexOf(a[0]) - ROLES.indexOf(b[0])).map(([r]) => r);
}
