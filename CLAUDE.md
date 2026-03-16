# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Lattice Kernel is a **local adaptive AI runtime and enterprise control plane**. It enables developers to ship private, memory-bearing, policy-safe AI applications across Windows, Apple, Android, web, and cloud environments. This is a systems infrastructure product, not a chatbot wrapper.

The founding specification lives in `program.md`. Development history is in `learnings.md`.

## Build & Development Commands

```bash
pnpm install          # Install all dependencies
pnpm build            # Build all packages (respects dependency order)
pnpm test             # Run 404 tests across 15 suites
pnpm lint             # ESLint with typescript-eslint
pnpm typecheck        # Type-check without emitting

# Single package
pnpm --filter @lattice-kernel/runtime test

# Run apps
pnpm --filter @lattice-kernel/sandbox-demo start    # Demo app
pnpm --filter @lattice-kernel/control-plane start   # Control plane API (port 3100)

# After installing native deps (SQLite):
pnpm --filter @lattice-kernel/storage exec npm rebuild better-sqlite3

# Test framework: vitest (runs directly against TS source)
# Tests: src/__tests__/*.test.ts in each package
# Root vitest.config.ts excludes dist/ to prevent duplicates
```

## Package Architecture

```
schemas → audit, policy-engine, crypto, adapters
       → runtime (+ model-registry, composite/retry/rate-limit adapters,
                    conversations, prompt templates, tool loop, context)
       → memory (+ encrypted store)
       → storage (SQLite: memory store, audit sink, policy store)
       → sdk (createLattice entry point)
       → apps/control-plane (REST API)
       → apps/sandbox-demo (reference integration)
```

## Key Entry Points

```ts
// In-memory (development)
import { createLattice, runToolLoop } from "@lattice-kernel/sdk";
const lattice = createLattice({ adapters: [...], policyRules: [...] });

// Persistent (production) — uses SQLite
import { createPersistentLattice } from "@lattice-kernel/storage";
const { runtime, memoryStore } = createPersistentLattice({ dbPath: "./app.db", adapters: [...] });

// Adapter composition
import { createRetryAdapter, createRateLimitedAdapter, createCompositeAdapter } from "@lattice-kernel/sdk";
import { createAnthropicAdapter } from "@lattice-kernel/adapter-cloud";

// Agentic tool loop
const result = await runToolLoop(lattice.getRuntime(), tools, toolDefs, inferOptions);
```

## Technical Stack

- **Language:** TypeScript monorepo (pnpm workspace, 12 packages + 2 apps)
- **Validation:** zod
- **Testing:** vitest (404 tests across 15 suites)
- **Linting:** ESLint + typescript-eslint (flat config)
- **CI:** GitHub Actions (Node 20 + 22, build → typecheck → lint → test)
- **Crypto:** node:crypto (AES-256-GCM, SHA-256)
- **Storage:** better-sqlite3 with WAL mode

## Runtime Capabilities

- **Inference:** `infer`, `inferStream` (AsyncIterable), `embed` — policy-gated, audited
- **Multi-turn:** Message history, system prompts, conversation manager
- **Tool use:** ToolDefinition → model tool_use → ToolAdapter execution → tool_result
- **Agentic:** `runToolLoop` — infer → tool_use → execute → tool_result → infer cycle
- **Memory:** `remember`, `retrieve` — scoped (tenant/app/user/session), typed (8 types), trust-ranked, retention-enforced, optionally encrypted at rest (AES-256-GCM)
- **Planning:** `plan` (structured proposals, always draft), `act` (tool execution under policy + approval gating)
- **State safety:** `checkpoint`, `rollback`, `verify`, `verifyCheckpoint` — full snapshot with integrity hashing
- **Adapters:** Anthropic Claude (streaming + tool use), local/web/cloud stubs
- **Composition:** CompositeAdapter (local-first fallback), RetryAdapter (exponential backoff), RateLimitedAdapter (sliding window)
- **Templates:** PromptTemplate with {{variable}} syntax + PromptLibrary registry
- **Context:** RequestContext with traceId/spanId for distributed tracing
- **Persistence:** SQLite memory store, SQLite audit sink, SQLite policy store — all with WAL mode

## Control Plane

REST API at `localhost:3100` (configurable via PORT, DB_PATH, API_KEYS env vars):
- `GET /health` — system health
- `GET/POST/DELETE /api/v1/policies` — persistent policy CRUD
- `GET /api/v1/audit` — paginated audit queries with rich filtering
- `GET /api/v1/metrics` — policy, audit, and system metrics
- CORS support, API key authentication (Bearer or X-API-Key)

## Architecture Principles

- **Default-deny policy:** Deny > require_approval > allow. No operation without explicit allow rule.
- **Trust provenance:** 7 levels from `quarantined` to `trusted_system` on every mutation.
- **Adapters isolate platform code:** Provider-specific logic stays in adapters.
- **State lineage:** Every write supports attribution, checkpoints, rollback, audit, verification.
- **Memory is first-class:** Write pipeline (policy → approve → hash → persist → audit), scope isolation at 4 levels.
- **Streaming is optional:** Runtime provides transparent fallback for non-streaming backends.
- **Native deps isolated:** SQLite (better-sqlite3) only in `@lattice-kernel/storage`, not in SDK.

## Spec Milestone Completion

- **M0 Foundation:** COMPLETE — monorepo, schemas, runtime interfaces, adapters, audit, policy, 6 ADRs
- **M1 Basic runtime:** COMPLETE — infer with routing, model registry, request context, typed SDK
- **M2 Memory system:** COMPLETE — embed, remember, retrieve, provenance, scope isolation, retention, encrypted persistence
- **M3 Planning/governance:** COMPLETE — plan, control plane API, policy CRUD, approval rules, metrics
- **M4 Mutable state safety:** COMPLETE — checkpoint, rollback, verify (adaptation overlays deferred per spec v1)
- **M5 Reference products:** COMPLETE — sandbox demo + benchmark suite + quick-start example

## ADRs

`docs/adr/`: 001-monorepo, 002-default-deny, 003-trust-taxonomy, 004-memory-pipeline, 005-adapter-contract, 006-checkpoint-rollback, 007-streaming-inference, 008-tool-use-architecture, 009-structured-errors, 010-open-questions-resolved
