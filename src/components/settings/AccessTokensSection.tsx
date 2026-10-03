// Access tokens — web port of the mobile CliCredentialsSection: issue a
// short-lived bootstrap token for the pravah CLI, copy it once, and manage
// (revoke) recorded credentials.
import { useState } from "react";
import { useMutation, useQuery } from "../../lib/data";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { useToast } from "../useToast";
import {
  SettingsCard,
  SettingRow,
  StatusBadge,
  SettingsButton,
  TextField,
  MonoKicker,
  WarmToggle,
  inputStyle,
  inputFocusHandlers,
} from "./primitives";

import { CopyIcon, CheckIcon } from "../ui/icons";
import { settingsCliIcon } from "../ui/traced-icons";

const CliTileIcon = settingsCliIcon;

const READ_ONLY_AUTOMATION_SCOPES = [
  "tasks:read",
  "review:read",
  "sync:read",
] as const;

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function expiresInLabel(expiresAt: number) {
  const minutes = Math.round((expiresAt - Date.now()) / 60000);
  if (minutes <= 0) return "Expired";
  return `Expires in ${minutes} min`;
}

export function AccessTokensSection() {
  const [label, setLabel] = useState("Codex local");
  const [allowTaskWrites, setAllowTaskWrites] = useState(false);
  const [issuing, setIssuing] = useState(false);
  const [revokingCredentialId, setRevokingCredentialId] =
    useState<Id<"automationCredentials"> | null>(null);
  const [copied, setCopied] = useState(false);
  const [issuedBootstrapToken, setIssuedBootstrapToken] = useState<{
    token: string;
    expiresAt: number;
  } | null>(null);
  const issueBootstrapToken = useMutation(api.automation.issueBootstrapToken);
  const revokeCredential = useMutation(api.automation.revokeCredential);
  const credentials = useQuery(api.automation.listCredentials, {}) ?? [];
  const { showError, showSuccess } = useToast();

  const activeCount = credentials.filter((c) => c.status === "active").length;

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
      setCopied(false);
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

  const handleCopyToken = async () => {
    if (!issuedBootstrapToken) return;
    try {
      await navigator.clipboard.writeText(issuedBootstrapToken.token);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2400);
    } catch {
      showError("Could not copy the token. Select it and copy manually.");
    }
  };

  return (
    <div className="space-y-4">
      {issuedBootstrapToken && (
        <div
          className="p-4 space-y-2.5"
          style={{
            background: "var(--color-success-muted)",
            border: "1px solid rgba(34, 107, 75, 0.28)",
            borderRadius: 16,
          }}
          data-testid="automation-bootstrap-token"
        >
          <div className="flex items-center justify-between gap-3">
            <MonoKicker>New bootstrap token</MonoKicker>
            <StatusBadge
              tone={Date.now() < issuedBootstrapToken.expiresAt ? "success" : "error"}
              label={expiresInLabel(issuedBootstrapToken.expiresAt)}
            />
          </div>
          <code
            className="block overflow-x-auto px-3 py-2.5 text-[12px]"
            style={{
              fontFamily: "var(--font-mono)",
              background: "var(--color-bg-surface)",
              border: "1px solid rgba(34, 107, 75, 0.28)",
              borderRadius: 10,
              color: "var(--color-success)",
            }}
          >
            {issuedBootstrapToken.token}
          </code>
          <div className="flex items-center justify-between gap-3">
            <p className="text-[12px] leading-[17px] text-ink-soft">
              You won't see this token again — copy it now, then run{" "}
              <code style={{ fontFamily: "var(--font-mono)" }}>pravah auth import</code> and paste
              it to finish.
            </p>
            <SettingsButton variant="soft" onClick={() => void handleCopyToken()}>
              {copied ? <CheckIcon size={13} /> : <CopyIcon size={13} />}
              {copied ? "Copied" : "Copy"}
            </SettingsButton>
          </div>
        </div>
      )}

      <SettingsCard>
        <SettingRow
          title="Issue a bootstrap token"
          help="Short-lived tokens for the pravah CLI. Exchange one locally with pravah auth import, then revoke the credential from here."
        />
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
          <TextField label="Credential label">
            <input
              type="text"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="Codex local"
              className="w-full px-3 py-2.5 text-sm text-ink outline-none transition-colors placeholder:text-ink-dim"
              style={{ ...inputStyle, ...inputFocusHandlers }}
            />
          </TextField>
          <div
            className="flex items-end justify-between gap-4 md:justify-start md:pl-1"
            style={{ paddingBottom: 2 }}
          >
            <label className="flex cursor-pointer items-center gap-2.5">
              <WarmToggle
                checked={allowTaskWrites}
                onChange={setAllowTaskWrites}
                label="Allow task writes"
              />
              <span>
                <span className="block text-[12.5px] font-semibold text-ink">Allow task writes</span>
                <span className="block text-[11.5px] text-ink-mute">
                  Off by default. Read-only otherwise.
                </span>
              </span>
            </label>
            <SettingsButton variant="accent" onClick={() => void handleIssue()} disabled={issuing}>
              {issuing ? "Issuing…" : "Issue Bootstrap Token"}
            </SettingsButton>
          </div>
        </div>
        <div
          className="px-3 py-2.5"
          style={{
            background: "var(--color-fill-faint)",
            borderRadius: 10,
            border: "1px solid var(--color-border-subtle)",
          }}
        >
          <MonoKicker>Scopes</MonoKicker>
          <p
            className="mt-1.5 text-[11.5px]"
            style={{ fontFamily: "var(--font-mono)", color: "var(--color-text-secondary)" }}
          >
            {[
              ...READ_ONLY_AUTOMATION_SCOPES,
              ...(allowTaskWrites ? (["tasks:write"] as const) : []),
            ].join(" · ")}
          </p>
        </div>
      </SettingsCard>

      <SettingsCard>
        <SettingRow
          title="Your tokens"
          help={
            credentials.length === 0
              ? "No tokens yet. Create one to connect the pravah CLI."
              : undefined
          }
          right={
            credentials.length > 0 ? (
              <StatusBadge
                tone={activeCount > 0 ? "success" : "idle"}
                label={activeCount > 0 ? `${activeCount} active` : "None active"}
              />
            ) : undefined
          }
        />
        {credentials.length > 0 && (
          <div
            className="overflow-hidden"
            style={{ border: "1px solid var(--color-border-subtle)", borderRadius: 10 }}
          >
            {credentials.map((credential, index) => {
              const revoked = credential.status === "revoked";
              return (
                <div
                  key={credential._id}
                  className="flex items-center gap-3"
                  style={{
                    padding: "10px 14px",
                    background: "var(--color-bg-surface)",
                    borderTop: index > 0 ? "1px solid var(--color-border-subtle)" : "none",
                  }}
                >
                  <span
                    className="grid place-items-center shrink-0"
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 12,
                      background: "var(--color-bg-elevated)",
                      border: "1px solid var(--color-border-subtle)",
                      color: "var(--color-text-secondary)",
                    }}
                  >
                    <CliTileIcon size={18} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-semibold text-ink truncate">
                        {credential.label}
                      </span>
                      <StatusBadge
                        tone={revoked ? "idle" : "success"}
                        label={revoked ? "Revoked" : "Active"}
                      />
                    </div>
                    <p className="mt-0.5 text-[11.5px] text-ink-mute truncate">
                      {credential.credentialPreview}
                      {credential.lastUsedAt
                        ? ` · last used ${new Date(credential.lastUsedAt).toLocaleString()}`
                        : ""}
                    </p>
                    <p
                      className="mt-0.5 text-[10.5px] text-ink-dim"
                      style={{ fontFamily: "var(--font-mono)" }}
                    >
                      {credential.scopes.join(" · ")}
                    </p>
                  </div>
                  <SettingsButton
                    variant={revoked ? "ghost" : "danger"}
                    onClick={() => void handleRevoke(credential._id)}
                    disabled={revoked || revokingCredentialId === credential._id}
                  >
                    {revoked
                      ? "Revoked"
                      : revokingCredentialId === credential._id
                        ? "Revoking…"
                        : "Revoke"}
                  </SettingsButton>
                </div>
              );
            })}
          </div>
        )}
      </SettingsCard>
    </div>
  );
}
