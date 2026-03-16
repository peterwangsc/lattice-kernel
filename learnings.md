# Learnings: Local Adaptive AI Runtime and Control Plane

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
