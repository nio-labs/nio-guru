# Coordinated nio-js, nio-db, and nio-guru implementation plan

Date: 2026-10-08

Status: agreed direction, implementation pending. This is the shared plan for changes across all three repositories. The initial source analysis and integration details are in [MIGRATION_NIODB_NIOJS.md](MIGRATION_NIODB_NIOJS.md).

## Intended result

NioGuru uses NioDB for all live persistence and keeps Hono as its application framework. Vue remains the frontend. The runtime target is Vue → Hono running on NioJS → NioDB. A private Nio execution bridge handles native CLI turns, skills, and temporary attachments. This is a new project: initialize fresh NioDB storage and seed built-in Gurus. Conversation-bound Nio sessions continue to use the application conversation ID.

Deliver this in compatible releases. First make NioDB support the app's persistence guarantees, then implement NioGuru storage while developing the missing NioJS capabilities. Introduce the portable validation capsule described in the analysis as the first NioJS integration. Run the Hono application on NioJS once Hono compatibility, streaming, networking, and execution-bridge integration pass acceptance checks. Keep the Hono routes and middleware throughout.

## Shared contracts to establish first

These are proposed contracts to implement and test, not claims about existing APIs. Final endpoint names and limits must be recorded in the owning repository's API documentation before consumers adopt them.

| Contract | Provider | Consumers | Required behavior |
| --- | --- | --- | --- |
| Record identity | nio-db | SDK, nio-guru | Server record ID is separate from stable application `appId`; uniqueness is enforced atomically per collection |
| Bound queries | nio-db and its JS SDK | nio-guru, nio-js | `query(sql, parameters)` preserves existing one-argument calls and never interpolates user values |
| Atomic mutations | nio-db | SDK, nio-guru | Validate all operations and references before committing one durable journal frame; failure commits nothing |
| Conversation ownership | nio-db | nio-guru execution bridge | Atomic lease acquisition, renewal, expiry, release, and fencing so expired owners cannot persist a competing turn |
| HTTP client | nio-js | NioDB SDK, execution bridge | Authenticated methods, headers, JSON/binary bodies, response status, deadlines, cancellation, and bounded response reads |
| Stream transport | nio-js | nio-guru, execution bridge | Incremental SSE delivery, bounded buffering/backpressure, cancellation, and ordered terminal events |
| Runtime configuration | nio-js | nio-guru | Operator-provided configuration and secrets at runtime; secrets excluded from capsules and logs |
| Hono runtime adapter | nio-js | Hono, nio-guru | Dispatch requests to `app.fetch` with compatible Request/Response, headers, bodies, streams, and abort signals |
| Public app API | nio-guru | Vue | Existing routes, response fields, status codes, cursor semantics, uploads, and stream event names preserved |

Use `NIODB_URL`, `NIODB_TOKEN`, `NIO_JS_BIN`, and `NIO_BIN` consistently. Define and document execution-bridge connection/authentication configuration during its implementation. Keep credentials in private runtime configuration.

## nio-db changes

- [ ] Add collection-level application-key uniqueness suitable for `appId`, including rebuild/recovery of any indexes. Existing record updates must not bypass it.
- [ ] Add configurable reference validation for conversation → Guru and message → conversation. Define how reference checks interact with deletion and a transaction's staged state.
- [ ] Add an explicit atomic mutation API for cross-collection creates, updates, and deletes. Preserve legacy bulk API behavior for existing consumers rather than silently redefining it.
- [ ] Persist transaction idempotency keys and request fingerprints so an acknowledgement lost after commit can be retried without duplicating effects. Document conflict and expiry semantics.
- [ ] Handle large cascade deletion through a bounded atomic operation or durable deletion job. If jobs are needed, mark the parent inaccessible atomically, reject new children, resume cleanup after restart, and report completion accurately.
- [ ] Add atomic conversation leases with fencing. Validate lease ownership in writes that complete a chat turn and in conflicting deletion operations; a lease record without enforced checks is insufficient.
- [ ] Verify bound message cursor queries and bounded preview queries. Keep native and AlaSQL paths consistent for fields, types, ordering, and results.
- [ ] Extend `@nio-labs/nio-db.js` with typed bound query parameters, atomic mutation/lease methods, stable error handling, and timeout/cancellation options.
- [ ] Make the SDK consumable as ESM by nio-js while preserving the existing package's Node consumer compatibility. Verify imports from the built package rather than assuming the current module shape works.
- [ ] Document all new endpoints, limits, error codes, and recovery behavior in OpenAPI, SDK docs, and the repository README.

