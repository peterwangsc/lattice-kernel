# ADR-001: Monorepo Structure with pnpm Workspace

## Status
Accepted

## Context
The system requires 12+ packages with clear dependency boundaries between schemas, runtime, policy engine, memory, audit, crypto, SDK, adapters, and apps. We need a monorepo structure that supports incremental builds, strict type checking across packages, and workspace-level dependency management.

## Decision
Use a pnpm workspace with TypeScript project references. All packages live under `/packages` with adapters nested under `/packages/adapters`. Apps live under `/apps`. A shared `tsconfig.base.json` enforces strict TypeScript settings across all packages.

## Consequences
- Package dependencies use `workspace:*` protocol for internal references
- Build order is determined by pnpm's topological sort
- Each package has its own `tsconfig.json` extending the base with `composite: true` for incremental builds
- Test framework (vitest) runs directly against TypeScript source without a build step
- Adding a new package requires updating `pnpm-workspace.yaml` if it's in a new directory pattern
