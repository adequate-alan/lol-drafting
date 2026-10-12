"use client";
// Comp Library: each shell reads as a draft board. Five champions across the top (hover for the quick card, click for
// the drawer), each with a short job label (lib/comp-copy.ts; the full job is on the hover card and drawer), then the
// win condition, one supporting line, actions, and the full "why" plus sources behind Details. Swaps hide behind a
// "N swaps" control; picking one previews that variation in place (never saved, never pro evidence: swaps are
// General Draft Logic, even on an observed pro comp) and compares it with the original on the comp check.
// Observed Pro Comps the weekly discovery added (lib/comp-discovery.ts) use the same card; observed variations of any
// comp (other lineups pro teams played under it, each with its game) sit behind an "N observed variations" control.
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ChampionDrawer, compLinks, useDrawerIndex, type CompContext, type DrawerContext, type DrawerTarget } from "@/components/ChampionDrawer";
const COMPS: DrawerContext = { page: "comps" };
import { ChampionHoverCard, useHoverIntent } from "@/components/ChampionInteraction";
import { CompFreshness } from "@/components/CompFreshness";
import { ChampIcon, PageHeader, SourceBadge } from "@/components/ui";
import { jobLabel, WHY_LINE } from "@/lib/comp-copy";
import type { LibraryExtra, ObservedGame } from "@/lib/comp-library";
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
  const cardShellId = intent.card?.el.closest("article.shell")?.id;
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
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (!id) return;
    const el = document.getElementById(id);
    if (el) el.scrollIntoView();
    else if (!rawKind && allShells.some((s) => s.id === id)) window.location.replace(`${window.location.pathname}?kind=all#${id}`);
  }, [rawKind, allShells]);
  // An open swap list closes on Escape or a press anywhere outside its slot.
  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setMenu(undefined); };
    const onDown = (e: PointerEvent) => { if (!(e.target as Element | null)?.closest(".lu-slot.menu-open")) setMenu(undefined); };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("pointerdown", onDown); };
  }, [menu]);
  const shells = [...allShells]
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
        <span className="count">{shells.length} of {allShells.length} comps</span>
      </div>
      <div className="shell-grid">
        {shells.map((s) => {
          const d = s.proDraftId ? drafts[s.proDraftId] : undefined;
          const swaps = swapsOf(s.id);
          const swapped = ROLES.filter((r) => swaps[r]);
          const srcs = [...new Set(s.sources)].map((id) => sources[id]).filter(Boolean);
          const showSrc = !!shownSources[s.id];
          const whyLine = WHY_LINE[s.id] ?? s.why;
          const x = extras[s.id];
          const read = x?.discovered;
          const hasDetails = srcs.length > 0 || whyLine !== s.why || !!read;
          const nVar = x?.variations.length ?? 0, nGames = x?.games.length ?? 0;
          const showVar = !!shownVariations[s.id];
          return (
            <article key={s.id} id={s.id} className={`panel shell ${s.kind} ${swapped.length ? "previewing" : ""}`}>
              <header className="shell-head">
                <div className="row between">
                  <h2>{s.name}</h2>
                  <span className="row tight shell-kind">
                    {s.kind === "observed" ? <SourceBadge layer="pro" label="Pro" /> : <span className="src logic"><span className="ldot" />Template</span>}
                    <span className="xs muted">{LEVEL_LABEL[LEVEL[s.difficulty]]}</span>
                  </span>
                </div>
                <span className="shell-tags xs muted">
                  {s.kind === "observed" && <span className="shell-by">{read && d ? `${d.team} vs ${d.opponent} · ${d.patch ? patchLabel(d.patch) : ""}` : `${s.observedBy}${d ? ` · ${d.seriesGame} vs ${d.opponent}` : ""}`}</span>}
                  {s.identities.map((i) => <span key={i} className="shell-tag">{tag(i)}</span>)}
                </span>
              </header>
              <Lineup shell={s} swaps={swaps} names={names} data={data} index={index}
                active={active?.shell === s.id ? active.role : undefined} selected={open?.shell === s.id ? open.role : undefined}
                menu={menu?.shell === s.id ? menu.role : undefined}
                onMenu={(role) => setMenu(role ? { shell: s.id, role } : undefined)}
                onPreview={(role, champ) => preview(s.id, role, champ)}
                onOpen={(role, el) => select({ shell: s.id, role }, el)} onHover={(role, el, id) => onHover(s, role, el, id)} />
              {swapped.length > 0 && <Preview shell={s} swaps={swaps} names={names} data={data} onReset={() => setPreviews((p) => ({ ...p, [s.id]: {} }))} />}
              <div className="shell-foot">
                <p className="wc">{s.winCondition}</p>
                <p className="why">{whyLine}</p>
                <div className="row between shell-actions">
                  <span className="row shell-toggles">
                    {hasDetails && (
                      <button type="button" className="src-toggle" aria-expanded={showSrc} onClick={() => setShownSources((x) => ({ ...x, [s.id]: !showSrc }))}>
                        Details{srcs.length > 0 && <span className="faint"> · {srcs.length} source{srcs.length > 1 ? "s" : ""}</span>} <span aria-hidden="true">{showSrc ? "▴" : "▾"}</span>
                      </button>
                    )}
                    {(nVar > 0 || nGames > 0) && (
                      <button type="button" className="src-toggle var-toggle" aria-expanded={showVar} onClick={() => setShownVariations((v) => ({ ...v, [s.id]: !showVar }))}>
                        {nVar > 0 ? `${nVar} observed variation${nVar > 1 ? "s" : ""}` : `${nGames} more game${nGames > 1 ? "s" : ""}`}
                        {nVar > 0 && nGames > 0 && <span className="faint"> · {nGames} more game{nGames > 1 ? "s" : ""}</span>} <span aria-hidden="true">{showVar ? "▴" : "▾"}</span>
                      </button>
                    )}
                  </span>
                  {swapped.length
                    ? <Link className="btn sm primary" href={draftHref(shellDraft(s, swaps))}>Use variation in Draft Room →</Link>
                    : <Link className="btn sm" href={`/?shell=${s.id}`}>Use in Draft Room →</Link>}
                </div>
                {showVar && x && <Variations shell={s} extra={x} names={names} />}
                {showSrc && (
                  <div className="shell-details">
                    {whyLine !== s.why && <p className="shell-why-full"><span className="faint">Why it works</span> {s.why}</p>}
                    {read && <ReadDetails read={read} />}
                    {srcs.length > 0 && <SourceList list={srcs} />}
                  </div>
                )}
              </div>
            </article>
          );
        })}
      </div>
      {intent.card && !open && cardShell && intent.card.t.role && (
        <ChampionHoverCard key={`${cardShell.id}-${intent.card.t.role}-${intent.card.t.id}`} target={intent.card.t} anchor={intent.card.el} swap={intent.card.swap} data={data} index={index}
          comp={compOf(cardShell, { ...swapsOf(cardShell.id), [intent.card.t.role]: intent.card.t.id })}
          side={intent.card.el.classList.contains("lu-slot") ? "below" : "beside"}
          onEnter={intent.keep} onLeave={intent.unhover} />
      )}
      {open && openShell && (
        <ChampionDrawer target={{ id: shellDraft(openShell, swapsOf(openShell.id))[open.role], role: open.role }} comp={compOf(openShell, swapsOf(openShell.id))}
          data={data} index={index} context={COMPS} onClose={close} onSelect={(t: DrawerTarget) => t.role && setOpen({ shell: open.shell, role: t.role })} />
      )}
    </>
  );
}

