"use client";
// Item changes on historical Pro Builds (alan, 2026-11-10; lib/item-history.ts). A build keeps exactly what the player
// bought; an item Riot changed since the game gets a small mark on its icon that opens what changed (patch, Riot's old
// and new values, a link to Riot's notes), and the build says once how many of its items changed since it was played.
// Never a replacement item, never "outdated build" across the page. Common builds read each item against the games that
// bought it, each on its own patch.
import Link from "next/link";
import { createContext, useContext } from "react";
import { Popover } from "@/components/Popover";
import { sourceHref, VERDICT_LABEL, type CommonCheck, type ItemCheck, type ItemMark } from "@/lib/item-history";
import { patchHref } from "@/lib/patch-changes";
import { patchKey } from "@/lib/patch";
import type { ItemChange } from "@/lib/schema";

/** The marks of the build (or Common scope) being shown, by item id. */
export const ItemMarks = createContext<Record<number, ItemMark>>({});
export const useItemMark = (id: number): ItemMark | undefined => useContext(ItemMarks)[id];

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const range = (ps: string[]) => (ps.length > 1 ? `${ps[0]}–${ps.at(-1)}` : ps[0]);

function ChangeLines({ c }: { c: ItemChange }) {
  return (
    <ul className="pn-lines">
      {c.lines.map((l, i) => (
        <li key={i}>{l.label && <span className="pn-label">{l.label}</span>}
          {l.before != null || l.after != null
            ? <span className="pn-vals"><span className="pn-old">{l.before ?? "—"}</span><span className="pn-arrow">→</span><span className="pn-new">{l.after ?? "—"}</span></span>
            : <span className="pn-text">{l.text}</span>}</li>
      ))}
    </ul>
  );
}

/** One change: verdict and patch, Riot's lines, and the source. A claim nobody has read on Riot's page says so. */
function ChangeBlock({ c }: { c: ItemChange }) {
  const archived = c.origin === "riot-patch-notes" && c.source.entry;
  return (
    <div className="item-change">
      <p className="item-change-head small">
        <span className={`pn-verdict v-${c.type}`}>{c.type === "removed" ? `Removed in ${patchKey(c.patch)}` : `${VERDICT_LABEL[c.type]} · ${patchKey(c.patch)}`}</span>
        {c.midPatch && <span className="xs muted"> · {c.midPatch.title}</span>}
      </p>
      {c.type === "removed" && <p className="xs">No longer available on Summoner&apos;s Rift.</p>}
      {c.lines.length > 0 && !(c.type === "removed" && c.basis === "externally-provided") && <ChangeLines c={c} />}
      <p className="xs faint">
        <a href={sourceHref(c)} target="_blank" rel="noopener noreferrer">Riot patch {patchKey(c.patch)} notes ↗</a>
        {archived && <> · <Link href={patchHref(c.patch, c.source.entry)}>Patch Notes</Link></>}
        {c.refreshStatus !== "verified" && <> · reported, not yet read from Riot&apos;s page</>}
        {c.type === "changed" && c.basis === "mixed" && <> · changes go both ways</>}
      </p>
    </div>
  );
}

export function ItemChangeCard({ mark, extra }: { mark: ItemMark; extra?: string }) {
  return (
    <div className="item-change-card">
      <div className="pop-head"><span className="pop-title">{mark.name}</span>
        {!mark.quality && <span className={`pn-verdict v-${mark.verdict}`}>{VERDICT_LABEL[mark.verdict]}{mark.changes.length > 1 ? ` · ${mark.changes.length} changes` : ""}</span>}</div>
      {extra && <p className="xs muted">{extra}</p>}
      {mark.quality && <p className="xs caution-text">Check this record: {mark.quality}</p>}
      {mark.games && mark.games.changed > 0 && <p className="xs muted">Changed since {mark.games.changed === mark.games.of ? (mark.games.of === 1 ? "the one game" : `all ${mark.games.of} games`) : `${mark.games.changed} of the ${plural(mark.games.of, "game")}`} in this scope that bought it (played on {mark.games.patches.join(", ")}).</p>}
      {!mark.quality && !mark.games && <p className="xs muted">Changed since this game. The player&apos;s purchase is shown as it was.</p>}
      {mark.changes.map((c) => <ChangeBlock key={c.id} c={c} />)}
    </div>
  );
}

/** The one line a historical build carries: its patch, the live patch, and how many of its items changed since. */
export function BuildItemNotice({ check }: { check?: ItemCheck }) {
  if (!check) return null;
  const { played, current, marks, quality, missing } = check;
  const historical = played !== current || marks.length > 0;
  if (!historical && !quality.length) return null;
  const notes = check.checked.length ? `Riot's notes ${range(check.checked)}` : undefined;
  return (
    <p className="xs muted item-notice tnum">
      <span>Historical build · Played on {played} · Current patch {current}.</span>{" "}
      {marks.length ? (
        <Popover label="Items changed since this game" triggerClass="pn-since" className="pn-since-card"
          trigger={<>{marks.length === 1 ? "1 item has" : `${marks.length} items have`} changed since this game</>}>
          {() => <>
            <p className="xs muted">Official item changes after patch {played}{notes ? ` (${notes})` : ""}. The build below is what the player bought then.</p>
            {marks.map((m) => <section key={m.id} className="item-change-list"><ItemChangeCard mark={m} /></section>)}
          </>}
        </Popover>
      ) : missing.length ? null : <span>No item in this build has changed since{notes ? ` (${notes})` : ""}.</span>}
      {missing.length > 0 && <span> Item changes for {missing.join(", ")} are not stored, so this build is not fully checked.</span>}
      {quality.map((q) => <span key={q.id} className="caution-text"> Check this record: {q.quality}</span>)}
    </p>
  );
}

/** The Common build's line: the games' patches, the live patch and the items changed since some of those games. */
export function CommonItemNotice({ check }: { check?: CommonCheck }) {
  if (!check) return null;
  const changed = check.marks.filter((m) => !m.quality);
  if (!changed.length && check.patches.every((p) => p === check.current) && !check.quality) return null;
  return (
    <p className="xs muted item-notice tnum">
      <span>Games on {check.patches.join(", ")} · Current patch {check.current}.</span>{" "}
      {changed.length ? <span>{changed.length === 1 ? "1 item has" : `${changed.length} items have`} changed since some of these games; each marked item says since which.</span>
        : check.complete ? <span>No item here has changed since these games.</span> : null}
      {!check.complete && <span> Some patches&apos; item notes are not stored, so the scope is not fully checked.</span>}
      {check.quality > 0 && <span className="caution-text"> {plural(check.quality, "game")} hold an item their patch could not have: see the marked items.</span>}
    </p>
  );
}

/** The mark on an icon: a small corner tag; the icon itself opens the card. */
export const markClass = (m: ItemMark) => `has-mark m-${m.quality ? "quality" : m.verdict}`;
export const markLabel = (m: ItemMark) => (m.quality ? "check this record" : m.verdict === "removed" ? `removed in ${patchKey(m.changes[0].patch)}` : `${VERDICT_LABEL[m.verdict].toLowerCase()} since${m.games ? " some games" : " this game"}`);
