"use client";
// The two Pro Builds views (alan, 2026-10-12): the champion browser and the Pinned Players hub.
import Link from "next/link";
import { usePins } from "@/components/PlayerPicker";

export function BuildsTabs({ current }: { current: "champions" | "pinned" }) {
  const { pins } = usePins();
  return (
    <nav className="seg builds-views" aria-label="Pro Builds views">
      <Link href="/pro-builds/" className={current === "champions" ? "active" : undefined} aria-current={current === "champions" ? "page" : undefined}>Champions</Link>
      <Link href="/pro-builds/pinned/" className={current === "pinned" ? "active" : undefined} aria-current={current === "pinned" ? "page" : undefined}>
        Pinned players{pins.length > 0 && <span className="count tnum"> {pins.length}</span>}
      </Link>
    </nav>
  );
}
