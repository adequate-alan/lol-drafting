"use client";
// Pairing Explorer (alan, 2026-11-13): choose an ADC or a support by portrait, see its partners in three groups that are
// never merged (alan's saved Synergy, observed pro pairings that are not saved, kit-based proposals), open one pair into
// its lane plan, interactions, strengths, weaknesses, power curve, recorded games and creator lessons, and compare two
// partners side by side. One component for Draft Insights and Synergies, reading the shared layer in lib/pairings.ts.
// Nothing here scores, orders by a score, locks a champion or changes a saved record; "Use in Draft Room" is the one
// deliberate way into the room, and it keeps every other pick on the board.
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChampIcon } from "./ChampIcon";
import { Disclosure } from "./Disclosure";
import { InteractiveChampion } from "./InteractiveChampion";
import { ProposedTag } from "./ProposedSynergy";
import { draftHref, proDraftHref, synergiesHref } from "@/lib/drawer";
import { localStore, readBoard, withPair, writeBoard } from "@/lib/draft-persist";
import { scrollBehavior } from "@/lib/motion";
import { lessonHref, clock, momentUrl } from "@/lib/draft-insights";
import { shortDate } from "@/lib/evidence";
import { patchLabel } from "@/lib/patch";
import {
  kitsById, LANES, laneOf, noteFor, PAIR_FEW_TEAMS, pairLessons, pairRead, partnerOptions, partnerRoleOf, SAVED_LABEL, savedPair, evidenceOf,
  type DuoRead, type DuoRole, type LaneKey, type PairEvidence, type PairLesson, type PartnerOption, type SavedRecords,
} from "@/lib/pairings";
import { stageLabel } from "@/lib/pro-games";
import { topMatchupsHref } from "@/lib/top-matchups";
import { CONFIDENCE_LABEL, proposedLink } from "@/lib/proposed";
import type { BotPairing, Champion, MidJunglePairing, PairingNote, ProposedRecord, TopPick } from "@/lib/schema";
import type { PairingData } from "@/lib/data";

type Names = Record<string, string>;
const ROLE_WORD: Record<DuoRole, string> = { BOT: "ADC", SUPPORT: "Support", MID: "Mid", JUNGLE: "Jungler", TOP: "Top" };
const ROLE_PLURAL: Record<DuoRole, string> = { BOT: "ADCs", SUPPORT: "supports", MID: "mids", JUNGLE: "junglers", TOP: "tops" };
const ROLE_ONE: Record<DuoRole, string> = { BOT: "an ADC", SUPPORT: "a support", MID: "a mid", JUNGLE: "a jungler", TOP: "a top laner" };
const ROLE_AT: Record<DuoRole, string> = { BOT: "at bot", SUPPORT: "at support", MID: "at mid", JUNGLE: "in the jungle", TOP: "at top" };
const LANE_LABEL: Record<LaneKey, string> = { bot: "Bot lane pair", "mid-jungle": "Mid and jungle pair", "top-jungle": "Top and jungle pair" };
const FIT_TITLE = {
  shared: "The two kits want the same plan (General Draft Logic from the stored kit values)",
  split: "The two kits want different things: playable, but one of them adapts. Not a verdict on the pair.",
  neutral: "Neither the same plan nor a clash: depends on how it is played",
} as const;

/** `a` is the lane's first slot (ADC or mid), `b` its partner slot (support or jungler). */
export interface PairState { a?: string; b?: string; from?: DuoRole; compare?: string[] }

