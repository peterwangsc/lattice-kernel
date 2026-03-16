# ADR-008: Tool Use Architecture

## Status
Accepted

## Context
The system needs to support model-driven tool execution (function calling) where the model requests tool invocations and receives results. This is the mechanism behind the `act` verb and agentic workflows (spec sections 14.2-14.3).

## Decision
Three layers of tool use abstraction:

1. **Schema layer**: `ToolDefinition` (name, description, inputSchema as JSON Schema), `ToolUseRequest` (id, name, input), and `InferResponse.toolUseRequests`/`stopReason` fields
2. **Adapter layer**: Adapter maps generic tool definitions to provider format (e.g., Anthropic's `input_schema`), parses `tool_use` content blocks from responses, and handles `tool_result` messages in provider-specific format
3. **Runtime layer**: `runToolLoop` orchestrates the infer → tool_use → execute → tool_result → infer cycle with configurable maxRounds, approval callbacks, and error handling

Tool adapters are simple interfaces: `{ toolId: string, execute(input) → result }`.

## Consequences
- Tool definitions are provider-agnostic (JSON Schema based)
- Each adapter handles its own tool format mapping — Anthropic's nested content blocks, OpenAI's function calling, etc.
- The tool loop is a standalone function, not embedded in the runtime — compositional and testable
- Approval gating via `onToolUse` callback prevents unauthorized tool execution
- Missing tools return error messages in tool_result rather than throwing — the model can recover
