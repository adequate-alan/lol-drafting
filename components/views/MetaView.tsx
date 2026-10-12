"use client";
import { ProFreshness } from "@/components/ProFreshness";
import type { Freshness } from "@/lib/pro-games";
import { useSearchParams } from "next/navigation";
import { Fragment, useMemo, useState } from "react";
import type { DrawerData } from "@/lib/data";
import { ChampionProvider, InteractiveChampion } from "@/components/ChampionInteraction";
import { Disclosure } from "@/components/Disclosure";
import { ChampIcon, PageHeader, SectionHeader, SourceBadge, SourceLinks, pct } from "@/components/ui";
import { shortDate } from "@/lib/evidence";
import { comparison, eventSummary, hubData, pairings, recentDrafts, type HubInput, type Pairing } from "@/lib/meta-hub";
import { patchKey, patchLabel, patchesOf } from "@/lib/pro-priority";
import { ROLES, type Role, type Rule, type Source } from "@/lib/schema";
import { ProPrioritySection } from "@/components/ProPriority";

const DASH = <span className="faint">—</span>;

export function MetaView({ names, sources, input, rules, drawerData, freshness }: {
  names: Record<string, string>; sources: Record<string, Source>; input: HubInput; rules: Rule[]; drawerData: DrawerData; freshness: Freshness[];
}) {
  // View state lives in the URL so it can be shared; window.location keeps the GitHub Pages base path.
  const initial = useSearchParams();
  const [params, setParams] = useState(() => new URLSearchParams(initial.toString()));
  const get = (k: string) => params.get(k) || undefined;
  const set = (k: string, v: string | undefined) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v); else next.delete(k);
    setParams(next);
    window.history.replaceState(null, "", `${window.location.pathname}${next.size ? `?${next}` : ""}`);
  };
  const hub = useMemo(() => hubData(input), [input]);
  const priority = drawerData.priority;
  // Pro Priority sets the page's scope: one patch (newest by default, never combined unless "All patches" is picked)
  // and a tournament (all by default; the patch already keeps samples apart). The sections below follow that scope.
  const tournament = get("event");
  const eventId = hub.events.find((e) => e.id === tournament)?.id;
  const patchParam = get("patch");
  const patches = patchesOf(priority, eventId ? [eventId] : undefined);
  const patch = patchParam === "all" ? undefined : patches.find((p) => p === patchParam || patchLabel(p) === patchParam) ?? patches[0];
  const inPatch = (p?: string) => !patch || (!!p && patchKey(p) === patch);
  const scoped = useMemo(() => ({ ...hub, games: hub.games.filter((g) => inPatch(g.patch)) }), [hub, patch]);
  const rawRole = get("role");
  const tabRole = (ROLES as readonly string[]).includes(rawRole ?? "") ? (rawRole as Role) : undefined;

  const compare = comparison(hub, tabRole);
  const bot = pairings(scoped, "BOT", "SUPPORT", eventId);
  const midJg = pairings(scoped, "MID", "JUNGLE", eventId);
  const drafts = recentDrafts(scoped, eventId);
  const [openKey, setOpenKey] = useState<string>();
  const toggle = (k: string) => setOpenKey((o) => (o === k ? undefined : k));
  const selected = eventId ? hub.events.filter((e) => e.id === eventId) : hub.events;
  const scopeLabel = `${patch ? `Patch ${patchLabel(patch)}` : "All patches"}${eventId ? ` · ${hub.events.find((e) => e.id === eventId)!.short}` : ""}`;

  const Champ = ({ id, r, size = "sm" }: { id: string; r?: Role; size?: "xs" | "sm" | "md" }) => (
    <InteractiveChampion id={id} role={r} className="champ-link">
      <ChampIcon id={id} name={names[id] ?? id} role={r} size={size} /><span>{names[id] ?? id}</span>
    </InteractiveChampion>
  );
  return (
    <ChampionProvider data={drawerData}>
    <div className="meta-hub">
      <PageHeader title="Meta / Research" />
      <ProFreshness items={freshness} />

      {/* 1. Pro priority: the page's main view */}
      <ProPrioritySection data={priority} patchIndex={drawerData.patches} names={names} sources={sources} params={{ get, set }} Champ={Champ} />

      {/* 2. Tournaments */}
      <SectionHeader title="Tournaments" meta={`${hub.events.length} recorded`} />
      <div className="table-wrap hub-events">
        <table>
          <thead><tr><th>Tournament</th><th className="num">Patch</th><th className="hide-sm">Dates</th><th>Status</th><th className="num" title="Total games played in the tournament">Games</th><th className="num" title="Games stored in this repo">Recorded</th><th className="num hide-sm">Champions</th><th className="hide-sm">Freshness</th></tr></thead>
          <tbody>
            {hub.events.map((e) => {
              const s = eventSummary(hub, e, sources);
              return (
                <tr key={e.id} className={e.id === eventId ? "selected" : undefined}>
                  <td className="nowrap"><b>{e.short}</b> <span className="xs muted hide-sm">{e.name}</span></td>
                  <td className="num">{patchLabel(e.patch)}</td>
                  <td className="hide-sm nowrap">{e.startDate ? `${shortDate(e.startDate)}–${shortDate(e.endDate)}` : DASH}</td>
                  <td>{e.status === "ongoing" ? <span className="badge pro">Ongoing</span> : <span className="xs muted">Completed</span>}</td>
                  <td className="num">{e.games ?? DASH}</td>
                  <td className="num">{s.recordedGames}</td>
                  <td className="num hide-sm">{s.champions}</td>
                  <td className="xs muted hide-sm nowrap" title={s.refreshed ? "Source pages re-read" : s.providedOn ? `Totals provided ${shortDate(s.providedOn)}; source pages not re-read yet` : "Source pages not re-read since import"}>{s.refreshed ? "Refreshed" : s.providedOn ? `Provided ${shortDate(s.providedOn)}` : "Not refreshed"} <SourceLinks ids={e.sources.slice(0, 1)} sources={sources} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {selected.some((e) => e.notes.length) && (
        <Disclosure summary={`Tournament notes (${selected.reduce((n, e) => n + e.notes.length, 0)})`}>
          <ul className="hub-notes">
            {selected.flatMap((e) => e.notes.map((n) => (
              <li key={e.id + n.topic} className="small"><b>{n.topic}</b> <span className="xs faint">{e.short}</span> {n.note} <SourceLinks ids={n.sources} sources={sources} /></li>
            )))}
          </ul>
        </Disclosure>
      )}

      {/* 4–8. Research below Pro priority and the tournaments (alan, 2026-10-12): folded, each with its count; the scope
          and any open row survive a toggle, because the state lives here and in the URL, not in the sections. */}
      <Disclosure section lazy summary="Tournament comparison" meta={`${compare.length} champions · ${tabRole ?? "All roles"} · all tournaments`}>
      <div className="table-wrap hub-table mid">
        <table>
          <thead><tr><th>Champion</th>{hub.events.map((e) => <th key={e.id} className="num">{e.short} {patchLabel(e.patch)}</th>)}<th>Seen in</th></tr></thead>
          <tbody>
            {compare.map((c) => (
              <tr key={c.id + c.role} className={`role-${c.role}`}>
                <td><Champ id={c.id} r={c.role} /></td>
                {hub.events.map((e) => {
                  const x = c.cells[e.id];
                  return <td key={e.id} className="num">{x ? <>{x.picks != null ? `${x.picks} picks` : "—"}{x.presence != null ? <span className="xs muted"> · {pct(x.presence)}</span> : ""}<span className="faint"> · {x.games} rec.</span></> : DASH}</td>;
                })}
                <td className="xs">{c.seenIn.length === hub.events.length ? <b>Both</b> : <span className="muted">{c.seenIn.map((id) => hub.events.find((e) => e.id === id)?.short).join(", ")} only</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      </Disclosure>

      {/* 5–6. Pairings */}
      <PairingTable title="Bot lane pairings" scope={scopeLabel} a="BOT" b="SUPPORT" list={bot} openKey={openKey} toggle={toggle} Champ={Champ} sources={sources} />
      <PairingTable title="Mid + jungle pairings" scope={scopeLabel} a="MID" b="JUNGLE" list={midJg} openKey={openKey} toggle={toggle} Champ={Champ} sources={sources} />

      {/* 7. Recent drafts */}
      <Disclosure section lazy summary="Recent drafts" meta={`${drafts.length} games · ${scopeLabel}`}>
      <div className="table-wrap hub-table mid">
        <table>
          <thead><tr><th>Teams</th><th className="hide-sm">Date</th><th>Tournament</th><th className="num hide-sm">Patch</th><th>Picks</th></tr></thead>
          <tbody>
            {drafts.map((g) => {
              const k = `draft-${g.key}`, open = openKey === k;
              return (
                <Fragment key={g.key}>
                  <tr className={`click-row ${open ? "open" : ""}`} onClick={() => toggle(k)} tabIndex={0} aria-expanded={open}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(k); } }}>
                    <td className="nowrap">{g.sides[0].team && g.sides[0].opponent ? <>{g.sides[0].team} <span className="faint">vs</span> {g.sides[0].opponent}</> : g.sides[0].label}</td>
                    <td className="hide-sm nowrap">{shortDate(g.date) ?? DASH}</td>
                    <td className="nowrap">{g.eventName}{g.event?.status === "ongoing" && <span className="badge pro ongoing">Ongoing</span>}</td>
                    <td className="num hide-sm">{g.patch ? patchLabel(g.patch) : DASH}</td>
                    <td>
                      {g.sides.map((s) => (
                        <span key={s.key} className="draft-icons" title={s.team}>
                          {ROLES.filter((r) => s.picks[r]).map((r) => <ChampIcon key={r} id={s.picks[r]} name={names[s.picks[r]!] ?? s.picks[r]!} role={r} size="xs" />)}
                        </span>
                      ))}
                      {g.partial && <span className="xs faint"> bot lane only</span>}
                    </td>
                  </tr>
                  {open && (
                    <tr className="hub-detail"><td colSpan={5}>
                      {g.sides.map((s) => (
                        <div key={s.key} className="obs-row">
                          <span className="small nowrap"><b>{s.team ?? s.label}</b></span>
                          {ROLES.filter((r) => s.picks[r]).map((r) => <span key={r} className="xs nowrap"><span className={`role-tag role-${r}`}>{r}</span> <Champ id={s.picks[r]!} r={r} size="xs" /></span>)}
                          {s.pending && <span className="badge plain">pending refresh</span>}
                        </div>
                      ))}
                      <SourceLinks ids={g.sources} sources={sources} />
                    </td></tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      </Disclosure>

      <Disclosure section summary="Research notes" meta={`${input.meta.changes.length} LCK playoff changes · ${rules.length} rules`}>
      <div className="grid cols-2">
        <section>
          <SectionHeader title="What changed (LCK playoffs)" />
          {input.meta.changes.map((c) => <p key={c.topic} className="small"><b>{c.topic}:</b> {c.note}</p>)}
        </section>
        <section>
          <SectionHeader title="Rules" />
          {rules.map((r) => <p key={r.id} className="small rule-line"><SourceBadge layer={r.layer} /> <span>{r.text}</span></p>)}
        </section>
      </div>
      </Disclosure>

    </div>
    </ChampionProvider>
  );
}

function PairingTable({ title, scope, a, b, list, openKey, toggle, Champ, sources }: {
  title: string; scope: string; a: Role; b: Role; list: Pairing[]; openKey?: string; toggle: (k: string) => void;
  Champ: (p: { id: string; r?: Role; size?: "xs" | "sm" | "md" }) => React.ReactNode; sources: Record<string, Source>;
}) {
  return (
    <Disclosure section lazy summary={title} meta={`${list.length} duos · ${scope}`}>
      {!list.length ? <p className="xs muted">No recorded game in this scope shows one.</p> : (
      <div className="table-wrap hub-table mid">
        <table>
          <thead><tr><th>{a === "BOT" ? "Bot" : "Mid"}</th><th>{b === "SUPPORT" ? "Support" : "Jungle"}</th><th className="num" title="Games stored in this repo">Recorded</th><th>Tournament</th><th className="num hide-sm">Patch</th><th className="num hide-sm">Latest</th></tr></thead>
          <tbody>
            {list.map((p) => {
              const k = `${a}-${p.a}-${p.b}`, open = openKey === k;
              return (
                <Fragment key={k}>
                  <tr className={`click-row ${open ? "open" : ""}`} onClick={() => toggle(k)} tabIndex={0} aria-expanded={open}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(k); } }}>
                    <td><Champ id={p.a} r={a} /></td>
                    <td><Champ id={p.b} r={b} /></td>
                    <td className="num">{p.games.length}</td>
                    <td className="nowrap">{p.events.join(", ")}{p.latest.event?.status === "ongoing" && <span className="badge pro ongoing">Ongoing</span>}</td>
                    <td className="num hide-sm">{p.latest.patch ? patchLabel(p.latest.patch) : "—"}</td>
                    <td className="num hide-sm">{shortDate(p.latest.date) ?? "—"}</td>
                  </tr>
                  {open && (
                    <tr className="hub-detail"><td colSpan={6}>
                      {p.games.map((g) => (
                        <div key={g.key} className="obs-row">
                          <span className="small nowrap">{g.label}</span>
                          <span className="ctx">{[g.eventName, g.patch && patchLabel(g.patch), shortDate(g.date)].filter(Boolean).join(" · ")}</span>
                          {g.pending && <span className="badge plain">pending refresh</span>}
                          <SourceLinks ids={g.sources} sources={sources} />
                        </div>
                      ))}
                    </td></tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      )}
    </Disclosure>
  );
}
