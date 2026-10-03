// Minimal auth-client stand-in used while demo mode is active. The real
// better-auth client is never constructed, so no network calls happen.
import { exitDemo } from "./demoFlag";

export const demoAuthClient = {
  signIn: {
    social: async (): Promise<{ error: null }> => ({ error: null }),
  },
  signOut: async (): Promise<void> => {
    exitDemo();
    window.location.reload();
  },
};