Acceptance: simultaneous duplicate creates admit one application identity; invalid references and failed transactions leave no partial changes; crash recovery replays committed batches completely; retry after a lost response is safe; expired owners cannot finalize turns; exact app queries pass against a real server.

## nio-js changes

- [ ] Extend outbound fetch to support GET/POST/PUT/PATCH/DELETE, custom headers, request bodies, and cancellation/deadlines with bounded resource use.
- [ ] Preserve destination grants, redirect checks, and private-network opt-in for every request. Specify credential handling across redirects.
- [ ] Support reading streamed upstream responses so the app can forward Nio execution events without buffering an entire turn.
- [ ] Add SSE response support with immediate flush, bounded queues, backpressure, client-abort propagation, and cleanup on shutdown.
- [ ] Separate short handler execution budgets from long-lived asynchronous stream lifetime; cancellation must still terminate pending work.
- [ ] Add a fetch-handler server adapter that dispatches every HTTP method to Hono `app.fetch`, including PUT/DELETE, and returns its Response without duplicating routing. Implement the Request/Response, Headers, URL, body, stream, and abort interfaces exercised by Hono.
- [ ] Verify Hono middleware and helpers for authentication, CORS, errors, body limits, multipart parsing, and `streamSSE` against the runtime adapter.
- [ ] Provide documented runtime configuration access for NioDB and execution-bridge credentials without embedding them in build artifacts.
- [ ] Support the app's upload envelope: up to 20 MB of attachments plus request overhead, with per-file/count checks. Test memory usage with multiple simultaneous uploads.
- [ ] Provide static asset delivery and SPA fallback with correct MIME types and bounded asset sizes, or document a separate supported frontend server.
- [ ] Publish the APIs/types needed by the portable validation capsule and full NioGuru application capsule.
- [ ] Verify the NioDB SDK using ESM imports, authenticated reads/writes, bound queries, atomic operations, and leases inside an actual capsule.
- [ ] Document worker isolation: persistent run coordination belongs in NioDB/the execution bridge, not a JavaScript map local to one QuickJS worker.

Acceptance: authenticated NioDB operations work under explicit network grants; SSE tokens arrive before turn completion; slow/disconnected clients release resources; uploads stay within limits; worker recycling cannot duplicate a run or lose ownership; built capsules contain no runtime secrets.

## nio-guru changes

- [ ] Capture current browser API and SSE behavior as contract fixtures before changing persistence.
- [ ] Define portable entity types and validation. Use `nioguru_gurus`, `nioguru_conversations`, `nioguru_messages`, and `nioguru_settings` collections.
- [ ] Implement typed asynchronous repositories over the tested NioDB SDK. Translate private record IDs into public application IDs; keep numeric application timestamps separate from NioDB metadata.
- [ ] Convert initialization, seeding, all CRUD routes, message pagination, and sidebar previews to awaited repository calls.
- [ ] Use atomic mutations for coupled writes and deletion. Keep built-in Guru protection and user-selected skill lists intact.
- [ ] Acquire conversation ownership before asynchronous turn preparation. Use stable message IDs, lease fencing, and one serialized finalization path for done/error/cancel/disconnect.
- [ ] Persist user messages before executing Nio and assistant messages before emitting successful completion. Surface persistence failures explicitly.
- [ ] Initialize a fresh NioDB workspace with constraints and idempotent built-in Guru/settings seeding; conversations and messages start empty.
- [ ] Introduce the NioJS portable validation capsule and test Node/NioJS parity. Keep database writes and run coordination in the current API during this phase.
- [ ] Extract native Nio execution into a private bridge with authenticated start/stop/status/event operations. It owns CLI processes, skill access/installations, temporary files, and cleanup. Do not expose unrestricted shell commands.
- [ ] Integrate the bridge with shared conversation ownership. Bridge startup and stop calls need stable run IDs and retry-safe behavior. Cancellation and final persistence must agree on who finalizes the turn.
- [ ] Package the existing Hono application in a NioJS capsule after compatibility gates pass. Adapt the server entrypoint to the NioJS fetch-handler adapter; retain Hono routes, middleware, and streaming helpers. Preserve Vue's route/stream contracts and native session bindings.
- [ ] Update local launcher, Docker/compose, Railway deployment, health/readiness, configuration, release packaging, CI, and documentation for all required processes.
- [ ] Remove better-sqlite3/Drizzle, SQLite schema/setup code, and `DATABASE_PATH` from the app dependencies and configuration.
- [ ] Keep Hono as a runtime dependency. Replace the Node-specific serving adapter only after Hono-on-NioJS passes acceptance. Document any remaining Node requirement from the execution bridge or NioDB AlaSQL fallback.

