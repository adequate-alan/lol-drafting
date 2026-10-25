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
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ChampionDrawer, compLinks, useDrawerIndex, type CompContext, type DrawerContext, type DrawerTarget } from "@/components/ChampionDrawer";
const COMPS: DrawerContext = { page: "comps" };
import { ChampionHoverCard, useHoverIntent } from "@/components/ChampionInteraction";
import { useLeave } from "@/components/useLeave";
import { CompFreshness } from "@/components/CompFreshness";
import { ChampIcon, PageHeader, SourceBadge } from "@/components/ui";
import { jobLabel, WHY_LINE } from "@/lib/comp-copy";
import { plainVariations, PRO_SWAP_SAMPLE, type Archetype, type ArchetypeRow, type JobRead, type LibraryExtra, type NamedVariation, type ObservedGame,
  type ObservedLineup, type ProSwap } from "@/lib/comp-library";
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
type Level = "easy" | "medium" | "hard";
const LEVEL: Record<CompShell["difficulty"], Level> = { easy: "easy", "easy-medium": "medium", medium: "medium", hard: "hard" };
const LEVEL_LABEL: Record<Level, string> = { easy: "Easy", medium: "Medium", hard: "Hard" };
const ROLE_LABEL: Record<Role, string> = { TOP: "Top", JUNGLE: "Jungle", MID: "Mid", BOT: "Bot", SUPPORT: "Support" };
const tag = (s: string) => { const t = s.replace(/-/g, " "); return t.charAt(0).toUpperCase() + t.slice(1); };
const plural = (n: number, w: string) => `${n} ${w}${n === 1 || w === "series" ? "" : "s"}`;
/** "3 series · 3 teams · 26.20, 26.18": the sample a pro swap stands on. */
const swapSample = (p: ProSwap) => `${plural(p.series, "series")} · ${plural(p.teams, "team")} · ${p.patches.map(patchLabel).join(", ")}`;
const proSwapsOf = (x?: LibraryExtra) => ROLES.flatMap((r) => (x?.proSwaps?.[r] ?? []).map((p) => ({ role: r, ...p })));

