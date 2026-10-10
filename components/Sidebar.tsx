"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { GenRang } from "./GenRang";
import { ThemeToggle } from "./ThemeToggle";

const I = {
  draft: <path d="M2.5 3.5h11v9h-11zM5.5 3.5v9M8 3.5v9M10.5 3.5v9" />,
  first: <path d="M3 13V3l9 3.5L3 10" />,
  comps: <path d="M2.5 2.5h4.5v4.5H2.5zM9 2.5h4.5v4.5H9zM2.5 9h4.5v4.5H2.5zM9 9h4.5v4.5H9z" />,
  pool: <path d="M8 2.5 13.5 5.5 8 8.5 2.5 5.5zM2.5 8.25 8 11.25l5.5-3M2.5 10.75 8 13.75l5.5-3" />,
  pro: <path d="M2.5 3.5h11M2.5 6.5h11M2.5 9.5h11M2.5 12.5h7" />,
  geng: <path d="M8 1.75 13.5 4.5v4c0 3-2.4 5.1-5.5 5.75C4.9 13.6 2.5 11.5 2.5 8.5v-4z" />,
  meta: <path d="M2.5 13.5h11M4 11V7.5M7 11V4M10 11V6M13 11V2.5" />,
};
const GROUPS = [
  ["Draft", [
    ["/", "Draft Room", I.draft],
    ["/first-pick/bot", "First Pick", I.first],
    ["/comps", "Comp Library", I.comps],
    ["/pool", "Champion Pool", I.pool],
  ]],
  ["Pro evidence", [
    ["/pro-drafts", "Pro Drafts", I.pro],
    ["/geng", "Gen.G", I.geng],
    ["/meta", "Meta / Research", I.meta],
  ]],
] as const;

// Draft Assistant mark: a stem and five draft slots whose ends trace a "D". The middle slot is the pick being made.
// Custom artwork, not a Riot logo. The sidebar is dark in both themes, so the gold reads on either.
export function BrandMark({ className = "brand-mark" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 28 28" aria-hidden="true">
      <rect x="3" y="2.5" width="3" height="23" rx="1" fill="var(--side-accent)" />
      {[[2.5, 11], [7.5, 15], [12.5, 17], [17.5, 15], [22.5, 11]].map(([y, w], i) => (
        <rect key={y} x="8" y={y} width={w} height="3" rx="1" fill="var(--side-accent)" opacity={i === 2 ? 1 : 0.5} />
      ))}
    </svg>
  );
}

function Brand() {
  return (
    <Link href="/" className="brand" aria-label="Draft Assistant, Draft Room">
      <BrandMark />
      <span className="brand-name">Draft Assistant<span className="brand-sub">League drafting tool</span></span>
    </Link>
  );
}

export function Sidebar() {
  const raw = usePathname();
  const path = raw.length > 1 ? raw.replace(/\/$/, "") : raw;
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [raw]);
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href.split("/").slice(0, 2).join("/")));
  return (
    <>
      <div className="topbar">
        <Brand />
        <button className="menu-btn" aria-label={open ? "Close navigation" : "Open navigation"} aria-expanded={open} aria-controls="sidebar"
          onClick={() => setOpen((o) => !o)}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
            {open ? <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" /> : <path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11" />}
          </svg>
        </button>
      </div>
      {open && <button className="scrim" aria-label="Close navigation" onClick={() => setOpen(false)} />}
      <aside id="sidebar" className={`sidebar ${open ? "open" : ""}`}>
        <Brand />
        <nav className="nav" aria-label="Sections">
          {GROUPS.map(([group, links]) => (
            <div key={group} className="nav-group">
              <div className="nav-label">{group}</div>
              {links.map(([href, label, icon]) => (
                <Link key={href} href={href} className={`nav-item ${active(href) ? "active" : ""}`} aria-current={active(href) ? "page" : undefined}>
                  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round">{icon}</svg>
                  {label}
                </Link>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-foot">
          <Link href="/geng" className="side-mascot" title="GenRang, Gen.G's mascot">
            <GenRang size={30} /><span>Gen.G<small>GenRang</small></span>
          </Link>
          <ThemeToggle />
        </div>
      </aside>
    </>
  );
}
