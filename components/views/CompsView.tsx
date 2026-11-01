"use client";
// Comp Library: each shell reads as a draft board. Five champions across the top (hover for the quick card, click for
// the drawer), each with a short job label (lib/comp-copy.ts; the full job is on the hover card and drawer), then the
// win condition, one supporting line, actions, and the full "why" plus sources behind Details. Swaps hide behind a
// "N swaps" control; picking one previews that variation in place (never saved, never pro evidence: swaps are
// General Draft Logic, even on an observed pro comp) and compares it with the original on the comp check.
// Observed Pro Comps the weekly discovery added (lib/comp-discovery.ts) use the same card; observed variations of any
// comp (other lineups pro teams played under it, each with its game) sit behind an "N observed variations" control.
// Pro swaps alan approved (data/comp-review.json) are the one exception to "swaps are general logic": they lead the
// slot's list under their own pro heading, and the same control lists each with its games, series, teams and patches
// (a small sample under 3 series). A historical mark names the last patch pros picked a slot's champion there. A named
// variant (alan, 2026-10-16) has no card of its own: its parent's card switches to it in place, with its own lineup,
// swaps, win condition, sources and evidence; links to the variant's id open the parent on that variant.
// Named variations (alan, 2026-10-17) lead the observed list: one lineup with its name, alan's approved note, the comp
// check's read and the lineups that play the same way. A family line names the comp's strategic family and links the
// other comps in it; each keeps its own card. An archetype (alan, 2026-10-25, Protect · Yunara pilot) turns its core
// comp's card into the parent: the archetype's win condition and plan lead the foot, the core lineup stays the board,
// and its named variations (named lineups and whole member comps, which have no card of their own) are rows beside it,
// each with its sample, how it enables the carry, which typical jobs it keeps, replaces, shares or gives up (the comp
// check), its tradeoff and, expanded, its lineup and games. A filed lineup under review is shown apart and not counted.
// Comparison pass (alan, 2026-10-26): every archetype row, the core first, shows its five champions at once (the ones
// that differ from the core in full colour), its sample, its own difficulty and one line on how it differs; jobs, notes,
// reads and games stay behind Details. Each card names what its evidence stands on (games, series, teams, newest game):
// a count of drafts that were played, never proof the comp works. Search (champion or comp), Strategy and Sort sit with
// Type and Difficulty; every filter is in the URL and a link to a comp a filter hides clears the filters and opens it.
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChampionDrawer, compLinks, useDrawerIndex, type CompContext, type DrawerContext, type DrawerTarget } from "@/components/ChampionDrawer";
const COMPS: DrawerContext = { page: "comps" };
import { ChampionHoverCard, useHoverIntent } from "@/components/ChampionInteraction";
import { useLeave } from "@/components/useLeave";
import { CompFreshness } from "@/components/CompFreshness";
import { Select } from "@/components/Select";
import { ChampIcon, PageHeader, SourceBadge } from "@/components/ui";
import { jobLabel, WHY_LINE } from "@/lib/comp-copy";
import { championsOf, LEVEL, plainVariations, PRO_SWAP_SAMPLE, strategiesOf, type Archetype, type ArchetypeRow, type CardEvidence, type IdentityId, type JobRead, type Level,
  type LibraryExtra, type NamedVariation, type ObservedGame, type ObservedLineup, type ProSwap } from "@/lib/comp-library";
import { IDENTITY_LABEL } from "@/lib/comp-discovery";
import { resultsToTop } from "@/lib/motion";
import { draftHref, shellDraft, variationDiff } from "@/lib/comp-preview";
import type { DrawerData } from "@/lib/data";
import { shortDate } from "@/lib/evidence";
import { ROLES, type CompShell, type ProDraft, type Role, type Source } from "@/lib/schema";
import { patchLabel } from "@/lib/patch";

type Slot = { shell: string; role: Role };
type Swaps = Partial<Record<Role, string>>;

const compOf = (s: CompShell, swaps: Swaps = {}): CompContext => ({
  name: s.name,
  slots: shellDraft(s, swaps),
  jobs: Object.fromEntries(ROLES.map((r) => [r, s.slots[r].job])),
  swaps: Object.fromEntries(ROLES.map((r) => [r, s.slots[r].swaps])),
  proDraftId: s.proDraftId,
});

// Display difficulty: three levels. The data keeps "easy-medium"; it reads as Medium here (sorted before plain medium).
const DIFF_ORDER = ["easy", "easy-medium", "medium", "hard"] as const;
const LEVELS_IN_ORDER: Level[] = ["easy", "medium", "hard"];
const LEVEL_LABEL: Record<Level, string> = { easy: "Easy", medium: "Medium", hard: "Hard" };
const ROLE_LABEL: Record<Role, string> = { TOP: "Top", JUNGLE: "Jungle", MID: "Mid", BOT: "Bot", SUPPORT: "Support" };
const tag = (s: string) => { const t = s.replace(/-/g, " "); return t.charAt(0).toUpperCase() + t.slice(1); };
const plural = (n: number, w: string) => `${n} ${w}${n === 1 || w === "series" ? "" : "s"}`;
/** "3 series · 3 teams · 26.20, 26.18": the sample a pro swap stands on. */
const swapSample = (p: ProSwap) => `${plural(p.series, "series")} · ${plural(p.teams, "team")} · ${p.patches.map(patchLabel).join(", ")}`;
const proSwapsOf = (x?: LibraryExtra) => ROLES.flatMap((r) => (x?.proSwaps?.[r] ?? []).map((p) => ({ role: r, ...p })));

/** Search text: lower case, accents and punctuation dropped, so "kaisa" finds Kai'Sa. */
const norm = (t: string) => t.toLowerCase().normalize("NFD").replace(/[^a-z0-9]/g, "");
const SORTS: { value: string; label: string }[] = [{ value: "", label: "Easiest first" }, { value: "recent", label: "Newest game" }, { value: "games", label: "Most games" }];
/** A card's difficulty levels: an archetype's core and each named variation keep their own. */
const levelsOf = (s: CompShell, x?: LibraryExtra): Level[] => {
  const a = x?.archetype;
  const all = a ? [a.core, ...a.members].flatMap((r) => r.difficulty ? [r.difficulty] : []) : [LEVEL[s.difficulty]];
  return LEVELS_IN_ORDER.filter((l) => all.includes(l));
};

