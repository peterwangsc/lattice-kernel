# Contributing to Lattice Kernel

## Getting Started

```bash
git clone https://github.com/peterwangsc/lattice-kernel.git
cd lattice-kernel
pnpm install
pnpm build
pnpm test    # 403 tests
pnpm lint    # zero errors
```

## Project Structure

```
packages/
  schemas/         # Shared types (zod), error hierarchy
  policy-engine/   # Rule evaluation (default-deny)
  audit/           # Event sinks (memory, JSON, webhook, composite)
  crypto/          # AES-256-GCM encryption, SHA-256 hashing
  memory/          # Memory stores (in-memory, encrypted, embedding)
  runtime/         # Orchestration (inference, routing, tools, streaming)
  sdk/             # Developer-facing API (createLattice)
  storage/         # SQLite persistence (memory, audit, policy)
  tooling/         # Benchmarks
  adapters/
    adapter-cloud/ # Anthropic + OpenAI adapters
    adapter-local/ # Local LLM stub
    adapter-web/   # Web runtime stub
apps/
  control-plane/   # REST API (16 endpoints)
  sandbox-demo/    # Feature showcase
  cli/             # Interactive REPL
```

## Development Workflow

1. **Find the right package** — changes to types go in `schemas`, business logic in `runtime`, storage in `storage`, etc.
2. **Write tests first** — tests live in `src/__tests__/*.test.ts`. Use `vitest`.
3. **Run affected tests** — `pnpm --filter @lattice-kernel/runtime test`
4. **Build** — `pnpm build` (respects dependency order)
5. **Lint** — `pnpm lint` (ESLint from root)
6. **Full check** — `pnpm build && pnpm lint && pnpm test`

## Adding a New Adapter

Implement the `BackendAdapter` interface from `@lattice-kernel/schemas`:

```typescript
const adapter: BackendAdapter = {
  providerId: "my-provider",
  async getCapabilities() { ... },
  async listModels() { ... },
  async infer(request) { ... },
  async embed(request) { ... },
  async estimate(request) { ... },
  async healthCheck() { ... },
  // Optional:
  async *inferStream(request) { ... },
};
```

See `examples/custom-adapter.ts` for Ollama and OpenAI-compatible patterns.

## Adding a New API Endpoint

1. Create a route file in `apps/control-plane/src/routes/`
2. Register it in `apps/control-plane/src/index.ts`
3. Add to the OpenAPI spec in `routes/openapi.ts`
4. Write tests in `apps/control-plane/src/__tests__/routes.test.ts`

## Key Patterns

- **Structured errors**: Throw `LatticeError` subclasses, not plain `Error`
- **Policy gating**: Every mutation goes through `policyEngine.evaluate()`
- **Audit emission**: Every state change emits an audit event
- **Decorator pattern**: Memory stores compose (base → encrypted → embedding)
- **Adapter decorators**: Compose with retry, rate-limit, composite wrappers

## Architecture Decisions

See `docs/adr/` for 10 documented decisions. Key ones:
- ADR-002: Default-deny policy
- ADR-005: Backend adapter contract
- ADR-009: Structured error hierarchy

## Commit Convention

```
<summary line>

<body explaining what and why>

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
```
