# ADR-007: Streaming Inference via AsyncIterable

## Status
Accepted

## Context
Real-time AI applications need streaming inference for responsive UX. Different backend adapters may or may not support streaming. The runtime needs a unified streaming API that works regardless of backend capability.

## Decision
Add an optional `inferStream` method on `BackendAdapter` returning `AsyncIterable<InferStreamChunk>`. The runtime provides transparent fallback for non-streaming adapters by wrapping the `infer()` response as a single `text_delta` + `done` sequence. Chunk types: `text_delta`, `usage`, `done`.

The runtime wraps adapter streams with an audit-emitting wrapper using `finally` to ensure audit events fire after stream completion, even on early abort.

## Consequences
- SDK consumers always get a stream regardless of backend capability
- Adapter implementors can choose whether to implement streaming
- Audit events are deferred until stream completion (not per-chunk)
- The Anthropic adapter implements native SSE parsing for real streaming
- Retry adapter does not wrap streaming (once started, retrying would break the stream contract)
