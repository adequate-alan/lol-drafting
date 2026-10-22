"use client";
// Patch Notes (alan, 2026-10-12): Riot's official Summoner's Rift changes from 26.16 on, one patch at a time, with a
// champion history, search, filters and a patch comparison. Riot's facts (values exactly as written, Riot's note) and
// the draft implications (analysis, from this site's own data) are separate blocks. Nothing here changes saved
// pairings, pool tiers or any score.
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { ChampionProvider } from "@/components/ChampionInteraction";
import type { DrawerContext } from "@/lib/drawer";
const PATCH_NOTES: DrawerContext = { page: "patch-notes" };
import { Disclosure } from "@/components/Disclosure";
import { InteractiveChampion } from "@/components/InteractiveChampion";
import { Select } from "@/components/Select";
import { ChampIcon, PageHeader, SectionHeader } from "@/components/ui";
import type { DrawerData } from "@/lib/data";
import { shortDate } from "@/lib/evidence";
import { comparePatch, parsePatch, patchKey } from "@/lib/patch";
import { CATEGORY_LABEL } from "@/lib/patch-changes";
import type { Implications } from "@/lib/patch-implications";
import type { KitReviewItem } from "@/lib/kit-review";
import type { PatchEntry, PatchNote, PatchNotes } from "@/lib/schema";

type Kind = PatchEntry["kind"];
const KINDS: [Kind, string][] = [["champion", "Champions"], ["item", "Items"], ["rune", "Runes"], ["system", "Systems"]];
const CHAMP_ORDER = ["buff", "nerf", "adjustment", "rework"] as const;
const CHAMP_GROUP: Record<string, string> = { buff: "Buffs", nerf: "Nerfs", adjustment: "Adjustments", rework: "Reworks" };
const SYSTEM_ORDER = ["jungle", "objectives", "minions", "turrets", "summoners", "role-quests", "map-economy", "other", "bugfix"];
const RUNE_ORDER = ["keystone", "minor", "shard"];

const lineText = (e: PatchEntry) => [e.subject, e.context ?? "", ...e.groups.flatMap((g) => [g.title ?? "", ...g.changes.map((c) => c.text)])].join(" ").toLowerCase();

