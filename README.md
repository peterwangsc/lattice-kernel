# Lattice Kernel

[![CI](https://github.com/peterwangsc/lattice-kernel/actions/workflows/ci.yml/badge.svg)](https://github.com/peterwangsc/lattice-kernel/actions/workflows/ci.yml)

A local adaptive AI runtime and enterprise control plane for building private, memory-bearing, policy-safe AI applications.

| | |
|---|---|
| **Packages** | 13 packages + 3 apps |
| **Tests** | 404 across 15 suites |
| **Adapters** | Anthropic, OpenAI, any OpenAI-compatible (Ollama, vLLM, LM Studio) |
| **Storage** | In-memory + SQLite (persistent) |
| **API** | 16 REST endpoints with auth, CORS, rate limiting |
| **Deployment** | Docker + Compose |

## What is this?

Lattice Kernel is a systems-grade runtime for AI applications. It provides:

- **Policy-gated inference** with local-first routing, cloud fallback, streaming, and multi-turn conversations
- **Governed memory** with 4-level scope isolation, retention enforcement, encryption at rest, and embedding-based retrieval
- **Agentic tool execution** with approval gating, structured plans, and automatic tool loops
- **Persistent storage** (SQLite) for memory, audit logs, and policy rules
- **Control plane** REST API with 16 endpoints for policy management, memory, checkpoints, and observability
- **Structured errors**, **prompt templates**, **request tracing**, and **decision explanations** for debuggability

It is not a chatbot library or a thin wrapper around model APIs. It is infrastructure.

## Quick Start

```bash
# Install
pnpm install

# Build all packages
pnpm build

# Run the demo
pnpm --filter @lattice-kernel/sandbox-demo start

# Run the control plane
pnpm --filter @lattice-kernel/control-plane start

# Run tests (404 tests)
pnpm test
```

## SDK Usage

```typescript
import { createLattice } from "@lattice-kernel/sdk";
import { createOpenAIAdapter, createAnthropicAdapter } from "@lattice-kernel/adapter-cloud";

// Works with any OpenAI-compatible API:
// - OpenAI: createOpenAIAdapter({ apiKey: "sk-..." })
// - Local LLM (Ollama, vLLM, LM Studio): createOpenAIAdapter({ baseUrl: "http://localhost:11434" })
// - Any cloud API: createOpenAIAdapter({ baseUrl: "https://your-api.com", apiKey: "..." })
// - Anthropic: createAnthropicAdapter({ apiKey: "sk-ant-..." })

const lattice = createLattice({
  adapters: [createOpenAIAdapter({ baseUrl: "http://localhost:11434", defaultModel: "llama3" })],
  policyRules: [{
    id: "allow-infer",
    name: "Allow inference",
    permissions: ["canInfer", "canRemember", "canRetrieve"],
    effect: "allow",
    priority: 10,
  }],
});

// Inference
const result = await lattice.infer("Summarize the customer interaction.");

// Memory
await lattice.remember("Customer prefers quarterly billing.", { type: "preference" });
const memories = await lattice.retrieve("billing preferences");

// Streaming
const stream = await lattice.inferStream("Tell me about the weather.");
for await (const chunk of stream.stream) {
  if (chunk.type === "text_delta") process.stdout.write(chunk.text ?? "");
}

// Checkpoint and rollback
const cp = await lattice.checkpoint("before experiment");
await lattice.remember("Experimental data");
await lattice.rollback(cp.checkpointId);
```

## Persistent Setup (SQLite)

```typescript
import { createPersistentLattice } from "@lattice-kernel/storage";

const { runtime, memoryStore } = createPersistentLattice({
  dbPath: "./my-app.db",
  adapters: [myAdapter],
  policyRules: [myRules],
});
```

## Adapter Composition

```typescript
import {
  createCompositeAdapter,
  createRetryAdapter,
  createRateLimitedAdapter,
} from "@lattice-kernel/sdk";

// Local-first with cloud fallback, retry, and rate limiting
const adapter = createRetryAdapter(
  createRateLimitedAdapter(
    createCompositeAdapter({
      adapters: [localAdapter, cloudAdapter],
    }),
    { maxRequests: 100, windowMs: 60_000 },
  ),
  { maxRetries: 3, baseDelayMs: 500 },
);
```

## Agentic Tool Loop

```typescript
import { runToolLoop } from "@lattice-kernel/sdk";

const result = await runToolLoop(
  lattice.getRuntime(),
  [{ toolId: "search", execute: async (input) => ({ results: ["..."] }) }],
  [{ name: "search", description: "Search the web", inputSchema: { type: "object" } }],
  { input: "Find the latest news", trustLevel: "trusted_user_explicit" },
);
```

## Control Plane

```bash
# Start with API key auth
API_KEYS=my-secret-key pnpm --filter @lattice-kernel/control-plane start
```

Endpoints:
| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | System health |
| GET | `/api/v1/policies` | List policy rules |
| POST | `/api/v1/policies` | Add/update a rule |
| DELETE | `/api/v1/policies/:id` | Remove a rule |
| GET | `/api/v1/audit` | Query audit events (paginated) |
| GET | `/api/v1/metrics` | System metrics |
| GET | `/api/v1/openapi.json` | OpenAPI spec |

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    SDK (createLattice)               │
├─────────────────────────────────────────────────────┤
│ Runtime: infer, embed, plan, act, inferStream       │
│ Memory: remember, retrieve, checkpoint, rollback    │
│ Tools: runToolLoop, ConversationManager, Templates  │
├──────────┬──────────┬───────────┬───────────────────┤
│ Policy   │  Audit   │  Crypto   │  Model Registry   │
│ Engine   │  Sink    │  Provider │                   │
├──────────┴──────────┴───────────┴───────────────────┤
│ Adapters: Anthropic | Local | Cloud | Web           │
│ Composition: Composite | Retry | RateLimit          │
├─────────────────────────────────────────────────────┤
│ Storage: SQLite (memory, audit, policy)             │
└─────────────────────────────────────────────────────┘
```

## Key Design Decisions

- **Default-deny policy**: No operation succeeds without an explicit allow rule
- **Trust provenance**: 7 levels from `quarantined` to `trusted_system` on every mutation
- **Memory as a first-class system**: 8 types, 4-level scope isolation, retention, encryption
- **Streaming optional on adapters**: Runtime provides transparent fallback
- **Native dependencies isolated**: SQLite only in `@lattice-kernel/storage`

## Development

```bash
pnpm install          # Install dependencies
pnpm build            # Build all packages
pnpm test             # Run 404 tests
pnpm lint             # ESLint
pnpm typecheck        # Type check

# Benchmarks
pnpm --filter @lattice-kernel/tooling bench
```

## Specification

The founding specification is in [`program.md`](./program.md). Architecture Decision Records are in [`docs/adr/`](./docs/adr/).

## License

Private — see program.md for project context.
