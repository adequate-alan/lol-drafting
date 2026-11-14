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
import { PairingExplorer, type PairState } from "@/components/PairingExplorer";
import { Select } from "@/components/Select";
import { ChampIcon, PageHeader, SectionHeader } from "@/components/ui";
import type { DrawerData, PairingData } from "@/lib/data";
import { OTHER } from "@/lib/drawer";
import { BASIS_LABEL, BASIS_TITLE, championsOf, clock, filterInsights, insightChampions, insightsView, lessonHref, lessonsOfVideo, momentUrl, statPatches } from "@/lib/draft-insights";
import { shortDate } from "@/lib/evidence";
import { explorerHref, LANES, type LaneKey } from "@/lib/pairings";
import type { Champion, DraftInsight, DraftInsights } from "@/lib/schema";

const ROLE_WORD: Record<string, string> = { TOP: "Top", JUNGLE: "Jungle", MID: "Mid", BOT: "ADC", SUPPORT: "Support" };

export function DraftInsightsView({ data, names, drawerData, pairing }: { data: DraftInsights; names: Record<string, string>; drawerData: DrawerData; pairing: PairingData }) {
  // Filters live in the URL so a view can be shared (as on Patch Notes); Back and Forward replace what is shown.
  const initial = useSearchParams();
  const [params, setParams] = useState(() => new URLSearchParams(initial.toString()));
  const urlQuery = initial.toString();
  useEffect(() => { setParams((p) => (p.toString() === urlQuery ? p : new URLSearchParams(urlQuery))); }, [urlQuery]);
  const get = (k: string) => params.get(k) || undefined;
  // Filters replace the entry; moving between Pairings, Concepts and Videos (or from a pair to its lesson and back) is a
  // step in the history, so Back returns to the same pair, comparison or lesson. Every view keeps its own parameters in
  // the URL while another is shown, so nothing is lost by looking something up.
  const update = (changes: Record<string, string | undefined>, step = false) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) if (v) next.set(k, v); else next.delete(k);
    setParams(next);
    window.history[step ? "pushState" : "replaceState"](null, "", `${window.location.pathname}${next.size ? `?${next}` : ""}`);
  };

  const view = insightsView(params);
  // Pairing explorer state, all shareable: the bot lane is ?bot=&support=, the mid + jungle core ?lane=mid-jungle&mid=&jungle=,
  // each with &from=&compare= (comma list). Each pairing keeps its own slots in the URL while the other is shown.
  const lane: LaneKey = get("lane") === "mid-jungle" ? "mid-jungle" : "bot";
  const slotA = LANES[lane].a.toLowerCase(), slotB = LANES[lane].b.toLowerCase();
  const fromParam = get("from");
  const pairState: PairState = {
    a: get(slotA), b: get(slotB), from: fromParam === LANES[lane].a || fromParam === LANES[lane].b ? fromParam : undefined,
    compare: get("compare")?.split(",").filter(Boolean),
  };
  const setPair = (s: PairState) => update({ [slotA]: s.a, [slotB]: s.b, from: s.from, compare: s.compare?.length ? s.compare.join(",") : undefined });
  const category = data.categories.some((c) => c.id === get("category")) ? get("category") : undefined;
  const champion = get("champion");
  const video = get("video") && data.videos[get("video")!] ? get("video") : undefined;
  const lesson = get("lesson");
  const q = get("q");

  const champs = useMemo(() => insightChampions(data).sort((a, b) => (names[a] ?? a).localeCompare(names[b] ?? b)), [data, names]);
  const shown = filterInsights(data, { category, champion, video, q }, names);
  const counts = Object.fromEntries(data.categories.map((c) => [c.id, filterInsights(data, { category: c.id, champion, video, q }, names).length]));
  const filtered = !!(category || champion || video || q);

  // A link to one lesson (?lesson=id, from the Draft Room, Comp Check or a pairing) opens it and scrolls to it.
  useEffect(() => {
    if (!lesson || view !== "lessons") return;
    document.getElementById(`lesson-${lesson}`)?.scrollIntoView({ block: "start" });
  }, [lesson, view]);
  useEffect(() => { if (view !== "lessons") window.scrollTo({ top: 0 }); }, [view]);

  // The pair open in the explorer (either lane), offered as the way back from a lesson.
  const openPair = pairState.a && pairState.b ? `${names[pairState.a] ?? pairState.a} + ${names[pairState.b] ?? pairState.b}` : undefined;
  const byId = useMemo(() => new Map(drawerData.champions.map((c) => [c.id, c])), [drawerData.champions]);
  // Lesson → Pairings: a champion opens as the anchor of its lane, a named duo opens as the pair. In place, as a history step.
  const explore = (lane: LaneKey, a?: string, b?: string, from?: string) =>
    update({ view: "pairings", lane: lane === "bot" ? undefined : lane, bot: undefined, support: undefined, mid: undefined, jungle: undefined,
      [LANES[lane].a.toLowerCase()]: a, [LANES[lane].b.toLowerCase()]: b, from, compare: undefined }, true);
  const openLesson = (id: string) => update({ view: "lessons", lesson: id, category: undefined, champion: undefined, video: undefined, q: undefined }, true);

  const videoList = Object.entries(data.videos).sort(([, a], [, b]) => b.uploaded.localeCompare(a.uploaded));
  const creatorOf = (v: string) => data.creators[data.videos[v].creator]?.name ?? data.videos[v].creator;

  return (
    <ChampionProvider data={drawerData} context={OTHER}>
      <PageHeader title="Draft Insights" desc="Explore champion pairings, learn the concepts behind them and check the source videos. Learning material: it never changes a recommendation." />

      <div className="toolbar pn-tools ins-tools">
        <nav className="seg ins-nav" aria-label="Draft Insights sections">
          <button className={view === "pairings" ? "active" : undefined} aria-current={view === "pairings" ? "page" : undefined} onClick={() => update({ view: "pairings" }, true)}>Explore Pairings</button>
          <button className={view === "lessons" ? "active" : undefined} aria-current={view === "lessons" ? "page" : undefined} onClick={() => update({ view: "lessons" }, true)}>Learn Concepts <span className="count">{data.insights.length}</span></button>
          <button className={view === "videos" ? "active" : undefined} aria-current={view === "videos" ? "page" : undefined} onClick={() => update({ view: "videos" }, true)}>Video Library <span className="count">{videoList.length}</span></button>
        </nav>
        {view === "lessons" && <>
          <Select label="Champion" value={champion ?? ""} onChange={(v) => update({ champion: v || undefined, lesson: undefined })}
            options={[{ value: "", label: "Any champion" }, ...champs.map((c) => ({ value: c, label: names[c] ?? c }))]} />
          <Select label="Source" value={video ?? ""} onChange={(v) => update({ video: v || undefined, lesson: undefined })}
            options={[{ value: "", label: "Any video" }, ...videoList.map(([id, v]) => ({ value: id, label: `${v.role ? ROLE_WORD[v.role] : v.title} · ${creatorOf(id)}` }))]} />
          <input type="search" placeholder="Search lessons" aria-label="Search lessons" value={q ?? ""} onChange={(e) => update({ q: e.target.value || undefined, lesson: undefined })} />
          {filtered && <span className="pn-modes"><button className="btn sm ghost" onClick={() => update({ category: undefined, champion: undefined, video: undefined, q: undefined, lesson: undefined })}>Clear filters</button></span>}
        </>}
        {view !== "pairings" && openPair && <button className="btn sm ins-back" onClick={() => update({ view: "pairings" }, true)} title="Return to the pairing you had open">← Back to {openPair}</button>}
      </div>

      {view === "pairings" ? (
        <div className="ins-pairings">
          <div className="ins-px-head">
            <div>
              <h2>Find the right champion pairing</h2>
              <p className="muted small">Explore partners, compare plans and see what professionals have played. Saved preferences, pro evidence and kit analysis stay apart.</p>
            </div>
            <span className="seg" role="group" aria-label="Pairing">
              <button className={lane === "bot" ? "active" : undefined} aria-pressed={lane === "bot"} onClick={() => update({ lane: undefined, from: undefined, compare: undefined })}>Bot + Support</button>
              <button className={lane === "mid-jungle" ? "active" : undefined} aria-pressed={lane === "mid-jungle"} onClick={() => update({ lane: "mid-jungle", from: undefined, compare: undefined })}>Mid + Jungle</button>
            </span>
          </div>
          <PairingExplorer key={lane} lane={lane} data={pairing} champions={drawerData.champions} botPairings={drawerData.botPairings} midJungle={drawerData.midJungle} proposed={drawerData.proposed} names={names}
            state={pairState} onChange={setPair} onLesson={openLesson} context="insights" />
        </div>
      ) : view === "videos" ? (
        <div className="ins-videos">
          <p className="muted small ins-lead">The source material behind the lessons: {videoList.length} approved guides. Each lesson links back to the moment it comes from.</p>
          {videoList.filter(([id]) => !video || id === video).map(([id, v]) => {
            const lessons = lessonsOfVideo(data, id);
            return (
              <section key={id} className="ins-video" id={`video-${id}`} aria-label={v.title}>
                <header className="ins-video-head">
                  <h2><a href={v.url} target="_blank" rel="noopener noreferrer">{v.title}</a></h2>
                  <p className="pn-meta small">
                    {v.role && <span className="badge outline">{ROLE_WORD[v.role]}</span>}
                    <span>{creatorOf(id)}</span><span>{v.period}</span><span>{shortDate(v.uploaded)}</span><span className="num">{clock(v.duration)}</span>
                    <span>{lessons.length} {lessons.length === 1 ? "lesson" : "lessons"}</span>
                  </p>
                </header>
                <p className="ins-summary">{v.summary}</p>
                <p className="ins-video-actions">
                  <a className="btn sm" href={v.url} target="_blank" rel="noopener noreferrer">Watch on YouTube ↗</a>
                  <button className="btn sm ghost" onClick={() => update({ view: "lessons", video: id, lesson: undefined, category: undefined, champion: undefined, q: undefined }, true)}>Read its {lessons.length} lessons</button>
                </p>
                <h3 className="pn-cat">Concepts by timestamp <span className="count">{lessons.length}</span></h3>
                <ol className="ins-moments">
                  {lessons.map(({ insight, t }) => (
                    <li key={insight.id}>
                      <a className="num" href={momentUrl(v.url, t)} target="_blank" rel="noopener noreferrer" title="Open the video at this moment">{clock(t)}</a>
                      <Link href={lessonHref(insight.id)} onClick={(e) => { e.preventDefault(); update({ view: "lessons", lesson: insight.id, video: id }, true); }}>{insight.title}</Link>
                    </li>
                  ))}
                </ol>
                <Disclosure summary="Chapters" meta={v.chapters.length}>
                  <ol className="ins-moments">
                    {v.chapters.map(([t, label]) => <li key={t}><a className="num" href={momentUrl(v.url, t)} target="_blank" rel="noopener noreferrer">{clock(t)}</a><span>{label}</span></li>)}
                  </ol>
                  <p className="faint small">{v.audience}</p>
                  {v.skipped && <p className="faint small">Left out: {v.skipped}</p>}
                </Disclosure>
              </section>
            );
          })}
        </div>
      ) : (
        <div className="ins-main">
          {!video && (
            <nav className="ins-topics" aria-label="Topics">
              <button className={!category ? "active" : undefined} aria-pressed={!category} onClick={() => update({ category: undefined, lesson: undefined })}>All topics <span className="count">{filterInsights(data, { champion, q }, names).length}</span></button>
              {data.categories.map((c) => (
                <button key={c.id} className={category === c.id ? "active" : undefined} aria-pressed={category === c.id} disabled={!counts[c.id]} title={c.blurb}
                  onClick={() => update({ category: category === c.id ? undefined : c.id, lesson: undefined })}>{c.title} <span className="count">{counts[c.id]}</span></button>
              ))}
            </nav>
          )}
          {video && <VideoIntro id={video} data={data} shown={shown} creator={creatorOf(video)} />}
          {video ? (
            // One video: its lessons in the order the video teaches them, not under topic headings.
            <div className="ins-list">
              {lessonsOfVideo(data, video).filter(({ insight }) => shown.includes(insight)).map(({ insight }) =>
                <Lesson key={insight.id} i={insight} data={data} names={names} byId={byId} explore={explore} open={lesson === insight.id} topic={data.categories.find((c) => c.id === insight.category)?.title} />)}
            </div>
          ) : data.categories.filter((c) => shown.some((i) => i.category === c.id)).map((c) => {
            const list = shown.filter((i) => i.category === c.id);
            return (
              <section key={c.id} className="pn-section" id={`topic-${c.id}`} aria-label={c.title}>
                <SectionHeader title={c.title} meta={c.blurb} />
                <div className="ins-list">
                  {list.map((i) => <Lesson key={i.id} i={i} data={data} names={names} byId={byId} explore={explore} open={lesson === i.id} />)}
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

type Explore = (lane: LaneKey, a?: string, b?: string, from?: string) => void;

/** The lane a champion anchors in the Pairing Explorer, from its main role; none for a top laner. */
function anchorOf(c?: Champion): { lane: LaneKey; role: "BOT" | "SUPPORT" | "MID" | "JUNGLE" } | undefined {
  const r = c && !c.rosterOnly ? c.roles[0] : undefined;
  return r === "BOT" || r === "SUPPORT" ? { lane: "bot", role: r } : r === "MID" || r === "JUNGLE" ? { lane: "mid-jungle", role: r } : undefined;
}
/** Two champions as a pair of one lane ([first slot, second slot]), when their roles make one. */
function duoOf(ids: string[], byId: Map<string, Champion>, prefer: LaneKey): { lane: LaneKey; a: string; b: string } | undefined {
  if (ids.length !== 2) return undefined;
  const plays = (id: string, r: string) => !!byId.get(id)?.roles.includes(r as Champion["roles"][number]);
  for (const lane of prefer === "bot" ? (["bot", "mid-jungle"] as const) : (["mid-jungle", "bot"] as const)) {
    const { a: RA, b: RB } = LANES[lane];
    if (plays(ids[0], RA) && plays(ids[1], RB)) return { lane, a: ids[0], b: ids[1] };
    if (plays(ids[1], RA) && plays(ids[0], RB)) return { lane, a: ids[1], b: ids[0] };
  }
  return undefined;
}

// One lesson (alan, 2026-11-14): a compact row (title, the one-line takeaway, the champions it names) that opens into its
// visual, when to use it, the full explanation and its sources. A linked lesson arrives open.
function Lesson({ i, data, names, byId, explore, open, topic }: { i: DraftInsight; data: DraftInsights; names: Record<string, string>; byId: Map<string, Champion>; explore: Explore; open: boolean; topic?: string }) {
  const patches = statPatches(i);
  const creators = [...new Set(i.sources.map((s) => data.creators[data.videos[s.video].creator]?.name))].join(", ");
  const [expanded, setExpanded] = useState(open);
  useEffect(() => { if (open) setExpanded(true); }, [open]);
  const champs = championsOf(i);
  const anchors = champs.filter((c) => anchorOf(byId.get(c))).slice(0, 6);
  const prefer: LaneKey = i.category === "bot-duo" || i.id === "adc-archetypes" || i.id === "support-types" ? "bot" : "mid-jungle";
  return (
    <article className={`pn-entry ins-entry${open ? " pn-target" : ""}${expanded ? " open" : ""}`} id={`lesson-${i.id}`}>
      <button type="button" className="ins-row" aria-expanded={expanded} aria-controls={`lesson-body-${i.id}`} onClick={() => setExpanded((x) => !x)}>
        <span className="ins-row-text">
          <span className="pn-head">
            <h3 className="pn-name">{i.title}</h3>
            {topic && <span className="faint small">{topic}</span>}
            {patches && <span className="badge outline" title="Statistics in this lesson were shown for this patch and may not hold on later ones">Stats · {patches}</span>}
          </span>
          <span className="ins-takeaway">{i.takeaway}</span>
        </span>
        {champs.length > 0 && (
          <span className="ins-strip" aria-hidden="true">
            {champs.slice(0, 6).map((c) => <ChampIcon key={c} id={c} name={names[c] ?? c} size="sm" />)}
            {champs.length > 6 && <span className="faint xs tnum">+{champs.length - 6}</span>}
          </span>
        )}
        <span className="ins-chev" aria-hidden="true">{expanded ? "−" : "+"}</span>
      </button>

      {expanded && <div className="ins-body" id={`lesson-body-${i.id}`}>
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
          {i.matchups.map((m, n) => {
            const duo = m.kind !== "versus" ? duoOf(m.a, byId, prefer) : undefined;
            return (
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
              <p className="ins-mmeta">{m.stat && <span className="ins-stat" title="Creator-reported ranked figure for this example and patch; not a prediction">{m.stat.text} · {m.stat.patch}</span>}<Moment data={data} s={m.source} />
                {duo && <Link className="xs" href={explorerHref(duo.a, duo.b, undefined, duo.lane)} onClick={(e) => { e.preventDefault(); explore(duo.lane, duo.a, duo.b); }}>Explore this pair →</Link>}</p>
            </li>
            );
          })}
        </ul>
      )}

      {i.showcase && <div className="ins-portraits">{i.showcase.map((c) => <Portrait key={c} id={c} names={names} />)}</div>}

      <dl className="ins-glance">
        <dt>Use it when</dt><dd>{i.when}</dd>
        <dt>Caveat</dt><dd>{i.caveat}</dd>
      </dl>
      {anchors.length > 0 && (
        <p className="ins-try">
          <span className="label">Try it in Pairings</span>
          {anchors.map((c) => {
            const at = anchorOf(byId.get(c))!;
            const [a, b] = at.role === LANES[at.lane].a ? [c, undefined] : [undefined, c];
            return (
              <Link key={c} className="ins-try-champ" href={explorerHref(a, b, undefined, at.lane)} onClick={(e) => { e.preventDefault(); explore(at.lane, a, b, at.role); }} title={`Explore partners for ${names[c] ?? c}`}>
                <ChampIcon id={c} name={names[c] ?? c} size="sm" />{names[c] ?? c}
              </Link>
            );
          })}
        </p>
      )}

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
      </div>}
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
