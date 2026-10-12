"use client";
// Patch: Riot's official gameplay changes to the champion since a chosen patch. Each change expands to every line
// (ability, previous value, new value), Riot's stated reason and links to the entry and to Riot's article. Facts only:
// drafting reads live on the Patch Notes page, apart from these.
import Link from "next/link";
import { useState } from "react";
import { Select } from "@/components/Select";
import { Section, type DrawerEnv } from "@/components/drawer/parts";
import { patchNotesHref } from "@/lib/drawer";
import { comparePatch } from "@/lib/patch";
import { CATEGORY_LABEL, patchHref, type Change } from "@/lib/patch-changes";

export function PatchTab({ env }: { env: DrawerEnv }) {
  const { id, name, changes, data } = env;
  const index = data.patches;
  const [since, setSince] = useState("");
  const [open, setOpen] = useState<string>();
  const shown = since ? changes.filter((c) => comparePatch(c.patch, since) > 0) : changes;
  const options = [{ value: "", label: `All since ${index.first}` }, ...index.patches.filter((p) => comparePatch(p.patch, index.first) > 0 && p.patch !== index.patches[0]?.patch).map((p) => ({ value: p.patch, label: `After ${p.patch}` })).reverse()];
  const all = patchNotesHref(id);
  const key = (c: Change) => `${c.patch}/${c.id}`;

  return (
    <Section layer="logic" title="Official patch changes" end={<Link className="xs" href={all} data-to={all}>Full history →</Link>} tip="Riot's patch notes, Summoner's Rift only. Values exactly as Riot wrote them.">
      <div className="dw-toolbar">
        <Select label="Since patch" value={since} options={options} onChange={setSince} />
        <span className="xs muted tnum">{shown.length} change{shown.length === 1 ? "" : "s"}</span>
      </div>
      {shown.length ? (
        <div className="dw-rows">
          {shown.map((c) => {
            const isOpen = open === key(c);
            const first = c.lines[0];
            const meta = index.patches.find((p) => p.patch === c.patch);
            return (
              <div key={key(c)} className={`dw-change ${isOpen ? "open" : ""}`.trim()}>
                <button type="button" className="dw-row" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? undefined : key(c))}>
                  <span className="pn-patch tnum">{c.patch}</span>
                  <span className="dw-row-main">
                    <span className="dw-row-name">
                      {c.via ? <span className="pn-tag">{c.category === "bugfix" ? "Bug fix" : c.subject}</span>
                        : <span className={`pn-verdict v-${c.category}`} title={c.reviewed ? "Reviewed by a person" : "From Riot's wording"}>{CATEGORY_LABEL[c.category ?? "adjustment"]}</span>}
                      {c.midPatch && <span className="xs faint"> · mid-patch</span>}
                    </span>
                    {first && !c.via && (
                      <span className="dw-row-sub">{first.label && <span className="pn-label">{first.label}</span>}
                        {first.before != null || first.after != null
                          ? <span className="pn-vals"><span className="pn-old">{first.before ?? "—"}</span><span className="pn-arrow">→</span><span className="pn-new">{first.after ?? "—"}</span></span>
                          : <span className="pn-text">{first.text}</span>}
                        {c.lines.length + c.more > 1 && <span className="faint"> +{c.lines.length + c.more - 1} more</span>}
                      </span>
                    )}
                  </span>
                  <span className="dw-chevron" aria-hidden="true">{isOpen ? "▾" : "▸"}</span>
                </button>
                {isOpen && (
                  <div className="dw-detail">
                    {c.via && <p className="xs muted">{c.subject}: a {c.category === "bugfix" ? "bug fix" : "system change"} that names {name(id)}.</p>}
                    <ul className="dw-lines">
                      {c.lines.filter((l) => !c.via || !/^Affected Champions/i.test(l.label ?? "")).map((l, i) => (
                        <li key={i} className="xs">
                          {l.label && <span className="pn-label">{l.label}</span>}
                          {l.before != null || l.after != null
                            ? <span className="pn-vals"><span className="pn-old">{l.before ?? "—"}</span><span className="pn-arrow">→</span><span className="pn-new">{l.after ?? "—"}</span></span>
                            : <span className="pn-text">{l.text}</span>}
                        </li>
                      ))}
                      {c.more > 0 && <li className="xs faint">+{c.more} more line{c.more > 1 ? "s" : ""} on the Patch Notes page</li>}
                    </ul>
                    {c.context && <p className="xs dw-context"><span className="muted">Riot:</span> {c.context}</p>}
                    <p className="dw-actions xs">
                      <Link href={patchHref(c.patch, c.id)} data-to={patchHref(c.patch, c.id)}>View in Patch Notes</Link>
                      {meta && <a href={meta.url} target="_blank" rel="noopener noreferrer">Riot&apos;s notes ↗</a>}
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : <p className="xs muted">No official change to {name(id)} {since ? `after patch ${since}` : `since patch ${index.first}`}.</p>}
    </Section>
  );
}
