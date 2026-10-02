import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Button } from "./Button";
import { useToast } from "./useToast";

const READ_ONLY_AUTOMATION_SCOPES = [
  "tasks:read",
  "review:read",
  "sync:read",
] as const;

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export function AutomationSettingsSection() {
  const [label, setLabel] = useState("Codex local");
  const [allowTaskWrites, setAllowTaskWrites] = useState(false);
  const [issuing, setIssuing] = useState(false);
  const [revokingCredentialId, setRevokingCredentialId] =
    useState<Id<"automationCredentials"> | null>(null);
  const [issuedBootstrapToken, setIssuedBootstrapToken] = useState<{
    token: string;
    expiresAt: number;
  } | null>(null);
  const issueBootstrapToken = useMutation(api.automation.issueBootstrapToken);
  const revokeCredential = useMutation(api.automation.revokeCredential);
  const credentials = useQuery(api.automation.listCredentials, {}) ?? [];
  const { showError, showSuccess } = useToast();

  const handleIssue = async () => {
    const trimmedLabel = label.trim();
    if (!trimmedLabel) {
      showError("Enter a label for the automation credential.");
      return;
    }

    setIssuing(true);
    try {
      const scopes = allowTaskWrites
        ? [...READ_ONLY_AUTOMATION_SCOPES, "tasks:write" as const]
        : [...READ_ONLY_AUTOMATION_SCOPES];
      const result = await issueBootstrapToken({
        label: trimmedLabel,
        scopes,
        ttlMinutes: 15,
      });
      setIssuedBootstrapToken({
        token: result.bootstrapToken,
        expiresAt: result.expiresAt,
      });
      showSuccess("Bootstrap token issued. Copy it now; it is shown only for this session.");
    } catch (error) {
      showError(errorMessage(error, "Failed to issue automation token."));
    } finally {
      setIssuing(false);
    }
  };

  const handleRevoke = async (credentialId: Id<"automationCredentials">) => {
    setRevokingCredentialId(credentialId);
    try {
      await revokeCredential({ credentialId });
      showSuccess("Automation credential revoked.");
    } catch (error) {
      showError(errorMessage(error, "Failed to revoke automation credential."));
    } finally {
      setRevokingCredentialId(null);
    }
  };

  return (
    <section>
      <h3 className="mb-3 text-[11px] font-medium uppercase tracking-[0.08em] text-ink-mute">
        Automation
      </h3>

      <div
        className="space-y-4 rounded-[4px] border bg-fill-faint p-4"
        style={{ borderColor: "var(--color-border-subtle)" }}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="max-w-[36rem]">
            <p className="font-medium text-ink">CLI Credentials</p>
            <p className="text-xs leading-5 text-ink-mute">
              Issue a short-lived bootstrap token, exchange it locally with{" "}
              <code>pravah auth import</code>, and revoke any credential from here.
            </p>
          </div>
          <div className="rounded-[3px] border border-line bg-fill-soft px-2.5 py-1 text-[10px] uppercase tracking-[0.13em] text-ink-soft">
            {credentials.length} recorded
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
          <label className="block">
            <span className="mb-1.5 block text-[11px] uppercase tracking-[0.12em] text-ink-mute">
              Credential Label
            </span>
            <input
              type="text"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="Codex local"
              className="w-full rounded-[3px] border bg-fill-soft px-3 py-2.5 text-sm text-ink outline-none transition-colors placeholder:text-ink-dim focus:border-accent/45"
              style={{ borderColor: "var(--color-border-default)" }}
            />
          </label>

          <div className="flex items-end">
            <Button
              onClick={() => void handleIssue()}
              size="sm"
              disabled={issuing}
              className="rounded-[3px] !bg-accent !text-[var(--color-bg-base)] hover:!bg-[oklch(0.82_0.13_260)]"
            >
              {issuing ? "Issuing..." : "Issue Bootstrap Token"}
            </Button>
          </div>
        </div>

        <div className="rounded-[3px] border border-line-subtle bg-fill-soft px-3 py-3">
          <p className="text-[11px] uppercase tracking-[0.12em] text-ink-mute">
            Credential Scopes
          </p>
          <p className="mt-2 text-xs leading-5 text-ink-soft">
            {[
              ...READ_ONLY_AUTOMATION_SCOPES,
              ...(allowTaskWrites ? (["tasks:write"] as const) : []),
            ].join(" · ")}
          </p>
          <label className="mt-3 flex cursor-pointer items-start gap-2.5 border-t border-line-subtle pt-3">
            <input
              type="checkbox"
              checked={allowTaskWrites}
              onChange={(event) => setAllowTaskWrites(event.target.checked)}
              className="mt-0.5 accent-accent"
            />
            <span>
              <span className="block text-xs text-ink-soft">Allow task writes</span>
              <span className="mt-0.5 block text-[11px] leading-4 text-ink-mute">
                Off by default. Enable only for trusted workflows that need add,
                move, complete, reopen, or unschedule commands.
              </span>
            </span>
          </label>
        </div>

        {issuedBootstrapToken && (
          <div
            className="rounded-[3px] border border-success/25 bg-success-muted px-3 py-3"
            data-testid="automation-bootstrap-token"
          >
            <p className="text-[11px] uppercase tracking-[0.12em] text-success">
              Bootstrap Token
            </p>
            <p className="mt-1 text-xs leading-5 text-success">
              Copy this now. It expires at{" "}
              {new Date(issuedBootstrapToken.expiresAt).toLocaleString()}.
            </p>
            <code className="mt-3 block overflow-x-auto rounded-[3px] border border-success/25 bg-fill-soft px-3 py-2 text-xs text-success">
              {issuedBootstrapToken.token}
            </code>
          </div>
        )}

        <div className="space-y-2">
          {credentials.length === 0 ? (
            <p className="text-xs text-ink-mute">No automation credentials issued yet.</p>
          ) : (
            credentials.map((credential) => (
              <div
                key={credential._id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-[3px] border border-line-subtle bg-fill-soft px-3 py-3"
              >
                <div className="min-w-0">
                  <p className="text-sm text-ink">{credential.label}</p>
                  <p className="mt-1 text-xs text-ink-mute">
                    {credential.credentialPreview} · {credential.status}
                    {credential.lastUsedAt
                      ? ` · last used ${new Date(credential.lastUsedAt).toLocaleString()}`
                      : ""}
                  </p>
                  <p className="mt-1 text-[11px] text-ink-dim">
                    {credential.scopes.join(" · ")}
                  </p>
                </div>

                <Button
                  onClick={() => void handleRevoke(credential._id)}
                  variant="ghost"
                  size="sm"
                  disabled={
                    credential.status === "revoked" ||
                    revokingCredentialId === credential._id
                  }
                  className="rounded-[3px] border border-error/25 text-error hover:bg-error-muted hover:text-error disabled:opacity-50"
                >
                  {credential.status === "revoked"
                    ? "Revoked"
                    : revokingCredentialId === credential._id
                      ? "Revoking..."
                      : "Revoke"}
                </Button>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}
