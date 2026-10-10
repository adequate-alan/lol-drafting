"use client";
import Link from "next/link";
import { useEffect } from "react";
import { BASE_PATH } from "@/lib/site";

// A static host can't send a server redirect, so a page forwards itself. The inline script runs as the HTML parses and
// keeps the query (?champ=, ?role=) and hash; the effect covers client navigation; <noscript> falls back to a refresh.
// `to` is a site path with a trailing slash, e.g. "/synergies/bot/".
export function Forward({ to, label }: { to: string; label: string }) {
  const target = BASE_PATH + to;
  useEffect(() => { window.location.replace(target + window.location.search + window.location.hash); }, [target]);
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: `location.replace(${JSON.stringify(target)}+location.search+location.hash)` }} />
      <noscript><meta httpEquiv="refresh" content={`0;url=${target}`} /></noscript>
      <p className="small muted">Opening <Link href={to}>{label}</Link>…</p>
    </>
  );
}
