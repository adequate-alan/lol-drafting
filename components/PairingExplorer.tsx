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
import { CONFIDENCE_LABEL, proposedLink } from "@/lib/proposed";
import type { BotPairing, Champion, MidJunglePairing, PairingNote, ProposedRecord } from "@/lib/schema";
import type { PairingData } from "@/lib/data";

type Names = Record<string, string>;
const ROLE_WORD: Record<DuoRole, string> = { BOT: "ADC", SUPPORT: "Support", MID: "Mid", JUNGLE: "Jungler" };
const ROLE_PLURAL: Record<DuoRole, string> = { BOT: "ADCs", SUPPORT: "supports", MID: "mids", JUNGLE: "junglers" };
const ROLE_ONE: Record<DuoRole, string> = { BOT: "an ADC", SUPPORT: "a support", MID: "a mid", JUNGLE: "a jungler" };
const ROLE_AT: Record<DuoRole, string> = { BOT: "at bot", SUPPORT: "at support", MID: "at mid", JUNGLE: "in the jungle" };
const LANE_LABEL: Record<LaneKey, string> = { bot: "Bot lane pair", "mid-jungle": "Mid and jungle pair" };
const FIT_TITLE = {
  shared: "The two kits want the same plan (General Draft Logic from the stored kit values)",
  split: "The two kits want different things: playable, but one of them adapts. Not a verdict on the pair.",
  neutral: "Neither the same plan nor a clash: depends on how it is played",
} as const;

/** `a` is the lane's first slot (ADC or mid), `b` its partner slot (support or jungler). */
export interface PairState { a?: string; b?: string; from?: DuoRole; compare?: string[] }

