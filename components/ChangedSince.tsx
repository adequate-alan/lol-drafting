"use client";
// Patch context for anything recorded on an older patch (alan, 2026-10-12): which patch a game was played on, and a
// small "Changed since this game" control listing the official changes to its champions, items and runes since then,
// each linking to the Patch Notes page. It never calls an old build current or optimal; it only shows what changed.
//
//   <PatchTag patch={game.patch} />                                   "Patch 26.18", with the pro-data spelling in the hint
//   <ChangedSince index={drawerData.patches} patch={game.patch}
//     champions={["ahri"]} items={["Luden's Echo", "3020"]} runes={["Electrocute"]} />   nothing when nothing changed
//   <PatchChanges id="ahri" index={...} />                            the champion drawer's block
import Link from "next/link";
import { Disclosure } from "@/components/Disclosure";
import { Popover } from "@/components/Popover";
import { parsePatch, patchKey } from "@/lib/patch";
import { CATEGORY_LABEL, changedSince, changesFor, patchHref, type Change, type PatchIndex } from "@/lib/patch-changes";

export function PatchTag({ patch }: { patch?: string | null }) {
  const p = parsePatch(patch);
  if (!p) return null;
  return <span className="pn-patch tnum" title={`Patch ${p.official} (${p.short} in pro data)`}>Patch {p.official}</span>;
}

/** One change as a compact line: patch, verdict, the first value change, a link to the entry. */
export function ChangeRow({ c, linkProps }: { c: Change; linkProps?: Record<string, string> }) {
  const first = c.lines[0];
  const href = patchHref(c.patch, c.id);
  return (
    <li className="pn-row">
      <Link href={href} className="pn-patch tnum" {...linkProps} data-to={linkProps ? href : undefined}>{c.patch}</Link>
      <span className="pn-row-main">
        <span className="pn-row-head">
          {c.via ? <span className="pn-tag">{c.category === "bugfix" ? "Bug fix" : c.subject}</span>
            : c.kind === "champion" ? <span className={`pn-verdict v-${c.category}`}>{CATEGORY_LABEL[c.category ?? "adjustment"]}</span>
            : <b>{c.subject}</b>}
        </span>
        {first && !c.via && (
          <span className="pn-row-line">{first.label && <span className="pn-label">{first.label}</span>}
            {first.before != null || first.after != null
              ? <span className="pn-vals"><span className="pn-old">{first.before ?? "—"}</span><span className="pn-arrow">→</span><span className="pn-new">{first.after ?? "—"}</span></span>
              : <span className="pn-text">{first.text}</span>}
            {c.lines.length + c.more > 1 && <span className="faint"> +{c.lines.length + c.more - 1} more</span>}
          </span>
        )}
      </span>
    </li>
  );
}

export function ChangedSince({ index, patch, champions, items, runes, label = "Changed since this game" }: {
  index: PatchIndex; patch?: string | null; champions?: string[]; items?: string[]; runes?: string[]; label?: string;
}) {
  const { since, changes } = changedSince(index, patch, { champions, items, runes });
  if (!since || !changes.length) return null;
  return (
    <Popover label={label} triggerClass="pn-since" className="pn-since-card" trigger={<>{label} <span className="count">{changes.length}</span></>}>
      {() => (
        <>
          <p className="xs muted">Official changes after patch {since} ({parsePatch(since)?.short} in pro data). A build from that patch may not hold now.</p>
          <ul className="pn-rows">{changes.map((c) => <ChangeRow key={`${c.patch}/${c.id}/${c.ref}`} c={c} />)}</ul>
        </>
      )}
    </Popover>
  );
}

/** The champion drawer's patch block: every change since the archive began, collapsed with its count. */
export function PatchChanges({ id, index }: { id: string; index: PatchIndex }) {
  const changes = changesFor(index, { kind: "champion", ref: id }, undefined);
  const own = changes.filter((c) => !c.via);
  const latest = own[0];
  return (
    <section className="drawer-patch">
      <Disclosure summary="Patch changes" lazy
        meta={changes.length ? `${changes.length} since ${patchKey(index.first)}${latest ? ` · latest ${latest.patch} ${CATEGORY_LABEL[latest.category ?? "adjustment"].toLowerCase()}` : ""}` : `none since ${patchKey(index.first)}`}>
        {changes.length ? <ul className="pn-rows">{changes.map((c) => <ChangeRow key={`${c.patch}/${c.id}`} c={c} linkProps={{}} />)}</ul>
          : <p className="xs muted">No official change since patch {patchKey(index.first)}.</p>}
        <p className="xs faint"><Link href={`/patch-notes/?champion=${id}`} data-to={`/patch-notes/?champion=${id}`}>Full history in Patch Notes</Link></p>
      </Disclosure>
    </section>
  );
}
