# Learnings: Local Adaptive AI Runtime and Control Plane

## Iteration 17 (2026-03-16)

### What was built
- **Persistent policy CRUD**: Control plane now uses SQLitePolicyStore for policy persistence. Rules load from DB on startup, POST/DELETE persist through the store. Response includes `persisted: true` flag
- **CLAUDE.md comprehensive update**: Full project state documentation with milestone completion tracking against program.md (M0-M4 complete, M5 partial)
- **Total**: 286 tests, 9 packages, 2 apps, 72 commits

### Spec milestone completion (program.md section 21)
- **M0 Foundation** — COMPLETE: monorepo, schemas, runtime interfaces, adapter abstraction, audit events, policy engine, 6 ADRs
- **M1 Basic runtime** — COMPLETE: infer with local/cloud/auto routing, model registry, request envelopes (RequestContext), typed SDK, traceable execution metadata (traceId/spanId)
- **M2 Memory system** — COMPLETE: embed, remember, retrieve, provenance, scope isolation (4 levels), retention rules (auto-expiration), encrypted persistence (AES-256-GCM over SQLite), audit events
- **M3 Planning and governance** — COMPLETE: plan verb, control plane REST API (health, policy CRUD, audit queries, metrics), policy authoring with persistence, approval rules (require_approval effect), audit dashboard via paginated queries
- **M4 Mutable state safety** — COMPLETE: checkpoint, rollback, verify/verifyCheckpoint with integrity hashing. Adaptation overlays intentionally deferred (spec section 13.1 recommends conservative v1)
- **M5 Reference products** — PARTIAL: sandbox demo app demonstrates full API. Developer starter template and benchmark suite remaining

### Architecture summary after 17 iterations
The system implements a layered architecture matching program.md section 9:
1. **SDK Layer** (section 9.1): `createLattice` with clean developer API, re-exports all types
2. **Runtime Layer** (section 9.2): inference, routing, tool orchestration, streaming, conversations, prompt templates, context propagation
3. **Backend Adapter Layer** (section 9.3): Anthropic Claude (streaming + tool use), local/web/cloud stubs, composite/retry/rate-limit decorators
4. **Memory Layer** (section 9.4): in-memory and SQLite stores, encrypted wrapper, scope isolation, retention, verification
5. **Policy Engine** (section 9.5): priority-based rules, default-deny, glob matching, persistent storage
6. **Control Plane** (section 9.6): REST API with auth, CORS, policy CRUD, audit queries, metrics
7. **Storage Layer** (section 9.7): SQLite with WAL mode for memory, audit, and policy persistence

### What's next (suggested)
- Benchmark and eval suite (completing M5)
- OpenAPI spec for control plane
- Webhook notifications for audit events
- More adapter implementations (OpenAI, local llama.cpp)
- Dashboard frontend for control plane
- Database migration system

---

## Iteration 16 (2026-03-16)

### What was built
- **API key authentication**: Bearer token and X-API-Key header support, configurable via `API_KEYS` env var. Public paths bypass auth. Disabled when no keys configured. 6 tests
- **SQLite policy store**: `createSqlitePolicyStore` for persistent rules. save/remove/list/loadInto with INSERT OR REPLACE upsert. 6 tests
- **Metrics endpoint**: `GET /api/v1/metrics` returns policy rule count, audit event breakdown by type, error count, system info (Node version, uptime, memory). 1 test
- **Total test count**: 286 unique tests across 9 packages

### Architecture decisions made
- **Auth disabled by default**: When `API_KEYS` env var is empty, auth middleware passes all requests through. This makes development/testing seamless while requiring explicit opt-in for production security
- **Two auth header formats**: Supports both `Authorization: Bearer <key>` (standard) and `X-API-Key: <key>` (common for API services). Either format works
- **PolicyStore.save() is atomic**: Writes to SQLite AND adds to engine in one call. This prevents desync between persisted and in-memory state
- **loadInto() is idempotent**: Multiple calls add rules to the engine (addRule upserts by ID). Safe to call on every startup

### Technical notes
- Metrics endpoint queries audit sink with `limit: 10000` — adequate for moderate volumes, would need sampling for high-throughput production use
- Memory usage reported in MB (Math.round) for human readability
- The policy store uses the same WAL mode and shared DB pattern as memory and audit stores

### What's next (suggested)
- Wire policy store into control plane (persistent policy CRUD)
- Rate limiting on control plane API endpoints
- Database migration versioning
- OpenAPI spec / Swagger UI
- Webhook notifications for audit events
- Dashboard frontend

---

## Iteration 15 (2026-03-16)