Acceptance: fresh installs and persistent restarts pass Guru/conversation/message flows, message history pagination, streaming and cancellation, attachments, skills, Nio session continuation, persistent-volume restart, and packaged release launch.

## Coordinated delivery order

| Milestone | nio-db | nio-js | nio-guru | Release gate |
| --- | --- | --- | --- | --- |
| A: contracts | Specify identity, atomic mutations, references, leases, SDK APIs | Specify HTTP, SSE, config, and Hono adapter APIs | Capture app contract fixtures and fresh initialization fixtures | Shared contracts reviewed against current source |
| B: persistence foundation | Implement constraints, transactions, retry semantics, leases, SDK parameters | Implement authenticated networking and test SDK import | Build repositories and fresh initialization against the new DB contract | Crash/retry/query integration checks pass |
| C: NioDB integration | Ship a pinned compatible release | Build portable validation capsule support | Switch Hono API to NioDB; integrate NioJS validation; update packaging | Fresh initialization and app behavior pass |
| D: runtime foundation | Verify lease/fencing and query behavior under concurrent workers | Ship streaming, cancellation, configuration, Hono adapter, upload support | Build execution bridge and Hono-on-NioJS app | End-to-end streaming/ownership checks pass |
| E: runtime cutover | Maintain compatible server/SDK releases | Ship a pinned compatible runtime | Run Hono on NioJS by default; retain Hono framework | Built-artifact and deployment acceptance pass |

Work can proceed independently after milestone A, but consumers cannot cut over before provider release gates pass. Keep changes in separate reviewable commits/PRs for each repository. Record tested nio-db server, SDK, nio-js runtime, and nio-guru versions in one release compatibility matrix; select actual versions when releases are prepared.

## Shared integration suite

Run real nio-db and nio-js binaries with isolated temporary data/configuration. Use a deterministic fake Nio execution bridge for transport and failure tests, plus a separate smoke test with the native Nio CLI.

- [ ] Authenticated SDK CRUD and query parameter tests in Node and NioJS.
- [ ] Hono `app.fetch` adapter, middleware, routing, streaming helpers, multipart uploads, abort signals, and error-response compatibility in an actual NioJS capsule.
- [ ] Transaction validation failures, crash recovery, lost acknowledgements, retries, and concurrent application-key insertion.
- [ ] Timestamp-tied message pages and representative large-history preview queries.
- [ ] Cross-worker duplicate-start attempts, lease expiry, fenced stale writers, active-run deletion, and restart recovery.
- [ ] Incremental SSE delivery, slow consumers, cancellation, disconnect, and database outage during finalization.
- [ ] Upload bounds and private-file cleanup after success, failure, cancellation, and bridge restart.
- [ ] Empty-workspace startup, repeated seeding, malformed record validation, and persistence of newly created records after restart.
- [ ] Built capsules, npm package contents, locally supervised processes, externally managed NioDB, persistent container restart, and coordinated shutdown.

## First implementation task

Start milestone A by adding the contract fixtures in nio-guru and documenting the proposed mutation/identity API in nio-db. Implement atomic storage semantics and SDK bound parameters before converting routes. Develop nio-js authenticated networking alongside that work; it is the prerequisite for exercising the shared SDK in a capsule.

This document coordinates the work. No application or sibling-repository implementation changes have been made by writing it.
