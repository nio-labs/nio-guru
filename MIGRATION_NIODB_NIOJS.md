# NioGuru integration with NioDB and NioJS

Analysis date: 2026-10-08. This document records the original source analysis. NioDB v1.0.5 now supplies the storage contracts, and NioGuru's Node/Hono persistence cutover is in progress. Initialize new NioDB storage directly.

The coordinated implementation checklist for all three repositories is [NIO_ALIGNMENT_PLAN.md](NIO_ALIGNMENT_PLAN.md).

## Decision

Replace SQLite/Drizzle with an asynchronous, typed NioDB repository. Introduce NioJS for portable request validation first, then run the Hono application on NioJS after Hono compatibility, database networking, and streaming capabilities are implemented and tested. Keep Hono as the application framework, including its routes and middleware. Keep Vue, the browser API shapes, conversation IDs, and native Nio session bindings intact.

The complete target is Vue → Hono application running on NioJS → NioDB, with a private Nio execution bridge for CLI processes, skill files, and attachment staging. The intermediate release uses the existing Hono/Node API to coordinate NioDB, NioJS validation, and the native Nio CLI.

## Repository evidence

- `git -C ../nio-db pull --ff-only` succeeded: already up to date. Reviewed branch `main`, commit `d985f94` (`feat(sessions): include handoff assessments in manifests`). Working tree was clean.
- Reviewed local nio-js commit `1219c67` (`fix: complete capsule deployment and native imports`); its working tree was clean. nio-js was inspected, not pulled.
- NioGuru persistence is concentrated in `apps/server/src/db/{index,schema}.ts` and the gurus, conversations, and chat routes. All existing database calls are synchronous. Guru deletion uses a Drizzle transaction; chat completion currently saves synchronously before emitting `done`.
- NioDB implements record create/get/patch/delete, collection listing, bulk operations, and parameterized read-only SQL in `../nio-db/src/api.rs`. `../nio-db/src/query.rs` has a native SQL path and an AlaSQL subprocess fallback. PostgreSQL wire compatibility does not establish compatibility with SQLite/Drizzle writes.
- `../nio-db/src/storage.rs` stages bulk inserts in one journal batch. Bulk updates and deletes loop through individual commits. Mixed operations are not a replacement for the existing transaction.
- The supplied SDK is `@nio-labs/nio-db.js`, locally version `1.0.4`. Its `query(sql)` method does not expose server-supported bound parameters. Its collection client returns record envelopes rather than the app's row shapes.
- `../nio-js/runtime/bootstrap.js` explicitly rejects outbound methods other than GET and rejects custom headers, bodies, and signals. `runtime/nio.js` exports GET/POST route registration, replies, and embedded assets, but no database client or SSE response API. The roadmap lists streaming and database integration as future work.

## Storage model and compatibility

Use dedicated collections in a NioGuru-owned workspace/server, rather than generic names that might collide with other apps:

| Entity | NioDB collection | Application fields |
| --- | --- | --- |
| gurus | `nioguru_gurus` | Guru ID, metadata, pin/custom flags, instructions, skills, sample prompts, timestamps |
| conversations | `nioguru_conversations` | Conversation ID, Guru ID, title, model, pin flag, timestamps |
| messages | `nioguru_messages` | Message ID, conversation ID, role, content, thought, tools, attachment metadata, timestamp |
| settings | `nioguru_settings` | Setting key, value, timestamp; initialize defaults when needed |

NioDB generates its own record IDs. Store the application ID as `appId`, references as `guruId` and `conversationId`, and timestamps as numeric `createdAt`/`updatedAt`. NioDB SQL projections reserve `id`, `created_at`, and `updated_at` for server metadata, so application identity and timestamps must use separate fields. Decode envelopes into the existing public `id` and timestamps, keeping the NioDB record ID private for PATCH/DELETE.

Store skills, prompts, tool calls, and attachment metadata as JSON arrays and booleans as booleans. Validate these types on writes. Use numeric application message timestamps and `appId` as the pagination tie breaker, independently of server metadata.

Define typed repository methods for Guru lookup/list/create/update/delete, conversation lookup/list/create/update/delete, message pages and previews, settings, and seeding. Route handlers must not construct arbitrary SQL or depend on SDK envelope details. Use fixed collection identifiers and bound parameters through a small HTTP query adapter, or add parameter support to the shared SDK before adoption. Pin the tested SDK version; sibling paths are for development only, not published dependencies.

