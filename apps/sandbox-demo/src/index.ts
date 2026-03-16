/**
 * Lattice Kernel Sandbox Demo
 *
 * Demonstrates the full SDK API including conversations, tool use,
 * streaming, memory with retention, checkpoint/rollback, and
 * adapter composition (retry + rate limit).
 */

import {
  createLattice,
  createConversationManager,
  createRetryAdapter,
  createRateLimitedAdapter,
  createPromptTemplate,
  runToolLoop,
  PolicyDeniedError,
} from "@lattice-kernel/sdk";
import type {
  BackendAdapter,
  PolicyRule,
  ToolDefinition,
  ToolAdapter,
  InferStreamChunk,
} from "@lattice-kernel/sdk";

// --- Mock adapter (simulates a local model with tool use) ---

function createDemoAdapter(): BackendAdapter {
  let inferCount = 0;

  return {
    providerId: "demo-local",
    async getCapabilities() {
      return {
        supportsLocalExecution: true,
        supportsCloudExecution: false,
        supportsAdaptation: false,
        supportsStreaming: true,
        supportedFormats: ["demo"],
      };
    },
    async listModels() {
      return [
        {
          id: "demo-assistant-v1",
          version: "1.0.0",
          provider: "demo",
          format: "demo",
          capabilities: {
            supportsEmbedding: true,
            supportsToolCalling: true,
            supportsAdaptation: false,
            supportsMultimodal: false,
          },
          executionTargets: ["cpu"],
          policyTags: ["general"],
        },
      ];
    },
    async infer(request) {
      inferCount++;

      // Check for tool definitions and simulate tool use on first call
      if (request.tools && request.tools.length > 0) {
        const hasToolResult = request.messages?.some(
          (m) => m.role === "tool_result",
        );
        if (!hasToolResult) {
          return {
            output: "Let me look that up for you.",
            modelId: request.modelId,
            tokensUsed: 20,
            durationMs: 10,
            toolUseRequests: [
              {
                id: `toolu_${inferCount}`,
                name: request.tools[0]!.name,
                input: { city: "San Francisco" },
              },
            ],
            stopReason: "tool_use" as const,
          };
        }
      }

      // Check conversation context
      const lastMsg = request.messages?.[request.messages.length - 1];
      const context = lastMsg?.content ?? request.input;

      let output: string;
      if (context.includes("weather") || context.includes("temp")) {
        output =
          "Based on the weather data, it's 72°F and sunny in San Francisco — perfect day for a walk!";
      } else if (context.toLowerCase().includes("summarize")) {
        output =
          "The customer prefers quarterly billing and email communication. They are interested in upgrading to the Pro plan.";
      } else {
        output = `I understand. ${context.slice(0, 50)}... Let me help with that.`;
      }

      return {
        output,
        modelId: request.modelId,
        tokensUsed: 42,
        durationMs: 15,
        stopReason: "end_turn" as const,
      };
    },
    async *inferStream(request) {
      const words = `Streaming response for: ${request.input}`.split(" ");
      for (const word of words) {
        yield { type: "text_delta" as const, text: word + " " };
      }
      yield { type: "usage" as const, tokensUsed: words.length, modelId: request.modelId };
      yield { type: "done" as const };
    },
    async embed(request) {
      const sum = [...request.content].reduce(
        (a, c) => a + c.charCodeAt(0),
        0,
      );
      return {
        embedding: [sum / 1000, (sum % 100) / 100, 0.5],
        modelId: request.modelId,
        dimensions: 3,
      };
    },
    async estimate() {
      return { estimatedLatencyMs: 20, estimatedCost: 0 };
    },
    async healthCheck() {
      return true;
    },
  };
}

// --- Tool definitions and adapters ---

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
    return { city, temperature: 72, condition: "sunny", unit: "fahrenheit" };
  },
};

// --- Policy rules ---

const ENTERPRISE_POLICY: PolicyRule[] = [
  {
    id: "allow-all-ops",
    name: "Allow all operations for trusted users",
    permissions: [
      "canInfer",
      "canPlan",
      "canRemember",
      "canRetrieve",
      "canAct",
    ],
    effect: "allow",
    priority: 10,
  },
  {
    id: "deny-cloud",
    name: "Deny cloud routing by default",
    permissions: ["canRouteToCloud"],
    effect: "deny",
    priority: 5,
  },
];

// --- Demo ---

