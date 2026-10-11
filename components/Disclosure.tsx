"use client";
// Secondary detail behind a summary line (alan, 2026-10-11: new data goes into hover, expansion or a drawer, not new
// permanent panels). `section` gives the summary heading weight; `lazy` renders the body only once opened, so closed
// sections cost nothing and hold no lazy images.
import { useState } from "react";

export function Disclosure({ summary, meta, children, open: initial = false, section = false, lazy = false, className = "" }: {
  summary: React.ReactNode; meta?: React.ReactNode; children: React.ReactNode;
  open?: boolean; section?: boolean; lazy?: boolean; className?: string;
}) {
  const [open, setOpen] = useState(initial);
  return (
    <details className={`disclosure ${section ? "section" : ""} ${className}`.trim()} open={initial || undefined}
      onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>{summary}{meta != null && <span className="meta">{meta}</span>}</summary>
      {(!lazy || open) && <div className="disclosure-body">{children}</div>}
    </details>
  );
}
