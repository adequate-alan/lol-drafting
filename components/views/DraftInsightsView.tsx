"use client";
// Draft Insights (alan, 2026-11-12): drafting lessons from approved creator videos, browsable by category, champion and
// source video, each tied to the moments it comes from. A learning layer only: nothing here changes a recommendation,
// and every claim shows its basis (game mechanic, creator stat with its patch, creator opinion, interpretation).
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ChampionProvider } from "@/components/ChampionInteraction";
import { Disclosure } from "@/components/Disclosure";
import { InteractiveChampion } from "@/components/InteractiveChampion";
import { Select } from "@/components/Select";
import { ChampIcon, PageHeader, SectionHeader } from "@/components/ui";
import type { DrawerData } from "@/lib/data";
import { OTHER } from "@/lib/drawer";
import { BASIS_LABEL, BASIS_TITLE, clock, filterInsights, insightChampions, lessonHref, lessonsOfVideo, momentUrl, statPatches } from "@/lib/draft-insights";
import { shortDate } from "@/lib/evidence";
import type { DraftInsight, DraftInsights } from "@/lib/schema";

const ROLE_WORD: Record<string, string> = { TOP: "Top", JUNGLE: "Jungle", MID: "Mid", BOT: "ADC", SUPPORT: "Support" };

export function DraftInsightsView({ data, names, drawerData }: { data: DraftInsights; names: Record<string, string>; drawerData: DrawerData }) {
  // Filters live in the URL so a view can be shared (as on Patch Notes); Back and Forward replace what is shown.
  const initial = useSearchParams();
  const [params, setParams] = useState(() => new URLSearchParams(initial.toString()));
  const urlQuery = initial.toString();
  useEffect(() => { setParams((p) => (p.toString() === urlQuery ? p : new URLSearchParams(urlQuery))); }, [urlQuery]);
  const get = (k: string) => params.get(k) || undefined;
  const update = (changes: Record<string, string | undefined>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) if (v) next.set(k, v); else next.delete(k);
    setParams(next);
    window.history.replaceState(null, "", `${window.location.pathname}${next.size ? `?${next}` : ""}`);
  };

  const view = get("view") === "videos" ? "videos" : "lessons";
  const category = data.categories.some((c) => c.id === get("category")) ? get("category") : undefined;
  const champion = get("champion");
  const video = get("video") && data.videos[get("video")!] ? get("video") : undefined;
  const lesson = get("lesson");
  const q = get("q");

  const champs = useMemo(() => insightChampions(data).sort((a, b) => (names[a] ?? a).localeCompare(names[b] ?? b)), [data, names]);
  const shown = filterInsights(data, { category, champion, video, q }, names);
  const counts = Object.fromEntries(data.categories.map((c) => [c.id, filterInsights(data, { category: c.id, champion, video, q }, names).length]));
  const filtered = !!(category || champion || video || q);

  // A link to one lesson (?lesson=id, from the Draft Room or Comp Check) opens it and scrolls to it once.
  useEffect(() => {
    if (!lesson) return;
    document.getElementById(`lesson-${lesson}`)?.scrollIntoView({ block: "start" });
  }, [lesson]);

  const videoList = Object.entries(data.videos).sort(([, a], [, b]) => b.uploaded.localeCompare(a.uploaded));
  const creatorOf = (v: string) => data.creators[data.videos[v].creator]?.name ?? data.videos[v].creator;

  return (
    <ChampionProvider data={drawerData} context={OTHER}>
      <PageHeader title="Draft Insights" desc={<>How to think through a draft, from {videoList.length} creator videos, each lesson linked to the moment it comes from. Learning material: it never changes a recommendation.</>} />

      <div className="toolbar pn-tools ins-tools">
        <nav className="seg" aria-label="Browse by">
          <button className={view === "lessons" ? "active" : undefined} aria-pressed={view === "lessons"} onClick={() => update({ view: undefined })}>Lessons <span className="count">{data.insights.length}</span></button>
          <button className={view === "videos" ? "active" : undefined} aria-pressed={view === "videos"} onClick={() => update({ view: "videos", lesson: undefined })}>Videos <span className="count">{videoList.length}</span></button>
        </nav>
        {view === "lessons" && <>
          <Select label="Topic" value={category ?? ""} onChange={(v) => update({ category: v || undefined, lesson: undefined })}
            options={[{ value: "", label: "All topics" }, ...data.categories.map((c) => ({ value: c.id, label: `${c.title} (${counts[c.id]})` }))]} />
          <Select label="Champion" value={champion ?? ""} onChange={(v) => update({ champion: v || undefined, lesson: undefined })}
            options={[{ value: "", label: "Any champion" }, ...champs.map((c) => ({ value: c, label: names[c] ?? c }))]} />
          <Select label="Source" value={video ?? ""} onChange={(v) => update({ video: v || undefined, lesson: undefined })}
            options={[{ value: "", label: "Any video" }, ...videoList.map(([id, v]) => ({ value: id, label: `${v.role ? ROLE_WORD[v.role] : v.title} · ${creatorOf(id)}` }))]} />
          <input type="search" placeholder="Search lessons" aria-label="Search lessons" value={q ?? ""} onChange={(e) => update({ q: e.target.value || undefined, lesson: undefined })} />
          {filtered && <span className="pn-modes"><button className="btn sm ghost" onClick={() => update({ category: undefined, champion: undefined, video: undefined, q: undefined, lesson: undefined })}>Clear filters</button></span>}
        </>}
      </div>

      {view === "videos" ? (
        <div className="ins-videos">
          {videoList.filter(([id]) => !video || id === video).map(([id, v]) => {
            const lessons = lessonsOfVideo(data, id);
            return (
              <section key={id} className="ins-video" id={`video-${id}`} aria-label={v.title}>
                <SectionHeader title={<a href={v.url} target="_blank" rel="noopener noreferrer">{v.title}</a>}
                  meta={<span className="pn-meta"><span>{creatorOf(id)}</span><span>{shortDate(v.uploaded)}</span><span className="num">{clock(v.duration)}</span><span>{v.period}</span></span>} />
                <p className="ins-summary">{v.summary}</p>
                <p className="faint small">{v.audience}</p>
                <h3 className="pn-cat">Lessons from this video <span className="count">{lessons.length}</span></h3>
                <ol className="ins-moments">
                  {lessons.map(({ insight, t }) => (
                    <li key={insight.id}>
                      <a className="num" href={momentUrl(v.url, t)} target="_blank" rel="noopener noreferrer" title="Open the video at this moment">{clock(t)}</a>
                      <Link href={lessonHref(insight.id)} onClick={(e) => { e.preventDefault(); update({ view: undefined, lesson: insight.id, video: undefined }); }}>{insight.title}</Link>
                    </li>
                  ))}
                </ol>
                <Disclosure summary="Chapters" meta={v.chapters.length}>
                  <ol className="ins-moments">
                    {v.chapters.map(([t, label]) => <li key={t}><a className="num" href={momentUrl(v.url, t)} target="_blank" rel="noopener noreferrer">{clock(t)}</a><span>{label}</span></li>)}
                  </ol>
                  {v.skipped && <p className="faint small">Left out: {v.skipped}</p>}
                </Disclosure>
              </section>
            );
          })}
        </div>
      ) : (
        <div className="pn-body">
          {data.categories.filter((c) => shown.some((i) => i.category === c.id)).map((c) => {
            const list = shown.filter((i) => i.category === c.id);
            return (
              <section key={c.id} className="pn-section" aria-label={c.title}>
                <SectionHeader title={c.title} meta={<>{c.blurb} · {list.length} {list.length === 1 ? "lesson" : "lessons"}</>} />
                <div className="ins-list">
                  {list.map((i) => <Lesson key={i.id} i={i} data={data} names={names} open={lesson === i.id} />)}
                </div>
              </section>
            );
          })}
          {!shown.length && <p className="muted small">No lesson matches these filters.</p>}
          <Disclosure summary="How these lessons are made" meta={`reviewed ${shortDate(data.reviewed)}`}>
            <p>Each lesson comes from videos approved for this site, studied from their captions and, where the captions were unclear, the footage. Transcripts are not republished; every lesson links to the moments it comes from.</p>
            <p>Every claim carries its basis: a game mechanic (how an ability works), a creator stat (ranked figures shown in the video, tied to that patch and not checked independently), a creator opinion, or an interpretation of what it means for a draft. Agreement between videos by the same creator is consistency, not independent support.</p>
            <p className="faint">Lessons never feed a score, a ranking, a Synergy, a Counter or a Comp Library entry. Commentary on a specific pro game lives in that game&apos;s Analyst perspectives on Pro Drafts.</p>
          </Disclosure>
        </div>
      )}
    </ChampionProvider>
  );
}

