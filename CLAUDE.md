# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Lattice Kernel is a **local adaptive AI runtime and enterprise control plane**. It enables developers to ship private, memory-bearing, policy-safe AI applications across Windows, Apple, Android, web, and cloud environments. This is a systems infrastructure product, not a chatbot wrapper.

The founding specification lives in `program.md` — read it for full context on design philosophy, trust model, and system objects. Incremental development history is in `learnings.md`.

## Build & Development Commands

```bash
pnpm install          # Install all dependencies
pnpm build            # Build all packages (respects dependency order)
pnpm test             # Run tests across all packages (228 tests)
pnpm lint             # ESLint with typescript-eslint
pnpm typecheck        # Type-check without emitting

# Single package
pnpm --filter @lattice-kernel/schemas build
pnpm --filter @lattice-kernel/runtime test

# Run the sandbox demo
pnpm --filter @lattice-kernel/sandbox-demo start

# Test framework: vitest (runs directly against TS source, no build needed)
# Tests live in src/__tests__/*.test.ts within each package
# Root vitest.config.ts excludes dist/ to prevent duplicate test runs
```

## Package Dependency Order

schemas → audit, policy-engine, crypto, adapters → runtime, memory → sdk → apps

## Key SDK Entry Points

```ts
import { createLattice, createConversationManager, runToolLoop } from "@lattice-kernel/sdk";

// Simple usage
const lattice = createLattice({ adapters: [...], policyRules: [...] });
await lattice.infer("Hello");
await lattice.remember("Customer prefers email.", { type: "preference" });

// Adapter composition
import { createRetryAdapter, createRateLimitedAdapter, createCompositeAdapter } from "@lattice-kernel/sdk";
const adapter = createRetryAdapter(createRateLimitedAdapter(base, { maxRequests: 100, windowMs: 60000 }));

// Tool loop (agentic)
const result = await runToolLoop(lattice.getRuntime(), tools, toolDefs, inferOptions);
```

## Technical Stack

- **Language:** TypeScript monorepo with pnpm workspace
- **Validation:** zod for runtime schema validation
- **Testing:** vitest
- **Linting:** ESLint with typescript-eslint (flat config)
- **CI:** GitHub Actions (Node 20 + 22)
- **Crypto:** node:crypto (AES-256-GCM, SHA-256)

## Runtime Capabilities

- **Inference:** `infer`, `inferStream` (AsyncIterable), `embed` — all policy-gated with audit
- **Memory:** `remember`, `retrieve` — scoped, typed, trust-ranked, retention-enforced, optionally encrypted at rest
- **Planning:** `plan` (structured proposals), `act` (tool execution under policy)
- **State:** `checkpoint`, `rollback`, `verify` — full snapshot with integrity hashing
- **Adapters:** Anthropic Claude (with streaming + tool use), local, web, cloud stubs
- **Composition:** CompositeAdapter (local-first fallback), RetryAdapter (backoff), RateLimitedAdapter
- **Conversations:** ConversationManager with multi-turn message history
- **Templates:** PromptTemplate with {{variable}} syntax + PromptLibrary
- **Context:** RequestContext with trace/span IDs for distributed tracing

## Architecture Principles

- **Default-deny policy:** No operation succeeds without an explicit allow rule. Deny > require_approval > allow.
- **Trust provenance:** Every mutation carries trust level. 7 levels from `quarantined` to `trusted_system`.
- **Adapters isolate platform code:** All provider-specific logic (Anthropic SSE, cloud auth) stays in adapters.
- **State lineage:** Every write supports attribution, checkpoints, rollback, audit, verification.
- **Memory is first-class:** 8 memory types, write pipeline (policy → approve → hash → persist → audit), scope isolation at tenant/app/user/session levels.
- **Streaming is optional on adapters:** Runtime provides transparent fallback for non-streaming backends.

## ADRs

Key decisions documented in `docs/adr/`:
- 001: Monorepo structure (pnpm workspace + TS project references)
- 002: Default-deny policy engine
- 003: Trust level taxonomy
- 004: Memory write pipeline
- 005: Backend adapter contract
- 006: Checkpoint/rollback via full snapshot

## Security Assumptions

- Assume any model output may be wrong, manipulative, or unsafe — the runtime must verify and constrain.
- Design for: prompt injection, memory poisoning, retrieval contamination, cross-tenant leakage, unauthorized adaptation writes.
