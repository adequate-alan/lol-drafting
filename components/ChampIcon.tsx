"use client";
import { useEffect, useRef, useState } from "react";
import { championIconUrl } from "@/lib/champion-icons";
import type { Role } from "@/lib/schema";

export type IconSize = "xs" | "sm" | "md" | "ml" | "lg" | "xl" | "xxl";

/** Two-letter fallback shown under the icon, and on its own if the icon fails to load. */
export function champInitials(name: string) {
  const words = name.replace(/[^A-Za-z ]/g, " ").trim().split(/\s+/);
  return words.length > 1 ? (words[0][0] + words[1][0]).toUpperCase() : name.slice(0, 2).replace(/^./, (c) => c.toUpperCase());
}

/** Square champion icon (Data Dragon) on a fixed-size tile, so a missing image never changes the layout. */
export function ChampIcon({ id, name, role, size = "sm" }: { id?: string; name: string; role?: Role; size?: IconSize }) {
  const [failed, setFailed] = useState(false);
  const img = useRef<HTMLImageElement>(null);
  // An image that failed before hydration never fires onError for React; catch it here.
  useEffect(() => { if (img.current?.complete && img.current.naturalWidth === 0) setFailed(true); }, [id]);
  return (
    <span className={`champ ${size} ${role ? `role-${role}` : ""}`} aria-hidden="true" data-icon={!id ? undefined : failed ? "failed" : "image"} data-champ={id}>
      <span className="mono">{champInitials(name)}</span>
      {id && !failed && <img ref={img} src={championIconUrl(id, name)} alt="" loading="lazy" decoding="async" draggable={false} onError={() => setFailed(true)} />}
    </span>
  );
}
