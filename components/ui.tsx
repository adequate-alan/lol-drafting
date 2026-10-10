import type { Role, Source } from "@/lib/schema";

export type Layer = "clash" | "pro" | "logic";
const LAYER_LABEL: Record<Layer, string> = { clash: "Clash", pro: "Pro", logic: "Logic" };
const LAYER_TITLE: Record<Layer, string> = {
  clash: "My Clash Recommendation",
  pro: "Observed Pro Evidence (Gol.gg)",
  logic: "General Draft Logic",
};

export function EvidenceBadge({ layer }: { layer: Layer }) {
  return <span className={`badge ${layer}`} title={LAYER_TITLE[layer]}>{LAYER_LABEL[layer]}</span>;
}

export function LayerBlock({ layer, title, children }: { layer: Layer; title?: string; children: React.ReactNode }) {
  return (
    <div className={`layer ${layer}`}>
      <div className="section-label"><EvidenceBadge layer={layer} /> {title ?? LAYER_TITLE[layer]}</div>
      {children}
    </div>
  );
}

export function Chip({ name, role, note }: { name: string; role?: Role; note?: string }) {
  return (
    <span className={`chip ${role ? `role-${role}` : ""}`} title={note}>
      {role && <span className="dot" />}
      {name}
      {note && <small>{note}</small>}
    </span>
  );
}

export function ChipList({ ids, names, role, empty = "none", notes }: {
  ids: string[]; names: Record<string, string>; role?: Role; empty?: string; notes?: Record<string, string>;
}) {
  if (!ids.length) return <span className="muted">{empty}</span>;
  return <span className="row">{ids.map((id) => <Chip key={id} name={names[id] ?? id} role={role} note={notes?.[id]} />)}</span>;
}

const TYPE_LABEL: Record<Source["type"], string> = {
  "golgg-game": "game", "golgg-tournament": "tournament", "golgg-champion": "champion stats", "golgg-team": "team stats", other: "source",
};

export function SourceLinks({ ids, sources }: { ids: string[]; sources: Record<string, Source> }) {
  const list = [...new Set(ids)].map((id) => sources[id]).filter(Boolean);
  if (!list.length) return null;
  return (
    <span className="row small">
      {list.map((s) => (
        <a key={s.id} href={s.url} target="_blank" rel="noopener noreferrer"
          title={`${s.tournament ?? ""} ${s.seriesGame ?? ""} ${s.team ? `${s.team} vs ${s.opponent}` : ""}\n${s.lastChecked ? `Last checked ${s.lastChecked}` : "Not refreshed by Claude since the workbook import"}${s.pendingClaim ? `\nExternally provided ${s.pendingClaim.providedOn}, pending refresh: ${s.pendingClaim.claim}` : ""}`}>
          Gol.gg {TYPE_LABEL[s.type]}{s.seriesGame ? ` ${s.seriesGame}` : s.team ? ` ${s.team} vs ${s.opponent}` : ""}
          {s.pendingClaim
            ? <span className="muted"> · externally provided, pending refresh</span>
            : s.refreshStatus === "not-refreshed" && <span className="muted"> · not refreshed</span>}
        </a>
      ))}
    </span>
  );
}

export const pct = (v: number | null | undefined) => (v == null ? "–" : `${Math.round(v * 100)}%`);

// Shown in the static HTML until the page reads its URL filters in the browser.
export function PageLoading({ title }: { title: string }) {
  return <div className="page-head"><h1>{title}</h1><span className="small muted">Loading…</span></div>;
}