export function PatchNotesView({ notes, names, implications, kitReview = {}, drawerData }: {
  notes: PatchNotes; names: Record<string, string>; implications: Record<string, Implications>; kitReview?: Record<string, KitReviewItem>; drawerData: DrawerData;
}) {
  // Filters live in the URL so a view can be shared; window.location keeps the GitHub Pages base path.
  const initial = useSearchParams();
  const [params, setParams] = useState(() => new URLSearchParams(initial.toString()));
  const get = (k: string) => params.get(k) || undefined;
  const update = (changes: Record<string, string | undefined>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) if (v) next.set(k, v); else next.delete(k);
    setParams(next);
    window.history.replaceState(null, "", `${window.location.pathname}${next.size ? `?${next}` : ""}`);
  };
  const set = (k: string, v: string | undefined) => update({ [k]: v });

  const patches = useMemo(() => [...notes.patches].sort((a, b) => comparePatch(b.patch, a.patch)), [notes]);
  const latest = patches[0];
  const asked = get("patch");
  const current = patches.find((p) => p.patch === (asked && parsePatch(asked) ? patchKey(asked) : latest?.patch)) ?? latest;
  const view = get("view") === "compare" ? "compare" : "patch";
  const champion = get("champion");
  const kind = get("kind") as Kind | undefined;
  const q = (get("q") ?? "").trim().toLowerCase();

  // A link to one entry (#champion-ahri) scrolls to it once the page has rendered in the browser.
  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.slice(1));
    const el = id ? document.getElementById(id) : null;
    if (!el) return;
    el.scrollIntoView({ block: "start" });
    el.classList.add("pn-target");
  }, [current?.patch, view, champion]);

  const changedChampions = useMemo(() => [...new Set(patches.flatMap((p) => p.entries.filter((e) => e.kind === "champion" && e.ref).map((e) => e.ref!)))]
    .sort((a, b) => (names[a] ?? a).localeCompare(names[b] ?? b)), [patches, names]);

  if (!current) return <><PageHeader title="Patch Notes" /><p className="muted">No patch notes recorded yet.</p></>;
  const range = compareRange(patches, notes.firstPatch, get("from"), get("to"));
  const opts = [...patches].reverse().map((p) => ({ value: p.patch, label: p.patch }));
  const i = patches.indexOf(current);
  const older = patches[i + 1], newer = patches[i - 1];
  const visible = current.entries.filter((e) => (!kind || e.kind === kind) && (!q || lineText(e).includes(q)));
  const counts = Object.fromEntries(KINDS.map(([k]) => [k, current.entries.filter((e) => e.kind === k && (!q || lineText(e).includes(q))).length]));

  return (
    <ChampionProvider data={drawerData} context={PATCH_NOTES}>
      <PageHeader title="Patch Notes" desc={view === "compare" ? <>Riot&apos;s official Summoner&apos;s Rift changes, compared across patches.</>
        : champion ? <>Every recorded change to {names[champion] ?? champion} since {notes.firstPatch}.</>
        : <PatchLine p={current} />} />

      <div className="toolbar pn-tools">
        {view === "patch" && !champion && <>
          <span className="pn-step">
            <button className="icon-btn" aria-label="Previous patch" title={older ? `Patch ${older.patch}` : "No earlier patch"} disabled={!older} onClick={() => older && set("patch", older.patch)}>‹</button>
            <Select label="Patch" value={current.patch} onChange={(v) => set("patch", v === latest.patch ? undefined : v)}
              options={patches.map((p, n) => ({ value: p.patch, label: `${p.patch}${n === 0 ? " (latest)" : ""}` }))} />
            <button className="icon-btn" aria-label="Next patch" title={newer ? `Patch ${newer.patch}` : "Latest patch"} disabled={!newer} onClick={() => newer && set("patch", newer.patch === latest.patch ? undefined : newer.patch)}>›</button>
          </span>
          <nav className="seg" aria-label="Change type">
            <button className={!kind ? "active" : undefined} onClick={() => set("kind", undefined)}>All</button>
            {KINDS.map(([k, l]) => <button key={k} className={kind === k ? "active" : undefined} disabled={!counts[k]} onClick={() => set("kind", k)}>{l} <span className="count">{counts[k]}</span></button>)}
          </nav>
        </>}
        {view === "patch" && (
          <Select label="Champion" value={champion ?? ""} onChange={(v) => set("champion", v || undefined)}
            options={[{ value: "", label: "Any champion" }, ...changedChampions.map((c) => ({ value: c, label: names[c] ?? c }))]} />
        )}
        {view === "patch" && !champion && <input type="search" placeholder="Search changes" aria-label="Search this patch" value={get("q") ?? ""} onChange={(e) => set("q", e.target.value || undefined)} />}
        {view === "compare" && <>
          <Select label="From" showLabel value={range.lo} onChange={(v) => set("from", v)} options={opts} />
          <Select label="To" showLabel value={range.hi} onChange={(v) => set("to", v)} options={opts} />
          {!(range.lo === notes.firstPatch && range.hi === latest.patch) && <button className="btn sm ghost" onClick={() => update({ from: undefined, to: undefined })}>What&apos;s changed since {notes.firstPatch}?</button>}
        </>}
        <span className="pn-modes">
          {view === "patch"
            ? <button className="btn sm" onClick={() => update({ view: "compare", champion: undefined, q: undefined, kind: undefined })}>Compare patches</button>
            : <button className="btn sm" onClick={() => update({ view: undefined, from: undefined, to: undefined })}>Back to {current.patch}</button>}
          {champion && <button className="btn sm ghost" onClick={() => set("champion", undefined)}>Clear champion</button>}
        </span>
      </div>

      {view === "compare" ? <Compare range={range} names={names} />
        : champion ? <History id={champion} patches={patches} names={names} implications={implications} kitReview={kitReview} />
        : (
          <div className="pn-body">
            {KINDS.filter(([k]) => visible.some((e) => e.kind === k)).map(([k, label]) => {
              const list = visible.filter((e) => e.kind === k);
              return (
                <section key={k} className="pn-section" aria-label={label}>
                  <SectionHeader title={label} meta={`${list.length} ${list.length === 1 ? "change" : "changes"}`} />
                  <Grouped kind={k} entries={list} render={(e) => <EntryRow key={e.id} e={e} patch={current} names={names} imp={implications[`${current.patch}/${e.id}`]} kit={kitReview[`${current.patch}/${e.id}`]} />} />
                </section>
              );
            })}
            {!visible.length && <p className="muted small">No change in {current.patch} matches this search.</p>}
            <Disclosure summary="What this page leaves out" meta={`${current.excluded.length} sections${current.bugfixesLeftOut ? `, ${current.bugfixesLeftOut} non-gameplay fixes` : ""}`}>
              <p>Summoner&apos;s Rift drafting changes only. Left out of {current.patch}: {current.excluded.join(", ") || "nothing"}{current.bugfixesLeftOut ? `, and ${current.bugfixesLeftOut} client, cosmetic or other-mode bug fixes` : ""}.</p>
              <p>Values are copied exactly from <a href={current.url} target="_blank" rel="noopener noreferrer">Riot&apos;s patch notes</a>. Buff, nerf and adjustment follow Riot&apos;s stated intent; patches never change saved pairings, pool tiers or recommendations.</p>
              <p className="faint">Checked daily. Riot writes this patch {current.patch}; pro data from the same patch reads {current.short}.</p>
            </Disclosure>
          </div>
        )}
    </ChampionProvider>
  );
}

