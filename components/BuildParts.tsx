"use client";
// Pieces of the Pro Builds page (components/views/ProBuildsView.tsx): icons, the full rune page, the level-up grid, the
// build overview and the purchase timeline for one recorded game. Everything shows exactly what the game record holds;
// a field the record lacks is said to be missing, never filled in. Icons come from Data Dragon at the game's patch, and
// every icon carries a themed tip (components/TipLayer.tsx renders `title`).
import { useState } from "react";
import {
  abilityIcon, clock, fullRunes, itemIcon, itemTip, maxRanks, overview, runeIcon, shopVisits, skillSummary, spellIcon,
  type BuildRow, type FullRunes, type Skill,
} from "@/lib/pro-builds";
import type { PatchAssets } from "@/lib/schema";

export type IconSize = "xs" | "sm" | "md" | "lg";
export const SKILLS: Skill[] = ["Q", "W", "E", "R"];

export function Icon({ src, label, tip, size = "md", dim, struck, chosen, className = "" }: {
  src?: string; label: string; tip?: string; size?: IconSize; dim?: boolean; struck?: boolean; chosen?: boolean; className?: string;
}) {
  // Remember which src failed, not just that one did: switching games reuses this slot for another icon.
  const [bad, setBad] = useState<string>();
  return (
    <span className={`bicon ${size} ${dim ? "dim" : ""} ${struck ? "struck" : ""} ${chosen ? "chosen" : ""} ${className}`} title={tip ?? label}>
      {src && bad !== src ? <img key={src} src={src} alt={label} loading="lazy" decoding="async" draggable={false} onError={() => setBad(src)} />
        : <span className="bicon-fallback" aria-label={label}>{label.slice(0, 2)}</span>}
    </span>
  );
}

export const Item = ({ a, id, extra, size, struck, className }: { a?: PatchAssets; id: number; extra?: string; size?: IconSize; struck?: boolean; className?: string }) =>
  <Icon src={a ? itemIcon(a, id) : undefined} label={a?.items[id]?.name ?? `Item ${id}`} tip={itemTip(a, id, extra)} size={size} struck={struck} className={className} />;

export const itemName = (a: PatchAssets | undefined, id: number) => a?.items[id]?.name ?? `Item ${id}`;
export const runeName = (a: PatchAssets | undefined, id: number) => a?.runes[id]?.name ?? `Rune ${id}`;
export const spellName = (a: PatchAssets | undefined, id: number) => a?.spells[id]?.name ?? `Spell ${id}`;
export const treeName = (a: PatchAssets | undefined, id: number) => a?.trees[id]?.name ?? `Tree ${id}`;

export function Rune({ a, id, size = "md", dim, chosen }: { a?: PatchAssets; id: number; size?: IconSize; dim?: boolean; chosen?: boolean }) {
  const rn = a?.runes[id];
  return <Icon src={rn && runeIcon(rn.icon)} label={runeName(a, id)} size={size} dim={dim} chosen={chosen}
    tip={`${runeName(a, id)}${chosen ? " · chosen" : dim ? " · not chosen" : ""}${rn?.short ? `\n${rn.short}` : ""}`} />;
}
export const Tree = ({ a, id, size = "sm" }: { a?: PatchAssets; id: number; size?: IconSize }) =>
  <Icon src={a?.trees[id] && runeIcon(a.trees[id].icon)} label={treeName(a, id)} size={size} />;

export function Spell({ a, id, casts, size = "md" }: { a?: PatchAssets; id: number; casts?: number; size?: IconSize }) {
  const sp = a?.spells[id];
  return (
    <span className="build-spell">
      <Icon src={a && spellIcon(a, id)} label={spellName(a, id)} size={size} tip={`${spellName(a, id)}${sp?.cooldown ? `\nCooldown ${sp.cooldown}s` : ""}${casts != null ? `\nCast ${casts} times in this game` : ""}`} />
      <span className="build-spell-text"><span className="small">{spellName(a, id)}</span>{casts != null && <span className="xs muted tnum">{casts} casts</span>}</span>
    </span>
  );
}

// ---------- runes ----------
/** One tree as the client shows it: every option per row, the chosen ones bright, the others subdued. */
function RuneTree({ a, id, chosen, secondary }: { a?: PatchAssets; id: number; chosen: Set<number>; secondary?: boolean }) {
  const t = a?.trees[id];
  if (!t) return <p className="xs muted">Rune tree {id} is not named in this patch&apos;s files.</p>;
  return (
    <div className={`rune-tree ${secondary ? "secondary" : "primary"}`}>
      <div className="rune-tree-head"><Tree a={a} id={id} /><span className="small"><b>{t.name}</b></span><span className="xs muted">{secondary ? "Secondary" : "Primary"}</span></div>
      {t.rows.slice(secondary ? 1 : 0).map((row, i) => (
        <div key={i} className={`rune-row ${!secondary && i === 0 ? "keystone" : ""}`}>
          {row.map((x) => <Rune key={x} a={a} id={x} size={!secondary && i === 0 ? "lg" : "md"} chosen={chosen.has(x)} dim={!chosen.has(x)} />)}
        </div>
      ))}
    </div>
  );
}

