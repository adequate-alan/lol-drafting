import "server-only";
import { getChampions, getSources } from "./data";

export function nameMap(): Record<string, string> {
  return Object.fromEntries(getChampions().map((c) => [c.id, c.name]));
}
export function sourceMap() {
  return Object.fromEntries(getSources().map((s) => [s.id, s]));
}
