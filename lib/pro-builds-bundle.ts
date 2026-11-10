// The Pro Builds data as one browser chunk: components/views/ProBuildsView.tsx imports this module dynamically when
// /pro-builds/ opens, so the player builds (data/pro-builds.json), their Data Dragon names and icons
// (data/build-assets.json), the games they belong to and the item history (data/item-changes.json) are not embedded in every page. Read at build time like every
// other data file; tests/pro-builds.test.ts validates the same files with the zod schemas.
import assets from "@/data/build-assets.json";
import builds from "@/data/pro-builds.json";
import games from "@/data/pro-games.json";
import history from "@/data/item-changes.json";
import { buildItems, checkBuild } from "./item-history";
import { buildRows, type BuildRow } from "./pro-builds";
import type { BuildAssets, ItemChanges, ProBuilds, ProGames } from "./schema";

const stored = builds as unknown as ProBuilds;
// Archive games (the LCK playoffs) travel with their builds in pro-builds.json; tracked ones are in pro-games.json.
// Each row carries what Riot changed in its items since the game (data/item-changes.json, a few KB).
export const rows: BuildRow[] = buildRows(stored.builds, [...(games as unknown as ProGames).games, ...(stored.games ?? [])], (assets as unknown as BuildAssets).patches)
  .map((r) => ({ ...r, itemCheck: checkBuild(history as unknown as ItemChanges, r.game, buildItems(r.build).map((id) => ({ id, name: r.assets?.items[id]?.name ?? "" }))) }));