function PatchLine({ p }: { p: PatchNote }) {
  return (
    <span className="pn-meta">
      <b>Patch {p.patch}</b>
      {p.published && <span>Released {fullDate(p.published)}</span>}
      <span>{p.midPatch.length ? <>Mid-patch: {p.midPatch.map((m) => `${m.title}${m.date ? ` (${shortDate(m.date)})` : ""}`).join("; ")}</> : "No mid-patch updates"}</span>
      <a href={p.url} target="_blank" rel="noopener noreferrer">Riot&apos;s notes</a>
    </span>
  );
}

const fullDate = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

/** Champions grouped Buffs / Nerfs / Adjustments / Reworks; runes and systems by category; items in Riot's order. */
function Grouped({ kind, entries, render }: { kind: Kind; entries: PatchEntry[]; render: (e: PatchEntry) => React.ReactNode }) {
  const order = kind === "champion" ? [...CHAMP_ORDER] : kind === "system" ? SYSTEM_ORDER : kind === "rune" ? RUNE_ORDER : undefined;
  if (!order) return <div className="pn-list">{entries.map(render)}</div>;
  return (
    <>
      {order.filter((c) => entries.some((e) => e.category === c)).map((c) => {
        const list = entries.filter((e) => e.category === c);
        return (
          <Fragment key={c}>
            <h3 className={`pn-cat ${kind === "champion" ? `v-${c}` : ""}`}>{kind === "champion" ? CHAMP_GROUP[c] : CATEGORY_LABEL[c]} <span className="count">{list.length}</span></h3>
            <div className="pn-list">{list.map(render)}</div>
          </Fragment>
        );
      })}
    </>
  );
}

function SubjectIcon({ e, names }: { e: PatchEntry; names: Record<string, string> }) {
  if (e.kind === "champion" && e.ref) return <InteractiveChampion id={e.ref}><ChampIcon id={e.ref} name={names[e.ref] ?? e.subject} size="md" /></InteractiveChampion>;
  if (e.icon && e.kind !== "system") return <Img className="pn-icon" src={e.icon} size={32} fallback={<span className="pn-icon sys" aria-hidden="true">{e.subject.slice(0, 2)}</span>} />;
  return <span className="pn-icon sys" aria-hidden="true">{e.category === "bugfix" ? "fix" : e.subject.slice(0, 2)}</span>;
}

/** A Riot or Data Dragon image that disappears (or shows `fallback`) when it can't load, never a broken-image box. */
function Img({ src, size, className, fallback = null }: { src: string; size: number; className?: string; fallback?: React.ReactNode }) {
  const [failed, setFailed] = useState(false);
  const ref = useRef<HTMLImageElement>(null);
  useEffect(() => { if (ref.current?.complete && ref.current.naturalWidth === 0) setFailed(true); }, [src]);
  if (failed) return <>{fallback}</>;
  return <img ref={ref} className={className} src={src} alt="" loading="lazy" decoding="async" width={size} height={size} onError={() => setFailed(true)} />;
}

function Verdict({ e }: { e: PatchEntry }) {
  if (e.kind === "champion" && e.category)
    return <span className={`pn-verdict v-${e.category}`} title={e.categoryBasis === "reviewed" ? "From Riot's stated intent, reviewed" : "From Riot's stated intent; not reviewed yet"}>{CATEGORY_LABEL[e.category]}</span>;
  const cats = e.categories ?? (e.category ? [e.category] : []);
  return <span className="pn-tags">{cats.map((c) => <span key={c} className="pn-tag">{CATEGORY_LABEL[c] ?? c}</span>)}</span>;
}

