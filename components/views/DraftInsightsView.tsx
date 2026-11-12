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
                      <Link href={lessonHref(insight.id)} onClick={(e) => { e.preventDefault(); update({ view: undefined, lesson: insight.id, video: id }); }}>{insight.title}</Link>
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
        <div className="ins-layout">
          <div className="ins-main">
            {video && <VideoIntro id={video} data={data} shown={shown} creator={creatorOf(video)} />}
            {video ? (
              // One video: its lessons in the order the video teaches them, not under topic headings.
              <div className="ins-list">
                {lessonsOfVideo(data, video).filter(({ insight }) => shown.includes(insight)).map(({ insight }) =>
                  <Lesson key={insight.id} i={insight} data={data} names={names} open={lesson === insight.id} topic={data.categories.find((c) => c.id === insight.category)?.title} />)}
              </div>
            ) : data.categories.filter((c) => shown.some((i) => i.category === c.id)).map((c) => {
              const list = shown.filter((i) => i.category === c.id);
              return (
                <section key={c.id} className="pn-section" id={`topic-${c.id}`} aria-label={c.title}>
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
              <p>Every claim carries its basis: a game mechanic (how an ability works), a creator stat (ranked figures shown in the video, tied to that patch and not checked independently), a creator opinion, or an interpretation of what it means for a draft. Champion groups and matchups show the champions the video uses for that point. Agreement between videos by the same creator is consistency, not independent support.</p>
              <p className="faint">Lessons never feed a score, a ranking, a Synergy, a Counter or a Comp Library entry. Commentary on a specific pro game lives in that game&apos;s Analyst perspectives on Pro Drafts.</p>
            </Disclosure>
          </div>
          {!video && shown.length > 3 && (
            <nav className="ins-index" aria-label="Lessons on this page">
              {data.categories.filter((c) => shown.some((i) => i.category === c.id)).map((c) => (
                <div key={c.id}>
                  <a className="ins-index-topic" href={`#topic-${c.id}`}>{c.title}</a>
                  <ol>{shown.filter((i) => i.category === c.id).map((i) => <li key={i.id}><a href={`#lesson-${i.id}`}>{i.title}</a></li>)}</ol>
                </div>
              ))}
            </nav>
          )}
        </div>
      )}
    </ChampionProvider>
  );
}

/** A champion portrait with its name, opening the champion drawer (hover card on desktop). */
function Portrait({ id, names, size = "md" }: { id: string; names: Record<string, string>; size?: "md" | "ml" }) {
  const name = names[id] ?? id;
  return (
    <InteractiveChampion id={id} className="ins-portrait">
      <ChampIcon id={id} name={name} size={size} /><span className="ins-pname">{name}</span>
    </InteractiveChampion>
  );
}

function Moment({ data, s, label }: { data: DraftInsights; s: { video: string; t: number }; label?: string }) {
  const v = data.videos[s.video];
  return <a className="ins-moment num" href={momentUrl(v.url, s.t)} target="_blank" rel="noopener noreferrer" title={`${v.title} at ${clock(s.t)}`}>{label ?? `${v.role ? ROLE_WORD[v.role] : "Video"} ${clock(s.t)}`}</a>;
}

function VideoIntro({ id, data, shown, creator }: { id: string; data: DraftInsights; shown: DraftInsight[]; creator: string }) {
  const v = data.videos[id];
  const lessons = lessonsOfVideo(data, id).filter(({ insight }) => shown.includes(insight));
  return (
    <section className="ins-intro" aria-label="About this video">
      <h2><a href={v.url} target="_blank" rel="noopener noreferrer">{v.title}</a></h2>
      <p className="pn-meta faint small"><span>{creator}</span><span>{shortDate(v.uploaded)}</span><span className="num">{clock(v.duration)}</span><span>{v.period}</span></p>
      <p className="ins-summary">{v.summary}</p>
      <h3 className="label">What you&apos;ll learn</h3>
      <ol className="ins-learn-list">
        {lessons.map(({ insight, t }) => <li key={insight.id}><a href={`#lesson-${insight.id}`}>{insight.title}</a> <Moment data={data} s={{ video: id, t }} label={clock(t)} /></li>)}
      </ol>
    </section>
  );
}

