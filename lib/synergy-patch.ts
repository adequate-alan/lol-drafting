// Champion Synergies patch scope (alan, 2026-10-13): every role page opens on All patches. A patch the user picks is
// kept for the rest of the browsing session (sessionStorage, this tab only) until they change or clear it, and a patch
// named in the URL always wins. All patches is historical: current meta priority always names its own patch.
export const PATCH_KEY = "synergies:patch";

/** The patch to put in the URL when it names none: the one picked earlier this session, never a default. */
export function patchToRestore(urlPatch: string | null, stored: string | null): string | undefined {
  return urlPatch == null && stored && stored !== "all" ? stored : undefined;
}

export function readStoredPatch(): string | null {
  try { return sessionStorage.getItem(PATCH_KEY); } catch { return null; }
}

/** Remember a picked patch ("all" or undefined clears it). */
export function storePatch(value: string | undefined) {
  try {
    if (value && value !== "all") sessionStorage.setItem(PATCH_KEY, value);
    else sessionStorage.removeItem(PATCH_KEY);
  } catch { /* storage unavailable: the URL still carries the choice */ }
}
