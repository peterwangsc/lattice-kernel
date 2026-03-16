# Learnings: Local Adaptive AI Runtime and Control Plane

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