### What was built
- **Full-stack integration tests**: 6 end-to-end tests validating SQLite storage + runtime + policy + audit + crypto working together. Covers: inference with audit, memory pipeline with retention, checkpoint/rollback, encrypted memory over SQLite, policy denial, multi-tenant isolation
- **createPersistentLattice**: One-line factory in storage package wiring SQLite memory + SQLite audit + policy engine + runtime. Shares single DB path for both tables
- **CORS middleware**: Configurable CORS for control plane. Handles OPTIONS preflight. 3 new tests
- **Total test count**: 273 unique tests across 9 packages

### Architecture decisions made
- **Storage package owns the persistent factory**: `createPersistentLattice` lives in `@lattice-kernel/storage` (not SDK) because it depends on `better-sqlite3` (native module). SDK consumers who don't need persistence don't pay the native dependency cost
- **Shared DB path for memory + audit**: Both SQLite stores use the same database file. SQLite handles concurrent table access well, and having a single file simplifies deployment and backup
- **Integration tests in storage package**: Since storage already depends on all the core packages, it's the natural home for integration tests that wire everything together

### Technical notes
- The integration test for encrypted memory validates that content is encrypted in the SQLite store but decrypted when read through the encrypted wrapper — confirming at-rest encryption works correctly
- CORS middleware returns `boolean` — `true` means the request was handled (OPTIONS preflight), `false` means continue to routing. Clean middleware composition pattern without framework abstractions

### What's next (suggested)
- Authentication middleware for control plane (API key or JWT)
- Policy persistence (save/load rules to SQLite)
- OpenAPI spec for control plane endpoints
- Metrics endpoint (request counts, latencies, memory item counts)
- Database migration system for schema evolution
- Performance benchmarks

---

## Iteration 14 (2026-03-16)

### What was built
- **Control plane REST API**: HTTP server with modular router supporting path params and method matching. Endpoints for health, policy CRUD, and paginated audit queries. Uses SQLite for persistent audit storage. 9 tests with mocked HTTP
- **Total test count**: 264 unique tests across 9 packages

### Architecture decisions made
- **No framework dependency**: Uses Node.js built-in `http.createServer` with custom router. The control plane is simple enough that Express/Fastify aren't needed — keeps deps minimal
- **Custom router with `:param` patterns**: Converts to regex groups. Sufficient for REST patterns like `/policies/:ruleId`
- **Query params for audit filtering**: Standard REST practice, works with browser tools
- **Mock HTTP objects for testing**: EventEmitter-based mocks for IncomingMessage/ServerResponse — fast and isolated without starting a real server

### Technical notes
- Configurable via `PORT` (default 3100) and `DB_PATH` env vars
- Runnable with: `pnpm --filter @lattice-kernel/control-plane start`
- Exports `router`, `policyEngine`, `auditSink` for testing/extension

### What's next (suggested)
- CORS and auth for control plane API
- Expose storage package through SDK
- OpenAPI spec generation
- Dashboard UI
- Full-stack integration test (SQLite + control plane + runtime)

---

## Iteration 13 (2026-03-16)

### What was built
- **SQLite memory store**: New `@lattice-kernel/storage` package with `createSqliteMemoryStore`. Full MemoryStore interface backed by SQLite with WAL mode, indexed scopes, text relevance ranking, checkpoint/rollback via JSON snapshots, retention enforcement. 16 tests including cross-instance persistence
- **SQLite audit sink**: `createSqliteAuditSink` with paginated queries, indexed by type/requestId/timestamp/actor. All AuditQueryFilter fields supported including hasError and scope. 9 tests
- **Total test count**: 255 unique tests across 8 packages

### Architecture decisions made
- **Separate storage package**: Rather than adding SQLite to memory or audit packages (which would make those packages depend on a native module), a new `@lattice-kernel/storage` package isolates the native dependency. Memory and audit remain pure TypeScript
- **SQLite WAL mode**: Write-Ahead Logging provides much better concurrent read performance and doesn't block readers during writes — essential for a runtime that reads memory while writes are happening
- **Checkpoint as JSON snapshot in SQLite**: The checkpoint stores all memory items as a JSON blob. Rollback uses a SQLite transaction to atomically replace all items. Simple and correct, though large stores would benefit from delta-based checkpoints
- **`:memory:` for tests, file path for production**: The SQLite store accepts `dbPath` — `:memory:` for fast isolated tests, a real file path for persistence. This is the standard better-sqlite3 pattern
- **`INSERT OR REPLACE` for audit events**: Prevents duplicate eventId errors if an event is emitted twice (idempotent writes)

### Technical notes
- `better-sqlite3` requires native compilation — `pnpm rebuild better-sqlite3` or `pnpm --filter @lattice-kernel/storage exec npm rebuild better-sqlite3` after install
- SQLite prepared statements are created once at store initialization and reused — this is much faster than preparing on each call
- The SQLite audit sink uses SQL `COUNT(*)` for total count on each query — acceptable for moderate event volumes, but would need cursor-based pagination for millions of events
- The storage package is separate from the pnpm workspace root — `better-sqlite3` is a dependency of the package, not the root