export function PairingExplorer({ data, champions, botPairings, midJungle, proposed, names, state, onChange, fixed, context, lane: laneProp }: {
  data: PairingData; champions: Champion[]; botPairings: BotPairing[]; midJungle?: MidJunglePairing[]; proposed: ProposedRecord[]; names: Names;
  state: PairState; onChange: (s: PairState) => void;
  /** Synergies: the champion chosen in the page's rail is the anchor and is not changed here. */
  fixed?: { id: string; role: DuoRole };
  context: "insights" | "synergies";
  /** Which pairing: the bot lane (default) or the mid + jungle core. A fixed anchor decides it. */
  lane?: LaneKey;
}) {
  const lane: LaneKey = fixed ? laneOf(fixed.role) : laneProp ?? "bot";
  const RA = LANES[lane].a, RB = LANES[lane].b;
  const savedRecords: SavedRecords = useMemo(() => ({ botPairings, midJungle }), [botPairings, midJungle]);
  const kits = useMemo(() => kitsById(champions), [champions]);
  const byId = useMemo(() => new Map(champions.map((c) => [c.id, c])), [champions]);
  const playable = (id: string, role: DuoRole) => !!byId.get(id)?.roles.includes(role) && !byId.get(id)?.rosterOnly;
  const nm = (id: string) => names[id] ?? id;

  const a = fixed?.role === RA ? fixed.id : state.a;
  const b = fixed?.role === RB ? fixed.id : state.b;
  const from: DuoRole = fixed?.role ?? (state.from === RA || state.from === RB ? state.from : a || !b ? RA : RB);
  const anchor = from === RA ? a : b;
  const partner = from === RA ? b : a;
  const [picking, setPicking] = useState<DuoRole | undefined>(() => (!fixed && !a && !b ? RA : undefined));
  // Switching between the bot lane and mid + jungle starts with that lane's own slots.
  useEffect(() => { setPicking((p) => (p && p !== RA && p !== RB ? (!fixed && !a && !b ? RA : undefined) : p)); }, [RA, RB]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (s: Partial<PairState>) => onChange({ ...state, ...s });
  const key = (r: DuoRole) => (r === RA ? "a" : "b");

  const groups = useMemo(() => anchor ? partnerOptions({ id: anchor, role: from }, { ...savedRecords, proposed, rows: data.rows, playable, newestPatch: data.newestPatch }) : undefined,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [anchor, from, savedRecords, proposed, data]);
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
  const pickPartner = (id: string) => set({ [from === RA ? "b" : "a"]: partner === id ? undefined : id });
  const toggleCompare = (id: string) => {
    const cur = compare.includes(id) ? compare.filter((x) => x !== id) : [...compare, id].slice(-2);
    set({ compare: cur });
  };
  const anchorHasRecord = !!anchor && (lane === "bot" ? from === "BOT" && botPairings.some((r) => r.champion === anchor) : false);

  return (
    <div className="px">
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
              {id && !locked && <button type="button" className="px-clear" aria-label={`Clear ${ROLE_WORD[r]}`} title="Clear" onClick={() => onChange({ ...state, [key(r)]: undefined, from: r === from ? partnerRoleOf(r) : from, compare: r === from ? [] : state.compare })}>×</button>}
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

      {picking && (picking === RA || picking === RB) && <Picker role={picking} champions={champions} saved={savedRecords} data={data} names={names} current={picking === RA ? a : b}
        taken={picking === RA ? b : a} onPick={(id) => choose(picking, id)} onClose={() => setPicking(undefined)} />}

      {!anchor && !picking && <p className="muted small">Choose {ROLE_ONE[RA]} or {ROLE_ONE[RB]} to see who pairs with them, why, and which pro teams played it.</p>}

      {anchor && groups && (
        <div className="px-groups">
          <Group title="Saved preferences" layer="clash" list={groups.saved} empty={from === "SUPPORT" ? `No saved bot record lists ${nm(anchor)}.` : `No saved ${ROLE_PLURAL[partnerRoleOf(from)]} for ${nm(anchor)}.`}
            note={lane === "mid-jungle" ? `${nm(anchor)}'s own saved ${ROLE_PLURAL[partnerRoleOf(from)]} first, then the ${ROLE_PLURAL[partnerRoleOf(from)]} whose saved record lists ${nm(anchor)}.` : undefined}
            {...{ names, from, partner, compare, pickPartner, toggleCompare, readOf, pairOf }} />
          <Group title="Observed in pro games, not saved" layer="pro" list={groups.observed} empty="No other recorded pairing." collapse={6}
            note="Recorded together in pro games. An observed pairing is not a recommendation." {...{ names, from, partner, compare, pickPartner, toggleCompare, readOf, pairOf }} />
          <Group title="Other kit-compatible options" layer="proposed" list={groups.proposed} empty="No kit-based proposal beyond the lists above." collapse={6}
            note={anchorHasRecord ? `Proposed from the kits; ${nm(anchor)}'s saved record still decides the Draft Room's supports.` : "Proposed from the kits, not saved."}
            {...{ names, from, partner, compare, pickPartner, toggleCompare, readOf, pairOf }} />
        </div>
      )}

      {anchor && compare.length === 2 && (
        <Compare a={pairOf(compare[0])} b={pairOf(compare[1])} anchorRole={from} lane={lane} names={names} data={data} saved={savedRecords} proposed={proposed} readOf={readOf}
          onClose={() => set({ compare: [] })} onOpen={(id) => pickPartner(id)} />
      )}

      {a && b && (
        <PairDetail a={a} b={b} lane={lane} names={names} data={data} saved={savedRecords} proposed={proposed} read={readOf(a, b)}
          note={noteFor(data.notes, a, b, lane)} context={context} comparing={compare} fixedRole={fixed?.role}
          onCompareSaved={(role, ids) => {
            // An unsaved pair beside the saved preferred one: both as partners of the same champion, side by side.
            set({ from: role, compare: ids });
            requestAnimationFrame(() => document.getElementById("px-compare")?.scrollIntoView({ behavior: scrollBehavior(), block: "nearest" }));
          }} />
      )}
    </div>
  );
}

// ---------- champion picker ----------

function Picker({ role, champions, saved: records, data, names, current, taken, onPick, onClose }: {
  role: DuoRole; champions: Champion[]; saved: SavedRecords; data: PairingData; names: Names; current?: string; taken?: string;
  onPick: (id: string) => void; onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { input.current?.focus({ preventScroll: true }); }, [role]);
  const { common, rest } = useMemo(() => {
    const played = new Map<string, number>();
    for (const r of data.rows) { const id = r.picks[role]; if (id) played.set(id, (played.get(id) ?? 0) + 1); }
    const mj = records.midJungle ?? [];
    const saved = new Set(role === "BOT" ? records.botPairings.map((b) => b.champion)
      : role === "SUPPORT" ? records.botPairings.flatMap((b) => [...b.clashDefault, ...b.alternatives])
      : [...mj.filter((m) => m.role === role).map((m) => m.anchor), ...mj.filter((m) => m.role !== role).flatMap((m) => [...m.clashDefault, ...m.alternatives])]);
    const all = champions.filter((c) => c.roles.includes(role) || played.has(c.id)).sort((a, b) => a.name.localeCompare(b.name));
    return { common: all.filter((c) => saved.has(c.id) || played.has(c.id)), rest: all.filter((c) => !saved.has(c.id) && !played.has(c.id)) };
  }, [role, champions, records, data.rows]);
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

function Group({ title, layer, list, empty, note, collapse, names, from, partner, compare, pickPartner, toggleCompare, readOf, pairOf }: {
  title: string; layer: "clash" | "pro" | "proposed"; list: PartnerOption[]; empty: string; note?: string; collapse?: number;
  names: Names; from: DuoRole; partner?: string; compare: string[]; pickPartner: (id: string) => void; toggleCompare: (id: string) => void;
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
            return <PartnerCard key={o.id} o={o} names={names} from={from} read={read} open={partner === o.id} comparing={compare.includes(o.id)}
              onOpen={() => pickPartner(o.id)} onCompare={() => toggleCompare(o.id)} />;
          })}
        </ul>
      ) : <p className="xs muted">{empty}</p>}
      {shown.length < list.length && <button type="button" className="btn sm ghost px-more" onClick={() => setAll(true)}>Show all {list.length}</button>}
    </section>
  );
}

