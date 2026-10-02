/** @vitest-environment happy-dom */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";
import { SettingsPage } from "../components/settings/SettingsPage";

const upsertIntegrationMock = vi.fn();
const enqueueGmailCandidateMock = vi.fn();
const approveReviewItemMock = vi.fn();
const rejectReviewItemMock = vi.fn();
const importGoogleCalendarMock = vi.fn();
const issueBootstrapTokenMock = vi.fn();
const revokeCredentialMock = vi.fn();
const showErrorMock = vi.fn();
const showSuccessMock = vi.fn();

const pendingReviewItem = {
  _id: "review_1",
  title: "Follow up with design team",
  description: "Please confirm launch timeline",
  deadline: "2026-04-12",
  estimatedMinutes: 30,
  payloadJson: JSON.stringify({ from: "pm@example.com", threadId: "thread-1" }),
};

const mutationMocks: Record<string, ReturnType<typeof vi.fn>> = {
  "sync.upsertIntegration": upsertIntegrationMock,
  "sync.enqueueGmailCandidate": enqueueGmailCandidateMock,
  "sync.approveReviewItem": approveReviewItemMock,
  "sync.rejectReviewItem": rejectReviewItemMock,
  "automation.issueBootstrapToken": issueBootstrapTokenMock,
  "automation.revokeCredential": revokeCredentialMock,
};