async function main() {
  console.log("╔══════════════════════════════════════════╗");
  console.log("║   Lattice Kernel Sandbox Demo v2         ║");
  console.log("╚══════════════════════════════════════════╝\n");

  // 1. Create runtime with adapter composition (retry + rate limit)
  const baseAdapter = createDemoAdapter();
  const resilientAdapter = createRetryAdapter(
    createRateLimitedAdapter(baseAdapter, {
      maxRequests: 100,
      windowMs: 60_000,
    }),
    { maxRetries: 2, baseDelayMs: 100 },
  );

  const lattice = createLattice({
    adapters: [resilientAdapter],
    tools: [weatherToolAdapter],
    policyRules: ENTERPRISE_POLICY,
    defaultTrustLevel: "trusted_user_explicit",
    defaultScope: {
      tenantId: "acme-corp",
      appId: "copilot",
      userId: "user-42",
    },
  });

  console.log("Health:", await lattice.healthCheck());
  console.log("Models:", await lattice.listModels());

  // 2. Conversation with message history
  console.log("\n--- Conversation ---");
  const convMgr = createConversationManager();
  const conv = convMgr.create();

  conv.addUser("Summarize the last customer interaction.");
  const r1 = await lattice.infer("Summarize the last customer interaction.", {
    messages: conv.getMessages(),
  });
  conv.addAssistant(r1.output);
  console.log(`User: Summarize the last customer interaction.`);
  console.log(`Assistant: ${r1.output}`);

  conv.addUser("What should we do next?");
  const r2 = await lattice.infer("What should we do next?", {
    messages: conv.getMessages(),
  });
  conv.addAssistant(r2.output);
  console.log(`User: What should we do next?`);
  console.log(`Assistant: ${r2.output}`);
  console.log(`Conversation history: ${conv.messages.length} messages`);

  // 3. Memory with retention
  console.log("\n--- Memory with Retention ---");
  const m1 = await lattice.remember(
    "Customer prefers quarterly billing and email.",
    { type: "preference", retention: "90d" },
  );
  console.log(`Stored preference (expires: ${m1.expiresAt})`);

  await lattice.remember("Session note: discussed upgrade options.", {
    type: "session",
    retention: "1d",
  });
  console.log("Stored session note (expires in 1 day)");

  const memories = await lattice.retrieve("billing");
  console.log(`Retrieved ${memories.length} memories for "billing"`);

  // 4. Streaming inference
  console.log("\n--- Streaming ---");
  const streamResult = await lattice.inferStream(
    "Tell me about the weather forecast.",
  );
  process.stdout.write("Stream: ");
  const chunks: InferStreamChunk[] = [];
  for await (const chunk of streamResult.stream) {
    if (chunk.type === "text_delta" && chunk.text) {
      process.stdout.write(chunk.text);
    }
    chunks.push(chunk);
  }
  console.log(`\n(${chunks.length} chunks received)`);

  // 5. Tool execution loop
  console.log("\n--- Tool Use Loop ---");
  const toolResult = await runToolLoop(
    lattice.getRuntime(),
    [weatherToolAdapter],
    [WEATHER_TOOL],
    {
      input: "What's the weather in San Francisco?",
      trustLevel: "trusted_user_explicit",
    },
    {
      onToolUse: async (req) => {
        console.log(`  Tool requested: ${req.name}(${JSON.stringify(req.input)})`);
        return true;
      },
      onToolResult: async (_req, result) => {
        console.log(`  Tool result: ${JSON.stringify(result)}`);
      },
    },
  );
  console.log(`Final: ${toolResult.finalResult.output}`);
  console.log(
    `Rounds: ${toolResult.rounds}, Tool executions: ${toolResult.toolExecutions.length}`,
  );

  // 6. Checkpoint and rollback
  console.log("\n--- Checkpoint/Rollback ---");
  const cp = await lattice.checkpoint("before experiment");
  await lattice.remember("EXPERIMENTAL: untested hypothesis", {
    type: "semantic",
  });
  console.log(`Before rollback: ${(await lattice.retrieve("experimental")).length} matches`);
  await lattice.rollback(cp.checkpointId);
  console.log(`After rollback: ${(await lattice.retrieve("experimental", { types: ["semantic"] })).length} matches`);

  // 7. Prompt templates
  console.log("\n--- Prompt Templates ---");
  const tmpl = createPromptTemplate({
    name: "customer-summary",
    systemPrompt: "You are a {{role}} assistant.",
    template: "Summarize the interaction with {{customer}} about {{topic}}.",
  });
  console.log(`Template variables: ${tmpl.variables.join(", ")}`);
  const rendered = tmpl.renderMessages({
    role: "customer success",
    customer: "Acme Corp",
    topic: "billing upgrade",
  });
  console.log(`System: ${rendered.systemPrompt}`);
  console.log(`User: ${rendered.messages[0]!.content}`);

  // 8. Structured error handling
  console.log("\n--- Structured Errors ---");
  const restrictedLattice = createLattice({
    adapters: [resilientAdapter],
    defaultDeny: true, // No allow rules
  });
  try {
    await restrictedLattice.infer("This should fail");
  } catch (err) {
    if (err instanceof PolicyDeniedError) {
      console.log(`Caught PolicyDeniedError: code=${err.code}, rules=[${err.matchedRules}]`);
    }
  }

  // 9. Cost-aware routing
  console.log("\n--- Cost Constraints ---");
  const costResult = await lattice.infer("Quick question", {
    maxLatencyMs: 5000,
    maxCost: 1.0,
  });
  console.log(`Cost-constrained result: ${costResult.output.slice(0, 50)}...`);

  // 10. Summary
  console.log("\n╔══════════════════════════════════════════╗");
  console.log("║   Demo Complete                          ║");
  console.log("╠══════════════════════════════════════════╣");
  console.log("║ Demonstrated:                            ║");
  console.log("║  - Adapter composition (retry + ratelim) ║");
  console.log("║  - Multi-turn conversation               ║");
  console.log("║  - Memory with retention policies        ║");
  console.log("║  - Streaming inference                   ║");
  console.log("║  - Agentic tool execution loop           ║");
  console.log("║  - Checkpoint and rollback               ║");
  console.log("║  - Prompt templates                      ║");
  console.log("║  - Structured error handling             ║");
  console.log("║  - Cost-aware routing                    ║");
  console.log("╚══════════════════════════════════════════╝");
}

main().catch((err) => {
  console.error("Demo failed:", err);
  process.exit(1);
});
