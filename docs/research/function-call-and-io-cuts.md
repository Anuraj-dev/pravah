# Function calls, database I/O, and the image wait

Scope. This note turns the September 2026 Convex usage for `plan-timeline` into a cut list. It covers schema, which subscriptions run before a tab is opened, auth token lifetime, CLI credential checks, and the image upload wait. It changes no product code.

Figures were read on 2026-09-28 from the Convex usage query for team `atulya-rai`, project `plan-timeline`, billing window 2026-09-01 through 2026-09-30. Today is the 28th, so this is month-to-date. The query id is the dashboard's function breakdown, `76c86baa-418e-4d7f-ac21-46f397030595`. Passing `deploymentName=combative-zebra-261` still returned dev snapshot rows, so prod and dev are separated by the `deploymentType` column on each row, not by that filter.

## Executive finding

Lazy tabs are the right trade, and a week-long login is the wrong one. The login session already lasts 7 days. The token that actually re-runs queries is the Convex JWT, and the plugin default for that is 15 minutes.

For this month the function-call chart and the database I/O chart are different problems. `automation.js:resolveAutomationCredential` is the call leader at 1,181 calls and only 0.42 MB of database I/O. The I/O leaders, ignoring snapshot import and export, are `tasks.js:listTasks` at 13.5 MB, `overdueReflow.js:preview` at 11.0 MB, and `taskImages.js:listWorkspaceImageCollections` at 7.8 MB.

App functions account for about 44 MB of database I/O. Snapshot import and export account for about 74 MB of the 119 MB in the breakdown. Leave the import and export rows out of the optimization. They are data moves, not the app.

I would subscribe to the screen the user is on, and skeleton the rest. I would not keep the phone's full task corpus, completed history, goals, and every image collection live for a session that never opens those screens. I would lengthen the Convex JWT to a day and turn on token reuse. I would not lengthen the login session. It is already a week.

## What September actually billed

5,431 function calls across 66 functions. Database I/O on those rows is 118,877,654 bytes, about 119 MB. The rows below are prod unless noted.

| Function | Calls | Database I/O |
|---|---:|---:|
| `automation.js:resolveAutomationCredential` | 1,181 | 0.42 MB |
| `/tasks` | 640 | 0 |
| `automationTools.js:listTasks` | 640 | 2.7 MB |
| `automation.js:markCredentialUsed` | 388 | 1.0 MB |
| `/automation/credential` | 381 | 0 |
| `tasks.js:listTasks` | 220 | 13.5 MB |
| `sync.js:getIntegrationStatus` | 136 | 0.03 MB |
| `overdueReflow.js:preview` | 105 | 11.0 MB |
| `goals.js:list` | 91 | 0.72 MB |
| `mobileReleases.js:getState` | 87 | 0.02 MB |
| `/goals` and `/goal-links` | 80 each | 0 |
| `automationTools.js:listGoals` and `listGoalLinks` | 80 each | 0.09 MB and 0.51 MB |
| `taskImages.js:listWorkspaceImageCollections` | 78 | 7.8 MB |
| `tasks.js:getTimeline` | 77 | 3.5 MB |
| `mobileReleases.js:listPublished` | 75 | 0.62 MB |
| `goals.js:listLinks` | 68 | 1.8 MB |

`tasks.js:listBoardTasks` is not in the top 20 by calls or by bytes. The web board is not the September hotspot. The phone subscriptions and the CLI are.

