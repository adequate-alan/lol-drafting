// Writes out/version.json after the static export. Open tabs poll it to offer a refresh after a deploy.
import { writeFileSync } from "node:fs";
import { buildId } from "../lib/build-id.mjs";

writeFileSync(new URL("../out/version.json", import.meta.url), JSON.stringify({ id: buildId() }) + "\n");
