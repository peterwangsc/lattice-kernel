# ADR-004: Memory Write Pipeline

## Status
Accepted

## Context
Memory is a first-class subsystem (spec section 12). Writes must be policy-gated, auditable, and integrity-verified. "Memory should not be silently persisted without policy review."

## Decision
Implement the memory write as a sequential pipeline:
1. Policy check (canRemember permission)
2. Approval gate (throws if requiresApproval — approval workflow not yet built)
3. Generate content hash (SHA-256 via CryptoProvider when available, simpleHash fallback)
4. Persist to store
5. Emit audit event

The CryptoProvider dependency is optional to keep the memory package usable in tests and simple setups.

## Consequences
- Every memory write is policy-gated and audited
- Writes that require approval fail explicitly rather than silently succeeding
- Content hashes enable integrity verification via `verify()` and `verifyCheckpoint()`
- The pipeline is synchronous within a single write — no background processing
- The optional crypto pattern allows gradual adoption without breaking existing consumers