export function PairingExplorer({ data, champions, botPairings, midJungle, topPicks, proposed, names, state, onChange, onLesson, fixed, context, lane: laneProp }: {
  data: PairingData; champions: Champion[]; botPairings: BotPairing[]; midJungle?: MidJunglePairing[]; topPicks?: TopPick[]; proposed: ProposedRecord[]; names: Names;
  state: PairState; onChange: (s: PairState) => void;
  /** Draft Insights: a lesson opens in place (the pair stays in the URL); elsewhere a lesson is a plain link. */
  onLesson?: (id: string) => void;
  /** Synergies: the champion chosen in the page's rail is the anchor and is not changed here. */
  fixed?: { id: string; role: DuoRole };
  context: "insights" | "synergies";
  /** Which pairing: the bot lane (default), the mid + jungle core or top + jungle. A fixed anchor decides it. */
  lane?: LaneKey;
}) {
  const lane: LaneKey = fixed ? laneOf(fixed.role) : laneProp ?? "bot";
  const RA = LANES[lane].a, RB = LANES[lane].b;
  const savedRecords: SavedRecords = useMemo(() => ({ botPairings, midJungle, topPicks }), [botPairings, midJungle, topPicks]);
  const kits = useMemo(() => kitsById(champions), [champions]);
  const byId = useMemo(() => new Map(champions.map((c) => [c.id, c])), [champions]);
  const playable = (id: string, role: DuoRole) => !!byId.get(id)?.roles.includes(role) && !byId.get(id)?.rosterOnly;
  const nm = (id: string) => names[id] ?? id;

  const a = fixed?.role === RA ? fixed.id : state.a;
  const b = fixed?.role === RB ? fixed.id : state.b;
  const from: DuoRole = fixed?.role ?? (state.from === RA || state.from === RB ? state.from : a || !b ? RA : RB);
  const anchor = from === RA ? a : b;
  const partner = from === RA ? b : a;
  // The picker opens only when a slot is clicked (alan, 2026-11-14): the page never starts on a wall of portraits.
  const [picking, setPicking] = useState<DuoRole | undefined>(undefined);
  // Draft Insights lays the explorer out as a workspace: choosing on the left, the open pair on the right.
  const split = context === "insights";
  const set = (s: Partial<PairState>) => onChange({ ...state, ...s });
  const key = (r: DuoRole) => (r === RA ? "a" : "b");

  const groups = useMemo(() => anchor ? partnerOptions({ id: anchor, role: from, lane }, { ...savedRecords, proposed, rows: data.rows, playable, newestPatch: data.newestPatch }) : undefined,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [anchor, from, lane, savedRecords, proposed, data]);
  const readOf = (x?: string, y?: string) => (x && y ? pairRead(lane, kits.get(x), kits.get(y), { a: nm(x), b: nm(y) }) : undefined);
  const pairOf = (p: string) => (from === RA ? [anchor!, p] : [p, anchor!]) as [string, string];
  const compare = (state.compare ?? []).filter((id) => id !== anchor).slice(0, 2);

  // Choosing a champion in a slot: the other slot stays; the list follows the slot that was just chosen when the other is
  // empty, otherwise it keeps listing partners of the same anchor.
  const choose = (role: DuoRole, id: string) => {
    setPicking(undefined);
    const next: PairState = { ...state, [key(role)]: id };
    const other = role === RA ? next.b : next.a;
    if (!other) next.from = role;
    if ((next.from ?? RA) === role) next.compare = [];
    onChange(next);
  };
  const pickPartner = (id: string) => {
    set({ [from === RA ? "b" : "a"]: partner === id ? undefined : id });
    // Where the panels stack (tablet, phone), the opened pair is below the lists: bring it into view.
    if (split && partner !== id && typeof window !== "undefined" && !window.matchMedia("(min-width: 1100px)").matches)
      requestAnimationFrame(() => requestAnimationFrame(() => document.getElementById("px-detail")?.scrollIntoView({ behavior: scrollBehavior(), block: "start" })));
  };
  const quick = useMemo(() => (split && !anchor ? quickStart(lane, savedRecords, data) : undefined), [split, anchor, lane, savedRecords, data]);
  const toggleCompare = (id: string) => {
    const cur = compare.includes(id) ? compare.filter((x) => x !== id) : [...compare, id].slice(-2);
    set({ compare: cur });
  };
  const anchorHasRecord = !!anchor && (lane === "bot" ? from === "BOT" && botPairings.some((r) => r.champion === anchor) : false);

  const groupProps = { names, from, lane, partner, compare, pickPartner, toggleCompare, readOf, pairOf };
  const slots = (
    <div className="px-slots" role="group" aria-label={LANE_LABEL[lane]}>
      {([RA, RB] as const).map((r, i) => {
        const id = r === RA ? a : b;
        const locked = fixed?.role === r;
        return (
          <div key={r} className="px-slot-wrap">
            {i === 1 && <span className="px-plus" aria-hidden="true">+</span>}
            <button type="button" className={`px-slot${picking === r ? " active" : ""}${from === r && id ? " anchor" : ""}`} disabled={locked}
              aria-expanded={locked ? undefined : picking === r} onClick={() => setPicking(picking === r ? undefined : r)}
              title={locked ? `${nm(id!)} is chosen in the list on the left` : id ? `Change the ${ROLE_WORD[r].toLowerCase()}` : `Choose ${ROLE_ONE[r]}`}>
              {id ? <ChampIcon id={id} name={nm(id)} role={r} size="lg" /> : <span className="px-empty" aria-hidden="true" />}
              <span className="px-slot-text">
                <span className="px-role">{ROLE_WORD[r]}</span>
                <span className="px-name">{id ? nm(id) : `Choose ${ROLE_ONE[r]}`}</span>
              </span>
            </button>
            {id && !locked && <button type="button" className="px-clear" aria-label={`Clear ${ROLE_WORD[r]}`} title="Clear" onClick={() => onChange({ ...state, [key(r)]: undefined, from: r === from ? partnerRoleOf(r, lane) : from, compare: r === from ? [] : state.compare })}>×</button>}
          </div>
        );
      })}
      {a && b && !fixed && (
        <span className="px-from seg" role="group" aria-label="List partners of">
          <button type="button" className={from === RA ? "active" : undefined} aria-pressed={from === RA} onClick={() => set({ from: RA, compare: [] })}>{cap(ROLE_PLURAL[RB])} for {nm(a)}</button>
          <button type="button" className={from === RB ? "active" : undefined} aria-pressed={from === RB} onClick={() => set({ from: RB, compare: [] })}>{cap(ROLE_PLURAL[RA])} for {nm(b)}</button>
        </span>
      )}
    </div>
  );
  const picker = picking && (picking === RA || picking === RB) && <Picker role={picking} lane={lane} champions={champions} saved={savedRecords} data={data} names={names} current={picking === RA ? a : b}
    taken={picking === RA ? b : a} onPick={(id) => choose(picking, id)} onClose={() => setPicking(undefined)} />;
  const lists = anchor && groups && (
    <div className="px-groups">
      <Group title="Saved preferences" layer="clash" list={groups.saved} empty={from === "SUPPORT" ? `No saved bot record lists ${nm(anchor)}.` : lane === "top-jungle" && from === "JUNGLE" ? `No saved top record lists ${nm(anchor)}.` : `No saved ${ROLE_PLURAL[partnerRoleOf(from, lane)]} for ${nm(anchor)}.`}
        note={lane === "mid-jungle" ? `${nm(anchor)}'s own saved ${ROLE_PLURAL[partnerRoleOf(from, lane)]} first, then the ${ROLE_PLURAL[partnerRoleOf(from, lane)]} whose saved record lists ${nm(anchor)}.`
          : lane === "top-jungle" ? (from === "TOP" ? `The junglers on ${nm(anchor)}'s saved top record, in its order.` : `Tops whose saved record lists ${nm(anchor)} as a jungler.`) : undefined}
        {...groupProps} />
      <Group title="Observed in pro games, not saved" layer="pro" list={groups.observed} empty="No other recorded pairing." collapse={split ? 4 : 6}
        note="Recorded together in pro games. An observed pairing is not a recommendation." {...groupProps} />
      <Group title="Other kit-compatible options" layer="proposed" list={groups.proposed} empty="No kit-based proposal beyond the lists above." collapse={split ? 4 : 6}
        note={anchorHasRecord ? `Proposed from the kits; ${nm(anchor)}'s saved record still decides the Draft Room's supports.` : "Proposed from the kits, not saved."}
        {...groupProps} />
    </div>
  );
  const comparison = anchor && compare.length === 2 && (
    <Compare a={pairOf(compare[0])} b={pairOf(compare[1])} anchorRole={from} lane={lane} names={names} data={data} saved={savedRecords} proposed={proposed} readOf={readOf}
      onClose={() => set({ compare: [] })} onOpen={(id) => pickPartner(id)} onLesson={onLesson} />
  );
  const detail = a && b && (
    <PairDetail a={a} b={b} lane={lane} names={names} data={data} saved={savedRecords} proposed={proposed} read={readOf(a, b)}
      note={noteFor(data.notes, a, b, lane)} context={context} comparing={compare} fixedRole={fixed?.role} onLesson={onLesson}
      onCompareSaved={(role, ids) => {
        // An unsaved pair beside the saved preferred one: both as partners of the same champion, side by side.
        set({ from: role, compare: ids });
        requestAnimationFrame(() => document.getElementById("px-compare")?.scrollIntoView({ behavior: scrollBehavior(), block: "nearest" }));
      }} />
  );

  if (!split) return (
    <div className="px">
      {slots}
      {picker}
      {!anchor && !picking && <p className="muted small">Choose {ROLE_ONE[RA]} or {ROLE_ONE[RB]} to see who pairs with them, why, and which pro teams played it.</p>}
      {lists}
      {comparison}
      {detail}
    </div>
  );

  // Nothing chosen yet: one centred start, the two slots and a few pairs to begin from.
  if (!anchor) return (
    <div className="px px-start">
      {slots}
      {picker}
      {!picking && quick && (
        <div className="px-quick">
          {quick.map((q) => q.pairs.length > 0 && (
            <section key={q.title} aria-label={q.title}>
              <h3 className="label" title={q.hint}>{q.title} <span className="faint">· {q.sub}</span></h3>
              <ul className="px-quick-list">
                {q.pairs.map(([x, y]) => (
                  <li key={`${x}:${y}`}>
                    <button type="button" className="px-quick-pair" onClick={() => onChange({ a: x, b: y, from: RA, compare: [] })} title={`Open ${nm(x)} + ${nm(y)}`}>
                      <ChampIcon id={x} name={nm(x)} size="sm" /><ChampIcon id={y} name={nm(y)} size="sm" />
                      <span>{nm(x)} + {nm(y)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          <p className="xs faint">Shortcuts, not a ranking. Opening a pair never changes your draft.</p>
        </div>
      )}
    </div>
  );

  return (
    <div className="px px-split">
      <div className="px-left">
        {slots}
        {picker}
        {lists}
      </div>
      <div className="px-right">
        {comparison}
        {detail}
        {!detail && !comparison && groups && (
          <Guide anchor={anchor} role={from} lane={lane} names={names} groups={groups} lessons={anchorLessons(data.lessons, anchor, from)} onPick={pickPartner} onLesson={onLesson} />
        )}
      </div>
    </div>
  );
}

// ---------- start and guidance (Draft Insights) ----------

/** A few pairs to start from, each from stored data and none a ranking: saved preferred pairs in record order, and the
 *  pairs of the newest recorded pro games. */
function quickStart(lane: LaneKey, records: SavedRecords, data: PairingData) {
  const RA = LANES[lane].a, RB = LANES[lane].b;
  const saved: [string, string][] = (lane === "bot"
    ? records.botPairings.filter((r) => r.clashDefault.length).map((r) => [r.champion, r.clashDefault[0]] as [string, string])
    : lane === "top-jungle" ? (records.topPicks ?? []).filter((t) => t.surrounding.jungle.length).map((t) => [t.champion, t.surrounding.jungle[0]] as [string, string])
    : (records.midJungle ?? []).filter((m) => m.role === RA && m.clashDefault.length).map((m) => [m.anchor, m.clashDefault[0]] as [string, string])).slice(0, 5);
  const recent: [string, string][] = [];
  const rows = [...data.rows].sort((x, y) => (y.date ?? "").localeCompare(x.date ?? "") || y.game - x.game);
  for (const r of rows) {
    const x = r.picks[RA], y = r.picks[RB];
    if (!x || !y || recent.some(([p, q]) => p === x && q === y) || saved.some(([p, q]) => p === x && q === y)) continue;
    recent.push([x, y]);
    if (recent.length === 5) break;
  }
  return [
    { title: "Saved pairs", sub: lane === "top-jungle" ? "from your saved top records" : "your preferred partners", hint: "The first saved records, in their stored order", pairs: saved },
    { title: "Played recently by pros", sub: "newest recorded games", hint: "The pairs of the newest recorded pro games; recency, not strength", pairs: recent },
  ];
}

/** The lessons that name this one champion's type (ADC, support, jungle and top archetype lessons). */
function anchorLessons(book: PairingData["lessons"], id: string, role: DuoRole) {
  const lid = role === "BOT" ? "adc-archetypes" : role === "SUPPORT" ? "support-types" : role === "JUNGLE" ? "jungle-archetypes" : role === "TOP" ? "top-classes" : undefined;
  const i = book.insights.find((x) => x.id === lid);
  const g = i?.groups?.find((x) => x.champions.includes(id));
  return i && g ? [{ lesson: i.id, label: g.label, text: g.plan }] : [];
}

function Guide({ anchor, role, lane, names, groups, lessons, onPick, onLesson }: {
  anchor: string; role: DuoRole; lane: LaneKey; names: Names; groups: { saved: PartnerOption[]; observed: PartnerOption[]; proposed: PartnerOption[] };
  lessons: { lesson: string; label: string; text: string }[]; onPick: (id: string) => void; onLesson?: (id: string) => void;
}) {
  const nm = (id: string) => names[id] ?? id;
  const other = partnerRoleOf(role, lane);
  const starts = [groups.saved[0] && { o: groups.saved[0], why: SAVED_LABEL[groups.saved[0].saved?.kind ?? "default"] }, groups.observed[0] && { o: groups.observed[0], why: "Most recorded pro pairing that is not saved" }]
    .filter(Boolean) as { o: PartnerOption; why: string }[];
  return (
    <section className="px-guide panel" aria-label="How to read the lists">
      <h3>Choose {ROLE_ONE[other]} for {nm(anchor)}</h3>
      <p className="small muted">Open a partner to see the shared plan, what works, what it gives up and the pro games behind it. Tick Compare on two partners to set them side by side.</p>
      {starts.length > 0 && (
        <ul className="px-quick-list">
          {starts.map(({ o, why }) => (
            <li key={o.id}><button type="button" className="px-quick-pair" onClick={() => onPick(o.id)} title={why}>
              <ChampIcon id={o.id} name={nm(o.id)} size="sm" /><span>{nm(o.id)} <span className="faint">· {why.toLowerCase()}</span></span>
            </button></li>
          ))}
        </ul>
      )}
      <dl className="px-key">
        <dt className="clash-text">Saved preferences <span className="tnum faint">{groups.saved.length}</span></dt><dd>Your own pairings. Only these shape Draft Room recommendations.</dd>
        <dt className="pro-text">Observed in pro games <span className="tnum faint">{groups.observed.length}</span></dt><dd>Recorded together in pro games. Evidence, never a recommendation.</dd>
        <dt>Kit-compatible <span className="tnum faint">{groups.proposed.length}</span></dt><dd>Proposed from the stored kits. Analysis, not saved.</dd>
      </dl>
      {lessons.map((l) => (
        <p key={l.lesson} className="small px-guide-lesson"><span className="px-lesson-kind">{role === "TOP" ? "Top class" : `${ROLE_WORD[role]} type`} · {l.label}</span> {l.text}{" "}
          <LessonLink id={l.lesson} onLesson={onLesson}>Read the lesson</LessonLink></p>
      ))}
    </section>
  );
}

/** A link to a lesson: in place on Draft Insights (the pair stays in the URL, Back returns to it), a plain link elsewhere. */
function LessonLink({ id, onLesson, children }: { id: string; onLesson?: (id: string) => void; children: React.ReactNode }) {
  return <Link className="xs" href={lessonHref(id)} onClick={onLesson ? (e) => { if (e.metaKey || e.ctrlKey || e.shiftKey) return; e.preventDefault(); onLesson(id); } : undefined}>{children}</Link>;
}

// ---------- champion picker ----------

function Picker({ role, lane, champions, saved: records, data, names, current, taken, onPick, onClose }: {
  role: DuoRole; lane: LaneKey; champions: Champion[]; saved: SavedRecords; data: PairingData; names: Names; current?: string; taken?: string;
  onPick: (id: string) => void; onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { input.current?.focus({ preventScroll: true }); }, [role]);
  const { common, rest } = useMemo(() => {
    const played = new Map<string, number>();
    for (const r of data.rows) { const id = r.picks[role]; if (id) played.set(id, (played.get(id) ?? 0) + 1); }
    const mj = records.midJungle ?? [];
    const tops = records.topPicks ?? [];
    const saved = new Set(lane === "top-jungle" ? (role === "TOP" ? tops.map((t) => t.champion) : tops.flatMap((t) => t.surrounding.jungle))
      : role === "BOT" ? records.botPairings.map((b) => b.champion)
      : role === "SUPPORT" ? records.botPairings.flatMap((b) => [...b.clashDefault, ...b.alternatives])
      : [...mj.filter((m) => m.role === role).map((m) => m.anchor), ...mj.filter((m) => m.role !== role).flatMap((m) => [...m.clashDefault, ...m.alternatives])]);
    const all = champions.filter((c) => c.roles.includes(role) || played.has(c.id)).sort((a, b) => a.name.localeCompare(b.name));
    return { common: all.filter((c) => saved.has(c.id) || played.has(c.id)), rest: all.filter((c) => !saved.has(c.id) && !played.has(c.id)) };
  }, [role, lane, champions, records, data.rows]);
  const needle = q.trim().toLowerCase();
  const match = (c: Champion) => !needle || c.name.toLowerCase().includes(needle) || c.aliases.some((a) => a.toLowerCase().includes(needle));
  const shown = [...common, ...rest].filter(match);
  const grid = (list: Champion[]) => (
    <div className="px-grid">
      {list.map((c) => (
        <button key={c.id} type="button" className={`px-pick${c.id === current ? " current" : ""}`} disabled={c.id === taken} onClick={() => onPick(c.id)}
          title={c.id === taken ? `${c.name} is already in the other slot` : c.rosterOnly ? `${c.name}: no kit read yet` : undefined}>
          <ChampIcon id={c.id} name={c.name} size="md" />
          <span>{c.name}</span>
        </button>
      ))}
    </div>
  );
  return (
    <div className="px-picker" onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } }}>
      <div className="px-picker-head">
        <input ref={input} type="search" value={q} placeholder={`Search ${ROLE_PLURAL[role]}`} aria-label={`Search ${ROLE_PLURAL[role]}`} onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && shown[0] && shown[0].id !== taken) onPick(shown[0].id); }} />
        <button type="button" className="btn sm ghost" onClick={onClose}>Close</button>
      </div>
      {needle ? (shown.length ? grid(shown) : <p className="muted xs">No champion matches.</p>) : <>
        <p className="label">Saved or played in pro games</p>
        {grid(common)}
        <Disclosure summary={`Every other ${ROLE_WORD[role].toLowerCase()}`} meta={rest.length} lazy>{grid(rest)}</Disclosure>
      </>}
    </div>
  );
}

// ---------- partner groups ----------

function Group({ title, layer, list, empty, note, collapse, names, from, lane, partner, compare, pickPartner, toggleCompare, readOf, pairOf }: {
  title: string; layer: "clash" | "pro" | "proposed"; list: PartnerOption[]; empty: string; note?: string; collapse?: number;
  names: Names; from: DuoRole; lane: LaneKey; partner?: string; compare: string[]; pickPartner: (id: string) => void; toggleCompare: (id: string) => void;
  readOf: (b?: string, s?: string) => DuoRead | undefined; pairOf: (p: string) => [string, string];
}) {
  const [all, setAll] = useState(false);
  const shown = collapse && !all && !list.some((o, i) => i >= collapse && (o.id === partner || compare.includes(o.id))) ? list.slice(0, collapse) : list;
  return (
    <section className={`px-group layer ${layer === "proposed" ? "clash proposed" : layer}`} aria-label={title}>
      <div className="layer-label"><span className="ldot" />{title}<span className="count">{list.length}</span>{layer === "proposed" && <span className="push"><ProposedTag /></span>}</div>
      {note && list.length > 0 && <p className="xs faint px-note">{note}</p>}
      {list.length ? (
        <ul className="px-cards">
          {shown.map((o) => {
            const [b, s] = pairOf(o.id);
            const read = readOf(b, s);
            return <PartnerCard key={o.id} o={o} names={names} from={from} lane={lane} read={read} open={partner === o.id} comparing={compare.includes(o.id)}
              onOpen={() => pickPartner(o.id)} onCompare={() => toggleCompare(o.id)} />;
          })}
        </ul>
      ) : <p className="xs muted">{empty}</p>}
      {shown.length < list.length && <button type="button" className="btn sm ghost px-more" onClick={() => setAll(true)}>Show all {list.length}</button>}
    </section>
  );
}

const evidenceText = (e: PairEvidence) => `${e.games.length} game${e.games.length === 1 ? "" : "s"} · ${e.teams.length} team${e.teams.length === 1 ? "" : "s"}`;

function PartnerCard({ o, names, from, lane, read, open, comparing, onOpen, onCompare }: {
  o: PartnerOption; names: Names; from: DuoRole; lane: LaneKey; read?: DuoRead; open: boolean; comparing: boolean; onOpen: () => void; onCompare: () => void;
}) {
  const name = names[o.id] ?? o.id;
  return (
    <li className={`px-card${open ? " open" : ""}`}>
      <button type="button" className="px-card-main" aria-pressed={open} onClick={onOpen} title={open ? "Close this pairing" : `Inspect ${name}`}>
        <ChampIcon id={o.id} name={name} role={partnerRoleOf(from, lane)} size="md" />
        <span className="px-card-text">
          <span className="px-card-name">{name}</span>
          <span className="px-tags">
            {o.saved && <span className="px-tag clash" title={o.saved.note}>{SAVED_LABEL[o.saved.kind]}{o.saved.sides && !o.saved.sides[LANES[lane].a === from ? "a" : "b"] ? ` · ${name}'s record` : ""}</span>}
            {o.evidence && <span className="px-tag pro tnum" title={`Recorded pro games with both on one team: ${o.evidence.wins}–${o.evidence.losses}, ${o.evidence.teams.join(", ")}`}>Pro · {evidenceText(o.evidence)}</span>}
            {o.proposed && !o.saved && <span className="px-tag proposed" title={o.proposed.reason}>Proposed · {CONFIDENCE_LABEL[o.proposed.confidence].toLowerCase()}</span>}
          </span>
          {read && <span className={`px-plan ${read.plan.fit}`} title={read.plan.text}>{read.plan.label}</span>}
        </span>
      </button>
      <button type="button" className={`px-cmp${comparing ? " on" : ""}`} aria-pressed={comparing} onClick={onCompare} title={comparing ? "Remove from the comparison" : "Compare (two at a time)"}>
        {comparing ? "Comparing" : "Compare"}
      </button>
    </li>
  );
}

// ---------- one pair ----------

function useUsePair() {
  // "Use in Draft Room": the pair joins the stored board (its two slots only), then the bare room opens and restores it.
  return (picks: Partial<Record<DuoRole, string>>) => {
    const store = localStore();
    const current = readBoard(store, new Set([...(Object.values(picks) as string[]), ...allBoardIds(store)]), ["all", "synergy", "pro", "fit", "counter", "rotation", "blind", "priority"]);
    writeBoard(store, withPair(current, picks));
  };
}
// Ids already stored on the board (sanitizeBoard keeps only ids it is told are known).
function allBoardIds(store: ReturnType<typeof localStore>): string[] {
  try {
    const raw = store?.getItem("draft-room:board");
    if (!raw) return [];
    const v = JSON.parse(raw) as { ally?: Record<string, string>; enemy?: Record<string, string>; foes?: { id: string }[] };
    return [...Object.values(v.ally ?? {}), ...Object.values(v.enemy ?? {}), ...(v.foes ?? []).map((f) => f.id)].filter((x) => typeof x === "string");
  } catch { return []; }
}

function PairDetail({ a, b, lane, names, data, saved: records, proposed, read, note, context, comparing, fixedRole, onLesson, onCompareSaved }: {
  a: string; b: string; lane: LaneKey; names: Names; data: PairingData; saved: SavedRecords; proposed: ProposedRecord[];
  read?: DuoRead; note?: PairingNote; context: "insights" | "synergies"; comparing: string[]; fixedRole?: DuoRole; onLesson?: (id: string) => void;
  onCompareSaved: (anchorRole: DuoRole, ids: string[]) => void;
}) {
  const nm = (id: string) => names[id] ?? id;
  const RA = LANES[lane].a, RB = LANES[lane].b;
  const saved = savedPair(lane, a, b, records);
  // The saved preferred pair this one can be set beside: the first slot's own preferred partner (Ezreal + Karma for an
  // Ezreal pair), else, for a mid + jungle pair, the jungler's preferred mid. Where the page fixes the anchor
  // (Synergies), only a comparison among that champion's partners is offered.
  const prefOf = (id: string, role: DuoRole, not: string) => (lane === "bot"
    ? (role === "BOT" ? records.botPairings.find((r) => r.champion === id)?.clashDefault : undefined)
    : lane === "top-jungle" ? (role === "TOP" ? records.topPicks?.find((t) => t.champion === id)?.surrounding.jungle : undefined)
    : records.midJungle?.find((m) => m.anchor === id && m.role === role)?.clashDefault)?.find((x) => x !== not);
  const beside = saved?.kind === "default" || saved?.kind === "fits" ? undefined
    : [{ role: RA, anchor: a, mine: b, def: prefOf(a, RA, b) }, { role: RB, anchor: b, mine: a, def: prefOf(b, RB, a) }]
      .find((c) => c.def && (!fixedRole || fixedRole === c.role));
  const shown = !!beside && comparing.includes(beside.def!) && comparing.includes(beside.mine);
  const prop = saved ? undefined : proposedLink(proposed, a, RA, b, RB);
  const games = data.rows.filter((r) => r.picks[RA] === a && r.picks[RB] === b);
  const ev = games.length ? evidenceOf(b, games, data.newestPatch) : undefined;
  const lessons = pairLessons(data.lessons, a, b, note?.lessons, lane);
  const usePair = useUsePair();
  const head = useRef<HTMLHeadingElement>(null);
  useEffect(() => { head.current?.focus({ preventScroll: true }); }, [a, b]);
  const hasBotRecord = lane === "bot" && records.botPairings.some((r) => r.champion === a);
  return (
    <article id="px-detail" className="px-detail panel" aria-label={`${nm(a)} and ${nm(b)}`}>
      <header className="px-detail-head">
        <span className="px-duo">
          <InteractiveChampion id={a} role={RA}><ChampIcon id={a} name={nm(a)} role={RA} size="xl" /></InteractiveChampion>
          <InteractiveChampion id={b} role={RB}><ChampIcon id={b} name={nm(b)} role={RB} size="xl" /></InteractiveChampion>
        </span>
        <div className="px-detail-id">
          <h3 ref={head} tabIndex={-1}>{nm(a)} + {nm(b)}</h3>
          {read && <p className="px-plan-line"><span className={`px-plan ${read.plan.fit}`} title={FIT_TITLE[read.plan.fit]}>{read.plan.label}</span></p>}
        </div>
        <span className="px-actions">
          <Link className="btn sm primary" href="/" onClick={() => usePair({ [RA]: a, [RB]: b })} title={`Puts ${nm(a)} ${ROLE_AT[RA]} and ${nm(b)} ${ROLE_AT[RB]} on your current draft; every other pick stays. Nothing is locked until you open the room.`}>Use in Draft Room</Link>
          {lane === "top-jungle" && <Link className="btn sm" href={topMatchupsHref(a)} title={`${nm(a)}'s lane opponents: ranked matchup data, kit read and what a jungler changes`}>Lane matchups</Link>}
          {context !== "synergies" && <Link className="btn sm" href={synergiesHref(a, RA) + `&view=partners&partner=${b}`}>Open in Synergies</Link>}
        </span>
      </header>

      <section className={`layer clash${!saved && prop ? " proposed" : ""}`}>
        <div className="layer-label"><span className="ldot" />Synergy{!saved && prop && <span className="push"><ProposedTag /></span>}</div>
        {saved ? (lane === "top-jungle"
            // Only a top laner's record lists junglers, in one list with no preferred / alternative split.
            ? <p className="small"><b>{SAVED_LABEL[saved.kind]}</b> <span className="muted">· {nm(b)} is one of the junglers on {nm(a)}&apos;s saved top record</span></p>
            : lane === "bot" || !saved.sides
            ? <p className="small"><b>{SAVED_LABEL[saved.kind]}</b> for {nm(a)}{saved.note && <span className="muted"> · {saved.note}</span>}</p>
            // Each champion keeps its own record; the Draft Room reads the record of the champion that is locked.
            : <p className="small" title="Each champion has its own saved record. The Draft Room uses the record of the champion that is locked.">
                {([["a", a, b], ["b", b, a]] as const).map(([side, own, other], i) => (
                  <span key={side}>{i > 0 && <span className="faint"> · </span>}{saved.sides![side]
                    ? <><b>{SAVED_LABEL[saved.sides![side]!]}</b> on {nm(own)}&apos;s record</>
                    : <span className="muted">{nm(own)}&apos;s record does not list {nm(other)}</span>}</span>))}
                {saved.note && <span className="muted"> · {saved.note}</span>}
              </p>)
          : prop ? <p className="small">{prop.reason} <span className={`prop-conf ${prop.confidence} xs`}>· {CONFIDENCE_LABEL[prop.confidence]}</span></p>
          : <p className="small muted">Not one of your saved pairings{hasBotRecord ? `: ${nm(a)}'s saved record decides the Draft Room's supports` : ""}.</p>}
        {beside && !shown && (
          <p><button type="button" className="btn sm" onClick={() => onCompareSaved(beside.role, [beside.def!, beside.mine])} title="Two plans side by side, not a ranking">
            Compare with {beside.role === RA ? `${nm(a)} + ${nm(beside.def!)}` : `${nm(beside.def!)} + ${nm(b)}`}, {lane === "top-jungle" ? "a saved pairing" : "your saved preferred"}</button></p>
        )}
      </section>

      <section className="layer logic">
        <div className="layer-label"><span className="ldot" />Draft logic<span className="push xs faint">{note ? "written read from the kits · not yet reviewed" : "read from the stored kit values"}</span></div>
        {!read && !note ? <p className="small muted">One of these champions has no stored kit yet, so nothing is read for this pair.</p> : (
          <dl className="px-read">
            <dt>{lane === "bot" ? "Lane plan" : lane === "top-jungle" ? "Gank plan" : "Plan"}</dt><dd>{note?.plan ?? read?.plan.text}</dd>
            <dt>Why it works</dt><dd>{lines(note?.why ?? read?.works.map((l) => l.text), read?.works)}</dd>
            {(note?.strengths.length || read?.strengths.length) ? <><dt>Strengths</dt><dd>{lines(note?.strengths.length ? note.strengths : read?.strengths.map((l) => l.text), note?.strengths.length ? undefined : read?.strengths)}</dd></> : null}
            <dt>Weaknesses</dt><dd className="bad">{lines(note?.weaknesses ?? read?.weaknesses.map((l) => l.text), note ? undefined : read?.weaknesses, lane === "bot" ? "No weakness the stored kits show for the pair itself; the enemy lane decides the rest." : lane === "top-jungle" ? "No weakness the stored kits show for the pair itself; the enemy top and jungler decide the rest." : "No weakness the stored kits show for the pair itself; the rest of the draft decides.")}</dd>
            {(note?.curve || read) && <><dt>Power curve</dt><dd title={note ? undefined : read?.curve.basis}>{note?.curve ?? read?.curve.text}</dd></>}
          </dl>
        )}
        {note && read && (
          <Disclosure summary="Kit values behind this pair" className="px-basis">
            <ul className="px-basis-list">
              {[{ text: `${read.plan.label}: ${read.plan.text}`, basis: read.plan.basis }, ...read.works, ...read.strengths, ...read.weaknesses, read.curve].map((l, i) => <li key={i}>{l.text} <span className="faint">({l.basis})</span></li>)}
            </ul>
          </Disclosure>
        )}
      </section>

      <section className="layer pro">
        <div className="layer-label"><span className="ldot" />Pro evidence{ev && <span className="push tnum">{evidenceText(ev)} · {ev.wins}–{ev.losses}</span>}</div>
        {ev ? <ProEvidence ev={ev} data={data} /> : <p className="small muted">No recorded pro game has {nm(a)} and {nm(b)} on one team. That says nothing about the pair, only about pro play.</p>}
      </section>

      {lessons.length > 0 && <Lessons list={lessons} onLesson={onLesson} />}
    </article>
  );
}

function lines(texts?: string[], basis?: { basis: string }[], empty?: string) {
  if (!texts?.length) return empty ? <span className="muted">{empty}</span> : <span className="muted">Nothing specific in the stored kits.</span>;
  if (texts.length === 1) return <span title={basis?.[0]?.basis}>{texts[0]}</span>;
  return <ul className="px-lines">{texts.map((t, i) => <li key={i} title={basis?.[i]?.basis}>{t}</li>)}</ul>;
}

function ProEvidence({ ev, data }: { ev: PairEvidence; data: PairingData }) {
  const few = ev.teams.length < PAIR_FEW_TEAMS;
  return (
    <>
      <p className="small">
        {ev.events.map((e) => `${data.events[e.event]?.short ?? e.event} ${patchLabel(e.patch)} · ${e.games}`).join(" · ")}
        {few && <span className="caution-text"> · small sample ({ev.teams.length} team{ev.teams.length === 1 ? "" : "s"})</span>}
        {ev.archiveOnly && <span className="faint"> · LCK archive only</span>}
      </p>
      <p className="xs muted">Teams: {ev.teams.join(", ")}. Results are game results, not lane results; one team's repeated games are one team&apos;s choice.</p>
      <Disclosure summary="Games" meta={ev.games.length} lazy>
        <ul className="px-games">
          {ev.games.map((g) => (
            <li key={`${g.game}:${g.team}`}>
              <span className="tnum faint">{shortDate(g.date) ?? "—"}</span>
              <span><b>{g.team}</b> <span className="faint">vs</span> {g.opponent}</span>
              <span className="faint">{data.events[g.event]?.short ?? g.event}{g.stage ? ` · ${stageLabel(g.stage)}` : ""} · {patchLabel(g.patch)}</span>
              {g.won != null && <span className={`res ${g.won ? "win" : "loss"}`}>{g.won ? "W" : "L"}</span>}
              <span className="px-game-links">
                {g.draft && <Link className="xs" href={proDraftHref(g.draft)}>Pro Drafts</Link>}
                {g.url && <a className="xs" href={g.url} target="_blank" rel="noreferrer">Gol.gg</a>}
              </span>
            </li>
          ))}
        </ul>
      </Disclosure>
    </>
  );
}

function Lessons({ list, onLesson }: { list: PairLesson[]; onLesson?: (id: string) => void }) {
  return (
    <section className="layer px-lessons">
      <div className="layer-label"><span className="ldot" />Related lessons<span className="count">{list.length}</span><span className="push xs faint">creator guides · solo queue, not pro play</span></div>
      <ul className="px-lesson-list">
        {list.map((l, i) => (
          <li key={i}>
            <span className="px-lesson-kind">{l.kind === "pair" ? "This pair" : l.kind === "adc" ? `ADC type · ${l.title}` : l.kind === "support" ? `Support type · ${l.title}` : l.kind === "jungle" ? `Jungler type · ${l.title}` : l.kind === "top" ? `Top class · ${l.title}` : "Lesson"}</span>
            <span>{l.fit && <b className={`ins-fit ${l.fit}`}>{l.fit === "fits" ? "Same plan" : "Clashing plans"} · </b>}{l.text}</span>
            {l.stat && <span className="ins-stat" title={`Creator-reported ranked figure (${l.period ?? "solo queue"}); not checked independently and not a pro statistic`}>{l.stat.text} · {l.stat.patch} solo queue</span>}
            <span className="px-lesson-links">
              <LessonLink id={l.lesson} onLesson={onLesson}>{l.kind === "pair" || l.kind === "note" ? `${l.title} →` : "Read the lesson →"}</LessonLink>
              {l.source?.url && <a className="ins-moment num" href={momentUrl(l.source.url, l.source.t)} target="_blank" rel="noopener noreferrer">{clock(l.source.t)}</a>}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---------- two partners side by side ----------

function Compare({ a, b, anchorRole, lane, names, data, saved: records, proposed, readOf, onClose, onOpen, onLesson }: {
  a: [string, string]; b: [string, string]; anchorRole: DuoRole; lane: LaneKey; names: Names; data: PairingData; saved: SavedRecords; proposed: ProposedRecord[];
  readOf: (x?: string, y?: string) => DuoRead | undefined; onClose: () => void; onOpen: (id: string) => void; onLesson?: (id: string) => void;
}) {
  const nm = (id: string) => names[id] ?? id;
  const RA = LANES[lane].a, RB = LANES[lane].b;
  const col = ([x, y]: [string, string]) => {
    const note = noteFor(data.notes, x, y, lane);
    const read = readOf(x, y);
    const games = data.rows.filter((r) => r.picks[RA] === x && r.picks[RB] === y);
    const saved = savedPair(lane, x, y, records, anchorRole === RA ? "a" : "b");
    const prop = saved ? undefined : proposedLink(proposed, x, RA, y, RB);
    const lesson = pairLessons(data.lessons, x, y, [], lane).find((l) => l.kind === "pair");
    return { bot: x, sup: y, note, read, ev: games.length ? evidenceOf(y, games, data.newestPatch) : undefined, saved, prop, lesson, partner: anchorRole === RA ? y : x };
  };
  const cols = [col(a), col(b)];
  const anchor = anchorRole === RA ? a[0] : a[1];
  const row = (label: string, f: (c: (typeof cols)[number]) => React.ReactNode) => (
    <tr><th scope="row">{label}</th>{cols.map((c) => <td key={c.partner}>{f(c)}</td>)}</tr>
  );
  return (
    <section id="px-compare" className="px-compare panel" aria-label="Compare two partners">
      <header className="px-compare-head">
        <h3>{nm(anchor)} with {nm(cols[0].partner)} or {nm(cols[1].partner)}</h3>
        <span className="xs faint">Two plans side by side, not a ranking.</span>
        <button type="button" className="btn sm ghost" onClick={onClose}>Close</button>
      </header>
      <div className="table-wrap px-compare-wrap">
        <table className="px-compare-table">
          <thead><tr><th />{cols.map((c) => (
            <th key={c.partner} scope="col"><button type="button" className="px-cmp-name" onClick={() => onOpen(c.partner)} title={`Inspect ${nm(c.bot)} + ${nm(c.sup)}`}>
              <ChampIcon id={c.partner} name={nm(c.partner)} role={partnerRoleOf(anchorRole, lane)} size="sm" />{nm(c.partner)}</button></th>))}</tr></thead>
          <tbody>
            {row("Synergy", (c) => c.saved ? <span className="clash-text">{SAVED_LABEL[c.saved.kind]}{c.saved.sides && !c.saved.sides[anchorRole === RA ? "a" : "b"] ? ` · on ${nm(c.partner)}'s record` : ""}</span> : c.prop ? <span>Proposed · {CONFIDENCE_LABEL[c.prop.confidence].toLowerCase()}</span> : <span className="muted">Not saved</span>)}
            {row(lane === "bot" ? "Lane plan" : lane === "top-jungle" ? "Gank plan" : "Plan", (c) => c.read ? <><span className={`px-plan ${c.read.plan.fit}`}>{c.read.plan.label}</span><span className="xs muted"> {c.note?.plan ?? c.read.plan.text}</span></> : <span className="muted">No kit read</span>)}
            {row("Why it works", (c) => <span className="small">{(c.note?.why ?? c.read?.works.map((l) => l.text) ?? [])[0] ?? <span className="muted">Nothing specific in the stored kits</span>}</span>)}
            {row("Weak point", (c) => <span className="small bad">{(c.note?.weaknesses ?? c.read?.weaknesses.map((l) => l.text) ?? [])[0] ?? <span className="muted">None the kits show</span>}</span>)}
            {row("Power curve", (c) => <span className="small">{c.note?.curve ?? c.read?.curve.text ?? "—"}</span>)}
            {row("Pro games", (c) => c.ev ? <span className="tnum">{evidenceText(c.ev)} · {c.ev.wins}–{c.ev.losses}{c.ev.teams.length < PAIR_FEW_TEAMS ? <span className="caution-text"> · small sample</span> : null}</span> : <span className="muted">None recorded</span>)}
            {row("Events and patches", (c) => c.ev
              ? <span className="small tnum">{c.ev.events.map((e) => `${data.events[e.event]?.short ?? e.event} ${patchLabel(e.patch)} · ${e.games}`).join(" · ")}{c.ev.archiveOnly ? <span className="muted"> · archive only</span> : c.ev.current === 0 ? <span className="muted"> · none on {data.newestPatch ? patchLabel(data.newestPatch) : "the newest patch"}</span> : null}</span>
              : <span className="muted">—</span>)}
            {row("Creator lesson", (c) => c.lesson ? <span className="small">{c.lesson.text}{c.lesson.stat && <span className="ins-stat"> {c.lesson.stat.text} · {c.lesson.stat.patch} solo queue</span>} <LessonLink id={c.lesson.lesson} onLesson={onLesson}>Lesson</LessonLink></span> : <span className="muted">—</span>)}
          </tbody>
        </table>
      </div>
    </section>
  );
}

const cap = (t: string) => t[0].toUpperCase() + t.slice(1);

export { draftHref };
