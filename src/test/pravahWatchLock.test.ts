import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseArgs } from "../../packages/cli/src/args";
import {
  acquireWatchLock,
  WatchAlreadyRunningError,
} from "../../packages/cli/src/watchLock";
import {
  planWatchCommand,
  resolveWatchFormat,
} from "../../packages/cli/src/watchCommand";

describe("pravah watch option parsing", () => {
  it("accepts --format=value as well as --format value", () => {
    expect(parseArgs(["watch", "--format=waybar"]).options).toEqual({
      format: "waybar",
    });
    expect(parseArgs(["watch", "--format", "waybar"]).options).toEqual({
      format: "waybar",
    });
  });

  it("treats an empty --format= as an explicit empty value", () => {
    expect(parseArgs(["watch", "--format="]).options).toEqual({ format: "" });
  });

  it("leaves a value-less flag as a flag", () => {
    expect(parseArgs(["watch", "--print"]).options).toEqual({ print: true });
  });

  it("resolves supported formats", () => {
    expect(resolveWatchFormat(undefined)).toBe("snapshot");
    expect(resolveWatchFormat("snapshot")).toBe("snapshot");
    expect(resolveWatchFormat("waybar")).toBe("waybar");
    expect(() => resolveWatchFormat("nope")).toThrow(/Unsupported --format/);
  });

  it("plans a one-shot print and a long-lived stream", () => {
    const printed = planWatchCommand(parseArgs(["watch", "--print"]));
    expect(printed.mode).toBe("print");
    expect(printed.format).toBe("snapshot");

    const streaming = planWatchCommand(parseArgs(["watch", "--format", "waybar"]));
    expect(streaming.mode).toBe("stream");
    expect(streaming.format).toBe("waybar");
  });

  it("never wraps a waybar line in the JSON envelope", () => {
    const plan = planWatchCommand(parseArgs(["watch", "--format=waybar", "--json"]));
    expect(plan.json).toBe(false);
  });
});

describe("watch pid lock", () => {
  let dir: string;
  let lockPath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "pravah-lock-"));
    lockPath = join(dir, "watch.pid");
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("records the current pid and releases cleanly", () => {
    const lock = acquireWatchLock(lockPath);
    expect(readFileSync(lockPath, "utf8").trim()).toBe(String(process.pid));
    lock.release();
    expect(existsSync(lockPath)).toBe(false);
  });

  it("is idempotent on release", () => {
    const lock = acquireWatchLock(lockPath);
    lock.release();
    expect(() => lock.release()).not.toThrow();
  });

  it("refuses to start while a live owner holds the lock", () => {
    // pid 1 always exists, so it stands in for a running daemon.
    writeFileSync(lockPath, "1\n");
    expect(() => acquireWatchLock(lockPath)).toThrow(WatchAlreadyRunningError);
  });

  it("names the conflicting pid so the message is actionable", () => {
    writeFileSync(lockPath, "1\n");
    try {
      acquireWatchLock(lockPath);
      expect.unreachable("expected the lock to be refused");
    } catch (error) {
      expect((error as WatchAlreadyRunningError).pid).toBe(1);
      expect((error as Error).message).toContain("pid 1");
    }
  });

  it("reclaims a stale lock left by a dead process", () => {
    // A pid above the max is never alive.
    writeFileSync(lockPath, "4194304\n");
    const lock = acquireWatchLock(lockPath);
    expect(readFileSync(lockPath, "utf8").trim()).toBe(String(process.pid));
    lock.release();
  });

  it("reclaims an unparseable lock file", () => {
    writeFileSync(lockPath, "not-a-pid\n");
    const lock = acquireWatchLock(lockPath);
    expect(readFileSync(lockPath, "utf8").trim()).toBe(String(process.pid));
    lock.release();
  });

  it("does not delete a lock that a later owner has taken over", () => {
    const lock = acquireWatchLock(lockPath);
    writeFileSync(lockPath, "1\n");
    lock.release();
    expect(readFileSync(lockPath, "utf8").trim()).toBe("1");
  });

  it("re-entrant acquire in the same process succeeds", () => {
    const first = acquireWatchLock(lockPath);
    const second = acquireWatchLock(lockPath);
    second.release();
    first.release();
  });
});
