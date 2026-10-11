import type { Role, Source } from "@/lib/schema";
import { ChampIcon } from "./ChampIcon";
import { InteractiveChampion } from "./InteractiveChampion";

// Shared building blocks. Every page composes these instead of styling its own markup.

export type Layer = "clash" | "pro" | "logic";
const LAYER_LABEL: Record<Layer, string> = { clash: "Synergy", pro: "Pro", logic: "Logic" };
const LAYER_TITLE: Record<Layer, string> = {
  clash: "Synergy",
  pro: "Pro evidence",
  logic: "Logic",
};

/** Which of the three layers a piece of information belongs to. */
export function SourceBadge({ layer, label }: { layer: Layer; label?: string }) {
  return <span className={`src ${layer}`} title={LAYER_TITLE[layer]}><span className="ldot" />{label ?? LAYER_LABEL[layer]}</span>;
}
export const EvidenceBadge = SourceBadge;

export function LayerBlock({ layer, title, end, children }: { layer: Layer; title?: string; end?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className={`layer ${layer}`}>
      <div className="layer-label"><span className="ldot" />{title ?? LAYER_TITLE[layer]}{end && <span className="push">{end}</span>}</div>
      {children}
    </section>
  );
}

export function PageHeader({ title, desc, badges, actions }: {
  title: string; desc?: React.ReactNode; badges?: React.ReactNode; actions?: React.ReactNode;
}) {
  return (
    <header className="page-header">
      <div className="titles">
        <div className="title-row"><h1>{title}</h1>{badges}</div>
        {desc && <div className="desc">{desc}</div>}
      </div>
      {actions && <div className="actions">{actions}</div>}
    </header>
  );
}

// Shown in the static HTML until the page reads its URL filters in the browser.
export function PageLoading({ title }: { title: string }) {
  return <PageHeader title={title} desc={<span className="loading">Loading…</span>} />;
}

export function SectionHeader({ title, meta, end, as: H = "h2" }: { title: React.ReactNode; meta?: React.ReactNode; end?: React.ReactNode; as?: "h2" | "h3" }) {
  return (
    <div className="section-header">
      <H>{title}</H>
      {meta && <span className="meta">{meta}</span>}
      {end && <div className="end">{end}</div>}
    </div>
  );
}

export function Panel({ title, meta, end, children, className = "", bodyClass = "panel-body" }: {
  title?: React.ReactNode; meta?: React.ReactNode; end?: React.ReactNode; children: React.ReactNode; className?: string; bodyClass?: string;
}) {
  return (
    <section className={`panel ${className}`}>
      {title && (
        <div className="panel-head">
          <h2>{title}</h2>
          {meta && <span className="xs muted">{meta}</span>}
          {end && <div className="end">{end}</div>}
        </div>
      )}
      <div className={bodyClass}>{children}</div>
    </section>
  );
}

export type Severity = "critical" | "caution" | "healthy";
export function WarningBadge({ severity }: { severity: Severity }) {
  const cls = severity === "critical" ? "danger" : severity === "caution" ? "caution" : "success";
  const label = severity === "critical" ? "Critical" : severity === "caution" ? "Caution" : "Covered";
  return <span className={`badge ${cls}`}>{label}</span>;
}

export { ChampIcon, champInitials } from "./ChampIcon";

export function Chip({ id, name, role, note, strong, dim }: { id?: string; name: string; role?: Role; note?: string; strong?: boolean; dim?: boolean }) {
  const chip = (
    <span className={`chip ${strong ? "strong" : ""} ${dim ? "dim" : ""} ${role ? `role-${role}` : ""}`} title={note}>
      <ChampIcon id={id} name={name} role={role} size="xs" />
      {name}
    </span>
  );
  // Inside a ChampionProvider the chip shows the quick card on hover and opens the drawer on click.
  const champ = id ? <InteractiveChampion id={id} role={role}>{chip}</InteractiveChampion> : chip;
  // A note is explanatory text: it sits beside the compact chip and wraps inside its column, never inside the chip.
  return note ? <span className="chip-noted">{champ}<small className="chip-note">{note}</small></span> : champ;
}

export function ChipList({ ids, names, role, empty = "none", notes, strong, dim }: {
  ids: string[]; names: Record<string, string>; role?: Role; empty?: string; notes?: Record<string, string>; strong?: boolean; dim?: boolean;
}) {
  if (!ids.length) return <span className="muted small">{empty}</span>;
  return <span className="chip-list">{ids.map((id) => <Chip key={id} id={id} name={names[id] ?? id} role={role} note={notes?.[id]} strong={strong} dim={dim} />)}</span>;
}

/** A champion name with its monogram, for table cells and lists. Inside a ChampionProvider it gets the shared hover
 *  card and drawer. */
export function ChampionRow({ id, name, role, hit = false, size = "sm" }: { id?: string; name: string; role?: Role; hit?: boolean; size?: "xs" | "sm" | "md" }) {
  const row = <span className={`cell-champ ${hit ? "hit" : ""} ${role ? `role-${role}` : ""}`}><ChampIcon id={id} name={name} role={role} size={size} />{name}</span>;
  return id ? <InteractiveChampion id={id} role={role}>{row}</InteractiveChampion> : row;
}

export function Duo({ bot, support, names }: { bot: string; support: string; names: Record<string, string> }) {
  return (
    <span className="chip plain duo">
      <InteractiveChampion id={bot} role="BOT"><span className="duo-half"><ChampIcon id={bot} name={names[bot] ?? bot} role="BOT" size="xs" />{names[bot] ?? bot}</span></InteractiveChampion>
      <span className="plus">+</span>
      <InteractiveChampion id={support} role="SUPPORT"><span className="duo-half"><ChampIcon id={support} name={names[support] ?? support} role="SUPPORT" size="xs" />{names[support] ?? support}</span></InteractiveChampion>
    </span>
  );
}

const TYPE_LABEL: Record<Source["type"], string> = {
  "golgg-game": "game", "golgg-tournament": "tournament", "golgg-champion": "champion stats", "golgg-team": "team stats", other: "source",
};

export function SourceLinks({ ids, sources }: { ids: string[]; sources: Record<string, Source> }) {
  const list = [...new Set(ids)].map((id) => sources[id]).filter(Boolean);
  if (!list.length) return null;
  return (
    <span className="source-links">
      {list.map((s) => (
        <a key={s.id} href={s.url} className={s.refreshStatus === "verified" ? "" : "unverified"} target="_blank" rel="noopener noreferrer"
          title={`${s.tournament ?? ""} ${s.seriesGame ?? ""} ${s.team ? `${s.team} vs ${s.opponent}` : ""}\n${s.lastChecked ? `Last checked ${s.lastChecked}` : "Not refreshed since the workbook import"}${s.pendingClaim ? `\nExternally provided${s.pendingClaim.providedBy ? ` by ${s.pendingClaim.providedBy}` : ""} ${s.pendingClaim.providedOn}, pending refresh: ${s.pendingClaim.claim}` : ""}`}>
          Gol.gg {TYPE_LABEL[s.type]}{s.seriesGame ? ` ${s.seriesGame}` : s.team ? ` ${s.team} vs ${s.opponent}` : ""}
          {/* Status lives in the tooltip; only a pending external claim is marked inline. */}
          {s.pendingClaim && <span className="state"> · pending</span>}
        </a>
      ))}
    </span>
  );
}

export const pct = (v: number | null | undefined) => (v == null ? "–" : `${Math.round(v * 100)}%`);
