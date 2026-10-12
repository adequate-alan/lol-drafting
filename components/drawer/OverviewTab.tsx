"use client";
// Overview: the most useful summary of each layer, each line leading to its tab (alan: "high-value information
// immediately, then interaction to reveal detail"). Synergy, Pro, Builds, Patch and Logic stay separate blocks.
import Link from "next/link";
import { PriorityHistory } from "@/components/ProPriority";
import { ProposedTag } from "@/components/ProposedSynergy";
import { pct } from "@/components/ui";
import { PartnerRow, Section, TIER_LABEL, roleName, type DrawerEnv } from "@/components/drawer/parts";
import { buildsLink, FLAG_TEXT } from "@/lib/drawer";
import { shortDate } from "@/lib/evidence";
import { patchLabel } from "@/lib/patch";
import { CATEGORY_LABEL } from "@/lib/patch-changes";
import { synergyParts, teamNeeds } from "@/lib/recommend";
import { ROLES, type Champion } from "@/lib/schema";
import type { Tier } from "@/lib/pool-stats";

export function OverviewTab({ env, champ, tier }: { env: DrawerEnv; champ?: Champion; tier?: { tier: Tier; reason?: string } }) {
  const { role, name, comp, saved, proposed, games, history, changes, builds, setTab } = env;
  const lead = saved.find((g) => g.kind === "default" && g.ids.length) ?? saved.find((g) => g.ids.length);
  const rest = saved.filter((g) => g !== lead).reduce((n, g) => n + g.ids.length, 0);
  const latest = [...history].reverse().find((p) => p.row?.picks || p.row?.bans);
  const own = changes.find((c) => !c.via);
  const first = own?.lines[0];
  const others = comp ? ROLES.filter((r) => r !== role).map((r) => ({ role: r, champ: env.index.champs[comp.slots[r]] })).filter((x) => x.champ) : [];
  const logic = champ && comp ? synergyParts(champ, role, others) : [];
  const fills = champ && comp ? teamNeeds(others.map((x) => x.champ)).filter((n) => n.fills(champ)) : [];
  const more = (tab: Parameters<typeof setTab>[0], label: string) => <button type="button" className="dw-more-link xs" onClick={() => setTab(tab)}>{label} →</button>;

  return (
    <>
      {comp?.jobs?.[role] && (
        <div className="drawer-job">
          <span className="xs faint">Job in {comp.name}</span>
          <p className="small">{comp.jobs[role]}</p>
          {!!comp.swaps?.[role]?.length && <p className="xs muted">Swaps: {comp.swaps[role]!.map(name).join(", ")}</p>}
        </div>
      )}

      <Section layer="clash" title="Synergy" end={more("synergies", "All partners")}>
        {tier?.reason && <p className="xs muted dw-tier-reason">{TIER_LABEL[tier.tier]}: {tier.reason}</p>}
        {lead ? (
          <>
            <div className="dw-sub xs muted">{lead.label}{lead.role !== role ? ` · ${roleName(lead.role).toLowerCase()}` : ""}</div>
            <div className="dw-rows">{lead.ids.slice(0, 3).map((p) => <PartnerRow key={p} env={env} id={p} role={lead.role} kind={lead.kind === "pro" ? "pro" : undefined} />)}</div>
            {(lead.ids.length > 3 || rest > 0 || proposed.length > 0) && (
              <p className="xs muted dw-note">{[lead.ids.length > 3 && `+${lead.ids.length - 3} more ${lead.label.toLowerCase()}`, rest > 0 && `${rest} other saved`, proposed.length > 0 && `${proposed.length} proposed`].filter(Boolean).join(" · ")}</p>
            )}
          </>
        ) : proposed.length ? (
          <>
            <div className="dw-sub xs muted">No saved record · proposed <ProposedTag /></div>
            <div className="dw-rows">{proposed.filter((l) => l.tier === "preferred").slice(0, 2).map((l) => <PartnerRow key={`${l.id}-${l.role}`} env={env} id={l.id} role={l.role} note={l.reason} kind="proposed" />)}</div>
          </>
        ) : <p className="xs muted">No saved or proposed pairing for {roleName(role).toLowerCase()}.</p>}
      </Section>

      <Section layer="pro" title="Pro evidence" end={more("pro", "Games and priority")}>
        {latest ? (
          <>
            <button type="button" className="dw-stat-line" onClick={() => { env.setPatch(latest.patch); setTab("pro"); }} title="Open this patch in the Pro tab">
              <span className="small"><b>Pro priority</b> <span className="tnum">{patchLabel(latest.patch)}</span></span>
              <span className="xs muted tnum">presence {latest.presence != null ? pct(latest.presence) : "—"} · {latest.row!.picks} pick{latest.row!.picks === 1 ? "" : "s"}{latest.row!.low ? "*" : ""} · {latest.row!.bans} ban{latest.row!.bans === 1 ? "" : "s"}{latest.row!.winRate != null ? ` · ${pct(latest.row!.winRate)} WR` : ""} · all roles</span>
            </button>
            {history.length > 1 && <PriorityHistory points={history} onPatch={(p) => { env.setPatch(p); setTab("pro"); }} />}
          </>
        ) : <p className="xs muted">Not picked or banned in any recorded patch.</p>}
        {games.length ? (
          <button type="button" className="dw-stat-line" onClick={() => setTab("pro")}>
            <span className="small"><b>{games.length} recorded game{games.length > 1 ? "s" : ""}</b> as {roleName(role).toLowerCase()}</span>
            <span className="xs muted tnum">latest {[games[0].label, games[0].eventName, games[0].patch && patchLabel(games[0].patch), shortDate(games[0].date)].filter(Boolean).join(" · ")}</span>
          </button>
        ) : <p className="xs muted">No recorded games in this role.</p>}
      </Section>

      <Section layer="pro" title="Pro builds" end={more("builds", "Players and games")}>
        {builds ? (
          <p className="dw-line small">
            <span className="tnum">{builds.games} recorded build{builds.games > 1 ? "s" : ""} · {builds.players} player{builds.players > 1 ? "s" : ""} · latest {patchLabel(builds.latest)}</span>
            <Link className="push xs" href={buildsLink(env.id, role, undefined, env.context.from)} data-to={buildsLink(env.id, role, undefined, env.context.from)}>View Pro Builds →</Link>
          </p>
        ) : <p className="xs muted">No recorded pro builds in this role.</p>}
      </Section>

      <Section layer="logic" title="Patch" end={more("patch", "All changes")}>
        {own ? (
          <button type="button" className="dw-stat-line" onClick={() => setTab("patch")}>
            <span className="small"><span className="pn-patch tnum">{own.patch}</span> <span className={`pn-verdict v-${own.category}`}>{CATEGORY_LABEL[own.category ?? "adjustment"]}</span></span>
            {first && <span className="xs muted">{first.label && <span className="pn-label">{first.label}</span>}{first.before != null || first.after != null
              ? <span className="pn-vals"><span className="pn-old">{first.before ?? "—"}</span><span className="pn-arrow">→</span><span className="pn-new">{first.after ?? "—"}</span></span>
              : first.text}{own.lines.length > 1 && <span className="faint"> +{own.lines.length - 1} more</span>}</span>}
          </button>
        ) : <p className="xs muted">No official change since {env.data.patches.first}{changes.length ? ` (${changes.length} system note${changes.length > 1 ? "s" : ""} name${changes.length > 1 ? "" : "s"} ${name(env.id)})` : ""}.</p>}
      </Section>

      <Section layer="logic" title="Logic">
        {champ ? (
          <ul className="drawer-logic">
            {champ.flags.map((f) => <li key={f} className="small">{name(env.id)} {FLAG_TEXT[f]}</li>)}
            {fills.map((n) => <li key={n.id} className="small">Covers {n.label} for the other four</li>)}
            {logic.map((p, i) => <li key={i} className="small">{p.text}</li>)}
            {!champ.flags.length && !fills.length && !logic.length && <li className="xs muted">No draft flags.</li>}
            {!champ.reviewed && <li className="xs faint">Attributes not reviewed yet.</li>}
          </ul>
        ) : <p className="xs muted">No attribute record.</p>}
      </Section>
    </>
  );
}