function Lesson({ i, data, names, open }: { i: DraftInsight; data: DraftInsights; names: Record<string, string>; open: boolean }) {
  const patches = statPatches(i);
  return (
    <article className={`pn-entry ins-entry${open ? " pn-target" : ""}`} id={`lesson-${i.id}`}>
      <div className="pn-head">
        <h3 className="pn-name">{i.title}</h3>
        {patches && <span className="badge outline" title="Statistics in this lesson were shown for this patch and may not hold on later ones">Stats · {patches}</span>}
      </div>
      <p className="ins-principle">{i.principle}</p>
      <div className="ins-sources">
        {i.sources.map((s, n) => {
          const v = data.videos[s.video];
          return <a key={n} href={momentUrl(v.url, s.t)} target="_blank" rel="noopener noreferrer" title={`${v.title} at ${clock(s.t)}`}>
            {v.role ? ROLE_WORD[v.role] : "Video"} <span className="num">{clock(s.t)}</span>
          </a>;
        })}
        <span className="faint">{[...new Set(i.sources.map((s) => data.creators[data.videos[s.video].creator]?.name))].join(", ")}</span>
      </div>
      <Disclosure summary="Why, when and limits" open={open} className="ins-more">
        <dl className="ins-dl">
          <dt>Why it matters</dt><dd>{i.why}</dd>
          <dt>{i.example.kind === "video" ? "Example from the video" : "Illustrative example"}</dt><dd>{i.example.text}</dd>
          <dt>When to use it</dt><dd>{i.when}</dd>
          <dt>Limitations</dt><dd>{i.limits}</dd>
          {i.disagreement && <><dt>Where the sources differ</dt><dd>{i.disagreement}</dd></>}
          {i.siteNote && <><dt>In Draft Assistant</dt><dd>{i.siteNote}</dd></>}
        </dl>
        <ul className="ins-claims">
          {i.claims.map((c, n) => (
            <li key={n}><span className={`ins-basis ${c.basis}`} title={BASIS_TITLE[c.basis]}>{BASIS_LABEL[c.basis]}{c.patch ? ` · ${c.patch}` : ""}</span>{c.text}</li>
          ))}
        </ul>
        {(i.related.champions.length > 0 || i.related.tools.length > 0) && (
          <div className="ins-related">
            {i.related.champions.length > 0 && <span className="ins-champs">
              {i.related.champions.map((c) => <InteractiveChampion key={c} id={c}><ChampIcon id={c} name={names[c] ?? c} size="xs" /></InteractiveChampion>)}
            </span>}
            {i.related.tools.map((t) => <Link key={t.href + t.label} href={t.href} className="btn sm ghost">{t.label}</Link>)}
          </div>
        )}
      </Disclosure>
    </article>
  );
}
