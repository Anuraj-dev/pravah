/// <reference types="node" />
import { ConvexClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { callConvexApi, ConvexHttpError } from "./automationHttpClient";
import { getLocalDayBounds, msUntilNextLocalMidnight } from "./localDay";
import { buildSnapshot, type WatchSnapshot } from "./watchSnapshot";

/**
 * The public queries `pravah watch` subscribes to. `makeFunctionReference` is
 * used instead of importing the generated api so the published CLI bundle does
 * not pull in the backend's generated module graph.
 */
type NoArgs = Record<string, never>;

const listBoardTasks = makeFunctionReference<"query", NoArgs, unknown>(
  "tasks:listBoardTasks"
);
const listTodayCompletedTasks = makeFunctionReference<
  "query",
  { dayStartMs: number; dayEndMs: number },
  unknown
>("tasks:listTodayCompletedTasks");
const listGoals = makeFunctionReference<"query", NoArgs, unknown>("goals:list");
const listGoalLinks = makeFunctionReference<"query", NoArgs, unknown>(
  "goals:listLinks"
);

export interface OwnerToken {
  token: string;
  expiresAt: number;
  convexUrl: string;
  siteUrl: string;
  label: string;
}

/** Refresh a little before expiry so a long-lived socket is never left unauthenticated. */
const TOKEN_REFRESH_SKEW_MS = 60 * 1000;

export async function fetchOwnerToken(
  siteUrl: string,
  bearerToken: string
): Promise<OwnerToken> {
  const response = await callConvexApi({
    convexUrl: siteUrl,
    endpoint: "/automation/convex-token",
    method: "POST",
    bearerToken,
  });

  if (
    !response ||
    typeof response !== "object" ||
    typeof (response as OwnerToken).token !== "string" ||
    typeof (response as OwnerToken).expiresAt !== "number" ||
    typeof (response as OwnerToken).convexUrl !== "string"
  ) {
    throw new Error("Convex token response is invalid");
  }
  return response as OwnerToken;
}

export class WatchAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WatchAuthError";
  }
}

type SourceKey = "boardTasks" | "completedToday" | "goals" | "goalLinks";

const SOURCE_KEYS: SourceKey[] = [
  "boardTasks",
  "completedToday",
  "goals",
  "goalLinks",
];

const emptySources = (): Record<SourceKey, unknown> => ({
  boardTasks: null,
  completedToday: null,
  goals: null,
  goalLinks: null,
});

const notReady = (): Record<SourceKey, boolean> => ({
  boardTasks: false,
  completedToday: false,
  goals: false,
  goalLinks: false,
});

export type WatchLogger = (message: string) => void;

export interface RunWatchOptions {
  siteUrl: string;
  bearerToken: string;
  onSnapshot: (snapshot: WatchSnapshot) => void;
  /**
   * Called when the credential stops being authorized. The subscription cannot
   * recover from this, so the caller is expected to shut down; throwing from
   * inside a websocket callback would only produce an unhandled rejection.
   */
  onAuthError?: (error: Error) => void;
  log?: WatchLogger;
  now?: () => number;
}

export interface WatchHandle {
  close(): Promise<void>;
}

/**
 * Opens one Convex websocket as the credential's owner and re-emits a snapshot
 * whenever any subscribed query changes.
 *
 * The automation bearer is never put on the socket. It is exchanged for a short
 * lived Convex token over HTTP, and only that token is handed to `setAuth`.
 */
