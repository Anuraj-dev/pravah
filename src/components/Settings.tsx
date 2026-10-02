import { useState, useEffect, useMemo } from "react";
import {
  Bot,
  X,
  Calendar,
  Mail,
  CheckCircle,
  XCircle,
  RefreshCw,
  ExternalLink,
  LogOut,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { T_BASE, T_FAST } from "../lib/motion";
import { useAction, useMutation, useQuery } from "../lib/data";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import {
  getGoogleTokens,
  clearGoogleTokens,
  revokeGoogleToken,
  fetchGoogleAccountEmail,
  fetchGoogleCalendars,
  getGoogleAuthErrorMessage,
  getGoogleOAuthUrl,
  fetchGmailMessages,
} from "../lib/google/api";
import type { GoogleCalendarListEntry } from "../lib/google/types";
import { cn } from "../lib/utils";
import { Button } from "./Button";
import { AutomationSettingsSection } from "./AutomationSettingsSection";
import { WebWorkspaceSettings } from "./WebWorkspaceSettings";
import { useToast } from "./useToast";
import { authClient } from "../lib/auth-client";
import type { Task } from "../types";
import {
  clearKairoConfig,
  getKairoProviderLabel,
  getKairoSettings,
  saveKairoSettings,
  type KairoProviderFormat,
  type KairoSettings,
} from "../lib/kairoConfig";

interface SettingsProps {
  onClose: () => void;
  tasks?: Task[];
}

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

const overlayVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
};

const modalVariants = {
  hidden: { opacity: 0, scale: 0.95, y: -10 },
  visible: { opacity: 1, scale: 1, y: 0 },
  exit: { opacity: 0, scale: 0.98, y: -10 },
};

const CALENDAR_SELECTION_STORAGE_KEY = "pravah_google_calendar_selection";

const KAIRO_PROVIDERS: KairoProviderFormat[] = ["openai", "anthropic", "gemini"];

function getKairoSettingsSignature(settings: KairoSettings) {
  return [
    settings.defaultProvider,
    ...KAIRO_PROVIDERS.flatMap((provider) => {
      const profile = settings.profiles[provider];
      return [provider, profile.apiKey.trim(), profile.baseUrl.trim(), profile.model.trim()];
    }),
  ].join("\n");
}