### What's next (suggested)
- Control plane REST API using SQLite storage backends
- Expose storage package through SDK for easy setup
- SQLite-backed policy store for persistent rules
- Migration support for schema evolution
- Connection pooling / shared DB instance across stores
- Benchmarking: in-memory vs SQLite performance comparison

---

## Iteration 12 (2026-03-16)

### What was built
- **GitHub Actions CI**: Workflow runs on push/PR to main. Tests on Node 20 + 22. Steps: install, build, typecheck, lint, test
- **RequestContext wiring**: `InferOptions.context` passes traceId/spanId through runtime. InferResult returns them for correlation. 2 new tests
- **ESLint**: Flat config with typescript-eslint recommended rules. Zero errors across entire codebase. Added to CI pipeline
- **CLAUDE.md update**: Comprehensive rewrite documenting all features from 12 iterations
- **Total test count**: 230 unique tests across 7 packages

### Architecture decisions made
- **ESLint flat config over legacy .eslintrc**: Flat config is the future of ESLint and simpler for monorepos — single config file at root
- **CI tests on Node 20 + 22**: Node 20 is LTS (production), Node 22 ensures forward compatibility. No Node 18 since we require >=20
- **Context is optional, not required**: `InferOptions.context` is optional. When absent, the runtime generates its own requestId. This keeps the simple case simple while allowing full tracing when needed
- **Lint covers all source, not per-package**: Root-level `eslint` glob is simpler than per-package lint scripts and ensures consistent rules

### Technical notes
- ESLint `argsIgnorePattern: "^_"` allows unused parameters prefixed with underscore — essential for adapter stubs and callbacks
- `@typescript-eslint/no-non-null-assertion` is off because the codebase uses careful `!` assertions on known-present values
- The CI uses `pnpm install --frozen-lockfile` to ensure reproducible installs
- Root `package.json` needs `"type": "module"` for ESLint flat config (which is ESM)

### What's next (suggested)
- Persistent storage backends (SQLite for embedded, Postgres for cloud)
- Control plane REST API using paginated audit queries
- Agent orchestration: multi-agent coordination with shared context
- Prettier for code formatting
- Test coverage reporting in CI
- OpenTelemetry SDK integration (attach context to real OTel traces)

---

## Iteration 11 (2026-03-16)

### What was built
- **Prompt template system**: `createPromptTemplate` with `{{variable}}` syntax, auto-extraction, missing variable validation. `createPromptLibrary` for template registry. `renderMessages()` returns system prompt + messages ready for infer. 11 new tests
- **Request context propagation**: `createRequestContext` and `createChildContext` with traceId, spanId, parentSpanId for distributed tracing. Multi-level nesting support. 11 new tests
- **Paginated audit queries**: `AuditQueryResult` with total count, hasMore flag, offset/limit pagination. New filters: traceId, modelId, hasError. All sinks and consumers updated. 4 new tests
- **Total test count**: 228 unique tests across 7 packages

### Architecture decisions made
- **Prompt templates use {{mustache}} syntax**: Simple, well-known, no complex logic (no conditionals/loops). This matches the spec's "developer ergonomics matter" principle — templates should feel familiar
- **PromptLibrary is separate from PromptTemplate**: Templates are standalone (can render without a library). The library is an optional registry for organization. This avoids coupling
- **RequestContext generates IDs with crypto.randomBytes**: Not sequential counters — proper random IDs for distributed systems where multiple runtime instances may be running
- **Child context inherits traceId, gets new spanId**: This is the standard distributed tracing pattern (OpenTelemetry-compatible). A trace contains many spans; child spans reference their parent
- **AuditQueryResult replaces raw array**: Breaking change to the audit query API — now returns `{ events, total, hasMore, offset, limit }`. This is essential for any control plane UI that needs pagination

### Technical notes
- Prompt variable extraction runs at template creation time, not at render time — the `variables` property is immediately available for introspection
- `createRequestContext` uses `node:crypto.randomBytes` for ID generation — hex-encoded for readability
- The hasError filter checks `event.error !== undefined` which correctly distinguishes between missing (no error) and present (has error) fields
- All audit query consumers (runtime tests, audit tests) updated from `const results = ...` to `const { events } = ...` destructuring

### What's next (suggested)
- Control plane REST API using the paginated audit queries
- Wire RequestContext through runtime operations (attach to audit events)
- Persistent storage backends (SQLite for embedded, Postgres for cloud)
- Agent orchestration: multi-agent coordination with shared context
- CI/CD with GitHub Actions for automated testing
- ESLint/Prettier setup for code quality

---

## Iteration 10 (2026-03-16)

