// Sync settings — web port of the mobile SyncSection: Google account
// connection, per-surface toggles (Calendar / Gmail), calendar picker, and
// the Gmail review queue. All server behavior is carried over verbatim from
// the previous settings modal.
import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { T_FAST } from "../../lib/motion";
import { useAction, useMutation, useQuery } from "../../lib/data";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import {
  getGoogleTokens,
  clearGoogleTokens,
  revokeGoogleToken,
  fetchGoogleAccountEmail,
  fetchGoogleCalendars,
  getGoogleAuthErrorMessage,
  getGoogleOAuthUrl,
  fetchGmailMessages,
} from "../../lib/google/api";
import type { GoogleCalendarListEntry } from "../../lib/google/types";
import { cn } from "../../lib/utils";
import { useToast } from "../useToast";
import {
  SettingsCard,
  SettingRow,
  StatusBadge,
  SettingsButton,
  MonoKicker,
  WarmToggle,
} from "./primitives";
import { CalendarIcon, MailIcon, SyncLoopIcon } from "../ui/icons";
import { providerGoogleIcon } from "../ui/traced-icons";

const GoogleIcon = providerGoogleIcon;

interface ReviewPayloadPreview {
  from?: string;
  date?: string;
  threadId?: string;
}

function parseReviewPayload(payloadJson?: string): ReviewPayloadPreview | null {
  if (!payloadJson) return null;
  try {
    const parsed = JSON.parse(payloadJson) as Record<string, unknown>;
    return {
      from: typeof parsed.from === "string" ? parsed.from : undefined,
      date: typeof parsed.date === "string" ? parsed.date : undefined,
      threadId: typeof parsed.threadId === "string" ? parsed.threadId : undefined,
    };
  } catch {
    return null;
  }
}

const CALENDAR_SELECTION_STORAGE_KEY = "pravah_google_calendar_selection";