function Lesson({ i, data, names, open, topic }: { i: DraftInsight; data: DraftInsights; names: Record<string, string>; open: boolean; topic?: string }) {
  const patches = statPatches(i);
  const creators = [...new Set(i.sources.map((s) => data.creators[data.videos[s.video].creator]?.name))].join(", ");
  return (
    <article className={`pn-entry ins-entry${open ? " pn-target" : ""}`} id={`lesson-${i.id}`}>
      <div className="pn-head">
        <h3 className="pn-name">{i.title}</h3>
        {topic && <span className="faint small">{topic}</span>}
        {patches && <span className="badge outline" title="Statistics in this lesson were shown for this patch and may not hold on later ones">Stats · {patches}</span>}
      </div>
      <p className="ins-takeaway">{i.takeaway}</p>

      {i.groups && (
        <div className="ins-groups">
          {i.groups.map((g) => (
            <section key={g.label} className="ins-group" aria-label={g.label}>
              <h4>{g.label} <Moment data={data} s={g.source} label={clock(g.source.t)} /></h4>
              <div className="ins-portraits">{g.champions.map((c) => <Portrait key={c} id={c} names={names} />)}</div>
              <p><b>Plan</b> {g.plan}</p>
              <p className="muted"><b>Against others</b> {g.vs}</p>
              {g.note && <p className="faint small">{g.note}</p>}
            </section>
          ))}
        </div>
      )}

      {i.matchups && (
        <ul className="ins-matchups">
          {i.matchups.map((m, n) => (
            <li key={n} className={`ins-matchup${m.kind === "versus" && m.a.length + m.b.length > 2 ? " wide" : ""}`}>
              {m.kind === "versus" ? (
                <div className="ins-vs">
                  <Side ids={m.a} label={m.aLabel} edge={m.edge === "a"} names={names} />
                  <span className="ins-vs-mark" aria-hidden="true">vs</span>
                  <Side ids={m.b} label={m.bLabel} edge={m.edge === "b"} names={names} />
                </div>
              ) : (
                <div className="ins-vs">
                  <span className="ins-side"><span className="ins-portraits">{m.a.map((c) => <Portrait key={c} id={c} names={names} />)}</span></span>
                  <span className={`ins-fit ${m.fit}`}>{m.fit === "fits" ? "Same plan" : "Clashing plans"}</span>
                </div>
              )}
              <p className="ins-mtext">{m.text}</p>
              <p className="ins-mmeta">{m.stat && <span className="ins-stat" title="Creator-reported ranked figure for this example and patch; not a prediction">{m.stat.text} · {m.stat.patch}</span>}<Moment data={data} s={m.source} /></p>
            </li>
          ))}
        </ul>
      )}

      {i.showcase && <div className="ins-portraits">{i.showcase.map((c) => <Portrait key={c} id={c} names={names} />)}</div>}

      <dl className="ins-glance">
        <dt>Use it when</dt><dd>{i.when}</dd>
        <dt>Caveat</dt><dd>{i.caveat}</dd>
      </dl>

      <Disclosure summary="Explanation, evidence and sources" open={open} className="ins-more">
        <dl className="ins-dl">
          <dt>The principle</dt><dd>{i.principle}</dd>
          <dt>Why it works</dt><dd>{i.why}</dd>
          <dt>{i.example.kind === "video" ? "Example from the video" : "Illustrative example"}</dt><dd>{i.example.text}</dd>
          <dt>Limitations</dt><dd>{i.limits}</dd>
          {i.disagreement && <><dt>Where the sources differ</dt><dd>{i.disagreement}</dd></>}
          {i.siteNote && <><dt>In Draft Assistant</dt><dd>{i.siteNote}</dd></>}
        </dl>
        <ul className="ins-claims">
          {i.claims.map((c, n) => (
            <li key={n}><span className={`ins-basis ${c.basis}`} title={BASIS_TITLE[c.basis]}>{BASIS_LABEL[c.basis]}{c.patch ? ` · ${c.patch}` : ""}</span>{c.text}</li>
          ))}
        </ul>
        {i.related.tools.length > 0 && (
          <div className="ins-related">{i.related.tools.map((t) => <Link key={t.href + t.label} href={t.href} className="btn sm ghost">{t.label}</Link>)}</div>
        )}
      </Disclosure>
      <div className="ins-sources">
        <span className="faint">{creators}</span>
        {i.sources.map((s, n) => <Moment key={n} data={data} s={s} />)}
      </div>
    </article>
  );
}

function Side({ ids, label, edge, names }: { ids: string[]; label?: string; edge: boolean; names: Record<string, string> }) {
  return (
    <span className={`ins-side${edge ? " edge" : ""}`}>
      <span className="ins-portraits">{ids.map((c) => <Portrait key={c} id={c} names={names} />)}</span>
      {(label || edge) && <span className="ins-side-label" title={edge ? "The side this example from the video favours; not a prediction for every game" : undefined}>{label}{label && edge ? " · " : ""}{edge ? "Favoured" : ""}</span>}
    </span>
  );
}
