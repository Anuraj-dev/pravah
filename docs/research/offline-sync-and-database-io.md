# Offline sync and database I/O

Scope. This note checks whether a local read/write store would cut Convex database I/O for Pravah while the app stays live and multi-device when online. It uses this repo and vendor docs opened on 2026-09-28. It changes no product code.

## Executive finding

A local database does not, by itself, reduce Convex database I/O while the user is online. It reduces that I/O only if the open clients stop subscribing to the fat task lists and the sync path reads a change log instead of the whole collection. Keeping the current `useQuery` calls next to a replica does nothing for the bill. Rebuilding the replica by re-running those same collects does nothing either.

Pravah's reads are already shaped that way. The signed-in web app and the signed-in phone each keep several live queries that `.collect()` overlapping sets of the same owner's tasks. The CLI is a third live client: a normal list command fetches the owner's tasks over HTTP and throws most of them away on the machine. I could not find a measured document-read or byte figure in the repo. The I/O complaint is qualitative.

Convex does not keep scanning an idle subscription. It re-runs a query when data that query read changes, and it does not charge database bandwidth for a cached read of the same query and the same arguments. The waste here is that web, phone, and CLI ask overlapping questions under different function names, so one task edit can invalidate several full reads.

I would stay on Convex and cut that overlap before building a replica. I could not find an official Convex persistence mode that serves online reads without the server. I would not leave Convex for Postgres just to adopt Electric or Zero. I would not put PowerSync's experimental Convex connector in front of this app yet. It needs a deploy key and a second service, and the Convex pages I opened do not document the delta endpoint PowerSync says it polls.

If a real offline reader is still wanted after the subscriptions are thinner, the first slice is mobile tasks and goals only: a local store, the existing retry payloads as the outbox, and a small Convex change table the phone can tail. Images, calendar import, crons, the CLI, and the operation ledger stay on the server.

## What the clients read today