export function CompsView({ names, sources, drafts, allShells, extras, evidence, lastAddition, data }: {
  names: Record<string, string>; sources: Record<string, Source>; drafts: Record<string, ProDraft>; allShells: CompShell[];
  extras: Record<string, LibraryExtra>; evidence: Record<string, CardEvidence>; lastAddition: string | null; data: DrawerData;
}) {
  const index = useDrawerIndex(data);
  const [open, setOpen] = useState<Slot | undefined>(undefined);
  const [hover, setHover] = useState<Slot | undefined>(undefined);
  const [menu, setMenu] = useState<Slot | undefined>(undefined);
  const [previews, setPreviews] = useState<Record<string, Swaps>>({});
  const [shownSources, setShownSources] = useState<Record<string, boolean>>({});
  const [shownVariations, setShownVariations] = useState<Record<string, boolean>>({});
  const [variantShown, setVariantShown] = useState<Record<string, string | undefined>>({});
  const [archOpen, setArchOpen] = useState<Record<string, boolean>>({});
  // A champion opened from an archetype row's lineup: the drawer reads that lineup as its comp.
  const [free, setFree] = useState<{ target: DrawerTarget & { role: Role }; comp: CompContext } | undefined>(undefined);
  const freeComp = useRef<CompContext | undefined>(undefined);
  const opener = useRef<HTMLElement | null>(null);
  const openShell = open && allShells.find((s) => s.id === open.shell);
  const swapsOf = (id: string) => previews[id] ?? {};
  const close = () => {
    setOpen(undefined);
    setFree(undefined);
    // Back to the champion that opened the drawer, without scrolling the page.
    const el = opener.current;
    if (el && document.contains(el)) el.focus({ preventScroll: true });
  };
  const select = (slot: Slot, el?: HTMLElement | null) => {
    if (!open && !free && el) opener.current = el;
    intent.hide();
    setMenu(undefined);
    setFree(undefined);
    setOpen(slot);
  };
  const openFree = (target: DrawerTarget & { role: Role }, comp: CompContext, el: HTMLElement) => {
    if (!open && !free) opener.current = el;
    intent.hide();
    setMenu(undefined);
    setOpen(undefined);
    setFree({ target, comp });
  };
  const hoverFree = (t?: { id: string; role: Role; comp: CompContext; el: HTMLElement }) => {
    setHover(undefined);
    if (t) { freeComp.current = t.comp; intent.hover({ id: t.id, role: t.role }, t.el); } else intent.unhover();
  };
  const preview = (shell: string, role: Role, champ: string | undefined) => {
    setPreviews((p) => {
      const next = { ...p[shell], [role]: champ };
      if (!champ) delete next[role];
      return { ...p, [shell]: next };
    });
    setMenu(undefined);
  };
  // Hover: comp-mate highlights at once, the quick card after a short pause (out of the page flow, in a portal).
  const intent = useHoverIntent();
  const onHover = (s: CompShell, role?: Role, el?: HTMLElement, id?: string) => {
    setHover(role ? { shell: s.id, role } : undefined);
    if (role && el) intent.hover({ id: id ?? shellDraft(s, swapsOf(s.id))[role], role }, el); else intent.unhover();
  };
  const quick = useLeave(intent.card && !open && !free ? intent.card : undefined);
  const onFree = !!quick.shown?.el.closest(".arch-lineup");
  const cardShellId = quick.shown?.el.closest("article.shell")?.id;
  const cardShell = cardShellId ? allShells.find((x) => x.id === cardShellId) : undefined;
  // Highlights follow the hovered or focused champion, else the open one.
  const active = hover ?? open;
  const params = useSearchParams();
  // Filters live in the URL and change in place (history, never a route change), like every other page's filters.
  const [query, setQuery] = useState(() => new URLSearchParams(params));
  useEffect(() => setQuery(new URLSearchParams(params)), [params]);
  const set = (o: Record<string, string | undefined>, keepHash = false) => {
    const next = new URLSearchParams(query);
    for (const [k, v] of Object.entries(o)) if (v) next.set(k, v); else next.delete(k);
    setQuery(next);
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${next.size ? `?${next}` : ""}${keepHash ? window.location.hash : ""}`);
    if (!keepHash) resultsToTop(".shell-grid");
  };
  // Pro comps by default (alan, 2026-10-12); "all" and "generalized" (Template) are one click away.
  const rawKind = query.get("kind");
  const kind = rawKind === "all" ? undefined : rawKind === "generalized" ? "generalized" : "observed";
  const rawDiff = query.get("difficulty") || undefined;
  const level = rawDiff && rawDiff in LEVEL ? LEVEL[rawDiff as CompShell["difficulty"]] : undefined;
  const rawStrategy = query.get("strategy") || undefined;
  const strategy = rawStrategy && rawStrategy in IDENTITY_LABEL ? rawStrategy as IdentityId : undefined;
  const sort = query.get("sort") === "recent" ? "recent" : query.get("sort") === "games" ? "games" : undefined;
  const q = norm(query.get("q") ?? "");
  const cards = allShells.filter((s) => !extras[s.id]?.variantOf && !extras[s.id]?.inArchetype);
  // What each card can be found by: its names, champions and strategies (an archetype's rows and variants included).
  const finder = useMemo(() => Object.fromEntries(cards.map((s) => {
    const x = extras[s.id], { board, filed } = championsOf(s, x, allShells);
    const texts = [s.name, ...(x?.variants ?? []).map((v) => v.name), ...(x?.archetype ? [x.archetype.name, ...x.archetype.members.map((r) => r.name)] : [])].map(norm);
    const strategies = new Set([s, ...(x?.variants ?? []).flatMap((v) => allShells.filter((y) => y.id === v.id))].flatMap((c) => strategiesOf(c, extras[c.id]?.discovered)));
    return [s.id, { texts, board: [...board], filed: [...filed], strategies }];
  })), [cards, extras, allShells]);
  const strategyCount = (id: IdentityId) => cards.filter((s) => finder[s.id].strategies.has(id)).length;
  const strategyOptions = [{ value: "", label: "All strategies" },
    ...(Object.keys(IDENTITY_LABEL) as IdentityId[]).filter((id) => strategyCount(id) > 0).map((id) => ({ value: id, label: `${IDENTITY_LABEL[id]} · ${strategyCount(id)}` }))];
  // A champion found only in a filed lineup or swap is named on the card, so the match is never a mystery.
  const filedHits = (id: string) => q ? finder[id].filed.filter((c) => norm(names[c] ?? c).includes(q)) : [];
  const matches = (s: CompShell) => !q || finder[s.id].texts.some((t) => t.includes(q)) || finder[s.id].board.some((c) => norm(names[c] ?? c).includes(q)) || filedHits(s.id).length > 0;
  const recency = (s: CompShell) => evidence[s.id]?.latest ?? "";
  const shells = [...cards]
    .filter((s) => !kind || s.kind === kind)
    .filter((s) => !level || levelsOf(s, extras[s.id]).includes(level))
    .filter((s) => !strategy || finder[s.id].strategies.has(strategy))
    .filter(matches)
    .sort((a, b) => sort === "recent" ? recency(b).localeCompare(recency(a)) || (evidence[b.id]?.games ?? 0) - (evidence[a.id]?.games ?? 0)
      : sort === "games" ? (evidence[b.id]?.games ?? 0) - (evidence[a.id]?.games ?? 0) || (evidence[b.id]?.series ?? 0) - (evidence[a.id]?.series ?? 0) || recency(b).localeCompare(recency(a))
      : DIFF_ORDER.indexOf(a.difficulty) - DIFF_ORDER.indexOf(b.difficulty));
  // A link to a comp (#id, also a comp inside an archetype or a named variant) opens it, whatever the filters say: a
  // comp the filters hide clears them first. The cards render in the browser, after its own jump to the hash ran.
  const [target, setTarget] = useState<string | undefined>(undefined);
  useEffect(() => {
    const read = () => setTarget(decodeURIComponent(window.location.hash.slice(1)) || undefined);
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);
  useEffect(() => {
    if (!target) return;
    // A named variant lives inside its parent's card: open the parent on it.
    const parent = extras[target]?.variantOf?.parent;
    if (parent) setVariantShown((v) => ({ ...v, [parent]: target }));
    const id = parent ?? target;
    // A comp inside an archetype is a row of its parent's card, which carries the comp's id: open the row there.
    const inArch = extras[id]?.inArchetype;
    const card = inArch?.parent ?? id;
    if (!allShells.some((s) => s.id === card)) { setTarget(undefined); return; }
    if (!shells.some((s) => s.id === card)) { set({ kind: "all", difficulty: undefined, strategy: undefined, q: undefined }, true); return; }
    if (inArch) setArchOpen((o) => ({ ...o, [id]: true }));
    setTarget(undefined);
    requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView());
  }, [target, query.toString()]);
  // An open swap list closes on Escape or a press anywhere outside its slot.
  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setMenu(undefined); };
    const onDown = (e: PointerEvent) => { if (!(e.target as Element | null)?.closest(".lu-slot.menu-open")) setMenu(undefined); };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("pointerdown", onDown); };
  }, [menu]);
  const KINDS: [string, string][] = [["all", "All"], ["observed", "Pro"], ["generalized", "Template"]];
  const LEVELS: [Level | undefined, string][] = [[undefined, "All"], ["easy", "Easy"], ["medium", "Medium"], ["hard", "Hard"]];
  const filtered = !!(level || strategy || q || kind !== "observed");
  return (
    <>
      <PageHeader title="Comp Library" />
      <CompFreshness lastAddition={lastAddition} />
      <div className="filters comp-filters">
        <input type="search" className="comp-search" placeholder="Champion or comp" aria-label="Search comps by champion or name"
          value={query.get("q") ?? ""} onChange={(e) => set({ q: e.target.value || undefined })} />
        <span className="filter-group"><span className="filter-label">Type</span>
          <span className="seg" role="group" aria-label="Type">{KINDS.map(([k, l]) => (
            <button key={l} type="button" className={(kind ?? "all") === k ? "active" : undefined} aria-pressed={(kind ?? "all") === k}
              onClick={() => set({ kind: k === "observed" ? undefined : k })}>{l}</button>
          ))}</span>
        </span>
        <span className="filter-group"><span className="filter-label">Difficulty</span>
          <span className="seg" role="group" aria-label="Difficulty">{LEVELS.map(([d, l]) => (
            <button key={l} type="button" className={level === d ? "active" : undefined} aria-pressed={level === d} onClick={() => set({ difficulty: d })}>{l}</button>
          ))}</span>
        </span>
        <Select label="Strategy" value={strategy ?? ""} options={strategyOptions} onChange={(v) => set({ strategy: v || undefined })} />
        <Select label="Sort" value={sort ?? ""} options={SORTS} onChange={(v) => set({ sort: v || undefined })} />
        <span className="count">{shells.length} of {cards.length} comps
          {filtered && <> · <button type="button" className="src-toggle" onClick={() => set({ kind: undefined, difficulty: undefined, strategy: undefined, q: undefined })}>Clear</button></>}
        </span>
      </div>
      {!shells.length && <p className="muted small comp-empty">No comp matches these filters.{kind === "observed" && " Templates are under Type: All."}</p>}
      <div className="shell-grid">
        {shells.map((card) => {
          const named = extras[card.id]?.variants ?? [];
          const shownId = variantShown[card.id];
          const s = (shownId && allShells.find((x) => x.id === shownId)) || card;
          const d = s.proDraftId ? drafts[s.proDraftId] : undefined;
          const swaps = swapsOf(s.id);
          const swapped = ROLES.filter((r) => swaps[r]);
          const srcs = [...new Set(s.sources)].map((id) => sources[id]).filter(Boolean);
          const showSrc = !!shownSources[s.id];
          const whyLine = WHY_LINE[s.id] ?? s.why;
          const x = extras[s.id];
          const read = x?.discovered;
          const hasDetails = srcs.length > 0 || whyLine !== s.why || !!read || !!x?.archetype;
          const arch = x?.archetype;
          const nVar = x ? plainVariations(x).length : 0, nGames = x?.games.length ?? 0, nPro = proSwapsOf(x).length;
          // Historical slots grouped by patch: "Zeri + Yuumi last seen 26.16".
          const hist = Object.entries(x?.historical ?? {}).reduce<Record<string, Role[]>>((m, [r, p]) => ({ ...m, [p]: [...(m[p] ?? []), r as Role] }), {});
          const showVar = !!shownVariations[s.id];
          const levels = levelsOf(s, x), hits = filedHits(card.id);
          return (
            <article key={card.id} id={card.id} className={`panel shell ${s.kind}${arch ? " archetype" : ""} ${swapped.length ? "previewing" : ""}`}>
              <header className="shell-head">
                <div className="row between">
                  <h2>{card.name}</h2>
                  <span className="row tight shell-kind">
                    {s.kind === "observed" ? <SourceBadge layer="pro" label="Pro" /> : <span className="src logic"><span className="ldot" />Template</span>}
                    <span className="xs muted" title={arch ? `Each lineup keeps its own difficulty: ${[arch.core, ...arch.members].map((r) => `${r.kind === "core" ? "core" : r.name} ${r.difficulty ? LEVEL_LABEL[r.difficulty] : "not read"}`).join(", ")}` : undefined}>
                      {levels.map((l) => LEVEL_LABEL[l]).join("–")}
                    </span>
                  </span>
                </div>
                <span className="shell-tags xs muted">
                  {s.kind === "observed" && <span className="shell-by">{(read || s.proDraftId?.startsWith("golgg-")) && d ? `${d.team} vs ${d.opponent} · ${d.patch ? patchLabel(d.patch) : ""}` : `${s.observedBy}${d ? ` · ${d.seriesGame} vs ${d.opponent}` : ""}`}</span>}
                  {arch && <span className="shell-tag">Archetype · {plural(arch.members.length, "named variation")}</span>}
                  {s.identities.map((i) => <span key={i} className="shell-tag">{tag(i)}</span>)}
                  {Object.entries(hist).map(([p, roles]) => (
                    <span key={p} className="shell-tag shell-hist"
                      title={`No recorded pro game picks ${roles.map((r) => `${names[s.slots[r].champion]} in ${ROLE_LABEL[r]}`).join(" or ")} after patch ${patchLabel(p)}. The comp stays in the library.`}>
                      {roles.map((r) => names[s.slots[r].champion]).join(" + ")} last seen {patchLabel(p)}
                    </span>
                  ))}
                </span>
                <EvidenceLine e={evidence[s.id]} />
                {hits.length > 0 && <p className="shell-hit xs">{hits.map((c) => names[c] ?? c).join(", ")} in a lineup filed under this comp</p>}
                {x?.family && (
                  <p className="shell-family xs muted" title={x.family.note}>
                    {x.family.name} family: {x.family.others.map((o, i) => <span key={o.id}>{i > 0 && ", "}<a href={`#${o.id}`}>{o.name}</a></span>)}
                  </p>
                )}
                {named.length > 0 && (
                  <div className="seg shell-variants" role="group" aria-label={`${card.name} variants`}>
                    {[{ id: card.id, name: "Main" }, ...named].map((v) => (
                      <button key={v.id} type="button" className={s.id === v.id ? "active" : undefined} aria-pressed={s.id === v.id}
                        onClick={() => { setMenu(undefined); setVariantShown((x) => ({ ...x, [card.id]: v.id === card.id ? undefined : v.id })); }}>{v.name}</button>
                    ))}
                  </div>
                )}
              </header>
              <Lineup shell={s} swaps={swaps} names={names} data={data} index={index} pro={x?.proSwaps ?? {}}
                active={active?.shell === s.id ? active.role : undefined} selected={open?.shell === s.id ? open.role : undefined}
                menu={menu?.shell === s.id ? menu.role : undefined}
                onMenu={(role) => setMenu(role ? { shell: s.id, role } : undefined)}
                onPreview={(role, champ) => preview(s.id, role, champ)}
                onOpen={(role, el) => select({ shell: s.id, role }, el)} onHover={(role, el, id) => onHover(s, role, el, id)} />
              {swapped.length > 0 && <Preview shell={s} swaps={swaps} names={names} data={data} pro={x?.proSwaps ?? {}} onReset={() => setPreviews((p) => ({ ...p, [s.id]: {} }))} />}
              <div className="shell-foot">
                <p className="wc">{arch ? arch.winCondition : s.winCondition}</p>
                <p className="why">{arch ? arch.plan : whyLine}</p>
                <div className="row between shell-actions">
                  <span className="row shell-toggles">
                    {hasDetails && (
                      <button type="button" className="src-toggle" aria-expanded={showSrc} onClick={() => setShownSources((x) => ({ ...x, [s.id]: !showSrc }))}>
                        Details{srcs.length > 0 && <span className="faint"> · {srcs.length} source{srcs.length > 1 ? "s" : ""}</span>} <span aria-hidden="true">{showSrc ? "▴" : "▾"}</span>
                      </button>
                    )}
                    {(nPro > 0 || nVar > 0 || nGames > 0) && (() => {
                      const parts = [nPro > 0 && plural(nPro, "pro swap"), nVar > 0 && plural(nVar, "observed variation"), nGames > 0 && plural(nGames, "more game")].filter(Boolean) as string[];
                      return (
                        <button type="button" className="src-toggle var-toggle" aria-expanded={showVar} onClick={() => setShownVariations((v) => ({ ...v, [s.id]: !showVar }))}>
                          {parts[0]}{parts.length > 1 && <span className="faint"> · {parts.slice(1).join(" · ")}</span>} <span aria-hidden="true">{showVar ? "▴" : "▾"}</span>
                        </button>
                      );
                    })()}
                  </span>
                  {swapped.length
                    ? <Link className="btn sm primary" href={draftHref(shellDraft(s, swaps))}>Use variation in Draft Room →</Link>
                    : <Link className="btn sm" href={`/?shell=${s.id}`}>Use in Draft Room →</Link>}
                </div>
                {showVar && x && <Variations shell={s} extra={x} names={names} />}
                {showSrc && (
                  <div className="shell-details">
                    {arch && <p className="shell-why-full"><span className="faint">Core lineup</span> {s.winCondition}</p>}
                    {whyLine !== s.why && <p className="shell-why-full"><span className="faint">Why it works</span> {s.why}</p>}
                    {read && <ReadDetails read={read} />}
                    {srcs.length > 0 && <SourceList list={srcs} />}
                  </div>
                )}
              </div>
              {arch && <ArchetypeRows arch={arch} names={names} open={archOpen} onToggle={(id) => setArchOpen((o) => ({ ...o, [id]: !o[id] }))}
                active={free?.target} onOpen={openFree} onHover={hoverFree} />}
            </article>
          );
        })}
      </div>
      {quick.shown && cardShell && quick.shown.t.role && (onFree ? freeComp.current : true) && (
        <ChampionHoverCard key={`${cardShell.id}-${quick.shown.t.role}-${quick.shown.t.id}`} target={quick.shown.t} anchor={quick.shown.el} swap={quick.shown.swap} data={data} index={index}
          comp={onFree ? freeComp.current! : compOf(cardShell, { ...swapsOf(cardShell.id), [quick.shown.t.role]: quick.shown.t.id })}
          side={quick.shown.el.classList.contains("lu-slot") ? "below" : "beside"}
          leaving={quick.leaving} onGone={quick.end} onEnter={intent.keep} onLeave={intent.unhover} />
      )}
      {free && (
        <ChampionDrawer target={free.target} comp={free.comp} data={data} index={index} context={COMPS} onClose={close}
          onSelect={(t: DrawerTarget) => t.role && setFree({ target: { id: t.id, role: t.role }, comp: free.comp })} />
      )}
      {open && openShell && (
        <ChampionDrawer target={{ id: shellDraft(openShell, swapsOf(openShell.id))[open.role], role: open.role }} comp={compOf(openShell, swapsOf(openShell.id))}
          data={data} index={index} context={COMPS} onClose={close} onSelect={(t: DrawerTarget) => t.role && setOpen({ shell: open.shell, role: t.role })} />
      )}
    </>
  );
}