vi.mock("framer-motion", () => ({
  AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>,
  motion: {
    div: ({ children, ...props }: HTMLAttributes<HTMLDivElement>) => (
      <div {...props}>{children}</div>
    ),
    button: ({ children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) => (
      <button {...props}>{children}</button>
    ),
    span: ({ children, ...props }: HTMLAttributes<HTMLSpanElement>) => (
      <span {...props}>{children}</span>
    ),
  },
}));

vi.mock("convex/react", () => ({
  useMutation: (ref: string) => {
    const mock = mutationMocks[ref];
    if (!mock) throw new Error(`Unexpected useMutation target: ${ref}`);
    return mock;
  },
  useAction: () => importGoogleCalendarMock,
  useQuery: (query: unknown, args: unknown) => {
    if (query === "automation.listCredentials") {
      return [
        {
          _id: "cred_1",
          label: "Laptop",
          credentialPreview: "pravah_cred_abcd...",
          scopes: ["tasks:read"],
          status: "active",
          lastUsedAt: 1770000000000,
        },
      ];
    }

    if (query === "auth.getCurrentUser") {
      return {
        email: "user@example.com",
      };
    }

    if (args && typeof args === "object" && "provider" in args) {
      const provider = (args as { provider: string }).provider;
      if (provider === "google_calendar") {
        return {
          integration: {
            accountEmail: "user@example.com",
            syncEnabled: true,
          },
        };
      }
      if (provider === "gmail") {
        return {
          integration: {
            syncEnabled: true,
          },
        };
      }
    }

    if (args && typeof args === "object" && "status" in args) {
      return [pendingReviewItem];
    }

    return undefined;
  },
}));

vi.mock("../../convex/_generated/api", () => ({
  api: {
    automation: {
      issueBootstrapToken: "automation.issueBootstrapToken",
      revokeCredential: "automation.revokeCredential",
      listCredentials: "automation.listCredentials",
    },
    sync: {
      upsertIntegration: "sync.upsertIntegration",
      enqueueGmailCandidate: "sync.enqueueGmailCandidate",
      approveReviewItem: "sync.approveReviewItem",
      rejectReviewItem: "sync.rejectReviewItem",
      getIntegrationStatus: "sync.getIntegrationStatus",
      listReviewQueue: "sync.listReviewQueue",
    },
    syncActions: {
      importGoogleCalendarAction: "syncActions.importGoogleCalendarAction",
    },
    auth: {
      getCurrentUser: "auth.getCurrentUser",
    },
  },
}));

vi.mock("../lib/google/api", () => ({
  getGoogleTokens: () => ({ accessToken: "token", expiresIn: 3600, expired: false }),
  saveGoogleTokens: vi.fn(),
  clearGoogleTokens: vi.fn(),
  revokeGoogleToken: vi.fn(),
  fetchGoogleCalendars: vi.fn(async () => [
    { id: "primary", summary: "Primary", primary: true },
    { id: "team@example.com", summary: "Team", primary: false },
  ]),
  fetchGoogleAccountEmail: vi.fn(),
  getGoogleAuthErrorMessage: vi.fn((error: unknown, fallback: string) => {
    if (typeof error === "string") return error;
    return fallback;
  }),
  getGoogleOAuthUrl: vi.fn(async () => "https://example.com/oauth"),
  parseGoogleTokens: vi.fn(() => null),
  exchangeGoogleAuthCode: vi.fn(),
  fetchGmailMessages: vi.fn(async () => []),
}));

vi.mock("../components/useToast", () => ({
  useToast: () => ({
    showError: showErrorMock,
    showSuccess: showSuccessMock,
  }),
}));

async function openCategory(name: string) {
  fireEvent.click(screen.getByRole("button", { name: `Open ${name} settings` }));
}

describe("SettingsPage", () => {
  beforeEach(() => {
    upsertIntegrationMock.mockReset();
    upsertIntegrationMock.mockResolvedValue(undefined);
    enqueueGmailCandidateMock.mockReset();
    enqueueGmailCandidateMock.mockResolvedValue({ deduplicated: false });
    approveReviewItemMock.mockReset();
    approveReviewItemMock.mockResolvedValue({ taskId: "task_1" });
    rejectReviewItemMock.mockReset();
    rejectReviewItemMock.mockResolvedValue(undefined);
    importGoogleCalendarMock.mockReset();
    importGoogleCalendarMock.mockResolvedValue(undefined);
    issueBootstrapTokenMock.mockReset();
    issueBootstrapTokenMock.mockResolvedValue({
      bootstrapToken: "pravah_bootstrap_demo",
      expiresAt: Date.now() + 15 * 60 * 1000,
      label: "Codex local",
      scopes: ["tasks:read", "review:read", "sync:read"],
    });
    revokeCredentialMock.mockReset();
    revokeCredentialMock.mockResolvedValue({ revoked: true });
    showErrorMock.mockReset();
    showSuccessMock.mockReset();
  });

  it("renders the nine mobile-parity categories in the rail", () => {
    render(<SettingsPage tasks={[]} onBack={vi.fn()} />);

    for (const title of [
      "Kairo",
      "Access tokens",
      "Sync",
      "Reminders",
      "Interaction",
      "Appearance",
      "Data & diagnostics",
      "Account",
      "About",
    ]) {
      expect(screen.getByRole("button", { name: `Open ${title} settings` })).toBeInTheDocument();
    }
    expect(screen.getByTestId("settings-page")).toBeInTheDocument();
  });

  it("shows explicit review queue guidance in the Sync section", async () => {
    render(<SettingsPage tasks={[]} onBack={vi.fn()} />);
    await openCategory("Sync");

    expect(await screen.findByText("Your Task Review Queue")).toBeInTheDocument();
    expect(
      screen.getByText(/Gmail suggestions wait here for your approval/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Detected deadlines are shown below each item/i)
    ).toBeInTheDocument();
    expect(screen.getByText("Detected deadline: 2026-04-12")).toBeInTheDocument();
    expect(screen.getByText("From: pm@example.com")).toBeInTheDocument();
  });

  it("passes optional schedule date when approving a review item", async () => {
    render(<SettingsPage tasks={[]} onBack={vi.fn()} />);
    await openCategory("Sync");

    const scheduleInput = await screen.findByLabelText(/Schedule date on approve/i);
    fireEvent.change(scheduleInput, { target: { value: "2026-04-10" } });

    fireEvent.click(screen.getByRole("button", { name: "Approve" }));

    await waitFor(() => {
      expect(approveReviewItemMock).toHaveBeenCalledWith({
        reviewId: "review_1",
        scheduledDate: "2026-04-10",
      });
    });
  });

  it("preserves accountEmail when persisting calendar toggle state", async () => {
    render(<SettingsPage tasks={[]} onBack={vi.fn()} />);
    await openCategory("Sync");

    const calendarLabel = await screen.findByText("Google Calendar").then((el) => el.closest("label"));
    const calendarToggle = calendarLabel?.querySelector("button");
    expect(calendarToggle).toBeTruthy();

    fireEvent.click(calendarToggle!);

    await waitFor(() => {
      expect(upsertIntegrationMock).toHaveBeenCalledWith({
        provider: "google_calendar",
        status: "connected",
        syncEnabled: false,
        accountEmail: "user@example.com",
      });
    });
  });

  it("passes selected calendar IDs and fullResync flag when syncing", async () => {
    render(<SettingsPage tasks={[]} onBack={vi.fn()} />);
    await openCategory("Sync");

    await waitFor(() => {
      expect(screen.getByText("Team")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Full Resync" }));

    await waitFor(() => {
      expect(importGoogleCalendarMock).toHaveBeenCalledWith({
        accessToken: "token",
        calendarIds: ["primary", "team@example.com"],
        fullResync: true,
      });
    });
  });

  it("preserves stored calendar selection during hydration", async () => {
    localStorage.setItem("pravah_google_calendar_selection", JSON.stringify(["team@example.com"]));
    render(<SettingsPage tasks={[]} onBack={vi.fn()} />);
    await openCategory("Sync");

    await waitFor(() => {
      expect(screen.getByText("Team")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Full Resync" }));

    await waitFor(() => {
      expect(importGoogleCalendarMock).toHaveBeenCalledWith({
        accessToken: "token",
        calendarIds: ["team@example.com"],
        fullResync: true,
      });
    });
  });

  it("issues a bootstrap token and shows the one-time value", async () => {
    render(<SettingsPage tasks={[]} onBack={vi.fn()} />);
    await openCategory("Access tokens");

    fireEvent.click(screen.getByRole("button", { name: "Issue Bootstrap Token" }));

    await waitFor(() => {
      expect(issueBootstrapTokenMock).toHaveBeenCalledWith({
        label: "Codex local",
        scopes: ["tasks:read", "review:read", "sync:read"],
        ttlMinutes: 15,
      });
    });

    expect(screen.getByTestId("automation-bootstrap-token")).toBeInTheDocument();
    expect(screen.getByText("pravah_bootstrap_demo")).toBeInTheDocument();
  });

  it("requires explicit opt-in before issuing task write scope", async () => {
    render(<SettingsPage tasks={[]} onBack={vi.fn()} />);
    await openCategory("Access tokens");

    fireEvent.click(screen.getByRole("switch", { name: /Allow task writes/i }));
    fireEvent.click(screen.getByRole("button", { name: "Issue Bootstrap Token" }));

    await waitFor(() => {
      expect(issueBootstrapTokenMock).toHaveBeenCalledWith({
        label: "Codex local",
        scopes: ["tasks:read", "review:read", "sync:read", "tasks:write"],
        ttlMinutes: 15,
      });
    });
  });

  it("revokes an existing automation credential", async () => {
    render(<SettingsPage tasks={[]} onBack={vi.fn()} />);
    await openCategory("Access tokens");

    const revokeButtons = await screen.findAllByRole("button", { name: "Revoke" });
    expect(revokeButtons[0]).toBeDefined();
    fireEvent.click(revokeButtons[0] as HTMLButtonElement);

    await waitFor(() => {
      expect(revokeCredentialMock).toHaveBeenCalledWith({
        credentialId: "cred_1",
      });
    });
  });

  it("exposes Kairo provider rows with brand marks and expands the editor", async () => {
    render(<SettingsPage tasks={[]} onBack={vi.fn()} initialCategory="kairo" />);

    expect(screen.getByText("Kairo providers")).toBeInTheDocument();
    expect(screen.getAllByText("Anthropic").length).toBeGreaterThan(0);
    expect(screen.getAllByText("OpenAI").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Gemini/).length).toBeGreaterThan(0);

    fireEvent.click(screen.getAllByText("Anthropic")[0]!);
    expect(await screen.findByText("Save credentials")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Paste your provider key")).toBeInTheDocument();
  });
});