Pravah is a single-user app. Domain rows are still scoped by `ownerTokenIdentifier`. [Architecture](../architecture.md#L53-L57) The three clients are the Vite web app, the Expo app, and the Bun CLI against the same Convex deployment. The CLI's default HTTP host is `https://combative-zebra-261.eu-west-1.convex.site`. [Default URL](../../packages/cli/src/liveClient.ts#L15)

### Web

`AuthenticatedApp` subscribes for the whole signed-in session, not per page:

- `tasks.listBoardTasks` with no arguments
- `tasks.listTasks` with `{ status: "completed" }`
- `tasks.listTasks` with `{}` only while Kairo is open, otherwise `"skip"`
- `goals.list` and `goals.listLinks` unless the web goals flag is off

[Subscriptions](../../src/components/AuthenticatedApp.tsx#L69-L73) The goals flag defaults on in the browser unless the env var or a localStorage override turns it off. [Flag](../../src/lib/featureFlags.ts#L3-L11) Settings is mounted only while the sheet is open, and the Gmail review query is skipped unless Google is connected and Gmail is enabled. That review query takes 25 rows. [Settings mount](../../src/components/AuthenticatedApp.tsx#L382) [Review query](../../src/components/Settings.tsx#L123-L138)

`listBoardTasks` is not a page. It collects inbox candidates by an exact empty deadline, every task in the owner deadline index from `""` through `"\uffff"`, and every legacy `scheduled` row. It then keeps rows that are still inbox or timeline tasks. [Query](../../convex/tasks.ts#L381-L400) [Range helper](../../convex/tasks.ts#L86-L100) Completed and cancelled tasks that still have a `deadline` are read and then dropped by `isTimelineTask`. [Filter](../../convex/taskLifecycle.ts#L62-L64) The completed subscription separately collects the owner's `completedAt` range from `0` with no end, plus legacy `completed` rows. [Completed branch](../../convex/tasks.ts#L335-L339) [Completed index read](../../convex/tasks.ts#L116-L131) The board hook only splits that already-fetched array into inbox and date columns. [Split](../../src/hooks/useTaskBoardData.ts#L6-L26)

`listTodayCompletedTasks` and `getTaskCounts` exist. No live web or mobile screen calls them. [Today query](../../convex/tasks.ts#L403) [Counts query](../../convex/tasks.ts#L1300) `getTaskCounts` still collects inbox, the full deadline range, the full completed range, and two legacy status scans, then returns three numbers. Pointing a badge at it would not be a small read.

There is no web task database. Drag reorder keeps an in-memory order until the server list matches. [Architecture note](../architecture.md#L110-L117) I found no `withOptimisticUpdate` under `src/`.

### Mobile

While a session exists, `useTaskQueries` subscribes to all of these at once:

- `tasks.listTasks` with `{ status: "inbox" }`
- `tasks.getTimeline` with `{ endDate: "9999-12-31" }` and no `startDate`
- `tasks.listTasks` with `{ status: "completed" }`
- `tasks.listTasks` with `{}` when `includeAllTasks` is true
- `taskImages.listWorkspaceImageCollections`

[Hook](../../apps/mobile/src/hooks/useTaskQueries.ts#L65-L93) [Far-future sentinel](../../apps/mobile/src/hooks/useTaskQueries.ts#L202-L221) `App.tsx` passes `includeAllTasks: true` for the whole session. The comment says the full corpus is a handful of indexed rows and that keeping it live avoids a round trip when Goals, Progress, or Kairo open. [Call site](../../apps/mobile/App.tsx#L302-L308) The hook itself was written so the full corpus can be skipped, and a test locks that skip. Production does not use the skip. [Hook comment](../../apps/mobile/src/hooks/useTaskQueries.ts#L1-L6) [Gating test](../../apps/mobile/src/test/useTaskQueriesGating.test.ts#L59-L72)

`getTimeline` with no start and that end date collects the same unbounded deadline range as the board query, plus legacy scheduled rows, then groups the timeline rows. [Handler](../../convex/tasks.ts#L1262-L1297) `listTasks` with `{}` collects every task on `by_owner`. [Owner scan](../../convex/tasks.ts#L66-L71) [Empty-filter branch](../../convex/tasks.ts#L353-L355) So one phone session reads the inbox slice, the deadline range, every completed task, and then the whole owner set again.

The image query collects every owned task and every owned `taskImages` row, then `db.get`s the upload document for each active image. It also calls `Date.now()` inside the query. [Image query](../../convex/taskImages.ts#L1003-L1017) [Upload read](../../convex/taskImages.ts#L636-L637) On the timeline tab it adds `overdueReflow.preview`, which collects every owned goal, goal link, and task. [Preview gate](../../apps/mobile/App.tsx#L482-L485) [Load](../../convex/overdueReflow.ts#L164-L180)

Goals stay subscribed too. `useConvexGoalsSync` keeps `goals.list` and `goals.listLinks` open and copies the server rows into AsyncStorage. [Sync hook](../../apps/mobile/src/hooks/useConvexGoalsSync.ts#L7-L46)

If the web app and the phone are both open, both sessions are live. The shared completed query is the same function and the same arguments. The board query, the timeline query, the inbox query, the full-corpus query, and the image query are not the same subscription.

### CLI

The CLI does not subscribe. Each command is an HTTP read or write. `GET /tasks` runs `automationTools.listTasks`, which calls the same `listTasksForOwner` helper and then collects every `taskImages` row for the owner to attach image counts. [Route](../../convex/http.ts#L313-L334) [Internal query](../../convex/automationTools.ts#L156-L176) [Image scan](../../convex/taskImages.ts#L710-L726)

`tasks list`, `inbox`, `overdue`, `upcoming`, and `agent context` call `listTasks` with a date only when `--date` is set. Otherwise the server takes the no-filter branch and returns the owner's tasks, cancelled rows removed after the read. The CLI then builds the 14-day horizon in process. [Filter fetch](../../packages/cli/src/liveCommands.ts#L198-L200) [Horizon](../../packages/cli/src/liveCommands.ts#L189-L195) [Command branch](../../packages/cli/src/liveCommands.ts#L264-L275) `today` does send the local date, but the server still also collects every legacy `scheduled` row. [Date branch](../../convex/tasks.ts#L347-L351) `goals list` fetches every goal, every task, and every goal link so it can count progress on the client. [Goals command](../../packages/cli/src/liveCommands.ts#L277-L278) `tasks show` and task writes also start with an unfiltered task list so they can resolve a title. [Show](../../packages/cli/src/liveCommands.ts#L266) [Write lookup](../../packages/cli/src/liveCommands.ts#L286)

### What already tries to read less

The pieces are real, and most of them are not on the hot path.

The mobile hook can skip the full corpus. The app does not. Web Kairo's unfiltered `listTasks` is skipped until Kairo opens. Web goals can be flagged off. Settings and the review queue are not subscribed in the background. Overdue preview is skipped off the timeline tab. `"skip"` is the Convex client's way to avoid a subscription. [Skip behavior](https://docs.convex.dev/client/react/#skipping-queries)

The purge cron comment says the sweep stays at 72 hours so an idle workspace does not pay hourly reads. The handler itself takes 50 expired rows at a time instead of collecting the table. [Cron](../../convex/crons.ts#L6-L15) [Bounded purge](../../convex/tasks.ts#L1116-L1134) Review listing uses `.take(limit)` rather than `.collect()`. [Review read](../../convex/sync.ts#L266-L289)

The task reads that the screens actually use are indexed, and then they `.collect()` the whole matching range. There is no `usePaginatedQuery` on those screens. I searched the repo for SQLite, MMKV, IndexedDB, and the sync engines below. None are dependencies.

### What still has to run on the server

These are not screen subscriptions, and a phone cache cannot replace them.

Crons purge expired cancelled tasks every 72 hours, purge expired automation idempotency keys every hour, and refresh Task-image provider usage every 6 hours. [Crons](../../convex/crons.ts#L10-L29) Calendar import is an action the user starts. It calls Google and then writes tasks. [Action](../../convex/syncActions.ts#L108-L127) Task images are staged, granted, uploaded, and verified through actions, with a Cloudinary HTTP callback that patches upload state. [Webhook route](../../convex/http.ts#L63-L66) Overdue reflow is computed in a query and applied by a mutation that re-reads the owner's tasks. [Apply](../../convex/overdueReflow.ts#L575-L592)

CLI and automation writes go through HTTP mutations with an idempotency key and an operation ledger. Undo of those writes is a server mutation over that ledger. [Undo route](../../convex/http.ts#L942-L953) Reminders are the opposite case: they are device-local notifications, not server push, and the ADR keeps them that way. [ADR 0002](../adr/0002-local-windowed-task-reminders.md#L3)

### The offline pieces that already exist

The domain glossary is explicit:

> The bounded device-local cache of last-known Task presentation metadata used while the authenticated mobile workspace refreshes. It is neither an offline workspace nor a backup.

[Workspace snapshot](../../CONTEXT.md#L131-L133)

The code matches that sentence. The snapshot is a JSON blob of inbox, scheduled, and completed presentation rows, capped at 120, 160, and 120 tasks. It is written only after the live queries have resolved, and the screen uses it only while those live queries are still undefined. Once they resolve, the live lists replace it. [Caps](../../apps/mobile/src/lib/workspace-snapshot.ts#L144-L149) [When it is shown](../../apps/mobile/src/hooks/useDisplayWorkspace.ts#L94-L108) [Persist gate](../../apps/mobile/App.tsx#L314-L322) It does not stop the subscriptions, and it is not a place the app writes into.

The retry queue is an outbox for a fixed set of task mutations: add, update, complete, bulk complete, inbox delete, move, reschedule, unschedule, and reopen. A mutation is queued only after it throws and `classifyError` says `network`. The optimistic list is rolled back first. The queue survives restart in AsyncStorage, with SecureStore as a fallback, and an item is dropped after 5 attempts. The payloads carry no idempotency key. [Payloads](../../apps/mobile/src/hooks/useRetryQueue.ts#L11-L58) [Enqueue rule](../../apps/mobile/src/hooks/useTaskMutations.ts#L139-L142) [Storage](../../apps/mobile/src/lib/retry-queue-storage.ts#L5-L14) Reads still come from Convex.

Goals are closer to a local store and still are not one. `goalsStore` writes AsyncStorage immediately, then fires `goals.upsert` or `goals.remove` without awaiting it and without the retry queue. The server subscription then calls `_syncFromServer`, which replaces the local array. [Local write](../../apps/mobile/src/hooks/useGoalMutations.ts#L13-L24) [Server replace](../../apps/mobile/src/lib/goalsStorage.ts#L199-L205) A failed goal write is not queued, and the next server snapshot can wipe it.

The mobile roadmap lists "Stay reliable when offline" as a product job. The file is dated 2026-05-16 and the plan under it is settings, reminders, priority, and drag. It does not describe a local database. [Roadmap](../mobile-roadmap.md#L3-L32)

## What Convex says

Pages below were opened on 2026-09-28. Where a search index disagreed with the page I fetched, I used the fetched page.

### When a query runs

A query is a deterministic read. Clients subscribe, Convex records what the function read, and it reruns the query when that data changes. [Query attributes](https://docs.convex.dev/functions/query-functions#caching--reactivity--consistency) [Overview](https://docs.convex.dev/understanding/) The best-practices page says the same thing from the cost side. Everything `.collect()` returns counts toward database bandwidth, including rows a later `.filter` drops, and if any document in that result changes, the query re-runs. [Collect](https://docs.convex.dev/understanding/best-practices/#only-use-collect-with-a-small-number-of-results)

An idle subscription does not re-read on a timer. The documented re-run is a data change. Log streams name the query run reasons `initialSubscription`, `dataChange`, and `identityChange`. [Log streams](https://docs.convex.dev/production/integrations/log-streams/) `Date.now()` inside a query is the exception Convex calls out: the value is not a reason to re-run every millisecond, but using it invalidates the query cache more often than a stable argument would. [Date.now](https://docs.convex.dev/understanding/best-practices/#date-in-queries) `listWorkspaceImageCollections` calls `Date.now()` on every execution. [Call](../../convex/taskImages.ts#L1007)

Convex caches a query result for the same function and the same arguments. Many clients that request that pair get the cached response, and cached reads are not charged database bandwidth. [Caching](https://docs.convex.dev/functions/query-functions#caching--reactivity--consistency) [Realtime](https://docs.convex.dev/realtime) Different functions that happen to read the same tasks do not match that rule. `listBoardTasks`, `getTimeline`, `listTasks` with `{ status: "inbox" }`, and `listTasks` with `{}` are four cache keys.

### What is billed

The limits page, not a blog, is the price list I opened. Database I/O is "Document and index data transferred between Convex functions and the underlying database," priced in GB. Function calls are priced per million, and the note says explicit client calls, scheduled executions, subscription updates, and file accesses count as function calls. Action compute is priced in GB-hours, with separate Convex-runtime and Node.js rates. [Limits](https://docs.convex.dev/production/state/limits) Log stream usage also reports `database_read_documents` and `database_io_read_bytes` on each function execution. [Usage fields](https://docs.convex.dev/production/integrations/log-streams/) I am not translating Pravah's collects into either number. The repo does not contain a dashboard export.

A transaction may scan at most 32,000 documents and 16 MiB, and "Data not returned due to a filter counts as scanned." [Transaction limits](https://docs.convex.dev/production/state/limits#transactions) That is a ceiling, not evidence that Pravah is near it.

### Client behavior

`useQuery` subscribes when the component mounts and cancels when it unmounts. Passing `"skip"` does not talk to the backend. [React client](https://docs.convex.dev/client/react/#reactivity) Inside one client, a second watch of the same query and arguments does not create a second callback stream until the result changes. The current result is the in-memory `localQueryResult`, which the docs define as present only after the server has sent a result or an optimistic update has set one. [Watch](https://docs.convex.dev/api/interfaces/react.Watch) I could not find a page that says this memory is written to IndexedDB or reloaded after the process dies.

Optimistic updates patch that in-memory query result until the mutation finishes, then roll back. They do not replace the subscription. [Optimistic updates](https://docs.convex.dev/client/react/optimistic-updates) The client also queues mutations in memory and retries them until the server confirms the write. [React retries](https://docs.convex.dev/client/react/#retries) [In-memory queue](https://docs.convex.dev/understanding/) That queue is the client's, for the life of the connection. It is not the AsyncStorage queue in the Expo app.

Pagination stays reactive. `paginationOpts.numItems` is only the first page size. After that, `paginate` returns every item in the original query range so pages stay adjacent. [paginate](https://docs.convex.dev/api/interfaces/server.QueryInitializer#paginate) A live paginated subscription of "all of this owner's tasks" would still end up covering the range. It is a way to avoid one huge first read, not a way to stop reading the range once the user has paged through it.

On disconnect, the React client reconnects and re-establishes the session. [Reconnect](https://docs.convex.dev/client/react/#under-the-hood) `initialAuthTokenReuse` defaults to false. The docs say the default fetches a fresh token after the cached token is confirmed, and that the extra Authenticate message makes the server re-execute all authenticated queries. The flag that avoids this is marked experimental. [Option](https://docs.convex.dev/api/interfaces/react.ConvexReactClientOptions#initialauthtokenreuse) Both Pravah clients construct `ConvexReactClient` with `expectAuth: true` and do not set `initialAuthTokenReuse`. [Web client](../../src/lib/convex.tsx#L6-L8) [Mobile client](../../apps/mobile/src/lib/convex.tsx#L12-L14)

`QueryJournal` is not a replication log. The docs define it as a string that stores pagination end cursors so a re-executed paginated query ends at the same cursor. [QueryJournal](https://docs.convex.dev/api/modules/browser#queryjournal)

### No user-scoped change feed

I looked for a change feed the app could tail. The pages I opened describe three admin or backup mechanisms, none of which are a per-user client protocol.

Backups and `npx convex export` produce a consistent snapshot ZIP of table documents. [Backup](https://docs.convex.dev/database/backup-restore) `POST /data/sync` is a paginated export of some or all of a deployment's data. The caller needs `deployment:data:view`, it requires Convex Pro on Convex Cloud, and a continuous export means calling it again and sleeping between `upToDate` pages. [Data sync](https://docs.convex.dev/deployment-api/data-sync) Streaming export, as the current streaming-export page describes it, is a Pro-plan Fivetran connector using a deploy key with that same permission, aimed at analytics systems. [Streaming export](https://docs.convex.dev/production/integrations/streaming-import-export) The HTTP API page says streaming export and import use a deploy key and that this key gives full read and write access to the deployment data. [HTTP API auth](https://docs.convex.dev/http-api#api-authentication)

A search index still showed `GET /api/document_deltas` on an older rendering of the streaming-export page. The page I fetched on 2026-09-28 does not contain that endpoint. I am not citing it as current Convex documentation.

There is no official local-first guide in the set I opened. The model those pages describe is server-authoritative: queries and mutations run on the server, the server reruns queries, and the client renders the pushed results. Zero's own alternatives page describes Convex the same way, as "not a sync engine" whose reads and writes are server-first. [Zero on Convex](https://zero.rocicorp.dev/docs/when-to-use) That sentence is Rocicorp's, not Convex's. Convex's own overview is the one I am relying on. [Overview](https://docs.convex.dev/understanding/)

## Systems that could sit under this app

### PowerSync

PowerSync's client is SQLite. React Native and Expo use the native SDK. The web SDK uses wa-sqlite, with OPFS or IndexedDB under it. [Web SDK](https://docs.powersync.com/client-sdk-references/javascript-web) [RN and web upgrade](https://docs.powersync.com/usage/lifecycle-maintenance/upgrading-the-client-sdk) The service replicates a source database into buckets and streams those to the client. Incremental sync is the source's change stream after an initial snapshot. For Postgres that is logical replication. The service page also lists Convex document deltas as a source mechanism. [Service](https://docs.powersync.com/architecture/powersync-service)

The Convex connector is marked experimental on the source-setup page. PowerSync polls Convex's streaming export, needs the deployment URL and a deploy key created with `deployment:data:view`, and requires a `powersync_checkpoints` table plus a `createCheckpoint` mutation so the delta cursor moves while the app is idle. The polling interval defaults to 1000 ms. Clients must use their own UUID column because they cannot mint a Convex `_id` before the upload. Writes are applied by calling existing Convex mutations from `uploadData()`. [Convex source](https://docs.powersync.com/configuration/source-db/setup#convex) [Writes](https://docs.powersync.com/handling-writes/writing-client-changes#convex) Default conflict handling is last write wins per field. Custom checks run in the backend that receives the upload. [Conflicts](https://docs.powersync.com/usage/lifecycle-maintenance/handling-update-conflicts/custom-conflict-resolution) The FAQ says PowerSync does not replicate a generic HTTP API. A source database, or this experimental Convex connector, is required. [FAQ](https://docs.powersync.com/resources/faq)

I would not start here. The connector is experimental, the deploy key is deployment-admin material, and the phone would still depend on Convex being polled. Nothing on either vendor's page says that poll is cheaper than Pravah's current subscriptions.

### Electric

Electric Sync is a read-path engine for Postgres. It syncs a shape, defined as rows from a Postgres table, to clients over HTTP. The client loads the shape log and can then poll with `live`. A `409` means the offset is gone and the client should resync the shape. [Intro](https://electric-sql.com/docs) [HTTP API](https://electric-sql.com/openapi) [Writes](https://electric-sql.com/docs/guides/writes) The service's required database setting is a Postgres `DATABASE_URL`. [Config](https://electric-sql.com/docs/api/config)

There is no Convex source. Using Electric means moving the rows that should sync to Postgres, or copying them there. The official client does not ship a required local database for web or Expo. Materializing the shape log into a store is optional. The client-development guide names PGlite as one embedded option and says syncing into a database is out of scope for that guide. [Client guide](https://electric-sql.com/docs/guides/writing-your-own-client) Electric does not do write-path sync. Writes go through your own API into Postgres, and the shape log then delivers whatever Postgres committed. Conflict handling is yours. [Writes guide](https://electric-sql.com/docs/guides/writes)

That is a backend migration, not a cache in front of `combative-zebra-261`.

### Zero

Zero is still the product Rocicorp documents at zero.rocicorp.dev. `zero-cache` holds a SQLite replica of Postgres, fed by logical replication. The client keeps a local store and runs queries there first. The auth docs describe that store as IndexedDB. [Home](https://zero.rocicorp.dev/) [Auth storage](https://zero.rocicorp.dev/docs/auth) The when-to-use page says Zero works with PostgreSQL, is not local-first, does not support offline writes, and is not a fit for a native mobile app because it only supports TypeScript clients. [When to use](https://zero.rocicorp.dev/docs/when-to-use) I could not find an Expo or React Native client on the pages I opened.

Mutators run on the client and again on the server against Postgres. The server result is authoritative. [Mutators](https://zero.rocicorp.dev/docs/mutators) Zero cannot sit on Convex. Adopting it means a Postgres primary and a web-only client, and it still refuses offline writes. That misses both the phone and the stated reason for offline.

### Replicache

Replicache's own site, fetched on 2026-09-28, says it is in maintenance mode, open source, and no longer the focus. The focus is Zero, and existing users are told to migrate as they can. [Status](https://replicache.dev/) The docs still describe a browser key-value store, defaulting to IndexedDB, with push and pull against a backend you write. The backend must provide snapshot isolation. Local mutations are replayed on top of the pulled server state. [How it works](https://doc.replicache.dev/concepts/how-it-works) [Storage option](https://doc.replicache.dev/api/interfaces/ReplicacheOptions) [Offline](https://doc.replicache.dev/concepts/offline) I found no Expo client and no Convex adapter. I would not build a new sync protocol on a library whose maintainer says not to.

### A custom outbox

Judged only from Convex's mutation and query docs, a custom protocol looks like this. The phone writes the task or goal into a local store and appends an operation. When online it calls the existing mutations. Those mutations stay the authority, and the CLI and the web app keep calling them too. [Mutations](https://docs.convex.dev/client/react/#editing-data) After a mutation commits, every live query whose read set includes the patched documents re-runs and re-reads what it collects. [Re-run rule](https://docs.convex.dev/understanding/best-practices/#only-use-collect-with-a-small-number-of-results) So the outbox does not change read cost. Unsubscribing the fat lists is what changes it.

To learn what changed without collecting the tasks again, the server would have to record a smaller row that a client can read by cursor. Convex will not emit that row for you. The deployment export is the wrong tool for a signed-in phone, for the reasons above. A table written by the same mutations that already patch tasks would be an ordinary Convex table. A one-shot query for "rows after this cursor" reads that range. A subscription that `.collect()`s the whole log forever reintroduces the same re-read problem one table over.

Conflict handling is not specified by Convex beyond serializable mutations. Two devices of the same user can both patch one task. The mutation that commits second sees the first commit or conflicts and retries. The client that lost needs a rule. For this app the server mutation result is the rule, and the local store rebases. There is no second user to merge with. [Single-user assumption](../architecture.md#L54)

The mobile retry queue is the start of an outbox and not the rest of this design. It does not store a readable task row, it does not send an idempotency key, and it does not run while the subscriptions are still the source of the lists.

## What I would do

### Offline does not cut online reads

Full offline plus sync reduces Convex document I/O and database bandwidth while the user is online only under a narrow design. The open web app, phone, and CLI must stop running the full-list queries. The sync read has to be the new rows in a change log, or some other result that is small and stable. Server jobs can still write tasks, and those writes append a log row the clients apply.

It does not help if the local copy is a second cache in front of the same subscriptions. It does not help if reconnect or a timer rebuilds the local copy by calling `listTasks` with no filter. It does not help if the server computes a delta by collecting the owner's tasks on every sync. That last one is the trap in the current code: `listBoardTasks`, `getTimeline`, `listTasks` with `{}`, the image collection query, and overdue preview already do that collect, and a "delta" endpoint that starts the same way would bill the same read.

Idle time is already cheap. Convex's cache holds a query until its read set changes, and an idle subscription is not a scan loop. The expensive moment is a write, a fresh subscription, and the extra authenticated execution on token refresh. Fewer overlapping read sets means one write invalidates less.

### What can be queued

The task mutations already named in the mobile retry queue are the easy ones: create, edit, complete, reopen, move, reschedule, unschedule, and the inbox bulk delete. They are ordinary mutations with no external side effect. Goal create, edit, delete, and link are the same shape, and the phone already applies them locally first. They should join the queue rather than stay as a fire-and-forget call that the server subscription can overwrite.

These stay on the server. The three crons have no client. Calendar import needs Google and then writes tasks from an action. The image pipeline needs provider secrets, grants, and the webhook. The CLI is another writer, with its own idempotency keys, and it must keep working when the phone is offline or has a queue. The operation ledger and its undo live in Convex and expire there. [Ledger undo](../../convex/http.ts#L942-L953) Overdue reflow can keep running as a server mutation. It reads every owned task to place them, so it belongs with the server jobs, not in the outbox.

### The direction

I would do (a), then a small (c) only if offline reading is still a product requirement after the reads are thinner. I would not do (b). I could not find official persistence that avoids online reads. I would not do (d).

The first work is not a sync engine. It is one owner-scoped active-task query shared by the web board and the phone, instead of inbox plus timeline plus full corpus plus board. Completed history should be a separate query, and the open timeline should not subscribe to all of it. `listTodayCompletedTasks` is already that narrower query and nothing calls it. The image query should stop collecting every task and should stop calling `Date.now()` inside the query. Pass `observedAt` from the client, rounded, or store it on write. The CLI horizon and `agent context` should pass a status or a date bound that the HTTP route actually applies, instead of downloading every task and every image summary and filtering in Bun. `doctor` should not use a full task list as its reachability check. [Doctor read](../../packages/cli/src/commands.ts#L59)

That is all still Convex, still live, and it removes reads that a replica would otherwise have to duplicate.

If that is not enough and the phone must show tasks with no network, the first slice is tasks and goals on the phone only. Persist them in SQLite or in the AsyncStorage the app already uses. Extend the retry queue with idempotency keys so a lost response cannot double-create. Add one Convex table of task and goal changes, written by the mutations that already run, and have the phone pull "after cursor" when it reconnects. While it is online and caught up, a subscription to the recent end of that log can replace `listTasks`, `getTimeline`, and `listBoardTasks` on the phone. The web app can keep a normal Convex subscription until the same log is proven. Do not subscribe to both the log and the full lists.

I would not build that slice for images, calendar, or the CLI. I would not adopt PowerSync to avoid writing the log. The experimental connector wants a deploy key in a service I would then have to run, and Electric, Zero, and Replicache each want a different server than the one this app has.

### What stays true online

Web, phone, and CLI still see the same tasks after a queued write commits, because the commit is still a Convex mutation on `combative-zebra-261` and the other clients still subscribe or read. Live updates while connected stay. They are either the current query subscriptions, narrowed, or a subscription to the tail of the change log. Server jobs stay allowed to change tasks. A cron purge, a calendar import, an image webhook, or a CLI undo is just another mutation. If the log exists, that mutation writes a log row and the open clients apply it. If the log does not exist yet, they find out the way they do today, through the query that reads the task.

## Sources

Official pages opened on 2026-09-28:

- https://docs.convex.dev/understanding/
- https://docs.convex.dev/functions/query-functions
- https://docs.convex.dev/understanding/best-practices/
- https://docs.convex.dev/realtime
- https://docs.convex.dev/production/state/limits
- https://docs.convex.dev/production/integrations/log-streams/
- https://docs.convex.dev/client/react/
- https://docs.convex.dev/client/react/optimistic-updates
- https://docs.convex.dev/database/pagination
- https://docs.convex.dev/api/interfaces/server.QueryInitializer
- https://docs.convex.dev/api/interfaces/react.Watch
- https://docs.convex.dev/api/interfaces/react.ConvexReactClientOptions
- https://docs.convex.dev/api/modules/browser
- https://docs.convex.dev/database/backup-restore
- https://docs.convex.dev/deployment-api/data-sync
- https://docs.convex.dev/production/integrations/streaming-import-export
- https://docs.convex.dev/http-api
- https://docs.powersync.com/architecture/powersync-service
- https://docs.powersync.com/configuration/source-db/setup
- https://docs.powersync.com/handling-writes/writing-client-changes
- https://docs.powersync.com/usage/lifecycle-maintenance/handling-update-conflicts/custom-conflict-resolution
- https://docs.powersync.com/usage/lifecycle-maintenance/upgrading-the-client-sdk
- https://docs.powersync.com/client-sdk-references/javascript-web
- https://docs.powersync.com/resources/faq
- https://electric-sql.com/docs
- https://electric-sql.com/docs/guides/writes
- https://electric-sql.com/docs/guides/writing-your-own-client
- https://electric-sql.com/docs/api/config
- https://electric-sql.com/openapi
- https://zero.rocicorp.dev/
- https://zero.rocicorp.dev/docs/when-to-use
- https://zero.rocicorp.dev/docs/auth
- https://zero.rocicorp.dev/docs/mutators
- https://replicache.dev/
- https://doc.replicache.dev/concepts/how-it-works
- https://doc.replicache.dev/concepts/offline
- https://doc.replicache.dev/api/interfaces/ReplicacheOptions

Repo files opened for the claims above:

- [CONTEXT.md](../../CONTEXT.md)
- [docs/architecture.md](../architecture.md)
- [docs/adr/0002-local-windowed-task-reminders.md](../adr/0002-local-windowed-task-reminders.md)
- [docs/mobile-roadmap.md](../mobile-roadmap.md)
- [convex/schema.ts](../../convex/schema.ts)
- [convex/tasks.ts](../../convex/tasks.ts)
- [convex/taskLifecycle.ts](../../convex/taskLifecycle.ts)
- [convex/goals.ts](../../convex/goals.ts)
- [convex/taskImages.ts](../../convex/taskImages.ts)
- [convex/overdueReflow.ts](../../convex/overdueReflow.ts)
- [convex/crons.ts](../../convex/crons.ts)
- [convex/sync.ts](../../convex/sync.ts)
- [convex/syncActions.ts](../../convex/syncActions.ts)
- [convex/http.ts](../../convex/http.ts)
- [convex/automationTools.ts](../../convex/automationTools.ts)
- [src/components/AuthenticatedApp.tsx](../../src/components/AuthenticatedApp.tsx)
- [src/components/Settings.tsx](../../src/components/Settings.tsx)
- [src/hooks/useTaskBoardData.ts](../../src/hooks/useTaskBoardData.ts)
- [src/lib/convex.tsx](../../src/lib/convex.tsx)
- [src/lib/featureFlags.ts](../../src/lib/featureFlags.ts)
- [apps/mobile/App.tsx](../../apps/mobile/App.tsx)
- [apps/mobile/src/lib/convex.tsx](../../apps/mobile/src/lib/convex.tsx)
- [apps/mobile/src/hooks/useTaskQueries.ts](../../apps/mobile/src/hooks/useTaskQueries.ts)
- [apps/mobile/src/hooks/useConvexGoalsSync.ts](../../apps/mobile/src/hooks/useConvexGoalsSync.ts)
- [apps/mobile/src/hooks/useDisplayWorkspace.ts](../../apps/mobile/src/hooks/useDisplayWorkspace.ts)
- [apps/mobile/src/hooks/useWorkspaceSnapshot.ts](../../apps/mobile/src/hooks/useWorkspaceSnapshot.ts)
- [apps/mobile/src/hooks/useRetryQueue.ts](../../apps/mobile/src/hooks/useRetryQueue.ts)
- [apps/mobile/src/hooks/useTaskMutations.ts](../../apps/mobile/src/hooks/useTaskMutations.ts)
- [apps/mobile/src/hooks/useGoalMutations.ts](../../apps/mobile/src/hooks/useGoalMutations.ts)
- [apps/mobile/src/lib/workspace-snapshot.ts](../../apps/mobile/src/lib/workspace-snapshot.ts)
- [apps/mobile/src/lib/goalsStorage.ts](../../apps/mobile/src/lib/goalsStorage.ts)
- [apps/mobile/src/lib/retry-queue-storage.ts](../../apps/mobile/src/lib/retry-queue-storage.ts)
- [packages/cli/src/liveClient.ts](../../packages/cli/src/liveClient.ts)
- [packages/cli/src/liveCommands.ts](../../packages/cli/src/liveCommands.ts)
- [packages/cli/src/commands.ts](../../packages/cli/src/commands.ts)
