// Local-only demo mode. Never active in production builds: isDemoMode() is
// hard-gated on import.meta.env.DEV, so the demo engine can never run against
// a deployed app and no real backend is ever touched while it is active.
export const DEMO_FLAG_KEY = "pravah:demo-mode";
export const DEMO_DATA_KEY = "pravah:demo-data:v1";

export function isDemoMode(): boolean {
  return import.meta.env.DEV === true && window.localStorage.getItem(DEMO_FLAG_KEY) === "1";
}

export function enterDemo(): void {
  window.localStorage.setItem(DEMO_FLAG_KEY, "1");
}

export function exitDemo(): void {
  window.localStorage.removeItem(DEMO_FLAG_KEY);
  window.localStorage.removeItem(DEMO_DATA_KEY);
}

export function wantsDemoFromQuery(): boolean {
  if (import.meta.env.DEV !== true) return false;
  return new URLSearchParams(window.location.search).has("demo");
}
