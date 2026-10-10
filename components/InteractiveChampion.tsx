"use client";
// The trigger half of the shared champion interaction (components/ChampionInteraction.tsx). Kept in its own file with
// no UI imports so components/ui.tsx can use it in Chip and Duo without an import cycle.
import { createContext, useContext } from "react";
import type { Role } from "@/lib/schema";

type Target = { id: string; role?: Role };
export interface ChampionCtxValue {
  openDrawer: (t: Target) => void;
  hover: (t: Target, el: HTMLElement) => void;
  unhover: () => void;
}
export const ChampionCtx = createContext<ChampionCtxValue | null>(null);

/** Makes any champion rendering interactive inside a ChampionProvider; plain children outside one. */
export function InteractiveChampion({ id, role, children, className = "" }: { id: string; role?: Role; children: React.ReactNode; className?: string }) {
  const ctx = useContext(ChampionCtx);
  if (!ctx) return <>{children}</>;
  const t = { id, role };
  return (
    <button type="button" className={`champ-btn ${className}`.trim()} data-drawer-trigger aria-haspopup="dialog"
      onClick={(e) => { e.stopPropagation(); ctx.openDrawer(t); }}
      // Touch has no hover: a tap goes straight to the drawer.
      onPointerEnter={(e) => { if (e.pointerType === "mouse") ctx.hover(t, e.currentTarget); }}
      onPointerLeave={(e) => { if (e.pointerType === "mouse") ctx.unhover(); }}
      onFocus={(e) => { if (e.currentTarget.matches(":focus-visible")) ctx.hover(t, e.currentTarget); }}
      onBlur={() => ctx.unhover()}>
      {children}
    </button>
  );
}

