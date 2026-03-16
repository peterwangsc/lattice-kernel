# ADR-005: Backend Adapter Contract

## Status
Accepted

## Context
The runtime must support multiple execution providers (local CPU/GPU/NPU, cloud, web) through a common interface (spec section 15). Route selection depends on adapter capabilities, health, and policy.

## Decision
Define a single `BackendAdapter` interface in the schemas package with methods: `getCapabilities()`, `listModels()`, `infer()`, `embed()`, `estimate()`, `healthCheck()`, plus a `providerId` string. All adapters implement this interface. Request/response types (`InferRequest`, `InferResponse`, `EmbedRequest`, `EmbedResponse`, `CostEstimate`, `BackendCapabilities`) are zod schemas in the same file.

## Consequences
- Route selection in the runtime is adapter-agnostic: check capabilities, then call the same interface
- Adding a new backend only requires implementing the interface — no runtime changes needed
- The `providerId` enables deterministic route visibility in audit logs
- Capability discovery (`getCapabilities`) is async to support runtime hardware detection
- `estimate()` enables future cost/latency-aware routing without changing the interface
