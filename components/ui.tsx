import type { Role, Source } from "@/lib/schema";
import { ChampIcon } from "./ChampIcon";

// Shared building blocks. Every page composes these instead of styling its own markup.

export type Layer = "clash" | "pro" | "logic";
const LAYER_LABEL: Record<Layer, string> = { clash: "Clash", pro: "Pro", logic: "Logic" };
const LAYER_TITLE: Record<Layer, string> = {
  clash: "My Clash Recommendation",
  pro: "Observed Pro Evidence (Gol.gg)",
  logic: "General Draft Logic",
};

/** Which of the three layers a piece of information belongs to. */
export function SourceBadge({ layer, label }: { layer: Layer; label?: string }) {
  return <span className={`badge ${layer}`} title={LAYER_TITLE[layer]}><span className="ldot" />{label ?? LAYER_LABEL[layer]}</span>;
}
export const EvidenceBadge = SourceBadge;

export function LayerBlock({ layer, title, end, children }: { layer: Layer; title?: string; end?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className={`layer ${layer}`}>
      <div className="layer-label"><SourceBadge layer={layer} /> {title ?? LAYER_TITLE[layer]}{end && <span style={{ marginLeft: "auto" }}>{end}</span>}</div>
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

export function DataTable({ children, tall = false, className = "" }: { children: React.ReactNode; tall?: boolean; className?: string }) {
  return <div className={`table-wrap ${tall ? "tall" : ""} ${className}`}><table>{children}</table></div>;
}

export function Metric({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return <div className="metric"><span className="m-label">{label}</span><span className="m-value">{value}</span>{sub && <span className="m-sub">{sub}</span>}</div>;
}

export type Severity = "critical" | "caution" | "healthy";
export function WarningBadge({ severity }: { severity: Severity }) {
  const cls = severity === "critical" ? "danger" : severity === "caution" ? "caution" : "success";
  const label = severity === "critical" ? "Critical" : severity === "caution" ? "Caution" : "Covered";
  return <span className={`badge ${cls}`}>{label}</span>;
}

export { ChampIcon, champInitials } from "./ChampIcon";

export function Chip({ id, name, role, note, strong, dim }: { id?: string; name: string; role?: Role; note?: string; strong?: boolean; dim?: boolean }) {
  return (
    <span className={`chip ${strong ? "strong" : ""} ${dim ? "dim" : ""} ${role ? `role-${role}` : ""}`} title={note}>
      <ChampIcon id={id} name={name} role={role} size="xs" />
      {name}
      {note && <small>{note}</small>}
    </span>
  );
}

export function ChipList({ ids, names, role, empty = "none", notes, strong, dim }: {
  ids: string[]; names: Record<string, string>; role?: Role; empty?: string; notes?: Record<string, string>; strong?: boolean; dim?: boolean;
}) {
  if (!ids.length) return <span className="muted small">{empty}</span>;
  return <span className="chip-list">{ids.map((id) => <Chip key={id} id={id} name={names[id] ?? id} role={role} note={notes?.[id]} strong={strong} dim={dim} />)}</span>;
}

/** A champion name with its monogram, for table cells and lists. */
export function ChampionRow({ id, name, role, hit = false, size = "sm" }: { id?: string; name: string; role?: Role; hit?: boolean; size?: "xs" | "sm" | "md" }) {
  return <span className={`cell-champ ${hit ? "hit" : ""} ${role ? `role-${role}` : ""}`}><ChampIcon id={id} name={name} role={role} size={size} />{name}</span>;
}

export function Duo({ bot, support, names }: { bot: string; support: string; names: Record<string, string> }) {
  return (
    <span className="chip plain duo">
      <ChampIcon id={bot} name={names[bot] ?? bot} role="BOT" size="xs" />{names[bot] ?? bot}<span className="plus">+</span>
      <ChampIcon id={support} name={names[support] ?? support} role="SUPPORT" size="xs" />{names[support] ?? support}
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
        <a key={s.id} href={s.url} target="_blank" rel="noopener noreferrer"
          title={`${s.tournament ?? ""} ${s.seriesGame ?? ""} ${s.team ? `${s.team} vs ${s.opponent}` : ""}\n${s.lastChecked ? `Last checked ${s.lastChecked}` : "Not refreshed by Claude since the workbook import"}${s.pendingClaim ? `\nExternally provided ${s.pendingClaim.providedOn}, pending refresh: ${s.pendingClaim.claim}` : ""}`}>
          Gol.gg {TYPE_LABEL[s.type]}{s.seriesGame ? ` ${s.seriesGame}` : s.team ? ` ${s.team} vs ${s.opponent}` : ""}
          {s.pendingClaim
            ? <span className="state"> · externally provided, pending refresh</span>
            : s.refreshStatus === "not-refreshed" && <span className="state"> · not refreshed</span>}
        </a>
      ))}
    </span>
  );
}

export const pct = (v: number | null | undefined) => (v == null ? "–" : `${Math.round(v * 100)}%`);