function Lineup({ shell: s, swaps, names, data, index, pro: proSwaps, active, selected, menu, onMenu, onPreview, onOpen, onHover }: {
  shell: CompShell; swaps: Swaps; names: Record<string, string>; data: DrawerData; index: ReturnType<typeof useDrawerIndex>;
  pro: NonNullable<LibraryExtra["proSwaps"]>;
  active?: Role; selected?: Role; menu?: Role;
  onMenu: (role?: Role) => void; onPreview: (role: Role, champ: string | undefined) => void;
  onOpen: (role: Role, el: HTMLElement) => void; onHover: (role?: Role, el?: HTMLElement, id?: string) => void;
}) {
  const picks = shellDraft(s, swaps);
  const links = active ? compLinks({ id: picks[active], role: active }, compOf(s, swaps), data, index) : undefined;
  // Swap lists open on a short hover (mouse) or a click; leaving the slot closes a hover-opened list.
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const byHover = useRef(false);
  useEffect(() => () => clearTimeout(timer.current), []);
  const item = (x: string, note?: string, hint?: string) => {
    const r = menu!;
    return (
      <button key={x} type="button" role="menuitem" className={`swap-item ${swaps[r] === x ? "on" : ""}`} aria-current={swaps[r] === x || undefined} title={hint}
        onClick={() => { onHover(undefined); onPreview(r, swaps[r] === x ? undefined : x); }}
        onPointerEnter={(e) => { if (e.pointerType === "mouse") onHover(r, e.currentTarget, x); }}
        onPointerLeave={(e) => { if (e.pointerType === "mouse") onHover(undefined); }}>
        <ChampIcon id={x} name={names[x]} role={r} size="sm" /><span>{names[x]}</span>{note && <span className="xs faint">{note}</span>}
      </button>
    );
  };
  return (
    <div className={`lineup ${active ? "linking" : ""} ${selected ? "selecting" : ""}`}>
      {ROLES.map((r) => {
        const id = picks[r];
        const slot = s.slots[r];
        const saved = links?.savedRoles.has(r);
        const pro = links?.proRoles.get(r);
        const isSwap = !!swaps[r];
        // Pro swaps lead; a champion that is also a general-logic swap is listed once, under pro.
        const proList = proSwaps[r] ?? [];
        const logicList = slot.swaps.filter((x) => !proList.some((p) => p.champion === x));
        const nSwaps = proList.length + logicList.length;
        const cls = ["lu-slot", `role-${r}`, `lu-${r.toLowerCase()}`, r === active && "is-active", r === selected && "is-open", saved && "has-saved",
          pro && "has-pro", isSwap && "is-swapped", menu === r && "menu-open"].filter(Boolean).join(" ");
        const mark = saved ? "Saved pairing with the highlighted pick" : pro ? `Pro evidence with the highlighted pick${pro.games.length ? ` (${pro.games.length} game${pro.games.length > 1 ? "s" : ""})` : ""}` : undefined;
        return (
          <div key={r} className={cls} data-drawer-trigger
            onPointerLeave={(e) => { if (e.pointerType === "mouse" && byHover.current) { clearTimeout(timer.current); timer.current = setTimeout(() => onMenu(undefined), 200); } }}
            onPointerEnter={(e) => { if (e.pointerType === "mouse" && menu === r) clearTimeout(timer.current); }}>
            <button type="button" className="lu-champ" aria-haspopup="dialog" aria-expanded={r === selected}
              aria-label={`${names[id]}, ${r.toLowerCase()}${isSwap ? ` (preview swap for ${names[slot.champion]})` : ""}: open details`}
              title={mark}
              onClick={(e) => onOpen(r, e.currentTarget)}
              // The quick card anchors to the whole slot and opens below the lineup, so it never covers a comp-mate.
              onPointerEnter={(e) => { if (e.pointerType === "mouse") onHover(r, e.currentTarget.parentElement!); }}
              onPointerLeave={(e) => { if (e.pointerType === "mouse") onHover(undefined); }}
              onFocus={(e) => { if (e.currentTarget.matches(":focus-visible")) onHover(r, e.currentTarget.parentElement!); }} onBlur={() => onHover(undefined)}>
              <span className={`role-tag role-${r}`}>{ROLE_LABEL[r]}</span>
              <ChampIcon id={id} name={names[id]} role={r} size="lg" />
              <b className="lu-name">{names[id]}</b>
            </button>
            <p className="lu-job" title={slot.job}>{isSwap ? <span className="lu-for">for {names[slot.champion]}</span> : jobLabel(slot.job)}</p>
            {nSwaps > 0 && (
              <button type="button" className={`lu-swaps ${proList.length ? "has-pro-swap" : ""}`} aria-expanded={menu === r} aria-haspopup="menu"
                aria-label={isSwap ? `Swapped: swaps for ${names[slot.champion]}` : `${plural(nSwaps, "swap")} for ${names[slot.champion]}${proList.length ? `, ${proList.length} from pro games` : ""}`}
                onPointerEnter={(e) => {
                  if (e.pointerType !== "mouse" || menu === r) return;
                  clearTimeout(timer.current);
                  timer.current = setTimeout(() => { byHover.current = true; onMenu(r); }, 180);
                }}
                onClick={() => {
                  clearTimeout(timer.current);
                  // A click on a list the pointer just opened keeps it open (and pinned); otherwise it toggles.
                  if (menu === r && byHover.current) { byHover.current = false; return; }
                  byHover.current = false;
                  onMenu(menu === r ? undefined : r);
                }}>
                {proList.length > 0 && !isSwap && <span className="ldot" aria-hidden="true" />}
                <span className="lu-swaps-n">{isSwap ? "Swapped" : plural(nSwaps, "swap")}</span>
              </button>
            )}
            {menu === r && (
              <div className="swap-menu" role="menu" aria-label={`Swaps for ${names[slot.champion]}`}>
                {isSwap && (
                  <button type="button" role="menuitem" className="swap-item original" onClick={() => onPreview(r, undefined)}>
                    <ChampIcon id={slot.champion} name={names[slot.champion]} role={r} size="sm" /><span>{names[slot.champion]}</span><span className="xs faint">original</span>
                  </button>
                )}
                {proList.length > 0 && <span className="swap-menu-head pro"><span className="ldot" />Pro swaps · observed</span>}
                {proList.map((p) => item(p.champion, swaps[r] === p.champion ? "previewing" : plural(p.series, "series"), swapSample(p)))}
                {logicList.length > 0 && <span className="swap-menu-head"><span className="ldot" />Swaps · General logic</span>}
                {logicList.map((x) => item(x, swaps[r] === x ? "previewing" : undefined))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** The preview state: what changed, how the comp check moves, and the way back. General Draft Logic only. */
function Preview({ shell: s, swaps, names, data, pro, onReset }: {
  shell: CompShell; swaps: Swaps; names: Record<string, string>; data: DrawerData; pro: NonNullable<LibraryExtra["proSwaps"]>; onReset: () => void;
}) {
  const diff = variationDiff(shellDraft(s), shellDraft(s, swaps), data.champions);
  const swapped = ROLES.filter((r) => swaps[r]);
  const proSwapped = swapped.flatMap((r) => { const p = pro[r]?.find((x) => x.champion === swaps[r]); return p ? [p] : []; });
  const logicSwapped = swapped.length - proSwapped.length;
  const none = !diff.changes.length && !diff.added.length && !diff.cleared.length;
  return (
    <section className="shell-preview" aria-live="polite">
      <div className="row between">
        <span className="pv-title"><span className="ldot" /><b>Preview</b>{" "}
          {swapped.map((r) => `${names[swaps[r]!]} for ${names[s.slots[r].champion]}`).join(", ")}</span>
        <button type="button" className="btn sm ghost" onClick={onReset}>Reset</button>
      </div>
      {proSwapped.map((p) => (
        <p key={p.champion} className="pv-note pv-pro">{names[p.champion]} is a pro swap: {swapSample(p)}{p.series < PRO_SWAP_SAMPLE ? ", a small sample" : ""}. A supported alternative, not an established meta pick.</p>
      ))}
      {logicSwapped > 0 && <p className="pv-note">{s.kind === "observed" ? "Not in the observed pro draft. " : ""}{proSwapped.length ? "The other swap is" : "Swaps are"} general draft logic, not pro evidence.</p>}
      {proSwapped.length > 0 && <p className="pv-note">The comp check below is general draft logic.</p>}
      <p className="pv-check">
        {none && <span className="muted">Comp check unchanged.</span>}
        {diff.changes.map((c) => <span key={c.label} className="pv-chg">{c.label} <span className="tnum">{c.from} → {c.to}</span></span>)}
        {diff.added.map((w) => <span key={w.id} className="pv-warn" title={w.why}>New: {w.label}</span>)}
        {diff.cleared.map((w) => <span key={w.id} className="pv-ok" title={w.rule}>Clears: {w.label}</span>)}
      </p>
    </section>
  );
}

const SEV_LABEL = { major: "Major", moderate: "Moderate", minor: "Minor" } as const;

/** A discovered comp's read: the comp check's view of the lineup (General Draft Logic), apart from the game evidence. */
function ReadDetails({ read }: { read: NonNullable<LibraryExtra["discovered"]> }) {
  return (
    <div className="shell-read">
      <span className="pv-title"><span className="ldot" /><b>Comp check read</b> <span className="faint">· general draft logic, added {shortDate(read.addedOn)}</span></span>
      {read.winCondition && <p><span className="faint">Win condition</span> {read.winCondition}</p>}
      {read.strengths.length > 0 && <p><span className="faint">Strengths</span> {read.strengths.join("; ")}</p>}
      <p><span className="faint">Weak points</span> {read.weaknesses.length ? read.weaknesses.map((w) => `${w.label} (${SEV_LABEL[w.severity].toLowerCase()})`).join("; ") : "none found"}</p>
      {read.timing && <p><span className="faint">Timing</span> {read.timing}</p>}
    </div>
  );
}

function GameLink({ g }: { g: ObservedGame }) {
  return (
    <span className="var-game">
      <a href={g.url} target="_blank" rel="noopener noreferrer" title={g.tournament}>{g.team} vs {g.opponent}</a>
      <span className={g.won ? "var-w" : "var-l"}>{g.won ? "W" : "L"}</span>
      <span className="faint">{shortDate(g.date)} · {patchLabel(g.patch)}</span>
    </span>
  );
}

/** Observed variations: other lineups pro teams played under this comp, and replays of its own lineup. Pro evidence. */
function Variations({ shell: s, extra, names }: { shell: CompShell; extra: LibraryExtra; names: Record<string, string> }) {
  return (
    <ul className="shell-variations" aria-label={`Observed lineups for ${s.name}`}>
      {proSwapsOf(extra).map((p) => (
        <li key={`${p.role}-${p.champion}`} className="var-row var-swap">
          <span className="var-what">
            <ChampIcon id={p.champion} name={names[p.champion]} role={p.role} size="xs" />
            <span>Pro swap: {names[p.champion]} for {names[s.slots[p.role].champion]} <span className="faint">· {ROLE_LABEL[p.role]}</span></span>
          </span>
          <span className="var-sample">{swapSample(p)}{p.series < PRO_SWAP_SAMPLE && <span className="faint"> · small sample</span>}</span>
          <span className="var-games">{p.games.map((g) => <GameLink key={`${g.game}-${g.side}`} g={g} />)}</span>
        </li>
      ))}
      {extra.games.length > 0 && (
        <li className="var-row">
          <span className="var-what">Same lineup</span>
          <span className="var-games">{extra.games.map((g) => <GameLink key={`${g.game}-${g.side}`} g={g} />)}</span>
        </li>
      )}
      {plainVariations(extra).map((v) => {
        const changed = ROLES.filter((r) => v.picks[r] !== s.slots[r].champion);
        if (v.named) return <NamedRow key={ROLES.map((r) => v.picks[r]).join("|")} shell={s} v={v} n={v.named} names={names} />;
        return (
          <li key={ROLES.map((r) => v.picks[r]).join("|")} className="var-row">
            <span className="var-lineup" aria-label={ROLES.map((r) => names[v.picks[r]]).join(", ")}>
              {ROLES.map((r) => <span key={r} className={changed.includes(r) ? "var-pick diff" : "var-pick"}><ChampIcon id={v.picks[r]} name={names[v.picks[r]]} role={r} size="xs" /></span>)}
            </span>
            <span className="var-what">{changed.map((r) => `${names[v.picks[r]]} for ${names[s.slots[r].champion]}`).join(", ")}</span>
            <span className="var-games">
              {v.games.map((g) => <GameLink key={`${g.game}-${g.side}`} g={g} />)}
              <Link className="var-draft" href={draftHref(v.picks)}>Draft Room →</Link>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function NamedRow({ shell: s, v, n, names }: { shell: CompShell; v: ObservedLineup; n: NamedVariation; names: Record<string, string> }) {
  const changed = ROLES.filter((r) => v.picks[r] !== s.slots[r].champion);
  return (
    <li className="var-row var-named">
      <span className="var-lineup" aria-label={ROLES.map((r) => names[v.picks[r]]).join(", ")}>
        {ROLES.map((r) => <span key={r} className={changed.includes(r) ? "var-pick diff" : "var-pick"}><ChampIcon id={v.picks[r]} name={names[v.picks[r]]} role={r} size="xs" /></span>)}
      </span>
      <span className="var-what"><b>{n.name}</b> <span className="faint">· {changed.map((r) => `${names[v.picks[r]]} for ${names[s.slots[r].champion]}`).join(", ")}</span></span>
      <span className="var-games">
        {v.games.map((x) => <GameLink key={`${x.game}-${x.side}`} g={x} />)}
        <Link className="var-draft" href={draftHref(v.picks)}>Draft Room →</Link>
      </span>
      <div className="var-note">
        <p>{n.note}</p>
        {n.read && (
          <p className="faint">Comp check read: {n.read.identity}. {n.read.timing}{n.read.weaknesses.length ? ` Weak points: ${n.read.weaknesses.map((w) => `${w.label} (${w.severity})`).join(", ")}.` : " No weak points."}</p>
        )}
        {n.alike.map((a) => (
          <p key={ROLES.map((r) => a.picks[r]).join("|")} className="var-alike">
            <span className="faint">Plays the same way:</span> {ROLES.map((r) => names[a.picks[r]]).join(", ")}{" "}
            {a.games.map((x) => <GameLink key={`${x.game}-${x.side}`} g={x} />)}
          </p>
        ))}
      </div>
    </li>
  );
}

const JOB_LABEL: Record<JobRead["job"], string> = { carry: "Damage", peel: "Peel", front: "Front", start: "Fights" };
const JOB_HINT: Record<JobRead["job"], string> = {
  carry: "Who deals the main damage, from the comp check. The plan usually runs through the carry alone.",
  peel: "Peel and disengage around the carry. The plan usually has two sources.",
  front: "Someone in front of the carry. The plan usually has at least one frontliner.",
  start: "How fights start. The plan usually waits for the enemy to come in, with no on-demand engage.",
};
const list = (ids: string[], names: Record<string, string>) => ids.map((c) => names[c] ?? c).join(", ");
function jobText(j: JobRead, names: Record<string, string>) {
  if (j.job === "carry") return j.champions.map((c) => names[c] ?? c).join(" + ");
  if (j.job === "start") return j.champions.length ? `${list(j.champions, names)} start${j.champions.length > 1 ? "" : "s"} fights` : "waits for the enemy";
  if (j.job === "front") return j.champions.length ? list(j.champions, names) : "no frontliner";
  return j.champions.length ? (j.state === "keeps" ? list(j.champions, names) : `only ${list(j.champions, names)}`) : "none";
}
/** The four typical jobs as one row reads them: what does each, and whether it keeps, replaces, shares or gives it up. */
function JobLine({ jobs, names }: { jobs: JobRead[]; names: Record<string, string> }) {
  return (
    <dl className="arch-jobs">
      {jobs.map((j) => (
        <div key={j.job} className={`aj ${j.state.replace(" ", "-")}`}>
          <dt title={JOB_HINT[j.job]}>{JOB_LABEL[j.job]}</dt>
          <dd>{jobText(j, names)}{j.state !== "keeps" && <span className="aj-state"> · {j.state}</span>}</dd>
        </div>
      ))}
    </dl>
  );
}
const sample = (r: ArchetypeRow) => `${plural(r.games.length, "game")}${r.alike.length ? ` · ${plural(r.alike.reduce((n, a) => n + a.games.length, 0), "more")} playing the same way` : ""}`;
const lineupNames = (p: ArchetypeRow["picks"], names: Record<string, string>) => ROLES.map((r) => names[p[r]] ?? p[r]).join(", ");

/** What a card's evidence stands on, in one quiet line: curated, discovered or template, the games with its own lineup
 *  and everything filed under it (games, series, teams) and the newest game. Never a claim that the comp works. */
function EvidenceLine({ e }: { e?: CardEvidence }) {
  if (!e) return null;
  if (e.origin === "template") return <p className="shell-evidence xs">Template · general draft logic, no recorded lineup</p>;
  const more = e.games > e.lineup;
  const lineup = e.lineup === 1 ? (more ? "lineup: 1 game" : "single-game example") : e.lineup ? `lineup: ${plural(e.lineup, "game")}, ${plural(e.lineupSeries, "series")}` : "lineup not recorded";
  return (
    <p className="shell-evidence xs" title="Recorded pro games filed under this comp. A comp being played shows it was drafted, not that it works.">
      <span>{e.origin === "curated" ? "Curated" : "Discovered"}</span>
      <span>{lineup}</span>
      {more && <span>{plural(e.games, "game")}, {plural(e.series, "series")}, {plural(e.teams, "team")} in all</span>}
      {e.latest && <span>last {shortDate(e.latest)}</span>}
    </p>
  );
}

/** How a row differs from the archetype's typical plan, from the comp check's job read: shared damage, thin peel, no
 *  frontliner, its own fight starts. "Keeps every typical job" when nothing moves. */
function diffParts(r: ArchetypeRow, names: Record<string, string>): { text: string; warn?: boolean }[] {
  const out: { text: string; warn?: boolean }[] = [];
  for (const j of r.jobs ?? []) {
    if (j.job === "carry" && j.state === "shares") out.push({ text: `damage shared with ${list(j.champions.slice(1), names)}` });
    if (j.job === "peel" && j.state === "gives up") out.push({ text: j.champions.length ? `only ${list(j.champions, names)} peels` : "no peel", warn: true });
    if (j.job === "front" && j.state === "gives up") out.push({ text: "no frontliner", warn: true });
    if (j.job === "start" && j.state === "replaces") out.push({ text: `${list(j.champions, names)} start${j.champions.length > 1 ? "" : "s"} fights` });
  }
  if (r.jobs && !out.length) out.push({ text: "keeps every typical job" });
  return out;
}

/** The archetype's core and named variations as comparison rows, then any filed lineup under review. Each row shows its
 *  five champions (those that differ from the core in full colour), its sample, its own difficulty and how it differs;
 *  jobs, notes, reads and games are behind Details. Every game is listed once, under its own row. */
function ArchetypeRows({ arch, names, open, onToggle, active, onOpen, onHover }: {
  arch: Archetype; names: Record<string, string>; open: Record<string, boolean>; onToggle: (id: string) => void;
  active?: DrawerTarget; onOpen: OpenFree; onHover: HoverFree;
}) {
  const item = (r: ArchetypeRow) => <ArchetypeItem key={r.id} row={r} arch={arch} names={names} open={!!open[r.id]} onToggle={() => onToggle(r.id)} active={active} onOpen={onOpen} onHover={onHover} />;
  return (
    <section className="arch-vars" aria-label={`${arch.name}: core and named variations`}>
      <h3 className="arch-sub">Core and {plural(arch.members.length, "named variation")} <span className="faint">· champions that differ from the core in full colour</span></h3>
      <ul className="arch-list">{[arch.core, ...arch.members].map(item)}</ul>
      {arch.review.length > 0 && (
        <>
          <h3 className="arch-sub">Needs review <span className="faint">· {arch.review.length}, not counted as a variation</span></h3>
          <ul className="arch-list">{arch.review.map(item)}</ul>
        </>
      )}
    </section>
  );
}

type OpenFree = (t: DrawerTarget & { role: Role }, comp: CompContext, el: HTMLElement) => void;
type HoverFree = (t?: { id: string; role: Role; comp: CompContext; el: HTMLElement }) => void;

/** A row's five champions, the core's order. Hover for the quick card, click for the drawer (reading this lineup). */
function RowLineup({ r, core, names, active, onOpen, onHover }: { r: ArchetypeRow; core: ArchetypeRow; names: Record<string, string>; active?: DrawerTarget; onOpen: OpenFree; onHover: HoverFree }) {
  const comp: CompContext = { name: r.kind === "core" ? `${r.name} · core` : r.name, slots: r.picks };
  const changed = ROLES.filter((role) => r.picks[role] !== core.picks[role]);
  return (
    <span className={`arch-lineup${r.kind === "core" ? " core" : ""}`}>
      {ROLES.map((role) => {
        const id = r.picks[role], diff = changed.includes(role);
        return (
          <button key={role} type="button" className={`arch-pick${diff ? " diff" : ""}${active?.id === id && active.role === role ? " is-open" : ""}`}
            aria-label={`${names[id] ?? id}, ${ROLE_LABEL[role].toLowerCase()}${r.kind === "core" ? "" : diff ? `, in place of ${names[core.picks[role]]}` : ", as in the core"}: open details`}
            onClick={(e) => onOpen({ id, role }, comp, e.currentTarget)}
            onPointerEnter={(e) => { if (e.pointerType === "mouse") onHover({ id, role, comp, el: e.currentTarget }); }}
            onPointerLeave={(e) => { if (e.pointerType === "mouse") onHover(undefined); }}
            onFocus={(e) => { if (e.currentTarget.matches(":focus-visible")) onHover({ id, role, comp, el: e.currentTarget }); }} onBlur={() => onHover(undefined)}>
            <ChampIcon id={id} name={names[id]} role={role} size="sm" />
          </button>
        );
      })}
      {r.kind !== "core" && changed.length > 0 && <span className="sr-only">Changed from the core: {changed.map((role) => `${names[r.picks[role]]} for ${names[core.picks[role]]}`).join(", ")}.</span>}
    </span>
  );
}

function ArchetypeItem({ row: r, arch, names, open, onToggle, active, onOpen, onHover }: {
  row: ArchetypeRow; arch: Archetype; names: Record<string, string>; open: boolean; onToggle: () => void;
  active?: DrawerTarget; onOpen: OpenFree; onHover: HoverFree;
}) {
  const core = arch.core;
  const detail = `arch-detail-${r.id}`;
  const parts = [...(r.via.length ? [{ text: `through ${r.via.join(" + ")}` }] : []), ...diffParts(r, names)];
  return (
    <li id={r.kind === "comp" ? r.id : undefined} className={`arch-item${r.why ? " review" : ""}${r.kind === "core" ? " core" : ""}`}>
      <div className="arch-line">
        <p className="arch-row-head">
          <b>{r.kind === "core" ? "Core" : r.name}</b>{" "}
          <span className="faint">· {sample(r)}{r.difficulty ? ` · ${LEVEL_LABEL[r.difficulty]}` : ""}</span>
        </p>
        <RowLineup r={r} core={core} names={names} active={active} onOpen={onOpen} onHover={onHover} />
      </div>
      {parts.length > 0 && (
        <p className="arch-diff">{parts.map((p, i) => <span key={p.text} className={p.warn ? "warn" : undefined}>{i === 0 ? p.text.charAt(0).toUpperCase() + p.text.slice(1) : p.text}</span>)}</p>
      )}
      {r.why && <p className="arch-why">{r.why}</p>}
      <button type="button" className="src-toggle" aria-expanded={open} aria-controls={detail} onClick={onToggle}>
        Details <span className="faint">· jobs, notes and {r.games.length === 1 ? "game" : "games"}</span> <span aria-hidden="true">{open ? "▴" : "▾"}</span>
      </button>
      {open && (
        <div id={detail} className="arch-detail">
          {r.jobs && <JobLine jobs={r.jobs} names={names} />}
          <p className="arch-note">{r.note}</p>
          <span className="var-games">
            {r.games.map((g) => <GameLink key={`${g.game}-${g.side}`} g={g} />)}
            <Link className="var-draft" href={r.kind === "comp" || r.kind === "core" ? `/?shell=${r.id}` : draftHref(r.picks)}>Draft Room →</Link>
          </span>
          {r.read && (
            <p className="faint">Comp check read: {r.read.identity}. {r.read.timing}{r.read.weaknesses.length ? ` Weak points: ${r.read.weaknesses.map((w) => `${w.label} (${w.severity})`).join(", ")}.` : " No weak points."}</p>
          )}
          {r.alike.map((a) => (
            <p key={ROLES.map((role) => a.picks[role]).join("|")} className="var-alike">
              <span className="faint">Plays the same way:</span> {lineupNames(a.picks, names)}{" "}
              {a.games.map((x) => <GameLink key={`${x.game}-${x.side}`} g={x} />)}
            </p>
          ))}
          {r.observed.map((v) => (
            <p key={ROLES.map((role) => v.picks[role]).join("|")} className="var-alike">
              <span className="faint">{v.named ? `${v.named.name}:` : "Observed with it:"}</span> {lineupNames(v.picks, names)}{" "}
              {v.games.map((x) => <GameLink key={`${x.game}-${x.side}`} g={x} />)}
            </p>
          ))}
        </div>
      )}
    </li>
  );
}

const TYPE_LABEL: Record<Source["type"], string> = {
  "golgg-game": "game", "golgg-tournament": "tournament", "golgg-champion": "champion stats", "golgg-team": "team stats", other: "source",
};

function SourceList({ list }: { list: Source[] }) {
  return (
    <ul className="shell-sources">
      {list.map((s) => (
        <li key={s.id}>
          <a href={s.url} target="_blank" rel="noopener noreferrer">Gol.gg {TYPE_LABEL[s.type]}{s.seriesGame ? ` ${s.seriesGame}` : ""}</a>
          <span className="muted">{[s.tournament, s.team && s.opponent ? `${s.team} vs ${s.opponent}` : s.team, s.patch && `patch ${patchLabel(s.patch)}`, s.date && shortDate(s.date)].filter(Boolean).join(" · ")}</span>
          <span className="faint">{s.pendingClaim ? `externally provided ${s.pendingClaim.providedOn}, pending refresh`
            : s.refreshStatus === "verified" && s.lastChecked ? `verified ${s.lastChecked}` : "not refreshed"}</span>
        </li>
      ))}
    </ul>
  );
}
