# ADR-009: Structured Error Hierarchy

## Status
Accepted

## Context
The runtime throws errors for policy denials, missing tools, adapter failures, and other conditions. Consumers need to programmatically handle specific error types without parsing message strings. The spec requires clear error models for blocked or downgraded operations (section 23).

## Decision
Implement a typed error hierarchy extending `Error`:

- `LatticeError` (base): `code: string`, `message: string`, `context?: Record<string, unknown>`
- `PolicyDeniedError`: `matchedRules: string[]` — thrown when policy denies an operation
- `ApprovalRequiredError`: `matchedRules: string[]` — thrown when approval workflow is needed
- `AdapterError`: `providerId: string`, `statusCode?: number` — thrown on backend failures
- `ToolNotFoundError`: `toolId: string` — thrown when a requested tool doesn't exist
- `CheckpointNotFoundError`: `checkpointId: string` — thrown on invalid rollback
- `NoAdaptersError` — thrown when no adapters are configured

Error codes are string constants (e.g., `POLICY_DENIED`, `ADAPTER_ERROR`) for switch-based handling.

## Consequences
- Consumers can catch specific error types with `instanceof`
- Error codes enable programmatic handling without string matching
- Context fields provide rich debugging information (matched rules, provider IDs, status codes)
- All errors are still `instanceof Error` for standard catch patterns
- Existing tests that check `toThrow("Policy denied")` continue to work because the message substring is preserved