/** The complete rune page of one game, or the keystone with a note when the record has only that. */
export function RunePage({ r, compact }: { r: BuildRow; compact?: boolean }) {
  const a = r.assets, ru = r.build.runes;
  if (!ru) return <p className="small muted">Runes were not recorded for this game.</p>;
  const full = fullRunes(ru);
  if (!full) return (
    <div className="rune-partial">
      <span className="rune-keystone-line"><Rune a={a} id={ru.keystone} size="lg" chosen /><span><b className="small">{runeName(a, ru.keystone)}</b><span className="xs muted"> · {treeName(a, ru.primary)}</span></span></span>
      <p className="xs muted">Full rune page unavailable: the source gave only the keystone for this game. The other runes are not shown rather than guessed.</p>
    </div>
  );
  const chosen = new Set([full.keystone, ...full.primaryRunes, ...full.secondaryRunes]);
  return (
    <div className={`rune-page ${compact ? "compact" : ""}`}>
      <RuneTree a={a} id={full.primary} chosen={chosen} />
      <div className="rune-side">
        <RuneTree a={a} id={full.secondary} chosen={chosen} secondary />
        <div className="rune-shards">
          <div className="rune-tree-head"><span className="small"><b>Stat shards</b></span></div>
          {full.shards ? full.shards.map((x, i) => (
            <span key={i} className="rune-shard"><Rune a={a} id={x} size="sm" chosen /><span className="xs">{runeName(a, x)}</span></span>
          )) : <p className="xs muted">Not recorded for this game.</p>}
        </div>
      </div>
      <p className="rune-text xs muted">{runeText(a, full)}</p>
    </div>
  );
}
export const runeText = (a: PatchAssets | undefined, p: FullRunes) =>
  `${treeName(a, p.primary)}: ${[p.keystone, ...p.primaryRunes].map((x) => runeName(a, x)).join(", ")} · ${treeName(a, p.secondary)}: ${p.secondaryRunes.map((x) => runeName(a, x)).join(", ")}${p.shards ? ` · ${p.shards.map((x) => runeName(a, x)).join(", ")}` : ""}`;

// ---------- skills ----------
const LEVELS = 18;

/** Levels 1–18 by Q / W / E / R. Points the record does not reach stay empty and are marked; extra points (champions that
 *  take more ability points than levels) add columns, numbered as points. */
