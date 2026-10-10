// Proposed synergy: kit-based partners (written by Claude; never named in the UI) (lib/proposed.ts). Shown under alan's Confirmed synergy, never inside
// it: a dashed chip, a "Proposed · kit-based" label, the written reason and the kit-fit confidence. Pro games are a
// separate muted badge beside the partner, never a reason for the proposal.
import { CONFIDENCE_LABEL, PROPOSED_LABEL, type ProposedLink } from "@/lib/proposed";
import type { Role } from "@/lib/schema";
import { Chip } from "./ui";

type Names = Record<string, string>;
const ROLE_NAME: Record<Role, string> = { TOP: "top", JUNGLE: "jungle", MID: "mid", BOT: "bot", SUPPORT: "support" };

/** "N pro games" badge for a proposed pair, from recorded games (evidence only). */
export type ProCount = (partner: string, partnerRole: Role) => number;

function Partner({ l, names, proCount, note }: { l: ProposedLink; names: Names; proCount?: ProCount; note?: string }) {
  const games = proCount?.(l.id, l.role) ?? 0;
  return (
    <span className="chip-noted prop-partner">
      <Chip id={l.id} name={names[l.id] ?? l.id} role={l.role} dim />
      <small className="chip-note">
        {l.reason}
        <span className={`prop-conf ${l.confidence}`}> · {CONFIDENCE_LABEL[l.confidence]}</span>
        {games > 0 ? <span className="prop-pro" title="Recorded pro games with this pair in these roles. Evidence only, not part of the proposal."> · {games} pro game{games > 1 ? "s" : ""}</span>
          : <span className="faint"> · no recorded pro game</span>}
        {note && <span className="faint"> · {note}</span>}
      </small>
    </span>
  );
}

export function ProposedGroups({ links, names, proCount, noteFor, roles, compact }: {
  links: ProposedLink[]; names: Names; proCount?: ProCount; noteFor?: (l: ProposedLink) => string | undefined; roles?: Role[]; compact?: boolean;
}) {
  const byRole = [...new Set(links.map((l) => l.role))].filter((r) => !roles || roles.includes(r));
  if (!byRole.length) return <p className="muted xs">No proposed partners.</p>;
  return (
    <div className={`prop-groups ${compact ? "compact" : ""}`}>
      {byRole.map((r) => {
        const pref = links.filter((l) => l.role === r && l.tier === "preferred");
        const alt = links.filter((l) => l.role === r && l.tier === "alt");
        return (
          <div key={r} className="prop-role">
            {pref.length > 0 && <div className="scout-group"><div className="scout-group-title">Proposed {ROLE_NAME[r]}</div>
              <span className="chip-list">{pref.map((l) => <Partner key={l.id} l={l} names={names} proCount={proCount} note={noteFor?.(l)} />)}</span></div>}
            {alt.length > 0 && <div className="scout-group"><div className="scout-group-title">Proposed {ROLE_NAME[r]} alternatives</div>
              <span className="chip-list">{alt.map((l) => <Partner key={l.id} l={l} names={names} proCount={proCount} note={noteFor?.(l)} />)}</span></div>}
          </div>
        );
      })}
    </div>
  );
}

export const ProposedTag = () => <span className="prop-tag" title="Kit-based synergy that hasn't been added to your saved pairings.">{PROPOSED_LABEL}</span>;
