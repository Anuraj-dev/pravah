// Entry point for demo mode. Loaded dynamically from main.tsx only when the
// demo flag is set in a development build.
import { loadState } from "./store";

export async function installDemoMode(): Promise<void> {
  loadState();
}
