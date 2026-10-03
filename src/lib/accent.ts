// Web accent palette selection — mirrors mobile's four accent palettes
// (apps/mobile/src/theme/tokens.ts). The choice is applied as a data attribute
// on <html> so every token (Tailwind @theme aliases included) follows.
export type WebAccent = "purple" | "copper" | "teal" | "rose";

const ACCENT_STORAGE_KEY = "pravah:web-accent";
const DEFAULT_ACCENT: WebAccent = "purple";

export const ACCENT_OPTIONS: Array<{ value: WebAccent; label: string; dot: string }> = [
  { value: "purple", label: "Purple", dot: "#6753c7" },
  { value: "copper", label: "Copper", dot: "#9a552f" },
  { value: "teal", label: "Teal", dot: "#28716e" },
  { value: "rose", label: "Rose", dot: "#98516a" },
];

export function isWebAccent(value: unknown): value is WebAccent {
  return value === "purple" || value === "copper" || value === "teal" || value === "rose";
}

export function loadAccent(): WebAccent {
  try {
    const stored = localStorage.getItem(ACCENT_STORAGE_KEY);
    return isWebAccent(stored) ? stored : DEFAULT_ACCENT;
  } catch {
    return DEFAULT_ACCENT;
  }
}

export function applyAccent(accent: WebAccent): void {
  if (accent === DEFAULT_ACCENT) {
    delete document.documentElement.dataset.accent;
  } else {
    document.documentElement.dataset.accent = accent;
  }
}

export function storeAccent(accent: WebAccent): void {
  try {
    localStorage.setItem(ACCENT_STORAGE_KEY, accent);
  } catch {
    // Storage unavailable (private mode) — accent stays session-only.
  }
}