NioDB has no verified unique constraint on `data.appId` or foreign-key/cascade enforcement. Before enabling persistence, implement atomic application-key uniqueness and reference validation in NioDB, or an equivalent tested server-side mutation API. A process-local map alone cannot guarantee uniqueness across restarts or multiple API instances.

## Required behavior

1. **Message pages:** execute a bound query filtered by conversation ID, ordered by `createdAt DESC, appId DESC`, with 31 rows. Apply the existing `(createdAt < beforeAt) OR (createdAt = beforeAt AND appId < beforeId)` cursor, return 30 rows in chronological order, and preserve `hasMore`. Verify both native SQL execution and any required AlaSQL fallback with the exact queries; do not fetch the entire collection to paginate.
2. **Sidebar previews:** obtain latest messages and Guru summaries in bounded queries, avoiding one HTTP lookup per conversation/Guru. Measure latency and query limits with realistic history sizes. Add a durable summary projection only if those measurements justify it; define repair behavior if introduced.
3. **Seeding:** preserve custom Gurus, pin choices, and edited skill lists. Use stable application IDs and idempotent create requests.
4. **Deletion:** preserve atomic deletion of a custom Guru and its conversations/messages. Add a validated NioDB transaction/batch mutation that commits all effects in one journal frame, including cross-collection deletes. Test crash recovery and limits. For deletion sets larger than one supported batch, specify a durable deletion-job/tombstone protocol before release; repeatedly calling current bulk delete is insufficient.
5. **Chat durability:** await user-message persistence before starting Nio, and await assistant persistence before sending `done`. Persistence failure must produce an explicit recoverable error, rather than a successful completion with missing history. Assign stable message IDs before the run and serialize terminal events so done/error/cancel/abort cannot create duplicate assistant messages.
6. **Concurrency:** acquire the active conversation run before asynchronous validation/storage operations and release it in `finally`. The current synchronous checks acquire the run later; converting reads to HTTP introduces an overlap window. Reject deletes while a conversation is active, including deletion through the conversation endpoint. Multiple API instances require a shared lease or an explicitly enforced single-instance deployment.
7. **Retries:** bound request timeouts, translate upstream failures, and retry only operations with proven retry semantics. NioDB single-record create supports an idempotency key, while SDK bulk methods do not supply one. Reusing a create key with changed data conflicts; after a record is edited, do not use that key as an upsert. Use application-key uniqueness and explicit updates for existing records.
8. **Attachments and sessions:** retain metadata-only attachment history and private temporary upload cleanup. Preserve the current Nio session ID derived from the conversation. NioDB's own sessions/bridge APIs are separate features and must not silently replace Nio CLI session semantics.

## NioJS adoption

### First usable integration

Extract small pure validation/normalization functions into a portable package with no Node imports: Guru field bounds and normalization, public conversation update validation, and message cursor validation. Run the same fixtures in Node and NioJS to verify behavior.

Build a NioJS capsule exposing those functions through bounded POST endpoints and a health route. The Hono API calls this private service; the capsule needs no outbound networking, filesystem access, database credentials, or Nio process access. Keep skill availability checks, persistent writes, password enforcement, and active-run coordination in the API. Avoid invoking the worker for every chat token. Measure the extra request cost and make this phase a compatibility proof, not a performance claim.

Build the capsule in CI, include it in release artifacts, and have the launcher supervise it using a configurable `NIO_JS_BIN`. Use loopback/private binding, readiness checks, and coordinated shutdown. Restrict remote access to the worker. Test the exact built capsule and runtime version, including memory/body/deadline limits. Frontend static assets can later be embedded after proving Vue asset URLs, MIME types, SPA fallback, and capsule size limits.

### Gate for running Hono on NioJS

Implement and verify these capabilities in nio-js before switching the Hono application from the Node server adapter to the NioJS server adapter:

