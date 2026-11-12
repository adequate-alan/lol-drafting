"use client";
// Enemy flex picks (alan, 2026-11-10; lib/enemy-roles.ts): add an enemy champion without a role, see where the whole
// lineup places it and how sure that is, confirm a role, mark it flexible, swap or release it. A placement the user did
// not confirm is always labelled as such; nothing here scores or orders a candidate.
import { useMemo, useRef, useState } from "react";
import { ROLES, type Champion, type Role } from "@/lib/schema";
import { ROLE_INFERENCE, type EnemyRead, type Placement, type RoleAction } from "@/lib/enemy-roles";
import { patchLabel } from "@/lib/patch";
import { ChampIcon } from "./ui";

const SHORT: Record<Role, string> = { TOP: "TOP", JUNGLE: "JG", MID: "MID", BOT: "BOT", SUPPORT: "SUP" };
const LABEL: Record<Role, string> = { TOP: "Top", JUNGLE: "Jungle", MID: "Mid", BOT: "Bot", SUPPORT: "Support" };
const list = (rs: Role[], f: Record<Role, string> = LABEL) => rs.map((r) => f[r]).join(" / ");

/** The quiet note after the slot's role tag: how the role was set. A confirmed role needs none. */
export function roleTagNote(p: Placement): string | undefined {
  if (p.status === "confirmed") return undefined;
  if (p.status === "flex") return `flex ${list(p.flex ?? [], SHORT)}`;
  if (p.status === "uncertain") return `likely · or ${list(p.alternatives, SHORT)}`;
  return "likely";
}

/** The lane opponent line's hover text: who is confirmed, who is placed, who else could be there. */
export function laneFoeNote(active: Role, read: EnemyRead, names: Record<string, string>): string | undefined {
  const lane = active === "BOT" || active === "SUPPORT" ? ["BOT", "SUPPORT"] as Role[] : [active];
  const n = (id: string) => names[id] ?? id;
  const parts: string[] = [];
  for (const r of lane) {
    const p = read.placements.find((x) => x.role === r);
    if (!p) continue;
    parts.push(p.status === "confirmed" ? `${n(p.id)}: confirmed ${LABEL[r].toLowerCase()}.` : `${n(p.id)}: likely ${LABEL[r].toLowerCase()}, placed automatically, role not confirmed.`);
    const others = read.possible[r] ?? [];
    if (others.length) parts.push(`Could also be ${LABEL[r].toLowerCase()}: ${others.map(n).join(", ")}.`);
  }
  return parts.length ? parts.join(" ") : undefined;
}

const statusLine = (p: Placement) => {
  const at = p.role ? LABEL[p.role].toLowerCase() : undefined;
  switch (p.status) {
    case "confirmed": return `Confirmed ${at}`;
    case "flex": return `Flexible ${list(p.flex ?? [])}${at ? ` · shown in ${at}` : ""}`;
    case "uncertain": return `Likely ${at} · flex possible`;
    case "likely": return `Likely ${at}`;
    default: return "Not placed";
  }
};

const whyLine = (p: Placement, names: Record<string, string>, read: EnemyRead) => {
  if (p.status === "confirmed") return "You confirmed this role: automatic placement never moves it.";
  if (p.status === "unresolved") return "No open role it plays is left. Choose one below.";
  const base = "Placed with the whole enemy lineup from its playable roles and recorded pro picks. Role not confirmed.";
  if (p.status === "flex") return `You marked it flexible; the board shows the role the rest of the lineup leaves most likely. ${p.alternatives.length ? `Still possible: ${list(p.alternatives)}.` : ""}`.trim();
  if (p.status === "uncertain") {
    const moves = p.alternatives.map((r) => {
      const board = read.alt[p.id]?.[r];
      const into = p.role && board?.[p.role];
      return into && into !== p.id ? `${LABEL[r].toLowerCase()} (with ${names[into] ?? into} in ${LABEL[p.role!].toLowerCase()})` : LABEL[r].toLowerCase();
    });
    return `${base} A placement nearly as well supported puts it in ${moves.join(" or ")}.`;
  }
  return base;
};