const evidenceText = (e: PairEvidence) => `${e.games.length} game${e.games.length === 1 ? "" : "s"} · ${e.teams.length} team${e.teams.length === 1 ? "" : "s"}`;

function PartnerCard({ o, names, from, read, open, comparing, onOpen, onCompare }: {
  o: PartnerOption; names: Names; from: DuoRole; read?: DuoRead; open: boolean; comparing: boolean; onOpen: () => void; onCompare: () => void;
}) {
  const name = names[o.id] ?? o.id;
  return (
    <li className={`px-card${open ? " open" : ""}`}>
      <button type="button" className="px-card-main" aria-pressed={open} onClick={onOpen} title={open ? "Close this pairing" : `Inspect ${name}`}>
        <ChampIcon id={o.id} name={name} role={partnerRoleOf(from)} size="md" />
        <span className="px-card-text">
          <span className="px-card-name">{name}</span>
          <span className="px-tags">
            {o.saved && <span className="px-tag clash" title={o.saved.note}>{SAVED_LABEL[o.saved.kind]}{o.saved.sides && !o.saved.sides[LANES[laneOf(from)].a === from ? "a" : "b"] ? ` · ${name}'s record` : ""}</span>}
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

function PairDetail({ a, b, lane, names, data, saved: records, proposed, read, note, context, comparing, fixedRole, onCompareSaved }: {
  a: string; b: string; lane: LaneKey; names: Names; data: PairingData; saved: SavedRecords; proposed: ProposedRecord[];
  read?: DuoRead; note?: PairingNote; context: "insights" | "synergies"; comparing: string[]; fixedRole?: DuoRole;
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
    : records.midJungle?.find((m) => m.anchor === id && m.role === role)?.clashDefault)?.find((x) => x !== not);
  const beside = saved?.kind === "default" ? undefined
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
    <article className="px-detail panel" aria-label={`${nm(a)} and ${nm(b)}`}>
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
          {context !== "synergies" && <Link className="btn sm" href={synergiesHref(a, RA) + `&view=partners&partner=${b}`}>Open in Synergies</Link>}
        </span>
      </header>

      <section className={`layer clash${!saved && prop ? " proposed" : ""}`}>
        <div className="layer-label"><span className="ldot" />Synergy{!saved && prop && <span className="push"><ProposedTag /></span>}</div>
        {saved ? (lane === "bot" || !saved.sides
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
            Compare with {beside.role === RA ? `${nm(a)} + ${nm(beside.def!)}` : `${nm(beside.def!)} + ${nm(b)}`}, your saved preferred</button></p>
        )}
      </section>

      <section className="layer logic">
        <div className="layer-label"><span className="ldot" />Draft logic<span className="push xs faint">{note ? "written read from the kits · not yet reviewed" : "read from the stored kit values"}</span></div>
        {!read && !note ? <p className="small muted">One of these champions has no stored kit yet, so nothing is read for this pair.</p> : (
          <dl className="px-read">
            <dt>{lane === "bot" ? "Lane plan" : "Plan"}</dt><dd>{note?.plan ?? read?.plan.text}</dd>
            <dt>Why it works</dt><dd>{lines(note?.why ?? read?.works.map((l) => l.text), read?.works)}</dd>
            {(note?.strengths.length || read?.strengths.length) ? <><dt>Strengths</dt><dd>{lines(note?.strengths.length ? note.strengths : read?.strengths.map((l) => l.text), note?.strengths.length ? undefined : read?.strengths)}</dd></> : null}
            <dt>Weaknesses</dt><dd className="bad">{lines(note?.weaknesses ?? read?.weaknesses.map((l) => l.text), note ? undefined : read?.weaknesses, lane === "bot" ? "No weakness the stored kits show for the pair itself; the enemy lane decides the rest." : "No weakness the stored kits show for the pair itself; the rest of the draft decides.")}</dd>
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

      {lessons.length > 0 && <Lessons list={lessons} />}
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

function Lessons({ list }: { list: PairLesson[] }) {
  return (
    <section className="layer px-lessons">
      <div className="layer-label"><span className="ldot" />Creator lessons<span className="push xs faint">solo queue, not pro play</span></div>
      <ul className="px-lesson-list">
        {list.map((l, i) => (
          <li key={i}>
            <span className="px-lesson-kind">{l.kind === "pair" ? "This pair" : l.kind === "adc" ? `ADC type · ${l.title}` : l.kind === "support" ? `Support type · ${l.title}` : "Lesson"}</span>
            <span>{l.fit && <b className={`ins-fit ${l.fit}`}>{l.fit === "fits" ? "Same plan" : "Clashing plans"} · </b>}{l.text}</span>
            {l.stat && <span className="ins-stat" title={`Creator-reported ranked figure (${l.period ?? "solo queue"}); not checked independently and not a pro statistic`}>{l.stat.text} · {l.stat.patch} solo queue</span>}
            <span className="px-lesson-links">
              <Link className="xs" href={lessonHref(l.lesson)}>{l.kind === "pair" || l.kind === "note" ? l.title : "Lesson"}</Link>
              {l.source?.url && <a className="ins-moment num" href={momentUrl(l.source.url, l.source.t)} target="_blank" rel="noopener noreferrer">{clock(l.source.t)}</a>}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---------- two partners side by side ----------

function Compare({ a, b, anchorRole, lane, names, data, saved: records, proposed, readOf, onClose, onOpen }: {
  a: [string, string]; b: [string, string]; anchorRole: DuoRole; lane: LaneKey; names: Names; data: PairingData; saved: SavedRecords; proposed: ProposedRecord[];
  readOf: (x?: string, y?: string) => DuoRead | undefined; onClose: () => void; onOpen: (id: string) => void;
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
              <ChampIcon id={c.partner} name={nm(c.partner)} role={partnerRoleOf(anchorRole)} size="sm" />{nm(c.partner)}</button></th>))}</tr></thead>
          <tbody>
            {row("Synergy", (c) => c.saved ? <span className="clash-text">{SAVED_LABEL[c.saved.kind]}{c.saved.sides && !c.saved.sides[anchorRole === RA ? "a" : "b"] ? ` · on ${nm(c.partner)}'s record` : ""}</span> : c.prop ? <span>Proposed · {CONFIDENCE_LABEL[c.prop.confidence].toLowerCase()}</span> : <span className="muted">Not saved</span>)}
            {row(lane === "bot" ? "Lane plan" : "Plan", (c) => c.read ? <><span className={`px-plan ${c.read.plan.fit}`}>{c.read.plan.label}</span><span className="xs muted"> {c.note?.plan ?? c.read.plan.text}</span></> : <span className="muted">No kit read</span>)}
            {row("Why it works", (c) => <span className="small">{(c.note?.why ?? c.read?.works.map((l) => l.text) ?? [])[0] ?? <span className="muted">Nothing specific in the stored kits</span>}</span>)}
            {row("Weak point", (c) => <span className="small bad">{(c.note?.weaknesses ?? c.read?.weaknesses.map((l) => l.text) ?? [])[0] ?? <span className="muted">None the kits show</span>}</span>)}
            {row("Power curve", (c) => <span className="small">{c.note?.curve ?? c.read?.curve.text ?? "—"}</span>)}
            {row("Pro games", (c) => c.ev ? <span className="tnum">{evidenceText(c.ev)} · {c.ev.wins}–{c.ev.losses}{c.ev.teams.length < PAIR_FEW_TEAMS ? <span className="caution-text"> · small sample</span> : null}</span> : <span className="muted">None recorded</span>)}
            {row("Events and patches", (c) => c.ev
              ? <span className="small tnum">{c.ev.events.map((e) => `${data.events[e.event]?.short ?? e.event} ${patchLabel(e.patch)} · ${e.games}`).join(" · ")}{c.ev.archiveOnly ? <span className="muted"> · archive only</span> : c.ev.current === 0 ? <span className="muted"> · none on {data.newestPatch ? patchLabel(data.newestPatch) : "the newest patch"}</span> : null}</span>
              : <span className="muted">—</span>)}
            {row("Creator lesson", (c) => c.lesson ? <span className="small">{c.lesson.text}{c.lesson.stat && <span className="ins-stat"> {c.lesson.stat.text} · {c.lesson.stat.patch} solo queue</span>}</span> : <span className="muted">—</span>)}
          </tbody>
        </table>
      </div>
    </section>
  );
}

const cap = (t: string) => t[0].toUpperCase() + t.slice(1);

export { draftHref };
