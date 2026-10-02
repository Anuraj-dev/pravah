import { lazy, Suspense } from "react";
import { Authenticated, AuthLoading, Unauthenticated } from "convex/react";
import { LoadingSkeleton } from "./components/LoadingSkeleton";
import { Landing } from "./components/Landing";

const AuthenticatedApp = lazy(() =>
  import("./components/AuthenticatedApp").then((module) => ({
    default: module.AuthenticatedApp,
  }))
);

export function App() {
  return (
    <>
      <AuthLoading>
        <LoadingSkeleton />
      </AuthLoading>
      <Unauthenticated>
        <Landing />
      </Unauthenticated>
      <Authenticated>
        <Suspense fallback={<LoadingSkeleton />}>
          <AuthenticatedApp />
        </Suspense>
      </Authenticated>
    </>
  );
}
