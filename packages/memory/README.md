# Memory

Governed memory subsystem with scope isolation and retention.

## Key Exports

`createMemoryStore`, `createEncryptedMemoryStore`, `createEmbeddingMemoryStore`, `cosineSimilarity`.

## Usage

```typescript
import { createMemoryStore } from '@lattice-kernel/memory';

const store = createMemoryStore({ policyEngine, auditSink });
await store.write('session-1', 'key', { value: 'data' }, { ttl: 3600 });
const result = await store.read('session-1', 'key');
const similar = await store.query('session-1', 'embedding', { limit: 10 });
```

## Invariants

- Write pipeline: policy check → approval → hash → persist → audit emit
- Scope isolation at 4 levels: tenant, session, scope, key
- Retention auto-expiration; expired entries cleanup on read or scheduled
- Read policies enforced independently of write policies
- Concurrent writes to same key serialize via lock
