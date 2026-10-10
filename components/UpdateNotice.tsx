"use client";
import { useEffect, useState } from "react";
import { BASE_PATH } from "@/lib/site";

const CURRENT = process.env.NEXT_PUBLIC_BUILD_ID;
const EVERY_MS = 60_000;

// Polls out/version.json (written after each build) and offers a refresh once a newer deploy is live.
export function UpdateNotice() {
  const [latest, setLatest] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(null);
  useEffect(() => {
    if (!CURRENT || process.env.NODE_ENV !== "production") return;
    let stop = false;
    const check = async () => {
      if (stop || document.visibilityState !== "visible") return;
      try {
        const res = await fetch(`${BASE_PATH}/version.json?t=${Date.now()}`, { cache: "no-store" });
        if (!res.ok) return;
        const { id } = (await res.json()) as { id?: string };
        if (id && id !== CURRENT) setLatest(id);
      } catch { /* offline: try again later */ }
    };
    const timer = window.setInterval(check, EVERY_MS);
    const onFocus = () => void check();
    document.addEventListener("visibilitychange", onFocus);
    window.addEventListener("focus", onFocus);
    void check();
    return () => { stop = true; window.clearInterval(timer); document.removeEventListener("visibilitychange", onFocus); window.removeEventListener("focus", onFocus); };
  }, []);
  if (!latest || dismissed === latest) return null;
  return (
    <div className="update-notice" role="status">
      <span>Site updated</span>
      <button className="btn sm primary" onClick={() => window.location.reload()}>Refresh</button>
      <button className="icon-btn" aria-label="Dismiss" onClick={() => setDismissed(latest)}>×</button>
    </div>
  );
}
