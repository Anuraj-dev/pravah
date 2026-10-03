import { ConvexReactClient } from "convex/react";
import { ConvexBetterAuthProvider } from "@convex-dev/better-auth/react";
import { useState, type ReactNode } from "react";
import { authClient } from "./auth-client";
import { isDemoMode } from "../demo/demoFlag";

function createConvexClient() {
  return new ConvexReactClient(import.meta.env.VITE_CONVEX_URL, {
    expectAuth: true,
  });
}

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  // Demo mode renders no Convex provider at all: the demo hook shim in
  // src/lib/demoBridge serves every query and mutation locally.
  if (isDemoMode()) {
    return <>{children}</>;
  }
  return <RealConvexProvider>{children}</RealConvexProvider>;
}

function RealConvexProvider({ children }: { children: ReactNode }) {
  const [convex] = useState(createConvexClient);
  return (
    <ConvexBetterAuthProvider client={convex} authClient={authClient}>
      {children}
    </ConvexBetterAuthProvider>
  );
}
