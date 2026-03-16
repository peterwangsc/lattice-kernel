# Policy Engine

Machine-enforceable behavioral rules for runtime actions.

## Key Exports

`createPolicyEngine`, `PolicyEngine` class.

## Usage

```typescript
import { createPolicyEngine } from '@lattice-kernel/policy-engine';

const engine = createPolicyEngine({ defaultDeny: true });
engine.addRule({ id: 'rule-1', effect: 'allow', resource: '*' });
const decision = await engine.evaluate(context);
console.log(decision.allowed, decision.reason);
```

## Invariants

- Default deny: requests fail unless explicitly allowed
- Decision priority: `deny` > `require_approval` > `allow`
- Rules upsert by ID (new rule with same ID replaces old rule)
- Synchronous evaluation; async actions delegated to approval flow
- No circular rule dependencies; acyclic rule DAG required
