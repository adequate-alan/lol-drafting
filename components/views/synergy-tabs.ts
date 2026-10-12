import type { Role } from "@/lib/schema";

// Shared by the server page (static params) and the client view; a "use client" module can't export plain values to the server.
// One tab per role (alan, 2026-10-12): Mid and Jungle were one "Mid / Jungle" tab until then.
export const TABS = { top: "Top", jungle: "Jungle", mid: "Mid", bot: "Bot", support: "Support" } as const;
export type Tab = keyof typeof TABS;
export const TAB_ROLE: Record<Tab, Role> = { top: "TOP", jungle: "JUNGLE", mid: "MID", bot: "BOT", support: "SUPPORT" };
// The retired combined tab. Its URLs forward to /synergies/mid/ or /synergies/jungle/ (see LegacyMidJungle in Forward.tsx).
export const LEGACY_MID_JUNGLE = "mid-jungle";
