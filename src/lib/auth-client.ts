import { createAuthClient } from "better-auth/react";
import {
  convexClient,
  crossDomainClient,
} from "@convex-dev/better-auth/client/plugins";
import { isDemoMode } from "../demo/demoFlag";

function createRealAuthClient() {
  return createAuthClient({
    baseURL: import.meta.env.VITE_CONVEX_SITE_URL,
    plugins: [convexClient(), crossDomainClient()],
  });
}

type RealAuthClient = ReturnType<typeof createRealAuthClient>;

function createAuthClientForEnv(): RealAuthClient {
  // Demo mode never talks to the auth server; sign-out just exits the demo.
  if (isDemoMode()) {
    return {
      signIn: { social: async () => ({ error: null }) },
      signOut: async () => {
        const { exitDemo } = await import("../demo/demoFlag");
        exitDemo();
        window.location.reload();
      },
    } as unknown as RealAuthClient;
  }
  return createRealAuthClient();
}

export const authClient = createAuthClientForEnv();
