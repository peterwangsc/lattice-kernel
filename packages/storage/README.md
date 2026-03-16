# Storage

SQLite-backed persistent storage for memory, audit, and policies.

## Key Exports

`createSqliteMemoryStore`, `createSqliteAuditSink`, `createSqlitePolicyStore`, `createPersistentLattice`.

## Usage

```typescript
import { createSqliteMemoryStore, createSqliteAuditSink } from '@lattice-kernel/storage';

const memStore = createSqliteMemoryStore({ dbPath: './lattice.db' });
const auditSink = createSqliteAuditSink({ dbPath: './lattice.db' });

await memStore.write('session-1', 'key', data);
const events = await auditSink.query({ limit: 100 });
```

## Invariants

- WAL mode enabled for concurrent reads
- Single shared DB file across all stores
- Native dependency (better-sqlite3) isolated to this package
- Schema auto-migration on package version upgrade
- Synchronous I/O; async wrappers provided
