"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  ["/", "Draft Room"],
  ["/first-pick/bot", "First Pick"],
  ["/comps", "Comp Library"],
  ["/pool", "Champion Pool"],
  ["/pro-drafts", "Pro Drafts"],
  ["/geng", "Gen.G"],
  ["/meta", "Meta / Research"],
] as const;

export function NavLinks() {
  const path = usePathname();
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href.split("/").slice(0, 2).join("/")));
  return (
    <>
      {LINKS.map(([href, label]) => (
        <Link key={href} href={href} className={active(href) ? "active" : undefined}>{label}</Link>
      ))}
    </>
  );
}