The 1,181 credential resolves match the bearer HTTP routes exactly. 640 task lists, 80 goal lists, 80 goal-link lists, and 381 credential checks add up to 1,181. Every CLI HTTP request runs that query once. [Resolver](../../convex/automationHttpAuth.ts#L42-L44)

Snapshot rows, kept separate: dev import 36.8 MB, prod import 24.7 MB, prod export 12.1 MB, plus a CLI table dump and two small Better Auth imports. Together those are about 74 MB. They are `_system_job/snapshot_import` and `_system_job/snapshot_export`.

## Subscribe when the tab opens

The phone already has the skip switch. Production does not use it. `App.tsx` passes `includeAllTasks: true` for the whole session, and the comment says the full corpus avoids a round trip when Goals, Progress, or Kairo open. [Call](../../apps/mobile/App.tsx#L302-L308) [Hook](../../apps/mobile/src/hooks/useTaskQueries.ts#L65-L93) Goals stay subscribed for the whole session too, and the server rows are copied into AsyncStorage. [Goals hook](../../apps/mobile/src/hooks/useConvexGoalsSync.ts#L7-L46) Image collections are in the same always-on hook. Overdue preview is already skipped off the timeline tab. [Gate](../../apps/mobile/App.tsx#L482-L485)

`"skip"` does not talk to the backend. [React client](https://docs.convex.dev/client/react/#skipping-queries) A skeleton on a tab the user never opens costs zero database I/O. The first visit pays one query. That is the latency trade, and it is the correct one for Goals, completed history, the full corpus, image collections, release history, and the integration status that Settings needs.

Do not skeleton the tab the user is standing on. Timeline should keep one live query. The win is deleting the other live queries, not delaying the one they can see.

What that is worth, as a ceiling, if those subscriptions stop while the screen is closed:

- Overdue preview, 105 calls, 11.0 MB. This one is already tab-gated, so the remaining cut is to run it when they ask to reflow, not for the whole time Timeline is open. `loadOwnedState` collects every goal, every goal link, and every task. [Load](../../convex/overdueReflow.ts#L164-L180)
- Image collections, 78 calls, 7.8 MB. The timeline cards need images for visible tasks. They do not need every owned task and every upload document on launch.
- Goals list plus goal links, 0.72 MB and 1.8 MB. The phone hook is not waiting for the Goals tab.
- `getTimeline`, 77 calls, 3.5 MB, once something else already holds the active tasks.
- `listPublished`, 75 calls, 0.62 MB. A release check can wait.

Those rows are about 25 MB of the 44 MB of app I/O. That is the part I would take before touching schema.

`tasks.js:listTasks` is the leftover 13.5 MB, and the dashboard does not split it by arguments. The phone calls it three ways at once: inbox, completed, and the unfiltered owner set. Inbox reads the empty-deadline range and the legacy inbox status. Completed reads every `completedAt`. The unfiltered call reads `by_owner` and collects every task. [Branches](../../convex/tasks.ts#L319-L355) Skipping completed and the full corpus until those screens open removes two of the three. I will not divide 13.5 MB by three and pretend that is the measurement. The next billing period will show the split.

Web Kairo already skips its unfiltered `listTasks` until Kairo opens. Settings queries mount with the sheet. That pattern is the one to copy onto the phone. [Web subscriptions](../../src/components/AuthenticatedApp.tsx#L69-L73)

## Schema

Dropping indexes will not move the 13.5 MB. Convex bills each index as another copy of the table toward storage, and writes have to update every index. A table with three indexes uses about four times its document size. [Redundant indexes](https://docs.convex.dev/understanding/best-practices/#check-for-redundant-indexes)

`tasks` has sixteen indexes. Several are prefixes of a longer one. `by_owner_status` is a prefix of `by_owner_status_date`, which is a prefix of `by_owner_status_date_position`. The same is true of `by_owner_deadline` and `by_owner_deadline_position`. [Indexes](../../convex/schema.ts#L276-L291) Convex says you only need the longer index. That cuts storage and write cost. It does not stop `listTasks` from collecting the completed range.

The read-shape problem is different. The hot queries collect a wide index range and then drop rows in JavaScript. `listTasks` with no filter collects the owner. `getTimeline` collects the deadline range through `9999-12-31`. Preview collects the owner again. Completed tasks that still have a deadline sit in that deadline range and get discarded by `isTimelineTask`. An index does not help a query that asks for every deadline.

The schema change that cuts I/O is a query that can see active tasks without reading completed and cancelled ones. The completed screen keeps `by_owner_completed_at`. The board stops using the unfiltered owner scan and the open-ended deadline scan. Legacy `status` indexes can go once the purge cron and the legacy branches stop reading them. The purge still uses the ownerless `by_status` index. [Purge index](../../convex/tasks.ts#L1125)

I would do the subscription cuts first, then delete the prefix indexes that no query references. I would not rewrite the task documents for this.

## Auth, and why a longer login does nothing

`createAuth` does not set a session lifetime. Better Auth's default is 7 days, with `updateAge` of one day. [Plugin call](../../convex/auth.ts#L26-L51) [Default](../../node_modules/better-auth/dist/context/create-context.mjs#L142-L145) Raising that to a week changes nothing. Raising it past a week only changes how often someone has to sign in with Google.

The Convex JWT is a different clock. `@convex-dev/better-auth` defaults `jwtExpirationSeconds` to 15 minutes, and Pravah does not override it. [Default](../../node_modules/@convex-dev/better-auth/src/plugins/convex/index.ts#L176-L177) Both clients construct `ConvexReactClient` with `expectAuth: true` and do not set `initialAuthTokenReuse`. [Web](../../src/lib/convex.tsx#L6-L8) [Phone](../../apps/mobile/src/lib/convex.tsx#L12-L14)

Convex's default for that flag is false. The docs say the default fetches a fresh token after the cached token is confirmed, and that extra authenticate message makes the server re-execute every authenticated query. The flag that skips this is marked experimental. [Option](https://docs.convex.dev/api/interfaces/react.ConvexReactClientOptions#initialauthtokenreuse) Log streams name that rerun `identityChange`, next to `initialSubscription` and `dataChange`. [Run reasons](https://docs.convex.dev/production/integrations/log-streams/)

So a phone that stays open re-reads `listTasks`, `getTimeline`, preview, and the image collections about four times an hour, on top of real edits. I cannot subtract those from the 220 `listTasks` calls. The usage table does not include `run_reason`. A log stream would.

I would set the JWT to one day and set `initialAuthTokenReuse: true`. A week-long JWT is a bad fit. Convex trusts the token until it expires. Logout and revocation would not stop queries until the token dies. One day matches how long you asked to stay signed in, and it still bounds a stolen token. The 7-day login session can stay as it is.

This cuts `identityChange` reruns. It does not cut a `dataChange` rerun when a task is edited. Cached reads of the same function and the same arguments are not charged database bandwidth. Different functions are different cache keys. [Realtime cache](https://docs.convex.dev/realtime)

## CLI and the 1,181 credential calls

The call count is real and the bytes are small. 1,181 resolves moved 0.42 MB. `markCredentialUsed` moved 1.0 MB across 388 calls. Together they are about 3% of app I/O and about 29% of the function calls in the breakdown.

The query calls `Date.now()` to decide whether usage should be written. [Interval](../../convex/automation.ts#L405-L424) Convex says `Date.now()` inside a query invalidates the cache more often than a stable argument, and the database does extra work because of it. [Date.now](https://docs.convex.dev/understanding/best-practices/#date-in-queries) That fits the bytes. 0.42 MB over 1,181 calls is a few hundred bytes each, which is a document read, not a cache hit. Take `Date.now()` out of the query. Let the HTTP action compare `lastUsedAt` with the clock. The bytes should collapse. The 1,181 calls stay, because each HTTP action still calls `runQuery`. Cached `runQuery` results can still count as function calls. The daily chart separates `cached_query` from `uncached_query`, and both are function calls.

The 381 `/automation/credential` calls are the CLI scope refresh. It rechecks the server when the stored check is older than 5 minutes, and writes always force a check. [Interval](../../packages/cli/src/commands.ts#L19-L39) For a single-user CLI, a day is enough. A revoked key would keep working until the next check. A day is a reasonable bound. A week is longer than I would leave a revoked agent key alive. Stretching 5 minutes to a day removes most of those 381 calls, and each one currently drags a credential resolve with it.

`automationTools.js:listTasks` is 640 calls and 2.7 MB. The average is about 4 KB a call, so a lot of those are cheap or cached. The CLI still asks for the unfiltered owner set unless `--date` is set, then filters the horizon in process. Server-side status and date bounds cut bytes on the uncached calls. They do not cut the 640 calls unless the agent polls less. `doctor` still proves the endpoint with `listTasks({})`. [Doctor](../../packages/cli/src/commands.ts#L59)

## Images

The file already goes straight to Cloudinary. The phone builds a multipart POST to `grant.uploadUrl`, which the grant sets to `https://api.cloudinary.com/v1_1/.../image/upload`. [Upload](../../apps/mobile/src/lib/taskImageNative.ts#L387-L411) [Grant URL](../../convex/taskImageProvider.ts#L312-L315) Convex never holds the image bytes.

The wait is the ready gate. The signed upload sets `eager_async` to true, so Cloudinary accepts the master and generates the card and detail WebP variants later. [Eager flag](../../convex/taskImageProvider.ts#L289-L295) The client's verify call is not allowed to mark the row ready from the upload response. The comment says the upload signature authenticates `public_id` and version, and only the signed webhook may attest the variants. Verify writes `state: "verifying"`. [Verify](../../convex/taskImageActions.ts#L460-L492) Ready requires both variants. [Ready patch](../../convex/taskImages.ts#L419-L428) A verifying upload is failed after 10 minutes if the webhook has not finished the job. [Stale window](../../convex/taskImages.ts#L441-L449)

I do not have a measured typical wait. The code allows that verifying state to last until the webhook, and it gives up at 10 minutes. That matches a wait of minutes. It is not the transfer.

What I would change:

Show the local file in the filmstrip the moment the picker returns. The upload can finish behind that. Mark the row ready when the master upload verifies, and let the card and detail variants fill in when the webhook arrives. The user should not sit on Verifying until Cloudinary finishes two transforms. Keep the webhook. It is the right place to trust variant metadata. It is the wrong place to block the thumbnail the phone already has on disk.

For the offline cache, the delivery URL is stable. It is an authenticated Cloudinary path signed from the public id and version, with no expiry in the URL. [Delivery URL](../../convex/taskImageProvider.ts#L539-L555) The filmstrip and the viewer set `cachePolicy="memory"`, so the decoded image dies with the process. [Filmstrip](../../apps/mobile/src/components/TaskImageFilmstrip.tsx#L238) `memory-disk` on that stable URL keeps the bytes across restarts. A signed URL that changes every view would miss. This one does not.

`resolveTaskImage` was not in the top 20, so image delivery is not the September I/O problem. The 7.8 MB is `listWorkspaceImageCollections`, which collects every owned task and every image row while the session is open. Lazy-load that query. Do not pipe uploads through Convex to save it.

## How to know the next month worked

Convex already stores a per-execution record. A log stream event has `database_io_read_bytes`, `database_read_documents`, and `run_reason`. `identityChange` is the token refresh. `initialSubscription` is a screen starting a query. `dataChange` is a real edit. `cached` is on the function record. [Log streams](https://docs.convex.dev/production/integrations/log-streams/) That is the server-side per-call log. The dashboard rollup I used cannot see it.

The phone already has a diagnostic log in AsyncStorage. It keeps 10,000 events, caps them at 20 MB, and drops them after 36 hours. [Limits](../../apps/mobile/src/lib/diagnostics.ts#L25-L29) Thirty-six hours is too short for a before-and-after of these cuts. It also does not record the Convex function name. I would add a small event when a subscription starts or skips, with the function name and the screen, and keep that log for a couple of weeks. Redact titles the way the current log already does. Export it next to a log stream from the same days. The client log says which tab was open. The log stream says how many bytes that tab's query read, and whether the run was a token refresh.

## What I would change, in order

1. On the phone, skip the full corpus, completed list, goals, goal links, and image collections until that screen is open. Put a skeleton on the empty screen. Timeline keeps one query.
2. Run overdue preview when they ask to reflow, not for the whole time Timeline is mounted. That is the 11 MB row.
3. Make the remaining board query read active tasks only, so completed rows are not inside `listTasks` and `getTimeline`.
4. Move the CLI credential recheck from 5 minutes to a day. Remove `Date.now()` from `resolveAutomationCredential`.
5. Set the Convex JWT to one day and set `initialAuthTokenReuse: true`. Leave the 7-day login session alone.
6. Delete task indexes that are prefixes of a longer index, after nothing queries them. That is storage and write cost.
7. Show the local image immediately, mark ready on the verified master, and cache the delivery image on disk.

I would not expect step 4 or step 5 to move the database I/O chart by much. Step 4 moves the function-call chart. Steps 1 through 3 are the I/O chart. Step 7 is the wait you feel, which is not on either chart.

## Sources

Usage query, opened 2026-09-28, billing window 2026-09-01 to 2026-09-30, project `plan-timeline`:

- Dashboard function breakdown query `76c86baa-418e-4d7f-ac21-46f397030595`
- https://docs.convex.dev/client/react/
- https://docs.convex.dev/realtime
- https://docs.convex.dev/understanding/best-practices/
- https://docs.convex.dev/api/interfaces/react.ConvexReactClientOptions
- https://docs.convex.dev/production/integrations/log-streams/
- [convex/tasks.ts](../../convex/tasks.ts)
- [convex/schema.ts](../../convex/schema.ts)
- [convex/overdueReflow.ts](../../convex/overdueReflow.ts)
- [convex/automation.ts](../../convex/automation.ts)
- [convex/automationHttpAuth.ts](../../convex/automationHttpAuth.ts)
- [convex/auth.ts](../../convex/auth.ts)
- [convex/taskImages.ts](../../convex/taskImages.ts)
- [convex/taskImageActions.ts](../../convex/taskImageActions.ts)
- [convex/taskImageProvider.ts](../../convex/taskImageProvider.ts)
- [src/lib/convex.tsx](../../src/lib/convex.tsx)
- [src/components/AuthenticatedApp.tsx](../../src/components/AuthenticatedApp.tsx)
- [apps/mobile/App.tsx](../../apps/mobile/App.tsx)
- [apps/mobile/src/lib/convex.tsx](../../apps/mobile/src/lib/convex.tsx)
- [apps/mobile/src/hooks/useTaskQueries.ts](../../apps/mobile/src/hooks/useTaskQueries.ts)
- [apps/mobile/src/hooks/useConvexGoalsSync.ts](../../apps/mobile/src/hooks/useConvexGoalsSync.ts)
- [apps/mobile/src/lib/diagnostics.ts](../../apps/mobile/src/lib/diagnostics.ts)
- [apps/mobile/src/lib/taskImageNative.ts](../../apps/mobile/src/lib/taskImageNative.ts)
- [apps/mobile/src/components/TaskImageFilmstrip.tsx](../../apps/mobile/src/components/TaskImageFilmstrip.tsx)
- [packages/cli/src/commands.ts](../../packages/cli/src/commands.ts)
- `node_modules/better-auth/dist/context/create-context.mjs`
- `node_modules/@convex-dev/better-auth/src/plugins/convex/index.ts`