export function SyncSettingsSection() {
  const [googleConnected, setGoogleConnected] = useState(() => {
    const storedTokens = getGoogleTokens();
    return !!storedTokens && !storedTokens.expired;
  });
  const [calendarEnabled, setCalendarEnabled] = useState(false);
  const [gmailEnabled, setGmailEnabled] = useState(false);
  const [reviewScheduleOverrides, setReviewScheduleOverrides] = useState<Record<string, string>>(
    {}
  );
  const [attemptedEmailHydration, setAttemptedEmailHydration] = useState(false);
  const [hydratedToggleState, setHydratedToggleState] = useState(false);
  const [availableCalendars, setAvailableCalendars] = useState<GoogleCalendarListEntry[]>([]);
  const [selectedCalendarIds, setSelectedCalendarIds] = useState<string[]>([]);
  const [calendarSelectionHydrated, setCalendarSelectionHydrated] = useState(false);
  const [loadingCalendars, setLoadingCalendars] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [activeReviewActionId, setActiveReviewActionId] = useState<string | null>(null);
  const upsertIntegration = useMutation(api.sync.upsertIntegration);
  const enqueueGmailCandidate = useMutation(api.sync.enqueueGmailCandidate);
  const approveReviewItem = useMutation(api.sync.approveReviewItem);
  const rejectReviewItem = useMutation(api.sync.rejectReviewItem);
  const importGoogleCalendar = useAction(api.syncActions.importGoogleCalendarAction);
  const calendarIntegrationStatus = useQuery(api.sync.getIntegrationStatus, {
    provider: "google_calendar",
  });
  const gmailIntegrationStatus = useQuery(api.sync.getIntegrationStatus, {
    provider: "gmail",
  });
  const shouldLoadReviewQueue = googleConnected && gmailEnabled;
  const pendingReviewItems = useQuery(
    api.sync.listReviewQueue,
    shouldLoadReviewQueue
      ? ({
          status: "pending",
          limit: 25,
        } as const)
      : "skip"
  );
  const safePendingReviewItems = shouldLoadReviewQueue ? (pendingReviewItems ?? []) : [];
  const currentUser = useQuery(api.auth.getCurrentUser, {});
  const googleAccountEmail = calendarIntegrationStatus?.integration?.accountEmail;
  const { showError, showSuccess } = useToast();

  useEffect(() => {
    if (hydratedToggleState) return;
    if (!calendarIntegrationStatus || !gmailIntegrationStatus) return;

    setCalendarEnabled(Boolean(calendarIntegrationStatus.integration?.syncEnabled));
    setGmailEnabled(Boolean(gmailIntegrationStatus.integration?.syncEnabled));
    setHydratedToggleState(true);
  }, [hydratedToggleState, calendarIntegrationStatus, gmailIntegrationStatus]);

  useEffect(() => {
    if (!calendarIntegrationStatus) return;
    if (!googleConnected || googleAccountEmail || attemptedEmailHydration) return;
    const tokens = getGoogleTokens();
    if (!tokens || tokens.expired) return;

    setAttemptedEmailHydration(true);
    void (async () => {
      try {
        const accountEmail = await fetchGoogleAccountEmail(tokens.accessToken);
        await upsertIntegration({
          provider: "google_calendar",
          status: "connected",
          syncEnabled: Boolean(calendarIntegrationStatus.integration?.syncEnabled),
          accountEmail,
        });
      } catch (error) {
        console.warn("Unable to hydrate Google account email", error);
      }
    })();
  }, [
    googleConnected,
    googleAccountEmail,
    attemptedEmailHydration,
    upsertIntegration,
    calendarIntegrationStatus,
  ]);

  useEffect(() => {
    if (!googleConnected) {
      setAvailableCalendars([]);
      setSelectedCalendarIds([]);
      setCalendarSelectionHydrated(false);
      return;
    }

    const tokens = getGoogleTokens();
    if (!tokens || tokens.expired) return;

    let cancelled = false;
    setLoadingCalendars(true);
    void (async () => {
      try {
        const calendars = await fetchGoogleCalendars(tokens.accessToken);
        if (cancelled) return;
        setAvailableCalendars(calendars);

        const storedRaw = localStorage.getItem(CALENDAR_SELECTION_STORAGE_KEY);
        const storedIds = storedRaw ? (JSON.parse(storedRaw) as string[]) : [];
        const calendarIds = calendars.map((calendar) => calendar.id);
        const nextSelection =
          storedIds.length > 0
            ? storedIds.filter((id) => calendarIds.includes(id))
            : calendarIds;
        setSelectedCalendarIds(nextSelection);
        setCalendarSelectionHydrated(true);
      } catch (error) {
        console.warn("Failed to fetch Google calendar list", error);
        if (!cancelled) {
          setAvailableCalendars([{ id: "primary", summary: "Primary", primary: true }]);
          setSelectedCalendarIds(["primary"]);
          setCalendarSelectionHydrated(true);
        }
      } finally {
        if (!cancelled) {
          setLoadingCalendars(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [googleConnected]);

  useEffect(() => {
    if (!googleConnected || !calendarSelectionHydrated) return;
    if (selectedCalendarIds.length === 0) {
      localStorage.removeItem(CALENDAR_SELECTION_STORAGE_KEY);
      return;
    }
    localStorage.setItem(CALENDAR_SELECTION_STORAGE_KEY, JSON.stringify(selectedCalendarIds));
  }, [googleConnected, calendarSelectionHydrated, selectedCalendarIds]);

  const persistIntegrationToggle = async (
    provider: "google_calendar" | "gmail",
    syncEnabled: boolean
  ) => {
    const payload: {
      provider: "google_calendar" | "gmail";
      status: "connected" | "disconnected";
      syncEnabled: boolean;
      accountEmail?: string;
    } = {
      provider,
      status: googleConnected ? "connected" : "disconnected",
      syncEnabled,
    };

    // Preserve the known Google account identity while updating toggle state.
    if (googleAccountEmail) {
      payload.accountEmail = googleAccountEmail;
    }

    await upsertIntegration(payload);
  };

  const handleCalendarToggle = async () => {
    const next = !calendarEnabled;
    setCalendarEnabled(next);
    try {
      await persistIntegrationToggle("google_calendar", next);
    } catch (error) {
      console.error("Failed to persist calendar toggle", error);
      setCalendarEnabled(!next);
      showError("Failed to save Google Calendar toggle.");
    }
  };

  const handleGmailToggle = async () => {
    const next = !gmailEnabled;
    setGmailEnabled(next);
    try {
      await persistIntegrationToggle("gmail", next);
    } catch (error) {
      console.error("Failed to persist Gmail toggle", error);
      setGmailEnabled(!next);
      showError("Failed to save Gmail toggle.");
    }
  };

  const handleGoogleConnect = async () => {
    try {
      const oauthUrl = await getGoogleOAuthUrl();
      window.location.href = oauthUrl;
    } catch (error) {
      showError(
        getGoogleAuthErrorMessage(error, "Failed to start Google sync permission flow.")
      );
    }
  };

  const handleGoogleDisconnect = async () => {
    const tokens = getGoogleTokens();
    // Fire-and-forget: revocation is best-effort. Local disconnect must never
    // be blocked by a slow or unreachable oauth2.googleapis.com endpoint.
    if (tokens && !tokens.expired) {
      void revokeGoogleToken(tokens.accessToken);
    }
    clearGoogleTokens();
    try {
      await Promise.all([
        upsertIntegration({
          provider: "google_calendar",
          status: "disconnected",
          syncEnabled: false,
          accountEmail: undefined,
        }),
        upsertIntegration({
          provider: "gmail",
          status: "disconnected",
          syncEnabled: false,
          accountEmail: undefined,
        }),
      ]);
    } catch (error) {
      console.error("Failed to persist Google disconnect state", error);
      showError("Disconnected locally, but failed to update server state.");
    }
    setGoogleConnected(false);
    setCalendarEnabled(false);
    setGmailEnabled(false);
  };

  const getSyncErrorMessage = (error: unknown): string => {
    const raw = getGoogleAuthErrorMessage(error, "Failed to sync with Google. Please try again.");
    if (raw.includes("SERVICE_DISABLED") || raw.includes("accessNotConfigured")) {
      return "Google Calendar API is disabled in your Google Cloud project. Enable it, wait a few minutes, then retry sync.";
    }
    if (raw.includes("insufficientPermissions")) {
      return "Google permissions are insufficient. Reconnect Google and grant Calendar access.";
    }
    return raw;
  };

  const handleSync = async (fullResync = false) => {
    const tokens = getGoogleTokens();
    if (!tokens || tokens.expired) {
      showError("Google authentication expired. Please reconnect.");
      return;
    }

    setSyncing(true);
    try {
      if (calendarEnabled) {
        await upsertIntegration({
          provider: "google_calendar",
          status: "connected",
          syncEnabled: true,
        });
        await importGoogleCalendar({
          accessToken: tokens.accessToken,
          calendarIds: selectedCalendarIds.length > 0 ? selectedCalendarIds : undefined,
          fullResync,
        });
      }
      if (gmailEnabled) {
        const messages = await fetchGmailMessages(tokens.accessToken);
        let queuedCount = 0;
        for (const message of messages) {
          const candidateTitle =
            message.subject?.trim() ||
            message.snippet?.trim() ||
            `Email follow-up ${message.id.slice(0, 8)}`;
          const result = await enqueueGmailCandidate({
            externalId: message.id,
            title: candidateTitle,
            description: message.snippet,
            payloadJson: JSON.stringify({
              threadId: message.threadId,
              from: message.from,
              date: message.date,
            }),
          });
          if (!result.deduplicated) {
            queuedCount += 1;
          }
        }
        if (messages.length > 0) {
          showSuccess(
            queuedCount > 0
              ? `Queued ${queuedCount} Gmail item(s) for approval`
              : "No new Gmail candidates to review"
          );
        }
      }
      showSuccess("Sync completed successfully!");
    } catch (error) {
      console.error("Sync error:", error);
      showError(getSyncErrorMessage(error));
    }
    setSyncing(false);
  };

  const toggleCalendarSelection = (calendarId: string) => {
    setSelectedCalendarIds((prev) =>
      prev.includes(calendarId) ? prev.filter((id) => id !== calendarId) : [...prev, calendarId]
    );
  };

  const handleApproveReviewItem = async (reviewId: Id<"reviewQueue">) => {
    setActiveReviewActionId(reviewId);
    const scheduledDate = reviewScheduleOverrides[reviewId];
    try {
      await approveReviewItem({
        reviewId,
        scheduledDate: scheduledDate || undefined,
      });
      showSuccess("Approved and added to tasks");
      setReviewScheduleOverrides((prev) => {
        const next = { ...prev };
        delete next[reviewId];
        return next;
      });
    } catch (error) {
      console.error("Approve review item failed", error);
      showError("Failed to approve review item");
    } finally {
      setActiveReviewActionId(null);
    }
  };

  const handleRejectReviewItem = async (reviewId: Id<"reviewQueue">) => {
    setActiveReviewActionId(reviewId);
    try {
      await rejectReviewItem({ reviewId });
      showSuccess("Review item rejected");
    } catch (error) {
      console.error("Reject review item failed", error);
      showError("Failed to reject review item");
    } finally {
      setActiveReviewActionId(null);
    }
  };

  const accountLabel = useMemo(
    () => googleAccountEmail ?? currentUser?.email ?? currentUser?.name ?? undefined,
    [googleAccountEmail, currentUser]
  );

  return (
    <div className="space-y-4">
      <SettingsCard>
        <div className="flex items-center gap-3">
          <span
            className="grid place-items-center shrink-0"
            style={{
              width: 36,
              height: 36,
              borderRadius: 12,
              background: "var(--color-bg-surface)",
              border: "1px solid var(--color-border-subtle)",
              color: "var(--color-text-secondary)",
            }}
          >
            <GoogleIcon size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[13px] font-semibold text-ink">Google account</span>
              <StatusBadge tone={googleConnected ? "success" : "idle"} label={googleConnected ? "Connected" : "Not connected"} />
            </div>
            <p className="mt-0.5 text-[12.5px] leading-[18px] text-ink-mute truncate">
              {googleConnected
                ? accountLabel
                  ? `Granted for ${accountLabel}`
                  : "Permissions granted from this browser."
                : "Grant calendar and Gmail read access from this browser."}
            </p>
          </div>
          {googleConnected ? (
            <SettingsButton variant="danger" onClick={() => void handleGoogleDisconnect()}>
              Disconnect
            </SettingsButton>
          ) : (
            <SettingsButton variant="accent" onClick={() => void handleGoogleConnect()}>
              Grant access
            </SettingsButton>
          )}
        </div>
      </SettingsCard>

      <AnimatePresence>
        {googleConnected && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={T_FAST}
            className="space-y-4 overflow-hidden"
          >
            <SettingsCard>
              <label className="flex cursor-pointer items-center gap-3">
                <span
                  className="grid place-items-center shrink-0"
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 12,
                    background: "var(--color-bg-surface)",
                    border: "1px solid var(--color-border-subtle)",
                    color: "var(--color-text-secondary)",
                  }}
                >
                  <CalendarIcon size={18} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-semibold text-ink">Google Calendar</span>
                  <span className="block text-[12.5px] leading-[18px] text-ink-mute">
                    Pull events and deadlines into Pravah. One-way import — changes in Pravah
                    don't write back to Google.
                  </span>
                </span>
                <WarmToggle checked={calendarEnabled} onChange={() => void handleCalendarToggle()} label="Google Calendar sync" />
              </label>

              {calendarEnabled && (
                <div className="space-y-2" style={{ borderTop: "1px solid var(--color-border-subtle)", paddingTop: 12 }}>
                  <div className="flex items-center justify-between">
                    <MonoKicker>Calendars to sync</MonoKicker>
                    <span className="text-[11.5px] text-ink-mute">
                      {selectedCalendarIds.length}/{availableCalendars.length || 1}
                    </span>
                  </div>
                  {loadingCalendars ? (
                    <p className="text-[12px] text-ink-mute">Loading calendars…</p>
                  ) : (
                    <div className="space-y-1.5 max-h-32 overflow-y-auto pr-1">
                      {availableCalendars.map((calendar) => (
                        <label
                          key={calendar.id}
                          className="flex items-center gap-2.5 text-[12.5px] text-ink-soft cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={selectedCalendarIds.includes(calendar.id)}
                            onChange={() => toggleCalendarSelection(calendar.id)}
                            className="accent-accent"
                          />
                          <span className="truncate">
                            {calendar.summary}
                            {calendar.primary ? " (Primary)" : ""}
                          </span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {calendarEnabled && (
                <div className="flex flex-wrap gap-2" style={{ borderTop: "1px solid var(--color-border-subtle)", paddingTop: 12 }}>
                  <SettingsButton
                    variant="soft"
                    onClick={() => void handleSync(false)}
                    disabled={syncing || (calendarEnabled && selectedCalendarIds.length === 0)}
                  >
                    <SyncLoopIcon size={14} className={syncing ? "animate-spin" : ""} />
                    {syncing ? "Syncing…" : "Sync now"}
                  </SettingsButton>
                  <SettingsButton
                    variant="ghost"
                    onClick={() => void handleSync(true)}
                    disabled={syncing || (calendarEnabled && selectedCalendarIds.length === 0)}
                  >
                    Full Resync
                  </SettingsButton>
                </div>
              )}
            </SettingsCard>

            <SettingsCard>
              <label className="flex cursor-pointer items-center gap-3">
                <span
                  className="grid place-items-center shrink-0"
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 12,
                    background: "var(--color-bg-surface)",
                    border: "1px solid var(--color-border-subtle)",
                    color: "var(--color-text-secondary)",
                  }}
                >
                  <MailIcon size={18} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-semibold text-ink">Gmail</span>
                  <span className="block text-[12.5px] leading-[18px] text-ink-mute">
                    Surface pending email follow-ups for review.
                  </span>
                </span>
                <WarmToggle checked={gmailEnabled} onChange={() => void handleGmailToggle()} label="Gmail sync" />
              </label>
            </SettingsCard>

            <AnimatePresence>
              {(calendarEnabled || gmailEnabled) && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={T_FAST}
                >
                  <SettingsCard>
                    <div className="flex items-center justify-between">
                      <SettingRow
                        title="Your Task Review Queue"
                        help="Gmail suggestions wait here for your approval. Items become tasks only after you approve."
                      />
                      <StatusBadge
                        tone={safePendingReviewItems.length > 0 ? "warning" : "idle"}
                        label={`${safePendingReviewItems.length} pending`}
                      />
                    </div>
                    <p className="text-[12px] leading-[17px] text-ink-mute">
                      Detected deadlines are shown below each item. You can optionally choose a
                      schedule date before approving.
                    </p>

                    {safePendingReviewItems.length === 0 ? (
                      <p className="text-[12px] text-ink-dim">No pending approvals</p>
                    ) : (
                      <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                        {safePendingReviewItems.map((item) => {
                          const reviewPayload = parseReviewPayload(item.payloadJson);
                          return (
                            <div
                              key={item._id}
                              className="p-3"
                              style={{
                                background: "var(--color-bg-surface)",
                                border: "1px solid var(--color-border-subtle)",
                                borderRadius: 10,
                              }}
                            >
                              <p className="text-[13px] text-ink leading-snug">{item.title}</p>
                              {item.description && (
                                <p className="text-[12px] text-ink-mute mt-1 line-clamp-2">
                                  {item.description}
                                </p>
                              )}
                              <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
                                <span
                                  className="px-2 py-0.5"
                                  style={{
                                    borderRadius: 7,
                                    background: "var(--color-warning-muted)",
                                    color: "var(--color-warning)",
                                  }}
                                >
                                  {item.deadline ? "Deadline task" : "Open task"}
                                </span>
                                <span
                                  className="px-2 py-0.5"
                                  style={{
                                    borderRadius: 7,
                                    background: "var(--color-fill-soft)",
                                    color: "var(--color-text-secondary)",
                                  }}
                                >
                                  {item.deadline
                                    ? `Detected deadline: ${item.deadline}`
                                    : "No deadline detected"}
                                </span>
                                {item.estimatedMinutes && (
                                  <span
                                    className="px-2 py-0.5"
                                    style={{
                                      borderRadius: 7,
                                      background: "var(--color-fill-soft)",
                                      color: "var(--color-text-secondary)",
                                    }}
                                  >
                                    {item.estimatedMinutes} min
                                  </span>
                                )}
                                {reviewPayload?.from && (
                                  <span
                                    className="px-2 py-0.5"
                                    style={{
                                      borderRadius: 7,
                                      background: "var(--color-fill-soft)",
                                      color: "var(--color-text-secondary)",
                                    }}
                                  >
                                    From: {reviewPayload.from}
                                  </span>
                                )}
                              </div>
                              <div className="mt-2.5">
                                <label
                                  htmlFor={`schedule-${item._id}`}
                                  className="block mb-1"
                                  style={{ fontSize: 10, letterSpacing: "0.1em" }}
                                >
                                  <span className="uppercase text-ink-mute" style={{ fontFamily: "var(--font-mono)" }}>
                                    Schedule date on approve (optional)
                                  </span>
                                </label>
                                <input
                                  id={`schedule-${item._id}`}
                                  type="date"
                                  value={reviewScheduleOverrides[item._id] ?? ""}
                                  onChange={(event) =>
                                    setReviewScheduleOverrides((prev) => ({
                                      ...prev,
                                      [item._id]: event.target.value,
                                    }))
                                  }
                                  className={cn(
                                    "w-full px-2.5 py-1.5 text-[12.5px]",
                                    "text-ink",
                                    "focus:outline-none"
                                  )}
                                  style={{ ...{ background: "var(--color-fill-soft)", border: "1px solid var(--color-border-default)", borderRadius: 8 } }}
                                />
                              </div>
                              <div className="flex items-center gap-2 mt-2.5">
                                <SettingsButton
                                  variant="accent"
                                  onClick={() => void handleApproveReviewItem(item._id)}
                                  disabled={activeReviewActionId === item._id}
                                  className="flex-1"
                                >
                                  Approve
                                </SettingsButton>
                                <SettingsButton
                                  variant="dangerGhost"
                                  onClick={() => void handleRejectReviewItem(item._id)}
                                  disabled={activeReviewActionId === item._id}
                                  className="flex-1"
                                >
                                  Reject
                                </SettingsButton>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </SettingsCard>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
