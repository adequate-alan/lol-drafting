// The Pro Builds data as one browser chunk: components/ProBuilds.tsx imports this module dynamically when a champion
// drawer first opens, so the player builds (data/pro-builds.json), their Data Dragon names and icons
// (data/build-assets.json) and the games they belong to are not embedded in every page. Read at build time like every
// other data file; tests/pro-builds.test.ts validates the same files with the zod schemas.
import assets from "@/data/build-assets.json";
import builds from "@/data/pro-builds.json";
import games from "@/data/pro-games.json";
import { buildRows } from "./pro-builds";
import type { BuildAssets, ProBuilds, ProGames } from "./schema";

export const rows = buildRows((builds as unknown as ProBuilds).builds, (games as unknown as ProGames).games, (assets as unknown as BuildAssets).patches);
