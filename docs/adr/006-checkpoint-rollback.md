# ADR-006: Checkpoint and Rollback via Full Snapshot

## Status
Accepted

## Context
The spec requires mutable state (memory, adaptation) to support checkpoints and rollback (spec sections 8.9, 14). This is essential for safe experimentation and recovery.

## Decision
Implement checkpoints as full deep copies of the items Map. Each checkpoint stores a snapshot Map and metadata (Checkpoint schema with integrity hash). Rollback replaces the current state entirely from the snapshot. Checkpoints are store-wide, not tenant-scoped.

## Consequences
- Simple and correct: rollback is exact state restoration
- Memory cost scales with store size × number of checkpoints
- For production, delta-based checkpoints would be more memory-efficient
- Store-wide rollback means multi-tenant stores roll back all tenants — tenant-scoped rollback would require a different implementation
- Checkpoint integrity hashes enable verification via `verifyCheckpoint()`
- Both checkpoint and rollback emit audit events for traceability
