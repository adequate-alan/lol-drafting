import type { NextConfig } from "next";
import { DDRAGON_FALLBACK_VERSION } from "./lib/champion-icons";
import { BASE_PATH } from "./lib/site";
import { buildId } from "./lib/build-id.mjs";

// Latest Data Dragon patch at build time, so each deploy pins one icon set. Falls back to a known
// patch when the CDN can't be reached (offline builds); icons that 404 fall back to initials.
async function ddragonVersion(): Promise<string> {
  try {
    const res = await fetch("https://ddragon.leagueoflegends.com/api/versions.json", { signal: AbortSignal.timeout(5000) });
    const versions = (await res.json()) as string[];
    return versions[0] ?? DDRAGON_FALLBACK_VERSION;
  } catch {
    return DDRAGON_FALLBACK_VERSION;
  }
}

// Fully static export for GitHub Pages: no server, no API routes, no middleware.
export default async function config(): Promise<NextConfig> {
  return {
    output: "export",
    basePath: BASE_PATH,
    // pool/index.html instead of pool.html, so /lol-drafting/pool/ resolves the same way on every static host.
    trailingSlash: true,
    images: { unoptimized: true },
    env: { NEXT_PUBLIC_DDRAGON_VERSION: await ddragonVersion(), NEXT_PUBLIC_BUILD_ID: buildId() },
  };
}
