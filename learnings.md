# Learnings: Local Adaptive AI Runtime and Control Plane

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

### What's next (suggested)
- Wire up the SDK package to use the runtime with a clean developer-facing API
- Add runtime tests (currently untested)
- Implement the crypto package with at least hashing (for memory item integrity)
- Start on checkpoint/rollback for mutable state
- Add a real embedding adapter (even a simple one) to replace text-overlap retrieval
