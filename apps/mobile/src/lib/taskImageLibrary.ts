export type TaskImageDelivery =
  | { kind: "ready"; url: string }
  | { kind: "not_found" }
  | { kind: "state"; state: string }
  | { kind: "deferred" };

export type TaskImageByteStore = {
  read(taskImageId: string): Promise<string | null>;
  writeFromFile(taskImageId: string, sourceUri: string): Promise<string | null>;
  writeFromUrl(taskImageId: string, url: string): Promise<string | null>;
};

export type ImageIoEvent = {
  outcome: "local" | "downloaded" | "deferred" | "remote_failed" | "kept_remote";
  requested: "card" | "detail";
};

const downloads = new Map<string, Promise<TaskImageDelivery>>();

export async function resolveTaskImageBytes(args: {
  taskImageId: string;
  variant: "card" | "detail";
  allowDownload: boolean;
  store: TaskImageByteStore;
  resolveRemote: (
    taskImageId: string,
    variant: "card" | "detail",
  ) => Promise<Exclude<TaskImageDelivery, { kind: "deferred" }>>;
  onIo?: (event: ImageIoEvent) => void;
}): Promise<TaskImageDelivery> {
  const local = await args.store.read(args.taskImageId);
  if (local) {
    args.onIo?.({ outcome: "local", requested: args.variant });
    return { kind: "ready", url: local };
  }
  if (!args.allowDownload) {
    args.onIo?.({ outcome: "deferred", requested: args.variant });
    return { kind: "deferred" };
  }

  const existing = downloads.get(args.taskImageId);
  if (existing) return existing;

  const pending = fetchAndStore(args).finally(() => {
    if (downloads.get(args.taskImageId) === pending) downloads.delete(args.taskImageId);
  });
  downloads.set(args.taskImageId, pending);
  return pending;
}

async function fetchAndStore(args: {
  taskImageId: string;
  variant: "card" | "detail";
  store: TaskImageByteStore;
  resolveRemote: (
    taskImageId: string,
    variant: "card" | "detail",
  ) => Promise<Exclude<TaskImageDelivery, { kind: "deferred" }>>;
  onIo?: (event: ImageIoEvent) => void;
}): Promise<TaskImageDelivery> {
  let remote: Exclude<TaskImageDelivery, { kind: "deferred" }>;
  try {
    remote = await args.resolveRemote(args.taskImageId, "detail");
  } catch {
    args.onIo?.({ outcome: "remote_failed", requested: args.variant });
    throw new Error("task_image_resolve_failed");
  }
  if (remote.kind !== "ready") {
    args.onIo?.({ outcome: "remote_failed", requested: args.variant });
    return remote;
  }
  const stored = await args.store.writeFromUrl(args.taskImageId, remote.url).catch(() => null);
  if (!stored) {
    args.onIo?.({ outcome: "kept_remote", requested: args.variant });
    return remote;
  }
  args.onIo?.({ outcome: "downloaded", requested: args.variant });
  return { kind: "ready", url: stored };
}

const IMAGE_ID = /^[A-Za-z0-9_-]{1,128}$/;

export function forgottenImageIds(
  previousIds: ReadonlySet<string>,
  nextIds: ReadonlySet<string>,
  protectedIds: ReadonlySet<string>,
): string[] {
  const forgotten: string[] = [];
  for (const id of previousIds) {
    if (!nextIds.has(id) && !protectedIds.has(id)) forgotten.push(id);
  }
  return forgotten.sort();
}

function validImageIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((id): id is string => typeof id === "string" && IMAGE_ID.test(id));
}

export function parseLocalImageIndex(raw: string | null): { local: Set<string>; seen: Set<string> } {
  if (!raw) return { local: new Set(), seen: new Set() };
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      const ids = validImageIds(parsed);
      return { local: new Set(ids), seen: new Set(ids) };
    }
    if (parsed && typeof parsed === "object") {
      const record = parsed as { local?: unknown; seen?: unknown };
      return { local: new Set(validImageIds(record.local)), seen: new Set(validImageIds(record.seen)) };
    }
  } catch {
    return { local: new Set(), seen: new Set() };
  }
  return { local: new Set(), seen: new Set() };
}

export function planLocalImageRetention(
  current: { local: ReadonlySet<string>; seen: ReadonlySet<string> },
  nextIds: ReadonlySet<string>,
  protectedIds: ReadonlySet<string>,
): { forgotten: string[]; stored: string } {
  const forgotten = forgottenImageIds(current.seen, nextIds, protectedIds);
  const local = new Set(current.local);
  for (const id of forgotten) local.delete(id);
  for (const id of protectedIds) {
    if (IMAGE_ID.test(id)) local.add(id);
  }
  const seen = [...nextIds].filter((id) => IMAGE_ID.test(id)).sort();
  return {
    forgotten,
    stored: JSON.stringify({ local: [...local].sort(), seen }),
  };
}

export function collectServerImageIds(query: unknown): string[] | null {
  if (query === undefined || query === null) return null;
  if (!Array.isArray(query)) return null;
  const ids = new Set<string>();
  for (const item of query) {
    if (!item || typeof item !== "object") continue;
    const collection = (item as { collection?: { active?: unknown; recoverable?: unknown } }).collection;
    for (const list of [collection?.active, collection?.recoverable]) {
      if (!Array.isArray(list)) continue;
      for (const image of list) {
        const taskImageId = image && typeof image === "object"
          ? (image as { taskImageId?: unknown }).taskImageId
          : undefined;
        if (typeof taskImageId === "string" && IMAGE_ID.test(taskImageId)) ids.add(taskImageId);
      }
    }
  }
  return [...ids].sort();
}

export const LOCAL_TASK_IMAGE_INDEX_KEY = "pravah_local_task_image_ids_v1";

let indexChain = Promise.resolve();

function enqueueIndex<T>(work: () => Promise<T>): Promise<T> {
  const run = indexChain.then(work, work);
  indexChain = run.then(() => undefined, () => undefined);
  return run;
}

export function rememberImageId(raw: string | null, taskImageId: string): string | null {
  if (!IMAGE_ID.test(taskImageId)) return null;
  const current = parseLocalImageIndex(raw);
  if (current.local.has(taskImageId)) return null;
  current.local.add(taskImageId);
  return JSON.stringify({
    local: [...current.local].sort(),
    seen: [...current.seen].sort(),
  });
}

export function rememberLocalTaskImage(
  taskImageId: string,
  readIndex: () => Promise<string | null>,
  writeIndex: (value: string) => Promise<void>,
): Promise<void> {
  return enqueueIndex(async () => {
    const next = rememberImageId(await readIndex(), taskImageId);
    if (!next) return;
    await writeIndex(next);
  });
}

export function retainLocalTaskImages(args: {
  nextIds: ReadonlySet<string>;
  protectedIds: ReadonlySet<string>;
  readIndex: () => Promise<string | null>;
  writeIndex: (value: string) => Promise<void>;
  remove: (taskImageId: string) => Promise<void>;
}): Promise<string[]> {
  return enqueueIndex(async () => {
    const raw = await args.readIndex();
    const plan = planLocalImageRetention(parseLocalImageIndex(raw), args.nextIds, args.protectedIds);
    for (const id of plan.forgotten) await args.remove(id);
    if (plan.forgotten.length === 0 && raw === plan.stored) return plan.forgotten;
    await args.writeIndex(plan.stored);
    return plan.forgotten;
  });
}