const sampleText = (p: Placement, patch?: string) => {
  const s = p.sample;
  if (!s) {
    const seen = ROLES.filter((r) => p.seen?.[r]).map((r) => `${LABEL[r]} ${p.seen![r]}`).join(" · ");
    return `${seen ? `${seen}: under ${ROLE_INFERENCE.proMin} picks, not counted` : "None recorded"}. Placed from its playable roles.`;
  }
  const roles = ROLES.filter((r) => s.picks[r]).sort((a, b) => (s.picks[b] ?? 0) - (s.picks[a] ?? 0)).map((r) => `${LABEL[r]} ${s.picks[r]}`).join(" · ");
  return `${roles} of ${s.total} ${s.scope === "patch" && patch ? `on ${patchLabel(patch)}` : "across recorded patches"}${s.total < 5 ? " · small sample" : ""}`;
};

/** The enemy slot's role menu: why it sits here, confirm a role (swapping with a confirmed champion), mark flexible, release. */
export function EnemyRoleMenu({ placement: p, read, names, patch, onSet, onReplace }: {
  placement: Placement; read: EnemyRead; names: Record<string, string>; patch?: string;
  onSet: (a: RoleAction) => void; onReplace?: () => void;
}) {
  const [flex, setFlex] = useState<Role[]>(() => p.flex ?? (p.role ? [p.role, ...p.alternatives] : []));
  const toggle = (r: Role) => setFlex((f) => (f.includes(r) ? f.filter((x) => x !== r) : ROLES.filter((x) => x === r || f.includes(x))));
  const n = (id: string) => names[id] ?? id;
  return (
    <div className="ce-card role-menu">
      <header className="pop-head"><span className="pop-title">{n(p.id)}</span><span>{statusLine(p)}</span></header>
      <p className="pop-sub">{whyLine(p, names, read)}</p>
      <dl className="pop-kv">
        <dt>Plays</dt><dd>{list(p.roster)}</dd>
        <dt>Pro picks</dt><dd>{sampleText(p, patch)}</dd>
      </dl>
      <div className="role-menu-k label">Definitely</div>
      <div className="seg role-menu-roles" role="group" aria-label={`Confirm ${n(p.id)}'s role`}>
        {ROLES.map((r) => {
          const there = read.byRole[r];
          const other = there && there !== p.id ? n(there) : undefined;
          const on = p.status === "confirmed" && p.role === r;
          const confirmedThere = other && read.placements.find((x) => x.id === there)?.status === "confirmed";
          return (
            <button key={r} type="button" className={on ? "active" : undefined} aria-pressed={on}
              title={on ? `Confirmed ${LABEL[r].toLowerCase()}` : other ? `${n(p.id)} ${LABEL[r].toLowerCase()}; ${other} ${confirmedThere ? (p.role ? `swaps to ${LABEL[p.role].toLowerCase()}` : "goes back to automatic placement") : "is placed again"}` : `${n(p.id)} ${LABEL[r].toLowerCase()}`}
              onClick={() => onSet({ kind: "confirm", role: r })}>{SHORT[r]}</button>
          );
        })}
      </div>
      <div className="role-menu-k label">Flexible between</div>
      <div className="role-menu-flex">
        <div className="seg" role="group" aria-label={`Roles ${n(p.id)} may play`}>
          {ROLES.map((r) => <button key={r} type="button" className={flex.includes(r) ? "active" : undefined} aria-pressed={flex.includes(r)} onClick={() => toggle(r)}>{SHORT[r]}</button>)}
        </div>
        <button type="button" className="btn sm" disabled={flex.length < 2} title={flex.length < 2 ? "Choose two or more roles" : `Keep ${n(p.id)} unconfirmed between ${list(flex)}`}
          onClick={() => onSet({ kind: "flex", roles: flex })}>Mark flexible</button>
      </div>
      <footer className="pop-foot role-menu-actions">
        {(p.status === "confirmed" || p.status === "flex") && <button type="button" className="btn sm" onClick={() => onSet({ kind: "auto" })}>Keep automatic placement</button>}
        {onReplace && <button type="button" className="btn sm" onClick={onReplace}>Replace champion</button>}
        <button type="button" className="btn sm" onClick={() => onSet({ kind: "remove" })}>Remove</button>
      </footer>
    </div>
  );
}

