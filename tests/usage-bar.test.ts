// Segmented usage bars name each segment in the themed tip (hover, focus, tap); display only.
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Bar } from "@/components/TopDraft";

describe("usage bar segments", () => {
  const html = renderToStaticMarkup(
    createElement(Bar, { label: "Blind or response", parts: [
      ["Blind", 20, "blind", "Blind — 20/28 classified picks (71%)"],
      ["Response", 8, "response", "Response — 8/28 classified picks (29%)"],
      ["Unclear", 1, "uncertain", "Unclear — 1 pick (excluded from classified percentages)"],
      ["Empty", 0, "uncertain", "never shown"],
    ] }),
  );
  it("gives every non-empty segment its own focusable, tappable tip", () => {
    expect(html.match(/tabindex="0"/g)).toHaveLength(3);
    expect(html.match(/data-tip-tap=""/g)).toHaveLength(3);
    expect(html).toContain('title="Blind — 20/28 classified picks (71%)"');
    expect(html).toContain('aria-label="Unclear — 1 pick (excluded from classified percentages)"');
    expect(html).not.toContain("never shown");
    expect(html).toContain('role="group" aria-label="Blind or response"');
  });
});
