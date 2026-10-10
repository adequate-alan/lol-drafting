import "server-only";
import { getChampions, getMeta, getSources } from "./data";

export function nameMap(): Record<string, string> {
  return Object.fromEntries(getChampions().map((c) => [c.id, c.name]));
}
export function eventMap() {
  return Object.fromEntries(getMeta().events.map((e) => [e.id, e]));
}
export function sourceMap() {
  return Object.fromEntries(getSources().map((s) => [s.id, s]));
}
