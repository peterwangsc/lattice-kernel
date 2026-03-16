# ADR-010: Resolution of Initial Open Questions

## Status
Accepted

## Context
Program.md section 23 lists 8 open research questions. This ADR documents how each was resolved through implementation.

## Resolutions

### 1. Cleanest policy representation format for runtime enforcement?
**Resolution**: Zod-validated `PolicyRule` with priority-based evaluation. Rules have permissions array, scope/model/tool patterns (glob syntax), and effect (allow/deny/require_approval). Deny takes absolute precedence. Simple, fast, and predictable. See ADR-002.

### 2. Local storage architecture for portability and secure deletion?
**Resolution**: SQLite with WAL mode. Portable single-file database, supports secure deletion via `DELETE` + `VACUUM`. Encrypted memory wrapper (AES-256-GCM) provides at-rest encryption. Native dependency isolated in `@lattice-kernel/storage` package.

### 3. Memory ranking when trust and relevance conflict?
**Resolution**: Relevance score is primary ranking. Trust level is used as tie-breaker (higher trust wins). Minimum trust level can be set as a filter (items below threshold excluded entirely). This balances finding relevant content while preferring trusted sources.

### 4. Minimum viable adaptation model?
**Resolution**: Deferred for v1 per spec section 13.1 recommendation. Memory-based adaptation (preferences, episodic memory, semantic facts) provides useful personalization without model weight modification. LoRA/adapter layers can be added later through the AdaptationLayer schema.

### 5. Which local execution backends first?
**Resolution**: Cloud-first with local stubs. Anthropic and OpenAI adapters implemented with full feature coverage (streaming, tool use, multi-turn). Local adapter (adapter-local) defined but awaiting specific local runtime integration (llama.cpp, ONNX). The BackendAdapter contract is validated as provider-agnostic.

### 6. Route selection reasoning about privacy, performance, and cost?
**Resolution**: Multi-factor route selection:
- **Model-aware**: Registry maps model IDs to their adapter
- **Preference-based**: local/cloud/auto execution preference
- **Capability-based**: Adapter reports what it supports
- **Health-based**: Fallback to first healthy adapter
- **Composite adapter**: Priority-ordered fallback chain
- Cost estimation available via `adapter.estimate()` but not yet used in automatic routing decisions. See ADR-011 (planned).

### 7. Developer-facing error model for blocked operations?
**Resolution**: Typed error hierarchy (ADR-009). `PolicyDeniedError` with matched rules, `ApprovalRequiredError`, `AdapterError` with status codes, `ToolNotFoundError`, `NoAdaptersError`. Consumers catch by type with `instanceof`. Error codes enable switch-based handling.

### 8. Checkpoint granularity for rollback value?
**Resolution**: Full-snapshot checkpoints (ADR-006). Every checkpoint captures complete memory state. Simple, correct, and verifiable (integrity hashing). Memory cost scales with store size × checkpoints. Delta-based checkpoints deferred as optimization.
