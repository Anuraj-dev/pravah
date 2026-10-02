import type { KairoTaskProposal } from "../lib/kairoTaskProposals";

const ACCENT = "var(--color-accent-primary)";

interface KairoTaskProposalListProps {
  proposals: KairoTaskProposal[];
  onDecision: (proposalIndex: number, decision: "apply" | "decline") => void;
}

function statusText(proposal: KairoTaskProposal) {
  switch (proposal.status) {
    case "applying":
      return "Adding...";
    case "applied":
      return "Added";
    case "declined":
      return "Cancelled";
    case "failed":
      return proposal.error ?? "Could not add task";
    default:
      return null;
  }
}

export function KairoTaskProposalList({
  proposals,
  onDecision,
}: KairoTaskProposalListProps) {
  return (
    <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
      {proposals.map((proposal, index) => {
        const status = statusText(proposal);
        return (
          <div
            key={`${proposal.title}-${proposal.deadline ?? "inbox"}-${index}`}
            style={{
              padding: "8px 10px",
              background: "var(--color-fill-faint)",
              border: "1px solid var(--color-border-subtle)",
              borderLeft: `2px solid ${ACCENT}`,
              borderRadius: 3,
              color: "var(--color-text-secondary)",
              fontFamily: "var(--font-mono)",
              fontSize: 12,
            }}
          >
            <div>
              {proposal.title} {proposal.deadline ? `→ ${proposal.deadline}` : "→ inbox"}
            </div>
            {proposal.status === "pending" ? (
              <div style={{ display: "flex", gap: 6, marginTop: 7 }}>
                <button
                  type="button"
                  onClick={() => onDecision(index, "apply")}
                  style={actionButtonStyle(true)}
                >
                  Add task
                </button>
                <button
                  type="button"
                  onClick={() => onDecision(index, "decline")}
                  style={actionButtonStyle(false)}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div
                style={{
                  color: proposal.status === "failed" ? "var(--color-error)" : "var(--color-text-dim)",
                  fontFamily: "var(--font-sans)",
                  fontSize: 11,
                  marginTop: 5,
                }}
              >
                {status}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function actionButtonStyle(primary: boolean): React.CSSProperties {
  return {
    background: primary ? ACCENT : "transparent",
    border: primary ? "none" : "1px solid var(--color-border-strong)",
    borderRadius: 3,
    color: primary ? "var(--color-text-inverse)" : "var(--color-text-secondary)",
    cursor: "pointer",
    fontFamily: "var(--font-sans)",
    fontSize: 11,
    fontWeight: 600,
    padding: "4px 8px",
  };
}