export function EntryRow({ e, patch, names, imp, kit, showPatch }: { e: PatchEntry; patch: PatchNote; names: Record<string, string>; imp?: Implications; kit?: KitReviewItem; showPatch?: boolean }) {
  const anyImp = imp && (imp.saved.length || imp.pool.length || imp.pro.length);
  return (
    <article className="pn-entry" id={e.id} data-kind={e.kind}>
      <header className="pn-head">
        <SubjectIcon e={e} names={names} />
        <span className="pn-name">{e.kind === "champion" && e.ref ? names[e.ref] ?? e.subject : titleCase(e.subject)}</span>
        <Verdict e={e} />
        {showPatch && <Link className="pn-patch tnum" href={`/patch-notes/?patch=${patch.patch}#${e.id}`}>{patch.patch}</Link>}
        {e.midPatch && <span className="badge caution" title={e.midPatch.date ? `Mid-patch update, ${e.midPatch.date}` : "Mid-patch update"}>Mid-patch</span>}
        {e.corrected && <span className="badge outline" title="Riot edited this entry after it was first published">Corrected</span>}
        <a className="pn-src" href={`${patch.url}${e.anchor ? `#${e.anchor}` : ""}`} target="_blank" rel="noopener noreferrer" title={`Riot's patch ${patch.patch} notes`}>Riot</a>
      </header>
      <div className="pn-groups">
        {e.groups.map((g, gi) => (
          <div key={gi} className="pn-group">
            {g.title && <span className="pn-ability">{g.icon && <Img src={g.icon} size={18} />}{g.title}</span>}
            <ul className="pn-lines">{g.changes.map((c, ci) => <Line key={ci} c={c} />)}</ul>
          </div>
        ))}
      </div>
      {(e.affects?.length ?? 0) > 0 && e.category !== "bugfix" && (
        <p className="pn-affects xs muted">Affects {e.affects!.length} champions</p>
      )}
      {e.context && <Disclosure className="pn-fold" summary="Riot's note" lazy><p>{e.context}</p></Disclosure>}
      {anyImp ? (
        <Disclosure className="pn-fold pn-imp" summary={<>Draft implications <span className="pn-analysis">analysis</span></>} lazy>
          {imp!.saved.map((t) => <p key={t}><span className="src clash"><span className="ldot" />Synergy</span> {t}</p>)}
          {imp!.pool.length > 0 && <p><span className="src clash"><span className="ldot" />Pool</span> {imp!.pool.join(", ")}. Tiers stay as saved.</p>}
          {imp!.pro.map((t) => <p key={t}><span className="src pro"><span className="ldot" />Pro</span> {t}</p>)}
        </Disclosure>
      ) : null}
      {kit && (
        <Disclosure className="pn-fold pn-imp" summary={<>Kit values to recheck <span className="pn-analysis">analysis</span></>} meta={`${kit.values.length}`} lazy>
          <p><span className="src logic"><span className="ldot" />Logic</span> {[...new Set(kit.flags.flatMap((f) => f.areas))].join(", ")} changed: {kit.flags.slice(0, 3).map((f) => `${f.ability ? `${f.ability}: ` : ""}${f.text}`).join("; ")}{kit.flags.length > 3 ? ` (+${kit.flags.length - 3} more)` : ""}.</p>
          {kit.values.length > 0 && <p>Stored values: {kit.values.map((v) => <span key={v.key} className="nowrap">{v.label} <span className="mono">{v.value}</span>{" "}</span>)}</p>}
          <p className="muted">{kit.suggestion}</p>
        </Disclosure>
      )}
    </article>
  );
}

function Line({ c }: { c: PatchEntry["groups"][number]["changes"][number] }) {
  const tag = c.tag && <span className={`pn-tag t-${c.tag}`}>{c.tag === "new" ? "New" : c.tag === "removed" ? "Removed" : "Updated"}</span>;
  if (c.before != null || c.after != null) return (
    <li title={c.text}>{tag}{c.label && <span className="pn-label">{c.label}</span>}
      <span className="pn-vals"><span className="pn-old">{c.before ?? "—"}</span><span className="pn-arrow" aria-label="changed to">→</span><span className="pn-new">{c.after ?? "—"}</span></span></li>
  );
  if (c.label && c.value) return <li>{tag}<span className="pn-label">{c.label}</span> <span className="pn-text">{c.value}</span></li>;
  return <li>{tag}<span className="pn-text">{c.text}</span></li>;
}

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
const titleCase = (s: string) => (s === s.toUpperCase() ? s.toLowerCase().replace(/(^|\s)\S/g, (m) => m.toUpperCase()) : s);

/** One champion across every archived patch, newest first. */
function History({ id, patches, names, implications, kitReview }: { id: string; patches: PatchNote[]; names: Record<string, string>; implications: Record<string, Implications>; kitReview: Record<string, KitReviewItem> }) {
  const rows = patches.flatMap((p) => p.entries.filter((e) => (e.kind === "champion" && e.ref === id) || (e.kind === "system" && e.affects?.includes(id))).map((e) => ({ p, e })));
  return (
    <div className="pn-body">
      <SectionHeader title={names[id] ?? id} meta={`${rows.length} ${rows.length === 1 ? "change" : "changes"} in ${new Set(rows.map((r) => r.p.patch)).size} patches`} />
      <div className="pn-list">
        {rows.map(({ p, e }) => <EntryRow key={`${p.patch}/${e.id}`} e={e} patch={p} names={names} imp={implications[`${p.patch}/${e.id}`]} kit={kitReview[`${p.patch}/${e.id}`]} showPatch />)}
      </div>
      {!rows.length && <p className="muted small">No recorded change since the archive began.</p>}
    </div>
  );
}

/** The patches after `from` up to `to` (either order), defaulting to everything since the first archived patch. */
function compareRange(patches: PatchNote[], first: string, from?: string, to?: string) {
  const known = (p?: string) => (p && patches.some((x) => x.patch === patchKey(p)) ? patchKey(p) : undefined);
  const a = known(from) ?? first, b = known(to) ?? patches[0]?.patch ?? first;
  const [lo, hi] = comparePatch(a, b) <= 0 ? [a, b] : [b, a];
  return { lo, hi, patches: patches.filter((p) => comparePatch(p.patch, lo) > 0 && comparePatch(p.patch, hi) <= 0) };
}

/** Two patches side by side: what changed after `lo` up to `hi`, by subject. */
function Compare({ range: { lo, hi, patches: range }, names }: { range: ReturnType<typeof compareRange>; names: Record<string, string> }) {
  return (
    <div className="pn-body">
      <p className="xs muted pn-range">{range.length ? `Changes after ${lo}, through ${hi}: ${range.map((p) => p.patch).reverse().join(", ")}.` : "Pick two different patches."}</p>
      {KINDS.map(([k, label]) => {
        const by = new Map<string, { name: string; ref?: string; icon?: string; rows: { p: PatchNote; e: PatchEntry }[] }>();
        for (const p of [...range].reverse()) for (const e of p.entries.filter((x) => x.kind === k)) {
          const key = e.ref ?? e.id;
          if (!by.has(key)) by.set(key, { name: e.kind === "champion" && e.ref ? names[e.ref] ?? e.subject : titleCase(e.subject), ref: e.kind === "champion" ? e.ref : undefined, icon: e.icon, rows: [] });
          by.get(key)!.rows.push({ p, e });
        }
        const subjects = [...by.values()].sort((x, y) => y.rows.length - x.rows.length || x.name.localeCompare(y.name));
        if (!subjects.length) return null;
        return (
          <section key={k} className="pn-section" aria-label={label}>
            <SectionHeader title={label} meta={`${subjects.length} changed`} />
            <div className="table-wrap">
              <table className="pn-compare">
                <thead><tr><th>{label.slice(0, -1)}</th><th>Patches</th><th>Changes</th></tr></thead>
                <tbody>
                  {subjects.map((s) => (
                    <tr key={s.name}>
                      <td className="nowrap">{s.ref ? <InteractiveChampion id={s.ref}><span className="cell-champ"><ChampIcon id={s.ref} name={s.name} size="sm" />{s.name}</span></InteractiveChampion>
                        : <span className="cell-champ">{s.icon && k !== "system" && <Img className="pn-icon sm" src={s.icon} size={24} />}{s.name}</span>}</td>
                      <td><div className="pn-hits">{s.rows.map(({ p, e }) => (
                        <Link key={p.patch + e.id} href={`/patch-notes/?patch=${p.patch}#${e.id}`} className="pn-hit">
                          <span className="tnum">{p.patch}</span>{e.kind === "champion" && e.category && <span className={`pn-verdict v-${e.category}`}>{CATEGORY_LABEL[e.category]}</span>}
                        </Link>
                      ))}</div></td>
                      <td className="wrap">
                        <Disclosure className="pn-fold" summary={plural(s.rows.reduce((n, r) => n + r.e.groups.reduce((m, g) => m + g.changes.length, 0), 0), "line")} lazy>
                          {s.rows.map(({ p, e }) => (
                            <div key={p.patch + e.id} className="pn-cmp-patch">
                              <span className="pn-patch tnum">{p.patch}</span>
                              {e.groups.map((g, gi) => <ul key={gi} className="pn-lines">{g.title && <li className="pn-ability">{g.title}</li>}{g.changes.map((c, ci) => <Line key={ci} c={c} />)}</ul>)}
                            </div>
                          ))}
                        </Disclosure>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
    </div>
  );
}
