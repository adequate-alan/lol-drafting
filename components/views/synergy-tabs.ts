// Shared by the server page (static params) and the client view; a "use client" module can't export plain values to the server.
export const TABS = { bot: "Bot", support: "Support", "mid-jungle": "Mid / Jungle", top: "Top" } as const;
export type Tab = keyof typeof TABS;
