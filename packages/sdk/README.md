# SDK

Developer-facing API. Single import for all Lattice functionality.

## Key Exports

`createLattice`, `Lattice` class with methods: `infer`, `inferStream`, `embed`, `remember`, `retrieve`, `plan`, `act`, `checkpoint`, `rollback`.

## Usage

```typescript
import { createLattice } from '@lattice-kernel/sdk';

const lattice = createLattice({
  adapters: [{ type: 'openai', apiKey: 'sk-...' }],
  policyRules: [{ id: 'allow-inference', effect: 'allow', resource: 'inference' }],
});

const response = await lattice.infer('What is 2+2?');
const stream = await lattice.inferStream('Explain quantum computing');
for await (const chunk of stream) console.log(chunk);
```

## Invariants

- Single entry point abstracts all subsystems
- All operations require policy check before execution
- Every operation is audited
- Memory and checkpoints are scoped to session
- Errors propagate with full context and policy explanation