/** Enemy champions no open role fits: shown under the board with a role choice, never guessed into a slot. */
export function UnplacedEnemies({ read, names, onSet }: { read: EnemyRead; names: Record<string, string>; onSet: (id: string, a: RoleAction) => void }) {
  const left = read.placements.filter((p) => !p.role);
  if (!left.length) return null;
  return (
    <div className="enemy-unplaced xs" role="group" aria-label="Enemy picks not placed">
      <span className="enemy-unplaced-k">Not placed</span>
      {left.map((p) => (
        <span key={p.id} className="enemy-unplaced-pick">
          <ChampIcon id={p.id} name={names[p.id] ?? p.id} size="xs" />
          <b>{names[p.id] ?? p.id}</b>
          <span className="faint">no open role it plays ({list(p.roster)}). Place as</span>
          <span className="seg">{ROLES.map((r) => <button key={r} type="button" title={`Confirm ${names[p.id] ?? p.id} ${LABEL[r].toLowerCase()}`} onClick={() => onSet(p.id, { kind: "confirm", role: r })}>{SHORT[r]}</button>)}</span>
          <button type="button" className="btn sm ghost" aria-label={`Remove ${names[p.id] ?? p.id}`} onClick={() => onSet(p.id, { kind: "remove" })}>Remove</button>
        </span>
      ))}
    </div>
  );
}

/**
 * Add an enemy champion as it is revealed, without choosing a role: type, Enter, next. The field stays open for the
 * next pick; Escape (focus back on the button) or leaving it closes it. A secondary action in the enemy header, there for
 * the whole draft (disabled once five are in); clicking an enemy slot still confirms that role directly.
 */
export function EnemyAdd({ champions, taken, byName, full, onAdd }: {
  champions: Champion[]; taken: string[]; byName: Map<string, string>; full: boolean; onAdd: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [hi, setHi] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const q = text.trim().toLowerCase();
  const matches = useMemo(() => {
    const hit = (c: Champion) => !q || c.name.toLowerCase().includes(q) || c.aliases.some((a) => a.toLowerCase().includes(q));
    const starts = (c: Champion) => (q && c.name.toLowerCase().startsWith(q) ? 0 : 1);
    return champions.filter((c) => !taken.includes(c.id) && hit(c)).sort((a, b) => starts(a) - starts(b) || a.name.localeCompare(b.name));
  }, [champions, taken, q]);
  const add = (id: string | undefined) => {
    if (!id) return;
    onAdd(id); setText(""); setHi(0);
  };
  const btn = useRef<HTMLButtonElement>(null);
  const close = (refocus = false) => {
    setOpen(false); setText(""); setHi(0);
    if (refocus) requestAnimationFrame(() => btn.current?.focus());
  };
  const scrollTo = (i: number) => (listRef.current?.children[i] as HTMLElement | undefined)?.scrollIntoView({ block: "nearest" });
  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") { e.preventDefault(); const i = Math.min(hi + 1, matches.length - 1); setHi(i); scrollTo(i); }
    else if (e.key === "ArrowUp") { e.preventDefault(); const i = Math.max(hi - 1, 0); setHi(i); scrollTo(i); }
    else if (e.key === "Enter") { e.preventDefault(); const exact = byName.get(q); add(exact && !taken.includes(exact) ? exact : matches[hi]?.id); }
    else if (e.key === "Escape") { e.preventDefault(); close(true); }
  };
  if (!open) return (
    <button ref={btn} type="button" className="btn sm enemy-add-btn" disabled={full} aria-haspopup="listbox"
      title={full ? "All five enemy champions are in: change one from its slot" : "Placed with the whole lineup and marked likely; confirm the role from its slot later"}
      onClick={() => { setOpen(true); requestAnimationFrame(() => input.current?.focus()); }}>+ Add champion</button>
  );
  return (
    <span className="enemy-add picker">
      <input ref={input} value={text} placeholder="Enemy champion" aria-label="Add an enemy champion (role placed automatically)"
        role="combobox" aria-autocomplete="list" aria-expanded={matches.length > 0} aria-controls="enemy-add-list"
        aria-activedescendant={matches[hi] ? `enemy-add-${matches[hi].id}` : undefined}
        onChange={(e) => { setText(e.target.value); setHi(0); if (listRef.current) listRef.current.scrollTop = 0; }} onKeyDown={onKey} onBlur={() => close()} />
      {matches.length > 0 && (
        <ul id="enemy-add-list" ref={listRef} role="listbox" tabIndex={-1} className="picker-list">
          {matches.map((c, i) => (
            <li key={c.id} id={`enemy-add-${c.id}`} role="option" aria-selected={i === hi} className={i === hi ? "active" : undefined}
              onMouseDown={(e) => { e.preventDefault(); add(c.id); }} onMouseEnter={() => setHi(i)}>
              <ChampIcon id={c.id} name={c.name} size="sm" />
              <span className="name">{c.name}</span>
              <span className="roles">{c.roles.map((r) => SHORT[r]).join(" · ")}</span>
            </li>
          ))}
        </ul>
      )}
    </span>
  );
}
