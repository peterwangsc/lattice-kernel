import type {
  RuntimeConfig,
  Runtime,
  InferOptions,
  InferResult,
  InferStreamResult,
  EmbedOptions,
  EmbedResult,
  PlanOptions,
  ActOptions,
  ActResult,
} from "./types.js";
import type { BackendAdapter, Plan, InferStreamChunk } from "@lattice-kernel/schemas";
import {
  PolicyDeniedError,
  NoAdaptersError,
  ToolNotFoundError,
  ApprovalRequiredError,
} from "@lattice-kernel/schemas";
import { createModelRegistry } from "./model-registry.js";
import type { ModelRegistry } from "./model-registry.js";

let requestCounter = 0;
function nextRequestId(): string {
  return `req_${Date.now()}_${++requestCounter}`;
}

export function createRuntime(config: RuntimeConfig): Runtime {
  const { adapters, policyEngine, auditSink, tools = [] } = config;
  const toolMap = new Map(tools.map((t) => [t.toolId, t]));

  // Model registry for model-aware routing
  const registry: ModelRegistry = createModelRegistry(adapters);
  let registryInitialized = false;

  async function ensureRegistry(): Promise<void> {
    if (!registryInitialized) {
      await registry.refresh();
      registryInitialized = true;
    }
  }

  async function selectAdapter(
    preference: string | undefined,
    modelId?: string,
  ): Promise<BackendAdapter> {
    if (adapters.length === 0) {
      throw new NoAdaptersError();
    }

    // If a specific model is requested, use the registry to find its adapter
    if (modelId && modelId !== "default") {
      await ensureRegistry();
      const modelAdapter = registry.getAdapterForModel(modelId);
      if (modelAdapter) {
        return modelAdapter;
      }
    }

    for (const adapter of adapters) {
      const caps = await adapter.getCapabilities();

      if (preference === "local" && caps.supportsLocalExecution) {
        return adapter;
      }
      if (preference === "cloud" && caps.supportsCloudExecution) {
        return adapter;
      }
    }

    // "auto" or no preference: return first healthy adapter
    for (const adapter of adapters) {
      const healthy = await adapter.healthCheck();
      if (healthy) return adapter;
    }

    return adapters[0]!;
  }

  async function* wrapStreamWithAudit(
    stream: AsyncIterable<InferStreamChunk>,
    requestId: string,
    options: InferOptions,
    route: string,
    matchedRules: string[],
  ): AsyncIterable<InferStreamChunk> {
    const startMs = Date.now();
    let modelId: string | undefined;

    try {
      for await (const chunk of stream) {
        if (chunk.modelId) {
          modelId = chunk.modelId;
        }
        yield chunk;
      }
    } finally {
      await auditSink.emit({
        eventId: `evt_${requestId}`,
        type: "infer",
        requestId,
        scope: options.memoryScope ?? {},
        trustLevel: options.trustLevel,
        timestamp: new Date().toISOString(),
        actor: "runtime",
        modelId: modelId ?? options.model,
        route,
        policyDecisions: matchedRules,
        durationMs: Date.now() - startMs,
      });
    }
  }

  return {
    async infer(options: InferOptions): Promise<InferResult> {
      const ctx = options.context;
      const requestId = ctx?.requestId ?? nextRequestId();
      const traceId = ctx?.traceId;
      const spanId = ctx?.spanId;
      const startMs = Date.now();

      // Policy check
      const policyDecision = policyEngine.evaluate({
        operation: "canInfer",
        scope: options.memoryScope ?? {},
        modelId: options.model,
        trustLevel: options.trustLevel,
      });

      if (!policyDecision.allowed) {
        await auditSink.emit({
          eventId: `evt_${requestId}`,
          type: "infer",
          requestId,
          scope: options.memoryScope ?? {},
          trustLevel: options.trustLevel,
          timestamp: new Date().toISOString(),
          actor: "runtime",
          modelId: options.model,
          policyDecisions: policyDecision.matchedRules,
          error: policyDecision.reason ?? "Policy denied",
          durationMs: Date.now() - startMs,
        });
        throw new PolicyDeniedError(
          "infer",
          policyDecision.reason,
          policyDecision.matchedRules,
        );
      }

      // Route selection (model-aware)
      const adapter = await selectAdapter(
        options.executionPreference,
        options.model,
      );
      const route = adapter.providerId;

      // Execute inference
      const adapterResponse = await adapter.infer({
        modelId: options.model ?? "default",
        input: options.input,
        messages: options.messages,
        systemPrompt: options.systemPrompt,
        tools: options.tools,
        maxTokens: options.maxTokens,
        temperature: options.temperature,
      });

      const durationMs = Date.now() - startMs;

      // Audit
      await auditSink.emit({
        eventId: `evt_${requestId}`,
        type: "infer",
        requestId,
        scope: options.memoryScope ?? {},
        trustLevel: options.trustLevel,
        timestamp: new Date().toISOString(),
        actor: "runtime",
        modelId: adapterResponse.modelId,
        route,
        policyDecisions: policyDecision.matchedRules,
        durationMs,
      });

      return {
        requestId,
        traceId,
        spanId,
        output: adapterResponse.output,
        model: adapterResponse.modelId,
        route,
        durationMs,
        policyDecision,
        adapterResponse,
      };
    },

    async inferStream(options: InferOptions): Promise<InferStreamResult> {
      const requestId = nextRequestId();

      // Policy check (same as non-streaming)
      const policyDecision = policyEngine.evaluate({
        operation: "canInfer",
        scope: options.memoryScope ?? {},
        modelId: options.model,
        trustLevel: options.trustLevel,
      });

      if (!policyDecision.allowed) {
        await auditSink.emit({
          eventId: `evt_${requestId}`,
          type: "infer",
          requestId,
          scope: options.memoryScope ?? {},
          trustLevel: options.trustLevel,
          timestamp: new Date().toISOString(),
          actor: "runtime",
          modelId: options.model,
          policyDecisions: policyDecision.matchedRules,
          error: policyDecision.reason ?? "Policy denied",
        });
        throw new PolicyDeniedError(
          "infer",
          policyDecision.reason,
          policyDecision.matchedRules,
        );
      }

      const adapter = await selectAdapter(
        options.executionPreference,
        options.model,
      );
      const route = adapter.providerId;

      // If adapter supports streaming, use it
      if (adapter.inferStream) {
        const adapterStream = adapter.inferStream({
          modelId: options.model ?? "default",
          input: options.input,
          messages: options.messages,
          systemPrompt: options.systemPrompt,
          maxTokens: options.maxTokens,
          temperature: options.temperature,
        });

        // Wrap the stream to emit audit on completion
        const wrappedStream = wrapStreamWithAudit(
          adapterStream,
          requestId,
          options,
          route,
          policyDecision.matchedRules,
        );

        return { requestId, stream: wrappedStream, route, policyDecision };
      }

      // Fallback: use non-streaming infer and emit chunks
      const response = await adapter.infer({
        modelId: options.model ?? "default",
        input: options.input,
        messages: options.messages,
        systemPrompt: options.systemPrompt,
        tools: options.tools,
        maxTokens: options.maxTokens,
        temperature: options.temperature,
      });

      async function* fallbackStream(): AsyncIterable<InferStreamChunk> {
        yield { type: "text_delta", text: response.output };
        yield {
          type: "usage",
          tokensUsed: response.tokensUsed,
          modelId: response.modelId,
        };
        yield { type: "done" };
      }

      await auditSink.emit({
        eventId: `evt_${requestId}`,
        type: "infer",
        requestId,
        scope: options.memoryScope ?? {},
        trustLevel: options.trustLevel,
        timestamp: new Date().toISOString(),
        actor: "runtime",
        modelId: response.modelId,
        route,
        policyDecisions: policyDecision.matchedRules,
        durationMs: response.durationMs,
      });

      return { requestId, stream: fallbackStream(), route, policyDecision };
    },

    async embed(options: EmbedOptions): Promise<EmbedResult> {
      const requestId = nextRequestId();
      const startMs = Date.now();

      const policyDecision = policyEngine.evaluate({
        operation: "canInfer",
        scope: {},
        modelId: options.model,
        trustLevel: options.trustLevel,
      });

      if (!policyDecision.allowed) {
        throw new PolicyDeniedError("embed", policyDecision.reason, policyDecision.matchedRules);
      }

      const adapter = await selectAdapter("auto");

      const adapterResponse = await adapter.embed({
        modelId: options.model ?? "default",
        content: options.content,
      });

      const durationMs = Date.now() - startMs;

      await auditSink.emit({
        eventId: `evt_${requestId}`,
        type: "embed",
        requestId,
        scope: {},
        trustLevel: options.trustLevel,
        timestamp: new Date().toISOString(),
        actor: "runtime",
        modelId: adapterResponse.modelId,
        route: adapter.providerId,
        policyDecisions: policyDecision.matchedRules,
        durationMs,
      });

      return {
        requestId,
        embedding: adapterResponse.embedding,
        model: adapterResponse.modelId,
        dimensions: adapterResponse.dimensions,
        durationMs,
        adapterResponse,
      };
    },

    async plan(options: PlanOptions): Promise<Plan> {
      const requestId = nextRequestId();

      // Policy check for planning
      const policyDecision = policyEngine.evaluate({
        operation: "canPlan",
        scope: options.scope ?? {},
        trustLevel: options.trustLevel,
      });

      if (!policyDecision.allowed) {
        await auditSink.emit({
          eventId: `evt_${requestId}`,
          type: "plan",
          requestId,
          scope: options.scope ?? {},
          trustLevel: options.trustLevel,
          timestamp: new Date().toISOString(),
          actor: "runtime",
          policyDecisions: policyDecision.matchedRules,
          error: policyDecision.reason ?? "Policy denied plan",
        });
        throw new PolicyDeniedError("plan", policyDecision.reason, policyDecision.matchedRules);
      }

      // Build the plan from provided steps or create a single-step plan
      const steps = options.steps ?? [
        {
          id: `step_${requestId}_1`,
          description: options.goal,
          requiredTools: options.availableTools ?? [],
          dependencies: [],
          riskFlags: [],
          requiresApproval: false,
        },
      ];

      const plan: Plan = {
        planId: `plan_${requestId}`,
        intent: options.goal,
        steps,
        createdAt: new Date().toISOString(),
        status: "draft",
      };

      await auditSink.emit({
        eventId: `evt_${requestId}`,
        type: "plan",
        requestId,
        scope: options.scope ?? {},
        trustLevel: options.trustLevel,
        timestamp: new Date().toISOString(),
        actor: "runtime",
        policyDecisions: policyDecision.matchedRules,
      });

      return plan;
    },

    async act(options: ActOptions): Promise<ActResult> {
      const requestId = nextRequestId();

      // Policy check for action
      const policyDecision = policyEngine.evaluate({
        operation: "canAct",
        scope: options.scope ?? {},
        tool: options.tool,
        trustLevel: options.trustLevel,
      });

      if (!policyDecision.allowed) {
        await auditSink.emit({
          eventId: `evt_${requestId}`,
          type: "act",
          requestId,
          scope: options.scope ?? {},
          trustLevel: options.trustLevel,
          timestamp: new Date().toISOString(),
          actor: "runtime",
          policyDecisions: policyDecision.matchedRules,
          error: policyDecision.reason ?? "Policy denied action",
        });
        throw new PolicyDeniedError("act", policyDecision.reason, policyDecision.matchedRules, { tool: options.tool });
      }

      if (policyDecision.requiresApproval) {
        await auditSink.emit({
          eventId: `evt_${requestId}`,
          type: "act",
          requestId,
          scope: options.scope ?? {},
          trustLevel: options.trustLevel,
          timestamp: new Date().toISOString(),
          actor: "runtime",
          policyDecisions: policyDecision.matchedRules,
          error: "Action requires approval",
        });
        throw new ApprovalRequiredError(`Action on tool "${options.tool}"`, policyDecision.matchedRules);
      }

      // Find the tool adapter
      const toolAdapter = toolMap.get(options.tool);
      if (!toolAdapter) {
        throw new ToolNotFoundError(options.tool);
      }

      // Execute the tool
      const result = await toolAdapter.execute(options.input);

      const action = {
        actionId: `act_${requestId}`,
        actor: "runtime",
        requestId,
        planRef: options.planRef,
        tool: options.tool,
        input: options.input,
        policyDecision: policyDecision.matchedRules.join(",") || "allowed",
        result,
        timestamp: new Date().toISOString(),
      };

      await auditSink.emit({
        eventId: `evt_${requestId}`,
        type: "act",
        requestId,
        scope: options.scope ?? {},
        trustLevel: options.trustLevel,
        timestamp: new Date().toISOString(),
        actor: "runtime",
        policyDecisions: policyDecision.matchedRules,
      });

      return { action, policyDecision };
    },

    async listAvailableModels(): Promise<string[]> {
      const allModels: string[] = [];
      for (const adapter of adapters) {
        const models = await adapter.listModels();
        allModels.push(...models.map((m) => m.id));
      }
      return allModels;
    },

    async healthCheck(): Promise<Record<string, boolean>> {
      const result: Record<string, boolean> = {};
      for (const adapter of adapters) {
        result[adapter.providerId] = await adapter.healthCheck();
      }
      return result;
    },
  };
}
