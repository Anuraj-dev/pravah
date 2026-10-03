/** @vitest-environment happy-dom */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { LongTermGoalsPage } from "../components/LongTermGoalsPage";

describe("LongTermGoalsPage", () => {
  it("renders server-backed goals with progress", () => {
    render(
      <LongTermGoalsPage
        serverBacked
        serverGoals={[
          { id: "g2", text: "Second", createdAt: 20 },
          { id: "g1", text: "First", createdAt: 10 },
        ]}
        progressByGoalId={{
          g1: { done: 1, total: 2 },
          g2: { done: 0, total: 0 },
        }}
      />
    );

    expect(screen.getByText("Goals and task links are server-backed.")).toBeInTheDocument();
    expect(screen.getByText("First")).toBeInTheDocument();
    expect(screen.getByText("Second")).toBeInTheDocument();
    expect(screen.getByText("1 of 2 done")).toBeInTheDocument();
    expect(screen.getByText("No tasks linked")).toBeInTheDocument();
  });

  it("calls create and delete handlers in server-backed mode", async () => {
    const onCreateServerGoal = vi.fn().mockResolvedValue(undefined);
    const onDeleteServerGoal = vi.fn().mockResolvedValue(undefined);

    render(
      <LongTermGoalsPage
        serverBacked
        serverGoals={[{ id: "g1", text: "Existing goal", createdAt: 10 }]}
        onCreateServerGoal={onCreateServerGoal}
        onDeleteServerGoal={onDeleteServerGoal}
      />
    );

    fireEvent.change(screen.getByPlaceholderText("What do you want to achieve?"), {
      target: { value: " New goal " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add long-term goal" }));
    await waitFor(() => {
      expect(onCreateServerGoal).toHaveBeenCalledWith("New goal");
    });

    fireEvent.click(screen.getByLabelText("Delete goal: Existing goal"));
    await waitFor(() => {
      expect(onDeleteServerGoal).toHaveBeenCalledWith("g1");
    });
  });

  it("passes notes, priority and deadline from the composer at creation", async () => {
    const onCreateServerGoal = vi.fn().mockResolvedValue(undefined);

    render(
      <LongTermGoalsPage
        serverBacked
        serverGoals={[{ id: "g1", text: "Existing goal", createdAt: 10 }]}
        onCreateServerGoal={onCreateServerGoal}
      />
    );

    fireEvent.focus(screen.getByPlaceholderText("What do you want to achieve?"));
    fireEvent.change(screen.getByPlaceholderText("What do you want to achieve?"), {
      target: { value: "Rich goal" },
    });
    fireEvent.change(screen.getByLabelText("Goal notes"), {
      target: { value: "Ship it calm" },
    });
    fireEvent.click(screen.getByRole("button", { name: "P1" }));
    fireEvent.change(screen.getByLabelText("New goal deadline"), {
      target: { value: "2026-12-31" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add long-term goal" }));

    await waitFor(() => {
      expect(onCreateServerGoal).toHaveBeenCalledWith("Rich goal", {
        description: "Ship it calm",
        deadline: "2026-12-31",
        priority: "p1",
      });
    });
  });
});
