import type {
  Message,
  ToolDefinition,
  ToolUseRequest,
} from "@lattice-kernel/schemas";
import type { Runtime, InferOptions, InferResult, ToolAdapter } from "./types.js";

export interface ToolLoopConfig {
  /** Maximum number of tool use rounds before stopping. */
  maxRounds?: number;
  /** Called before each tool execution for logging/approval. */
  onToolUse?: (request: ToolUseRequest) => Promise<boolean>;
  /** Called after each tool execution with the result. */
  onToolResult?: (
    request: ToolUseRequest,
    result: Record<string, unknown>,
  ) => Promise<void>;
}

export interface ToolLoopResult {
  /** The final inference result (after all tool rounds complete). */
  finalResult: InferResult;
  /** All intermediate tool executions. */
  toolExecutions: ToolExecution[];
  /** Number of tool rounds executed. */
  rounds: number;
  /** All messages in the conversation (including tool results). */
  messages: Message[];
}

export interface ToolExecution {
  request: ToolUseRequest;
  result: Record<string, unknown>;
  round: number;
}

/**
 * Runs an agentic tool loop: infer → tool_use → execute → tool_result → infer.
 * Continues until the model stops requesting tools or maxRounds is reached.
 */
export async function runToolLoop(
  runtime: Runtime,
  tools: ToolAdapter[],
  toolDefinitions: ToolDefinition[],
  options: InferOptions,
  config: ToolLoopConfig = {},
): Promise<ToolLoopResult> {
  const { maxRounds = 10, onToolUse, onToolResult } = config;
  const toolMap = new Map(tools.map((t) => [t.toolId, t]));
  const messages: Message[] = options.messages
    ? [...options.messages]
    : [{ role: "user", content: options.input }];
  const toolExecutions: ToolExecution[] = [];
  let rounds = 0;
  let lastResult: InferResult | undefined;

  for (let round = 0; round < maxRounds; round++) {
    // Infer with tool definitions
    const result = await runtime.infer({
      ...options,
      messages,
      tools: toolDefinitions,
    });
    lastResult = result;

    // Check if model wants to use tools
    const toolUseRequests = result.adapterResponse.toolUseRequests;
    if (
      !toolUseRequests ||
      toolUseRequests.length === 0 ||
      result.adapterResponse.stopReason !== "tool_use"
    ) {
      // Model is done — no more tool calls
      break;
    }

    rounds++;

    // Add assistant message with the model's response
    if (result.output) {
      messages.push({ role: "assistant", content: result.output });
    }

    // Execute each tool and collect results
    for (const toolReq of toolUseRequests) {
      // Check approval if handler provided
      if (onToolUse) {
        const approved = await onToolUse(toolReq);
        if (!approved) {
          messages.push({
            role: "tool_result",
            content: JSON.stringify({ error: "Tool execution denied" }),
            toolUseId: toolReq.id,
          });
          continue;
        }
      }

      // Find and execute the tool
      const toolAdapter = toolMap.get(toolReq.name);
      if (!toolAdapter) {
        messages.push({
          role: "tool_result",
          content: JSON.stringify({ error: `Tool not found: ${toolReq.name}` }),
          toolUseId: toolReq.id,
        });
        continue;
      }

      const toolResult = await toolAdapter.execute(toolReq.input);
      toolExecutions.push({ request: toolReq, result: toolResult, round });

      if (onToolResult) {
        await onToolResult(toolReq, toolResult);
      }

      messages.push({
        role: "tool_result",
        content: JSON.stringify(toolResult),
        toolUseId: toolReq.id,
      });
    }
  }

  if (!lastResult) {
    throw new Error("Tool loop produced no inference result");
  }

  return {
    finalResult: lastResult,
    toolExecutions,
    rounds,
    messages,
  };
}