### What was built
- **Agentic tool loop**: `runToolLoop` orchestrates infer → tool_use → execute → tool_result → infer cycles. Configurable maxRounds, onToolUse approval callback, onToolResult logging. Handles missing tools, denial, multi-round execution. 8 new tests
- **Tool definitions in InferOptions**: `tools` field wired through runtime to adapter, enabling model-driven tool selection
- **SDK re-exports**: All runtime utilities now accessible from `@lattice-kernel/sdk` — ConversationManager, CompositeAdapter, RetryAdapter, RateLimitedAdapter, ModelRegistry, runToolLoop
- **Lattice.getRuntime()**: Exposes underlying runtime for advanced usage (tool loop, direct model registry access)
- **Sandbox demo v2**: Full showcase — adapter composition (retry + rate limit), multi-turn conversation, memory with retention, streaming, tool execution loop, checkpoint/rollback
- **Total test count**: 203 unique tests across 7 packages

### Architecture decisions made
- **Tool loop is a standalone function, not a runtime method**: `runToolLoop(runtime, tools, defs, options, config)` is compositional — it takes a runtime and tools, not embedded inside the runtime. This keeps the runtime focused on single operations while the loop is an orchestration layer
- **Tool loop builds message history incrementally**: Each round appends assistant messages and tool results to the messages array. The full history is passed back to the model on each round, maintaining context
- **onToolUse as approval gate**: The callback returns a boolean — if false, a "denied" error is sent as tool_result instead of executing. This implements the spec's "high-risk tools require explicit approval" requirement without blocking on UI
- **getRuntime() for advanced usage**: Rather than wrapping every runtime utility in SDK methods, `getRuntime()` provides escape hatch access. The SDK remains simple for common operations while power users can access the full runtime

### Technical notes
- The tool loop uses the runtime's infer method (not adapter directly) so policy checks still apply on every round
- Mock adapter for tool use demo returns tool_use on first call, end_turn after receiving tool_result — simulates real agentic behavior
- Adapter composition in demo: `createRetryAdapter(createRateLimitedAdapter(base, rateConfig), retryConfig)` — decorators compose naturally
- The sandbox demo now demonstrates every major feature added across 10 iterations

### What's next (suggested)
- Control plane REST API for policy/audit management
- OpenTelemetry trace context propagation
- Persistent storage backends (SQLite for local, Postgres for cloud)
- Prompt template system for reusable prompt patterns
- Agent orchestration framework (multi-agent coordination)
- CI/CD setup with GitHub Actions

---

## Iteration 9 (2026-03-16)

### What was built
- **Tool use (function calling)**: `ToolDefinition`, `ToolUseRequest` types. `InferRequest.tools` for model tool access. `InferResponse.toolUseRequests` and `stopReason` for model tool calls. Anthropic adapter: sends tools as `input_schema`, parses `tool_use` content blocks, handles `tool_result` messages in Anthropic's nested format. 3 new tests
- **Conversation session management**: `ConversationManager` with create/get/delete/list. `Conversation` tracks user, assistant, and tool_result messages. Configurable maxMessages with FIFO eviction. 10 new tests
- **Rate limiter adapter**: `createRateLimitedAdapter` with sliding window (maxRequests/windowMs). Rate limits infer, embed, streaming. Bypasses estimate and healthCheck. 5 new tests
- **Total test count**: 195 unique tests across 7 packages, all passing

