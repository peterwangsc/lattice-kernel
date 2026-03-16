# Schemas

Shared types and zod schemas for the entire Lattice system.

## Key Exports

`model`, `memory`, `policy`, `trust`, `audit`, `adapter`, `context`, `checkpoint`, `action`, `plan`, `common` types, and error hierarchy.

## Usage

```typescript
import { schemas } from '@lattice-kernel/schemas';

// Type validation at system boundaries
const modelSchema = schemas.model;
const validated = modelSchema.parse(inputData);
```

## Invariants

- All types are validated with zod at system boundaries
- No nullable fields without explicit `optional()` or `nullable()`
- Error hierarchy provides structured error codes and metadata
- Schemas are immutable and reusable across packages
