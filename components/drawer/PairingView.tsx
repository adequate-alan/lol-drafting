"use client";
// One pairing inside the drawer (alan: "clicking Bard under Caitlyn's preferred supports shows why they pair, what Bard
// contributes, relevant observed games, tradeoffs, View Bard, View full Synergy page"), with Back to the champion.
// Layer by layer, never merged: Synergy (saved or proposed), Logic (attributes), Pro (recorded games, cited pairings).
import Link from "next/link";
import { useEffect, useRef } from "react";
import { ProposedTag } from "@/components/ProposedSynergy";
import { ChampIcon, SourceLinks } from "@/components/ui";
import { GameList, Section, roleName, type DrawerEnv, type Partner } from "@/components/drawer/parts";
import { draftHref, pairingDetail, synergiesHref } from "@/lib/drawer";
import { describeLine } from "@/lib/evidence";
import { CONFIDENCE_LABEL } from "@/lib/proposed";

const KIND: Record<NonNullable<ReturnType<typeof pairingDetail>["saved"]>["kind"], string> = {
  default: "Preferred", alt: "Alternative", fits: "Saved comp", pro: "From pro games",
};

export function PairingView({ env, partner, onBack }: { env: DrawerEnv; partner: Partner; onBack: () => void }) {
  const { id, role, name, data, index } = env;
  const d = pairingDetail({ id, role }, partner, data, index);
  const head = useRef<HTMLHeadingElement>(null);
  useEffect(() => { head.current?.focus({ preventScroll: true }); }, [partner.id, partner.role]);
  const me = name(id), them = name(partner.id);
  const syn = synergiesHref(id, role);
  const both = draftHref({ [role]: id, [partner.role]: partner.id });

  return (
    <div className="dw-pairing">
      <div className="dw-pair-head">
        <button type="button" className="dw-back" onClick={onBack}><span aria-hidden="true">←</span> Back to {me}</button>
        <h3 ref={head} tabIndex={-1} className="dw-pair-title">
          <span className="dw-pair-icons"><ChampIcon id={id} name={me} role={role} size="md" /><ChampIcon id={partner.id} name={them} role={partner.role} size="md" /></span>
          <span>{me} + {them}<span className="xs muted dw-pair-roles">{roleName(role)} / {roleName(partner.role)}</span></span>
        </h3>
      </div>

      <Section layer="clash" title="Synergy" className={d.proposed ? "proposed" : ""}>
        {d.saved ? (
          <p className="small"><b>{KIND[d.saved.kind]}</b>{d.saved.kind === "pro" && <span className="xs muted"> · not hand-saved</span>} · {d.saved.text}{d.saved.note && <span className="muted"> ({d.saved.note})</span>}</p>
        ) : d.proposed ? (
          <p className="small"><ProposedTag /> {d.proposed.tier === "alt" ? "Alternative" : "Preferred"} · {d.proposed.reason} <span className={`prop-conf ${d.proposed.confidence} xs`}>· {CONFIDENCE_LABEL[d.proposed.confidence]}</span></p>
        ) : <p className="xs muted">Not a saved or proposed pairing.</p>}
        {d.read && <p className="xs muted dw-read"><span className="faint">Saved read:</span> {d.read}</p>}
      </Section>

      <Section layer="logic" title="Draft logic">
        {d.gives.length > 0 && <p className="small"><span className="muted">{them} brings</span> {d.gives.join(" · ")}</p>}
        {d.logic.length > 0 && <ul className="drawer-logic">{d.logic.map((t, i) => <li key={i} className="small">{t}</li>)}</ul>}
        {d.tradeoffs.length > 0 && <p className="xs caution-text"><span className="muted">Tradeoffs:</span> {d.tradeoffs.join("; ")}</p>}
        {!d.gives.length && !d.logic.length && !d.tradeoffs.length && <p className="xs muted">No attribute read for this pair.</p>}
      </Section>

      <Section layer="pro" title={`Recorded games · ${d.games.length}`} tip="Games with both champions on one team in these roles">
        {d.games.length ? <GameList env={env} games={d.games} partner={partner} /> : <p className="xs muted">No recorded pro game with {me} and {them} together.</p>}
        {d.observed.length > 0 && (
          <ul className="dw-lines">
            {d.observed.map((l, i) => <li key={i} className="xs"><span className="badge pro tnum">{describeLine(l)}</span><span className="muted"> · cited, no recorded draft</span> <SourceLinks ids={l.pairing.sources} sources={data.sources} /></li>)}
          </ul>
        )}
      </Section>

      <div className="dw-actions dw-pair-actions">
        {env.canSelect && <button type="button" className="btn sm primary" onClick={() => env.select({ id: partner.id, role: partner.role }, true)}>View {them}</button>}
        <Link className="btn sm" href={syn} data-to={syn}>View Synergies</Link>
        {env.context.page !== "draft" && <Link className="btn sm" href={both} data-to={both}>Draft this pair</Link>}
      </div>
    </div>
  );
}