- Authenticated outbound GET/POST/PATCH/DELETE, request bodies, deadlines/cancellation, and host-level network grants for NioDB.
- SSE responses with incremental flush, backpressure, abort propagation, and long-lived turn handling.
- A fetch-handler server adapter dispatching HTTP requests to Hono `app.fetch`, including PUT/DELETE. Keep routing and middleware in Hono.
- Request/Response, Headers, URL, body parsing, multipart, stream, and abort interfaces compatible with the Hono APIs used by this app. Verify authentication, CORS, errors, body limits, and `streamSSE` through the adapter.
- Runtime configuration/secret injection without embedding credentials in capsules.
- A private execution bridge for spawning/stopping Nio, reading skill metadata, installing skills, and temporary attachment files. Specify its authentication, limits, and cleanup lifecycle.
- Shared run/lease ownership across workers: NioJS has multiple QuickJS workers, so an in-memory map in one worker cannot coordinate every request.
- Upload limits matching the current app (up to 20 MB plus request overhead), static asset delivery, and all current route/error contracts.

These are separate upstream deliverables. Native FFI is not a shortcut for recreating unrestricted Node subprocess/filesystem behavior. Keep Hono as a runtime dependency. After switching its server adapter, retain Node where NioDB's AlaSQL fallback requires it unless those exact query workloads have a verified replacement.

## Fresh-project initialization

Start with a new, dedicated NioDB workspace/server. Configure `NIODB_URL` and server-only `NIODB_TOKEN`, verify connectivity and required database capabilities, and initialize collection constraints before accepting requests.

Seed built-in Gurus and settings idempotently using stable application IDs. Start conversations and messages empty. Repeated startup must preserve any custom Gurus, pin choices, and skill edits created after initialization. Verify that restarting services retains newly created data.

## Implementation order

| Phase | Deliverable | Completion gate |
| --- | --- | --- |
| 1 | Exact API/query contract fixtures; upstream uniqueness/reference/atomic-delete work; SDK bound-query support | Real NioDB tests establish required semantics |
| 2 | Typed NioDB repositories; async startup/routes/chat persistence | Existing browser API and stream behavior preserved |
| 3 | Fresh workspace initialization and idempotent seeding | Empty setup and repeated startup work correctly |
| 4 | Portable validation package and supervised NioJS capsule | Matching validation results and measured request cost |
| 5 | Launcher, Docker, Railway, CI, packaging, docs | Fresh install and persistent restart work from built artifacts |
| 6 | NioJS networking/SSE/Hono adapter/execution bridge, then run Hono on NioJS | Hono middleware, full chat, uploads, cancellation, skills, and CRUD pass on NioJS |

Phase 1 is the first implementation step. A short integration spike should settle query compatibility, mutation guarantees, SDK packaging, and runtime constraints before rewriting all routes. Phases 2–5 deliver a SQLite-free app with a concrete NioJS integration; phase 6 completes the intended runtime architecture.

## Deployment and checks

Use server-only `NIODB_URL` and `NIODB_TOKEN`; never put backend tokens in Vue or capsule assets. Preserve the app's access model during integration. Add readiness that distinguishes application liveness from database availability, and await connectivity/capability checks/seeding before accepting requests.

Support an externally managed NioDB and a locally supervised instance. The local launcher must initialize credentials privately, wait for readiness, avoid adopting an unrelated listener, and shut down only child processes it owns. Mount the NioDB data directory persistently in containers; Remove `DATABASE_PATH` from the application configuration; use NioDB connection settings and its persistent data directory. Update Docker/compose and Railway instructions for the additional process/service and persistent directory.

Remove better-sqlite3, its types/build allowance, Drizzle ORM/kit, and SQLite schema from the runtime dependency graph, including root publish dependencies. Update the lockfile, README, PLAN, launcher, Docker environment, and release file list. Build Vue with the existing tooling; using NioJS as an application runtime does not itself replace Vite/pnpm.

Required acceptance checks:

- Guru CRUD/pinning/skills/seeding and protected built-in deletion.
- Conversation model/title/pinning, ordered previews, timestamp-tied message pages, and empty/missing records.
- Chat done/error/cancel/disconnect paths with delayed/unavailable NioDB, concurrent requests, stable message IDs, and no success before durable save.
- Atomic deletion and restart/crash recovery; application-key uniqueness and reference enforcement.
- Fresh workspace initialization, idempotent seeding, large newly generated histories, and persistence after restart.
- Actual NioDB HTTP/query integration, Node/NioJS validation parity, Hono fetch-handler and middleware compatibility, built capsule launch, packaged npm launch, persistent-volume restart, and graceful shutdown.

This analysis reviewed source and repository status. It did not start services, execute integration tests, or assert that the proposed upstream features already exist.
