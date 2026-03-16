# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Lattice Kernel is a **local adaptive AI runtime and enterprise control plane**. It enables developers to ship private, memory-bearing, policy-safe AI applications across Windows, Apple, Android, web, and cloud environments. This is a systems infrastructure product, not a chatbot wrapper.

The founding specification lives in `program.md` — read it for full context on design philosophy, trust model, and system objects.

## Build & Development Commands

```bash
pnpm install          # Install all dependencies
pnpm build            # Build all packages (respects dependency order)
pnpm test             # Run tests across all packages
pnpm lint             # Lint all packages
pnpm typecheck        # Type-check without emitting

# Single package
pnpm --filter @lattice-kernel/schemas build
pnpm --filter @lattice-kernel/runtime test

# Test framework: vitest (runs directly against TS source, no build needed)
# Tests live in src/__tests__/*.test.ts within each package
```

## Package Dependency Order

schemas → audit, policy-engine, adapters → runtime, memory → sdk → apps

The SDK (`createLattice`) is the main developer entry point — it wires together runtime, policy engine, audit sink, and memory store.

## Technical Stack

- **Primary language:** TypeScript (monorepo with pnpm or turbo)
- **Rust:** selectively for performance-sensitive components (local execution, storage, encryption, portable native modules)
- **Storage:** Postgres + pgvector for relational/vector state; embedded DB for device/runtime state
- **Validation:** zod for runtime schema validation
- **Observability:** OpenTelemetry for tracing; structured JSON logs
- **API surfaces:** OpenAPI / typed RPC

## Monorepo Layout

```
/apps
  /control-plane
  /sandbox-demo
/packages
  /sdk              # Application-facing API, language bindings
  /runtime           # Inference, routing, orchestration, tool execution
  /policy-engine     # Machine-enforceable behavioral rules
  /memory            # Governed memory subsystem (not just a vector store)
  /adapters
    /adapter-local   # CPU/GPU/NPU local execution
    /adapter-cloud   # Cloud provider execution
    /adapter-web     # Web runtime execution
  /schemas           # Shared types, interfaces, event schemas
  /audit             # Audit event emission and logging
  /crypto            # Encryption at rest, signing, verification
  /tooling           # Developer utilities
/docs
  /adr               # Architecture Decision Records
  /architecture
  /policies
```

## Core API Verbs

The system exposes: `infer`, `embed`, `remember`, `retrieve`, `adapt`, `plan`, `act`, `checkpoint`, `rollback`, `verify`. These are first-class system primitives, not convenience wrappers.

## Architecture Principles

- **Interfaces first:** Define schemas, runtime interfaces, adapter interfaces, policy interfaces, and audit event interfaces before wiring providers. Build order: schemas → audit → policy engine → adapter contract → runtime → memory → SDK → control plane.
- **Immutable base, mutable layers:** Base models are immutable signed artifacts. Adaptation layers, memory, and policies are separately managed mutable state.
- **Policy is mandatory:** Every operation that stores, learns, retrieves, plans, or acts must pass through the policy engine. No persistent learning or external action happens merely because the model suggested it.
- **Trust provenance everywhere:** Every state mutation carries trust level (`trusted_system`, `trusted_admin`, `trusted_user_explicit`, `trusted_user_implicit`, `untrusted_external`, `untrusted_model_generated`, `quarantined`).
- **Platform-specific code in adapters only:** Never let Windows/Apple/Android/cloud-specific behavior leak into domain logic. Use explicit adapters and capability discovery interfaces.
- **State lineage from day one:** Every mutable write path must support attribution, checkpoints, rollback, audit, and quarantine.
- **Memory is a first-class subsystem:** Distinguished types (session, working, episodic, semantic, preference, organizational, policy, tool_output) with write/retrieval pipelines, provenance, scope isolation, encryption at rest, and lifecycle management.

## Security Assumptions

- Assume any model output may be wrong, manipulative, or unsafe — the runtime must verify and constrain, not merely relay.
- Design for: prompt injection, memory poisoning, retrieval contamination, unauthorized cloud escalation, cross-tenant leakage, unauthorized adaptation writes, forged artifacts.

## Product Taste

The comparison class is Stripe, Docker, Kubernetes control planes — serious developer infrastructure. Not a toy agent framework. Code should feel infrastructure-grade, explicit, and trustworthy.
