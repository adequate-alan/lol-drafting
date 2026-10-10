// One id per deploy, shared by next.config.ts (baked into the pages) and scripts/write-version.mjs (out/version.json).
// CI uses the commit SHA; a local build falls back to the current commit.
import { execSync } from "node:child_process";

export function buildId() {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA;
  try { return execSync("git rev-parse HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim(); } catch { return "local"; }
}
