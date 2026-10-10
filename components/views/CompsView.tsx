"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ChampionDrawer, compLinks, useDrawerIndex, type CompContext, type DrawerTarget } from "@/components/ChampionDrawer";
import { ChampionHoverCard, useHoverIntent } from "@/components/ChampionInteraction";
import { ChampIcon, PageHeader, SourceBadge, SourceLinks } from "@/components/ui";
import type { DrawerData } from "@/lib/data";
import { ROLES, type CompShell, type ProDraft, type Role, type Source } from "@/lib/schema";

type Slot = { shell: string; role: Role };
const compOf = (s: CompShell): CompContext => ({
  name: s.name,
  slots: Object.fromEntries(ROLES.map((r) => [r, s.slots[r].champion])) as CompContext["slots"],
  jobs: Object.fromEntries(ROLES.map((r) => [r, s.slots[r].job])),
  swaps: Object.fromEntries(ROLES.map((r) => [r, s.slots[r].swaps])),
  proDraftId: s.proDraftId,
});

const DIFF_ORDER = ["easy", "easy-medium", "medium", "hard"];

export function CompsView({ names, sources, drafts, allShells, data }: {
  names: Record<string, string>; sources: Record<string, Source>; drafts: Record<string, ProDraft>; allShells: CompShell[]; data: DrawerData;
}) {
  const index = useDrawerIndex(data);
  const [open, setOpen] = useState<Slot | undefined>(undefined);
  const [hover, setHover] = useState<Slot | undefined>(undefined);
  const opener = useRef<HTMLElement | null>(null);
  const openShell = open && allShells.find((s) => s.id === open.shell);
  const close = () => {
    setOpen(undefined);
    // Back to the slot that opened the drawer, without scrolling the page.
    const el = opener.current;
    if (el && document.contains(el)) el.focus({ preventScroll: true });
  };
  const select = (slot: Slot, el?: HTMLElement | null) => {
    if (!open && el) opener.current = el;
    intent.hide();
    setOpen(slot);
  };
  // Hover: comp-mate highlights at once, the quick card after a short pause (out of the page flow, in a portal).
  const intent = useHoverIntent();
  const onHover = (s: CompShell, role?: Role, el?: HTMLElement) => {
    setHover(role ? { shell: s.id, role } : undefined);
    if (role && el) intent.hover({ id: s.slots[role].champion, role }, el); else intent.unhover();
  };
  const cardShellId = intent.card?.el.closest("article.shell")?.id;
  const cardShell = cardShellId ? allShells.find((x) => x.id === cardShellId) : undefined;
  // Highlights follow the hovered or focused slot, else the open one.
  const active = hover ?? open;
  const params = useSearchParams();
  const kind = params.get("kind") || undefined;
  const difficulty = params.get("difficulty") || undefined;
  // The cards render in the browser, after the browser's own jump to #shell-id has already run.
  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (id) document.getElementById(id)?.scrollIntoView();
  }, []);
  const shells = [...allShells]
    .filter((s) => !kind || s.kind === kind)
    .filter((s) => !difficulty || s.difficulty === difficulty)
    .sort((a, b) => DIFF_ORDER.indexOf(a.difficulty) - DIFF_ORDER.indexOf(b.difficulty));
  const href = (o: Record<string, string | undefined>) => {
    const q = new URLSearchParams(Object.entries({ kind, difficulty, ...o }).filter(([, v]) => v) as [string, string][]);
    return `/comps${q.size ? `?${q}` : ""}`;
  };
  const KINDS: [string | undefined, string][] = [[undefined, "All"], ["observed", "Observed pro"], ["generalized", "Template"]];
  return (
    <>
      <PageHeader title="Comp Library" desc="Copy the jobs, not the exact champions." />
      <div className="row" style={{ marginBottom: 12, gap: 10 }}>
        <nav className="seg" aria-label="Type">{KINDS.map(([k, l]) => <Link key={l} href={href({ kind: k })} className={kind === k ? "active" : undefined}>{l}</Link>)}</nav>
        <nav className="seg" aria-label="Difficulty">
          <Link href={href({ difficulty: undefined })} className={!difficulty ? "active" : undefined}>Any difficulty</Link>
          {DIFF_ORDER.map((d) => <Link key={d} href={href({ difficulty: d })} className={difficulty === d ? "active" : undefined}>{d}</Link>)}
        </nav>
        <span className="xs muted tnum" style={{ marginLeft: "auto" }}>{shells.length} of {allShells.length} shells</span>
      </div>
      <div className="shell-grid">
        {shells.map((s) => {
          const d = s.proDraftId ? drafts[s.proDraftId] : undefined;
          return (
            <article key={s.id} id={s.id} className={`panel shell ${s.kind}`}>
              <div className="shell-head">
                <div className="row between">
                  <h2>{s.name}</h2>
                  <span className="row tight">
                    {s.kind === "observed" ? <SourceBadge layer="pro" label="Pro comp" /> : <span className="src logic"><span className="ldot" />Template</span>}
                    <span className="xs faint">{s.difficulty}</span>
                  </span>
                </div>
                <span className="xs muted">{s.kind === "observed" ? `${s.observedBy}${d ? `, ${d.seriesGame} vs ${d.opponent}` : ""}` : "Generalized template"} · {s.identities.join(" · ")}</span>
              </div>
              <ShellSlots shell={s} names={names} data={data} index={index} active={active?.shell === s.id ? active.role : undefined}
                selected={open?.shell === s.id ? open.role : undefined}
                onOpen={(role, el) => select({ shell: s.id, role }, el)} onHover={(role, el) => onHover(s, role, el)} />
              <div className="shell-foot">
                <p className="wc"><b>Win condition:</b> {s.winCondition}</p>
                <p className="xs muted"><b>Why it works:</b> {s.why}</p>
                <div className="row between">
                  <SourceLinks ids={s.sources} sources={sources} />
                  <Link className="btn sm" href={`/?shell=${s.id}`}>Use as template →</Link>
                </div>
              </div>
            </article>
          );
        })}
      </div>
      {intent.card && !open && cardShell && (
        <ChampionHoverCard key={`${cardShell.id}-${intent.card.t.role}`} target={intent.card.t} anchor={intent.card.el} data={data} index={index} comp={compOf(cardShell)}
          onEnter={intent.keep} onLeave={intent.unhover} />
      )}
      {open && openShell && (
        <ChampionDrawer target={{ id: openShell.slots[open.role].champion, role: open.role }} comp={compOf(openShell)} data={data} index={index}
          onClose={close} onSelect={(t: DrawerTarget) => t.role && setOpen({ shell: open.shell, role: t.role })} />
      )}
    </>
  );
}