export function SkillGrid({ r }: { r: BuildRow }) {
  const a = r.assets, b = r.build;
  if (!b.skills) return <p className="small muted">Skill order was not recorded for this game.</p>;
  const seq = [...b.skills] as Skill[];
  const cols = Math.max(LEVELS, seq.length);
  const ab = a?.abilities[b.champion];
  return (
    <div className="skill-grid-wrap">
      <table className="skill-grid" aria-label={seq.length > LEVELS ? "Ability given each point, in order" : "Ability levelled at each champion level"}>
        <thead>
          <tr><th scope="col"><span className="sr-only">Ability</span></th>
            {Array.from({ length: cols }, (_, i) => <th key={i} scope="col" className={`tnum ${i >= seq.length ? "unreached" : ""}`}
              title={i >= seq.length ? `Not reached: ${seq.length} points recorded in this game` : undefined}>{i + 1}</th>)}
          </tr>
        </thead>
        <tbody>
          {SKILLS.map((k, row) => (
            <tr key={k}>
              <th scope="row"><span className="skill-key"><Icon src={a && abilityIcon(a, b.champion, k)} label={ab?.[k].name ?? k}
                tip={`${k} · ${ab?.[k].name ?? "Ability"}${ab ? `\nMax rank ${ab[k].maxrank}` : ""}${b.skillCasts ? `\nCast ${b.skillCasts[row]} times` : ""}`} size="sm" /><span>{k}</span></span></th>
              {Array.from({ length: cols }, (_, i) => {
                const up = seq[i] === k;
                return <td key={i} className={up ? "up" : i >= seq.length ? "unreached" : undefined}>{up ? <span className="tnum">{i + 1}</span> : null}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** "Q → E → W", R levels and first three points, from the recorded order only. */
export function SkillSummaryLine({ r }: { r: BuildRow }) {
  const b = r.build;
  if (!b.skills) return null;
  const s = skillSummary(b.skills, maxRanks(r));
  const rAt = [...b.skills].flatMap((k, i) => (k === "R" ? [i + 1] : []));
  return (
    <p className="skill-summary small">
      <span><span className="muted">{s.maxed.length === s.order.length ? "Max order" : "Priority by points"}</span> <b className="tnum">{s.order.join(" → ")}</b></span>
      <span><span className="muted">Start</span> <b className="tnum">{s.first.join(" ")}</b></span>
      {rAt.length > 0 && <span><span className="muted">R at</span> <b className="tnum">{rAt.join(", ")}</b></span>}
      {b.skillCasts && <span className="xs muted tnum" title="Ability casts recorded for this game">Casts {SKILLS.map((k, i) => `${k} ${b.skillCasts![i]}`).join(" · ")}</span>}
    </p>
  );
}

export function SkillNotes({ r }: { r: BuildRow }) {
  const b = r.build;
  if (!b.skills) return null;
  const s = skillSummary(b.skills, maxRanks(r));
  return (
    <>
      {s.levels < LEVELS && <p className="xs faint">{s.levels} level-ups recorded; the game ended before level {s.levels + 1}, so the later columns stay empty.</p>}
      {s.levels > LEVELS && <p className="xs faint">{s.levels} ability points recorded: this champion takes more ability points than champion levels, so the columns count points, not levels.</p>}
      {s.maxed.length < s.order.length && <p className="xs faint">Not every basic ability was maxed in this game, so the order is by points taken.</p>}
    </>
  );
}

// ---------- items ----------
export const boughtAt = (r: BuildRow, id: number) => r.build.purchases?.find(([, x, e]) => x === id && e === "buy")?.[0];

/** Start · First item · Boots · Core · Situational · Final, read in order from this game's purchase log. */
export function BuildOverview({ r }: { r: BuildRow }) {
  const a = r.assets, b = r.build, o = overview(b, a);
  const at = (id: number) => { const t = boughtAt(r, id); return t != null ? `Bought at ${clock(t)}` : undefined; };
  const group = (label: string, ids: number[], empty: string, tip?: string, timed = true) => (
    <div className="flow-step">
      <span className="label" title={tip}>{label}</span>
      {ids.length ? <span className="build-row-items">{ids.map((id, i) => (
        <span key={`${id}-${i}`} className="flow-item">
          <Item a={a} id={id} struck={timed && o.sold.has(id)} extra={[at(id), timed && o.sold.has(id) ? "Sold later in the game" : undefined].filter(Boolean).join("\n") || undefined} />
          {timed && boughtAt(r, id) != null && <span className="xs muted tnum">{clock(boughtAt(r, id)!)}</span>}
        </span>
      ))}</span> : <span className="xs muted">{empty}</span>}
    </div>
  );
  return (
    <div className="build-flow">
      {o.complete ? <>
        {group("Start", o.starting, "none recorded", "Bought before leaving base", false)}
        {group("First item", o.first ? [o.first] : [], "no completed item", "The first completed item")}
        {group("Boots", o.boots ? [o.boots] : [], "no boots bought")}
        {group("Core", o.core, "no completed item", "The first three completed items, in purchase order")}
        {group("Situational", o.later, "none", "Completed items bought after the core three in this game, in order")}
      </> : <p className="xs muted">Purchase log not recorded for this game.</p>}
      <div className="flow-step final">
        <span className="label" title="Inventory when the game ended">Final</span>
        {b.final ? (
          <span className="build-row-items">
            {b.final.map((id, i) => (id ? <Item key={i} a={a} id={id} /> : <span key={i} className="bicon md empty" title="Empty slot" />))}
            {b.trinket && <Item a={a} id={b.trinket} size="sm" className="trinket" />}
          </span>
        ) : <span className="xs muted">Not recorded</span>}
      </div>
    </div>
  );
}

/** Every buy and sell in game time, grouped into shop visits; scrolls inside itself. */
export function PurchaseTimeline({ r }: { r: BuildRow }) {
  const visits = shopVisits(r.build, r.assets);
  if (!visits.length) return <p className="xs muted">Purchase log not recorded for this game.</p>;
  return (
    <>
      <ol className="build-timeline" aria-label="Purchases in game time">
        {visits.map((v) => (
          <li key={v.at}>
            <span className="xs muted tnum">{clock(v.at)}</span>
            <span className="build-row-items">
              {v.steps.map((s, i) => (
                <Item key={i} a={r.assets} id={s.item} size={s.kind === "completed" || s.kind === "boots" ? "md" : "sm"} struck={s.sold}
                  className={s.kind === "completed" ? "completed" : undefined}
                  extra={`${s.sold ? "Sold" : "Bought"} at ${clock(s.at)}${s.kind === "completed" ? " · completed item" : s.kind === "component" ? " · component" : ""}`} />
              ))}
            </span>
          </li>
        ))}
      </ol>
      <p className="xs faint">Each column is a shop visit. Large icons are completed items and boots, small ones components and consumables; struck through means sold. Components merged into an item are not listed again.</p>
    </>
  );
}
