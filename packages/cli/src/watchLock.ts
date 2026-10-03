/// <reference types="node" />
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const LOCK_DIR_MODE = 0o700;

function isProcessAlive(pid: number): boolean {
  try {
    // Signal 0 performs the permission and existence checks without delivering.
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM means the process exists but belongs to another user.
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

export interface WatchLock {
  path: string;
  release(): void;
}

export class WatchAlreadyRunningError extends Error {
  readonly pid: number;

  constructor(pid: number) {
    super(`Another \`pravah watch\` is already running as pid ${pid}`);
    this.name = "WatchAlreadyRunningError";
    this.pid = pid;
  }
}

function readLockedPid(lockPath: string): number | null {
  try {
    const parsed = Number.parseInt(readFileSync(lockPath, "utf8").trim(), 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Single-writer lock for the snapshot. `pravah watch` is a long-lived daemon, so
 * two of them would fight over the same atomic rename and the pid file. A stale
 * lock (owner died without releasing) is reclaimed.
 */
export function acquireWatchLock(lockPath: string): WatchLock {
  mkdirSync(dirname(lockPath), { recursive: true, mode: LOCK_DIR_MODE });

  const existing = readLockedPid(lockPath);
  if (existing !== null && existing !== process.pid && isProcessAlive(existing)) {
    throw new WatchAlreadyRunningError(existing);
  }

  writeFileSync(lockPath, `${process.pid}\n`, { mode: 0o600 });

  let released = false;
  return {
    path: lockPath,
    release() {
      if (released) return;
      released = true;
      // Only remove the lock if we still own it, so a reclaimed lock is not
      // deleted out from under its new owner.
      if (readLockedPid(lockPath) === process.pid) {
        rmSync(lockPath, { force: true });
      }
    },
  };
}