export function CompsView({ names, sources, drafts, allShells, extras, lastAddition, data }: {
  names: Record<string, string>; sources: Record<string, Source>; drafts: Record<string, ProDraft>; allShells: CompShell[];
  extras: Record<string, LibraryExtra>; lastAddition: string | null; data: DrawerData;
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
  const opener = useRef<HTMLElement | null>(null);
  const openShell = open && allShells.find((s) => s.id === open.shell);
  const swapsOf = (id: string) => previews[id] ?? {};
  const close = () => {
    setOpen(undefined);
    // Back to the champion that opened the drawer, without scrolling the page.
    const el = opener.current;
    if (el && document.contains(el)) el.focus({ preventScroll: true });
  };
  const select = (slot: Slot, el?: HTMLElement | null) => {
    if (!open && el) opener.current = el;
    intent.hide();
    setMenu(undefined);
    setOpen(slot);
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
  const quick = useLeave(intent.card && !open ? intent.card : undefined);
  const cardShellId = quick.shown?.el.closest("article.shell")?.id;
  const cardShell = cardShellId ? allShells.find((x) => x.id === cardShellId) : undefined;
  // Highlights follow the hovered or focused champion, else the open one.
  const active = hover ?? open;
  const params = useSearchParams();
  // Pro comps by default (alan, 2026-10-12); "all" and "generalized" (Template) are one click away.
  const rawKind = params.get("kind");
  const kind = rawKind === "all" ? undefined : rawKind === "generalized" ? "generalized" : "observed";
  const rawDiff = params.get("difficulty") || undefined;
  const level = rawDiff && rawDiff in LEVEL ? LEVEL[rawDiff as CompShell["difficulty"]] : undefined;
  // The cards render in the browser, after the browser's own jump to #shell-id has already run.
  // A link to a card the default Pro filter hides (a template) opens on All instead.
  useEffect(() => {
    let id = decodeURIComponent(window.location.hash.slice(1));
    if (!id) return;
    // A named variant lives inside its parent's card: open the parent on it.
    const parent = extras[id]?.variantOf?.parent;
    if (parent) { setVariantShown((v) => ({ ...v, [parent]: id })); id = parent; }
    // A comp inside an archetype is a row of its parent's card, which carries the comp's id: open the row there.
    const inArch = extras[id]?.inArchetype;
    if (inArch) setArchOpen((o) => ({ ...o, [id]: true }));
    const el = document.getElementById(id);
    if (el) el.scrollIntoView();
    else if (!rawKind && allShells.some((s) => s.id === (inArch?.parent ?? id))) window.location.replace(`${window.location.pathname}?kind=all#${id}`);
  }, [rawKind, allShells, extras]);
  // An open swap list closes on Escape or a press anywhere outside its slot.
  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setMenu(undefined); };
    const onDown = (e: PointerEvent) => { if (!(e.target as Element | null)?.closest(".lu-slot.menu-open")) setMenu(undefined); };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("pointerdown", onDown); };
  }, [menu]);
  const cards = allShells.filter((s) => !extras[s.id]?.variantOf && !extras[s.id]?.inArchetype);
  const shells = [...cards]
    .filter((s) => !kind || s.kind === kind)
    .filter((s) => !level || LEVEL[s.difficulty] === level)
    .sort((a, b) => DIFF_ORDER.indexOf(a.difficulty) - DIFF_ORDER.indexOf(b.difficulty));
  const href = (o: Record<string, string | undefined>) => {
    const q = new URLSearchParams(Object.entries({ kind: kind ?? "all", difficulty: level, ...o }).filter(([k, v]) => v && !(k === "kind" && v === "observed")) as [string, string][]);
    return `/comps${q.size ? `?${q}` : ""}`;
  };
  const KINDS: [string | undefined, string][] = [["all", "All"], ["observed", "Pro"], ["generalized", "Template"]];
  const LEVELS: [Level | undefined, string][] = [[undefined, "All"], ["easy", "Easy"], ["medium", "Medium"], ["hard", "Hard"]];
  return (
    <>
      <PageHeader title="Comp Library" />
      <CompFreshness lastAddition={lastAddition} />
      <div className="filters">
        <span className="filter-group"><span className="filter-label">Type</span>
          <nav className="seg" aria-label="Type">{KINDS.map(([k, l]) => <Link key={l} href={href({ kind: k })} className={(kind ?? "all") === k ? "active" : undefined}>{l}</Link>)}</nav>
        </span>
        <span className="filter-group"><span className="filter-label">Difficulty</span>
          <nav className="seg" aria-label="Difficulty">{LEVELS.map(([d, l]) => <Link key={l} href={href({ difficulty: d })} className={level === d ? "active" : undefined}>{l}</Link>)}</nav>
        </span>
        <span className="count">{shells.length} of {cards.length} comps</span>
      </div>
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
          return (
            <article key={card.id} id={card.id} className={`panel shell ${s.kind}${arch ? " archetype" : ""} ${swapped.length ? "previewing" : ""}`}>
              <header className="shell-head">
                <div className="row between">
                  <h2>{card.name}</h2>
                  <span className="row tight shell-kind">
                    {s.kind === "observed" ? <SourceBadge layer="pro" label="Pro" /> : <span className="src logic"><span className="ldot" />Template</span>}
                    <span className="xs muted">{LEVEL_LABEL[LEVEL[s.difficulty]]}</span>
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
                {arch && <CoreRead arch={arch} names={names} />}
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
              {arch && <ArchetypeRows arch={arch} names={names} open={archOpen} onToggle={(id) => setArchOpen((o) => ({ ...o, [id]: !o[id] }))} />}
            </article>
          );
        })}
      </div>
      {quick.shown && cardShell && quick.shown.t.role && (
        <ChampionHoverCard key={`${cardShell.id}-${quick.shown.t.role}-${quick.shown.t.id}`} target={quick.shown.t} anchor={quick.shown.el} swap={quick.shown.swap} data={data} index={index}
          comp={compOf(cardShell, { ...swapsOf(cardShell.id), [quick.shown.t.role]: quick.shown.t.id })}
          side={quick.shown.el.classList.contains("lu-slot") ? "below" : "beside"}
          leaving={quick.leaving} onGone={quick.end} onEnter={intent.keep} onLeave={intent.unhover} />
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
const via = (r: ArchetypeRow) => r.via.length ? <span className="arch-via">· through {r.via.join(" + ")}</span> : null;
const sample = (r: ArchetypeRow) => `${plural(r.games.length, "game")}${r.alike.length ? ` · ${plural(r.alike.reduce((n, a) => n + a.games.length, 0), "more")} playing the same way` : ""}`;

function CoreRead({ arch, names }: { arch: Archetype; names: Record<string, string> }) {
  const c = arch.core;
  return (
    <div className="arch-core">
      <p className="arch-row-head"><b>Core lineup</b> <span className="faint">· {sample(c)}</span> {via(c)}</p>
      {c.jobs && <JobLine jobs={c.jobs} names={names} />}
      <p className="arch-note">{c.note}</p>
    </div>
  );
}

/** The archetype's named variations, then any filed lineup under review. Every game is listed once, under its own row. */
function ArchetypeRows({ arch, names, open, onToggle }: { arch: Archetype; names: Record<string, string>; open: Record<string, boolean>; onToggle: (id: string) => void }) {
  return (
    <section className="arch-vars" aria-label={`${arch.name} named variations`}>
      <h3 className="arch-sub">{plural(arch.members.length, "named variation")}</h3>
      <ul className="arch-list">
        {arch.members.map((r) => <ArchetypeItem key={r.id} row={r} core={arch.core} names={names} open={!!open[r.id]} onToggle={() => onToggle(r.id)} />)}
      </ul>
      {arch.review.length > 0 && (
        <>
          <h3 className="arch-sub">Needs review <span className="faint">· {arch.review.length}, not counted as a variation</span></h3>
          <ul className="arch-list">
            {arch.review.map((r) => <ArchetypeItem key={r.id} row={r} core={arch.core} names={names} open={!!open[r.id]} onToggle={() => onToggle(r.id)} />)}
          </ul>
        </>
      )}
    </section>
  );
}

function ArchetypeItem({ row: r, core, names, open, onToggle }: { row: ArchetypeRow; core: ArchetypeRow; names: Record<string, string>; open: boolean; onToggle: () => void }) {
  const changed = ROLES.filter((role) => r.picks[role] !== core.picks[role]);
  const detail = `arch-detail-${r.id}`;
  return (
    <li id={r.kind === "comp" ? r.id : undefined} className={`arch-item${r.why ? " review" : ""}`}>
      <p className="arch-row-head"><b>{r.name}</b> <span className="faint">· {sample(r)}</span> {via(r)}</p>
      {r.jobs && <JobLine jobs={r.jobs} names={names} />}
      {r.why && <p className="arch-why">{r.why}</p>}
      <p className="arch-note">{r.note}</p>
      <button type="button" className="src-toggle" aria-expanded={open} aria-controls={detail} onClick={onToggle}>
        Lineup and games <span aria-hidden="true">{open ? "▴" : "▾"}</span>
      </button>
      {open && (
        <div id={detail} className="arch-detail">
          <span className="var-what">
            <span className="var-lineup" aria-label={ROLES.map((role) => names[r.picks[role]]).join(", ")}>
              {ROLES.map((role) => <span key={role} className={changed.includes(role) ? "var-pick diff" : "var-pick"}><ChampIcon id={r.picks[role]} name={names[r.picks[role]]} role={role} size="xs" /></span>)}
            </span>
            <span className="faint">{changed.length ? changed.map((role) => `${names[r.picks[role]]} for ${names[core.picks[role]]}`).join(", ") : "Core lineup"}</span>
          </span>
          <span className="var-games">
            {r.games.map((g) => <GameLink key={`${g.game}-${g.side}`} g={g} />)}
            <Link className="var-draft" href={r.kind === "comp" ? `/?shell=${r.id}` : draftHref(r.picks)}>Draft Room →</Link>
          </span>
          {r.read && (
            <p className="faint">Comp check read: {r.read.identity}. {r.read.timing}{r.read.weaknesses.length ? ` Weak points: ${r.read.weaknesses.map((w) => `${w.label} (${w.severity})`).join(", ")}.` : " No weak points."}</p>
          )}
          {r.alike.map((a) => (
            <p key={ROLES.map((role) => a.picks[role]).join("|")} className="var-alike">
              <span className="faint">Plays the same way:</span> {ROLES.map((role) => names[a.picks[role]]).join(", ")}{" "}
              {a.games.map((x) => <GameLink key={`${x.game}-${x.side}`} g={x} />)}
            </p>
          ))}
          {r.observed.map((v) => (
            <p key={ROLES.map((role) => v.picks[role]).join("|")} className="var-alike">
              <span className="faint">{v.named ? `${v.named.name}:` : "Observed with it:"}</span> {ROLES.map((role) => names[v.picks[role]]).join(", ")}{" "}
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