### Architecture decisions made
- **Tool definitions are generic JSON Schema**: `ToolDefinition.inputSchema` is `Record<string, unknown>` — the adapter maps it to provider-specific format (Anthropic's `input_schema`). This keeps the schema layer provider-agnostic
- **tool_result as a Message role**: Rather than a separate tool result type, tool results are messages with `role: "tool_result"` and a `toolUseId` field. The Anthropic adapter maps this to Anthropic's nested `user` message with `tool_result` content blocks
- **stopReason enum is generic**: Maps provider-specific stop reasons (Anthropic's `end_turn`, `tool_use`, etc.) to a common enum. This lets the runtime make decisions based on stop reason without knowing which provider returned it
- **Rate limiter doesn't limit metadata operations**: `estimate()` and `healthCheck()` bypass the rate limiter since they're lightweight metadata calls that shouldn't count against inference quotas
- **Conversation maxMessages uses FIFO**: When the limit is reached, the oldest message is dropped. This keeps recent context while bounding memory. More sophisticated windowing (e.g., keep system prompt + last N) would be a future enhancement

### Technical notes
- The Anthropic adapter's `buildRequestBody` now handles three message formats: plain user/assistant, tool_result (wrapped in user message with nested content), and the input-only fallback
- Conversation.getMessages() returns a copy to prevent external mutation of the internal state
- Rate limiter uses a simple timestamp array — for high-throughput scenarios, a token bucket algorithm would be more efficient
- `vi.useFakeTimers()` and `vi.advanceTimersByTimeAsync()` are essential for testing time-dependent rate limiting without slow tests

### What's next (suggested)
- Control plane REST API for policy/audit management
- OpenTelemetry trace context propagation
- Expose ConversationManager and rate limiter through SDK
- Tool execution loop: infer → tool_use → execute tool → tool_result → infer
- Prompt template system for reusable prompt patterns
- Persistent conversation storage (currently in-memory only)

---

## Iteration 8 (2026-03-16)

### What was built
- **Multi-turn conversation**: `Message` type (user|assistant), `InferRequest.messages` array for conversation history. Anthropic adapter builds proper multi-turn API calls. SDK passes messages through. 3 new tests
- **System prompt support**: `InferRequest.systemPrompt` field. Anthropic adapter sends as `system` field. Wired through runtime and SDK
- **Retry adapter**: `createRetryAdapter` wraps any adapter with exponential backoff + jitter. Retries 429, 5xx, timeout, network errors. Custom predicate support. Does NOT retry streaming. 9 new tests
- **Total test count**: 177 unique tests across 7 packages, all passing

### Architecture decisions made
- **Messages array is optional, input is always required**: Single-turn usage (`input` only) is the common case. Multi-turn provides `messages` array alongside `input`. When `messages` is provided, the adapter uses it; otherwise falls back to wrapping `input` as a single user message. This keeps the simple case simple
- **System prompt is adapter-level, not runtime-level**: The `systemPrompt` field passes through the runtime to the adapter. Different providers handle system prompts differently (Anthropic uses a `system` field, others may prepend it to messages). Keeping it at the adapter level allows provider-specific handling
- **Retry does not wrap streaming**: Once an SSE stream has started, retrying would require buffering already-emitted chunks. This breaks the streaming contract. Stream errors should be handled at the application level (reconnect and re-request)
- **buildRequestBody helper in Anthropic adapter**: Shared between infer() and inferStream() to avoid duplication. Constructs messages, system prompt, temperature, stop sequences in one place

### Technical notes
- The `Message` type only supports user and assistant roles. Tool use messages would need an extension when function calling is added
- Retry delay: `baseDelay * 2^attempt + random(0, baseDelay)`. Default: 500ms base, 10s max, 3 retries
- The retry adapter preserves the inner adapter's `providerId` for audit trail consistency
- Test retry delays are set to 1ms to keep tests fast

### What's next (suggested)
- Control plane REST API for policy/audit management
- OpenTelemetry trace context propagation
- Tool use (function calling) in adapter contract and Anthropic adapter
- Conversation session management (auto-append assistant responses)
- Rate limiter adapter (complement to retry — prevent hitting limits)
- Prompt template system for reusable prompt patterns

---

## Iteration 7 (2026-03-16)

### What was built
- **Streaming inference**: Full streaming pipeline from adapter → runtime → SDK
  - `InferStreamChunk` type with text_delta, usage, done variants
  - `BackendAdapter.inferStream` optional method returning `AsyncIterable`
  - `runtime.inferStream()` with policy check, fallback for non-streaming adapters, audit on completion
  - `lattice.inferStream(input)` in SDK
  - Anthropic adapter: SSE parsing for content_block_delta, message_delta, message_stop events
- **Total test count**: 165 unique tests across 7 packages — 7 new streaming tests

### Architecture decisions made
- **inferStream is optional on BackendAdapter**: Not all backends support streaming. The runtime provides a transparent fallback that wraps `infer()` output as a single text_delta + done sequence. This means SDK consumers always get a stream regardless of backend capability
- **Audit after stream completion**: The runtime wraps the adapter stream with a `finally` block that emits the audit event after the stream is fully consumed. This ensures audit even if the consumer abandons the stream early
- **AsyncIterable over callbacks**: Using `AsyncIterable<InferStreamChunk>` is idiomatic TypeScript and composes naturally with `for await...of`. No callback registration, no event emitters, no observable library needed
- **SSE parsing in adapter, not in runtime**: The Anthropic-specific SSE event format (content_block_delta, message_delta, message_stop) is parsed in the adapter and mapped to the generic `InferStreamChunk` type. The runtime never sees provider-specific formats

### Technical notes
- Anthropic SSE events arrive as `data: {json}\n` lines. The adapter uses a `ReadableStream.getReader()` with text buffer to handle partial lines
- The fallback streaming path (non-streaming adapter) is useful for testing and for local adapters that don't support streaming yet
- `wrapStreamWithAudit` is an async generator inside `createRuntime` since it needs closure over `auditSink`
- Testing SSE requires constructing a `ReadableStream` with `TextEncoder` — simpler than mocking the full fetch Response

### What's next (suggested)
- Control plane REST API for policy/audit management
- OpenTelemetry integration: trace context through inference requests
- Conversation/multi-turn support in the runtime (message history)
- Tool use (function calling) in the Anthropic adapter
- Adapter-level retry with exponential backoff
- System prompt / prompt template support

---

## Iteration 6 (2026-03-16)

### What was built
- **Composite adapter**: Implements the local-first principle — tries adapters in priority order, falls back on error. Merges capabilities (OR logic), deduplicates models. 11 tests
- **Retention enforcement**: Duration parser for retentionPolicy strings (30s, 5m, 2h, 180d). Auto-computes expiresAt at write time. expireStale() enforces retention. 7 tests
- **Model-aware routing**: Runtime now consults the model registry when a specific model is requested, routing to the adapter that owns that model. Lazy initialization. 1 new test
- **Total test count**: 158 unique tests across 7 packages, all passing

### Architecture decisions made
- **Composite adapter uses try-in-order for infer/embed**: Each adapter is tried sequentially. On error, the next adapter is tried. This is simpler than health-check-first and handles transient failures that a health check wouldn't catch
- **Capabilities merge with OR logic**: The composite reports a capability as supported if ANY child adapter supports it. This makes the composite appear as capable as the union of its children
- **Lazy model registry**: The registry is initialized on first model-specific request, not at runtime creation. This avoids unnecessary async work when models aren't specified by name
- **Retention = auto-expiresAt**: Rather than a separate retention enforcement mechanism, retentionPolicy is simply converted to an expiresAt timestamp at write time. This means expireStale() handles both explicit and retention-based expiration uniformly
- **Explicit expiresAt wins over retentionPolicy**: If both are provided, the explicit value is used. This allows manual override of automatic retention

### Technical notes
- `vi.useFakeTimers()` + `vi.setSystemTime()` is required for time-dependent tests — `vi.spyOn(Date, 'now')` doesn't affect `new Date().toISOString()`
- The composite adapter's `tryInOrder` returns the last error when all adapters fail, giving the most recent failure context
- Duration parsing is intentionally simple (single regex) since the Duration zod type already validates the format at the schema boundary

### What's next (suggested)
- Control plane REST API for policy management and audit querying
- OpenTelemetry integration for distributed tracing
- More adapter implementations: OpenAI, local llama.cpp
- Add adapter-level cost/latency awareness to route selection
- Approval workflow for policy-gated operations (currently throws)
- Streaming inference support in the adapter contract

---

## Iteration 5 (2026-03-16)

### What was built
- **Anthropic Claude adapter**: Real BackendAdapter for Anthropic's Messages API with configurable model/key/baseUrl. Uses native fetch (no SDK dependency). Supports claude-sonnet-4-6 and claude-haiku-4-5. 13 tests with mocked fetch
- **Model registry**: Centralized model management — aggregates models from all adapters, lookup by ID, filter by capability (embedding, tool calling, multimodal) or policy tag. First-adapter-wins for ID conflicts. 11 tests
- **Encrypted memory store**: Decorator pattern wrapping any MemoryStore with AES-256-GCM encryption. Content encrypted on write, decrypted on read. Other fields stay plaintext for querying. 9 tests including cross-key isolation
- **SDK crypto integration**: `LatticeConfig.crypto` optional field — when provided, memory is automatically encrypted at rest via the encrypted store wrapper
- **Vitest dist fix**: Root vitest.config.ts excludes dist/ globally, fixing duplicate test execution from compiled JS
- **Corrected test count**: 139 unique tests across 7 packages (was inflated to 197 by dist/ duplicates)

### Architecture decisions made
- **Anthropic adapter uses native fetch**: No @anthropic-ai/sdk dependency. The Messages API is simple enough that raw HTTP with proper headers is cleaner and avoids external dependency management
- **Model registry first-adapter-wins**: When multiple adapters register the same model ID, the first adapter takes precedence. This makes ordering in the config array meaningful and predictable
- **Encrypted store as decorator**: Rather than adding encryption into the base memory store (complicating the simple in-memory implementation), we wrap it with a decorator that encrypts/decrypts content transparently. This separation makes it easy to add encryption to any store implementation
- **Text search limitation with encryption**: The encrypted store's text-based retrieval won't match against encrypted content. Scope/type/trust filters still work. Embedding-based search (when implemented) would operate on plaintext before encryption

### Technical notes
- Vitest's default `include` patterns match test files in both src/ and dist/. The root config override is the cleanest fix since it applies to all packages
- The Anthropic adapter declares model descriptors statically rather than calling a models API — this avoids an extra API call and the models list is stable enough
- `createEncryptedMemoryStore` always attempts decryption on read (no tracking of which items are encrypted). This is correct for a store where ALL content is encrypted
- The SDK wires encrypted store automatically: `createLattice({ crypto: createNodeCryptoProvider() })` is all developers need

### What's next (suggested)
- Control plane REST API for policy management and audit querying
- Retention enforcement: automated expiration based on retentionPolicy field
- Composite adapter: tries local first, falls back to cloud (local-first principle)
- OpenTelemetry integration for distributed tracing
- More adapter implementations: OpenAI, local llama.cpp via adapter-local
- Consider embedding-aware retrieval that operates on plaintext before encryption

---

## Iteration 4 (2026-03-16)

### What was built
- **SDK plan/act**: Exposed `lattice.plan(goal)` and `lattice.act(tool)` through the SDK. LatticeConfig now accepts tools array. 4 new SDK tests
- **Verify verb**: `store.verify(itemId)` and `store.verifyCheckpoint(checkpointId)` recompute hashes and compare against stored values. Works with both simpleHash and SHA-256. 5 new tests
- **Multi-tenant isolation tests**: 9 tests validating scope isolation — tenant, app, user, session level isolation plus cross-tenant leakage prevention
- **6 ADRs**: Monorepo structure, default-deny policy, trust level taxonomy, memory write pipeline, backend adapter contract, checkpoint/rollback design
- **Total test count**: 197 tests across 6 packages, all passing

### Architecture decisions made
- **Verify recomputes, not stores-then-compares**: The verify methods recompute the hash from current content rather than storing a separate verification hash. This means verify catches both content tampering and hash corruption
- **Multi-tenant scope model is hierarchical**: `{ tenantId, appId, userId, sessionId }` — querying at a higher level (e.g., tenantId only) sees all items within that tenant regardless of app/user/session. This matches the spec's scope hierarchy
- **Checkpoint rollback is store-wide**: Rolling back restores ALL tenant data, not just one tenant's. Documented in ADR-006 as a known limitation — tenant-scoped rollback would require a different approach

### Technical notes
- ADRs follow a minimal format: Status, Context, Decision, Consequences. Each captures one decision with enough context to understand why
- The SDK now covers all 10 spec verbs except `adapt` (intentionally deferred — spec says v1 should be conservative with adaptation)
- VerifyResult includes both expectedHash and actualHash for debugging integrity failures
- Multi-tenant tests revealed that memory retrieval with empty scope returns all items — this is by design (scope filtering is inclusive, not exclusive)

### What's next (suggested)
- Build a real LLM adapter (Anthropic Claude via API) to replace mock adapters
- Control plane REST API for policy management and audit querying
- Encrypted memory persistence (use CryptoProvider.encrypt for at-rest encryption)
- Retention enforcement: scheduled expiration based on retentionPolicy field
- Model registry with signature verification using CryptoProvider.verify
- Consider tenant-scoped checkpoint/rollback as an alternative to store-wide

---

## Iteration 3 (2026-03-16)

### What was built
- **Crypto integration**: Wired CryptoProvider into memory store — SHA-256 hashing when crypto is provided, falls back to simpleHash for lightweight use. 2 new tests
- **Plan verb**: `runtime.plan()` creates structured Plans with intent, steps, dependencies, risk flags. Plans are always "draft" status (inspectable, not auto-executable). 4 tests
- **Act verb**: `runtime.act()` executes tools through ToolAdapter interface under policy control. Supports plan references for traceability, approval gating. 5 tests
- **JSON audit sink**: `createJsonAuditSink` for production observability — writes structured JSON lines with log level. Write-only, pair with CompositeAuditSink for querying. 4 tests
- **Sandbox demo**: Full reference app demonstrating infer, remember, retrieve, checkpoint, rollback, dynamic policy. Runnable with `pnpm --filter @lattice-kernel/sandbox-demo start`
- **Total test count**: 170 tests across 6 packages, all passing

### Architecture decisions made
- **ToolAdapter as simple interface**: `{ toolId, execute(input) → result }` — minimal surface area. Tools are registered in RuntimeConfig, looked up by ID. This keeps the contract clean and testable
- **Plans are always draft**: Per spec section 14.1, plans are proposals not automatically executable. This prevents model-suggested plans from being executed without review
- **Act with approval gating**: When policy returns `requiresApproval`, act throws rather than executing. This is the safe default until an approval workflow UI is built
- **JSON sink is write-only**: Separates concerns — logging and querying are different capabilities. Use CompositeAuditSink to combine JsonAuditSink (logging) with MemoryAuditSink (querying)
- **Optional crypto in memory store**: The CryptoProvider dependency is optional — this keeps the memory package usable in tests and simple setups without requiring node:crypto

### Technical notes
- The sandbox demo uses a mock adapter with canned responses to simulate a local model — this pattern is good for integration testing too
- Memory retrieval returns all items up to topK, sorted by relevance — it doesn't filter items with 0 matching terms. Use type/scope filters for precision
- The demo shows the spec section 25 pseudocode shape working end-to-end through the SDK
- ToolAdapter.execute receives and returns `Record<string, unknown>` — loose typing is intentional to support arbitrary tool schemas

### What's next (suggested)
- Expose plan and act through the SDK's Lattice class
- Add `verify` verb for model/checkpoint integrity verification using CryptoProvider
- Build a real adapter that calls an LLM API (e.g., Anthropic via the SDK)
- Add scope-based memory isolation tests (multi-tenant scenarios)
- Control plane app: REST API for policy management, audit querying
- ADRs documenting the key decisions made across iterations 1-3

---

## Iteration 2 (2026-03-16)

### What was built
- **Runtime tests**: 13 tests covering infer, embed, route selection (local/cloud/auto with fallback), policy denial with audit, health check, model listing
- **Crypto package**: NodeCryptoProvider with AES-256-GCM encryption (random IV, auth tag), SHA-256 hashing for bytes and strings. 22 tests including round-trip, wrong-key rejection, edge cases
- **SDK**: `createLattice()` as the developer entry point wiring runtime, policy, audit, memory. Clean API: `infer(input)`, `embed(content)`, `remember(content)`, `retrieve(query)`, `checkpoint()`, `rollback()`. 13 end-to-end integration tests
- **Checkpoint/rollback for memory**: Deep-clone snapshot of items map, integrity hash, audit events for both operations. Rollback restores full state. 6 tests
- **Total test count**: 140 tests across 6 packages, all passing

### Architecture decisions made
- **SDK as composition root**: The `Lattice` class is the clean developer-facing API that composes runtime + policy + audit + memory internally. Developers don't need to wire subsystems manually
- **Checkpoint = full snapshot**: For v1, checkpoints are full deep copies of the items map. This is simple and correct. For production, delta-based checkpoints would be more efficient
- **Checkpoint ID tie-breaking**: When checkpoints are created in the same millisecond (common in tests), sorting by checkpoint ID (which contains an incrementing counter) provides deterministic ordering
- **Crypto verify returns false by default**: The signature verification placeholder returns `false` (safe default — deny by default) rather than `true`, consistent with the security-first principle

### Technical notes
- `node:crypto` provides all primitives needed for v1 encryption — no external dependencies required
- AES-256-GCM output layout: `[iv (12 bytes)] [authTag (16 bytes)] [ciphertext]` — self-contained, no separate metadata needed
- The SDK re-exports commonly needed types from `@lattice-kernel/schemas` so developers don't need to import from multiple packages
- Mock adapters in tests implement `BackendAdapter` inline — useful pattern for any test that needs runtime integration

### What's next (suggested)
- Implement `plan` and `act` verbs in the runtime (spec sections 14.1-14.3)
- Wire crypto into memory store for encrypted persistence (replace simpleHash with SHA-256)
- Add a console/structured logging audit sink (for production observability)
- Implement the sandbox-demo app as a reference integration
- Add composite adapter (tries local first, falls back to cloud) for the "local-first" principle
- ADRs for key decisions made so far

---

## Iteration 1 (2026-03-16)

### What was built
- Monorepo initialized with pnpm workspace, 12 packages, 2 apps
- **Audit package**: MemoryAuditSink (bounded in-memory store with filtering) and CompositeAuditSink (fan-out to multiple sinks)
- **Policy engine**: Priority-based rule evaluation with deny > require_approval > allow precedence, default-deny, glob matching for scope/model/tool patterns, rule upsert by id
- **Backend adapter contract**: Shared BackendAdapter interface in schemas with InferRequest/Response, EmbedRequest/Response, CostEstimate, BackendCapabilities types. All three adapters (local, cloud, web) implement it
- **Runtime**: Policy-gated inference and embedding with route selection (local/cloud/auto preference with health-check fallback), structured audit event emission on every operation
- **Memory store**: In-memory implementation with full write pipeline per spec section 12.3 (policy check → approval gate → hash → persist → audit), retrieval with scope/type/trust/expiration filtering and text relevance ranking, lifecycle management (expireStale)
- **Test suites**: 54 tests across policy engine (18), audit (12), memory (24) — all passing

### Architecture decisions made
- **Default-deny policy**: When no rules match, the policy engine denies by default. This follows the spec's security-first principle. Can be overridden with `defaultDeny: false` for development
- **Trust level ordering**: Defined a fixed ordering from quarantined (lowest) to trusted_system (highest) for retrieval ranking and filtering
- **Deny precedence in policy**: Deny rules always win regardless of priority. This prevents accidental allow-through when deny and allow rules both match
- **Rule upsert**: addRule with same id replaces existing rule rather than creating a duplicate, preventing policy bloat
- **Simple text relevance for memory retrieval**: Used term-overlap scoring as a placeholder until embedding-based similarity is wired up via the embed adapter

### Technical notes
- pnpm workspace with `workspace:*` protocol for internal dependencies
- tsconfig.base.json with strict settings, composite: true for project references
- vitest runs directly against TypeScript source (no build step needed for tests)
- Apps that use `console` need `@types/node` and `"types": ["node"]` in tsconfig
- requestCounter in runtime uses module-level state — fine for single-instance, will need rethinking for multi-worker deployments