function ShellSlots({ shell: s, names, data, index, active, selected, onOpen, onHover }: {
  shell: CompShell; names: Record<string, string>; data: DrawerData; index: ReturnType<typeof useDrawerIndex>;
  active?: Role; selected?: Role; onOpen: (role: Role, el: HTMLElement) => void; onHover: (role?: Role, el?: HTMLElement) => void;
}) {
  const links = active ? compLinks({ id: s.slots[active].champion, role: active }, compOf(s), data, index) : undefined;
  return (
    <table className={`comp-slots ${active ? "linking" : ""} ${selected ? "selecting" : ""}`}>
      <tbody>
        {ROLES.map((r) => {
          const id = s.slots[r].champion;
          const saved = links?.savedRoles.has(r);
          const pro = links?.proRoles.get(r);
          const cls = [`role-${r}`, "comp-slot-row", r === active && "is-active", r === selected && "is-open", saved && "has-saved", pro && "has-pro"].filter(Boolean).join(" ");
          return (
            <tr key={r} className={cls} data-drawer-trigger
              onPointerEnter={(e) => { if (e.pointerType === "mouse") onHover(r, e.currentTarget.querySelector<HTMLElement>(".comp-slot")!); }}
              onPointerLeave={(e) => { if (e.pointerType === "mouse") onHover(undefined); }}
              onClick={(e) => { if (!(e.target as Element).closest("button")) onOpen(r, e.currentTarget.querySelector("button")!); }}>
              <td className="slot-cell">
                <button type="button" className="comp-slot" aria-haspopup="dialog" aria-expanded={r === selected}
                  aria-label={`${names[id]}, ${r.toLowerCase()}: open details`}
                  onClick={(e) => onOpen(r, e.currentTarget)}
                  onFocus={(e) => { if (e.currentTarget.matches(":focus-visible")) onHover(r, e.currentTarget); }} onBlur={() => onHover(undefined)}>
                  <ChampIcon id={id} name={names[id]} role={r} size="md" />
                  <span className="comp-slot-name"><span className={`role-tag role-${r}`}>{r}</span><b>{names[id]}</b></span>
                  {/* Space is always reserved, so a highlight only changes colors, never the row's size. */}
                  <span className="link-pips">
                    <span className={`pip clash ${saved ? "on" : ""}`} title={saved ? "Saved pairing with the highlighted pick" : undefined}>Synergy</span>
                    <span className={`pip pro ${pro ? "on" : ""}`} title={pro ? "Pro evidence with the highlighted pick" : undefined}>{pro?.games.length ? `Pro ${pro.games.length}` : "Pro"}</span>
                  </span>
                  <span className="chev" aria-hidden="true">›</span>
                </button>
              </td>
              <td className="job">
                {s.slots[r].job}
                {s.slots[r].swaps.length > 0 && <span className="swaps" title="Same-role swaps with similar attributes (general draft logic)">
                  <span className="faint">swap</span>{s.slots[r].swaps.map((x) => <span key={x} className="swap">{names[x]}</span>)}
                </span>}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
