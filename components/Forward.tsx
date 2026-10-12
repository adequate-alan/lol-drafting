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

// The retired /synergies/mid-jungle/ tab (and /first-pick/mid-jungle/) forwards to the champion's own role tab: Jungle
// when the link says role=JUNGLE or the champion only has a jungle profile, Mid otherwise. The query and hash are kept.
export function LegacyMidJungle({ jungleOnly }: { jungleOnly: string[] }) {
  const script = `(function(){var p=new URLSearchParams(location.search),r=p.get("role"),c=p.get("champ"),j=${JSON.stringify(jungleOnly)};`
    + `var t=r==="JUNGLE"||(!r&&c&&j.indexOf(c)>=0)?"jungle":"mid";location.replace(${JSON.stringify(BASE_PATH + "/synergies/")}+t+"/"+location.search+location.hash)})()`;
  useEffect(() => {
    const p = new URLSearchParams(window.location.search), r = p.get("role"), c = p.get("champ");
    const tab = r === "JUNGLE" || (!r && c && jungleOnly.includes(c)) ? "jungle" : "mid";
    window.location.replace(`${BASE_PATH}/synergies/${tab}/${window.location.search}${window.location.hash}`);
  }, [jungleOnly]);
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: script }} />
      <noscript><meta httpEquiv="refresh" content={`0;url=${BASE_PATH}/synergies/mid/`} /></noscript>
      <p className="small muted">Opening <Link href="/synergies/mid/">Champion Synergies: Mid</Link>…</p>
    </>
  );
}
