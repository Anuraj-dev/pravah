import { describe, expect, it, vi } from "vitest";
import {
  collectServerImageIds,
  forgottenImageIds,
  rememberImageId,
  rememberLocalTaskImage,
  resolveTaskImageBytes,
  retainLocalTaskImages,
  type TaskImageByteStore,
} from "../lib/taskImageLibrary";

function store(initial: string | null = null): TaskImageByteStore & { reads: number } {
  return {
    reads: 0,
    async read(taskImageId) {
      this.reads += 1;
      return taskImageId === "image_local" ? "file:///library/image_local.jpg" : initial;
    },
    writeFromFile: vi.fn(async () => "file:///library/written.jpg"),
    writeFromUrl: vi.fn(async () => "file:///library/downloaded.webp"),
  };
}

describe("resolveTaskImageBytes", () => {
  it("uses the local file and does not ask Convex", async () => {
    const bytes = store();
    const resolveRemote = vi.fn();
    const onIo = vi.fn();
    const result = await resolveTaskImageBytes({
      taskImageId: "image_local",
      variant: "card",
      allowDownload: false,
      store: bytes,
      resolveRemote,
      onIo,
    });
    expect(result).toEqual({ kind: "ready", url: "file:///library/image_local.jpg" });
    expect(resolveRemote).not.toHaveBeenCalled();
    expect(onIo).toHaveBeenCalledWith({ outcome: "local", requested: "card" });
  });

  it("leaves a list thumbnail unloaded until the task is opened", async () => {
    const resolveRemote = vi.fn();
    const result = await resolveTaskImageBytes({
      taskImageId: "image_remote",
      variant: "card",
      allowDownload: false,
      store: store(null),
      resolveRemote,
    });
    expect(result).toEqual({ kind: "deferred" });
    expect(resolveRemote).not.toHaveBeenCalled();
  });

  it("downloads the detail file once and serves that copy afterwards", async () => {
    const bytes = store(null);
    bytes.read = vi.fn(async () => null);
    let releaseRemote: (value: { kind: "ready"; url: string }) => void = () => undefined;
    const resolveRemote = vi.fn(() => new Promise<{ kind: "ready"; url: string }>((resolve) => {
      releaseRemote = resolve;
    }));
    const first = resolveTaskImageBytes({
      taskImageId: "image_once",
      variant: "card",
      allowDownload: true,
      store: bytes,
      resolveRemote,
    });
    await vi.waitFor(() => expect(resolveRemote).toHaveBeenCalledTimes(1));
    const second = resolveTaskImageBytes({
      taskImageId: "image_once",
      variant: "detail",
      allowDownload: true,
      store: bytes,
      resolveRemote,
    });
    releaseRemote({ kind: "ready", url: "https://res.cloudinary.example/f_webp/detail" });
    await expect(first).resolves.toEqual({ kind: "ready", url: "file:///library/downloaded.webp" });
    await expect(second).resolves.toEqual({ kind: "ready", url: "file:///library/downloaded.webp" });
    expect(resolveRemote).toHaveBeenCalledWith("image_once", "detail");
    expect(bytes.writeFromUrl).toHaveBeenCalledTimes(1);
  });
});

describe("local image index", () => {
  it("forgets server ids that disappeared and keeps an in-flight upload", () => {
    expect(forgottenImageIds(
      new Set(["keep", "gone", "uploading"]),
      new Set(["keep"]),
      new Set(["uploading"]),
    )).toEqual(["gone"]);
  });

  it("does not delete anything the first time the phone sees the server list", async () => {
    const removed: string[] = [];
    let raw: string | null = null;
    const forgotten = await retainLocalTaskImages({
      nextIds: new Set(["image_a"]),
      protectedIds: new Set(),
      readIndex: async () => raw,
      writeIndex: async (value) => {
        raw = value;
      },
      remove: async (id) => {
        removed.push(id);
      },
    });
    expect(forgotten).toEqual([]);
    expect(removed).toEqual([]);
    expect(JSON.parse(raw ?? "{}")).toEqual({ local: [], seen: ["image_a"] });
  });

  it("deletes a local file only after the server listed it and then dropped it", async () => {
    let raw: string | null = JSON.stringify({
      local: ["image_a", "image_b", "image_new"],
      seen: ["image_a", "image_b"],
    });
    const removed: string[] = [];
    const forgotten = await retainLocalTaskImages({
      nextIds: new Set(["image_b"]),
      protectedIds: new Set(),
      readIndex: async () => raw,
      writeIndex: async (value) => {
        raw = value;
      },
      remove: async (id) => {
        removed.push(id);
      },
    });
    expect(forgotten).toEqual(["image_a"]);
    expect(removed).toEqual(["image_a"]);
    expect(JSON.parse(raw ?? "{}")).toEqual({
      local: ["image_b", "image_new"],
      seen: ["image_b"],
    });
  });

  it("records a newly stored id without treating it as already seen on the server", async () => {
    let raw: string | null = JSON.stringify({ local: ["image_a"], seen: [] });
    await rememberLocalTaskImage("image_b", async () => raw, async (value) => {
      raw = value;
    });
    expect(rememberImageId(raw, "image_b")).toBeNull();
    expect(JSON.parse(raw ?? "{}")).toEqual({ local: ["image_a", "image_b"], seen: [] });
  });

  it("collects active and recoverable image ids from the workspace query", () => {
    expect(collectServerImageIds([
      {
        taskId: "task_1",
        collection: {
          active: [{ taskImageId: "image_b" }],
          recoverable: [{ taskImageId: "image_a" }],
        },
      },
    ])).toEqual(["image_a", "image_b"]);
    expect(collectServerImageIds(undefined)).toBeNull();
  });
});
