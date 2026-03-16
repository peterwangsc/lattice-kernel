# Runtime

Core orchestration for inference, routing, tools, streaming, and conversations.

## Key Exports

`createRuntime`, `createModelRegistry`, `createCompositeAdapter`, `createRetryAdapter`, `createRateLimitedAdapter`, `runToolLoop`, `createConversationManager`, `createPromptTemplate`, `explainPolicyDecision`.

## Usage

```typescript
import { createRuntime } from '@lattice-kernel/runtime';

const runtime = createRuntime({ modelRegistry, policyEngine, auditSink });
const result = await runtime.infer({ model: 'gpt-4', prompt: 'Hello', tools });
const stream = runtime.inferStream({ model: 'gpt-4', prompt: 'Hello' });
for await (const chunk of stream) console.log(chunk);
```

## Invariants

- Every operation is policy-gated and audited
- Route selection: model name → user preference → cost estimate → health
- Tool invocations require explicit policy allow
- Streaming yields chunks; errors terminate stream early
- Conversation context window enforced per adapter
