# Audit

Audit event emission, logging, and querying.

## Key Exports

`createMemoryAuditSink`, `createJsonAuditSink`, `createWebhookAuditSink`, `createCompositeAuditSink`.

## Usage

```typescript
import { createMemoryAuditSink, createCompositeAuditSink } from '@lattice-kernel/audit';

const sink = createCompositeAuditSink([
  createMemoryAuditSink({ capacity: 10000 }),
  createJsonAuditSink({ path: './audit.jsonl' }),
]);
await sink.emit({ type: 'memory_write', timestamp: Date.now() });
const events = await sink.query({ limit: 50, offset: 0 });
```

## Invariants

- Every state mutation emits an audit event
- Event sequence is append-only and immutable
- Paginated queries with limit and offset
- Write-only sinks (e.g., webhook) pair with CompositeAuditSink
- Sink failures do not block primary operation
