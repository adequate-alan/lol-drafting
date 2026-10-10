"use client";
import { useEffect, useState } from "react";

type Theme = "light" | "dark";

// The inline script in app/layout.tsx sets data-theme before paint; this button only flips and saves it.
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null);
  useEffect(() => setTheme(document.documentElement.dataset.theme === "dark" ? "dark" : "light"), []);
  const next: Theme = theme === "dark" ? "light" : "dark";
  const flip = () => {
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("theme", next); } catch { /* private mode: still switches for this visit */ }
    setTheme(next);
  };
  return (
    <button type="button" className="theme-toggle" onClick={flip} aria-label={`Switch to ${next} theme`} title={`Switch to ${next} theme`}>
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
        {theme === "dark"
          ? <path d="M13 9.5A5.5 5.5 0 0 1 6.5 3a5.5 5.5 0 1 0 6.5 6.5z" />
          : <><circle cx="8" cy="8" r="3" /><path d="M8 1.5v1.5M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1 1M11.6 11.6l1 1M3.4 12.6l1-1M11.6 4.4l1-1" /></>}
      </svg>
      {theme === "dark" ? "Dark theme" : theme === "light" ? "Light theme" : "Theme"}
      <span className="hint">{theme ? `→ ${next}` : ""}</span>
    </button>
  );
}