export async function runWatch({
  siteUrl,
  bearerToken,
  onSnapshot,
  onAuthError,
  log = () => {},
  now = Date.now,
}: RunWatchOptions): Promise<WatchHandle> {
  let ownerToken = await fetchOwnerToken(siteUrl, bearerToken);
  const convexUrl = ownerToken.convexUrl;
  const client = new ConvexClient(convexUrl);

  const asAuthError = (error: unknown): Error | null => {
    const status = error instanceof ConvexHttpError ? error.status : null;
    if (status === 401 || status === 403) {
      return new WatchAuthError(
        "Pravah CLI credential is no longer authorized. Run `pravah auth login --bootstrap-token <token>`."
      );
    }
    return null;
  };

  // Invoked from Convex callbacks, where throwing would surface as an unhandled
  // rejection rather than a message the user can act on.
  const reportAsync = (error: unknown) => {
    const authError = asAuthError(error);
    if (authError) {
      if (onAuthError) onAuthError(authError);
      else log(`watch: ${authError.message}`);
      return;
    }
    log(`watch: ${String(error)}`);
  };

  // Used from awaited setup code, where a throw is the right control flow.
  const throwOnAuthError = (error: unknown): never => {
    const authError = asAuthError(error);
    if (authError) throw authError;
    throw error;
  };

  client.setAuth(async () => {
    if (ownerToken.expiresAt - TOKEN_REFRESH_SKEW_MS <= now()) {
      try {
        ownerToken = await fetchOwnerToken(siteUrl, bearerToken);
      } catch (error) {
        reportAsync(error);
        // Returning a token we already hold keeps the socket usable while the
        // caller shuts down; the next refresh attempt reports the real reason.
        return ownerToken.token;
      }
    }
    return ownerToken.token;
  });

  let unsubscribes: Array<() => void> = [];
  const latest = emptySources();
  // Only publish once every subscription has produced its first value, so a
  // partial snapshot is never written.
  const ready = notReady();
  let midnightTimer: ReturnType<typeof setTimeout> | undefined;

  const publish = () => {
    if (!SOURCE_KEYS.every((key) => ready[key])) return;
    onSnapshot(
      buildSnapshot({
        convexUrl,
        boardTasks: latest.boardTasks,
        completedToday: latest.completedToday,
        goals: latest.goals,
        goalLinks: latest.goalLinks,
        now: new Date(now()),
      })
    );
  };

  const track = (name: SourceKey) => (value: unknown) => {
    latest[name] = value;
    ready[name] = true;
    publish();
  };

  const failed = (name: SourceKey) => (error: unknown) => {
    reportAsync(error);
    log(`watch: ${name} subscription failed`);
  };

  const scheduleMidnightResubscribe = () => {
    midnightTimer = setTimeout(() => {
      resubscribe();
    }, msUntilNextLocalMidnight(new Date(now())));
    // Do not hold the process open for a midnight rollover.
    midnightTimer.unref?.();
  };

  const subscribe = (): Array<() => void> => {
    const { startMs, endMs } = getLocalDayBounds(new Date(now()));
    return [
      client.onUpdate(listBoardTasks, {}, track("boardTasks"), failed("boardTasks")),
      client.onUpdate(
        listTodayCompletedTasks,
        { dayStartMs: startMs, dayEndMs: endMs },
        track("completedToday"),
        failed("completedToday")
      ),
      client.onUpdate(listGoals, {}, track("goals"), failed("goals")),
      client.onUpdate(listGoalLinks, {}, track("goalLinks"), failed("goalLinks")),
    ];
  };

  // A subscribed query's arguments are fixed for its lifetime, so "today"
  // bounds go stale at local midnight. Re-subscribe instead of serving yesterday.
  const resubscribe = () => {
    for (const unsubscribe of unsubscribes) unsubscribe();
    unsubscribes = [];
    for (const key of SOURCE_KEYS) {
      ready[key] = false;
      latest[key] = null;
    }
    try {
      unsubscribes = subscribe();
    } catch (error) {
      reportAsync(error);
    }
    scheduleMidnightResubscribe();
  };

  try {
    unsubscribes = subscribe();
  } catch (error) {
    await client.close();
    throwOnAuthError(error);
  }
  scheduleMidnightResubscribe();

  return {
    async close() {
      if (midnightTimer) clearTimeout(midnightTimer);
      for (const unsubscribe of unsubscribes) unsubscribe();
      unsubscribes = [];
      await client.close();
    },
  };
}