function Lineup({ shell: s, swaps, names, data, index, active, selected, menu, onMenu, onPreview, onOpen, onHover }: {
  shell: CompShell; swaps: Swaps; names: Record<string, string>; data: DrawerData; index: ReturnType<typeof useDrawerIndex>;
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
  return (
    <div className={`lineup ${active ? "linking" : ""} ${selected ? "selecting" : ""}`}>
      {ROLES.map((r) => {
        const id = picks[r];
        const slot = s.slots[r];
        const saved = links?.savedRoles.has(r);
        const pro = links?.proRoles.get(r);
        const isSwap = !!swaps[r];
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
            {slot.swaps.length > 0 && (
              <button type="button" className="lu-swaps" aria-expanded={menu === r} aria-haspopup="menu"
                aria-label={isSwap ? `Swapped: swaps for ${names[slot.champion]}` : `${slot.swaps.length} swap${slot.swaps.length > 1 ? "s" : ""} for ${names[slot.champion]}`}
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
                <span className="lu-swaps-n">{isSwap ? "Swapped" : `${slot.swaps.length} swap${slot.swaps.length > 1 ? "s" : ""}`}</span>
              </button>
            )}
            {menu === r && (
              <div className="swap-menu" role="menu" aria-label={`Swaps for ${names[slot.champion]}`}>
                <span className="swap-menu-head"><span className="ldot" />Swaps · General logic</span>
                {isSwap && (
                  <button type="button" role="menuitem" className="swap-item original" onClick={() => onPreview(r, undefined)}>
                    <ChampIcon id={slot.champion} name={names[slot.champion]} role={r} size="sm" /><span>{names[slot.champion]}</span><span className="xs faint">original</span>
                  </button>
                )}
                {slot.swaps.map((x) => (
                  <button key={x} type="button" role="menuitem" className={`swap-item ${swaps[r] === x ? "on" : ""}`} aria-current={swaps[r] === x || undefined}
                    onClick={() => { onHover(undefined); onPreview(r, swaps[r] === x ? undefined : x); }}
                    onPointerEnter={(e) => { if (e.pointerType === "mouse") onHover(r, e.currentTarget, x); }}
                    onPointerLeave={(e) => { if (e.pointerType === "mouse") onHover(undefined); }}>
                    <ChampIcon id={x} name={names[x]} role={r} size="sm" /><span>{names[x]}</span>{swaps[r] === x && <span className="xs faint">previewing</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** The preview state: what changed, how the comp check moves, and the way back. General Draft Logic only. */
function Preview({ shell: s, swaps, names, data, onReset }: {
  shell: CompShell; swaps: Swaps; names: Record<string, string>; data: DrawerData; onReset: () => void;
}) {
  const diff = variationDiff(shellDraft(s), shellDraft(s, swaps), data.champions);
  const swapped = ROLES.filter((r) => swaps[r]);
  const none = !diff.changes.length && !diff.added.length && !diff.cleared.length;
  return (
    <section className="shell-preview" aria-live="polite">
      <div className="row between">
        <span className="pv-title"><span className="ldot" /><b>Preview</b>{" "}
          {swapped.map((r) => `${names[swaps[r]!]} for ${names[s.slots[r].champion]}`).join(", ")}</span>
        <button type="button" className="btn sm ghost" onClick={onReset}>Reset</button>
      </div>
      <p className="pv-note">{s.kind === "observed" ? "Not in the observed pro draft. " : ""}Swaps are general draft logic, not pro evidence.</p>
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
      <a href={g.url} target="_blank" rel="noopener noreferrer">{g.team} vs {g.opponent}</a>
      <span className={g.won ? "var-w" : "var-l"}>{g.won ? "W" : "L"}</span>
      <span className="faint">{shortDate(g.date)} · {patchLabel(g.patch)}</span>
    </span>
  );
}

/** Observed variations: other lineups pro teams played under this comp, and replays of its own lineup. Pro evidence. */
function Variations({ shell: s, extra, names }: { shell: CompShell; extra: LibraryExtra; names: Record<string, string> }) {
  return (
    <ul className="shell-variations" aria-label={`Observed lineups for ${s.name}`}>
      {extra.games.length > 0 && (
        <li className="var-row">
          <span className="var-what">Same lineup</span>
          <span className="var-games">{extra.games.map((g) => <GameLink key={`${g.game}-${g.side}`} g={g} />)}</span>
        </li>
      )}
      {extra.variations.map((v) => {
        const changed = ROLES.filter((r) => v.picks[r] !== s.slots[r].champion);
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