export function Settings({ onClose, tasks = [] }: SettingsProps) {
  const [signingOut, setSigningOut] = useState(false);
  const [kairoSettings, setKairoSettings] = useState<KairoSettings>(() => getKairoSettings());
  const [activeProvider, setActiveProvider] = useState<KairoProviderFormat>(() => getKairoSettings().defaultProvider);
  const [savedKairoSignature, setSavedKairoSignature] = useState(() => getKairoSettingsSignature(getKairoSettings()));
  const [savedKairoAt, setSavedKairoAt] = useState<Date | null>(null);
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
  const kairoConfig = useMemo(() => {
    const profile = kairoSettings.profiles[activeProvider];
    return {
      providerFormat: activeProvider,
      apiKey: profile.apiKey,
      baseUrl: profile.baseUrl,
      model: profile.model,
    };
  }, [activeProvider, kairoSettings]);
  const kairoConfigSignature = useMemo(() => getKairoSettingsSignature(kairoSettings), [kairoSettings]);
  const isKairoDirty = kairoConfigSignature !== savedKairoSignature;
  const hasSavedKairoConfig = useMemo(() => {
    return KAIRO_PROVIDERS.some((provider) => {
      const profile = kairoSettings.profiles[provider];
      return Boolean(profile.apiKey.trim() && profile.baseUrl.trim() && profile.model.trim());
    });
  }, [kairoSettings]);
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

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

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

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await authClient.signOut();
      onClose();
      showSuccess("Signed out successfully");
    } catch (error) {
      console.error("Sign out failed", error);
      showError("Failed to sign out. Please try again.");
    } finally {
      setSigningOut(false);
    }
  };

  const handleSaveKairoConfig = () => {
    if (!kairoConfig.apiKey.trim() || !kairoConfig.baseUrl.trim() || !kairoConfig.model.trim()) {
      showError("Fill in the provider format, API key, endpoint URL, and model for Kairo.");
      return;
    }
    saveKairoSettings({
      ...kairoSettings,
      defaultProvider: activeProvider,
      profiles: {
        ...kairoSettings.profiles,
        [activeProvider]: {
          apiKey: kairoConfig.apiKey.trim(),
          baseUrl: kairoConfig.baseUrl.trim(),
          model: kairoConfig.model.trim(),
        },
      },
    });
    setSavedKairoSignature(getKairoSettingsSignature(getKairoSettings()));
    setSavedKairoAt(new Date());
    showSuccess("Kairo settings saved.");
  };

  const handleClearKairoConfig = () => {
    clearKairoConfig();
    const cleared = getKairoSettings();
    setKairoSettings(cleared);
    setActiveProvider(cleared.defaultProvider);
    setSavedKairoSignature(getKairoSettingsSignature(getKairoSettings()));
    setSavedKairoAt(new Date());
    showSuccess("Kairo settings cleared.");
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

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <AnimatePresence>
      <motion.div
        initial="hidden"
        animate="visible"
        exit="hidden"
        variants={overlayVariants}
        transition={T_FAST}
        className={cn(
          "fixed inset-0 z-50 flex items-start justify-center pt-24",
          "bg-[var(--color-bg-overlay)]"
        )}
        onClick={handleBackdropClick}
      >
        <motion.div
          initial="hidden"
          animate="visible"
          exit="exit"
          variants={modalVariants}
          transition={T_BASE}
          className={cn(
            "w-full max-w-2xl p-6 mx-4 md:mx-0 max-h-[82vh] overflow-y-auto overflow-x-hidden",
            "backdrop-blur-xl rounded-[4px]",
            "border",
            "shadow-2xl shadow-ink/40"
          )}
          style={{
            background: "var(--color-bg-surface)",
            borderColor: "var(--color-border-default)",
          }}
        >
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-semibold text-ink">Settings</h2>
              <p
                className="mt-1 text-[11px] uppercase tracking-[0.14em]"
                style={{ color: "var(--color-text-muted)", fontFamily: "var(--font-mono)" }}
              >
                Personal Workspace Controls
              </p>
            </div>
            <button
              onClick={onClose}
              aria-label="Close settings"
              className={cn(
                "p-2 rounded-[3px]",
                "text-ink-mute hover:text-ink-soft",
                "hover:bg-fill-soft"
              )}
              style={{
                border: "1px solid var(--color-border-subtle)",
                transition:
                  "color var(--dur-instant) var(--ease-out-expo), background-color var(--dur-instant) var(--ease-out-expo), border-color var(--dur-instant) var(--ease-out-expo)",
              }}
            >
              <X size={18} />
            </button>
          </div>

          <div className="space-y-5">
            <section>
              <h3
                className={cn(
                  "text-[11px] font-medium uppercase tracking-[0.08em] mb-3",
                  "text-ink-mute flex items-center gap-2"
                )}
              >
                <Bot size={14} />
                Agent
              </h3>

              <div
                className={cn(
                  "rounded-[4px] p-4 space-y-4 border",
                  "bg-fill-faint"
                )}
                style={{ borderColor: "var(--color-border-subtle)" }}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <p className="max-w-[34rem] text-sm text-ink-soft leading-6">
                    Kairo uses your default provider profile from this browser.
                    Nothing is prefilled or rewritten.
                  </p>
                  <div
                    className={cn(
                      "border px-2.5 py-1 text-[10px] uppercase tracking-[0.13em]",
                      isKairoDirty
                        ? "border-warning/30 bg-warning-muted text-warning"
                        : hasSavedKairoConfig
                          ? "border-success/30 bg-success-muted text-success"
                          : "border-line bg-fill-soft text-ink-mute"
                    )}
                  >
                    {isKairoDirty
                      ? "Unsaved"
                      : hasSavedKairoConfig
                        ? savedKairoAt
                          ? "Saved now"
                          : "Saved"
                        : "Not saved"}
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="md:col-span-2">
                    <span className="mb-1.5 block text-[11px] uppercase tracking-[0.12em] text-ink-mute">Provider Profile</span>
                    <div className="grid grid-cols-3 gap-1 rounded-[3px] border border-line-subtle bg-fill-soft p-1">
                      {([
                        ["openai", "OpenAI Compatible"],
                        ["anthropic", "Anthropic Compatible"],
                        ["gemini", "Google Gemini"],
                      ] as Array<[KairoProviderFormat, string]>).map(([format, label]) => (
                        <button
                          key={format}
                          type="button"
                          onClick={() => setActiveProvider(format)}
                          className={cn(
                            "rounded-[2px] px-3 py-2 text-xs font-medium transition-colors",
                            activeProvider === format
                              ? "bg-accent-deep/22 text-accent"
                              : "text-ink-mute hover:bg-fill-soft hover:text-ink-soft"
                          )}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <div className="mt-2 flex items-center justify-between rounded-[3px] border border-line-subtle bg-fill-soft px-3 py-2">
                      <span className="text-xs text-ink-soft">Default provider</span>
                      <button
                        type="button"
                        className={cn(
                          "rounded-[3px] border px-2 py-1 text-[10px] uppercase tracking-[0.12em]",
                          kairoSettings.defaultProvider === activeProvider
                            ? "border-success/30 bg-success-muted text-success"
                            : "border-line text-ink-soft hover:text-ink"
                        )}
                        onClick={() => setKairoSettings((prev) => ({ ...prev, defaultProvider: activeProvider }))}
                      >
                        {kairoSettings.defaultProvider === activeProvider ? "Default" : `Set ${getKairoProviderLabel(activeProvider)}`}
                      </button>
                    </div>
                  </div>

                  <label className="block md:col-span-2">
                    <span className="mb-1.5 block text-[11px] uppercase tracking-[0.12em] text-ink-mute">
                      API Key
                    </span>
                    <input
                      type="password"
                      name="pravah-kairo-provider-token"
                      value={kairoConfig.apiKey}
                      autoComplete="new-password"
                      autoCorrect="off"
                      autoCapitalize="none"
                      data-1p-ignore="true"
                      data-lpignore="true"
                      data-form-type="other"
                      spellCheck={false}
                      onChange={(e) =>
                        setKairoSettings((prev) => ({
                          ...prev,
                          profiles: {
                            ...prev.profiles,
                            [activeProvider]: {
                              ...prev.profiles[activeProvider],
                              apiKey: e.target.value,
                            },
                          },
                        }))
                      }
                      placeholder="Paste your provider key"
                      className="w-full rounded-[3px] border bg-fill-soft px-3 py-2.5 text-sm text-ink outline-none transition-colors placeholder:text-ink-dim focus:border-accent/45"
                      style={{ borderColor: "var(--color-border-default)" }}
                    />
                  </label>

                  <label className="block">
                    <span className="mb-1.5 block text-[11px] uppercase tracking-[0.12em] text-ink-mute">
                      Endpoint URL
                    </span>
                    <input
                      type="url"
                      name="pravah-kairo-endpoint-url"
                      value={kairoConfig.baseUrl}
                      autoComplete="off"
                      autoCorrect="off"
                      autoCapitalize="none"
                      data-1p-ignore="true"
                      data-lpignore="true"
                      data-form-type="other"
                      spellCheck={false}
                      onChange={(e) =>
                        setKairoSettings((prev) => ({
                          ...prev,
                          profiles: {
                            ...prev.profiles,
                            [activeProvider]: {
                              ...prev.profiles[activeProvider],
                              baseUrl: e.target.value,
                            },
                          },
                        }))
                      }
                      placeholder={
                        activeProvider === "anthropic"
                          ? "http://localhost:42424/v1/messages"
                          : activeProvider === "gemini"
                            ? "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
                          : "https://your-server/v1/chat/completions"
                      }
                      className="w-full rounded-[3px] border bg-fill-soft px-3 py-2.5 text-sm text-ink outline-none transition-colors placeholder:text-ink-dim focus:border-accent/45"
                      style={{ borderColor: "var(--color-border-default)" }}
                    />
                  </label>

                  <label className="block">
                    <span className="mb-1.5 block text-[11px] uppercase tracking-[0.12em] text-ink-mute">
                      Model
                    </span>
                    <input
                      type="text"
                      name="pravah-kairo-model-id"
                      value={kairoConfig.model}
                      autoComplete="off"
                      autoCorrect="off"
                      autoCapitalize="none"
                      data-1p-ignore="true"
                      data-lpignore="true"
                      data-form-type="other"
                      spellCheck={false}
                      onChange={(e) =>
                        setKairoSettings((prev) => ({
                          ...prev,
                          profiles: {
                            ...prev.profiles,
                            [activeProvider]: {
                              ...prev.profiles[activeProvider],
                              model: e.target.value,
                            },
                          },
                        }))
                      }
                      placeholder="Enter the exact model id"
                      className="w-full rounded-[3px] border bg-fill-soft px-3 py-2.5 text-sm text-ink outline-none transition-colors placeholder:text-ink-dim focus:border-accent/45"
                      style={{ borderColor: "var(--color-border-default)" }}
                    />
                  </label>
                </div>

                <p className="text-xs text-ink-mute leading-5">
                  {activeProvider === "anthropic"
                    ? "Anthropic mode sends /v1/messages-style JSON with a top-level system prompt."
                    : activeProvider === "gemini"
                      ? "Gemini mode sends generateContent-style JSON with a top-level system instruction."
                      : "OpenAI mode sends /v1/chat/completions-style JSON with a system message."}
                  {" "}The endpoint URL is always used exactly as entered.
                </p>

                <div className="flex flex-wrap gap-2">
                  <Button
                    onClick={handleSaveKairoConfig}
                    size="sm"
                    className="rounded-[3px] !bg-accent !text-[var(--color-bg-base)] hover:!bg-[oklch(0.82_0.13_260)]"
                  >
                    {isKairoDirty || !hasSavedKairoConfig ? "Save Agent Settings" : "Settings Current"}
                  </Button>
                  <Button
                    onClick={handleClearKairoConfig}
                    variant="ghost"
                    size="sm"
                    className="rounded-[3px] border border-line hover:bg-fill-soft"
                  >
                    Clear
                  </Button>
                </div>
              </div>
            </section>

            <section>
              <h3
                className={cn(
                  "text-[11px] font-medium uppercase tracking-[0.08em] mb-3",
                  "text-ink-mute"
                )}
              >
                Account
              </h3>

              <div
                className={cn(
                  "rounded-[4px] p-4 space-y-4 border",
                  "bg-fill-faint"
                )}
                style={{ borderColor: "var(--color-border-subtle)" }}
              >
                <div>
                  <p className="text-ink font-medium">
                    {currentUser?.email ?? currentUser?.name ?? "Signed in"}
                  </p>
                  <p className="text-xs text-ink-mute">
                    This is your only app login. Google sync permissions are managed below.
                  </p>
                </div>
                <Button
                  onClick={() => void handleSignOut()}
                  variant="ghost"
                  className="w-full items-center justify-center gap-2 rounded-[3px] border border-error/25 text-error hover:bg-error-muted hover:text-error"
                  disabled={signingOut}
                >
                  <LogOut size={14} className="shrink-0 text-current" />
                  {signingOut ? "Signing out..." : "Sign out"}
                </Button>
              </div>
            </section>

            <AutomationSettingsSection />

            <WebWorkspaceSettings tasks={tasks} />

            <section>
              <h3 className={cn(
                "text-[11px] font-medium uppercase tracking-[0.08em] mb-3",
                "text-ink-mute flex items-center gap-2"
              )}>
                <Calendar size={14} />
                Integrations
              </h3>

              <div className={cn(
                "rounded-[4px] p-4 space-y-4 border",
                "bg-fill-faint"
              )} style={{ borderColor: "var(--color-border-subtle)" }}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        "grid h-9 w-9 place-items-center rounded-[3px]",
                        googleConnected ? "bg-success/15" : "bg-fill-soft"
                      )}
                    >
                      {googleConnected ? (
                        <CheckCircle size={20} className="text-success" />
                      ) : (
                        <XCircle size={20} className="text-ink-mute" />
                      )}
                    </div>
                    <div>
                      <p className="text-ink font-medium">Google Sync Permissions</p>
                      <p className="text-xs text-ink-mute">
                        {googleConnected
                          ? `Granted${googleAccountEmail ? ` for ${googleAccountEmail}` : ""}`
                          : "Not granted"}
                      </p>
                    </div>
                  </div>

                  {googleConnected ? (
                    <Button
                      onClick={handleGoogleDisconnect}
                      variant="ghost"
                      size="sm"
                      className="rounded-[3px] border border-error/25 text-error hover:bg-error-muted hover:text-error"
                    >
                      Revoke
                    </Button>
                  ) : (
                    <Button
                      onClick={handleGoogleConnect}
                      variant="primary"
                      size="sm"
                      className="flex items-center gap-2 rounded-[3px] !bg-accent !text-[var(--color-bg-base)] hover:!bg-[oklch(0.82_0.13_260)]"
                    >
                      Grant Access
                      <ExternalLink size={14} />
                    </Button>
                  )}
                </div>

                <AnimatePresence>
                  {googleConnected && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={T_FAST}
                      className="space-y-4 overflow-hidden"
                    >
                      <div className="border-t border-line pt-4">
                        <label className="flex items-center justify-between cursor-pointer">
                          <div className="flex items-center gap-3">
                            <Calendar size={18} className="text-ink-soft" />
                            <div>
                              <p className="text-ink text-sm">Google Calendar</p>
                              <p className="text-xs text-ink-mute">
                                Sync deadlines with calendar events
                              </p>
                            </div>
                          </div>
                          <button
                            onClick={handleCalendarToggle}
                            className="w-11 h-6 rounded-full"
                            style={{
                              backgroundColor: calendarEnabled
                                ? "var(--color-accent-primary)"
                                : "var(--color-border-default)",
                              transition:
                                "background-color var(--dur-fast) var(--ease-out-expo)",
                            }}
                          >
                            <motion.div
                              animate={{ x: calendarEnabled ? 22 : 4 }}
                              transition={T_FAST}
                              className="w-4 h-4 bg-[var(--color-bg-floating)] rounded-full shadow-sm"
                            />
                          </button>
                        </label>
                      </div>

                      {calendarEnabled && (
                        <div className="border-t border-line pt-4 space-y-2">
                          <div className="flex items-center justify-between">
                            <p className="text-xs uppercase tracking-[0.08em] text-ink-mute">
                              Calendars To Sync
                            </p>
                            <span className="text-xs text-ink-soft">
                              {selectedCalendarIds.length}/{availableCalendars.length || 1}
                            </span>
                          </div>
                          {loadingCalendars ? (
                            <p className="text-xs text-ink-mute">Loading calendars...</p>
                          ) : (
                            <div className="space-y-1.5 max-h-28 overflow-y-auto pr-1">
                              {availableCalendars.map((calendar) => (
                                <label
                                  key={calendar.id}
                                  className="flex items-center gap-2.5 text-xs text-ink-soft cursor-pointer"
                                >
                                  <input
                                    type="checkbox"
                                    checked={selectedCalendarIds.includes(calendar.id)}
                                    onChange={() => toggleCalendarSelection(calendar.id)}
                                    className="accent-warning"
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

                      <div className="border-t border-line pt-4">
                        <label className="flex items-center justify-between cursor-pointer">
                          <div className="flex items-center gap-3">
                            <Mail size={18} className="text-ink-soft" />
                            <div>
                              <p className="text-ink text-sm">Gmail</p>
                              <p className="text-xs text-ink-mute">
                                Extract tasks from unread emails
                              </p>
                            </div>
                          </div>
                          <button
                            onClick={handleGmailToggle}
                            className="w-11 h-6 rounded-full"
                            style={{
                              backgroundColor: gmailEnabled
                                ? "var(--color-accent-primary)"
                                : "var(--color-border-default)",
                              transition:
                                "background-color var(--dur-fast) var(--ease-out-expo)",
                            }}
                          >
                            <motion.div
                              animate={{ x: gmailEnabled ? 22 : 4 }}
                              transition={T_FAST}
                              className="w-4 h-4 bg-[var(--color-bg-floating)] rounded-full shadow-sm"
                            />
                          </button>
                        </label>
                      </div>

                      <AnimatePresence>
                        {(calendarEnabled || gmailEnabled) && (
                          <motion.div
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            transition={T_FAST}
                          >
                            <div className="grid grid-cols-2 gap-2">
                              <Button
                                onClick={() => void handleSync(false)}
                                disabled={
                                  syncing || (calendarEnabled && selectedCalendarIds.length === 0)
                                }
                                variant="secondary"
                                className="w-full rounded-[3px] flex items-center justify-center gap-2 border-line bg-fill-soft hover:bg-fill-soft"
                              >
                                <RefreshCw
                                  size={16}
                                  className={syncing ? "animate-spin" : ""}
                                />
                                {syncing ? "Syncing..." : "Sync Now"}
                              </Button>
                              <Button
                                onClick={() => void handleSync(true)}
                                disabled={
                                  syncing || (calendarEnabled && selectedCalendarIds.length === 0)
                                }
                                variant="ghost"
                                className="w-full rounded-[3px] flex items-center justify-center gap-2 border border-line text-warning hover:bg-fill-soft hover:text-warning"
                              >
                                Full Resync
                              </Button>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>

                      <div className="border-t border-line pt-4 space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-xs uppercase tracking-[0.08em] text-ink-mute">
                            Your Task Review Queue
                          </p>
                          <span className="text-xs text-ink-soft">
                            {safePendingReviewItems.length} pending
                          </span>
                        </div>
                        <p className="text-xs text-ink-mute">
                          Gmail suggestions wait here for your approval. Items become tasks only
                          after you approve.
                        </p>
                        <p className="text-xs text-ink-mute">
                          Detected deadlines are shown below each item. You can optionally choose
                          a schedule date before approving.
                        </p>

                        {safePendingReviewItems.length === 0 ? (
                          <p className="text-xs text-ink-dim">
                            No pending approvals
                          </p>
                        ) : (
                          <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                            {safePendingReviewItems.map((item) => {
                              const reviewPayload = parseReviewPayload(item.payloadJson);
                              return (
                                <div
                                  key={item._id}
                                  className="rounded-[4px] border border-line bg-fill-soft p-2.5"
                                >
                                  <p className="text-sm text-ink leading-snug">{item.title}</p>
                                  {item.description && (
                                    <p className="text-xs text-ink-mute mt-1 line-clamp-2">
                                      {item.description}
                                    </p>
                                  )}
                                  <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
                                    <span
                                      className={cn(
                                        "px-1.5 py-0.5 rounded-full",
                                        item.deadline
                                          ? "bg-warning-muted text-warning"
                                          : "bg-warning-muted text-warning"
                                      )}
                                    >
                                      {item.deadline ? "Deadline task" : "Open task"}
                                    </span>
                                    <span className="px-1.5 py-0.5 rounded-full bg-fill-strong text-ink-soft">
                                      {item.deadline
                                        ? `Detected deadline: ${item.deadline}`
                                        : "No deadline detected"}
                                    </span>
                                    {item.estimatedMinutes && (
                                      <span className="px-1.5 py-0.5 rounded-full bg-fill-strong text-ink-soft">
                                        {item.estimatedMinutes} min
                                      </span>
                                    )}
                                    {reviewPayload?.from && (
                                      <span className="px-1.5 py-0.5 rounded-full bg-fill-strong text-ink-soft">
                                        From: {reviewPayload.from}
                                      </span>
                                    )}
                                  </div>
                                  <div className="mt-2">
                                    <label
                                      htmlFor={`schedule-${item._id}`}
                                      className="block text-[10px] uppercase tracking-[0.08em] text-ink-mute mb-1"
                                    >
                                      Schedule date on approve (optional)
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
                                        "w-full px-2 py-1.5 text-xs rounded-[3px]",
                                        "bg-fresh/80 text-ink",
                                        "border border-line",
                                        "focus:outline-none focus:border-warning/50"
                                      )}
                                    />
                                  </div>
                                  <div className="flex items-center gap-2 mt-2">
                                    <Button
                                      onClick={() => handleApproveReviewItem(item._id)}
                                      size="sm"
                                      variant="primary"
                                      disabled={activeReviewActionId === item._id}
                                      className="flex-1"
                                    >
                                      Approve
                                    </Button>
                                    <Button
                                      onClick={() => handleRejectReviewItem(item._id)}
                                      size="sm"
                                      variant="ghost"
                                      disabled={activeReviewActionId === item._id}
                                      className="flex-1 text-error hover:text-error"
                                    >
                                      Reject
                                    </Button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </section>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
