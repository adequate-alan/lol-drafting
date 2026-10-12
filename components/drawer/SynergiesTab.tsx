"use client";
// Synergies: alan's saved partners (preferred, alternatives, pro-derived, surrounding), saved bot lanes, proposed
// kit-based partners and the Comp Library shells that hold the pick. Every partner row opens the pairing in place.
import Link from "next/link";
import { ProposedTag } from "@/components/ProposedSynergy";
import { ChampIcon } from "@/components/ui";
import { compLinks } from "@/components/ChampionDrawer";
import { PartnerRow, Section, roleName, type DrawerEnv } from "@/components/drawer/parts";
import { compsHref, savedBotShapes, synergiesHref } from "@/lib/drawer";
import { CONFIDENCE_LABEL } from "@/lib/proposed";
import { ROLES } from "@/lib/schema";

export function SynergiesTab({ env }: { env: DrawerEnv }) {
  const { id, role, name, data, index, comp, saved, proposed } = env;
  const groups = saved.filter((g) => g.ids.length);
  const links = comp ? compLinks({ id, role }, comp, data, index) : undefined;
  const shapes = savedBotShapes(id, role, data);
  const shells = data.shells.filter((s) => s.slots[role] === id);
  const href = synergiesHref(id, role);

  return (
    <>
      {comp && links && (
        <Section layer="clash" title={`In ${comp.name}`}>
          <ul className="drawer-links" aria-label="Saved links in this comp">
            {links.saved.length ? [...new Set(links.saved.map((l) => l.role))].map((r) => {
              const all = links.saved.filter((l) => l.role === r).map((l) => l.text.replace(/^Saved (pairing|comp): /, ""));
              return (
                <li key={r} title={all.join("\n")}>
                  <button type="button" className="mate dw-mate" onClick={(e) => env.inspect({ id: comp.slots[r], role: r }, e.currentTarget)}><ChampIcon id={comp.slots[r]} name={name(comp.slots[r])} role={r} size="xs" />{name(comp.slots[r])}</button>
                  <span className="small">{all[0]}{all.length > 1 && <span className="xs faint"> +{all.length - 1}</span>}</span>
                </li>
              );
            }) : <li className="xs muted empty">No saved pairing with the rest of this comp.</li>}
          </ul>
        </Section>
      )}

      <Section layer="clash" title="Saved synergy" end={<Link className="xs" href={href} data-to={href}>View Synergies →</Link>}>
        {groups.length ? groups.map((g) => (
          <div key={g.label} className="dw-group">
            <div className="dw-sub xs muted">{g.label}{g.role !== role && !/jungle|mid/i.test(g.label) ? ` · ${roleName(g.role).toLowerCase()}` : ""}{g.kind === "pro" && <span className="faint"> · from pro games, not hand-saved</span>}</div>
            <div className="dw-rows">{g.ids.map((p) => <PartnerRow key={p} env={env} id={p} role={g.role} kind={g.kind === "pro" ? "pro" : undefined} />)}</div>
          </div>
        )) : <p className="xs muted">No saved pairing record for {roleName(role).toLowerCase()}.</p>}
        {shapes.length > 0 && (
          <div className="dw-group">
            <div className="dw-sub xs muted">Saved bot lanes around {name(id)}</div>
            <div className="dw-duos">
              {shapes.map((s) => (
                <span key={`${s.bot}-${s.support}`} className="dw-duo">
                  {([["BOT", s.bot], ["SUPPORT", s.support]] as const).map(([r, c], i) => (
                    <button key={r} type="button" className="dw-duo-half" data-drawer-trigger disabled={!env.canSelect} onClick={() => env.select({ id: c, role: r }, true)} title={`${name(c)} · ${roleName(r).toLowerCase()}`}>
                      {i > 0 && <span className="plus" aria-hidden="true">+</span>}<ChampIcon id={c} name={name(c)} role={r} size="xs" />{name(c)}
                    </button>
                  ))}
                </span>
              ))}
            </div>
          </div>
        )}
      </Section>

      {proposed.length > 0 && (
        <Section layer="clash" title="Proposed synergy" end={<ProposedTag />} className="proposed">
          {[...new Set(proposed.map((l) => l.role))].map((r) => (
            <div key={r} className="dw-group">
              <div className="dw-sub xs muted">Proposed {roleName(r).toLowerCase()}</div>
              <div className="dw-rows">
                {proposed.filter((l) => l.role === r).map((l) => (
                  <PartnerRow key={l.id} env={env} id={l.id} role={l.role} note={l.reason} kind="proposed"
                    tag={<span className={`prop-conf ${l.confidence} xs`}> · {l.tier === "alt" ? "alternative · " : ""}{CONFIDENCE_LABEL[l.confidence]}</span>} />
                ))}
              </div>
            </div>
          ))}
        </Section>
      )}

      {shells.length > 0 && (
        <Section layer="logic" title={`Comp shells · ${shells.length}`} tip="Comp Library shells with this pick in this role">
          <div className="dw-rows">
            {shells.map((s) => (
              <Link key={s.id} className="dw-row dw-shell" href={compsHref(s.id)} data-to={compsHref(s.id)}>
                <span className="dw-row-main">
                  <span className="dw-row-name">{s.name}<span className="xs faint"> · {s.kind === "observed" ? "pro" : "template"}</span></span>
                  <span className="dw-shell-picks">{ROLES.map((r) => <ChampIcon key={r} id={s.slots[r]} name={name(s.slots[r])} role={r} size="xs" />)}</span>
                </span>
                <span className="dw-chevron" aria-hidden="true">›</span>
              </Link>
            ))}
          </div>
        </Section>
      )}
    </>
  );
}
