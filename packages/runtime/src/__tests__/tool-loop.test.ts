import { describe, it, expect } from "vitest";
import { runToolLoop } from "../tool-loop.js";
import { createRuntime } from "../runtime.js";
import { createPolicyEngine } from "@lattice-kernel/policy-engine";
import { createMemoryAuditSink } from "@lattice-kernel/audit";
import type { BackendAdapter, ToolDefinition } from "@lattice-kernel/schemas";
import type { ToolAdapter } from "../types.js";

const WEATHER_TOOL: ToolDefinition = {
  name: "get_weather",
  description: "Get current weather for a city",
  inputSchema: {
    type: "object",
    properties: { city: { type: "string" } },
    required: ["city"],
  },
};

const weatherToolAdapter: ToolAdapter = {
  toolId: "get_weather",
  async execute(input) {
    const city = input.city as string;
    return { city, temperature: 72, condition: "sunny" };
  },
};

function createToolCallAdapter(rounds: number): BackendAdapter {
  let callCount = 0;

  return {
    providerId: "mock-tool",
    async getCapabilities() {
      return {
        supportsLocalExecution: true,
        supportsCloudExecution: false,
        supportsAdaptation: false,
        supportedFormats: [],
      };
    },
    async listModels() {
      return [];
    },
    async infer(request) {
      callCount++;
      if (callCount <= rounds) {
        // Simulate model requesting tool use
        return {
          output: "Let me check the weather.",
          modelId: request.modelId,
          durationMs: 1,
          toolUseRequests: [
            {
              id: `toolu_${callCount}`,
              name: "get_weather",
              input: { city: "San Francisco" },
            },
          ],
          stopReason: "tool_use" as const,
        };
      }
      // Final response after tool results
      return {
        output: "The weather in San Francisco is 72°F and sunny.",
        modelId: request.modelId,
        durationMs: 1,
        stopReason: "end_turn" as const,
      };
    },
    async embed() {
      return { embedding: [0], modelId: "m", dimensions: 1 };
    },
    async estimate() {
      return {};
    },
    async healthCheck() {
      return true;
    },
  };
}

describe("runToolLoop", () => {
  function createTestRuntime(adapter: BackendAdapter) {
    const policyEngine = createPolicyEngine({ defaultDeny: false });
    const auditSink = createMemoryAuditSink();
    return createRuntime({ adapters: [adapter], policyEngine, auditSink });
  }

  it("completes single tool round", async () => {
    const runtime = createTestRuntime(createToolCallAdapter(1));

    const result = await runToolLoop(
      runtime,
      [weatherToolAdapter],
      [WEATHER_TOOL],
      { input: "What's the weather in SF?", trustLevel: "trusted_user_explicit" },
    );

    expect(result.rounds).toBe(1);
    expect(result.toolExecutions).toHaveLength(1);
    expect(result.toolExecutions[0]!.request.name).toBe("get_weather");
    expect(result.toolExecutions[0]!.result).toEqual({
      city: "San Francisco",
      temperature: 72,
      condition: "sunny",
    });
    expect(result.finalResult.output).toContain("72°F");
  });

  it("handles multiple tool rounds", async () => {
    const runtime = createTestRuntime(createToolCallAdapter(2));

    const result = await runToolLoop(
      runtime,
      [weatherToolAdapter],
      [WEATHER_TOOL],
      { input: "Weather check", trustLevel: "trusted_user_explicit" },
    );

    expect(result.rounds).toBe(2);
    expect(result.toolExecutions).toHaveLength(2);
  });

  it("stops at maxRounds", async () => {
    const runtime = createTestRuntime(createToolCallAdapter(100));

    const result = await runToolLoop(
      runtime,
      [weatherToolAdapter],
      [WEATHER_TOOL],
      { input: "test", trustLevel: "trusted_user_explicit" },
      { maxRounds: 3 },
    );

    expect(result.rounds).toBe(3);
  });

  it("returns immediately when no tools requested", async () => {
    const noToolAdapter: BackendAdapter = {
      providerId: "no-tools",
      async getCapabilities() {
        return {
          supportsLocalExecution: true,
          supportsCloudExecution: false,
          supportsAdaptation: false,
          supportedFormats: [],
        };
      },
      async listModels() {
        return [];
      },
      async infer(request) {
        return {
          output: "Simple answer",
          modelId: request.modelId,
          durationMs: 1,
          stopReason: "end_turn" as const,
        };
      },
      async embed() {
        return { embedding: [0], modelId: "m", dimensions: 1 };
      },
      async estimate() {
        return {};
      },
      async healthCheck() {
        return true;
      },
    };

    const runtime = createTestRuntime(noToolAdapter);
    const result = await runToolLoop(
      runtime,
      [weatherToolAdapter],
      [WEATHER_TOOL],
      { input: "What is 2+2?", trustLevel: "trusted_user_explicit" },
    );

    expect(result.rounds).toBe(0);
    expect(result.toolExecutions).toHaveLength(0);
    expect(result.finalResult.output).toBe("Simple answer");
  });

  it("handles tool not found gracefully", async () => {
    const runtime = createTestRuntime(createToolCallAdapter(1));

    // Don't provide any tool adapters
    const result = await runToolLoop(
      runtime,
      [],
      [WEATHER_TOOL],
      { input: "test", trustLevel: "trusted_user_explicit" },
    );

    // Should have a tool_result message with error
    const toolResultMsg = result.messages.find(
      (m) => m.role === "tool_result",
    );
    expect(toolResultMsg).toBeDefined();
    expect(toolResultMsg!.content).toContain("Tool not found");
  });

  it("supports onToolUse approval callback", async () => {
    const runtime = createTestRuntime(createToolCallAdapter(1));
    const approved: string[] = [];

    const result = await runToolLoop(
      runtime,
      [weatherToolAdapter],
      [WEATHER_TOOL],
      { input: "test", trustLevel: "trusted_user_explicit" },
      {
        onToolUse: async (req) => {
          approved.push(req.name);
          return true;
        },
      },
    );

    expect(approved).toEqual(["get_weather"]);
    expect(result.toolExecutions).toHaveLength(1);
  });

  it("skips tool execution when onToolUse denies", async () => {
    const runtime = createTestRuntime(createToolCallAdapter(1));

    const result = await runToolLoop(
      runtime,
      [weatherToolAdapter],
      [WEATHER_TOOL],
      { input: "test", trustLevel: "trusted_user_explicit" },
      {
        onToolUse: async () => false, // Deny all
      },
    );

    expect(result.toolExecutions).toHaveLength(0);
    const toolResultMsg = result.messages.find(
      (m) => m.role === "tool_result",
    );
    expect(toolResultMsg!.content).toContain("denied");
  });

  it("builds complete message history", async () => {
    const runtime = createTestRuntime(createToolCallAdapter(1));

    const result = await runToolLoop(
      runtime,
      [weatherToolAdapter],
      [WEATHER_TOOL],
      { input: "What's the weather?", trustLevel: "trusted_user_explicit" },
    );

    // Should have: user, assistant (tool use), tool_result, then final messages used
    expect(result.messages.length).toBeGreaterThanOrEqual(3);
    expect(result.messages[0]!.role).toBe("user");
  });
});
